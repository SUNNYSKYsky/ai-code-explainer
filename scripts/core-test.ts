/**
 * Core Logic Test Script
 * Tests explainCode, explainCommandSafety, explainError, optimizePrompt, smartAnalyze.
 */
import { explainCode, explainCommandSafety, explainError, optimizePrompt, smartAnalyze } from '../src/explanations';
import type { ExplanationResult, SafetyResult, ErrorExplanation, PromptOptimization } from '../src/types';

let passed = 0;
let failed = 0;

interface TestCase {
  name: string;
  fn: () => boolean | string;
}

function assert(condition: boolean, msg: string): string | true {
  if (!condition) return msg;
  return true;
}

function includesAny(text: string, terms: string[]): boolean {
  const lower = text.toLowerCase();
  return terms.some(t => lower.includes(t.toLowerCase()));
}

function run(test: TestCase): void {
  process.stdout.write(`  ${test.name}... `);
  try {
    const r = test.fn();
    if (r === true) {
      console.log('PASS');
      passed++;
    } else {
      console.log(`FAIL: ${r}`);
      failed++;
    }
  } catch (e: any) {
    console.log(`FAIL: ${e.message || e}`);
    failed++;
  }
}

// ================================================================
// TEST DATA
// ================================================================

const TS_HTML_CODE = `const vscode = require('vscode');
import * as types from './types';

export class PanelManager {
  private panel: vscode.WebviewPanel | undefined;
  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  open(): void {
    this.panel = vscode.window.createWebviewPanel(
      'myPanel',
      'Title',
      vscode.ViewColumn.Two,
      { enableScripts: true }
    );
    this.panel.webview.html = this.buildHTML();
  }

  public buildHTML(): string {
    return \`<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>Test</title>
</head>
<body>
  <div id="root">
    <h1>Hello World</h1>
  </div>
</body>
</html>\`;
  }

  private handleMessage(msg: any): void {
    if (msg.type === 'analyze') {
      const result = this.analyze(msg.text || '');
      this.panel?.webview.postMessage({ type: 'result', data: result });
    }
  }
}`;

const REMOVE_ITEM_CMD = 'Remove-Item -Path "./node_modules" -Recurse -Force';

const NPM_INSTALL_CMD = 'npm install --save-dev @types/node tesseract.js';

const TS_ERROR_2580 = 'src/panel.ts(7,21): error TS2580: Cannot find name require. Do you need to install type definitions for node?';

const PROMPT_INPUT = '我想知道在当前项目里计算 TypeScript 文件数量';

const HTML_CODE = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI Agent Command Center</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div id="app">
    <h1 class="title">Welcome</h1>
  </div>
  <script src="app.js"></script>
</body>
</html>`;

const CSS_CODE = `:root {
  --bg-deep: #080c14;
  --accent-blue: #6b9dfc;
  --text-primary: rgba(235,238,248,0.94);
}

.input-cabin textarea {
  width: 100%;
  background: var(--bg-input);
  color: var(--text-primary);
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
}`;

const NPM_ERROR = `npm ERR! code ERESOLVE
npm ERR! ERESOLVE could not resolve
npm ERR!
npm ERR! While resolving: my-project@1.0.0
npm ERR! Found: react@18.3.1
npm ERR! node_modules/react
npm ERR!   react@"^18.3.1" from the root project
npm ERR!
npm ERR! Could not resolve dependency:
npm ERR! peer react@"^17.0.0" from old-lib@2.0.0`;

const MODULE_NOT_FOUND = `Error: Cannot find module './explanations'
Require stack:
- C:\\Users\\lenovo\\Desktop\\申请token\\out\\panel.js
- C:\\Users\\lenovo\\Desktop\\申请token\\out\\extension.js
    at Module._resolveFilename (node:internal/modules/cjs/loader:1144:15)`;

const POWERSHELL_CMD = 'Get-ChildItem -Path "C:\\Users" -Recurse -Filter "*.log" | Where-Object { $_.Length -gt 1MB } | Remove-Item -Force';

console.log('============================================================');
console.log('  CORE LOGIC TEST SUITE');
console.log('============================================================\n');

// ================================================================
// 1. CODE EXPLAINER TESTS
// ================================================================
console.log('--- Code Explainer ---');

run({
  name: 'TS+HTML hybrid detection',
  fn: () => {
    const r = explainCode(TS_HTML_CODE, 'zh');
    const allText = r.summary + r.lineByLine.map(l => l.line + ' ' + l.meaning).join(' ');
    return assert(r !== null, 'Result should not be null')
      || assert(r.summary.length > 10, 'Summary too short')
      || assert(r.lineByLine.length > 3, 'Too few line explanations')
      || assert(r.wordByWord.length > 3, 'Too few word explanations')
      || assert(r.sections.length > 0, 'Should have sections')
      || assert(r.finalSummary.length > 10, 'finalSummary too short')
      || assert(includesAny(allText, ['class', '类', '面板', 'Panel']), 'Should mention class/Panel');
  }
});

run({
  name: 'TS+HTML contains document type',
  fn: () => {
    const r = explainCode(TS_HTML_CODE, 'zh');
    const allText = r.summary + r.lineByLine.map(l => l.line + ' ' + l.meaning).join(' ');
    return assert(includesAny(allText, ['DOCTYPE', '文档声明', '文档类型', '文档']), 'Should reference DOCTYPE');
  }
});

run({
  name: 'TS+HTML contains template string mention',
  fn: () => {
    const r = explainCode(TS_HTML_CODE, 'zh');
    const allText = r.summary + r.lineByLine.map(l => l.line + ' ' + l.meaning).join(' ');
    return assert(includesAny(allText, ['模板', 'template', '字符串', 'HTML']), 'Should mention template string or HTML');
  }
});

run({
  name: 'HTML code detection',
  fn: () => {
    const r = explainCode(HTML_CODE, 'zh');
    return assert(r !== null, 'Result should not be null')
      || assert(r.summary.length > 10, 'Summary too short')
      || assert(r.lineByLine.length > 3, 'Too few line explanations');
  }
});

run({
  name: 'HTML mentions DOCTYPE or document structure',
  fn: () => {
    const r = explainCode(HTML_CODE, 'zh');
    const allText = r.summary + r.lineByLine.map(l => l.line + ' ' + l.meaning).join(' ');
    return assert(includesAny(allText, ['DOCTYPE', '文档声明', '文档类型', '文档', 'HTML', 'html']), 'Should mention document structure');
  }
});

run({
  name: 'HTML mentions meta charset or encoding',
  fn: () => {
    const r = explainCode(HTML_CODE, 'zh');
    const allText = r.summary + r.lineByLine.map(l => l.line + ' ' + l.meaning).join(' ');
    return assert(includesAny(allText, ['charset', '字符', '编码', 'meta', '元信息']), 'Should mention charset or meta');
  }
});

run({
  name: 'CSS code detection',
  fn: () => {
    const r = explainCode(CSS_CODE, 'zh');
    return assert(r !== null, 'Result should not be null')
      || assert(r.summary.length > 10, 'Summary too short');
  }
});

run({
  name: 'CSS mentions variables',
  fn: () => {
    const r = explainCode(CSS_CODE, 'zh');
    const allText = r.summary + r.lineByLine.map(l => l.line + ' ' + l.meaning).join(' ');
    return assert(includesAny(allText, ['变量', 'var', 'variable', 'CSS']), 'Should mention CSS variables');
  }
});

run({
  name: 'Code explainer returns zh strings',
  fn: () => {
    const r = explainCode(TS_HTML_CODE, 'zh');
    return assert(r.summary.length > 5, 'Summary should have content');
  }
});

run({
  name: 'Code explainer returns en strings',
  fn: () => {
    const r = explainCode(TS_HTML_CODE, 'en');
    return assert(r.summary.length > 5, 'Summary should have content');
  }
});

run({
  name: 'Sections have correct structure (label, original, meaning, type, role, displayOnPage, layman, caution)',
  fn: () => {
    const r = explainCode(TS_HTML_CODE, 'zh');
    return assert(r.sections.length > 0, 'Should have at least one section')
      || assert(r.sections[0].label.length > 0, 'Section label should not be empty')
      || assert(r.sections[0].original.length > 0, 'Section original should not be empty')
      || assert(r.sections[0].meaning.length > 0, 'Section meaning should not be empty')
      || assert(r.sections[0].type.length > 0, 'Section type should not be empty')
      || assert(r.sections[0].role.length > 0, 'Section role should not be empty')
      || assert(r.sections[0].displayOnPage.length > 0, 'Section displayOnPage should not be empty')
      || assert(r.sections[0].layman.length > 0, 'Section layman should not be empty')
      || assert(r.sections[0].caution.length > 0, 'Section caution should not be empty');
  }
});

run({
  name: 'HTML code gets paragraph-based sections (not word dictionary)',
  fn: () => {
    const r = explainCode(HTML_CODE, 'zh');
    const sectionText = r.sections.map(s => s.meaning).join(' ');
    return assert(r.sections.length >= 2, `Expected >=2 sections, got ${r.sections.length}`)
      || assert(includesAny(sectionText, ['文档', '页面', '编码', '标签', '标题']), 'Sections should explain document structure');
  }
});

run({
  name: 'CSS sections explain styling concepts',
  fn: () => {
    const r = explainCode(CSS_CODE, 'zh');
    const sectionText = r.sections.map(s => s.meaning + ' ' + s.layman).join(' ');
    return assert(r.sections.length > 0, 'CSS should have sections')
      || assert(includesAny(sectionText, ['CSS', '变量', '样式', '颜色']), 'Sections should explain CSS concepts');
  }
});

run({
  name: 'finalSummary contains key takeaways for beginners',
  fn: () => {
    const r = explainCode(TS_HTML_CODE, 'zh');
    return assert(r.finalSummary.length > 20, 'finalSummary too short')
      || assert(includesAny(r.finalSummary, ['段', '小白', '用户', '看到']), 'finalSummary should have beginner-friendly takeaways');
  }
});

// ================================================================
// 2. COMMAND SAFETY TESTS
// ================================================================
console.log('\n--- Command Safety ---');

run({
  name: 'Remove-Item detected as dangerous',
  fn: () => {
    const r = explainCommandSafety(REMOVE_ITEM_CMD, 'zh');
    return assert(r !== null, 'Result should not be null')
      || assert(r.dangerPoints.length > 0, 'Should have danger points');
  }
});

run({
  name: 'Remove-Item deletes files flag',
  fn: () => {
    const r = explainCommandSafety(REMOVE_ITEM_CMD, 'zh');
    return assert(r.willDeleteFiles.includes('是'), 'Should flag file deletion');
  }
});

run({
  name: 'Remove-Item has risk level',
  fn: () => {
    const r = explainCommandSafety(REMOVE_ITEM_CMD, 'zh');
    return assert(r.riskLevel === '高' || r.riskLevel === '极高' || r.riskLevel === '中', `Risk level "${r.riskLevel}" should be medium or higher`);
  }
});

run({
  name: 'Remove-Item has line-by-line',
  fn: () => {
    const r = explainCommandSafety(REMOVE_ITEM_CMD, 'zh');
    return assert(r.lineByLine.length > 0, 'Should have line-by-line explanation');
  }
});

run({
  name: 'npm install has network flag',
  fn: () => {
    const r = explainCommandSafety(NPM_INSTALL_CMD, 'zh');
    return assert(r.willAccessNetwork.includes('是'), 'Should flag network access');
  }
});

run({
  name: 'npm install has word-by-word',
  fn: () => {
    const r = explainCommandSafety(NPM_INSTALL_CMD, 'zh');
    return assert(r.wordByWord.length > 0, 'Should have word-by-word');
  }
});

run({
  name: 'npm install has suggestion',
  fn: () => {
    const r = explainCommandSafety(NPM_INSTALL_CMD, 'zh');
    return assert(r.suggestion.length > 5, 'Should have execution advice');
  }
});

run({
  name: 'PowerShell cmd deletes files',
  fn: () => {
    const r = explainCommandSafety(POWERSHELL_CMD, 'zh');
    return assert(r.willDeleteFiles.includes('是'), 'Should flag file deletion');
  }
});

// ================================================================
// 3. ERROR TRANSLATOR TESTS
// ================================================================
console.log('\n--- Error Translator ---');

run({
  name: 'TS2580 plain explanation',
  fn: () => {
    const r = explainError(TS_ERROR_2580, 'zh');
    return assert(r !== null, 'Result should not be null')
      || assert(r.plainChinese.length > 10, 'Plain explanation too short');
  }
});

run({
  name: 'TS2580 possible reasons',
  fn: () => {
    const r = explainError(TS_ERROR_2580, 'zh');
    return assert(r.possibleReasons.length > 0, 'Should have possible reasons');
  }
});

run({
  name: 'TS2580 next steps',
  fn: () => {
    const r = explainError(TS_ERROR_2580, 'zh');
    return assert(r.nextSteps.length > 0, 'Should have next steps');
  }
});

run({
  name: 'TS2580 has severity',
  fn: () => {
    const r = explainError(TS_ERROR_2580, 'zh');
    return assert(r.severity.length > 0, 'Should have severity');
  }
});

run({
  name: 'TS2580 has original error',
  fn: () => {
    const r = explainError(TS_ERROR_2580, 'zh');
    return assert(r.original.length > 10, 'Should preserve original error text');
  }
});

run({
  name: 'npm ERESOLVE error detection',
  fn: () => {
    const r = explainError(NPM_ERROR, 'zh');
    return assert(r !== null, 'Result should not be null')
      || assert(r.plainChinese.length > 10, 'Plain explanation too short');
  }
});

run({
  name: 'Module not found error detection',
  fn: () => {
    const r = explainError(MODULE_NOT_FOUND, 'zh');
    return assert(r !== null, 'Result should not be null')
      || assert(r.plainChinese.length > 10, 'Plain explanation too short');
  }
});

// ================================================================
// 4. PROMPT OPTIMIZER TESTS
// ================================================================
console.log('\n--- Prompt Optimizer ---');

run({
  name: 'Prompt optimizer returns optimized text',
  fn: () => {
    const r = optimizePrompt(PROMPT_INPUT, 'zh');
    return assert(r !== null, 'Result should not be null')
      || assert(r.optimized.length > 0, 'Optimized prompt should not be empty')
      || assert(r.optimized !== r.original, 'Optimized should differ from original')
      || assert(r.improvements.length > 0, 'Should have improvements listed');
  }
});

run({
  name: 'Prompt optimizer preserves original',
  fn: () => {
    const r = optimizePrompt(PROMPT_INPUT, 'zh');
    return assert(r.original === PROMPT_INPUT, 'Should preserve original input');
  }
});

// ================================================================
// 5. SMART ANALYZE TESTS
// ================================================================
console.log('\n--- Smart Analyze ---');

run({
  name: 'Smart analyze detects code',
  fn: () => {
    const r = smartAnalyze(TS_HTML_CODE, { outputLanguage: 'zh' });
    return assert(r !== null, 'Result should not be null')
      || assert(r.detectionType === 'code' || r.detectionType === 'mixed', `Detection type "${r.detectionType}" should be code or mixed`);
  }
});

run({
  name: 'Smart analyze detects command',
  fn: () => {
    const r = smartAnalyze(REMOVE_ITEM_CMD, { outputLanguage: 'zh' });
    return assert(r.detectionType === 'command' || r.detectionType === 'mixed', `Detection type "${r.detectionType}" should be command`);
  }
});

run({
  name: 'Smart analyze detects error',
  fn: () => {
    const r = smartAnalyze(TS_ERROR_2580, { outputLanguage: 'zh' });
    return assert(r.detectionType === 'error', `Detection type "${r.detectionType}" should be error`);
  }
});

run({
  name: 'Smart analyze suggests correct action for code',
  fn: () => {
    const r = smartAnalyze(TS_HTML_CODE, { outputLanguage: 'zh' });
    return assert(r.recommendedAction === 'explainCode', `Action "${r.recommendedAction}" should be explainCode`);
  }
});

run({
  name: 'Smart analyze returns suggestions',
  fn: () => {
    const r = smartAnalyze(TS_HTML_CODE, { outputLanguage: 'zh' });
    return assert(r.suggestions.length > 0, 'Should have suggestions');
  }
});

console.log('\n============================================================');
console.log(`  RESULTS: ${passed} PASS, ${failed} FAIL`);
console.log('============================================================');

if (failed > 0) {
  process.exit(1);
}
