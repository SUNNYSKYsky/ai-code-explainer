/**
 * OCR Spike Test — Minimal reproduction to verify tesseract.js works
 * outside the VS Code extension host, using only Node.js + absolute paths.
 *
 * Usage: npm run ocr-spike
 */
import * as fs from 'fs';
import * as path from 'path';

// ── 0. Prerequisites ─────────────────────────────────────────────
const ROOT = path.resolve(__dirname, '..');
console.log('=== OCR SPIKE TEST ===');
console.log('1. Working directory:', process.cwd());
console.log('2. Project root:     ', ROOT);
console.log('');

// ── 1. Locate test images ────────────────────────────────────────
const OCR_TEST_DIR = path.join(ROOT, 'ocr-test');
const IMAGES = ['code-screenshot-1.png', 'code-screenshot-2.png'];

// Also try reading from 测试用图 (source), silently skip if locked by OS
const SOURCE_DIR = path.join(ROOT, '..', '测试用图');
const SOURCE_MAP: Record<string, string> = {
  'code-screenshot-1.png': '屏幕截图 2026-05-15 134907.png',
  'code-screenshot-2.png': '屏幕截图 2026-05-15 142217.png',
};

console.log('3. Test image directory:', OCR_TEST_DIR);
console.log('4. Source directory:     ', SOURCE_DIR);
console.log('');

// ── 2. Check images exist ────────────────────────────────────────
for (const img of IMAGES) {
  const p = path.join(OCR_TEST_DIR, img);
  if (fs.existsSync(p)) {
    const stat = fs.statSync(p);
    console.log(`   [OK] ${img} — ${(stat.size / 1024).toFixed(1)} KB`);
  } else {
    console.log(`   [MISSING] ${img} at ${p}`);
    // Try to copy from source if missing
    const srcName = SOURCE_MAP[img];
    if (srcName) {
      const srcPath = path.join(SOURCE_DIR, srcName);
      if (fs.existsSync(srcPath)) {
        console.log(`   [COPY] Copying from ${srcPath} → ${p}`);
        fs.copyFileSync(srcPath, p);
        const stat = fs.statSync(p);
        console.log(`   [OK] ${img} — ${(stat.size / 1024).toFixed(1)} KB (copied)`);
      }
    }
  }
}
console.log('');

// ── 3. Check tesseract.js & resources ─────────────────────────────
let Tesseract: any;
try {
  Tesseract = require('tesseract.js');
  console.log('5. tesseract.js: LOADED');
  console.log('   API keys:', Object.keys(Tesseract).join(', '));
} catch (e: any) {
  console.error('5. tesseract.js: FAILED TO LOAD');
  console.error('   Error:', e.message);
  console.error('   Stack:', e.stack);
  process.exit(1);
}

const CORE_PATH = path.join(ROOT, 'node_modules', 'tesseract.js-core');
const LANG_PATH = path.join(ROOT, 'media', 'tesseract');
const LANG_FILE = path.join(LANG_PATH, 'eng.traineddata.gz');

console.log('6. corePath (absolute):', CORE_PATH);
console.log('   exists:', fs.existsSync(CORE_PATH));
console.log('7. langPath (absolute):', LANG_PATH);
console.log('   exists:', fs.existsSync(LANG_PATH));
console.log('8. traineddata:', LANG_FILE);
console.log('   exists:', fs.existsSync(LANG_FILE));

if (!fs.existsSync(CORE_PATH)) {
  console.error('[FATAL] tesseract.js-core not found at', CORE_PATH);
  process.exit(1);
}
if (!fs.existsSync(LANG_PATH)) {
  console.error('[FATAL] langPath not found at', LANG_PATH);
  process.exit(1);
}
if (!fs.existsSync(LANG_FILE)) {
  console.error('[FATAL] eng.traineddata.gz not found at', LANG_FILE);
  process.exit(1);
}

// Validate gzip magic bytes
const gzBuf = fs.readFileSync(LANG_FILE);
const isGzip = gzBuf[0] === 0x1f && gzBuf[1] === 0x8b;
console.log('   valid gzip:', isGzip, '(magic bytes:', gzBuf[0].toString(16), gzBuf[1].toString(16) + ')');
console.log('');

// ── 4. Code keywords for detection ────────────────────────────────
const CODE_KEYWORDS = [
  'return', 'function', 'private', 'public', 'class', 'import', 'export',
  'const', 'let', 'var', 'html', 'style', 'button', 'div', 'DOCTYPE',
  'charset', 'vscode', 'onclick', 'textarea', 'require',
];
function countCodeKeywords(text: string): string[] {
  const lower = text.toLowerCase();
  return CODE_KEYWORDS.filter(kw => lower.includes(kw.toLowerCase()));
}

// ── 5. Run OCR on each image ──────────────────────────────────────
async function ocrImage(imageName: string): Promise<void> {
  const imgPath = path.join(OCR_TEST_DIR, imageName);
  console.log(`=== OCR: ${imageName} ===`);
  console.log('   Path:', imgPath);

  if (!fs.existsSync(imgPath)) {
    console.log('   [SKIP] File not found');
    return;
  }

  const buf = fs.readFileSync(imgPath);
  const base64 = `data:image/png;base64,${buf.toString('base64')}`;
  console.log('   base64 length:', base64.length, 'chars');

  const t0 = Date.now();
  let worker: any = null;
  try {
    console.log('   Creating worker...');
    worker = await Tesseract.createWorker('eng', 1, {
      corePath: CORE_PATH,
      langPath: LANG_PATH,
    });
    console.log('   Worker created in', ((Date.now() - t0) / 1000).toFixed(1) + 's');

    console.log('   Recognizing...');
    const r = await worker.recognize(base64);
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    const text = (r.data.text || '').trim();
    const confidence = r.data.confidence;

    console.log('   ───────────────────────────────────────────');
    console.log('   Time:      ', elapsed + 's');
    console.log('   Text len:  ', text.length, 'chars');
    console.log('   Confidence:', confidence);
    console.log('   ───────────────────────────────────────────');
    console.log('   First 500 chars:');
    console.log('   ' + text.substring(0, 500).replace(/\n/g, '\n   '));
    console.log('   ───────────────────────────────────────────');

    // Code keyword detection
    const hits = countCodeKeywords(text);
    if (hits.length > 0) {
      console.log(`   [CODE] Detected ${hits.length} keywords:`, hits.join(', '));
    } else {
      console.log('   [WARN] No code keywords detected in OCR output');
      console.log('   Full text for manual inspection:');
      console.log(text);
    }
  } catch (e: any) {
    console.error('   [FAIL] OCR error:');
    console.error('   Message:', e.message);
    console.error('   Stack:', e.stack);
    if (e.code) console.error('   Code:', e.code);
    if (e.signal) console.error('   Signal:', e.signal);
    if (e.stderr) console.error('   Stderr:', e.stderr);
  } finally {
    if (worker) {
      try { await worker.terminate(); } catch (_) { /* ignore */ }
      console.log('   Worker terminated.');
    }
  }
  console.log('');
}

// ── 6. Main ───────────────────────────────────────────────────────
async function main() {
  for (const img of IMAGES) {
    await ocrImage(img);
  }
  console.log('=== OCR SPIKE COMPLETE ===');
}

main().catch(e => {
  console.error('Fatal:', e.message || e);
  console.error(e.stack);
  process.exit(1);
});
