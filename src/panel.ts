/**
 * Webview 驾驶舱面板 — v0.2 Simplified
 *
 * 顶部设置条（3 项）+ 智能分析主按钮 + 4 功能按钮 + 结果展示 + 词典
 */

import * as vscode from 'vscode';
import * as types from './types';
import { explainCode, explainCommandSafety, explainError, optimizePrompt, smartAnalyze, extractDictionaryEntries } from './explanations';
import { Dictionary } from './dictionary';
import { Settings, UserSettings } from './settings';
import { t, type UILanguage, type AppStrings } from './i18n';
import { recognizeImage } from './ocrService';

export class PanelManager {
  private panel: vscode.WebviewPanel | undefined;
  private context: vscode.ExtensionContext;
  private settings: Settings;
  private ocrBusy = false;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.settings = new Settings(context);
  }

  open(): void {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Two);
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'aiAgentChineseCabin',
      'AI Agent Command Center',
      { viewColumn: vscode.ViewColumn.Two, preserveFocus: true },
      { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [] }
    );

    this.panel.webview.html = this.buildHTML();
    this.panel.iconPath = vscode.Uri.joinPath(this.context.extensionUri, 'media', 'icon.png');

    this.panel.webview.onDidReceiveMessage(
      (msg: types.PanelMessage) => this.handleMessage(msg),
      undefined,
      this.context.subscriptions
    );

    this.panel.onDidDispose(() => { this.panel = undefined; }, null, this.context.subscriptions);
  }

  feedText(text: string, feature: types.FeatureType): void {
    this.open();
    if (this.panel) {
      this.panel.webview.postMessage({ type: 'feedText', text, feature });
    }
  }

  private handleMessage(msg: types.PanelMessage): void {
    let result: any;

    switch (msg.type) {
      case 'smartAnalyze': {
        const s = this.settings.get();
        result = smartAnalyze(msg.text || '', { outputLanguage: s.uiLanguage });
        break;
      }
      case 'explainCode': {
        const s = this.settings.get();
        result = explainCode(msg.text || '', s.uiLanguage);
        break;
      }
      case 'explainSafety': {
        const s = this.settings.get();
        result = explainCommandSafety(msg.text || '', s.uiLanguage);
        break;
      }
      case 'explainError': {
        const s = this.settings.get();
        result = explainError(msg.text || '', s.uiLanguage);
        break;
      }
      case 'optimizePrompt': {
        const s = this.settings.get();
        result = optimizePrompt(msg.text || '', s.uiLanguage);
        break;
      }
      case 'updateSettings': {
        if (msg.settings) {
          const partial: any = {};
          if (msg.settings.uiLanguage) partial.uiLanguage = msg.settings.uiLanguage;
          if (msg.settings.explanationLevel) partial.explanationLevel = msg.settings.explanationLevel;
          this.settings.update(partial).then((updated) => {
            this.panel?.webview.postMessage({ type: 'settingsUpdated', data: updated });
            if (msg.settings!.uiLanguage) {
              const strings = t(updated.uiLanguage);
              this.panel?.webview.postMessage({ type: 'i18nUpdate', lang: updated.uiLanguage, strings });
            }
          });
        }
        return;
      }
      case 'loadDictionary': {
        const dict = new Dictionary(this.context);
        this.panel?.webview.postMessage({ type: 'dictionaryData', data: dict.getAll() });
        return;
      }
      case 'ocrImage': {
        this.handleOcrImage(msg.imageBase64 || '', msg.fileName || '');
        return;
      }
      default:
        return;
    }

    if (result && (msg.type === 'explainCode' || msg.type === 'explainSafety')) {
      const entries = extractDictionaryEntries(result);
      if (entries.length > 0) {
        new Dictionary(this.context).addEntries(entries);
      }
    }

    this.panel?.webview.postMessage({ type: 'result', feature: msg.type, data: result });
  }

  private async handleOcrImage(imageBase64: string, fileName: string): Promise<void> {
    if (this.ocrBusy) {
      this.panel?.webview.postMessage({ type: 'ocrProgress', progress: -1, status: 'busy' });
      return;
    }
    this.ocrBusy = true;

    try {
      console.log('[OCR Backend] Starting OCR for:', fileName, 'base64 length:', imageBase64.length);
      this.panel?.webview.postMessage({ type: 'ocrProgress', progress: 0, status: 'initializing' });

      const result = await recognizeImage(
        imageBase64,
        this.context.extensionUri,
        (status: string) => {
          const progressMap: Record<string, number> = {
            '正在启动本地 OCR 引擎...': 5,
            '正在识别图片文字...': 20,
          };
          const progress = progressMap[status] || 10;
          this.panel?.webview.postMessage({ type: 'ocrProgress', progress, status });
        },
      );

      if (result.success) {
        console.log('[OCR Backend] Recognition complete. Text length:', result.text.length, 'Confidence:', result.confidence);
        console.log('[OCR Backend] Text preview:', result.text.substring(0, 200));
        this.panel?.webview.postMessage({ type: 'ocrResult', text: result.text });
      } else {
        console.error('[OCR Backend] OCR failed:', result.error, result.detail);
        this.panel?.webview.postMessage({
          type: 'ocrError',
          error: result.error,
          detail: result.detail,
        });
      }
    } catch (e: any) {
      const errMsg = e.message || String(e);
      console.error('[OCR Backend] Error:', errMsg);
      this.panel?.webview.postMessage({ type: 'ocrError', error: errMsg });
    } finally {
      this.ocrBusy = false;
    }
  }

  private buildHTML(): string {
    const s = t('zh');
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI Agent Command Center</title>
  <style>
    :root {
      --bg-deep: #080c14;
      --bg-glass: rgba(22,25,38,0.55);
      --bg-glass-strong: rgba(26,30,45,0.72);
      --bg-input: rgba(18,21,32,0.65);
      --border-subtle: rgba(255,255,255,0.06);
      --border-card: rgba(255,255,255,0.08);
      --border-glow: rgba(99,132,241,0.28);
      --border-focus: rgba(129,160,247,0.45);
      --text-primary: rgba(235,238,248,0.94);
      --text-secondary: rgba(180,186,210,0.72);
      --text-tertiary: rgba(148,155,180,0.50);
      --text-muted: rgba(120,127,152,0.38);
      --accent-blue: #6b9dfc;
      --accent-blue-bg: rgba(107,157,252,0.10);
      --accent-purple: #9b8dfc;
      --accent-purple-bg: rgba(155,141,252,0.10);
      --accent-amber: #e2a654;
      --accent-red: #e2686e;
      --accent-green: #5ebf8a;
      --accent-cyan: #60c8d8;
      --risk-low: #5ebf8a; --risk-low-bg: rgba(94,191,138,0.12);
      --risk-medium: #e2a654; --risk-medium-bg: rgba(226,166,84,0.12);
      --risk-high: #e2686e; --risk-high-bg: rgba(226,104,110,0.12);
      --risk-extreme: #dc3545; --risk-extreme-bg: rgba(220,53,69,0.16);
      --info-bg: rgba(107,157,252,0.06);
      --info-border: rgba(107,157,252,0.18);
      --r-xs: 5px; --r-sm: 9px; --r-md: 13px; --r-lg: 17px;
      --shadow-sm: 0 1px 3px rgba(0,0,0,0.3);
      --shadow-card: 0 2px 12px rgba(0,0,0,0.25), 0 0 0 1px rgba(255,255,255,0.04);
      --shadow-glow-blue: 0 0 18px rgba(107,157,252,0.12);
      --shadow-glow-purple: 0 0 22px rgba(155,141,252,0.10);
      --s-2xs: 3px; --s-xs: 5px; --s-sm: 8px; --s-md: 14px; --s-lg: 20px;
      --ease-out: cubic-bezier(0.16,1,0.3,1);
      --duration-fast: 140ms;
    }
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    body{
      font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;
      font-size:13px;color:var(--text-primary);background:var(--bg-deep);
      padding:10px 14px 24px;line-height:1.65;
      -webkit-font-smoothing:antialiased;position:relative;overflow-x:hidden;
    }
    body::before{
      content:'';position:fixed;top:-100px;left:50%;transform:translateX(-50%);
      width:480px;height:280px;
      background:radial-gradient(ellipse at center,rgba(107,140,252,0.07) 0%,rgba(155,141,252,0.03) 35%,transparent 70%);
      pointer-events:none;z-index:0;
    }
    .page-content{position:relative;z-index:1}

    /* Hero */
    .hero{display:flex;align-items:center;gap:10px;margin-bottom:var(--s-sm);padding:0 2px}
    .hero-badge{
      display:inline-flex;align-items:center;justify-content:center;
      width:32px;height:32px;border-radius:50%;flex-shrink:0;
      background:var(--bg-glass-strong);border:1px solid var(--border-card);
      box-shadow:var(--shadow-card),var(--shadow-glow-purple);font-size:15px;
    }
    .hero-text{display:flex;flex-direction:column;gap:1px}
    .hero-title{font-size:13px;font-weight:700;color:var(--text-primary)}
    .hero-sub{font-size:10px;color:var(--text-tertiary)}
    .hero-ver{
      margin-left:auto;font-size:9px;padding:2px 8px;border-radius:99px;
      background:var(--accent-blue-bg);color:var(--accent-blue);border:1px solid rgba(107,157,252,0.2);
      flex-shrink:0;white-space:nowrap;
    }

    /* Settings bar */
    .settings-bar{
      display:flex;flex-wrap:wrap;gap:6px;margin-bottom:var(--s-md);
      padding:6px 10px;border-radius:var(--r-md);
      background:var(--bg-glass);border:1px solid var(--border-subtle);
    }
    .setting-group{display:flex;align-items:center;gap:4px}
    .setting-label{font-size:10px;color:var(--text-tertiary);white-space:nowrap}
    .setting-select{
      font-size:10px;padding:2px 5px;border-radius:var(--r-xs);
      background:var(--bg-glass-strong);color:var(--text-primary);
      border:1px solid var(--border-card);cursor:pointer;outline:none;
      font-family:inherit;
    }
    .setting-select:focus{border-color:var(--border-focus)}

    /* Input cabin */
    .input-cabin{
      background:var(--bg-glass);border:1px solid var(--border-card);
      border-radius:var(--r-lg);padding:var(--s-sm) var(--s-md) var(--s-md);
      margin-bottom:var(--s-md);
    }
    .input-cabin:focus-within{border-color:var(--border-glow);box-shadow:var(--shadow-glow-blue)}
    .input-topbar{display:flex;align-items:center;justify-content:space-between;margin-bottom:4px}
    .input-label{font-size:11px;font-weight:600;color:var(--text-secondary)}
    .input-charcount{font-size:10px;color:var(--text-tertiary)}
    .input-hint-bar{font-size:10px;color:var(--text-muted);margin-bottom:6px}
    textarea{
      width:100%;min-height:68px;max-height:150px;resize:vertical;
      background:var(--bg-input);color:var(--text-primary);
      border:1px solid var(--border-subtle);border-radius:var(--r-sm);
      padding:var(--s-sm) 10px;font-size:12.5px;font-family:"SF Mono","Fira Code","Consolas",monospace;
      line-height:1.5;outline:none;
    }
    textarea::placeholder{color:var(--text-muted)}
    textarea:focus{border-color:var(--border-focus)}

    /* Buttons */
    .btn-row{display:flex;gap:6px;margin-bottom:var(--s-md);flex-wrap:wrap}
    .btn{
      display:inline-flex;align-items:center;gap:5px;padding:7px 14px;
      border-radius:99px;font-size:11.5px;font-weight:600;cursor:pointer;border:none;
      font-family:inherit;white-space:nowrap;transition:all var(--duration-fast) var(--ease-out);
      box-shadow:var(--shadow-sm);
    }
    .btn-primary{
      background:linear-gradient(135deg,rgba(107,157,252,0.28),rgba(155,141,252,0.22));
      color:#fff;border:1px solid rgba(155,160,247,0.3);
      font-size:12.5px;padding:8px 20px;gap:6px;
    }
    .btn-primary:hover{background:linear-gradient(135deg,rgba(107,157,252,0.38),rgba(155,141,252,0.30));box-shadow:var(--shadow-glow-blue)}
    .btn-secondary{
      background:var(--bg-glass-strong);color:var(--text-secondary);
      border:1px solid var(--border-card);
    }
    .btn-secondary:hover{background:rgba(35,40,58,0.8);color:var(--text-primary);border-color:var(--border-glow)}
    .btn.active{background:rgba(107,157,252,0.16);color:#fff;border-color:var(--border-glow);box-shadow:var(--shadow-glow-blue)}
    .btn-icon{font-size:13px}

    /* Status */
    .status-line{
      display:flex;align-items:center;gap:8px;padding:4px 10px;margin-bottom:var(--s-md);
      border-radius:var(--r-sm);background:var(--bg-glass);border:1px solid var(--border-subtle);
      font-size:11px;color:var(--text-tertiary);
    }
    .status-dot{width:5px;height:5px;border-radius:50%;background:var(--accent-blue);flex-shrink:0}

    /* Cards */
    #resultArea{margin-bottom:var(--s-lg)}
    .card{
      background:var(--bg-glass);border:1px solid var(--border-card);
      border-radius:var(--r-md);padding:var(--s-md);margin-bottom:var(--s-sm);
      box-shadow:var(--shadow-card);
    }
    .card-header{font-size:11.5px;font-weight:700;color:var(--text-primary);margin-bottom:8px;display:flex;align-items:center;gap:6px}
    .dot{width:6px;height:6px;border-radius:50%;background:var(--accent-blue);flex-shrink:0}
    .dot-amber{background:var(--accent-amber)}
    .dot-red{background:var(--accent-red)}
    .dot-green{background:var(--accent-green)}
    .dot-purple{background:var(--accent-purple)}
    .summary-card{
      background:var(--bg-glass-strong);border:1px solid var(--border-glow);
      border-radius:var(--r-md);padding:var(--s-md);margin-bottom:var(--s-sm);
      font-size:13px;line-height:1.7;
    }
    .summary-card .label{font-size:10px;font-weight:600;color:var(--accent-blue);margin-bottom:3px;text-transform:uppercase;letter-spacing:0.04em}

    /* Line card */
    .line-card{
      background:var(--bg-glass-strong);border:1px solid var(--border-card);
      border-radius:var(--r-sm);padding:var(--s-sm) 10px;margin-bottom:var(--s-2xs);
    }
    .lc-code{font-family:"SF Mono","Fira Code","Consolas",monospace;font-size:11px;color:var(--accent-cyan);margin-bottom:2px;word-break:break-all;white-space:pre-wrap;line-height:1.45}
    .lc-meta{display:grid;grid-template-columns:auto 1fr;gap:1px 10px;font-size:10.5px}
    .lbl{color:var(--text-tertiary)}

    /* Line item */
    .line-item{display:flex;flex-direction:column;gap:1px;padding:var(--s-2xs) 0;border-bottom:1px solid var(--border-subtle)}
    .line-item:last-child{border-bottom:none}
    .line-item code{font-family:"SF Mono","Fira Code","Consolas",monospace;font-size:11px;color:var(--accent-cyan);word-break:break-all}
    .line-item span{font-size:11.5px;color:var(--text-secondary)}

    .risk-row{display:flex;gap:8px;padding:3px 0;font-size:11.5px;color:var(--text-secondary);border-bottom:1px solid var(--border-subtle)}
    .risk-row:last-child{border-bottom:none}

    /* Risk badge */
    .risk-badge{display:inline-block;padding:2px 12px;border-radius:99px;font-size:11px;font-weight:700}
    .risk-low{background:var(--risk-low-bg);color:var(--risk-low);border:1px solid var(--risk-low)}
    .risk-medium{background:var(--risk-medium-bg);color:var(--risk-medium);border:1px solid var(--risk-medium)}
    .risk-high{background:var(--risk-high-bg);color:var(--risk-high);border:1px solid var(--risk-high)}
    .risk-extreme{background:var(--risk-extreme-bg);color:var(--risk-extreme);border:1px solid var(--risk-extreme)}

    /* Mismatch */
    .mismatch-card{
      display:flex;align-items:flex-start;gap:8px;padding:8px 12px;
      background:var(--info-bg);border:1px solid var(--info-border);
      border-radius:var(--r-sm);margin-bottom:var(--s-sm);font-size:11.5px;
    }
    .mismatch-msg{flex:1;color:var(--accent-blue)}
    .mismatch-action{color:var(--accent-cyan);cursor:pointer;text-decoration:underline;white-space:nowrap}

    /* Prompt glass */
    .prompt-glass-card{
      background:rgba(155,141,252,0.08);border:1px solid rgba(155,141,252,0.2);
      border-radius:var(--r-sm);padding:10px 12px;font-size:12px;
      color:var(--text-primary);white-space:pre-wrap;line-height:1.7;
      max-height:280px;overflow-y:auto;
    }
    .prompt-actions{text-align:center;margin-top:8px}
    .copy-btn{
      padding:6px 18px;border-radius:99px;font-size:11px;font-weight:600;
      cursor:pointer;border:1px solid var(--accent-purple);
      background:var(--accent-purple-bg);color:var(--accent-purple);
      font-family:inherit;transition:all var(--duration-fast) var(--ease-out);
    }
    .copy-btn:hover{background:rgba(155,141,252,0.22);box-shadow:var(--shadow-glow-purple)}
    .prompt-hint{font-size:10px;color:var(--text-muted);margin-top:4px}

    /* Word pills */
    .word-pill{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;margin:1px;border-radius:99px;font-size:10.5px;background:var(--bg-glass-strong);border:1px solid var(--border-card)}
    .word-pill .w{font-weight:600;font-family:"SF Mono","Fira Code",monospace;color:var(--accent-cyan)}
    .word-pill .m{color:var(--text-secondary)}

    /* Dictionary */
    .dict-section{
      background:var(--bg-glass);border:1px solid var(--border-card);
      border-radius:var(--r-md);padding:var(--s-sm) var(--s-md);margin-top:var(--s-lg);
    }
    .dict-toggle{
      display:flex;align-items:center;gap:6px;font-size:11px;font-weight:600;
      color:var(--text-secondary);cursor:pointer;padding:3px 0;
      user-select:none;border:none;background:none;font-family:inherit;width:100%;text-align:left;
    }
    .dict-toggle .arrow{font-size:8px;transition:transform var(--duration-fast) var(--ease-out)}
    .dict-toggle.expanded .arrow{transform:rotate(180deg)}
    .collapse-content.closed{display:none}
    .dict-pill{display:block;padding:3px 0;border-bottom:1px solid var(--border-subtle);font-size:11px}
    .dict-pill b{font-family:"SF Mono","Fira Code",monospace;color:var(--accent-cyan);margin-right:6px}
    .dict-pill:last-child{border-bottom:none}

    /* Toast */
    .copied-toast{
      position:fixed;bottom:20px;left:50%;transform:translateX(-50%);
      background:var(--bg-glass-strong);color:#fff;border:1px solid var(--border-glow);
      padding:6px 18px;border-radius:99px;font-size:11px;z-index:999;
      box-shadow:0 4px 24px rgba(0,0,0,0.35);pointer-events:none;
      animation:fadeUp 300ms var(--ease-out);
    }
    @keyframes fadeUp{from{opacity:0;transform:translateX(-50%) translateY(8px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}

    /* Detection badge */
    .detection-badge{
      display:inline-flex;align-items:center;gap:4px;padding:3px 10px;
      border-radius:99px;font-size:10.5px;font-weight:600;
      background:var(--accent-purple-bg);color:var(--accent-purple);border:1px solid rgba(155,141,252,0.2);
    }

    /* Footer */
    .footer{text-align:center;font-size:9.5px;color:var(--text-muted);padding:var(--s-lg) 0 var(--s-sm);border-top:1px solid var(--border-subtle);margin-top:var(--s-lg)}

    .hidden{display:none !important}

    /* ---- OCR ---- */
    .ocr-section{margin-bottom:var(--s-md)}
    .ocr-trigger-row{display:flex;align-items:center;gap:6px;margin-top:var(--s-sm)}
    .ocr-btn{
      display:inline-flex;align-items:center;gap:5px;padding:5px 12px;
      border-radius:99px;font-size:10.5px;font-weight:600;cursor:pointer;
      background:var(--bg-glass-strong);color:var(--text-secondary);
      border:1px solid var(--border-card);font-family:inherit;
      transition:all var(--duration-fast) var(--ease-out);
    }
    .ocr-btn:hover{background:rgba(35,40,58,0.8);color:var(--text-primary);border-color:var(--border-glow)}
    .ocr-btn:disabled{opacity:0.45;cursor:not-allowed}
    .ocr-hints{font-size:9.5px;color:var(--text-muted);margin-top:4px;display:flex;gap:12px;flex-wrap:wrap}
    .ocr-preview-card{
      display:flex;gap:var(--s-sm);padding:var(--s-sm);
      background:var(--bg-glass-strong);border:1px solid var(--border-card);
      border-radius:var(--r-sm);margin-top:var(--s-sm);align-items:flex-start;
    }
    .ocr-preview-img{
      max-width:120px;max-height:90px;object-fit:contain;border-radius:var(--r-xs);
      border:1px solid var(--border-card);flex-shrink:0;
    }
    .ocr-preview-info{flex:1;min-width:0}
    .ocr-preview-name{font-size:10.5px;font-weight:600;color:var(--text-primary);margin-bottom:2px;word-break:break-all}
    .ocr-preview-status{font-size:9.5px;color:var(--text-muted)}
    .ocr-progress-bar{
      width:100%;height:3px;background:var(--bg-glass);border-radius:99px;
      margin-top:6px;overflow:hidden;
    }
    .ocr-progress-fill{
      height:100%;background:var(--accent-purple);
      border-radius:99px;transition:width 200ms ease-out;
    }
    .ocr-clear-btn{
      font-size:9.5px;color:var(--text-tertiary);cursor:pointer;background:none;
      border:none;font-family:inherit;padding:2px 6px;flex-shrink:0;
    }
    .ocr-clear-btn:hover{color:var(--accent-red)}
    .drag-over{border-color:var(--border-glow) !important;box-shadow:var(--shadow-glow-blue) !important}
    .drag-over-text{color:var(--accent-blue) !important}
    .ocr-done-hint{
      font-size:9.5px;color:var(--accent-green);margin-top:4px;
      padding:5px 8px;background:rgba(94,191,138,0.06);
      border:1px solid rgba(94,191,138,0.15);border-radius:var(--r-xs);
    }
  </style>
</head>
<body>
<div class="page-content">

  <!-- HERO -->
  <div class="hero">
    <div class="hero-badge">&#x1F9ED;</div>
    <div class="hero-text">
      <div class="hero-title" id="heroTitle">${s.title}</div>
      <div class="hero-sub" id="heroSub">${s.subtitle}</div>
    </div>
    <div class="hero-ver" id="heroVer">${s.versionTag}</div>
  </div>

  <!-- SETTINGS BAR (2 items only) -->
  <div class="settings-bar" id="settingsBar">
    <div class="setting-group">
      <span class="setting-label" id="lblUiLang">${s.uiLanguage}</span>
      <select class="setting-select" id="selUiLang" onchange="onSettingChange()">
        <option value="zh">${s.langZH}</option>
        <option value="en">${s.langEN}</option>
      </select>
    </div>
    <div class="setting-group">
      <span class="setting-label" id="lblLevel">${s.explanationLevel}</span>
      <select class="setting-select" id="selLevel" onchange="onSettingChange()">
        <option value="beginner">${s.levelBeginner}</option>
        <option value="standard" selected>${s.levelStandard}</option>
        <option value="pro">${s.levelPro}</option>
      </select>
    </div>
  </div>

  <!-- INPUT CABIN -->
  <div class="input-cabin">
    <div class="input-topbar">
      <span class="input-label" id="inputLabel">${s.inputLabel}</span>
      <span class="input-charcount" id="charCount">0 ${s.charCount}</span>
    </div>
    <div class="input-hint-bar" id="inputHint">${s.inputHint}</div>
    <textarea id="userInput" placeholder="${s.inputPlaceholder}" oninput="updateCharCount()"></textarea>
    <div class="ocr-trigger-row">
      <button class="ocr-btn" id="ocrUploadBtn" onclick="triggerOcrUpload()">📷 <span id="ocrUploadLabel">${s.uploadScreenshot}</span></button>
      <button class="ocr-btn" id="ocrClearBtn" onclick="clearOcr()" style="display:none"><span id="ocrClearLabel">${s.clearScreenshot}</span></button>
      <input type="file" id="ocrFileInput" accept="image/png,image/jpeg,image/jpg,image/webp" onchange="handleOcrFile(this)" style="display:none">
    </div>
    <div class="ocr-hints">
      <span id="ocrDropHint">${s.dropImageHint}</span><span>·</span><span id="ocrPrivacyNote">${s.privacyNote}</span><span>·</span><span id="ocrQualityHint">${s.qualityHint}</span>
    </div>
    <div class="ocr-preview-card hidden" id="ocrPreviewCard">
      <img class="ocr-preview-img" id="ocrPreviewImg" src="" alt="Screenshot preview">
      <div class="ocr-preview-info">
        <div class="ocr-preview-name" id="ocrPreviewName"></div>
        <div class="ocr-preview-status" id="ocrPreviewStatus"></div>
        <div class="ocr-progress-bar" id="ocrProgressBar"><div class="ocr-progress-fill" id="ocrProgressFill" style="width:0%"></div></div>
        <div class="ocr-done-hint hidden" id="ocrDoneHint">${s.ocrDone}</div>
      </div>
    </div>
  </div>

  <!-- BUTTONS: Smart Analyze (primary) + 4 secondary -->
  <div class="btn-row">
    <button class="btn btn-primary" id="btnSmart" onclick="send('smartAnalyze', this)">
      <span class="btn-icon">&#x1F50D;</span> <span id="btnSmartLabel">${s.smartAnalyze}</span>
    </button>
  </div>
  <div class="btn-row">
    <button class="btn btn-secondary" id="btnOptimize" onclick="send('optimizePrompt', this)">
      <span class="btn-icon">&#x2728;</span> <span id="btnOptimizeLabel">${s.optimizePrompt}</span>
    </button>
    <button class="btn btn-secondary" id="btnExplain" onclick="send('explainCode', this)">
      <span class="btn-icon">&#x1F4D6;</span> <span id="btnExplainLabel">${s.explainCode}</span>
    </button>
    <button class="btn btn-secondary" id="btnSafety" onclick="send('explainSafety', this)">
      <span class="btn-icon">&#x1F6E1;</span> <span id="btnSafetyLabel">${s.commandSafety}</span>
    </button>
    <button class="btn btn-secondary" id="btnError" onclick="send('explainError', this)">
      <span class="btn-icon">&#x1F41E;</span> <span id="btnErrorLabel">${s.explainError}</span>
    </button>
  </div>

  <!-- STATUS -->
  <div class="status-line hidden" id="statusLine">
    <span class="status-dot"></span>
    <span id="statusText">${s.loading}</span>
  </div>

  <!-- RESULT AREA -->
  <div id="resultArea"></div>

  <!-- DICTIONARY (always collapsed by default) -->
  <div class="dict-section" id="dictSection">
    <button class="dict-toggle" id="dictToggle" onclick="toggleDict()">
      <span class="arrow">&#x25B2;</span> <span id="dictLabel">${s.currentDict}</span>
      <span style="font-size:10px;color:var(--text-muted)" id="dictCountHint"></span>
    </button>
    <div class="collapse-content closed" id="dictCollapse">
      <div id="currentDictList" style="padding:4px 0">
        <div style="color:var(--text-tertiary);font-size:10.5px;text-align:center;padding:6px 0">${s.noEntries}</div>
      </div>
      <div style="margin-top:8px;border-top:1px solid var(--border-card);padding-top:6px">
        <span style="font-size:10.5px;font-weight:600;color:var(--text-secondary)" id="accumDictLabel">${s.accumulatedDict}</span>
        <div id="dictList" style="padding:3px 0">
          <div style="color:var(--text-tertiary);font-size:10.5px;text-align:center;padding:6px 0">${s.dictEmpty}</div>
        </div>
      </div>
    </div>
  </div>

  <div class="footer" id="footer">${s.footer}</div>

</div>
<script>
  var vscode = acquireVsCodeApi();
  var currentResult = null;
  var activeBtn = null;
  var allDictEntries = [];
  var dictExpanded = false;
  var dictShowingAll = false;

  // i18n
  var S = ${JSON.stringify(s)};
  function _(key) { return S[key] || key; }
  function escapeHtml(str) { return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  function updateStrings(strings) {
    S = strings;
    setText('heroTitle', S.title);
    setText('heroSub', S.subtitle);
    setText('heroVer', S.versionTag);
    setText('inputLabel', S.inputLabel);
    setText('inputHint', S.inputHint);
    setText('btnSmartLabel', S.smartAnalyze);
    setText('btnOptimizeLabel', S.optimizePrompt);
    setText('btnExplainLabel', S.explainCode);
    setText('btnSafetyLabel', S.commandSafety);
    setText('btnErrorLabel', S.explainError);
    setText('lblUiLang', S.uiLanguage);
    setText('lblLevel', S.explanationLevel);
    setText('dictLabel', S.currentDict);
    setText('accumDictLabel', S.accumulatedDict);
    setText('footer', S.footer);
    setAttr('userInput', 'placeholder', S.inputPlaceholder);
    setText('statusText', S.loading);
    setText('ocrUploadLabel', S.uploadScreenshot);
    setText('ocrClearLabel', S.clearScreenshot);
    setText('ocrDropHint', S.dropImageHint);
    setText('ocrPrivacyNote', S.privacyNote);
    setText('ocrQualityHint', S.qualityHint);
    setText('ocrDoneHint', S.ocrDone);
  }

  function setText(id, text) { var el = document.getElementById(id); if (el) el.textContent = text; }
  function setAttr(id, attr, val) { var el = document.getElementById(id); if (el) el.setAttribute(attr, val); }

  function updateCharCount() {
    var c = document.getElementById('userInput').value.length;
    document.getElementById('charCount').textContent = c + ' ' + _('charCount');
  }

  function onSettingChange() {
    vscode.postMessage({ type: 'updateSettings', settings: {
      uiLanguage: document.getElementById('selUiLang').value,
      explanationLevel: document.getElementById('selLevel').value
    }});
  }

  function send(type, btn) {
    var input = document.getElementById('userInput');
    var text = input.value.trim();
    if (!text) { toast(_('toastEmpty')); return; }
    setActive(btn);
    var sl = document.getElementById('statusLine');
    sl.classList.remove('hidden');
    document.getElementById('statusText').textContent = _('loading');
    document.getElementById('resultArea').innerHTML = '';
    vscode.postMessage({ type: type, text: text });
  }

  function setActive(btn) {
    if (activeBtn) activeBtn.classList.remove('active');
    if (btn) { btn.classList.add('active'); activeBtn = btn; }
  }

  window.addEventListener('message', function(e) {
    var msg = e.data;
    if (msg.type === 'result') {
      document.getElementById('statusLine').classList.add('hidden');
      if (msg.feature === 'smartAnalyze') renderSmartResult(msg.data);
      else renderResult(msg.feature, msg.data);
    }
    if (msg.type === 'dictionaryData') renderAccumulatedDict(msg.data);
    if (msg.type === 'i18nUpdate') updateStrings(msg.strings);
    if (msg.type === 'ocrProgress') {
      if (msg.progress >= 0) {
        document.getElementById('ocrProgressFill').style.width = Math.max(2, msg.progress) + '%';
        document.getElementById('ocrPreviewStatus').textContent = _('ocrProgress') + ': ' + msg.progress + '%';
      }
    }
    if (msg.type === 'ocrResult') {
      var txt = (msg.text || '').trim();
      console.log('[OCR] Backend result. Text length:', txt.length);
      document.getElementById('userInput').value = txt;
      updateCharCount();
      document.getElementById('ocrProgressFill').style.width = '100%';
      document.getElementById('ocrPreviewStatus').textContent = _('ocrDone');
      document.getElementById('ocrDoneHint').classList.remove('hidden');
      ocrWorking = false;
      setTimeout(function() { document.getElementById('ocrProgressBar').classList.add('hidden'); }, 900);
    }
    if (msg.type === 'ocrError') {
      var errSummary = msg.error || _('ocrFailed');
      var errDetail = msg.detail || errSummary;
      console.error('[OCR] Backend error:', errSummary, errDetail);
      document.getElementById('ocrPreviewStatus').innerHTML = _('ocrFailed') + ':<br><small>' + escapeHtml(errDetail) + '</small>';
      document.getElementById('ocrProgressBar').classList.add('hidden');
      document.getElementById('ocrDoneHint').classList.add('hidden');
      ocrWorking = false;
      toast(_('ocrFailed') + ' — ' + errSummary);
    }
    if (msg.type === 'feedText') {
      document.getElementById('userInput').value = msg.text || '';
      updateCharCount();
      if (msg.feature) {
        var bid = {smartAnalyze:'btnSmart',optimizePrompt:'btnOptimize',explainCode:'btnExplain',explainSafety:'btnSafety',explainError:'btnError'}[msg.feature];
        if (bid) send(msg.feature, document.getElementById(bid));
      }
    }
  });

  // ===================== SMART RESULT =====================
  function renderSmartResult(data) {
    currentResult = data;
    var h = '';
    h += '<div class="summary-card">';
    h += '<div class="label">' + _('detectionResult') + '</div>';
    h += '<span class="detection-badge">' + esc(data.detectionLabel) + '</span>';
    h += ' <span style="font-size:11px;color:var(--text-secondary)">' + _('recommendedAction') + ': ' + esc(data.recommendedLabel || '') + '</span>';
    h += '</div>';

    if (data.codeResult) h += renderCodeResult(data.codeResult);
    if (data.safetyResult) h += renderSafetyResult(data.safetyResult);
    if (data.errorResult) h += renderErrorResult(data.errorResult);
    if (data.promptResult) h += renderPromptResult(data.promptResult);

    if (data.suggestions && data.suggestions.length > 0) {
      h += '<div class="card"><div class="card-header"><span class="dot dot-green"></span>' + _('nextSuggestions') + '</div>';
      for (var i = 0; i < data.suggestions.length; i++) {
        h += '<div class="risk-row">&rarr; ' + esc(data.suggestions[i]) + '</div>';
      }
      h += '</div>';
    }

    if (data.codeResult && data.codeResult.wordByWord && data.codeResult.wordByWord.length > 0) renderCurrentDict(data.codeResult.wordByWord);
    if (data.safetyResult && data.safetyResult.wordByWord && data.safetyResult.wordByWord.length > 0) renderCurrentDict(data.safetyResult.wordByWord);
    document.getElementById('resultArea').innerHTML = h;
  }

  // ===================== LEGACY RESULT =====================
  function renderResult(feature, data) {
    currentResult = data;
    var h = '';

    // Mismatch hint (i18n-aware)
    if (data.mismatchHint && data.mismatchHint.show) {
      var mismatchMsg = '';
      if (feature === 'explainCode') mismatchMsg = S.mismatchCodeMsg;
      else if (feature === 'explainSafety') mismatchMsg = S.mismatchCommandMsg;
      else if (feature === 'explainError') mismatchMsg = S.mismatchErrorMsg;
      if (mismatchMsg) {
        var mismatchTitle = feature === 'explainCode' ? S.mismatchCodeTitle : (feature === 'explainSafety' ? S.mismatchCommandTitle : S.mismatchErrorTitle);
        h += '<div class="mismatch-card"><div class="mismatch-msg">' + esc(mismatchTitle || 'Heads up') + ': ' + esc(mismatchMsg) + '</div>';
        if (data.mismatchHint.suggestedAction === 'optimizePrompt') {
          h += '<span class="mismatch-action" onclick="switchToPrompt()">' + _('switchToPrompt') + '</span>';
        }
        h += '</div>';
      }
    }

    if (feature === 'explainCode') h += renderCodeResult(data);
    else if (feature === 'explainSafety') h += renderSafetyResult(data);
    else if (feature === 'explainError') h += renderErrorResult(data);
    else if (feature === 'optimizePrompt') h += renderPromptResult(data);

    // Only show dict for code/safety/error, not for prompt
    if (feature !== 'optimizePrompt' && data.wordByWord && data.wordByWord.length > 0) {
      renderCurrentDict(data.wordByWord);
    }

    document.getElementById('resultArea').innerHTML = h;
  }

  function switchToPrompt() {
    send('optimizePrompt', document.getElementById('btnOptimize'));
  }

  // ===================== CODE RESULT =====================
  function renderCodeResult(data) {
    // Terminal log uses sectioned format
    if (data.lineByLine && data.lineByLine.length > 0 && data.lineByLine[0].meaning === '__section_01__') {
      return renderSectionedResult(data);
    }
    var h = '';

    // 1. Overall summary (always show first)
    h += '<div class="summary-card"><div class="label">' + _('overallMeaning') + '</div><div style="font-size:13px;line-height:1.7">' + esc(data.summary) + '</div></div>';

    // 2. Sections (paragraph-based explanations) — main output
    if (data.sections && data.sections.length > 0) {
      h += '<div class="card"><div class="card-header"><span class="dot"></span>' + _('lineByLine') + '</div>';
      for (var s = 0; s < data.sections.length; s++) {
        var sec = data.sections[s];
        h += '<div class="line-card" style="margin-bottom:14px;padding:12px">';
        // Section label and original code
        if (sec.label) h += '<div style="font-weight:600;font-size:12px;color:var(--accent-blue);margin-bottom:6px">【' + esc(sec.label) + '】</div>';
        if (sec.original) h += '<div class="lc-code" style="margin-bottom:6px">' + esc(sec.original) + '</div>';
        // Meaning
        if (sec.meaning) h += '<div style="font-size:12px;line-height:1.65;margin-bottom:8px"><span class="lbl">' + _('explanation') + '</span>' + esc(sec.meaning) + '</div>';
        // Metadata row
        h += '<div class="lc-meta" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">';
        if (sec.type) h += '<span class="lbl">' + _('type') + '</span><span style="font-size:11px">' + esc(sec.type) + '</span>';
        if (sec.displayOnPage) h += '<span class="lbl">' + _('visible') + '</span><span style="font-size:11px">' + esc(sec.displayOnPage) + '</span>';
        if (sec.role) h += '<span class="lbl">' + _('audience') + '</span><span style="font-size:11px">' + esc(sec.role) + '</span>';
        h += '</div>';
        // Layman explanation
        if (sec.layman) h += '<div style="font-size:11.5px;color:var(--text-secondary);margin-top:6px;line-height:1.6"><span class="lbl">' + _('laymanExplanation') + '</span>' + esc(sec.layman) + '</div>';
        // Caution
        if (sec.caution) h += '<div style="font-size:11.5px;color:var(--accent-amber);margin-top:4px;line-height:1.6"><span class="lbl">⚠️ ' + _('notes') + '</span>' + esc(sec.caution) + '</div>';
        h += '</div>';
      }
      h += '</div>';
    }
    // Fallback: no sections, show lineByLine
    else if (data.lineByLine && data.lineByLine.length > 0) {
      h += '<div class="card"><div class="card-header"><span class="dot"></span>' + _('lineByLine') + '</div>';
      for (var i = 0; i < data.lineByLine.length; i++) {
        h += renderLineCard(data.lineByLine[i].line, data.lineByLine[i].meaning);
      }
      h += '</div>';
    }

    // 3. Final summary (below sections)
    if (data.finalSummary) {
      h += '<div class="card" style="border-left:2px solid var(--accent-blue)"><div class="card-header"><span class="dot" style="background:var(--accent-blue)"></span>' + _('learningPoints') + '</div>';
      h += '<div style="font-size:12.5px;line-height:1.75;white-space:pre-wrap">' + esc(data.finalSummary) + '</div></div>';
    }

    // 4. Extra learning notes
    if (data.extra) {
      h += '<div class="card"><div class="card-header"><span class="dot dot-amber"></span>' + _('learningPoints') + '</div>';
      h += '<div style="font-size:11.5px;line-height:1.7;white-space:pre-wrap">' + esc(data.extra) + '</div></div>';
    }

    // 5. Dictionary — COLLAPSED by default
    if (data.wordByWord && data.wordByWord.length > 0) {
      h += '<div class="card" id="dictCard" style="background:rgba(12,18,44,0.25);border:1px solid rgba(255,255,255,0.03)">';
      h += '<div class="card-header" onclick="toggleDict()" style="cursor:pointer;user-select:none"><span class="dot dot-green"></span>' + _('keyTerms') + ' (' + data.wordByWord.length + ') <span id="dictToggle" style="font-size:11px;color:var(--text-tertiary)">▶ ' + _('expandDict') + '</span></div>';
      h += '<div id="dictContent" style="display:none;font-size:10.5px;padding-top:8px">';
      for (var j = 0; j < data.wordByWord.length; j++) {
        h += '<span class="word-pill"><span class="w">' + esc(data.wordByWord[j].word) + '</span> <span class="m">' + esc(data.wordByWord[j].meaning) + '</span></span> ';
      }
      h += '</div></div>';
    }
    return h;
  }

  function toggleDict() {
    var content = document.getElementById('dictContent');
    var toggle = document.getElementById('dictToggle');
    if (content.style.display === 'none') {
      content.style.display = 'block';
      toggle.innerHTML = '▼ ' + _('collapseDict');
    } else {
      content.style.display = 'none';
      toggle.innerHTML = '▶ ' + _('expandDict');
    }
  }

  function renderLineCard(code, meaning) {
    if (!code && !meaning) return '';
    var h = '<div class="line-card">';
    if (code) h += '<div class="lc-code">' + esc(code) + '</div>';
    h += '<div class="lc-meta">';
    if (meaning && meaning.indexOf('TypeScript') !== -1) {
      h += '<span class="lbl">' + _('type') + '</span><span>' + esc(extractType(meaning)) + '</span>';
    } else if (meaning && meaning.indexOf('HTML') !== -1) {
      h += '<span class="lbl">' + _('type') + '</span><span>' + esc(extractType(meaning)) + '</span>';
    } else if (meaning && meaning.indexOf('CSS') !== -1) {
      h += '<span class="lbl">' + _('type') + '</span><span>' + esc(extractType(meaning)) + '</span>';
    } else if (meaning) {
      h += '<span class="lbl">' + _('explanation') + '</span><span>' + esc(meaning) + '</span>';
    }
    if (meaning && meaning.indexOf('不显示') !== -1) {
      h += '<span class="lbl">' + _('visible') + '</span><span>' + _('no') + '</span>';
    } else if (meaning && meaning.indexOf('显示在页面上') !== -1) {
      h += '<span class="lbl">' + _('visible') + '</span><span>' + _('yes') + '</span>';
    }
    if (meaning && meaning.indexOf('开发者') !== -1) {
      h += '<span class="lbl">' + _('audience') + '</span><span>' + _('developer') + '</span>';
    } else if (meaning && (meaning.indexOf('浏览器') !== -1 || meaning.indexOf('搜索引擎') !== -1)) {
      h += '<span class="lbl">' + _('audience') + '</span><span>' + _('browser') + '</span>';
    }
    h += '</div></div>';
    return h;
  }

  function extractType(meaning) {
    if (!meaning) return '';
    if (meaning.indexOf('TypeScript 注释') !== -1 || meaning.indexOf('文档注释') !== -1 || meaning.indexOf('JSDoc') !== -1) return 'TypeScript ' + _('comment');
    if (meaning.indexOf('TypeScript 方法定义') !== -1 || meaning.indexOf('TypeScript 类里的') !== -1) return 'TypeScript ' + _('method');
    if (meaning.indexOf('TypeScript 箭头函数') !== -1) return 'TypeScript ' + _('arrowFunc');
    if (meaning.indexOf('TypeScript 类型') !== -1) return 'TypeScript ' + _('typeDef');
    if (meaning.indexOf('TypeScript') !== -1) return 'TypeScript';
    if (meaning.indexOf('HTML5 文档声明') !== -1) return 'HTML ' + _('doctype');
    if (meaning.indexOf('HTML 根标签') !== -1 || meaning.indexOf('HTML 页面根标签') !== -1) return 'HTML ' + _('root');
    if (meaning.indexOf('HTML 的') !== -1 && meaning.indexOf('head') !== -1) return 'HTML ' + _('head');
    if (meaning.indexOf('HTML 的') !== -1 && meaning.indexOf('meta') !== -1) return 'HTML ' + _('meta');
    if (meaning.indexOf('CSS :root') !== -1) return 'CSS ' + _('rootSelector');
    if (meaning.indexOf('CSS 变量') !== -1 || meaning.indexOf('CSS 自定义属性') !== -1) return 'CSS ' + _('variables');
    if (meaning.indexOf('CSS') !== -1) return 'CSS';
    if (meaning.indexOf('HTML') !== -1) return 'HTML ' + _('element');
    if (meaning.indexOf('JavaScript') !== -1) return 'JavaScript';
    return _('code');
  }

  // ===================== SECTIONED (TERMINAL) =====================
  function renderSectionedResult(data) {
    var h = '';
    h += '<div class="summary-card"><div class="label">' + _('analysisResult') + '</div><div style="font-size:12.5px;line-height:1.65">' + esc(data.summary) + '</div></div>';
    var sections = [], cur = null;
    var names = {
      '__section_01__': '① ' + _('whatItDoes'),
      '__section_02__': '② ' + _('cmdBreakdown'),
      '__section_03__': '③ ' + _('outputMeaning'),
      '__section_04__': '④ ' + _('errorReason'),
      '__section_05__': '⑤ ' + _('howToFix')
    };
    for (var i = 0; i < data.lineByLine.length; i++) {
      var l = data.lineByLine[i];
      if (l.meaning && l.meaning.indexOf('__section_') === 0) {
        cur = { title: names[l.meaning] || l.meaning, items: [] };
        sections.push(cur);
        continue;
      }
      if (cur) cur.items.push(l);
    }
    for (var s = 0; s < sections.length; s++) {
      var sec = sections[s];
      if (!sec.items.length) continue;
      h += '<div class="card"><div class="card-header"><span class="dot"></span>' + esc(sec.title) + '</div>';
      for (var j = 0; j < sec.items.length; j++) {
        var it = sec.items[j];
        if (!it.line && !it.meaning) continue;
        if (it.line && it.meaning) {
          h += '<div class="line-item"><code>' + esc(it.line) + '</code><span>' + esc(it.meaning) + '</span></div>';
        } else if (it.line && !it.meaning) {
          h += '<p style="font-size:12px;line-height:1.7;margin:3px 0">' + esc(it.line) + '</p>';
        } else if (!it.line && it.meaning) {
          h += '<p style="font-size:12px;line-height:1.7;margin:3px 0">' + esc(it.meaning) + '</p>';
        }
      }
      h += '</div>';
    }
    if (data.extra) {
      h += '<div class="card"><div class="card-header"><span class="dot"></span>⑥ ' + _('riskLevel') + '</div>';
      var lines = data.extra.split('\\n');
      for (var e = 0; e < lines.length; e++) {
        var ln = lines[e].trim();
        if (!ln) continue;
        h += '<div class="risk-row">' + esc(ln) + '</div>';
      }
      h += '</div>';
    }
    return h;
  }

  // ===================== SAFETY RESULT =====================
  function renderSafetyResult(data) {
    var h = '';
    h += '<div class="summary-card"><div class="label">' + _('overallJudgment') + '</div><div style="font-size:12.5px;line-height:1.65">' + esc(data.summary) + '</div></div>';
    h += '<div class="card"><div class="card-header"><span class="dot dot-amber"></span>' + _('safetyDetail') + '</div>';
    var rows = [
      [_('deleteFiles'), data.willDeleteFiles],
      [_('modifyConfig'), data.willModifyConfig],
      [_('networkAccess'), data.willAccessNetwork],
      [_('systemAffect'), data.willAffectSystem]
    ];
    for (var r = 0; r < rows.length; r++) {
      h += '<div class="risk-row"><span style="font-weight:600;width:64px;flex-shrink:0">' + rows[r][0] + '</span><span>' + esc(rows[r][1]) + '</span></div>';
    }
    if (data.dangerPoints && data.dangerPoints.length > 0) {
      h += '<div style="margin-top:8px;font-weight:700;font-size:10.5px;color:var(--accent-red)">' + _('dangerPoints') + '</div>';
      for (var d = 0; d < data.dangerPoints.length; d++) {
        h += '<div class="risk-row" style="color:#f87171">' + esc(data.dangerPoints[d]) + '</div>';
      }
    }
    h += '<div style="margin-top:8px"><strong>' + _('executionAdvice') + '</strong><br>' + esc(data.suggestion) + '</div></div>';
    return h;
  }

  // ===================== ERROR RESULT =====================
  function renderErrorResult(data) {
    var h = '';
    h += '<div class="card"><div class="card-header"><span class="dot dot-red"></span>' + _('originalError') + '</div><code style="font-size:11.5px;color:var(--text-primary);word-break:break-all">' + esc(data.original) + '</code></div>';
    h += '<div class="summary-card"><div class="label">' + _('plainExplanation') + '</div><div>' + esc(data.plainChinese) + '</div></div>';
    if (data.possibleReasons && data.possibleReasons.length > 0) {
      h += '<div class="card"><div class="card-header"><span class="dot dot-amber"></span>' + _('possibleReasons') + '</div>';
      for (var i = 0; i < data.possibleReasons.length; i++) h += '<div class="risk-row">' + esc(data.possibleReasons[i]) + '</div>';
      h += '</div>';
    }
    if (data.nextSteps && data.nextSteps.length > 0) {
      h += '<div class="card"><div class="card-header"><span class="dot dot-green"></span>' + _('nextSteps') + '</div>';
      for (var j = 0; j < data.nextSteps.length; j++) h += '<div class="risk-row">&rarr; ' + esc(data.nextSteps[j]) + '</div>';
      h += '</div>';
    }
    h += '<div class="card"><div class="card-header"><span class="dot"></span>' + _('severity') + '</div><span style="font-weight:600">' + esc(data.severity) + '</span></div>';
    return h;
  }

  // ===================== PROMPT RESULT =====================
  function renderPromptResult(data) {
    var h = '';
    h += '<div class="card"><div class="card-header"><span class="dot dot-purple"></span>' + _('originalRequest') + '</div><em style="color:var(--text-secondary);font-size:12px">' + esc(data.original) + '</em></div>';
    h += '<div class="card"><div class="card-header"><span class="dot dot-purple"></span>' + _('optimizedPrompt') + '</div>';
    h += '<div class="prompt-glass-card">' + esc(data.optimized) + '</div>';
    h += '<div class="prompt-actions">';
    h += '<button class="copy-btn" onclick="copyOptimized()">' + _('copyPrompt') + '</button>';
    h += '<div class="prompt-hint">' + _('copyHint') + '</div>';
    h += '</div></div>';
    window._optimizedText = data.optimized;
    return h;
  }

  // ===================== DICTIONARY =====================
  function renderCurrentDict(words) {
    var list = document.getElementById('currentDictList');
    if (!words || words.length === 0) {
      list.innerHTML = '<div style="color:var(--text-tertiary);font-size:10.5px;text-align:center;padding:6px 0">' + _('noEntries') + '</div>';
      document.getElementById('dictCountHint').textContent = '';
      return;
    }
    var h = '';
    for (var i = 0; i < words.length; i++) {
      h += '<span class="word-pill"><span class="w">' + esc(words[i].word) + '</span> <span class="m">' + esc(words[i].meaning) + '</span></span> ';
    }
    list.innerHTML = h;
    document.getElementById('dictCountHint').textContent = '(' + words.length + ')';
  }

  function toggleDict() {
    var collapse = document.getElementById('dictCollapse');
    var toggleEl = document.getElementById('dictToggle');
    dictExpanded = !dictExpanded;
    if (dictExpanded) {
      collapse.classList.remove('closed');
      toggleEl.innerHTML = '<span class="arrow">&#x25B2;</span> ' + _('collapse');
      toggleEl.classList.add('expanded');
      if (allDictEntries.length === 0) vscode.postMessage({ type: 'loadDictionary' });
    } else {
      collapse.classList.add('closed');
      toggleEl.innerHTML = '<span class="arrow">&#x25B2;</span> ' + _('expand');
      toggleEl.classList.remove('expanded');
    }
  }

  function renderAccumulatedDict(entries) {
    allDictEntries = entries || [];
    var list = document.getElementById('dictList');
    if (!allDictEntries || allDictEntries.length === 0) {
      list.innerHTML = '<div style="color:var(--text-tertiary);font-size:10.5px;text-align:center;padding:8px 0">' + _('dictEmpty') + '</div>';
      return;
    }
    var maxShow = 20;
    var display = dictShowingAll ? allDictEntries : allDictEntries.slice(0, maxShow);
    var h = '';
    for (var i = 0; i < display.length; i++) {
      h += '<span class="dict-pill"><b>' + esc(display[i].word) + '</b> ' + esc(display[i].meaning) + '</span>';
    }
    h += '<div style="font-size:9.5px;color:var(--text-muted);margin-top:4px">' + allDictEntries.length + ' ' + _('dictCount');
    if (allDictEntries.length > maxShow && !dictShowingAll) {
      h += ' &middot; <span style="color:var(--accent-cyan);cursor:pointer" onclick="showAllDict()">' + _('showAll') + ' (' + allDictEntries.length + ')</span>';
    } else if (dictShowingAll) {
      h += ' &middot; <span style="color:var(--accent-cyan);cursor:pointer" onclick="collapseDict()">' + _('collapseAll') + '</span>';
    }
    h += '</div>';
    list.innerHTML = h;
  }

  function showAllDict() { dictShowingAll = true; renderAccumulatedDict(allDictEntries); }
  function collapseDict() { dictShowingAll = false; renderAccumulatedDict(allDictEntries); }

  function copyOptimized() {
    var t = window._optimizedText || '';
    if (t) navigator.clipboard.writeText(t).then(function() { toast(_('toastPromptCopied')); });
  }

  function toast(msg) {
    var ex = document.getElementById('toast'); if (ex) ex.remove();
    var el = document.createElement('div');
    el.id = 'toast'; el.className = 'copied-toast'; el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(function() { el.remove(); }, 2000);
  }

  function esc(s) {
    if (typeof s !== 'string') return s;
    var d = document.createElement('div'); d.textContent = s; return d.innerHTML;
  }

  // ============= OCR ENGINE (backend-driven) =============
  var ocrWorking = false;

  function triggerOcrUpload() {
    if (ocrWorking) { toast(_('ocrProcessing')); return; }
    console.log('[OCR] Trigger file upload');
    document.getElementById('ocrFileInput').click();
  }

  function handleOcrFile(input) {
    var f = input.files[0];
    if (!f) { console.log('[OCR] No file selected'); return; }
    console.log('[OCR] File selected:', f.name, '(' + (f.size / 1024).toFixed(1) + ' KB,', f.type + ')');
    processOcrImage(f);
    input.value = '';
  }

  function processOcrImage(file) {
    if (ocrWorking) { toast(_('ocrProcessing')); return; }
    ocrWorking = true;
    console.log('[OCR] Sending image to backend:', file.name, '(' + (file.size / 1024).toFixed(1) + ' KB)');

    var reader = new FileReader();
    reader.onload = function(e) {
      console.log('[OCR] Image loaded, data URL length:', e.target.result.length);
      document.getElementById('ocrPreviewImg').src = e.target.result;
      document.getElementById('ocrPreviewName').textContent = file.name;
      document.getElementById('ocrPreviewStatus').textContent = _('extractingText');
      document.getElementById('ocrProgressFill').style.width = '2%';
      document.getElementById('ocrPreviewCard').classList.remove('hidden');
      document.getElementById('ocrDoneHint').classList.add('hidden');
      document.getElementById('ocrClearBtn').style.display = '';
      document.getElementById('ocrProgressBar').classList.remove('hidden');

      vscode.postMessage({ type: 'ocrImage', imageBase64: e.target.result, fileName: file.name });
    };
    reader.readAsDataURL(file);
  }

  function clearOcr() {
    console.log('[OCR] Clearing OCR state');
    ocrWorking = false;
    document.getElementById('ocrPreviewCard').classList.add('hidden');
    document.getElementById('ocrPreviewImg').src = '';
    document.getElementById('ocrClearBtn').style.display = 'none';
    document.getElementById('ocrProgressFill').style.width = '0%';
    document.getElementById('ocrProgressBar').classList.remove('hidden');
    document.getElementById('ocrDoneHint').classList.add('hidden');
  }

  // Drag & drop
  (function() {
    var cabin = document.querySelector('.input-cabin');
    if (!cabin) return;
    cabin.addEventListener('dragover', function(e) {
      e.preventDefault(); e.stopPropagation();
      if (!ocrWorking) cabin.classList.add('drag-over');
    });
    cabin.addEventListener('dragleave', function(e) {
      e.preventDefault(); e.stopPropagation();
      cabin.classList.remove('drag-over');
    });
    cabin.addEventListener('drop', function(e) {
      e.preventDefault(); e.stopPropagation();
      cabin.classList.remove('drag-over');
      if (ocrWorking) return;
      var files = e.dataTransfer.files;
      if (files && files.length > 0 && files[0].type.startsWith('image/')) {
        console.log('[OCR] Image dropped:', files[0].name);
        processOcrImage(files[0]);
      }
    });
  })();

  // Ctrl+V paste image
  document.addEventListener('paste', function(e) {
    var items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    for (var i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        e.preventDefault();
        console.log('[OCR] Image pasted from clipboard');
        processOcrImage(items[i].getAsFile());
        return;
      }
    }
  });
</script>
</body>
</html>`;
  }
}
