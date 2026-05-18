/**
 * Standalone OCR worker process for VS Code extension.
 * Executed via child_process.fork() to isolate tesseract.js worker_threads
 * from the VS Code extension host Electron runtime.
 *
 * Protocol (via IPC messages):
 *   Parent → Child: { imageBase64: string, corePath: string, langPath: string }
 *   Child → Parent: { success: true, text: string, confidence: number }
 *                |  { success: false, error: string, detail: string }
 */
const Tesseract = require('tesseract.js');

let worker = null;

async function doRecognize(imageBase64, corePath, langPath) {
  const startTime = Date.now();

  // Step 1: Create worker
  worker = await Tesseract.createWorker('eng', 1, { corePath, langPath });

  // Step 2: Recognize
  const result = await worker.recognize(imageBase64);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  return {
    text: (result.data.text || '').trim(),
    confidence: result.data.confidence,
    elapsed: parseFloat(elapsed),
  };
}

process.on('message', async (msg) => {
  try {
    const { imageBase64, corePath, langPath } = msg;

    if (!imageBase64 || !corePath || !langPath) {
      process.send({ success: false, error: 'Missing required parameters', detail: 'imageBase64, corePath, langPath are all required' });
      process.exit(1);
      return;
    }

    const result = await doRecognize(imageBase64, corePath, langPath);

    process.send({ success: true, ...result });

    // Clean shutdown
    if (worker) {
      await worker.terminate().catch(() => {});
      worker = null;
    }
    process.exit(0);
  } catch (e) {
    const message = e.message || String(e);
    const detail = e.stack || message;

    // Try to send detailed error back to parent
    try {
      process.send({ success: false, error: message, detail });
    } catch (_) {
      // Parent may already be dead
    }

    // Cleanup
    if (worker) {
      await worker.terminate().catch(() => {});
      worker = null;
    }
    process.exit(1);
  }
});

// Heartbeat to confirm worker is alive
process.send({ ready: true });
