/**
 * OCR Service — runs tesseract.js in a child_process.fork() to isolate
 * worker_threads from the VS Code extension host Electron runtime.
 */
import * as cp from 'child_process';
import * as path from 'path';
import * as vscode from 'vscode';

export interface OcrSuccess {
  success: true;
  text: string;
  confidence: number;
  elapsed: number;
}

export interface OcrError {
  success: false;
  error: string;
  detail: string;
}

export type OcrResult = OcrSuccess | OcrError;

const OCR_TIMEOUT_MS = 60000;

/**
 * Recognize text from a base64 data URL image.
 * Spawns a forked Node.js process that loads tesseract.js in a clean environment.
 */
export function recognizeImage(
  imageBase64: string,
  extensionUri: vscode.Uri,
  onProgress?: (status: string) => void,
): Promise<OcrResult> {
  return new Promise((resolve) => {
    const workerScript = path.join(extensionUri.fsPath, 'ocr-worker', 'ocr-worker.js');
    const corePath = path.join(extensionUri.fsPath, 'node_modules', 'tesseract.js-core');
    const langPath = path.join(extensionUri.fsPath, 'media', 'tesseract');

    onProgress?.('正在启动本地 OCR 引擎...');

    let settled = false;
    let child: cp.ChildProcess | null = null;

    const finish = (result: OcrResult) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (child && child.connected) {
        try { child.disconnect(); } catch (_) { /* ignore */ }
      }
      resolve(result);
    };

    const timer = setTimeout(() => {
      if (child) {
        try { child.kill('SIGTERM'); } catch (_) { /* ignore */ }
      }
      finish({
        success: false,
        error: 'OCR 引擎启动超时',
        detail: 'Timed out after ' + (OCR_TIMEOUT_MS / 1000) + 's: 可能原因: 1) tesseract.js-core WASM 文件缺失或不兼容 2) worker_threads 无法在 Extension Host 中创建 3) 训练数据文件损坏或路径错误',
      });
    }, OCR_TIMEOUT_MS);

    try {
      child = cp.fork(workerScript, [], {
        silent: true,
        execArgv: [],
      });
    } catch (e: any) {
      finish({
        success: false,
        error: '无法启动 OCR 子进程',
        detail: 'fork() 失败: ' + (e.message || String(e)),
      });
      return;
    }

    // Collect stderr for diagnostics
    let stderr = '';
    if (child.stdout) {
      child.stdout.on('data', (data: Buffer) => {
        stderr += data.toString();
      });
    }
    if (child.stderr) {
      child.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });
    }

    child.on('message', (msg: any) => {
      if (msg && msg.ready) {
        onProgress?.('正在识别图片文字...');
        child?.send({ imageBase64, corePath, langPath });
        return;
      }
      if (msg && typeof msg.success === 'boolean') {
        if (msg.success) {
          finish({
            success: true,
            text: msg.text || '',
            confidence: msg.confidence || 0,
            elapsed: msg.elapsed || 0,
          });
        } else {
          finish({
            success: false,
            error: msg.error || 'OCR 识别失败',
            detail: msg.detail || msg.error || 'Unknown error in OCR worker',
          });
        }
      }
    });

    child.on('error', (err: Error) => {
      finish({
        success: false,
        error: 'OCR 子进程通信错误',
        detail: err.message + (stderr ? '\nStderr: ' + stderr : ''),
      });
    });

    child.on('exit', (code: number | null, signal: string | null) => {
      if (!settled) {
        finish({
          success: false,
          error: 'OCR 子进程意外退出',
          detail: '退出码: ' + (code !== null ? code : 'null') + ', 信号: ' + (signal || 'null') + (stderr ? '\nStderr: ' + stderr : ''),
        });
      }
    });
  });
}
