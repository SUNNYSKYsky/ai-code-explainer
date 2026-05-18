# AI Agent Command Center · AI Agent 中文驾驶舱

> Understand what AI is doing. Tell AI exactly what you want.
> 让不会代码的人，也能看懂 AI 在做什么。

## What is this? / 这是什么？

A VS Code / Cursor extension designed for non-programmers using AI coding tools (Claude Code, Cursor, Codex, Copilot, etc.).

When AI gives you code, commands, or errors you can't understand — this extension translates them into plain language.

一个 VS Code / Cursor 插件，专为非程序员设计。当你看不懂 AI 给你的代码、命令、报错时，它帮你翻译成大白话。

## v0.2 Features / 功能

| Feature / 功能 | Description | Usage |
|------|------|---------|
| 🔍 Smart Analyze / 智能分析 | Auto-detect content type and route to best handler | Select text → Right-click → Smart Analyze |
| 📖 Code Explainer / 解释代码 | Line-by-line, word-by-word code translation | Select code → Right-click → Explain Code |
| 🛡️ Command Safety / 命令安全 | Risk assessment for terminal commands | Select command → Right-click → Check Safety |
| 🐞 Error Translator / 翻译报错 | Translate errors to plain language with solutions | Select error → Right-click → Translate Error |
| ✨ Prompt Optimizer / 优化提示词 | Optimize natural language into AI-ready prompts (8 scenarios) | Type in panel → Optimize |
| 📝 Learning Dictionary / 学习词典 | Auto-accumulate learned programming vocabulary | Auto-displayed in side panel |

## v0.2 What's New

- Bilingual UI (中文 / English) with live language switching
- Smart Analysis main button — auto-detects input type
- 8 prompt optimization scenarios (dev, recommendation, content, report, business, learning, meeting, communication)
- Settings bar: UI language, output language, prompt language, explanation depth, target AI
- Top bar redesign with inline settings controls

## Install (Dev) / 安装（开发模式）

```bash
npm install
npm run compile
# Then press F5 in VS Code to launch Extension Dev Host
```

## 使用方式

### 方式一：右键菜单（最快）
1. 在编辑器里选中代码、命令或报错
2. 点右键，选择对应功能
3. 查看解释结果

### 方式二：驾驶舱面板
1. 点击编辑器右上角图标 或 按 `Ctrl+Shift+P` 输入 "AI Agent 中文驾驶舱"
2. 在输入框中粘贴内容
3. 点击对应功能按钮

## 技术栈

- TypeScript
- VS Code Extension API
- Webview (HTML/CSS/JS)

## MVP 说明

当前为 MVP 版本 (v0.1)，使用内置规则引擎模拟 AI 解释。后续版本将接入真实 LLM API（OpenAI / Claude / DeepSeek）。

## 打包

```bash
npm run package
# 生成 ai-agent-cn-copilot-0.1.0.vsix
```

## 许可证

MIT
