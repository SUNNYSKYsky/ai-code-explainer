/**
 * Settings state for AI Agent Command Center v0.2
 *
 * Persisted in VS Code ExtensionContext.globalState.
 * Simplified: no TargetAI, no PromptLanguage.
 */

import * as vscode from 'vscode';
import type { UILanguage, OutputLanguage, ExplanationLevel } from './i18n';

export interface UserSettings {
  uiLanguage: UILanguage;
  outputLanguage: OutputLanguage;
  explanationLevel: ExplanationLevel;
}

const DEFAULT_SETTINGS: UserSettings = {
  uiLanguage: 'zh',
  outputLanguage: 'followUI',
  explanationLevel: 'standard',
};

const STORAGE_KEY = 'ai-agent-cabin.settings';

export class Settings {
  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  get(): UserSettings {
    const stored = this.context.globalState.get<UserSettings>(STORAGE_KEY);
    if (stored) {
      return { ...DEFAULT_SETTINGS, ...stored };
    }
    return { ...DEFAULT_SETTINGS };
  }

  async update(partial: Partial<UserSettings>): Promise<UserSettings> {
    const current = this.get();
    const updated: UserSettings = { ...current, ...partial };
    await this.context.globalState.update(STORAGE_KEY, updated);
    return updated;
  }

  async reset(): Promise<UserSettings> {
    await this.context.globalState.update(STORAGE_KEY, DEFAULT_SETTINGS);
    return { ...DEFAULT_SETTINGS };
  }
}
