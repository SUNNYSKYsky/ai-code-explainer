/**
 * AI Agent 中文驾驶舱 —— VS Code 插件入口
 *
 * 功能：
 * 1. 解释选中的代码（右键 / 命令面板）
 * 2. 解释命令是否安全（右键 / 命令面板）
 * 3. 翻译报错（右键 / 命令面板）
 * 4. 优化大白话为 AI 提示词（右键 / 命令面板）
 * 5. 打开驾驶舱面板
 * 6. 自动积累学习词典
 */

import * as vscode from 'vscode';
import * as types from './types';
import { PanelManager } from './panel';
import { Dictionary } from './dictionary';
import { Settings } from './settings';
import {
  explainCode,
  explainCommandSafety,
  explainError,
  optimizePrompt,
  smartAnalyze,
  extractDictionaryEntries,
} from './explanations';

function getOutputLang(settings: Settings): import('./i18n').OutputLanguage {
  return settings.get().uiLanguage;
}

export function activate(context: vscode.ExtensionContext) {
  const panel = new PanelManager(context);
  const dict = new Dictionary(context);
  const settings = new Settings(context);

  // ================================================
  // 命令 1：解释代码
  // ================================================
  context.subscriptions.push(
    vscode.commands.registerCommand('aiAgentChineseCabin.explainCode', async () => {
      const text = getSelectedText();
      if (!text) {
        vscode.window.showWarningMessage('请先选中要解释的代码，再使用此功能。');
        return;
      }

      const result = explainCode(text, getOutputLang(settings));
      showInPanelOrQuickPick(panel, result, 'explainCode', text, dict);
    })
  );

  // ================================================
  // 命令 2：命令安全分析
  // ================================================
  context.subscriptions.push(
    vscode.commands.registerCommand('aiAgentChineseCabin.explainCommandSafety', async () => {
      const text = getSelectedText();
      if (!text) {
        vscode.window.showWarningMessage('请先选中要分析的命令，再使用此功能。');
        return;
      }

      const result = explainCommandSafety(text, getOutputLang(settings));
      showInPanelOrQuickPick(panel, result, 'explainSafety', text, dict);

      // 如果风险高，弹出额外警告
      if (result.riskLevel === '高' || result.riskLevel === '极高') {
        vscode.window.showWarningMessage(
          `⚠️ 风险等级：${result.riskLevel} —— ${result.suggestion}`,
          '知道了'
        );
      }
    })
  );

  // ================================================
  // 命令 3：翻译报错
  // ================================================
  context.subscriptions.push(
    vscode.commands.registerCommand('aiAgentChineseCabin.explainError', async () => {
      const text = getSelectedText();
      if (!text) {
        vscode.window.showWarningMessage('请先选中报错信息，再使用此功能。');
        return;
      }

      const result = explainError(text, getOutputLang(settings));
      showResultInQuickPick(result);
    })
  );

  // ================================================
  // 命令 4：优化提示词
  // ================================================
  context.subscriptions.push(
    vscode.commands.registerCommand('aiAgentChineseCabin.optimizePrompt', async () => {
      const text = getSelectedText();
      if (!text) {
        vscode.window.showWarningMessage('请先选中要优化的大白话需求，再使用此功能。');
        return;
      }

      const result = optimizePrompt(text, getOutputLang(settings));

      // 直接在通知栏展示优化结果，并允许复制
      const action = await vscode.window.showInformationMessage(
        '✨ 提示词已优化！',
        '查看优化结果',
        '复制到剪贴板'
      );

      if (action === '查看优化结果') {
        panel.feedText(text, 'optimizePrompt');
      } else if (action === '复制到剪贴板') {
        await vscode.env.clipboard.writeText(result.optimized);
        vscode.window.showInformationMessage('✅ 优化后的提示词已复制到剪贴板，可直接粘贴给 AI。');
      }
    })
  );

  // ================================================
  // 命令 5：智能分析（v0.2 新增）
  // ================================================
  context.subscriptions.push(
    vscode.commands.registerCommand('aiAgentChineseCabin.smartAnalyze', async () => {
      const text = getSelectedText();
      if (!text) {
        vscode.window.showWarningMessage('请先选中要分析的内容，再使用智能分析功能。');
        return;
      }

      const result = smartAnalyze(text, { outputLanguage: getOutputLang(settings) });
      const action = await vscode.window.showInformationMessage(
        '🔍 分析完成：' + result.detectionLabel,
        '查看详细结果',
        '复制到剪贴板'
      );

      if (action === '查看详细结果') {
        panel.feedText(text, 'smartAnalyze');
      } else if (action === '复制到剪贴板') {
        await vscode.env.clipboard.writeText(result.summary);
        vscode.window.showInformationMessage('✅ 已复制分析结果到剪贴板。');
      }
    })
  );

  // ================================================
  // 命令 6：打开驾驶舱面板
  // ================================================
  context.subscriptions.push(
    vscode.commands.registerCommand('aiAgentChineseCabin.openPanel', () => {
      panel.open();
    })
  );

  // ================================================
  // 启动时自动打开面板
  // ================================================
  // MVP 阶段注释掉，免得太打扰。
  // panel.open();

  vscode.window.showInformationMessage('🧭 AI Agent Command Center v0.2 已就绪！Right-click text to analyze, or open the side panel.');
}

export function deactivate() {
  // 插件卸载时无需特殊清理。globalState 由 VS Code 自动管理。
}

// ================================================
// 辅助函数
// ================================================

/** 获取编辑器选中的文本 */
function getSelectedText(): string | undefined {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return undefined;

  const selection = editor.selection;
  if (selection.isEmpty) return undefined;

  return editor.document.getText(selection);
}

/** 在 QuickPick 中显示结果（报错翻译专用：轻量提示） */
async function showResultInQuickPick(result: types.ErrorExplanation): Promise<void> {
  const items: vscode.QuickPickItem[] = [
    { label: '🗣️ 大白话解释', description: result.plainChinese },
    { label: '📄 原文', description: result.original },
    ...result.possibleReasons.map((r, i) => ({ label: `🤔 原因${i + 1}`, description: r })),
    ...result.nextSteps.map((s, i) => ({ label: `👉 步骤${i + 1}`, description: s })),
    { label: `📊 严重程度：${result.severity}`, description: '' },
    { label: '📋 复制完整解释', description: '复制到剪贴板' },
  ];

  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: '报错翻译结果',
    matchOnDescription: true,
  });

  if (picked?.label === '📋 复制完整解释') {
    const fullText = formatErrorResult(result);
    await vscode.env.clipboard.writeText(fullText);
    vscode.window.showInformationMessage('✅ 已复制完整解释到剪贴板');
  }
}

/** 在面板中展示结果，同时自动积累词典 */
function showInPanelOrQuickPick(
  panel: PanelManager,
  result: any,
  feature: types.FeatureType,
  text: string,
  dict: Dictionary
): void {
  // 提取词典条目
  const entries = extractDictionaryEntries(result);
  if (entries.length > 0) {
    dict.addEntries(entries);
  }

  // 喂入面板展示
  panel.feedText(text, feature);
}

/** 格式化报错结果为文本 */
function formatErrorResult(result: types.ErrorExplanation): string {
  let text = '';
  text += '【报错翻译】\n\n';
  text += `原文：${result.original}\n\n`;
  text += `大白话解释：${result.plainChinese}\n\n`;
  text += '可能原因：\n';
  for (const r of result.possibleReasons) {
    text += `  - ${r}\n`;
  }
  text += '\n下一步怎么做：\n';
  for (const s of result.nextSteps) {
    text += `  → ${s}\n`;
  }
  text += `\n严重程度：${result.severity}\n`;
  return text;
}
