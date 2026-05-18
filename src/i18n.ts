/**
 * i18n system for AI Agent Command Center v0.2
 * Cleaned up: no TargetAI, no PromptLanguage, simplified OutputLanguage.
 */

export type UILanguage = 'zh' | 'en';
export type OutputLanguage = 'followUI' | 'zh' | 'en' | 'bilingual';
export type ExplanationLevel = 'beginner' | 'standard' | 'pro';

export interface AppStrings {
  title: string;
  subtitle: string;
  versionTag: string;
  inputLabel: string;
  charCount: string;
  inputHint: string;
  inputPlaceholder: string;
  smartAnalyze: string;
  optimizePrompt: string;
  explainCode: string;
  commandSafety: string;
  explainError: string;
  uiLanguage: string;
  outputLanguage: string;
  explanationLevel: string;
  loading: string;
  emptyTitle: string;
  emptyDesc: string;
  currentDict: string;
  accumulatedDict: string;
  expand: string;
  collapse: string;
  showAll: string;
  collapseAll: string;
  copyPrompt: string;
  copyHint: string;
  riskLevel: string;
  footer: string;

  // Result section labels
  overallMeaning: string;
  lineByLine: string;
  wordByWord: string;
  projectImpact: string;
  learningPoints: string;
  overallJudgment: string;
  safetyDetail: string;
  dangerPoints: string;
  suggestExecute: string;
  originalError: string;
  plainExplanation: string;
  possibleReasons: string;
  nextSteps: string;
  severity: string;
  originalRequest: string;
  optimizedPrompt: string;
  improvements: string;
  keyTerms: string;
  executionAdvice: string;

  // Smart analyze
  detectionResult: string;
  recommendedAction: string;
  analysisContent: string;
  nextSuggestions: string;

  // Mismatch
  mismatchCodeTitle: string;
  mismatchCodeMsg: string;
  mismatchCommandTitle: string;
  mismatchCommandMsg: string;
  mismatchErrorTitle: string;
  mismatchErrorMsg: string;
  switchToPrompt: string;

  // Dictionary
  dictEmpty: string;

  // Settings labels
  levelBeginner: string;
  levelStandard: string;
  levelPro: string;
  langZH: string;
  langEN: string;
  langBilingual: string;
  followUI: string;

  // Detection types
  detectNaturalLang: string;
  detectCode: string;
  detectCommand: string;
  detectError: string;
  detectMixed: string;

  // Empty states
  noEntries: string;

  // Toast
  toastEmpty: string;
  toastCopied: string;
  toastCopyFailed: string;
  toastPromptCopied: string;
  toastNoResult: string;

  // Inline labels
  explanation: string;
  type: string;
  visible: string;
  yes: string;
  no: string;
  audience: string;
  developer: string;
  browser: string;
  comment: string;
  method: string;
  arrowFunc: string;
  typeDef: string;
  doctype: string;
  root: string;
  head: string;
  meta: string;
  rootSelector: string;
  variables: string;
  element: string;
  code: string;
  analysisResult: string;
  whatItDoes: string;
  cmdBreakdown: string;
  outputMeaning: string;
  errorReason: string;
  howToFix: string;
  deleteFiles: string;
  modifyConfig: string;
  networkAccess: string;
  systemAffect: string;

  // Best next step
  bestNextStep: string;

  // Dict
  dictCount: string;

  // OCR
  uploadScreenshot: string;
  screenshotOCR: string;
  screenshotPreview: string;
  extractingText: string;
  ocrProgress: string;
  ocrDone: string;
  ocrFailed: string;
  dropImageHint: string;
  privacyNote: string;
  qualityHint: string;
  ocrProcessing: string;
  clearScreenshot: string;
}

const ZH: AppStrings = {
  title: 'AI Agent 中文驾驶舱',
  subtitle: '让不会代码的人，也能看懂 AI 在做什么',
  versionTag: 'MVP v0.2 · 本地规则版 · 多语言实验',
  inputLabel: '输入内容',
  charCount: '字',
  inputHint: '支持：提示词优化 · 代码解释 · 命令安全 · 报错翻译',
  inputPlaceholder: '粘贴代码、命令、报错，或者输入你的大白话需求...',
  smartAnalyze: '智能分析',
  optimizePrompt: '优化提示词',
  explainCode: '解释代码',
  commandSafety: '命令安全',
  explainError: '报错翻译',
  uiLanguage: '界面语言',
  outputLanguage: '输出语言',
  explanationLevel: '解释深度',
  loading: '正在分析中...',
  emptyTitle: 'AI Agent 驾驶舱',
  emptyDesc: '粘贴一段代码、命令或报错，我会帮你翻译成人话。\n你也可以输入一句大白话需求，我会帮你优化成\nAI 更容易执行的提示词。',
  currentDict: '本次识别词典',
  accumulatedDict: '我的累计词典',
  expand: '展开',
  collapse: '收起',
  showAll: '展开全部',
  collapseAll: '收起',
  copyPrompt: '复制优化后的提示词',
  copyHint: '复制后可直接发给 ChatGPT / Claude 等 AI 工具使用',
  riskLevel: '风险等级',
  footer: 'AI Agent Command Center · v0.2',

  overallMeaning: '整体作用',
  lineByLine: '逐行解释',
  wordByWord: '逐词拆解',
  projectImpact: '对项目的影响',
  learningPoints: '新手学习点',
  overallJudgment: '整体判断',
  safetyDetail: '安全明细',
  dangerPoints: '危险点',
  suggestExecute: '建议是否执行',
  originalError: '报错原文',
  plainExplanation: '大白话解释',
  possibleReasons: '可能原因',
  nextSteps: '下一步怎么做',
  severity: '严重程度',
  originalRequest: '你的原始需求',
  optimizedPrompt: '优化后的提示词',
  improvements: '优化点说明',
  keyTerms: '关键词解释',
  executionAdvice: '执行建议',

  detectionResult: '检测结果',
  recommendedAction: '推荐操作',
  analysisContent: '分析内容',
  nextSuggestions: '下一步建议',

  mismatchCodeTitle: '提示',
  mismatchCodeMsg: '当前内容不像代码。你可能更适合使用「优化提示词」功能。',
  mismatchCommandTitle: '提示',
  mismatchCommandMsg: '当前内容不像终端命令。请粘贴 npm、git、PowerShell 等命令后再分析。',
  mismatchErrorTitle: '提示',
  mismatchErrorMsg: '当前内容不像报错信息。请粘贴包含 error、failed、Exception、Exit code 等内容的报错。',
  switchToPrompt: '点击切换到「优化提示词」',

  dictEmpty: '暂无词条',

  levelBeginner: '小白',
  levelStandard: '标准',
  levelPro: '专业',
  langZH: '简体中文',
  langEN: 'English',
  langBilingual: '双语',
  followUI: '跟随界面',

  detectNaturalLang: '自然语言需求',
  detectCode: '代码',
  detectCommand: '终端命令',
  detectError: '报错日志',
  detectMixed: '混合内容',

  noEntries: '暂无词条',

  toastEmpty: '请先在输入框中粘贴要分析的内容',
  toastCopied: '已复制到剪贴板',
  toastCopyFailed: '复制失败，请手动选择文字后 Ctrl+C 复制',
  toastPromptCopied: '优化后的提示词已复制',
  toastNoResult: '还没有分析结果',

  explanation: '说明',
  type: '类型',
  visible: '显示在页面',
  yes: '是',
  no: '否',
  audience: '给谁看的',
  developer: '开发者',
  browser: '浏览器',
  comment: '注释',
  method: '方法定义',
  arrowFunc: '箭头函数',
  typeDef: '类型定义',
  doctype: '文档声明',
  root: '根元素',
  head: '头部',
  meta: '元信息',
  rootSelector: '根选择器',
  variables: '变量',
  element: '元素',
  code: '程序代码',
  analysisResult: '分析结果',
  whatItDoes: '它在干什么',
  cmdBreakdown: '命令逐词拆解',
  outputMeaning: '输出结果是什么意思',
  errorReason: '报错原因',
  howToFix: '下一步怎么修',
  deleteFiles: '删除文件',
  modifyConfig: '修改配置',
  networkAccess: '联网操作',
  systemAffect: '影响系统',

  bestNextStep: '最佳下一步',

  dictCount: '个词条',

  uploadScreenshot: '上传截图识别',
  screenshotOCR: '截图识别',
  screenshotPreview: '截图预览',
  extractingText: '正在识别图片中的文字...',
  ocrProgress: '识别进度',
  ocrDone: '已识别出图片中的文字，请检查是否有识别错误，再继续分析。',
  ocrFailed: '识别失败，请尝试更清晰的截图，或手动复制文字。',
  dropImageHint: '拖放图片以识别文字',
  privacyNote: '图片仅在本地识别，不会上传或保存。',
  qualityHint: '截图越清晰，识别越准确。建议使用高分辨率截图，避免模糊、倾斜和过暗背景。',
  ocrProcessing: '正在识别...',
  clearScreenshot: '清除截图',
};

const EN: AppStrings = {
  title: 'AI Agent Command Center',
  subtitle: 'Understand what AI is doing. Tell AI exactly what you want.',
  versionTag: 'MVP v0.2 · Local Rules · Multilingual Preview',
  inputLabel: 'Input',
  charCount: 'chars',
  inputHint: 'Supports: Prompt Optimizer · Code Explainer · Command Safety · Error Translator',
  inputPlaceholder: 'Paste code, commands, errors, or describe what you need in plain words...',
  smartAnalyze: 'Smart Analyze',
  optimizePrompt: 'Prompt Optimizer',
  explainCode: 'Code Explainer',
  commandSafety: 'Command Safety',
  explainError: 'Error Translator',
  uiLanguage: 'UI Language',
  outputLanguage: 'Output Language',
  explanationLevel: 'Explanation Depth',
  loading: 'Analyzing...',
  emptyTitle: 'AI Agent Command Center',
  emptyDesc: 'Paste code, commands, or errors — I\'ll explain them in plain language.\nOr describe what you want in natural language — I\'ll craft\nan optimized prompt for your AI tool.',
  currentDict: 'Session Dictionary',
  accumulatedDict: 'My Dictionary',
  expand: 'Expand',
  collapse: 'Collapse',
  showAll: 'Show All',
  collapseAll: 'Collapse',
  copyPrompt: 'Copy Optimized Prompt',
  copyHint: 'Paste directly into ChatGPT, Claude, or other AI tools',
  riskLevel: 'Risk Level',
  footer: 'AI Agent Command Center · v0.2',

  overallMeaning: 'What It Does',
  lineByLine: 'Line-by-Line',
  wordByWord: 'Word-by-Word',
  projectImpact: 'Project Impact',
  learningPoints: 'Learning Points',
  overallJudgment: 'Overall Judgment',
  safetyDetail: 'Safety Details',
  dangerPoints: 'Danger Points',
  suggestExecute: 'Execution Advice',
  originalError: 'Original Error',
  plainExplanation: 'Plain Explanation',
  possibleReasons: 'Possible Reasons',
  nextSteps: 'Next Steps',
  severity: 'Severity',
  originalRequest: 'Your Request',
  optimizedPrompt: 'Optimized Prompt',
  improvements: 'Improvements',
  keyTerms: 'Key Terms',
  executionAdvice: 'Execution Advice',

  detectionResult: 'Detection Result',
  recommendedAction: 'Recommended Action',
  analysisContent: 'Analysis',
  nextSuggestions: 'Suggestions',

  mismatchCodeTitle: 'Heads up',
  mismatchCodeMsg: 'This doesn\'t look like code. You may want to use Prompt Optimizer instead.',
  mismatchCommandTitle: 'Heads up',
  mismatchCommandMsg: 'This doesn\'t look like a terminal command. Please paste npm, git, PowerShell, or similar commands before checking safety.',
  mismatchErrorTitle: 'Heads up',
  mismatchErrorMsg: 'This doesn\'t look like an error log. Please paste error messages containing words such as error, failed, exception, or exit code.',
  switchToPrompt: 'Click to switch to Prompt Optimizer',

  dictEmpty: 'No entries yet',

  levelBeginner: 'Beginner',
  levelStandard: 'Standard',
  levelPro: 'Pro',
  langZH: '简体中文',
  langEN: 'English',
  langBilingual: 'Bilingual',
  followUI: 'Follow UI',

  detectNaturalLang: 'Natural Language',
  detectCode: 'Code',
  detectCommand: 'Command',
  detectError: 'Error Log',
  detectMixed: 'Mixed Content',

  noEntries: 'No entries yet',

  toastEmpty: 'Please paste content to analyze first',
  toastCopied: 'Copied to clipboard',
  toastCopyFailed: 'Copy failed — select and Ctrl+C manually',
  toastPromptCopied: 'Optimized prompt copied',
  toastNoResult: 'No results to copy yet',

  explanation: 'Explanation',
  type: 'Type',
  visible: 'Visible',
  yes: 'Yes',
  no: 'No',
  audience: 'Audience',
  developer: 'Developer',
  browser: 'Browser',
  comment: 'Comment',
  method: 'Method',
  arrowFunc: 'Arrow Func',
  typeDef: 'Type Def',
  doctype: 'Doctype',
  root: 'Root',
  head: 'Head',
  meta: 'Meta',
  rootSelector: 'Root Selector',
  variables: 'Variables',
  element: 'Element',
  code: 'Code',
  analysisResult: 'Analysis',
  whatItDoes: 'What It Does',
  cmdBreakdown: 'Command Breakdown',
  outputMeaning: 'Output Meaning',
  errorReason: 'Error Reason',
  howToFix: 'How to Fix',
  deleteFiles: 'Delete Files',
  modifyConfig: 'Modify Config',
  networkAccess: 'Network Access',
  systemAffect: 'System Affect',

  bestNextStep: 'Best Next Step',

  dictCount: 'entries',

  uploadScreenshot: 'Upload Screenshot',
  screenshotOCR: 'Screenshot OCR',
  screenshotPreview: 'Screenshot Preview',
  extractingText: 'Extracting text from screenshot...',
  ocrProgress: 'OCR Progress',
  ocrDone: 'Text extracted. Please review it before running analysis.',
  ocrFailed: 'OCR failed. Try a clearer screenshot or paste the text manually.',
  dropImageHint: 'Drop image to extract text',
  privacyNote: 'Images are processed locally and are not uploaded or stored.',
  qualityHint: 'Clear screenshots improve accuracy. Use high-resolution images and avoid blur, skew, or low contrast.',
  ocrProcessing: 'Processing...',
  clearScreenshot: 'Clear Screenshot',
};

const STRINGS: Record<UILanguage, AppStrings> = { zh: ZH, en: EN };

export function t(lang: UILanguage): AppStrings {
  return STRINGS[lang] || ZH;
}

export function getStrings(lang: UILanguage): AppStrings {
  return STRINGS[lang] || ZH;
}
