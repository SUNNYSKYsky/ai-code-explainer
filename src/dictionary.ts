/**
 * 学习词典存储
 *
 * 使用 VS Code globalState 持久化存储用户学过的词汇。
 * MVP 阶段数据量小，globalState 完全够用。
 * 后续可升级为本地 JSON 文件或 SQLite。
 */

import * as vscode from 'vscode';
import * as types from './types';

const DICT_KEY = 'ai-agent-cn-copilot.dictionary';

export class Dictionary {
  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  /** 添加一批新词汇（自动去重，已存在的跳过） */
  addEntries(newEntries: types.DictionaryEntry[]): void {
    const current = this.getAll();
    const wordSet = new Set(current.map(e => e.word));

    for (const entry of newEntries) {
      if (!wordSet.has(entry.word)) {
        current.push(entry);
        wordSet.add(entry.word);
      }
    }

    this.save(current);
  }

  /** 获取全部词汇 */
  getAll(): types.DictionaryEntry[] {
    return this.context.globalState.get<types.DictionaryEntry[]>(DICT_KEY, []);
  }

  /** 按关键词搜索 */
  search(keyword: string): types.DictionaryEntry[] {
    const all = this.getAll();
    const kw = keyword.toLowerCase();
    return all.filter(e =>
      e.word.toLowerCase().includes(kw) ||
      e.meaning.toLowerCase().includes(kw)
    );
  }

  /** 清空词典 */
  clear(): void {
    this.context.globalState.update(DICT_KEY, []);
  }

  /** 导出为 JSON 字符串 */
  exportJSON(): string {
    return JSON.stringify(this.getAll(), null, 2);
  }

  private save(entries: types.DictionaryEntry[]): void {
    this.context.globalState.update(DICT_KEY, entries);
  }
}
