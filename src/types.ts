/**
 * Type definitions for AI Agent Command Center v0.2
 */

// ---- Shared ----

export interface LineExplanation {
  line: string;
  meaning: string;
}

export interface WordExplanation {
  word: string;
  meaning: string;
}

export interface SectionExplanation {
  label: string;
  original: string;
  meaning: string;
  type: string;
  role: string;
  displayOnPage: string;
  layman: string;
  caution: string;
}

export type RiskLevel = '低' | '中' | '高' | '极高';

// ---- Mismatch ----

export interface MismatchHint {
  show: boolean;
  message: string;
  suggestedAction: string;
}

// ---- Code Explanation ----

export interface ExplanationResult {
  summary: string;
  sections: SectionExplanation[];
  finalSummary: string;
  lineByLine: LineExplanation[];
  wordByWord: WordExplanation[];
  extra?: string;
  mismatchHint?: MismatchHint;
}

// ---- Command Safety ----

export interface SafetyResult {
  summary: string;
  willDeleteFiles: string;
  willModifyConfig: string;
  willAccessNetwork: string;
  willAffectSystem: string;
  riskLevel: RiskLevel;
  suggestion: string;
  dangerPoints: string[];
  lineByLine: LineExplanation[];
  wordByWord: WordExplanation[];
  mismatchHint?: MismatchHint;
}

// ---- Error Explanation ----

export interface ErrorExplanation {
  original: string;
  plainChinese: string;
  possibleReasons: string[];
  nextSteps: string[];
  severity: '不严重' | '一般' | '严重' | '非常严重';
  mismatchHint?: MismatchHint;
}

// ---- Prompt Optimization ----

export interface PromptOptimization {
  original: string;
  optimized: string;
  improvements: string[];
}

// ---- Smart Analysis ----

export type DetectionType = 'naturalLang' | 'code' | 'command' | 'error' | 'mixed';

export interface SmartAnalysisResult {
  detectionType: DetectionType;
  detectionLabel: string;
  recommendedAction: 'optimizePrompt' | 'explainCode' | 'explainSafety' | 'explainError';
  recommendedLabel: string;
  codeResult?: ExplanationResult;
  safetyResult?: SafetyResult;
  errorResult?: ErrorExplanation;
  promptResult?: PromptOptimization;
  summary: string;
  suggestions: string[];
}

// ---- Dictionary ----

export interface DictionaryEntry {
  word: string;
  meaning: string;
  learnedAt: string;
}

// ---- Webview <-> Extension Messages ----

export type FeatureType =
  | 'smartAnalyze'
  | 'explainCode'
  | 'explainSafety'
  | 'explainError'
  | 'optimizePrompt'
  | 'loadDictionary'
  | 'updateSettings';

export interface PanelMessage {
  type: FeatureType | 'ocrResult' | 'ocrImage';
  text?: string;
  settings?: Record<string, string>;
  imageBase64?: string;
  fileName?: string;
}

// ---- OCR ----

export type OcrState = 'idle' | 'processing' | 'done' | 'error';
