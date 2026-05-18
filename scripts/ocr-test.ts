/**
 * Backend OCR Test Script
 * Tests tesseract.js directly against real screenshots.
 */
import * as fs from 'fs';
import * as path from 'path';

const Tesseract = require('tesseract.js');

const OCR_TEST_DIR = path.resolve(__dirname, '..', 'ocr-test');
const IMAGES = ['code-screenshot-1.png', 'code-screenshot-2.png'];
const CORE_PATH = path.resolve(__dirname, '..', 'node_modules', 'tesseract.js-core');
const LANG_PATH = path.resolve(__dirname, '..', 'media', 'tesseract');

let passed = 0;
let failed = 0;

function PASS(msg: string) { console.log(`  PASS: ${msg}`); passed++; }
function FAIL(msg: string) { console.log(`  FAIL: ${msg}`); failed++; }

function hasCodeKeywords(text: string): boolean {
  const keywords = [
    'const', 'let', 'var', 'function', 'class', 'interface', 'import', 'export',
    'return', 'string', 'number', 'boolean',
    '<html', '</html', '<div', '<script', '<style', '<meta', 'DOCTYPE',
    '<head', '<body', 'class=', 'style=', 'id=',
    'import ', 'from ', 'private', 'public',
    'ocr-btn', 'ocrUploadBtn', 'screenshot', 'preview',
  ];
  const lower = text.toLowerCase();
  return keywords.some(kw => lower.includes(kw.toLowerCase()));
}

async function main() {
  console.log('============================================================');
  console.log('  OCR BACKEND TEST SUITE');
  console.log('============================================================\n');

  // Check prerequisites
  if (!fs.existsSync(LANG_PATH)) { FAIL(`Lang path missing: ${LANG_PATH}`); process.exit(1); }
  PASS(`Lang path exists: ${LANG_PATH}`);

  const langFile = path.join(LANG_PATH, 'eng.traineddata.gz');
  if (!fs.existsSync(langFile)) { FAIL(`Traineddata missing: ${langFile}`); process.exit(1); }
  const stat = fs.statSync(langFile);
  PASS(`Traineddata exists: ${(stat.size / 1024).toFixed(1)} KB`);

  // Verify traineddata is valid gzip
  const gzBuf = fs.readFileSync(langFile);
  const isGzip = gzBuf[0] === 0x1f && gzBuf[1] === 0x8b;
  if (!isGzip) { FAIL('Traineddata is not valid gzip'); }
  else PASS('Traineddata is valid gzip');

  // Create worker once
  console.log('\n--- Creating Tesseract worker ---');
  const start = Date.now();
  let worker: any;
  try {
    worker = await Tesseract.createWorker('eng', 1, {
      corePath: CORE_PATH,
      langPath: LANG_PATH,
    });
    const elapsed = (Date.now() - start) / 1000;
    PASS(`Worker created in ${elapsed.toFixed(1)}s`);
  } catch (e: any) {
    FAIL(`Worker creation failed: ${e.message}`);
    process.exit(1);
  }

  // Test each image
  for (const imgName of IMAGES) {
    const imgPath = path.join(OCR_TEST_DIR, imgName);
    console.log(`\n--- Testing ${imgName} ---`);

    if (!fs.existsSync(imgPath)) {
      FAIL(`${imgName}: File not found at ${imgPath}`);
      continue;
    }
    const imgStat = fs.statSync(imgPath);
    PASS(`${imgName}: File exists (${(imgStat.size / 1024).toFixed(1)} KB)`);

    const buf = fs.readFileSync(imgPath);
    const base64 = `data:image/png;base64,${buf.toString('base64')}`;

    try {
      const t0 = Date.now();
      const r = await worker.recognize(base64);
      const elapsed = (Date.now() - t0) / 1000;

      const text = (r.data.text || '').trim();
      console.log(`  Time: ${elapsed.toFixed(1)}s`);
      console.log(`  Text length: ${text.length} chars`);
      console.log(`  Confidence: ${r.data.confidence}`);

      if (text.length > 0) {
        PASS(`${imgName}: OCR returned ${text.length} chars`);
        console.log(`  Preview: ${text.substring(0, 200)}`);

        if (hasCodeKeywords(text)) {
          PASS(`${imgName}: Contains code keywords`);
        } else {
          FAIL(`${imgName}: No code keywords detected`);
        }

        // Check for specific expected content
        if (imgName.includes('2')) {
          if (text.includes('Content-Security') || text.includes('script') || text.includes('meta')) {
            PASS(`${imgName}: Contains expected code elements (CSP/script/meta)`);
          } else {
            console.log(`  (No expected elements found, but text is present)`);
          }
        }
      } else {
        FAIL(`${imgName}: No text recognized`);
      }
    } catch (e: any) {
      FAIL(`${imgName}: Recognition error: ${e.message}`);
    }
  }

  // Cleanup
  await worker.terminate().catch(() => {});
  console.log('\nWorker terminated');

  // Summary
  console.log('\n============================================================');
  console.log(`  RESULTS: ${passed} PASS, ${failed} FAIL`);
  console.log('============================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
