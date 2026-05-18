/**
 * Mock LLM 解释逻辑
 *
 * MVP 阶段使用规则 + 关键词匹配模拟 AI 解释。
 * 后续接入真实 LLM（OpenAI / Claude / DeepSeek）时，
 * 只需替换每个函数体为 API 调用，类型签名不变。
 */

import * as types from './types';
import type { UserSettings } from './settings';
import type { OutputLanguage } from './i18n';

// ============================================================
// 1. 代码解释
// ============================================================

export function explainCode(code: string, outputLang?: OutputLanguage): types.ExplanationResult {
  const trimmed = code.trim();
  const lang = outputLang || 'zh';

  // Terminal log MUST be checked first — otherwise compiler errors
  // containing "require"/"import" would be misidentified as JS/Python.
  if (isTerminalLog(trimmed)) return explainTerminalLog(trimmed, lang);
  // Shell before JS/Python to prevent command keywords from matching code detectors.
  if (isShell(trimmed)) return explainShell(trimmed, lang);
  if (isCSS(trimmed)) return explainCSS(trimmed, lang);
  // Hybrid (TS/JS + HTML template strings) must be checked before pure HTML
  if (isHybridCode(trimmed)) return explainHybrid(trimmed, lang);
  if (isHTML(trimmed)) return explainHTML(trimmed, lang);
  if (isPython(trimmed)) return explainPython(trimmed, lang);
  if (isJSON(trimmed)) return explainJSON(trimmed, lang);
  if (isJS(trimmed)) return explainJS(trimmed, lang);

  const result = genericExplain(trimmed, lang);
  if (!isCodeLike(trimmed)) {
    result.mismatchHint = {
      show: true,
      message: '',
      suggestedAction: 'optimizePrompt',
    };
  }
  return result;
}

function isHybridCode(code: string): boolean {
  const hasTS = /\b(private|public|protected|class\s+\w+|interface\s+\w+|:\s*(string|void|number|boolean|any)\b|const\s+\w+\s*=|let\s+\w+\s*=|=>|import\s+.*\s+from|export\s+(default\s+)?|function\s+\w+\s*\()/i.test(code);
  const hasHTML = /<\/?[a-z][\s\S]*?>/i.test(code) || /<![Dd][Oo][Cc][Tt][Yy][Pp][Ee]/.test(code);
  return hasTS && hasHTML;
}

function isCSS(code: string): boolean {
  return /[{;]\s*(color|padding|margin|font|background|border|width|height|display|flex|grid)/i.test(code);
}

function isHTML(code: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(code) || /<div|<span|<p|<a\s|<img|<h[1-6]/i.test(code);
}

function isJS(code: string): boolean {
  // Only match if there are strong JS/TS syntax signals, not just keywords that
  // can appear in error messages or documentation.
  const hasCompilerError = /error\s+TS\d+|\(\d+,\d+\):\s*error|Exit code/i.test(code);
  if (hasCompilerError) return false;

  // Require at least one structural JS/TS pattern
  return /\b(const |let |var |function\s+\w+\s*\(|=>\s*\{|console\.log\(|document\.\w+)\b/i.test(code)
      || /\b(private|public|protected)\s+\w+\s*\(/.test(code)
      || /\bimport\s+.*\s+from\s+['"]/.test(code)
      || /\bexport\s+(default\s+|const\s+|function\s+|class\s+|interface\s+|type\s+)/.test(code)
      || /\bclass\s+\w+\s*\{/.test(code)
      || /\)\s*:\s*(string|void|number|boolean|any)\b/.test(code);
}

function isPython(code: string): boolean {
  return /\b(def |import |print\(|class |if __name__|from \w+ import)\b/.test(code);
}

function isJSON(code: string): boolean {
  return /^\s*[{\[]/.test(code) && /[}\]]\s*$/.test(code);
}

function isShell(code: string): boolean {
  return /\b(npm |npx |tsc |pnpm |yarn |git |docker |cd |ls |mkdir |rm |cp |mv |curl |wget |pip |python |node |Remove-Item|Get-|Set-)/i.test(code) && !isTerminalLog(code);
}

// ---- Mismatch detection ----
function isCodeLike(text: string): boolean {
  return isCSS(text) || isHTML(text) || isPython(text) || isJSON(text) || isJS(text) || isShell(text) || isTerminalLog(text) || isHybridCode(text);
}

function isCommandLike(text: string): boolean {
  return /\b(npm |npx |tsc |pnpm |yarn |git |docker |cd |ls |mkdir |rm |cp |mv |curl |wget |pip |python |node |Remove-Item|Get-|Set-|cmd |dir |del |copy |move |echo |cat |chmod |chown |sudo |\.\/|\.\.\/|\\\\)/i.test(text);
}

function isErrorLike(text: string): boolean {
  return /(error|Error|ERROR|fail|Fail|FAIL|exception|Exception|EXCEPTION|fatal|Fatal|FATAL|Traceback|stack trace|Cannot find|not found|permission denied|access denied|syntax error|unexpected token|npm ERR!|exit code [1-9]|TS\d{3,5}|ReferenceError|TypeError|SyntaxError|Module not found|unknown option)/i.test(text);
}

// ---------------------------------------------------------------------------
// Terminal + compiler/build-log detector & explainer
// ---------------------------------------------------------------------------

function isTerminalLog(code: string): boolean {
  const hasCommand = /\b(cd |npx |tsc |npm |pnpm |yarn |node |python3? |pip3? )\b/i.test(code);
  const hasErrorOutput = /(Exit code|exit code [1-9]|error\s+TS\d+|error\[\w+\]|:\s*error\s|Cannot find name|Module not found|compilation)/i.test(code);
  const hasFileError = /src\/[\w\/\-\.]+\(\d+,\d+\)/i.test(code);
  return hasCommand && (hasErrorOutput || hasFileError);
}

// --------------- 混合代码（TS/JS + HTML 模板字符串） ---------------
function explainHybrid(code: string, lang: OutputLanguage): types.ExplanationResult {
  const lines = code.split('\n');
  const lineByLine: types.LineExplanation[] = [];
  let inStyle = false;
  let inScript = false;
  let inTemplateString = false;

  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;

    // Track template-string boundaries
    if (/return\s+`/.test(t)) inTemplateString = true;
    if (inTemplateString && /^\s*`\s*;?\s*$/.test(t)) inTemplateString = false;

    // ---- 1. TypeScript block comment ----
    if (/^\s*\/\*\*/.test(t)) {
      const docHint = t.replace(/^\s*\/\*\*\s*/, '').replace(/\s*\*\/\s*$/, '');
      lineByLine.push({
        line: t,
        meaning: '这是 TypeScript 里的文档注释（JSDoc）。它不会被程序执行，也不会显示在页面上。它是写给开发者看的' + (docHint ? `，用来说明：${docHint}` : '，用来描述下面紧跟的代码。')
      });
      continue;
    }
    if (/^\s*\*[^\/]/.test(t)) {
      const hint = t.replace(/^\s*\*\s*/, '');
      lineByLine.push({
        line: t,
        meaning: '这是上面注释的延续行。' + (hint ? `内容：${hint}` : '') + '。它不会执行，仅供开发者阅读。'
      });
      continue;
    }
    if (/^\s*\*\/\s*$/.test(t)) {
      lineByLine.push({ line: t, meaning: '注释结束标记。到此为止，上面的注释内容结束。' });
      continue;
    }
    if (/^\s*\/\//.test(t)) {
      const hint = t.replace(/^\s*\/\/\s*/, '');
      lineByLine.push({
        line: t,
        meaning: '这是 TypeScript / JavaScript 行内注释。' + (hint ? `说明：${hint}` : '') + '。只给开发者看，不执行，也不显示在页面上。'
      });
      continue;
    }

    // ---- 2. TypeScript method / function definition ----
    if (/\b(private|public|protected)\s+\w+\s*\(.*\)\s*(:\s*\w+)?\s*\{?\s*$/.test(t)) {
      const visibility = t.match(/\b(private|public|protected)\b/)?.[1] || '';
      const methodName = t.match(/(?:private|public|protected)\s+(\w+)/)?.[1] || '';
      const returnType = t.match(/\(.*\)\s*:\s*(\w+)/)?.[1] || '';
      const params = t.match(/\(([^)]*)\)/)?.[1] || '';

      const visCN: Record<string, string> = { 'private': '私有', 'public': '公开', 'protected': '受保护' };
      let meaning = `这是 TypeScript 类里的${visCN[visibility] || visibility}方法定义。`;
      if (visibility) meaning += `${visibility} 表示这个方法${visibility === 'private' ? '只能在当前类内部使用，外部无法访问' : visibility === 'public' ? '可以在任何地方被访问' : '只能在本类及子类中访问'}。`;
      if (methodName) meaning += `「${methodName}」是方法名，意思是"${methodName.replace(/([A-Z])/g, ' $1').trim()}"。`;
      if (params) meaning += `括号里是参数：${params || '无参数'}。`;
      if (returnType) meaning += `「: ${returnType}」表示这个方法会返回一个${returnType === 'string' ? '字符串（文本）' : returnType === 'void' ? '空值（不返回任何东西）' : returnType + '类型的数据'}。`;
      meaning += `这个方法的作用是生成 Webview 面板要显示的 HTML 页面内容。`;

      lineByLine.push({ line: t, meaning });
      continue;
    }

    // Arrow function / const method
    if (/\b(const|let|var)\s+\w+\s*=\s*(\([^)]*\)|[^=]\w+)\s*=>/.test(t) ||
        /\b(const|let|var)\s+\w+\s*=\s*(async\s+)?\([^)]*\)\s*(:\s*\w+)?\s*=>/.test(t)) {
      const varName = t.match(/(?:const|let|var)\s+(\w+)/)?.[1] || '';
      lineByLine.push({
        line: t,
        meaning: `这是 TypeScript 里的箭头函数，赋值给常量「${varName}」。它不是页面内容，是给程序执行的逻辑代码。${varName ? `「${varName}」是一个函数，被调用时会执行箭头后面的代码。` : ''}`
      });
      continue;
    }

    // Generic function definition (function keyword)
    if (/^\s*(export\s+)?(async\s+)?function\s+\w+\s*\(/.test(t)) {
      const fnName = t.match(/function\s+(\w+)/)?.[1] || '';
      lineByLine.push({
        line: t,
        meaning: `这是定义了一个名为「${fnName}」的函数。函数是一段可以被重复调用的代码块，${fnName ? `"${fnName}" 表示${fnName.replace(/([A-Z])/g, ' $1').trim()}的意思。` : ''}这是给程序执行的逻辑，不会直接显示在页面上。`
      });
      continue;
    }

    // class definition
    if (/^\s*(export\s+)?class\s+\w+/.test(t)) {
      const className = t.match(/class\s+(\w+)/)?.[1] || '';
      lineByLine.push({
        line: t,
        meaning: `这是定义一个 TypeScript 类「${className}」。类是代码的组织单位，把相关的属性和方法放在一起。这是程序的骨架结构，不会显示在页面上。`
      });
      continue;
    }

    // import / export statements
    if (/^\s*import\s+/.test(t) || /^\s*export\s+(default\s+)?/.test(t) || /^\s*export\s+\{/.test(t)) {
      lineByLine.push({
        line: t,
        meaning: '这是模块导入/导出语句。它告诉 TypeScript 这个文件需要用到哪些外部代码，或者把哪些代码暴露给其他文件使用。这只影响代码组织结构，不会显示在页面上。'
      });
      continue;
    }

    // ---- 3. return 语句 ----
    if (/^\s*return\s+`/.test(t)) {
      const afterReturn = t.replace(/^\s*return\s+`/, '').trim();
      let meaning = '这是 return 语句，表示这个函数执行完毕后，把后面的内容返回给调用方。反引号（`）表示这里开始了一段多行模板字符串——可以在里面直接写 HTML 代码。';
      if (afterReturn.length > 0) {
        if (/<![Dd][Oo][Cc][Tt][Yy][Pp][Ee]/.test(afterReturn)) {
          meaning += ` ${afterReturn} 是 HTML5 文档声明，告诉浏览器用现代标准解析页面。它不会显示在页面上。`;
        } else {
          meaning += ` 后面的「${afterReturn}」是模板字符串里的 HTML 内容。`;
        }
      }
      lineByLine.push({ line: t, meaning });
      inTemplateString = true;
      continue;
    }

    if (/^\s*return\b(?!\s*`)/.test(t)) {
      lineByLine.push({
        line: t,
        meaning: '这是 return 语句，表示结束当前函数并把后面的结果返回给调用方。这是程序的流程控制，不会显示在页面上。'
      });
      continue;
    }

    // ---- 4. Template-string closing ----
    if (/^\s*`\s*;?\s*$/.test(t) && inTemplateString) {
      lineByLine.push({
        line: t,
        meaning: '反引号（`）表示模板字符串到此结束。后面的分号（;）是语句结束符。从这一行之后，代码回到正常的 TypeScript 语法。'
      });
      inTemplateString = false;
      continue;
    }

    // ---- 5. HTML doctype ----
    if (/<![Dd][Oo][Cc][Tt][Yy][Pp][Ee]\s+html/i.test(t)) {
      lineByLine.push({
        line: t,
        meaning: '这是 HTML5 文档声明。它不会显示在页面上，而是告诉浏览器"请用最新的 HTML5 标准来解析这个页面"。每个 HTML 文件开头都应该有这一行。'
      });
      continue;
    }

    // ---- 6. HTML root element ----
    if (/<html/i.test(t) && !/<\/html>/i.test(t)) {
      const langMatch = t.match(/lang="([^"]+)"/);
      let meaning = '这是 HTML 页面的根标签。所有网页内容都必须放在 <html> 里面。这是给浏览器看的结构标记，不会直接显示在页面上。';
      if (langMatch) meaning += ` lang="${langMatch[1]}" 表示页面的主要语言是${langMatch[1] === 'zh-CN' ? '简体中文' : langMatch[1]}，有利于浏览器翻译、搜索引擎收录和辅助阅读工具（屏幕朗读器）正确识别语言。`;
      lineByLine.push({ line: t, meaning });
      continue;
    }

    // ---- 7. head section ----
    if (/<head>/i.test(t) && !/<\/head>/i.test(t)) {
      lineByLine.push({
        line: t,
        meaning: '这是 HTML 的 <head> 区域开始标签。head 里面通常放页面标题（title）、字符编码（meta charset）、样式引用（CSS）、脚本引用等元信息。head 里的大部分内容不会直接显示在页面主体中，它们是给浏览器和搜索引擎看的配置信息。'
      });
      continue;
    }
    if (/<\/head>/i.test(t)) {
      lineByLine.push({ line: t, meaning: 'head 区域结束。从这里开始，后面的内容就属于页面主体了。' });
      continue;
    }

    // ---- 8. meta tags ----
    if (/<meta\b/i.test(t)) {
      const charset = t.match(/charset="([^"]+)"/);
      const name = t.match(/name="([^"]+)"/);
      const content = t.match(/content="([^"]+)"/);
      let meaning = '这是 HTML 的 <meta> 标签，用于设置页面的元信息（给浏览器和搜索引擎看的数据）。它不会显示在页面上。';
      if (charset) {
        meaning = `这是设置页面字符编码为 ${charset[1]}。${charset[1]} 是一种通用编码，支持中文、英文、符号、emoji 等内容，避免中文乱码。这行不会显示在页面上。`;
      } else if (name && content) {
        const nameMap: Record<string, string> = {
          'viewport': '视口设置',
          'description': '页面描述',
          'keywords': '关键词',
          'author': '作者信息',
        };
        meaning = `这是设置「${nameMap[name[1]] || name[1]}」。content 里的值是「${content[1]}」。`;
        if (name[1] === 'viewport') {
          meaning += ' 它控制页面在手机等不同设备上的缩放和显示方式，不会显示在页面内容中。';
        }
      }
      lineByLine.push({ line: t, meaning });
      continue;
    }

    // ---- 9. title tag ----
    if (/<title>/i.test(t) || (/<title>/i.test(t) && /<\/title>/i.test(t))) {
      const titleText = t.replace(/<\/?title>/gi, '').trim();
      lineByLine.push({
        line: t,
        meaning: `这是页面的标题标签。「${titleText}」会显示在浏览器标签页上，也会出现在搜索引擎结果里。它不会显示在页面正文中，但它决定了别人在浏览器标签上看到什么。`
      });
      continue;
    }

    // ---- 10. style block ----
    if (/<style>/i.test(t) && !/<\/style>/i.test(t)) {
      inStyle = true;
      lineByLine.push({
        line: t,
        meaning: '这是 HTML 里的 <style> 标签，表示从这里开始写 CSS 样式代码。style 里面的内容不会直接显示在页面上，它们控制的是页面元素的外观（颜色、大小、间距等）。'
      });
      continue;
    }
    if (/<\/style>/i.test(t)) {
      inStyle = false;
      lineByLine.push({ line: t, meaning: 'style 区域结束。之后回到 HTML 结构。' });
      continue;
    }

    // ---- 11. CSS inside style block ----
    if (inStyle) {
      if (/^\s*\}?\s*$/.test(t)) {
        lineByLine.push({ line: t, meaning: 'CSS 代码块的结束标记（右大括号），表示一组样式规则到此结束。' });
      } else if (t.startsWith(':root')) {
        lineByLine.push({
          line: t,
          meaning: '这是 CSS 的 :root 伪类选择器，代表整个页面的根元素（通常就是 <html>）。在 :root 里面定义的 CSS 变量可以在整个页面的任何地方使用。它不产生可见内容，只定义全局可用的设计参数。'
        });
      } else if (t.startsWith('--') && t.includes(':')) {
        const varMatch = t.match(/(--[\w-]+)\s*:\s*(.+?);?\s*$/);
        if (varMatch) {
          const varName = varMatch[1];
          const varValue = varMatch[2].replace(/;$/, '').trim();
          let meaning = `这是定义一个 CSS 自定义属性（也叫 CSS 变量），名字是「${varName}」。`;
          if (/var\(--/.test(varValue)) {
            const refMatch = varValue.match(/var\((--[\w-]+)(?:,\s*(.+?))?\)/);
            if (refMatch) {
              meaning += `它的值引用了另一个 CSS 变量「${refMatch[1]}」${refMatch[2] ? `，如果那个变量不存在就用备用值「${refMatch[2]}」` : ''}。`;
            }
          } else {
            meaning += `它的值是「${varValue}」。`;
          }
          meaning += ' CSS 变量不会直接显示在页面上，但它们控制着整个页面的配色、间距等视觉风格。改一个变量值，所有引用它的地方都会跟着变。';
          lineByLine.push({ line: t, meaning });
        } else {
          lineByLine.push({ line: t, meaning: 'CSS 样式规则。定义页面元素的视觉外观，不会显示为页面文字。' });
        }
      } else if (t.includes('{')) {
        const sel = t.replace(/\s*\{.*$/, '').trim();
        lineByLine.push({
          line: t,
          meaning: `CSS 选择器「${sel}」，选中页面中对应的元素，准备给它设置样式。大括号里面是具体的样式属性。这是样式代码，不会显示在页面上。`
        });
      } else if (t.includes(':') && !t.startsWith(':')) {
        const [prop, val] = t.replace(/;$/, '').split(':').map(s => s.trim());
        const propCN = cssPropertyCN(prop);
        const valCN = cssValueCN(prop, val);
        lineByLine.push({
          line: t,
          meaning: `${propCN}：设为 ${valCN}。这控制页面元素的视觉效果，不产生可见的文字内容。`
        });
      } else {
        lineByLine.push({ line: t, meaning: 'CSS 样式代码，控制页面外观，不会显示为页面内容。' });
      }
      continue;
    }

    // ---- 12. script block ----
    if (/<script/i.test(t) && !/<\/script>/i.test(t)) {
      inScript = true;
      lineByLine.push({
        line: t,
        meaning: '这是 HTML 里的 <script> 标签，表示从这里开始写 JavaScript 代码。script 里的内容不会直接显示在页面上，它们负责页面的交互逻辑（点击、输入、数据加载等）。'
      });
      continue;
    }
    if (/<\/script>/i.test(t)) {
      inScript = false;
      lineByLine.push({ line: t, meaning: 'script 区域结束。之后回到 HTML 结构。' });
      continue;
    }

    // ---- 13. HTML visible content tags ----
    if (/<(h[1-6]|p|button|a\s|span|div|input|textarea|img|ul|ol|li|table|form|section|header|footer|nav|main|article|strong|em|b\b|i\b|label|select|option|br|hr)[^>]*>/i.test(t) && !/<\/html>/i.test(t)) {
      const tagMatch = t.match(/<(\w+)/);
      const tagName = tagMatch?.[1] || '';
      const tagCN: Record<string, string> = {
        'h1': '一级标题', 'h2': '二级标题', 'h3': '三级标题', 'h4': '四级标题', 'h5': '五级标题', 'h6': '六级标题',
        'p': '段落', 'button': '按钮', 'a': '超链接', 'span': '行内文字', 'div': '容器/盒子',
        'input': '输入框', 'textarea': '多行文本输入', 'img': '图片',
        'ul': '无序列表', 'ol': '有序列表', 'li': '列表项', 'section': '页面区块',
        'header': '页头区域', 'footer': '页尾区域', 'nav': '导航栏',
        'main': '主要内容区', 'strong': '加粗文字', 'em': '强调文字', 'label': '标签文字',
        'br': '换行', 'hr': '分隔线',
      };
      // Check if this line contains actual visible text
      const textContent = t.replace(/<[^>]+>/g, '').trim();
      const isVisible = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'button', 'a', 'span', 'label', 'strong', 'em', 'li'].includes(tagName);
      let meaning = `这是 HTML「${tagCN[tagName] || tagName + '元素'}」。`;
      if (isVisible && textContent) {
        meaning += `它会显示在页面上，内容是「${textContent}」。`;
      } else if (tagName === 'div' || tagName === 'section' || tagName === 'header' || tagName === 'footer' || tagName === 'nav' || tagName === 'main') {
        meaning += '它是页面结构的容器，用于组织和布局其他元素。它本身不直接显示内容，但它包裹的子元素会显示。';
      } else {
        meaning += '它定义了页面的结构或交互元素。';
      }
      lineByLine.push({ line: t, meaning });
      continue;
    }

    // ---- 14. HTML close tags (catch remaining) ----
    if (/^\s*<\/\w+>/.test(t)) {
      const closeTag = t.match(/<\/(\w+)>/)?.[1] || '';
      lineByLine.push({
        line: t,
        meaning: `这是「${closeTag}」元素的结束标签。它表示这个 HTML 元素到此结束，后面的内容不再属于这个元素。`
      });
      continue;
    }

    // ---- 15. Opening brace / closing brace (code block) ----
    if (/^\s*\{\s*$/.test(t)) {
      lineByLine.push({
        line: t,
        meaning: '左大括号，表示一个代码块的开始。在 TypeScript 中，它标记函数体、类体或条件/循环体的开始。这是程序语法结构，不会显示在页面上。'
      });
      continue;
    }
    if (/^\s*\}\s*$/.test(t) || /^\s*\}[,;]?\s*$/.test(t)) {
      lineByLine.push({
        line: t,
        meaning: '右大括号，表示一个代码块到此结束。它可能是函数、类、if/for 语句或 CSS 规则集的结束标记。这是程序语法结构，不会显示在页面上。'
      });
      continue;
    }

    // ---- 16. Otherwise in template string, check generic HTML ----
    if (inTemplateString) {
      if (/^\s*<[a-z]/i.test(t)) {
        const tag = t.match(/<(\w+)/)?.[1] || '';
        lineByLine.push({
          line: t,
          meaning: `这是 HTML「${tag}」标签，定义页面结构的一部分。它是给浏览器解析用的标记语言，${/h[1-6]|p|span|a\b|button|li/i.test(tag) ? '里面的文字会显示在页面上' : '大部分不会直接显示为页面文字'}。`
        });
      } else {
        // Text content in template string
        lineByLine.push({
          line: t,
          meaning: '这是模板字符串里的文字内容，最终会出现在页面上。'
        });
      }
      continue;
    }

    // ---- 17. console.log / debug ----
    if (/\bconsole\.(log|warn|error|debug)\(/i.test(t)) {
      lineByLine.push({
        line: t,
        meaning: '这是调试输出语句。它在浏览器或终端的开发者控制台里打印信息，普通用户看不到。程序员用它来排查问题。'
      });
      continue;
    }

    // ---- 18. if / for / while statements ----
    if (/^\s*(if|for|while|switch|try|catch)\b/.test(t)) {
      const kw = t.match(/^\s*(if|for|while|switch|try|catch)\b/)?.[1] || '';
      const kwCN: Record<string, string> = {
        'if': '条件判断', 'for': '循环', 'while': '循环', 'switch': '多分支判断', 'try': '异常捕获', 'catch': '异常处理'
      };
      lineByLine.push({
        line: t,
        meaning: `这是 ${kwCN[kw] || kw} 语句。它控制程序的执行流程，决定哪些代码在什么条件下运行。这是逻辑控制代码，不会显示在页面上。`
      });
      continue;
    }

    // ---- 19. TypeScript type annotations / interface ----
    if (/^\s*(interface|type|enum)\s+\w+/i.test(t)) {
      lineByLine.push({
        line: t,
        meaning: '这是 TypeScript 的类型定义。它描述了数据的形状（有哪些属性、什么类型），只在编译时存在，编译后会被删除，不影响运行时的页面显示。'
      });
      continue;
    }

    // ---- 20. variable declaration ----
    if (/^\s*(const|let|var)\s+/.test(t)) {
      const declName = t.match(/(?:const|let|var)\s+(\w+)/)?.[1] || '';
      lineByLine.push({
        line: t,
        meaning: `这是声明一个变量「${declName}」。变量是用来存储数据的容器，${t.includes('=') ? '等号后面是赋给它的值' : '还没有给它赋值'}。这是程序逻辑代码，不会显示在页面上。`
      });
      continue;
    }

    // ---- 21. Fallback ----
    if (inTemplateString) {
      lineByLine.push({
        line: t,
        meaning: '模板字符串中的内容，可能是 HTML 标签或最终会显示在页面上的文字。'
      });
    } else if (/[{;]\s*(color|padding|margin|font|background|border|width|height|display|flex|grid)/i.test(t)) {
      lineByLine.push({ line: t, meaning: 'CSS 样式代码。控制页面元素的外观，不直接显示为内容。' });
    } else {
      lineByLine.push({
        line: t,
        meaning: '这是 TypeScript / JavaScript 程序代码。它负责程序的逻辑和功能，不会直接显示在页面上。'
      });
    }
  }

  // Build summary
  const hasTsMethod = /\b(private|public|protected)\s+\w+\s*\(/.test(code);
  const hasReturn = /return\s+`/.test(code);
  const hasCSSVars = /--[\w-]+\s*:/.test(code);
  const hasMeta = /<meta\b/i.test(code);

  let summary = '';
  if (hasTsMethod && hasReturn) {
    summary = '这段代码是一个 TypeScript 方法，它返回一段 HTML 字符串用于构建 Webview 面板。里面混合了 TypeScript 逻辑、HTML 页面结构、CSS 样式定义。';
  } else if (hasTsMethod) {
    summary = '这是 TypeScript 代码，包含类方法定义和 HTML 模板字符串。';
  } else {
    summary = '这是一段混合代码，包含 TypeScript/JavaScript 逻辑和 HTML 模板字符串。';
  }

  // Word by word
  const wordByWord = extractWordsFromInput(code, lang);
  // Ensure relevant TS/HTML keywords are included
  const extraWords: [string, string][] = [];
  if (hasTsMethod) {
    extraWords.push(['private', '访问修饰符，表示只能在当前类内部使用']);
    extraWords.push(['buildHTML', '方法名，意思是"构建 HTML"']);
    extraWords.push(['string', '字符串类型，表示返回的是文本数据']);
  }
  if (hasReturn) {
    extraWords.push(['return', '返回语句，把结果从函数里传出去']);
    extraWords.push(['`', '反引号，用于创建多行模板字符串']);
  }
  if (/<![Dd][Oo][Cc][Tt][Yy][Pp][Ee]/.test(code)) {
    extraWords.push(['<!DOCTYPE html>', 'HTML5 文档声明，告诉浏览器这是现代网页']);
  }
  if (/lang="/.test(code)) {
    extraWords.push(['lang="zh-CN"', '语言设置为简体中文']);
  }
  if (hasMeta) {
    extraWords.push(['<meta>', 'HTML 元信息标签，给浏览器和搜索引擎看的配置']);
    extraWords.push(['charset', '字符编码设置']);
    extraWords.push(['viewport', '视口设置，控制移动端显示']);
  }
  if (/<title>/i.test(code)) {
    extraWords.push(['<title>', '页面标题标签，显示在浏览器标签页上']);
  }
  if (hasCSSVars) {
    extraWords.push([':root', 'CSS 根元素选择器，定义全局 CSS 变量']);
    extraWords.push(['--bg', 'CSS 变量，存储背景颜色值']);
    extraWords.push(['var()', 'CSS 函数，引用已定义的 CSS 变量']);
  }
  for (const [w, m] of extraWords) {
    if (!wordByWord.some(e => e.word === w)) {
      wordByWord.push({ word: w, meaning: m });
    }
  }

  let extra = '这段代码影响的是 VS Code 插件的 Webview 面板页面结构。\n';
  extra += 'TypeScript 部分决定了"生成什么 HTML"，HTML 部分决定了"页面长什么样"，CSS 部分决定了"外观配色"。\n';
  extra += '修改 TypeScript 逻辑会影响面板的生成方式，修改 HTML 结构会影响面板的布局，修改 CSS 变量会影响整个面板的视觉风格。\n\n';
  extra += '新手学习点：\n';
  extra += '1. 这段代码展示了 TypeScript 的类方法如何返回 HTML 模板字符串——这是 VS Code 插件 Webview 开发的常见模式。\n';
  extra += '2. <!DOCTYPE html>、<head>、<meta> 这些是每个网页都必须有的基础结构，它们是给浏览器看的，不是给用户看的。\n';
  extra += '3. CSS 变量（如 --bg）是一种"一处定义、全局生效"的设计工具，修改一个变量就能改变整个页面的配色。\n';
  extra += '4. 注释（/** ... */）只给开发者看，程序完全忽略它们。';

  const sections = buildSections(lineByLine);
  const finalSummary = buildFinalSummary(sections, 'TypeScript + HTML 混合代码', lang);
  return { summary, sections, finalSummary, lineByLine, wordByWord, extra };
}

// ---- Comprehensive known-words dictionary ----
const WORD_CN: Record<string, string> = {
  // Shell / terminal
  'cd': '进入/切换文件夹',
  '&&': '前面的命令成功后，再执行后面的命令',
  '||': '前面的命令失败时，才执行后面的命令',
  '|': '管道符，把前一个命令的输出传给后一个命令',
  '>': '重定向输出，把结果写入文件（会覆盖原文件）',
  '>>': '追加重定向，把结果追加到文件末尾',
  '2>&1': '把错误信息和正常输出合并在一起显示',
  '&': '让命令在后台运行',
  './': '当前目录',
  '../': '上一级目录',
  '~': '当前用户的个人目录',
  '$env:USERPROFILE': '当前 Windows 用户目录，如 C:\\Users\\你的用户名',
  'npx': '调用当前项目里安装的 npm 工具，不需要全局安装',
  'tsc': 'TypeScript 编译器，把 .ts 文件编译成 .js 文件，同时做类型检查',
  'npm': 'Node.js 的包管理器',
  'pnpm': 'Node.js 的包管理器（更快版）',
  'yarn': 'Node.js 的包管理器',
  'pip': 'Python 的包安装工具',
  'pip3': 'Python 3 的包安装工具',
  'git': '版本控制工具，管理代码历史',
  'docker': '容器工具，把程序和环境打包在一起运行',
  'node': '运行 JavaScript 程序的引擎',
  'python': '运行 Python 程序的解释器',
  'python3': 'Python 3 解释器',
  'mkdir': '创建新文件夹',
  'rm': '删除文件或文件夹',
  'cp': '复制文件或文件夹',
  'mv': '移动/重命名文件或文件夹',
  'ls': '列出当前目录下的文件和文件夹',
  'curl': '从互联网下载或发送数据',
  'wget': '从互联网下载文件',
  'sudo': '以管理员/超级用户权限执行（Linux / Mac）',
  '-p': '指定项目配置文件（配合 tsc 使用时，指 tsconfig.json）',
  '-r': '递归处理（连同子文件夹一起操作）',
  '-f': '强制执行，不询问确认',
  '-Force': '强制执行，跳过确认步骤',
  '-Recurse': '递归处理，包含子文件夹及其中所有内容',
  '--force': '强制执行',
  '--yes': '自动回答"是"',
  '-y': '自动确认',
  'Remove-Item': 'PowerShell 中删除文件或文件夹的命令',

  // Error / build output
  'Exit code': '命令执行完毕后的退出码。0=成功，非0=出错',
  'Exit code 2': '命令执行失败，退出码为 2（通常表示编译或语法错误）',
  'error': '错误。程序在这一点上不能继续了',
  'error TS': 'TypeScript 编译错误（以 TS 开头）',
  'TS2580': 'TypeScript 错误编号 2580："找不到这个名字"',
  'Cannot find name': '找不到这个名称/变量。TypeScript 不认识你写的这个东西',
  'require': 'Node.js 里用来引入外部模块的写法',
  'import': '引入外部代码/模块（ES 模块标准写法）',
  'export': '把代码暴露出去，让别的文件可以使用',
  '@types/node': 'Node.js 的类型定义包。装了这个包后 TypeScript 才能认识 Node.js 的写法',
  'type definitions': '类型定义文件，告诉 TypeScript 某个库的函数和参数长什么样',
  'src/': '源代码目录，通常项目的 .ts / .js 文件放在这里',
  '.ts': 'TypeScript 源代码文件',
  '.js': 'JavaScript 文件',

  // JS/TS keywords (only when they actually appear)
  'const': '声明一个不可变的变量（常量）',
  'let': '声明一个可以改变值的变量',
  'var': '声明一个变量（旧式写法）',
  'function': '定义一个功能/函数',
  'return': '从函数中返回结果',
  '=>': '箭头函数，写函数的简写方式',
  'console.log': '在控制台打印调试信息',
  'document.': '浏览器里的文档对象，用于操作网页',
  'private': 'TypeScript 访问修饰符，表示只能在当前类内部使用',
  'public': 'TypeScript 访问修饰符，表示可以在任何地方访问',
  'protected': 'TypeScript 访问修饰符，表示只能在本类及子类中访问',
  'class': '定义一个类（代码的组织单位，把属性和方法放在一起）',
  'interface': 'TypeScript 接口，定义数据的结构形状',
  'type': 'TypeScript 类型别名，给类型起一个名字',
  'enum': 'TypeScript 枚举，定义一组命名的常量',
  'string': '字符串类型，表示文本数据',
  'void': '空类型，表示函数不返回任何值',
  'boolean': '布尔类型，只有 true 或 false 两个值',
  'number': '数字类型，表示整数或小数',
  'any': '任意类型，TypeScript 不检查类型',
  'async': '异步函数标记，表示函数内部可以使用 await',
  'await': '等待一个异步操作完成',
  'template string': '模板字符串，用反引号包裹，可以在里面嵌入变量和换行',
  '``': '反引号，用于创建多行模板字符串，可以在里面嵌入 ${变量}',

  // Python keywords
  'def': 'define 的缩写，定义一个函数',
  'print(': '输出信息到屏幕',
  'None': '空值，表示什么都没有',

  // CSS
  'padding': '内边距',
  'margin': '外边距',
  'color': '文字颜色',
  'font-size': '字体大小',
  'font-weight': '字体粗细',
  'background': '背景',
  'border': '边框',
  'width': '宽度',
  'height': '高度',
  'display': '显示方式',
  'flex': '弹性布局',
  'grid': '网格布局',
  '#ffffff': '白色',
  '#000000': '黑色',
  'px': '像素',
  ':root': 'CSS 根元素选择器，通常用于定义全局 CSS 变量',
  'var(': 'CSS 函数，引用已定义的 CSS 变量的值',
  '--bg': 'CSS 自定义属性（变量），存储背景颜色',
  '--vscode-editor-background': 'VS Code 编辑器背景色的 CSS 变量，由 VS Code 主题提供',
  'backdrop-filter': 'CSS 背景滤镜，可以实现毛玻璃等效果',
  'blur(': 'CSS 模糊滤镜函数，让元素后面内容变模糊',

  // HTML keywords
  '<!DOCTYPE html>': 'HTML5 文档声明，告诉浏览器用现代标准解析页面',
  '<html': 'HTML 页面根标签',
  'lang=': '指定页面语言属性',
  'zh-CN': '简体中文的语言代码',
  '<head>': 'HTML 头部区域，放页面元信息',
  '<meta': 'HTML 元信息标签',
  'charset': '字符编码设置',
  'UTF-8': '通用字符编码，支持中文等所有语言',
  '<title>': 'HTML 页面标题标签',
  'viewport': '视口设置，控制移动设备上的显示方式',
  'initial-scale': '页面初始缩放比例',
  '<style>': 'HTML 样式标签，里面写 CSS 代码',
  '<script>': 'HTML 脚本标签，里面写 JavaScript 代码',
  '<div': 'HTML 盒子/容器元素',
  '<span': 'HTML 行内文字元素',
  '<h1': 'HTML 一级标题',
  '<h2': 'HTML 二级标题',
  '<p': 'HTML 段落元素',
  '<button': 'HTML 按钮元素',
  '<input': 'HTML 输入框元素',
};

const WORD_EN: Record<string, string> = {
  'cd': 'Change/switch directory',
  '&&': 'Execute next command only if previous succeeds',
  '||': 'Execute next command only if previous fails',
  '|': 'Pipe — passes output of previous command to next',
  '>': 'Redirect output — write result to file (overwrites)',
  '>>': 'Append redirect — append result to end of file',
  '2>&1': 'Merge error output with standard output',
  '&': 'Run command in background',
  './': 'Current directory',
  '../': 'Parent directory',
  '~': 'Current user home directory',
  '$env:USERPROFILE': 'Current Windows user directory, e.g. C:\\Users\\YourName',
  'npx': 'Run locally installed npm tool, no global install needed',
  'tsc': 'TypeScript compiler — compiles .ts to .js and type-checks',
  'npm': 'Node.js package manager',
  'pnpm': 'Node.js package manager (faster)',
  'yarn': 'Node.js package manager',
  'pip': 'Python package installer',
  'pip3': 'Python 3 package installer',
  'git': 'Version control tool for managing code history',
  'docker': 'Container tool — packages and runs apps with their environment',
  'node': 'JavaScript runtime engine',
  'python': 'Python interpreter',
  'python3': 'Python 3 interpreter',
  'mkdir': 'Create new folder',
  'rm': 'Delete files or folders',
  'cp': 'Copy files or folders',
  'mv': 'Move/rename files or folders',
  'ls': 'List files and folders in current directory',
  'curl': 'Download data from or send data to the internet',
  'wget': 'Download files from the internet',
  'sudo': 'Execute with admin/superuser privileges (Linux/Mac)',
  '-p': 'Specify project config file (with tsc, refers to tsconfig.json)',
  '-r': 'Recursive — operate on subfolders too',
  '-f': 'Force execution without asking for confirmation',
  '-Force': 'Force execution, skip confirmation',
  '-Recurse': 'Recursive — include subfolders and all contents',
  '--force': 'Force execution',
  '--yes': 'Auto-answer "yes"',
  '-y': 'Auto-confirm',
  'Remove-Item': 'PowerShell command to delete files or folders',
  'Exit code': 'Exit code after command finishes. 0=success, non-zero=error',
  'Exit code 2': 'Command failed with exit code 2 (usually compile or syntax error)',
  'error': 'Error — the program cannot continue at this point',
  'error TS': 'TypeScript compilation error (starts with TS)',
  'TS2580': 'TypeScript error code 2580: "Cannot find name"',
  'Cannot find name': 'Cannot find this name/variable. TypeScript does not recognize it',
  'require': 'Node.js syntax for importing external modules',
  'import': 'Import external code/module (ES module standard syntax)',
  'export': 'Expose code so other files can use it',
  '@types/node': 'Node.js type definitions package. After installing, TS recognizes Node.js APIs',
  'type definitions': 'Type definition files telling TS the shape of a library\'s functions and parameters',
  'src/': 'Source code directory — typically contains .ts/.js project files',
  '.ts': 'TypeScript source code file',
  '.js': 'JavaScript file',
  'const': 'Declare an immutable variable (constant)',
  'let': 'Declare a mutable variable',
  'var': 'Declare a variable (legacy syntax)',
  'function': 'Define a function',
  'return': 'Return a result from a function',
  '=>': 'Arrow function — shorthand for writing functions',
  'console.log': 'Print debug info to the console',
  'document.': 'Browser document object, used to manipulate web pages',
  'private': 'TS access modifier — only accessible within the current class',
  'public': 'TS access modifier — accessible anywhere',
  'protected': 'TS access modifier — accessible in this class and subclasses',
  'class': 'Define a class (code organization unit grouping properties and methods)',
  'interface': 'TS interface — defines the shape/structure of data',
  'type': 'TS type alias — give a name to a type',
  'enum': 'TS enum — define a set of named constants',
  'string': 'String type — represents text data',
  'void': 'Void type — function returns nothing',
  'boolean': 'Boolean type — only true or false',
  'number': 'Number type — integer or decimal',
  'any': 'Any type — TS does not type-check',
  'async': 'Async function marker — allows await inside',
  'await': 'Wait for an async operation to complete',
  'template string': 'Template string — wrapped in backticks, can embed variables and newlines',
  '``': 'Backticks — create multi-line template strings, can embed ${variables}',
  'def': 'Define — define a function (Python)',
  'print(': 'Output info to screen (Python)',
  'None': 'Null value — represents nothing (Python)',
  'padding': 'Inner spacing (CSS)',
  'margin': 'Outer spacing (CSS)',
  'color': 'Text color (CSS)',
  'font-size': 'Font size (CSS)',
  'font-weight': 'Font weight/thickness (CSS)',
  'background': 'Background (CSS)',
  'border': 'Border (CSS)',
  'width': 'Width (CSS)',
  'height': 'Height (CSS)',
  'display': 'Display mode (CSS)',
  'flex': 'Flexbox layout (CSS)',
  'grid': 'Grid layout (CSS)',
  '#ffffff': 'White color',
  '#000000': 'Black color',
  'px': 'Pixels',
  ':root': 'CSS root selector — typically used to define global CSS variables',
  'var(': 'CSS function — references the value of a defined CSS variable',
  '--bg': 'CSS custom property (variable) — stores background color',
  '--vscode-editor-background': 'VS Code editor background CSS variable provided by the VS Code theme',
  'backdrop-filter': 'CSS backdrop filter — enables effects like frosted glass',
  'blur(': 'CSS blur filter function — blurs content behind an element',
  '<!DOCTYPE html>': 'HTML5 document declaration — tells browsers to use modern standards',
  '<html': 'HTML page root element',
  'lang=': 'Specifies page language attribute',
  'zh-CN': 'Simplified Chinese language code',
  '<head>': 'HTML head section — contains page meta information',
  '<meta': 'HTML meta info tag',
  'charset': 'Character encoding setting',
  'UTF-8': 'Universal character encoding, supports all languages including Chinese',
  '<title>': 'HTML page title tag',
  'viewport': 'Viewport setting — controls display on mobile devices',
  'initial-scale': 'Initial page zoom level',
  '<style>': 'HTML style tag — contains CSS code',
  '<script>': 'HTML script tag — contains JavaScript code',
  '<div': 'HTML box/container element',
  '<span': 'HTML inline text element',
  '<h1': 'HTML heading level 1',
  '<h2': 'HTML heading level 2',
  '<p': 'HTML paragraph element',
  '<button': 'HTML button element',
  '<input': 'HTML input field element',
};

function lookupWord(word: string, lang?: OutputLanguage): string | undefined {
  const dict = lang === 'en' ? WORD_EN : WORD_CN;
  if (dict[word]) return dict[word];
  for (const [k, v] of Object.entries(dict)) {
    if (k.toLowerCase() === word.toLowerCase()) return v;
  }
  return undefined;
}

/** Tokenize input and return only words found in the dictionary */
function extractWordsFromInput(text: string, lang?: OutputLanguage): types.WordExplanation[] {
  const seen = new Set<string>();
  const result: types.WordExplanation[] = [];
  const en = lang === 'en';
  const dict = en ? WORD_EN : WORD_CN;

  for (const [word, meaning] of Object.entries(dict)) {
    if (word.length < 2) continue;
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(escaped.replace(/^\\b|\\b$/g, '').replace(/^\\B|\\B$/g, ''), 'i').test(text)) {
      if (!seen.has(word.toLowerCase())) {
        result.push({ word, meaning });
        seen.add(word.toLowerCase());
      }
    }
  }

  const quotedPaths = text.match(/"([^"]+)"/g);
  if (quotedPaths) {
    for (const p of quotedPaths) {
      const clean = p.replace(/"/g, '');
      if ((clean.includes('/') || clean.includes('\\') || clean.includes(':')) && !seen.has(clean)) {
        result.push({ word: p, meaning: en ? 'File or folder path' : '文件或文件夹路径' });
        seen.add(clean);
      }
    }
  }

  const fileLoc = text.match(/src\/[\w\/\-\.]+\(\d+,\d+\)/g);
  if (fileLoc) {
    for (const f of fileLoc) {
      if (!seen.has(f)) {
        const m = f.match(/^(.+)\((\d+),(\d+)\)$/);
        if (m) {
          result.push({ word: f, meaning: en ? `File ${m[1]}, line ${m[2]}, column ${m[3]}` : `文件 ${m[1]}，第 ${m[2]} 行，第 ${m[3]} 列` });
          seen.add(f);
        }
      }
    }
  }

  // 4. Extract error codes like TS2580
  const errorCodes = text.match(/TS\d{3,5}/g);
  if (errorCodes) {
    for (const ec of errorCodes) {
      if (!seen.has(ec)) {
        const meanings: Record<string, string> = en ? {
          'TS2580': 'Cannot find this name (usually missing @types/node)',
          'TS2304': 'Cannot find this name',
          'TS2307': 'Cannot find this module/file',
          'TS2339': 'This property does not exist on this object',
          'TS2345': 'Argument type mismatch',
          'TS2322': 'Type mismatch — cannot assign to this type',
        } : {
          'TS2580': '找不到这个名字（通常缺少 @types/node）',
          'TS2304': '找不到这个名字',
          'TS2307': '找不到这个模块/文件',
          'TS2339': '这个对象上不存在这个属性',
          'TS2345': '传入了不匹配的参数类型',
          'TS2322': '类型不匹配，不能赋给这个类型',
        };
        result.push({ word: ec, meaning: meanings[ec] || (en ? `TypeScript error code ${ec}` : `TypeScript 错误编号 ${ec}`) });
        seen.add(ec);
      }
    }
  }

  return result;
}

// ---- Section builder helpers ----

function buildSections(lineByLine: types.LineExplanation[]): types.SectionExplanation[] {
  const sections: types.SectionExplanation[] = [];
  if (lineByLine.length === 0) return sections;

  let group: types.LineExplanation[] = [];
  const flush = () => {
    if (group.length === 0) return;
    const first = group[0];
    const combined = group.map(g => g.line).join('\n');
    const combinedMeaning = group.map(g => g.meaning).join('\n');

    // Derive section metadata from the first line's meaning
    const type = inferType(first.meaning, combined);
    const displayOnPage = inferDisplay(first.meaning, combined);
    const role = inferRole(first.meaning, type);
    const layman = inferLayman(first.meaning, type);
    const caution = inferCaution(first.meaning, type);
    const label = inferLabel(first.meaning);

    sections.push({
      label,
      original: combined,
      meaning: combinedMeaning,
      type,
      role,
      displayOnPage,
      layman,
      caution,
    });
    group = [];
  };

  for (const entry of lineByLine) {
    // Group break: HTML tags get their own section, logical boundaries split
    const isStandalone = /^(这是|这里|开始|<!|<\/|<html|<head|<body|<title|<style|<meta|<button|<h[1-6]|<div|<span|<p\b|<a\s|<img|<input|<script|<link|<form|<ul|<ol|<li|<table|<tr|<td|<th|<section|<header|<footer|<nav|<main|<article|这是 TypeScript|这是 HTML|这是 CSS|这是设置|这是定义|这是页面上|".+?"\s*结束标签)/.test(entry.meaning);
    const isComment = /注释/.test(entry.meaning);
    const isFunctionDef = /方法|函数|类|箭头函数/.test(entry.meaning);
    const isReturn = /return/.test(entry.meaning) && !/模板字符串/.test(entry.meaning);
    const isTemplateStart = /模板字符串/.test(entry.meaning);

    if (isStandalone || isComment || isFunctionDef || isReturn || isTemplateStart) {
      flush();
    }
    group.push(entry);
  }
  flush();

  return sections;
}

function inferType(meaning: string, original: string): string {
  if (/注释/.test(meaning)) return '注释（不会执行）';
  if (/方法|函数|箭头函数/.test(meaning)) return 'TypeScript 方法/函数';
  if (/类\b/.test(meaning) && /骨架/.test(meaning)) return 'TypeScript 类定义';
  if (/模块导入|import/.test(meaning)) return '模块导入语句';
  if (/return.*模板|模板字符串/.test(meaning)) return 'TypeScript return 语句 + 模板字符串';
  if (/return/.test(meaning)) return 'TypeScript return 语句';
  if (/文档声明|DOCTYPE/.test(meaning)) return 'HTML 文档声明';
  if (/根标签|根元素/.test(meaning)) return 'HTML 根元素';
  if (/<head>/.test(meaning)) return 'HTML 配置区域 (<head>)';
  if (/meta|字符编码|元信息/.test(meaning)) return 'HTML 元信息标签 (<meta>)';
  if (/标题标签|页面标题/.test(meaning)) return 'HTML 标题 (<title>)';
  if (/样式|CSS/.test(meaning)) return 'CSS 样式';
  if (/按钮/.test(meaning)) return 'HTML 按钮元素';
  if (/标题|heading|h[1-6]/i.test(meaning)) return 'HTML 标题元素';
  if (/容器|盒子|div/i.test(meaning)) return 'HTML 容器元素';
  if (/变量|var\b/.test(meaning) && /CSS/.test(meaning)) return 'CSS 变量定义';
  if (/const |let |var /.test(original)) return '变量声明';
  if (/import /.test(original)) return '模块导入';
  if (/export /.test(original)) return '模块导出';
  if (/npm |npx |git |docker |pip /.test(original)) return '命令行指令';
  if (/error|错误|Error/i.test(meaning)) return '错误信息';
  return '程序代码';
}

function inferDisplay(meaning: string, original: string): string {
  if (/不会显示|不会直接显示|只给开发|仅供开发|不显示|看不到/.test(meaning)) return '不会';
  if (/会显示|显示在页面/.test(meaning)) return '会';
  if (/DOCTYPE|meta|charset|head>/.test(meaning)) return '不会';
  if (/<title>/.test(meaning)) return '会（在浏览器标签页上）';
  if (/style|CSS|样式/.test(meaning)) return '不会直接显示（但影响页面的外观）';
  if (/button|按钮|h[1-6]|标题|div|span|p>/.test(meaning)) return '会';
  if (/return|函数|方法|类|import|export|private|public|注释/.test(meaning)) return '不会';
  return '不会';
}

function inferRole(meaning: string, type: string): string {
  if (/注释/.test(meaning)) return '给开发者看的说明，不影响程序运行';
  if (/方法|函数/.test(type)) return '程序逻辑——定义可重复调用的代码块';
  if (/模板字符串/.test(type)) return '数据生成——用 TypeScript 拼接出 HTML 页面内容';
  if (/HTML 文档声明/.test(type)) return '页面规范——告诉浏览器用什么标准解析页面';
  if (/HTML 根元素/.test(type)) return '页面结构——所有网页内容的容器';
  if (/HTML 配置区域/.test(type)) return '页面配置——存放元信息、编码、标题、样式引用';
  if (/HTML 元信息/.test(type)) return '页面配置——设置编码和视口，避免乱码和移动端显示问题';
  if (/HTML 标题/.test(type)) return '页面标识——定义浏览器标签页上显示的文字';
  if (/CSS/.test(type)) return '视觉样式——控制页面的外观、颜色、布局';
  if (/HTML 按钮/.test(type)) return '用户交互——提供可点击的操作入口';
  if (/HTML 标题元素/.test(type)) return '页面内容——显示在页面上的标题文字';
  if (/HTML 容器/.test(type)) return '页面布局——组织和排列其他元素';
  if (/return/.test(type)) return '流程控制——决定函数返回什么结果';
  if (/类定义/.test(type)) return '程序骨架——组织相关的方法和属性';
  if (/导入/.test(type)) return '代码组织——引入外部代码依赖';
  return '程序逻辑';
}

function inferLayman(meaning: string, type: string): string {
  if (/注释/.test(meaning)) return '就像在文件旁边贴了一张便签，提醒自己或别人这段代码做什么。用户完全看不到。';
  if (/方法|函数/.test(type)) return '就像一个"任务清单"——把一组操作打包在一起，需要时就调用它，不用每次都重写一遍。';
  if (/模板字符串/.test(type)) return '就像一个"网页生成器"——TypeScript 端写好模板，调用时就自动拼出一整段 HTML 页面。';
  if (/HTML 文档声明/.test(type)) return '就像告诉翻译官"请用现代中文翻译"，而不是古文或方言。告诉浏览器用最新的标准来理解这个页面。';
  if (/HTML 根元素/.test(type)) return '就像书的封面和封底——里面所有的内容都包在这里面。';
  if (/HTML 配置区域/.test(type)) return '就像书的扉页——有书名、作者、出版信息，但这些不是正文。';
  if (/HTML 元信息/.test(type)) return '就像书的版权页——读者一般不会特别注意，但它保证了书的信息正确。';
  if (/HTML 标题/.test(type)) return '就像书的书名——出现在浏览器标签上，搜索引擎也会用到它。';
  if (/CSS/.test(type)) return '就像装修方案——决定墙壁颜色、家具摆放，但不改变房子结构（HTML）。';
  if (/HTML 按钮/.test(type)) return '就像门铃——用户看得见、按得动，按下后会有事情发生。';
  if (/HTML 标题元素/.test(type)) return '就像报纸的大标题——用户一眼就能看到，知道这一块在讲什么。';
  if (/HTML 容器/.test(type)) return '就像一个收纳盒——把同类的东西放在一起，方便整理和查找。';
  if (/return/.test(type)) return '就像做完一道菜后把成品端出来——return 就是把函数处理完的结果交给外面。';
  if (/类定义/.test(type)) return '就像公司的部门架构——把相关的职责（方法）和数据（属性）组织在一起。';
  return '就像工厂流水线上的一个环节——用户看不到它，但它完成了必要的工作。';
}

function inferCaution(meaning: string, type: string): string {
  if (/注释/.test(meaning)) return '删除或改错注释一般不会影响程序运行，但可能误导后续维护的人。';
  if (/方法|函数/.test(type)) return '如果改错函数名或参数，所有调用这个函数的地方都可能出错。修改前先确认谁在用这个函数。';
  if (/模板字符串/.test(type)) return '如果拼错 HTML 标签或漏掉引号，整个页面可能显示异常或空白。修改后一定要检查页面渲染效果。';
  if (/HTML 文档声明/.test(type)) return '如果删除 <!DOCTYPE html>，浏览器可能用旧标准渲染，导致某些 CSS 样式不生效。';
  if (/HTML 根元素/.test(type)) return '如果误删 lang 属性，屏幕朗读器和搜索引擎可能无法正确识别页面语言。';
  if (/HTML 元信息/.test(type)) return '如果删除 charset=UTF-8，中文内容可能出现乱码。如果删除 viewport，移动端页面可能显示不正常。';
  if (/HTML 标题/.test(type)) return '修改标题会影响浏览器标签和搜索结果，但不会影响页面正文。';
  if (/CSS/.test(type)) return '如果改错 CSS 变量名或值，页面颜色可能变得很奇怪，文字可能看不清。修改前先在开发者工具里预览效果。';
  if (/HTML 按钮/.test(type)) return '如果改错 id 或删除按钮，对应的点击事件可能失效，按钮变成摆设。';
  if (/HTML 标题元素/.test(type)) return '修改标题文字会影响用户看到的页面内容，但不会影响程序逻辑。';
  if (/return/.test(type)) return '如果改错 return 后面的内容，函数会返回错误的数据，调用方得到的东西就不对了。';
  if (/类定义/.test(type)) return '如果改错类名或结构，所有使用这个类的代码都可能报错。';
  return '修改这段内容可能影响程序行为，建议先备份或提交 git，再做修改。';
}

function inferLabel(meaning: string): string {
  if (/注释/.test(meaning)) return '注释';
  if (/方法.*定义|函数.*定义|箭头函数/.test(meaning)) return '函数/方法定义';
  if (/类.*骨架/.test(meaning)) return '类定义';
  if (/模块导入|import/.test(meaning)) return '模块导入';
  if (/return.*模板|模板字符串/.test(meaning)) return '返回 HTML 模板';
  if (/return/.test(meaning)) return '返回语句';
  if (/文档声明|DOCTYPE/.test(meaning)) return 'HTML 文档声明';
  if (/根标签|根元素/.test(meaning)) return 'HTML 根元素';
  if (/<head>/.test(meaning)) return '页面配置区 (head)';
  if (/字符编码|meta/.test(meaning)) return '字符编码设置';
  if (/页面标题|title/.test(meaning)) return '页面标题';
  if (/样式|style|CSS/.test(meaning)) return 'CSS 样式';
  if (/按钮/.test(meaning)) return '按钮元素';
  if (/标题|h[1-6]/i.test(meaning)) return '标题元素';
  if (/容器|div/i.test(meaning)) return '容器元素';
  if (/变量/.test(meaning) && /CSS/.test(meaning)) return 'CSS 变量';
  if (/变量/.test(meaning)) return '变量声明';
  if (/错误|error|Error/.test(meaning)) return '错误信息';
  return '代码段落';
}

function buildFinalSummary(sections: types.SectionExplanation[], codeType: string, lang: string): string {
  if (sections.length === 0) return lang === 'en' ? 'This code has no identifiable sections.' : '这段代码没有可识别的段落。';

  const displaySections = sections.filter(s => s.displayOnPage.includes('会'));
  const logicSections = sections.filter(s => s.displayOnPage === '不会');
  const configSections = sections.filter(s => s.role.includes('配置') || s.role.includes('规范'));

  const parts: string[] = [];

  if (lang === 'en') {
    parts.push(`This ${codeType} has ${sections.length} logical parts.`);
    if (displaySections.length > 0) {
      parts.push(`${displaySections.length} part(s) affect what users see: ${displaySections.map(s => s.label).join('、')}.`);
    }
    if (logicSections.length > 0) {
      parts.push(`${logicSections.length} part(s) are internal logic that users don't see: ${logicSections.map(s => s.label).join('、')}.`);
    }
    if (configSections.length > 0) {
      parts.push(`${configSections.length} part(s) are configuration that affect how the page works but aren't visible.`);
    }
    parts.push('If you are new to code, remember: you can see what pages, buttons, and titles look like, but comments, return, and function definitions are like the back kitchen of a restaurant — guests don\'t go there but that\'s where the work happens.');
  } else {
    parts.push(`这段${codeType}整体包含 ${sections.length} 个逻辑段落。`);
    if (displaySections.length > 0) {
      parts.push(`其中 ${displaySections.length} 段会影响用户能看到的内容：${displaySections.map(s => s.label).join('、')}。`);
    }
    if (logicSections.length > 0) {
      parts.push(`其中 ${logicSections.length} 段是内部逻辑，用户看不到：${logicSections.map(s => s.label).join('、')}。`);
    }
    if (configSections.length > 0) {
      parts.push(`其中 ${configSections.length} 段是页面配置，不会显示但会影响页面行为。`);
    }
    parts.push('如果你是小白，重点记住：页面、按钮、标题这些你能看到；注释、return、函数定义就像餐厅后厨——客人不进去，但菜是在那里做出来的。');
  }

  return parts.join('\n');
}

// ---- Terminal log explainer (7-section structured output) ----

function explainTerminalLog(text: string, lang: OutputLanguage): types.ExplanationResult {
  const lines = text.split('\n').filter(l => l.trim());
  const lineByLine: types.LineExplanation[] = [];

  // Separate command lines from output/error lines
  const cmdLines: string[] = [];
  const outLines: string[] = [];
  let inOutput = false;

  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    if (/^(Exit code|error\s|warning\s|src\/|node_modules\/|\.\/.*\.\w+\(\d)/i.test(t)) {
      inOutput = true;
    }
    if (inOutput) { outLines.push(t); } else { cmdLines.push(t); }
  }

  const projectDir = text.match(/cd\s+"?([^"&\n]+)"?/)?.[1] || '项目';
  const hasCompile = /tsc|typescript|compile/i.test(text);
  const hasExitError = /Exit code [1-9]/i.test(text);
  const hasTsError = /error\s+TS\d+/i.test(text);
  const errorCount = (text.match(/error\s+TS\d+/gi) || []).length;

  // ---- ① 我先告诉你它在干什么 ----
  lineByLine.push({ line: '', meaning: '__section_01__' });

  const en = lang === 'en';
  let whatHappens = '';
  if (hasCompile) {
    whatHappens = en
      ? `You ran a TypeScript compilation check in the "${projectDir}" directory. `
      : `你在「${projectDir}」这个目录里运行了一条 TypeScript 编译检查命令。`;
    whatHappens += en
      ? `The TypeScript compiler checks .ts files one by one for type errors.`
      : `TypeScript 编译器会逐个检查 .ts 文件有没有类型错误。`;
  } else {
    whatHappens = en
      ? `You executed a command in the terminal (in the "${projectDir}" directory).`
      : `你在终端里执行了一条命令（在「${projectDir}」目录下）。`;
  }

  if (hasExitError) {
    whatHappens += en
      ? ` The command finished but returned an error.`
      : `命令已经执行完毕，但返回了错误。`;
    if (errorCount > 0) whatHappens += en
      ? ` The compiler found ${errorCount} type error(s).`
      : `编译器发现了 ${errorCount} 个类型错误。`;
  } else if (hasTsError) {
    whatHappens += en
      ? ` Type errors were detected during compilation.`
      : `编译过程中检测到了类型错误。`;
  } else {
    whatHappens += en
      ? ` The command completed without errors.`
      : `命令执行完成，没有发现错误。`;
  }

  lineByLine.push({ line: whatHappens, meaning: '' });

  // ---- ② 命令逐词拆解 ----
  lineByLine.push({ line: '', meaning: '__section_02__' });

  for (const cmd of cmdLines) {
    explainSingleTerminalCommand(cmd, lineByLine);
    // Add per-token breakdown
    const tokens = tokenizeCommand(cmd);
    for (const tok of tokens) {
      const dict = en ? WORD_EN : WORD_CN;
      const meaning = dict[tok] || '';
      lineByLine.push({ line: tok, meaning: meaning || (en ? 'Part of the command' : '命令的一部分') });
    }
  }

  // ---- ③ 输出结果是什么意思 ----
  if (outLines.length > 0) {
    lineByLine.push({ line: '', meaning: '__section_03__' });

    for (const out of outLines) {
      if (/^Exit code (\d+)/i.test(out.trim())) {
        const code = out.trim().match(/^Exit code (\d+)/i)?.[1] || '?';
        const msgs: Record<string, string> = en ? {
          '0': 'Success. Command completed normally, no errors.',
          '1': 'Failure (general error). Something went wrong during execution.',
          '2': 'Failure (compile or syntax error). Code has issues — TypeScript compilation failed.',
        } : {
          '0': '成功。命令正常完成，没有错误。',
          '1': '失败（通用错误）。命令执行过程中出现了问题。',
          '2': '失败（编译或语法错误）。代码有问题，TypeScript 编译没通过。',
        };
        lineByLine.push({
          line: out.trim(),
          meaning: `${en ? 'Exit code = ' : '退出码 = '}${code}。${msgs[code] || (en ? 'Command exited abnormally — see details above.' : '命令异常退出，具体原因见上方。')}`
        });
      } else if (out.includes('error TS')) {
        // Skip — these go in section ④
      } else if (/src\/[\w\/\-\.]+\(\d+,\d+\)/i.test(out.trim())) {
        const m = out.trim().match(/(src\/[\w\/\-\.]+)\((\d+),(\d+)\)/);
        if (m) {
          lineByLine.push({
            line: out.trim(),
            meaning: en ? `Error location: file "${m[1]}", line ${m[2]}, column ${m[3]}.` : `出错位置：文件「${m[1]}」的第 ${m[2]} 行，第 ${m[3]} 列。`
          });
        }
      } else {
        lineByLine.push({ line: out.trim(), meaning: en ? 'This is program output / log information.' : '这是程序输出的日志信息。' });
      }
    }
  }

  // ---- ④ 报错原因 ----
  if (hasTsError || hasExitError || errorCount > 0) {
    lineByLine.push({ line: '', meaning: '__section_04__' });

    // Collect and explain each TS error
    const tsErrors = text.match(/error\s+TS\d+:[\s\S]*?(?=src\/|error\s+TS|$)/gi);
    if (tsErrors) {
      for (const err of tsErrors) {
        explainTsError(err.trim(), lineByLine);
      }
    }
  }

  // ---- ⑤ 下一步怎么修 ----
  if (hasTsError || hasExitError || errorCount > 0) {
    lineByLine.push({ line: '', meaning: '__section_05__' });

    // Detect specific error types and give targeted advice
    if (/TS2580/.test(text)) {
      lineByLine.push({ line: en ? 'Option A: Install @types/node' : '方案 A：安装 @types/node', meaning: en ? 'Run: npm i --save-dev @types/node. This installs Node.js type definitions so TypeScript can recognize require.' : '在终端运行：npm i --save-dev @types/node。这会安装 Node.js 的类型定义，TypeScript 就能认识 require 了。' });
      lineByLine.push({ line: en ? 'Option B: Use import syntax' : '方案 B：改用 import 写法', meaning: en ? 'Replace require("xxx") with import * as xxx from "xxx". This is the recommended modern TypeScript syntax.' : '把代码里的 require("xxx") 改成 import * as xxx from "xxx"。这是 TypeScript 推荐的现代写法。' });
      lineByLine.push({ line: en ? 'Verify after fixing' : '修完后验证', meaning: en ? 'Re-run npm run compile or npx tsc -p ./ and confirm Exit code is 0.' : '重新运行 npm run compile 或 npx tsc -p ./，确认 Exit code 变成 0。' });
    } else if (errorCount > 0) {
      lineByLine.push({ line: en ? 'Fix suggestion' : '修复建议', meaning: en ? 'Based on the errors listed above, fix each .ts file one by one. Re-compile after each fix to confirm.' : '根据上面「报错原因」里列出的错误，逐个修复对应的 .ts 文件。每修完一个错误，重新编译一次确认。' });
    }

    if (!hasExitError && !hasTsError) {
      lineByLine.push({ line: en ? 'Troubleshooting direction' : '排查方向', meaning: en ? 'Check which files were recently modified. Confirm all dependencies are installed (npm install). Verify Node.js and TypeScript version compatibility.' : '检查最近修改了哪些文件。确认依赖包是否全部安装（npm install）。确认 Node.js 和 TypeScript 版本是否兼容。' });
    }
  }

  // ---- ⑥ 风险等级 ----
  let extra = '';
  extra += en ? 'This is a low-risk development command.\n' : '这是低风险开发命令。\n';
  extra += en ? 'It will not delete files, modify system configuration, or affect external services.\n' : '它不会删除文件、不会修改系统配置、不会影响 OpenClaw / 飞书机器人等外部服务。\n';
  if (hasCompile) {
    extra += en ? 'The TypeScript compiler may update compiled .js files in the out/ directory, but will not modify your .ts source code.\n' : 'TypeScript 编译器可能会更新 out/ 目录下的 .js 编译产物，但不会修改你的 .ts 源代码。\n';
  }
  extra += en ? 'This is a routine project development check — safe to execute.' : '属于正常的项目开发检查命令，可以放心执行。';

  let summary = '';
  if (hasCompile) summary += en ? 'TypeScript compilation check' : 'TypeScript 编译检查';
  if (hasExitError) summary += ` · Exit code ${text.match(/Exit code (\d+)/i)?.[1] || '?'}`;
  if (hasTsError) summary += en ? ` · ${errorCount} type error(s)` : ` · ${errorCount} 个类型错误`;
  if (!hasExitError && !hasTsError) summary += en ? ' · Passed' : ` · 通过`;

  // ---- Word dictionary ----
  const wordByWord = extractWordsFromInput(text, lang);

  const sections = buildSections(lineByLine);
  const finalSummary = buildFinalSummary(sections, en ? 'terminal / build output' : '终端 / 编译输出', lang);
  return { summary, sections, finalSummary, lineByLine, wordByWord, extra };
}

/** Break a command string into individual tokens for per-word explanation */
function tokenizeCommand(cmd: string): string[] {
  const tokens: string[] = [];

  // Extract quoted strings as whole tokens
  const withoutQuotes = cmd.replace(/"([^"]+)"/g, (_, inner) => {
    tokens.push(`"${inner}"`);
    return '';
  });

  // Split remaining on whitespace, remove empties
  const parts = withoutQuotes.split(/\s+/).filter(Boolean);

  // Extract && and || as standalone tokens
  for (const part of parts) {
    if (part === '&&' || part === '||') {
      tokens.push(part);
    } else if (part.includes('&&')) {
      const sub = part.split('&&');
      tokens.push(sub[0]);
      tokens.push('&&');
      if (sub[1]) tokens.push(sub[1]);
    } else if (part.includes('||')) {
      const sub = part.split('||');
      tokens.push(sub[0]);
      tokens.push('||');
      if (sub[1]) tokens.push(sub[1]);
    } else {
      tokens.push(part);
    }
  }

  // Deduplicate preserving order
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const t of tokens) {
    const clean = t.replace(/^["']|["']$/g, '');
    if (!seen.has(clean) && clean.length > 0) {
      unique.push(t);
      seen.add(clean);
    }
  }
  return unique;
}

/** Breaks a single terminal command line into human explanations */
function explainSingleTerminalCommand(cmd: string, out: types.LineExplanation[]): void {
  // Split on && and || (but preserve them as standalone tokens)
  const segments = cmd.split(/(&&|\|\|)/g);

  for (const seg of segments) {
    const s = seg.trim();
    if (!s) continue;
    if (s === '&&') {
      out.push({ line: '&&', meaning: '前面的命令执行成功后，才继续执行后面的命令。' });
      continue;
    }
    if (s === '||') {
      out.push({ line: '||', meaning: '前面的命令执行失败时，才执行后面的命令。' });
      continue;
    }

    // Explain the sub-command
    const firstWord = s.split(/\s+/)[0].replace(/^["']|["']$/g, '');
    let meaning = '';

    if (firstWord === 'cd' || firstWord === 'cd.exe') {
      const path = s.replace(/^cd\s+/i, '').replace(/^["']|["']$/g, '');
      meaning = `进入文件夹：${path}。后续命令都会在这个目录里执行。安全操作，不会修改任何文件。`;
    } else if (firstWord === 'npx') {
      const rest = s.replace(/^npx\s+/i, '');
      meaning = `调用当前项目本地安装的工具来执行：${rest}。不需要全局安装这个工具。安全操作。`;
    } else if (firstWord === 'tsc') {
      meaning = `运行 TypeScript 编译器。它会检查 .ts 文件有没有类型错误，并生成 .js 文件到 out/ 目录。只读检查 + 生成文件，不删除、不修改源码。`;
    } else if (firstWord === 'npm') {
      meaning = `使用 npm（Node.js 包管理器）执行操作。`;
    } else if (firstWord === 'node') {
      meaning = `使用 Node.js 运行后面的 JavaScript 文件或代码。`;
    } else if (firstWord === 'python' || firstWord === 'python3') {
      meaning = `使用 Python 解释器运行后面的脚本。`;
    } else {
      meaning = `执行这条命令。`;
    }

    out.push({ line: s, meaning });
  }
}

/** Explain a single TypeScript compiler error line */
function explainTsError(errLine: string, out: types.LineExplanation[]): void {
  const trimmed = errLine.trim();
  const codeMatch = trimmed.match(/(TS\d+)/);
  const errCode = codeMatch?.[1];
  const locMatch = trimmed.match(/(src\/[\w\/\-\.]+)\((\d+),(\d+)\)/);

  // Extract the human-readable part of the error
  const msgMatch = trimmed.match(/: error TS\d+:\s*(.+)/);
  const errorMsg = msgMatch?.[1] || trimmed;

  out.push({ line: '报错原文', meaning: errorMsg });

  if (locMatch) {
    out.push({ line: '出错文件', meaning: `文件「${locMatch[1]}」，第 ${locMatch[2]} 行，第 ${locMatch[3]} 列` });
  }

  if (errCode === 'TS2580') {
    out.push({ line: '大白话解释', meaning: 'TypeScript 不认识 require 这个写法。' });
    out.push({ line: '可能原因', meaning: '代码里用了 Node.js 的 require(...)，但当前项目没有安装 Node.js 的类型定义，TypeScript 看不懂 require 是什么。' });
    out.push({ line: '方法 1：安装类型定义', meaning: '在终端运行：npm i --save-dev @types/node' });
    out.push({ line: '方法 2：改用 import', meaning: '把 require("xxx") 改成 import * as xxx from "xxx"。这是 TypeScript 推荐的现代写法。' });
    out.push({ line: '是否严重', meaning: '中等。插件功能不受影响，只是编译检查没通过。修完后重新编译即可。' });
  } else if (errCode === 'TS2304') {
    out.push({ line: '大白话解释', meaning: 'TypeScript 找不到你写的这个名字。' });
    out.push({ line: '可能原因', meaning: '名字拼写有误，或者缺少对应的 import/require 语句。' });
    out.push({ line: '怎么修', meaning: '检查名字是否拼写正确，确认是否已 import 了对应的模块。' });
    out.push({ line: '是否严重', meaning: '一般。需要修正，否则编译不过。' });
  } else if (errCode === 'TS2307') {
    out.push({ line: '大白话解释', meaning: 'TypeScript 找不到你要引入的模块或文件。' });
    out.push({ line: '可能原因', meaning: '文件路径写错了，或者这个包还没有安装。' });
    out.push({ line: '怎么修', meaning: '1) 检查 import 的路径是否正确。2) 运行 npm install 确保依赖已安装。3) 检查包名拼写。' });
    out.push({ line: '是否严重', meaning: '一般。需要修正路径或安装依赖。' });
  } else {
    out.push({
      line: `错误 ${errCode || '未知'}`,
      meaning: 'TypeScript 编译错误。请根据错误提示检查对应的代码行。'
    });
  }
}

// --------------- CSS ---------------

// --------------- CSS ---------------
function explainCSS(code: string, lang: OutputLanguage): types.ExplanationResult {
  const lines = code.split('\n').filter(l => l.trim());
  const lineExplanations: types.LineExplanation[] = [];
  const wordExplanations: types.WordExplanation[] = [];
  let selectorName = '';

  for (const line of lines) {
    const trimmedLine = line.trim();

    if (trimmedLine.endsWith('{') || (trimmedLine.startsWith('.') || trimmedLine.startsWith('#') || trimmedLine.match(/^[a-z]/i))) {
      const sel = trimmedLine.replace(/\s*\{$/, '').trim();
      selectorName = sel;
      lineExplanations.push({
        line: trimmedLine,
        meaning: `选择网页中叫 "${sel}" 的区域，准备给它设置样式。`
      });
    } else if (trimmedLine === '}') {
      lineExplanations.push({
        line: '}',
        meaning: '表示这个区域的样式设置完毕，结束标记。'
      });
    } else if (trimmedLine.includes(':')) {
      const [prop, val] = trimmedLine.replace(/;$/, '').split(':').map(s => s.trim());
      const propCN = cssPropertyCN(prop);
      const valCN = cssValueCN(prop, val);
      lineExplanations.push({
        line: trimmedLine,
        meaning: `${propCN}：设为 ${valCN}。`
      });
    }
  }

  wordExplanations.push({ word: selectorName, meaning: '这个网页区域的名字（CSS选择器）' });
  wordExplanations.push({ word: '{}', meaning: lang === 'en' ? 'Curly braces — contains specific style settings' : '大括号，里面写具体的样式设置' });
  extractCSSProperties(code, wordExplanations);

  const cssSections = buildSections(lineExplanations);
  const cssFinalSummary = buildFinalSummary(cssSections, 'CSS 样式代码', lang);
  return {
    summary: lang === 'en'
      ? `This CSS code sets the visual style for the "${selectorName || 'a certain area'}" section of the web page.`
      : `这段 CSS 代码是在给网页中叫 "${selectorName || '某个区域'}" 的部分设置外观样式。`,
    sections: cssSections,
    finalSummary: cssFinalSummary,
    lineByLine: lineExplanations,
    wordByWord: wordExplanations,
    extra: lang === 'en'
      ? 'CSS is the language used to control the appearance of web pages. Modifying this code will change how the corresponding area looks, but will not affect the page\'s content or functionality.'
      : 'CSS 是用来控制网页外观的语言。修改这些代码后，网页的对应区域外观会发生变化，但不会影响网页的内容或功能。'
  };
}

function cssPropertyCN(prop: string): string {
  const map: Record<string, string> = {
    'color': '文字颜色', 'padding': '内边距', 'margin': '外边距',
    'font-size': '字体大小', 'font-weight': '字体粗细', 'font-family': '字体类型',
    'background': '背景', 'background-color': '背景颜色', 'border': '边框',
    'width': '宽度', 'height': '高度', 'display': '显示方式',
    'flex': '弹性布局', 'grid': '网格布局', 'position': '定位方式',
    'text-align': '文字对齐', 'line-height': '行高', 'opacity': '透明度',
    'border-radius': '圆角大小', 'box-shadow': '阴影效果', 'z-index': '层级顺序',
    'overflow': '超出处理', 'cursor': '鼠标样式', 'transition': '过渡动画',
    'transform': '变形效果', 'gap': '间距', 'align-items': '垂直对齐',
    'justify-content': '水平对齐', 'max-width': '最大宽度', 'min-height': '最小高度',
  };
  return map[prop] || `${prop}（CSS 属性）`;
}

function cssValueCN(prop: string, val: string): string {
  const colorMap: Record<string, string> = {
    '#ffffff': '白色', '#fff': '白色', '#000000': '黑色', '#000': '黑色',
    '#ff0000': '红色', '#00ff00': '绿色', '#0000ff': '蓝色', '#333333': '深灰色',
    '#666666': '中灰色', '#999999': '浅灰色', 'transparent': '透明',
  };
  if (colorMap[val.toLowerCase()]) return colorMap[val.toLowerCase()];
  if (/^#[0-9a-fA-F]{3,6}$/.test(val)) return `颜色代码 ${val}`;
  if (val.endsWith('px')) return `${val.replace('px', '')} 像素`;
  if (val.endsWith('%')) return `${val}`;
  if (val.endsWith('rem') || val.endsWith('em')) return `${val}（相对字体大小的单位）`;
  if (['flex', 'block', 'inline', 'none', 'grid'].includes(val)) return `${val}（布局模式）`;
  return val;
}

function extractCSSProperties(code: string, arr: types.WordExplanation[]) {
  const props = code.match(/[a-z-]+(?=\s*:)/gi);
  if (!props) return;
  const seen = new Set(arr.map(w => w.word));
  for (const p of props) {
    const key = p.toLowerCase();
    if (!seen.has(key)) {
      arr.push({ word: key, meaning: cssPropertyCN(key) });
      seen.add(key);
    }
  }
}

// --------------- HTML ---------------
function explainHTML(code: string, lang: OutputLanguage): types.ExplanationResult {
  const lines = code.split('\n').filter(l => l.trim());
  const lineExplanations: types.LineExplanation[] = [];
  const wordExplanations: types.WordExplanation[] = [];

  const tagCN: Record<string, string> = {
    'div': '盒子/容器', 'span': '行内文字容器', 'p': '段落',
    'a': '超链接', 'img': '图片', 'h1': '一级标题', 'h2': '二级标题',
    'h3': '三级标题', 'ul': '无序列表', 'ol': '有序列表', 'li': '列表项',
    'button': '按钮', 'input': '输入框', 'form': '表单', 'table': '表格',
    'section': '页面区块', 'header': '头部区域', 'footer': '底部区域',
    'nav': '导航栏', 'main': '主要内容区', 'article': '文章区域',
    'class': '类名', 'id': '唯一标识', 'style': '样式属性', 'href': '链接地址',
    'src': '资源路径', 'alt': '备用文字',
  };

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (trimmedLine.startsWith('<!--')) {
      lineExplanations.push({ line: trimmedLine, meaning: '这是注释，不会被浏览器显示，给开发者看的备注。' });
    } else if (trimmedLine.startsWith('</')) {
      const tag = trimmedLine.match(/<\/(\w+)/)?.[1];
      lineExplanations.push({ line: trimmedLine, meaning: `"${tag || '某元素'}" 结束标签，表示这个区域到这里结束。` });
    } else if (trimmedLine.startsWith('<')) {
      const openTag = trimmedLine.match(/<(\w+)/)?.[1] || '未知';
      lineExplanations.push({ line: trimmedLine, meaning: `开始一个 "${openTag}" 元素（${tagCN[openTag] || '网页元素'}）。` });
    } else {
      // Pure HTML context: lines without tags are visible text content
      // But only if they aren't empty or purely structural characters
      if (trimmedLine && trimmedLine !== '{' && trimmedLine !== '}' && trimmedLine !== '-->') {
        lineExplanations.push({ line: trimmedLine, meaning: '这是网页中会显示在页面上的文字内容。' });
      }
    }
  }

  for (const [en, cn] of Object.entries(tagCN)) {
    wordExplanations.push({ word: `<${en}>`, meaning: cn });
  }

  const htmlSections = buildSections(lineExplanations);
  const htmlFinalSummary = buildFinalSummary(htmlSections, 'HTML 页面结构代码', lang);
  return {
    summary: lang === 'en'
      ? 'This HTML code builds the structure of a web page. HTML is like the skeleton of a house — it determines what content appears and how it is arranged.'
      : '这段 HTML 代码是用来搭建网页结构的。HTML 就像房子的骨架，决定了网页里有什么内容、内容怎么排列。',
    sections: htmlSections,
    finalSummary: htmlFinalSummary,
    lineByLine: lineExplanations,
    wordByWord: wordExplanations,
    extra: 'HTML 是网页的基础语言。修改 HTML 会改变网页的内容和结构，但不会影响颜色、大小等外观，外观由 CSS 控制。'
  };
}

// --------------- JavaScript ---------------
function explainJS(code: string, lang: OutputLanguage): types.ExplanationResult {
  const lines = code.split('\n').filter(l => l.trim());
  const lineExplanations: types.LineExplanation[] = [];

  for (const line of lines) {
    const t = line.trim();

    // 1. Comments
    if (/^\s*\/\*\*/.test(t)) {
      lineExplanations.push({ line: t, meaning: '这是 JSDoc 文档注释，不会被程序执行。它是写给开发者看的，用来说明下面代码的作用。' });
    } else if (/^\s*\*[^\/]/.test(t) || /^\s*\*\//.test(t)) {
      lineExplanations.push({ line: t, meaning: '注释的延续行或结束标记。不会被执行，仅供开发者阅读。' });
    } else if (t.startsWith('//')) {
      lineExplanations.push({ line: t, meaning: '这是单行注释，不会被执行的说明文字，只给开发者看。' });

    // 2. TypeScript method definitions (private/public/protected)
    } else if (/^\s*(private|public|protected)\s+\w+\s*\(/.test(t)) {
      const vis = t.match(/^\s*(private|public|protected)/)?.[1] || '';
      const name = t.match(/(?:private|public|protected)\s+(\w+)/)?.[1] || '';
      const ret = t.match(/\(.*\)\s*:\s*(\w+)/)?.[1] || '';
      const visCN: Record<string, string> = { 'private': '私有', 'public': '公开', 'protected': '受保护' };
      let meaning = `定义${visCN[vis] || vis}方法「${name}」。`;
      if (vis === 'private') meaning += 'private 表示只能在当前类内部使用，外部代码无法调用它。';
      if (ret) meaning += ` 返回类型是 ${ret === 'string' ? '字符串（文本）' : ret}。`;
      lineExplanations.push({ line: t, meaning });

    // 3. Class / interface definitions
    } else if (/^\s*(export\s+)?(class|interface|type|enum)\s+\w+/.test(t)) {
      const kw = t.match(/(class|interface|type|enum)/)?.[1] || '';
      const name = t.match(new RegExp(`${kw}\\s+(\\w+)`))?.[1] || '';
      const kwCN: Record<string, string> = { 'class': '类', 'interface': '接口', 'type': '类型别名', 'enum': '枚举' };
      lineExplanations.push({ line: t, meaning: `定义一个 TypeScript ${kwCN[kw] || kw}「${name}」。这是代码的组织结构，不会被显示在页面上。` });

    // 4. Variable declarations
    } else if (t.startsWith('const ') || t.startsWith('let ') || t.startsWith('var ')) {
      const name = t.match(/(?:const|let|var)\s+(\w+)/)?.[1];
      lineExplanations.push({ line: t, meaning: `创建一个变量，名字叫 "${name || '?'}"，用来存储数据。` });

    // 5. Function with function keyword
    } else if (t.startsWith('function ') || /^\s*(export\s+)?(async\s+)?function\s+/.test(t)) {
      const name = t.match(/function\s+(\w+)/)?.[1];
      lineExplanations.push({ line: t, meaning: `定义一个功能模块 "${name || '?'}"，里面封装了一段可复用的逻辑。` });

    // 6. Arrow functions
    } else if (/\bconst\s+\w+\s*=\s*(\([^)]*\)|[^=]\w+)\s*=>/.test(t) || /\b(const|let|var)\s+\w+\s*=\s*(async\s+)?\(/.test(t)) {
      const name = t.match(/(?:const|let|var)\s+(\w+)/)?.[1] || '';
      lineExplanations.push({ line: t, meaning: `定义箭头函数「${name}」，赋值给常量。这是程序的逻辑代码。` });

    // 7. Return statement
    } else if (/^\s*return\s+`/.test(t)) {
      lineExplanations.push({ line: t, meaning: 'return 语句，返回一段多行模板字符串。反引号（`）里的内容通常包含 HTML 页面结构。' });
    } else if (t.startsWith('return ')) {
      lineExplanations.push({ line: t, meaning: '结束当前函数并把后面的结果返回给调用方。' });

    // 8. Control flow
    } else if (t.startsWith('if ') || t.startsWith('if(')) {
      lineExplanations.push({ line: t, meaning: '条件判断：只有括号里的条件满足时，才执行后面的代码。' });
    } else if (/^\s*(for|while|switch|try|catch)\b/.test(t)) {
      const kw = t.match(/^\s*(for|while|switch|try|catch)\b/)?.[1] || '';
      lineExplanations.push({ line: t, meaning: `${kw} 流程控制语句。决定程序接下来执行哪段代码。` });

    // 9. Import/export
    } else if (t.startsWith('import ') || t.startsWith('import{') || t.startsWith('import {')) {
      lineExplanations.push({ line: t, meaning: '从别的文件或包里引入代码，借用外部功能。' });
    } else if (t.startsWith('require(')) {
      lineExplanations.push({ line: t, meaning: '引入外部模块（Node.js 写法）。等同于 import 但语法更老。' });
    } else if (t.startsWith('export ')) {
      lineExplanations.push({ line: t, meaning: '把这段代码暴露出去，让其他文件可以 import 它。' });

    // 10. Console debug
    } else if (t.includes('console.log')) {
      lineExplanations.push({ line: t, meaning: '在控制台输出信息，通常用于调试时查看变量值。普通用户看不到这些输出。' });

    // 11. Code block braces
    } else if (/^\s*\{\s*$/.test(t)) {
      lineExplanations.push({ line: t, meaning: '代码块开始标记（左大括号）。表示函数体、类体或条件循环体的开始。' });
    } else if (/^\s*\}[\s,;]*$/.test(t)) {
      lineExplanations.push({ line: t, meaning: '代码块结束标记（右大括号）。表示当前函数、类或语句块到此结束。' });

    // 12. Type annotation line (e.g. "): string {" on its own)
    } else if (/^\s*\)\s*:\s*\w+\s*\{?\s*$/.test(t)) {
      const retType = t.match(/\)\s*:\s*(\w+)/)?.[1] || '';
      lineExplanations.push({ line: t, meaning: `方法参数结束，返回类型标注为 ${retType}。这是 TypeScript 的类型标注语法。` });

    } else {
      // Last resort: describe what we can see
      const hasEquals = t.includes('=');
      const hasDot = t.includes('.');
      if (hasEquals && hasDot) {
        lineExplanations.push({ line: t, meaning: '对某个对象的属性赋值或调用其方法。' });
      } else if (hasEquals) {
        lineExplanations.push({ line: t, meaning: '赋值或比较操作。' });
      } else if (hasDot) {
        lineExplanations.push({ line: t, meaning: '调用某个对象的方法或访问其属性。' });
      } else {
        lineExplanations.push({ line: t, meaning: '一行 TypeScript/JavaScript 执行语句。负责程序逻辑，不会显示在页面上。' });
      }
    }
  }

  // Only include words that actually appear in the input
  const wordByWord = extractWordsFromInput(code, lang);

  const jsSections = buildSections(lineExplanations);
  const jsFinalSummary = buildFinalSummary(jsSections, 'JavaScript/TypeScript 程序代码', lang);
  return {
    summary: lang === 'en'
      ? 'This JavaScript code controls program logic. JavaScript handles interactivity, data computation, and flow control for web pages or applications.'
      : '这段 JavaScript 代码用于控制程序逻辑。JavaScript 负责处理网页或应用的交互行为、数据计算和流程控制。',
    sections: jsSections,
    finalSummary: jsFinalSummary,
    lineByLine: lineExplanations,
    wordByWord,
    extra: '修改 JavaScript 代码会影响程序的运行逻辑。如果修改不当，可能导致功能异常。修改前建议先理解每行代码的作用。'
  };
}

// --------------- Python ---------------
function explainPython(code: string, lang: OutputLanguage): types.ExplanationResult {
  const lines = code.split('\n').filter(l => l.trim());
  const lineExplanations: types.LineExplanation[] = [];

  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith('#')) {
      lineExplanations.push({ line: t, meaning: '这是注释，给人看的说明文字，不影响程序运行。' });
    } else if (t.startsWith('import ') || t.startsWith('from ')) {
      const lib = t.match(/(?:import|from)\s+(\w+)/)?.[1];
      lineExplanations.push({ line: t, meaning: `引入外部工具库${lib ? ` "${lib}"` : ''}，借用别人写好的功能。` });
    } else if (t.startsWith('def ')) {
      const name = t.match(/def\s+(\w+)/)?.[1];
      lineExplanations.push({ line: t, meaning: `定义一个功能模块 "${name || '?'}"，封装了一段逻辑供其他地方调用。` });
    } else if (t.startsWith('class ')) {
      const name = t.match(/class\s+(\w+)/)?.[1];
      lineExplanations.push({ line: t, meaning: `定义一个模板/类 "${name || '?'}"，用于创建相似的对象实例。` });
    } else if (t.startsWith('return ')) {
      lineExplanations.push({ line: t, meaning: '结束当前函数并返回后面的结果。' });
    } else if (t.startsWith('print(')) {
      lineExplanations.push({ line: t, meaning: '在屏幕上输出信息。' });
    } else if (t.startsWith('if ') || t.startsWith('if(')) {
      lineExplanations.push({ line: t, meaning: '条件判断：如果条件成立就执行后面的代码。' });
    } else if (t.startsWith('for ') || t.startsWith('while ')) {
      lineExplanations.push({ line: t, meaning: '循环语句：重复执行某段代码。' });
    } else if (t.endsWith(':')) {
      lineExplanations.push({ line: t, meaning: '代码块的开始标记（冒号表示后面缩进的部分都属于这个块）。' });
    } else {
      lineExplanations.push({ line: t, meaning: '一行 Python 执行语句。' });
    }
  }

  // Only include words that actually appear in the input
  const wordByWord = extractWordsFromInput(code, lang);

  const pySections = buildSections(lineExplanations);
  const pyFinalSummary = buildFinalSummary(pySections, 'Python 程序代码', lang);
  return {
    summary: lang === 'en'
      ? 'This Python code tells the computer to perform certain operations. Python is commonly used for data processing, automation scripts, and AI development.'
      : '这段 Python 代码用于告诉电脑执行某些操作。Python 常用于数据处理、自动化脚本和 AI 开发。',
    sections: pySections,
    finalSummary: pyFinalSummary,
    lineByLine: lineExplanations,
    wordByWord,
    extra: '修改 Python 代码主要影响后台逻辑和数据处理。注意 Python 靠缩进（空格数量）判断代码结构，改缩进可能导致逻辑改变。'
  };
}

// --------------- JSON ---------------
function explainJSON(code: string, lang: OutputLanguage): types.ExplanationResult {
  const lineExplanations: types.LineExplanation[] = [];
  const wordExplanations: types.WordExplanation[] = [
    { word: '{}', meaning: '花括号，表示一个对象/配置集合' },
    { word: '[]', meaning: '方括号，表示一个列表/数组' },
    { word: '"key": "value"', meaning: '键值对，左边是名字，右边是对应的值' },
    { word: 'true/false', meaning: '布尔值，是/否' },
    { word: 'null', meaning: '空值，表示此处没有数据' },
  ];

  const lines = code.split('\n').filter(l => l.trim());
  for (const line of lines) {
    const t = line.trim();
    if (t === '{' || t === '[') {
      lineExplanations.push({ line: t, meaning: '开始一个配置集合' + (t === '[' ? '（列表形式）' : '') });
    } else if (t === '}' || t === ']') {
      lineExplanations.push({ line: t, meaning: '配置集合结束' });
    } else if (t.includes('"') && t.includes(':')) {
      const m = t.match(/"(\w+)"/g);
      if (m && m.length >= 1) {
        const key = m[0].replace(/"/g, '');
        lineExplanations.push({ line: t, meaning: `配置项 "${key}"，后面跟着它的值。` });
      }
    } else {
      lineExplanations.push({ line: t, meaning: '数据内容' });
    }
  }

  const jsonSections = buildSections(lineExplanations);
  const jsonFinalSummary = buildFinalSummary(jsonSections, 'JSON 配置文件', lang);
  return {
    summary: lang === 'en'
      ? 'This JSON is a configuration or data file. JSON is a universal data format used to pass information between programs or save settings.'
      : '这段 JSON 是一个配置文件或数据文件。JSON 是一种通用的数据格式，用来在不同程序之间传递信息或保存设置。',
    sections: jsonSections,
    finalSummary: jsonFinalSummary,
    lineByLine: lineExplanations,
    wordByWord: wordExplanations,
    extra: lang === 'en'
      ? 'JSON files are commonly used for project configuration (e.g. package.json, tsconfig.json), API data transfer, etc. Modifying JSON may change settings but generally won\'t directly damage the system.'
      : 'JSON 文件通常用于项目配置（如 package.json、tsconfig.json）、API 数据传输等。修改 JSON 可能导致配置变化，一般不会直接损坏系统。'
  };
}

// --------------- Shell ---------------
function explainShell(code: string, lang: OutputLanguage): types.ExplanationResult {
  const lines = code.split('\n').filter(l => l.trim());
  const lineExplanations: types.LineExplanation[] = [];

  for (const line of lines) {
    explainSingleTerminalCommand(line.trim(), lineExplanations);
  }

  // Only include words that actually appear in the input
  const wordByWord = extractWordsFromInput(code, lang);

  // Build a meaningful summary based on detected commands
  const hasCd = /\bcd\s/i.test(code);
  const hasTsc = /\btsc\b/i.test(code);
  const hasNpx = /\bnpx\b/i.test(code);
  const hasNpmInstall = /\bnpm\s+(i|install)\b/i.test(code);
  const hasGit = /\bgit\s/i.test(code);
  const hasRm = /\b(rm\s|del\s|Remove-Item)\b/i.test(code);

  const en = lang === 'en';
  let summary = en ? 'This is a terminal command.' : '这是一条终端命令。';
  if (hasCd && hasTsc) {
    summary = en
      ? 'This command first enters the project directory, then runs the TypeScript compiler to check the code.'
      : '这条命令会先进入项目目录，然后运行 TypeScript 编译器检查代码。';
  } else if (hasCd && hasNpx) {
    summary = en
      ? 'This command enters a specified directory, then uses npx to run a locally installed tool.'
      : '这条命令会进入指定目录，然后用 npx 调用本地安装的工具。';
  } else if (hasNpmInstall) {
    summary = en
      ? 'This command installs the project\'s required dependencies.'
      : '这条命令会安装项目需要的依赖包。';
  } else if (hasGit) {
    summary = en
      ? 'This command performs Git version control operations.'
      : '这条命令执行 Git 版本控制相关操作。';
  } else if (hasRm) {
    summary = en
      ? '⚠️ This command involves deleting files or folders — please verify carefully.'
      : '⚠️ 这条命令涉及删除文件或文件夹的操作，请仔细确认。';
  }

  const shellSections = buildSections(lineExplanations);
  const shellFinalSummary = buildFinalSummary(shellSections, 'Shell 命令行指令', lang);
  return {
    summary,
    sections: shellSections,
    finalSummary: shellFinalSummary,
    lineByLine: lineExplanations,
    wordByWord,
    extra: en
      ? 'Terminal commands can directly manipulate files, install software, and run programs. It is recommended to understand each term before executing. If unsure, check what each parameter does before pressing Enter.'
      : '终端命令可以直接操作文件、安装软件、运行程序。执行前建议了解每个词的含义。如果不确定，先查一下每个参数的作用再回车。'
  };
}

// --------------- 通用兜底 ---------------
function genericExplain(code: string, lang: OutputLanguage): types.ExplanationResult {
  const lines = code.split('\n').filter(l => l.trim());
  const wordByWord = extractWordsFromInput(code, lang);
  const en = lang === 'en';

  const lineExplanations: types.LineExplanation[] = [];
  for (const line of lines) {
    const t = line.trim();

    if (/^(https?:\/\/|www\.)/i.test(t)) {
      lineExplanations.push({ line: t, meaning: en ? 'This is a URL/link.' : '这是一个网址/链接。' });
    } else if (/^[a-z]:[\\\/]/i.test(t) || /^\/[\w]/.test(t) || /^~[\/]/.test(t)) {
      lineExplanations.push({ line: t, meaning: en ? 'This is a file or folder path.' : '这是一个文件或文件夹路径。' });
    } else if (/^\d+[\.\)]\s/.test(t)) {
      lineExplanations.push({ line: t, meaning: en ? 'This is a numbered list item.' : '这是一个编号列表项。' });
    } else if (/^[=\-]{3,}$/.test(t)) {
      lineExplanations.push({ line: t, meaning: en ? 'This is a separator line.' : '这是分隔线。' });
    } else if (t.startsWith('#') || t.startsWith('>') || t.startsWith('- ') || t.startsWith('* ')) {
      lineExplanations.push({ line: t, meaning: en ? 'This is Markdown formatted text.' : '这是 Markdown 格式的文本。' });
    } else if (/^(IN|OUT|OK|ERR|INFO|WARN|DEBUG|ERROR)\b/i.test(t)) {
      lineExplanations.push({ line: t, meaning: en ? 'This is a program log line — the leading word is the log level.' : '这是程序运行日志，前面的英文是日志级别标记。' });
    } else if (t.includes('=') && !t.includes('==') && !t.includes('===')) {
      lineExplanations.push({ line: t, meaning: en ? 'This looks like an assignment or config entry (contains =).' : '这看起来是赋值或配置项（包含等号）。' });
    } else if (/^[\w\-_]+:/.test(t)) {
      lineExplanations.push({ line: t, meaning: en ? 'This looks like a config entry or key-value pair (colon-separated).' : '这看起来是一个配置项或键值对（冒号分隔）。' });
    } else {
      lineExplanations.push({ line: t, meaning: en ? 'Could not automatically identify this line type — please interpret based on context.' : '未能自动识别此行内容类型，请结合上下文理解。' });
    }
  }

  const genSections = buildSections(lineExplanations);
  const genFinalSummary = buildFinalSummary(genSections, '未知格式文本', lang);
  return {
    summary: lang === 'en'
      ? 'This is a block of multi-line text. The system could not automatically identify a specific code language or data format. Below are guesses based on each line\'s characteristics.'
      : '这是一段多行文本。系统未能自动识别出具体的代码语言或数据格式，以下是基于每行内容特征的猜测。',
    sections: genSections,
    finalSummary: genFinalSummary,
    lineByLine: lineExplanations,
    wordByWord,
    extra: lang === 'en'
      ? 'If you\'d like a more accurate explanation, try selecting only the core code/command/error portion, or use the manual input in the panel with the appropriate function button.'
      : '如果你希望获得更准确的解释，可以尝试只选中代码/命令/报错的核心部分，或者使用驾驶舱面板的手动输入功能选择对应的功能按钮。'
  };
}

// ============================================================
// 2. 命令安全分析
// ============================================================

export function explainCommandSafety(command: string, outputLang?: OutputLanguage): types.SafetyResult {
  const trimmed = command.trim();
  const lang = outputLang || 'zh';
  const en = lang === 'en';

  const mismatchHint: types.MismatchHint | undefined = !isCommandLike(trimmed) ? {
    show: true,
    message: '',
    suggestedAction: 'explainSafety',
  } : undefined;

  const hasDelete = /\b(rm |del |Remove-Item|rmdir|rd |DangerousRemove|wipe|clean |uninstall )/i.test(trimmed);
  const hasRecursive = /(--recursive|-r|-Recurse|--recursive)\b/i.test(trimmed);
  const hasForce = /(--force|-f|-Force|--yes|-y)\b/i.test(trimmed);
  const hasNetwork = /\b(curl|wget|git\s+clone|git\s+pull|git\s+push|npm\s+install|pip\s+install|pnpm\s+install|yarn\s+add|apt\s+get|brew\s+install|Invoke-WebRequest|Start-BitsTransfer)\b/i.test(trimmed);
  const hasConfig = /\b(git\s+config|npm\s+set|export |set |setx |set-env|Write-Output|Out-File|>>|>)\b/i.test(trimmed);
  const hasSystem = /\b(sudo |chmod|chown|systemctl|service |sc |reg |regedit|Set-ExecutionPolicy)\b/i.test(trimmed) ||
    /\/etc\/|\/usr\/|\/var\/|\/bin\/|\/sbin\/|C:\\Windows|C:\\Program Files|HKEY_/i.test(trimmed);

  const dangerPoints: string[] = [];
  if (hasDelete && hasRecursive && hasForce) {
    dangerPoints.push(en
      ? 'This command combines "force + recursive delete" — it will irreversibly delete entire folders and all their contents. High risk.'
      : '这个命令组合了"强制+递归删除"，会不可恢复地删除整个文件夹及其所有内容，属于高风险操作。');
  } else if (hasDelete && hasRecursive) {
    dangerPoints.push(en
      ? 'This command recursively deletes folders and all their contents.'
      : '这个命令会用递归方式删除文件夹及其中所有内容。');
  } else if (hasDelete) {
    dangerPoints.push(en
      ? 'This command involves deleting files or folders.'
      : '这个命令涉及删除操作。');
  }
  if (hasForce) dangerPoints.push(en
    ? '-Force / -f / --force means forced execution, skipping confirmation prompts.'
    : '-Force / -f / --force 表示强制执行，跳过确认步骤。');
  if (hasNetwork) dangerPoints.push(en
    ? 'This command connects to the network, downloading or uploading data.'
    : '这个命令会连接网络，从互联网下载或上传数据。');
  if (hasSystem) dangerPoints.push(en
    ? 'This command involves system-level operations that may affect the entire computer, not just the current project.'
    : '这个命令涉及系统级别的操作，可能影响整个电脑而非仅当前项目。');

  let riskLevel: types.RiskLevel = en ? 'Low' as any : '低';
  if (hasDelete && hasRecursive && hasForce && hasSystem) {
    riskLevel = en ? 'Critical' as any : '极高';
  } else if ((hasDelete && hasForce) || (hasDelete && hasSystem) || hasSystem) {
    riskLevel = en ? 'High' as any : '高';
  } else if (hasDelete || hasConfig || hasNetwork) {
    riskLevel = en ? 'Medium' as any : '中';
  }

  let suggestion = '';
  if (riskLevel === '极高' || riskLevel === ('Critical' as any)) {
    suggestion = en
      ? 'Strongly recommend confirming first: 1) What exactly will be deleted? 2) Can it be recovered? 3) Do you have backups? If unsure, do not execute.'
      : '强烈建议先确认：1) 你要删的是什么？2) 删除后能否恢复？3) 有没有备份？如果不确定，先不要执行。';
  } else if (riskLevel === '高' || riskLevel === ('High' as any)) {
    suggestion = en
      ? 'Make sure you understand exactly what will be affected before executing. If you don\'t understand each parameter, do not execute.'
      : '建议在执行前先确认清楚具体会影响到什么。如果不了解每个参数的含义，先不要执行。';
  } else if (riskLevel === '中' || riskLevel === ('Medium' as any)) {
    suggestion = en
      ? 'This operation has some risk but is generally manageable. Check which files and configurations are affected before confirming.'
      : '这个操作有一定风险，但通常是可控的。建议看清楚具体影响了哪些文件和配置，确认无误后再执行。';
  } else {
    suggestion = en
      ? 'This is a low-risk operation and is generally safe to execute. If unsure, you can learn more about what it does first.'
      : '这个操作风险较低，通常可以安全执行。但如果不确定，也可以先了解一下具体会做什么。';
  }

  const lines = trimmed.split('\n').filter(l => l.trim());
  const lineExplanations: types.LineExplanation[] = lines.map(l => ({
    line: l,
    meaning: explainCommandLine(l, lang),
  }));

  const wordExplanations = buildCommandDictionary(trimmed, lang);

  return {
    summary: buildCommandSummary(hasDelete, hasRecursive, hasForce, hasNetwork, hasConfig, hasSystem, lang),
    willDeleteFiles: en
      ? (hasDelete ? 'Yes — this command involves deleting files or folders.' : 'No — does not involve deletion.')
      : (hasDelete ? '是——这个命令涉及删除文件或文件夹的操作。' : '否——这个命令不涉及删除操作。'),
    willModifyConfig: en
      ? (hasConfig ? 'Yes — this command may modify system or project configuration.' : 'No — does not modify configuration.')
      : (hasConfig ? '是——这个命令可能会修改系统或项目配置。' : '否——不涉及修改配置。'),
    willAccessNetwork: en
      ? (hasNetwork ? 'Yes — this command connects to the internet.' : 'No — no network access.')
      : (hasNetwork ? '是——这个命令会连接互联网。' : '否——不会联网。'),
    willAffectSystem: en
      ? (hasSystem ? 'Yes — may affect system-level settings or files.' : 'No — only affects files within the current project.')
      : (hasSystem ? '是——可能影响系统级别的设置或文件。' : '否——只影响当前项目范围内的文件。'),
    riskLevel,
    suggestion,
    dangerPoints: dangerPoints.length > 0 ? dangerPoints : [en
      ? 'No obvious danger signs detected, but still confirm the command\'s meaning before executing.'
      : '未检测到明显的危险信号，但仍建议确认命令的含义后再执行。'],
    lineByLine: lineExplanations,
    wordByWord: wordExplanations,
    mismatchHint,
  };
}

function explainCommandLine(line: string, lang: OutputLanguage): string {
  const trimmed = line.trim();
  const en = lang === 'en';
  if (trimmed.startsWith('npm install') || trimmed.startsWith('npm i ')) return en ? 'Use npm to install project dependencies.' : '使用 npm 安装项目需要的依赖包。';
  if (trimmed.startsWith('npm run')) return en ? 'Run a script command defined in package.json.' : '运行 package.json 中定义的脚本命令。';
  if (trimmed.startsWith('git clone')) return en ? 'Download project code from a remote repository.' : '从远程仓库下载项目代码到本地。';
  if (trimmed.startsWith('git pull')) return en ? 'Pull the latest code updates from the remote repository.' : '从远程仓库拉取最新代码更新。';
  if (trimmed.startsWith('git push')) return en ? 'Push local commits to the remote repository.' : '把本地代码提交推送到远程仓库。';
  if (trimmed.startsWith('git add')) return en ? 'Stage file changes, preparing them for commit.' : '把文件改动加入暂存区，准备提交。';
  if (trimmed.startsWith('git commit')) return en ? 'Create a commit to record current changes.' : '创建一个提交，记录当前改动。';
  if (trimmed.startsWith('cd ')) return en ? 'Change the current working directory to the specified path.' : '切换当前工作目录到指定路径。';
  if (trimmed.startsWith('mkdir ')) return en ? 'Create a new folder.' : '创建新的文件夹。';
  if (trimmed.startsWith('rm ') || trimmed.startsWith('Remove-Item ') || trimmed.startsWith('del ')) return en ? 'Delete files or folders.' : '删除文件或文件夹。';
  if (trimmed.startsWith('pip install')) return en ? 'Use pip to install Python packages.' : '用 pip 安装 Python 包。';
  if (trimmed.startsWith('curl ') || trimmed.startsWith('wget ')) return en ? 'Download a file or send a request from/to a URL.' : '从互联网地址下载文件或发送请求。';
  if (trimmed.startsWith('docker ')) return en ? 'Perform Docker container operations.' : '执行 Docker 容器相关操作。';
  if (trimmed.startsWith('pnpm ')) return en ? 'Use pnpm (Node.js package manager) to perform an operation.' : '用 pnpm（Node.js 包管理器）执行操作。';
  return en ? 'This is a command line instruction that performs corresponding operations in the terminal.' : '这是命令行指令，会在终端中执行相应的操作。';
}

function buildCommandDictionary(command: string, lang: OutputLanguage): types.WordExplanation[] {
  const dict: types.WordExplanation[] = [];
  const parts = command.split(/\s+/);
  const en = lang === 'en';

  const known: Record<string, string> = en ? {
    'npm': 'Node.js package manager',
    'npx': 'npm package runner',
    'pnpm': 'Node.js package manager (faster)',
    'yarn': 'Node.js package manager',
    'pip': 'Python package installer',
    'git': 'Version control tool',
    'docker': 'Container management tool',
    'cd': 'Change directory',
    'ls': 'List files',
    'mkdir': 'Create folder',
    'rm': 'Delete files',
    'cp': 'Copy files',
    'mv': 'Move/rename files',
    'rmdir': 'Remove empty folder',
    'Remove-Item': 'PowerShell command to delete files or folders',
    '-r': 'Recursive (include subfolders)',
    '-Recurse': 'Recursive (include subfolder contents)',
    '-f': 'Force execution without asking',
    '-Force': 'Force execution, skip confirmation',
    '--force': 'Force execution',
    '--yes': 'Auto-answer "yes"',
    '-y': 'Auto-confirm',
    '$env:USERPROFILE': 'Current Windows user home directory path, e.g. C:\\Users\\YourName',
    '~': 'Current user home directory',
    'sudo': 'Execute with admin/superuser privileges (Linux/Mac)',
    '|': 'Pipe — passes output of the previous command to the next',
    '&&': 'AND — execute next command only if previous succeeds',
    '||': 'OR — execute next command only if previous fails',
    '>': 'Redirect — write output to file (overwrites)',
    '>>': 'Append redirect — append output to end of file',
  } : {
    'npm': 'Node.js 的包管理器',
    'npx': 'npm 的扩展执行器',
    'pnpm': 'Node.js 的包管理器（更快）',
    'yarn': 'Node.js 的包管理器',
    'pip': 'Python 的包安装工具',
    'git': '版本控制工具',
    'docker': '容器管理工具',
    'cd': '切换目录',
    'ls': '列出文件',
    'mkdir': '创建文件夹',
    'rm': '删除文件',
    'cp': '复制文件',
    'mv': '移动/重命名文件',
    'rmdir': '删除空文件夹',
    'Remove-Item': 'PowerShell 中删除文件或文件夹的命令',
    '-r': '递归处理（连同子文件夹一起）',
    '-Recurse': '递归处理（连同子文件夹内容一起）',
    '-f': '强制执行，不询问',
    '-Force': '强制执行，跳过确认',
    '--force': '强制执行',
    '--yes': '自动回答"是"',
    '-y': '自动确认',
    '$env:USERPROFILE': '当前 Windows 用户的个人目录路径，例如 C:\\Users\\你的用户名',
    '~': '当前用户的个人目录',
    'sudo': '以管理员/超级用户权限执行（Linux/Mac）',
    '|': '管道符，把前一个命令的输出传给后一个命令',
    '&&': '且符号，前面的命令成功后才执行后面的',
    '||': '或符号，前面的命令失败时才执行后面的',
    '>': '重定向，把输出写入文件（会覆盖原文件）',
    '>>': '追加重定向，把输出追加到文件末尾',
  };

  for (const part of parts) {
    const clean = part.replace(/[;,&|]$/, '');
    if (known[clean]) {
      dict.push({ word: clean, meaning: known[clean] });
    } else if (known[part]) {
      dict.push({ word: part, meaning: known[part] });
    }
  }

  return dict;
}

function buildCommandSummary(
  hasDelete: boolean, hasRecursive: boolean, hasForce: boolean,
  hasNetwork: boolean, hasConfig: boolean, hasSystem: boolean,
  lang: OutputLanguage
): string {
  const en = lang === 'en';
  const parts: string[] = [];

  if (hasDelete && hasRecursive && hasForce) {
    parts.push(en
      ? 'This command will forcefully and completely delete the specified folder and all of its contents.'
      : '这个命令会强制、完整地删除指定文件夹及其里面所有内容。');
  } else if (hasDelete) {
    parts.push(en
      ? 'This command involves deleting files or folders.'
      : '这个命令涉及删除文件或文件夹的操作。');
  }

  if (hasNetwork) parts.push(en
    ? 'It will connect to the network, fetching or sending data over the internet.'
    : '它会连接网络，从互联网获取或发送数据。');
  if (hasConfig) parts.push(en
    ? 'It will modify project or system configuration.'
    : '它会修改项目或系统的配置。');
  if (hasSystem) parts.push(en
    ? 'It affects system-level settings.'
    : '它会影响系统级别的设置。');

  if (parts.length === 0) {
    parts.push(en
      ? 'This is a terminal command that performs some routine operations.'
      : '这是一条终端命令，执行一些常规操作。');
  }

  parts.push(en
    ? 'It will not affect unrelated projects or files.'
    : '不会影响与此无关的项目和文件。');

  return parts.join('');
}

// ============================================================
// 3. 报错解释
// ============================================================

export function explainError(errorText: string, outputLang?: OutputLanguage): types.ErrorExplanation {
  const trimmed = errorText.trim();
  const lang = outputLang || 'zh';
  const en = lang === 'en';

  const mismatchHint: types.MismatchHint | undefined = !isErrorLike(trimmed) ? {
    show: true,
    message: '',
    suggestedAction: 'explainError',
  } : undefined;

  const sevGeneral: '一般' = en ? ('Moderate' as any) : '一般';
  const sevSevere: '严重' = en ? ('Severe' as any) : '严重';

  if (/unknown option/i.test(trimmed) || /unrecognized argument/i.test(trimmed)) {
    return {
      original: trimmed,
      plainChinese: en
        ? 'The program does not recognize one of the parameters or options you entered. It may be a typo or incorrect format.'
        : '程序不认识你输入的某个参数或选项。可能是拼写错误，或者这个参数格式不对。',
      possibleReasons: en ? [
        'Parameter name typo, e.g. missing dashes (-local should be --local)',
        'Parameter format does not meet requirements',
        'This program version does not support this parameter',
        'Parameter placed in the wrong position',
      ] : [
        '参数名称拼写错误，比如少写了横杠（-local 应该是 --local）',
        '参数格式不符合要求',
        '这个程序版本不支持这个参数',
        '参数放在了错误的位置',
      ],
      nextSteps: en ? [
        'Check parameter spelling, paying attention to dash count (single - vs double --)',
        'Check the program help docs for correct parameter format',
        'Try using --help to see all available parameters',
        'Check if the program version supports this parameter',
      ] : [
        '检查参数拼写是否正确，特别注意横杠数量（一个横杠 - 还是两个 --）',
        '查看程序帮助文档，确认正确的参数写法',
        '尝试使用 --help 查看所有可用参数',
        '检查程序版本是否支持这个参数',
      ],
      severity: sevGeneral,
      mismatchHint,
    };
  }

  if (/cannot find module|module not found|no module named/i.test(trimmed)) {
    return {
      original: trimmed,
      plainChinese: en
        ? 'The program cannot find a required library or module. It\'s like needing a tool that hasn\'t been installed on your computer yet.'
        : '程序找不到需要的代码库或模块。就像你要用某个工具，但是这个工具还没安装到你的电脑上。',
      possibleReasons: en ? [
        'Missing dependency — not yet installed',
        'Incorrect import or require path',
        'Package name typo',
        'Not running in the correct directory',
      ] : [
        '缺少必要的依赖包，还没有安装',
        'import 或 require 的路径写错了',
        '包名拼写错误',
        '没有在正确的目录下运行',
      ],
      nextSteps: en ? [
        'Run npm install or pip install to install the missing package',
        'Check that the import path is correct',
        'Verify package name spelling',
        'Confirm you are in the correct working directory',
      ] : [
        '运行 npm install 或 pip install 来安装缺少的包',
        '检查引入路径是否正确',
        '确认包名拼写无误',
        '确认当前运行目录正确',
      ],
      severity: sevGeneral,
      mismatchHint,
    };
  }

  if (/permission denied|access denied|EACCES|EPERM/i.test(trimmed)) {
    return {
      original: trimmed,
      plainChinese: en
        ? 'Permission denied. The program tried to access or modify a file/folder, but was blocked by the system.'
        : '没有权限执行这个操作。程序想访问或修改某个文件/文件夹，但被系统拒绝了。',
      possibleReasons: en ? [
        'Current user does not have sufficient permissions',
        'File is being used by another program',
        'System security policy blocked this operation',
        'Target file is read-only',
      ] : [
        '当前用户没有足够的权限',
        '文件正在被其他程序使用',
        '系统安全策略阻止了这个操作',
        '目标文件是只读的',
      ],
      nextSteps: en ? [
        'Try running as administrator',
        'Close other programs that may be using the file',
        'Check if the file is read-only',
        'If on a company computer, you may need to contact IT',
      ] : [
        '尝试以管理员身份运行',
        '关闭可能正在使用该文件的其他程序',
        '检查文件是否为只读属性',
        '如果是在公司电脑上，可能需要联系 IT 管理员',
      ],
      severity: sevSevere,
      mismatchHint,
    };
  }

  if (/syntax error|unexpected token|invalid syntax/i.test(trimmed)) {
    return {
      original: trimmed,
      plainChinese: en
        ? 'Code syntax error. The program encountered something it doesn\'t recognize while reading the code, like a grammatical mistake.'
        : '代码语法错误。程序在读取代码时遇到了它不认识的写法，就像中文里的病句。',
      possibleReasons: en ? [
        'Missing brackets, quotes, semicolons, or other symbols',
        'Keyword typo',
        'Incorrect indentation (especially common in Python)',
        'Illegal characters used',
      ] : [
        '缺少括号、引号、分号等符号',
        '关键字拼写错误',
        '缩进不对（Python 尤其常见）',
        '使用了不合法的字符',
      ],
      nextSteps: en ? [
        'Carefully check the code near the error location',
        'Verify brackets and quotes are properly paired',
        'Check for Chinese punctuation accidentally used in place of English punctuation',
        'For Python, check that indentation is consistent',
      ] : [
        '仔细检查报错位置附近的代码',
        '确认括号、引号是否成对出现',
        '检查是否有英文标点误写成中文标点',
        '如果是 Python，检查缩进是否统一',
      ],
      severity: sevGeneral,
      mismatchHint,
    };
  }

  if (/Cannot find name|is not defined|undefined|ReferenceError/i.test(trimmed)) {
    return {
      original: trimmed,
      plainChinese: en
        ? 'The program cannot find a variable or name you referenced. It may be a typo, or the variable wasn\'t created before use.'
        : '程序找不到你引用的某个变量或名字。可能是变量名拼错了，或者在使用变量之前没有先创建它。',
      possibleReasons: en ? [
        'Variable or function name typo',
        'Variable used before it was defined',
        'Referencing a non-existent object property',
        'Scope issue (variable not visible at this location)',
      ] : [
        '变量名或函数名拼写错误',
        '在使用变量之前没有定义它',
        '引用了不存在的对象属性',
        '作用域问题（变量在当前位置不可见）',
      ],
      nextSteps: en ? [
        'Check if the variable name is spelled correctly',
        'Confirm the variable has been defined before use',
        'Check that imports are correct',
      ] : [
        '检查变量名是否正确拼写',
        '确认变量在使用前已经被定义',
        '检查 import 是否已正确引入',
      ],
      severity: sevGeneral,
      mismatchHint,
    };
  }

  if (/npm ERR!|npm error/i.test(trimmed)) {
    return {
      original: trimmed,
      plainChinese: en
        ? 'npm (Node.js package manager) encountered an error. This could be a network issue, permission problem, or package version conflict.'
        : 'npm（Node.js 包管理器）在执行操作时遇到了错误。可能是网络问题、权限问题或包版本冲突。',
      possibleReasons: en ? [
        'Network connectivity issue — unable to download packages',
        'Version conflict between packages',
        'Incorrect package.json configuration',
        'npm cache is corrupted',
      ] : [
        '网络连接问题，无法下载包',
        '包的版本之间存在冲突',
        'package.json 配置有误',
        'npm 缓存损坏',
      ],
      nextSteps: en ? [
        'Check if the network connection is working',
        'Try running npm cache clean --force to clear the cache',
        'Delete node_modules and package-lock.json, then reinstall',
        'Check package names and versions in package.json',
      ] : [
        '检查网络连接是否正常',
        '尝试运行 npm cache clean --force 清理缓存',
        '删除 node_modules 和 package-lock.json 后重新安装',
        '检查 package.json 中包名和版本号是否正确',
      ],
      severity: sevGeneral,
      mismatchHint,
    };
  }

  return {
    original: trimmed,
    plainChinese: en
      ? 'The program encountered an error during execution. More details are needed based on the specific error message.'
      : '程序在运行过程中遇到了一个错误中断。具体原因需要根据错误信息进一步判断。',
    possibleReasons: en ? [
      'There may be a logic issue in the code',
      'The runtime environment may be incomplete',
      'A required service or dependency may not be running',
      'File paths may be incorrect',
    ] : [
      '代码中可能存在逻辑问题',
      '运行环境可能不完整',
      '依赖的软件或服务可能没有启动',
      '文件路径可能不正确',
    ],
    nextSteps: en ? [
      'Read the full error message carefully',
      'Copy the error message and search for solutions',
      'Check what was recently changed',
      'Verify the runtime environment and dependencies are complete',
    ] : [
      '仔细阅读完整的错误信息',
      '复制错误信息搜索解决方案',
      '检查最近修改了什么',
      '确认运行环境和依赖是否完整',
    ],
    severity: sevGeneral,
    mismatchHint,
  };
}

// ============================================================
// 4. 提示词优化
// ============================================================

type PromptScenario = 'dev' | 'recommendation' | 'content' | 'report' | 'business' | 'learning' | 'meeting' | 'communication' | 'general';

function detectPromptScenario(text: string): PromptScenario {
  const t = text.toLowerCase();

  // ---- 1. Dining / Travel / Recommendation ----
  const recommendationKW = [
    // ZH
    '吃饭', '餐厅', '吃什么', '去哪吃', '点菜', '外卖', '菜单', '午饭', '晚饭', '早餐',
    '火锅', '烧烤', '日料', '咖啡', '奶茶', '面馆', '家常菜', '小吃',
    '旅游', '旅行', '去哪玩', '酒店', '民宿', '机票', '火车票', '行程', '路线', '攻略',
    '购物', '推荐', '预算', '人均', '附近', '周边',
    '苏州', '上海', '北京', '杭州', '深圳', '广州', '成都', '南京', '武汉',
    '吴中', '园区', '新区', '姑苏', '相城',
    '肚子饿', '饿了', '想去', '出去玩', '周末去哪', '今天去哪',
    // EN
    'food', 'eat', 'hungry', 'dinner', 'lunch', 'breakfast', 'restaurant', 'dining',
    'meal', 'what to eat', 'where to eat', 'cafe', 'coffee', 'barbecue', 'hot pot',
    'hotpot', 'sushi', 'takeout', 'takeaway', 'delivery',
    'travel', 'trip', 'hotel', 'itinerary', 'route', 'vacation', 'weekend trip',
    'where to go', 'recommend', 'budget', 'nearby',
    'i want eat', 'i want to eat', 'i need food', 'food near',
  ];
  if (recommendationKW.some(kw => t.includes(kw))) return 'recommendation';

  // ---- 2. Content / Copywriting ----
  const contentKW = [
    '文案', '脚本', '短视频', '口播', '小红书', '公众号', '视频号', '抖音', '视频',
    '标题', '封面', '爆款', '朋友圈', '种草', '账号', '人设', 'IP',
    '品牌', '营销', '广告', 'slogan', 'tagline',
    '健康管理', '高端客户', '高净值',
    'copywriting', 'script', 'video', 'short video', 'content', 'social media',
    'post', 'caption', 'title', 'youtube', 'tiktok', 'influencer',
    'brand', 'marketing', 'advertisement',
  ];
  if (contentKW.some(kw => t.includes(kw))) return 'content';

  // ---- 3. Work Report / Summary ----
  const reportKW = [
    '日报', '周报', '月报', '总结', '汇报', '老板', '复盘',
    '会议纪要', '进度', '今天完成', '明天计划', '工作内容',
    'daily report', 'weekly report', 'summary', 'work report', 'recap',
    'meeting notes', 'progress', 'boss', 'manager', 'status update',
  ];
  if (reportKW.some(kw => t.includes(kw))) return 'report';

  // ---- 4. Business Planning ----
  const businessKW = [
    '方案', '计划书', '提案', '商业', '融资', 'BP', '投资', '估值',
    '市场分析', '竞品', 'SWOT', 'ROI', '盈利', '商业模式',
    '定价', '销售策略', '渠道', '供应链',
    'business plan', 'proposal', 'pitch', 'funding', 'investment',
    'market analysis', 'competitive', 'revenue model', 'pricing',
  ];
  if (businessKW.some(kw => t.includes(kw))) return 'business';

  // ---- 5. Learning / Education ----
  const learningKW = [
    '学习', '课程', '教程', '考证', '考试', '复习', '刷题',
    '学英语', '学编程', '入门', '进阶', '怎么学', '学习路径',
    '知识点', '练习题', '背单词', '面试题', '面试准备',
    'learn', 'study', 'course', 'tutorial', 'exam', 'certification',
    'learning path', 'practice', 'exercise', 'interview prep',
  ];
  if (learningKW.some(kw => t.includes(kw))) return 'learning';

  // ---- 6. Meeting Notes ----
  const meetingKW = [
    '会议', '开会', '讨论', '纪要', '记录', '议程', '决议',
    '参会人', '议题', '待办', 'action item', 'minutes',
    '会议记录', '会议总结', '电话会议', '视频会议',
    'meeting', 'agenda', 'minutes of meeting', 'discussion',
    'action items', 'attendees', 'conference call',
  ];
  if (meetingKW.some(kw => t.includes(kw))) return 'meeting';

  // ---- 7. Client Communication ----
  const commKW = [
    '客户', '回复', '邮件', '微信', '沟通', '投诉', '售后',
    '报价', '合同', '谈判', '催款', '道歉', '感谢信',
    '商务邮件', '客户维护', '客情',
    'client', 'customer', 'email', 'reply', 'complaint', 'negotiation',
    'contract', 'quote', 'apology', 'thank you letter', 'follow up',
  ];
  if (commKW.some(kw => t.includes(kw))) return 'communication';

  // ---- 8. Dev / Programming ----
  const devKW = [
    '代码', '网站', '插件', '页面', '报错', 'bug', 'VS Code', 'Cursor',
    'Claude Code', 'Copilot', 'npm', 'tsc', 'HTML', 'CSS',
    'JavaScript', 'TypeScript', '接口', 'API', '数据库', '组件',
    '运行', '编译', '重构', '优化页面', '前端',
    'extension', 'package.json', 'tsconfig', 'import', 'require',
    'code', 'website', 'plugin', 'app', 'error', 'fix',
    'database', 'compile', 'build', 'deploy', 'frontend', 'backend',
  ];
  if (devKW.some(kw => t.includes(kw))) return 'dev';

  // ---- 9. General ----
  return 'general';
}

export function optimizePrompt(
  rawText: string,
  outputLang?: OutputLanguage
): types.PromptOptimization {
  const trimmed = rawText.trim();
  const scenario = detectPromptScenario(trimmed);
  const lang = outputLang || 'zh';

  switch (scenario) {
    case 'recommendation': return optimizeRecommendationPrompt(trimmed, lang);
    case 'content':       return optimizeContentPrompt(trimmed, lang);
    case 'report':        return optimizeReportPrompt(trimmed, lang);
    case 'dev':           return optimizeDevPrompt(trimmed, lang);
    case 'business':      return optimizeBusinessPrompt(trimmed, lang);
    case 'learning':      return optimizeLearningPrompt(trimmed, lang);
    case 'meeting':       return optimizeMeetingPrompt(trimmed, lang);
    case 'communication': return optimizeCommunicationPrompt(trimmed, lang);
    default:              return optimizeGeneralPrompt(trimmed, lang);
  }
}

// ================================================================
// 场景专用生成器
// ================================================================

function optimizeRecommendationPrompt(raw: string, lang: OutputLanguage): types.PromptOptimization {
  const budget = raw.match(/(\d+)\s*(元|块|块钱|rmb|RMB|左右)/)?.[1];
  const city = raw.match(/(苏州|上海|北京|杭州|深圳|广州|成都|南京|武汉|西安|重庆|长沙|天津)[\w\s]*/)?.[1] || '';
  const area = raw.match(/(吴中|园区|新区|姑苏|相城|虎丘|吴江|昆山|太仓|常熟|张家港)/)?.[1] || '';
  const place = area ? `${city}${area}区` : (city || '你所在的城市');
  const budgetText = budget ? `${budget} 元` : '100 元左右';

  if (lang === 'en') {
    return {
      original: raw,
      optimized: `Act as a dining recommendation assistant and help me decide what to eat.

My situation:
${raw}

Please help me:
1. First ask me for key missing information, such as my city, area, budget, number of people, food preferences, dietary restrictions, distance, and time.
2. Based on available information, give me at least 5 food directions (e.g., casual dining, noodles, hot pot, barbecue, Japanese, local cuisine).
3. Explain what kind of situation each option is suitable for.
4. If I provide my location and budget, recommend specific nearby restaurants (6-8 options).
5. For each restaurant, include:
   · Cuisine type
   · Estimated price per person
   · Recommended dishes
   · Best for how many people
   · Suitable for solo dining?
   · Need reservation or queue?
   · Why it's recommended
6. Prioritize reliable, well-reviewed, reasonably priced options that are unlikely to disappoint.
7. End with a single "best pick" recommendation — do not just leave me with a list.
8. If restaurant hours, prices, or availability may change, remind me to verify current information online.

Output format:
- Quick recommendation
- Food directions
- Missing information I should provide
- Best next step

Do not give vague advice. Help me make a practical, specific choice.`,
      improvements: [
        'Structured vague "what to eat" into actionable recommendation steps',
        'Preserved budget and location constraints',
        'Asks for missing information before guessing',
        'Requires concrete restaurant details and a best pick',
        'Includes information freshness disclaimer',
      ],
    };
  }

  return {
    original: raw,
    optimized: `请你作为${place}本地生活推荐助手，帮我解决吃什么的问题。

我的情况：
${raw}

请你按下面方式帮我推荐：

1. 先根据我的预算和位置，给我 5 个适合的方向，比如家常菜、火锅、日料、烧烤、面馆、小馆子等。
2. 每个方向简要说明适合我的原因。
3. 再推荐 6-8 家${place}附近适合人均 ${budgetText} 的餐厅。
4. 每家请说明：
   · 餐厅类型
   · 大概人均
   · 推荐菜
   · 适合几个人去
   · 适不适合一个人吃
   · 是否需要提前排队或预约
   · 推荐理由
5. 优先推荐口碑稳定、距离方便、价格不超太多、不容易踩雷的选择。
6. 最后直接给我一个"最推荐去吃的选择"，不要只列清单。
7. 如果餐厅营业时间、地址、价格可能变化，请提醒我核实最新信息。`,
    improvements: [
      '拆解了"不知道吃什么"为可执行推荐步骤',
      '保留了预算、位置等关键约束',
      '要求给出具体方向而非简单列表',
      '要求综合判断给出"最推荐"而非让用户自己选',
      '加入了信息时效性提醒',
    ],
  };
}

function optimizeContentPrompt(raw: string, lang: OutputLanguage): types.PromptOptimization {
  if (lang === 'en') {
    return {
      original: raw,
      optimized: `Act as a professional copywriter and content strategist. Help me create engaging short-form video content.

My request:
${raw}

Content goals:
Help the target audience understand the core message, feel resonance, and want to share.

Requirements:
1. Start with a strong hook that grabs attention immediately.
2. Use refined, restrained, professional language — no hype, no exaggeration.
3. Structure: hook → development → emotional payoff.
4. Output 1 video script (approx. 60 seconds) plus 3 title options.
5. Avoid exaggerated claims or clickbait language.
6. Do not use templates — create original, specific content.
7. If referencing data, cite sources or note if it's an estimate.`,
      improvements: [
        'Defined clear role: professional copywriter',
        'Broke down creative goals into concrete deliverables',
        'Emphasized refined, restrained tone',
        'Required 1 script + 3 titles as complete package',
      ],
    };
  }
  return {
    original: raw,
    optimized: `请你作为专业文案策划，帮我创作内容。

我的需求：
${raw}

创作目标：
让目标受众理解核心观点，产生共鸣和传播意愿。

具体要求：
1. 开头要有强观点，能抓住目标受众注意力。
2. 语言要高级、克制、专业，不要恐吓，不要夸大。
3. 结构包含：开头钩子、正文递进、结尾升华。
4. 输出 1 条适合短视频平台的口播文案（约 60 秒），并额外给 3 个标题。
5. 不要套模板，不要堆砌形容词，不要加感叹号堆叠。
6. 如果需要引用数据，请标明来源或说明是否为估算。`,
    improvements: [
      '明确了创作目标为具体执行步骤',
      '加入了风格参考，避免产出太泛',
      '要求输出 1 条文案 + 3 个标题的完整交付物',
    ],
  };
}

function optimizeReportPrompt(raw: string, lang: OutputLanguage): types.PromptOptimization {
  if (lang === 'en') {
    return {
      original: raw,
      optimized: `Act as a work report writing assistant. Help me organize today's work into a concise status update.

My situation today:
${raw}

Please structure the output as:
1. Today's completed tasks
2. Key progress and milestones
3. Issues encountered and how they were resolved
4. Next steps and plan

Requirements:
1. Professional, clear, and concise language.
2. Highlight key achievements and milestone progress.
3. Include problem-solving details but don't get too granular.
4. Output a version ready to copy and send.
5. Do not fabricate anything I haven't done.`,
      improvements: [
        'Defined four-section report structure',
        'Emphasizes key achievements over task log',
        'Keeps professional workplace tone',
        'Balances detail level appropriately',
      ],
    };
  }
  return {
    original: raw,
    optimized: `请你作为职场日报写作助手，帮我把今天的工作内容整理成一段可以直接发给老板的日报。

我的今日情况：
${raw}

请你按下面结构输出：
1. 今日完成工作
2. 关键进展
3. 遇到的问题与解决方式
4. 后续计划

要求：
1. 语言正式、清楚、简洁。
2. 不要太口语化。
3. 重点突出关键成果和里程碑进展。
4. 可以适当体现排查过程和技术推进难度，但不要写太细碎。
5. 最后输出一版可直接复制发送的日报内容。
6. 不要虚构我没有做过的事情。`,
    improvements: [
      '定义了日报四段结构',
      '要求突出关键成果而非流水账',
      '保持了正式职场语气',
      '提示可体现推进难度但不要过细',
    ],
  };
}

function optimizeDevPrompt(raw: string, lang: OutputLanguage): types.PromptOptimization {
  const isUI = /高级|好看|大气|洋气|土|漂亮|美观|酷|炫|UI|界面|设计|样式|CSS|颜色|配色|design|style|beautiful|ugly|interface|look/.test(raw);
  const isBug = /报错|bug|错误|Error|修复|修好|不好使|不能用|坏了|fix|broken|not working|crash/.test(raw);

  if (isUI) {
    if (lang === 'en') {
      return {
        original: raw,
        optimized: `Act as a frontend UI design and code optimization assistant. Help me improve the visual design of my page.

Goal:
Make the page more polished, restrained, and product-grade.

Requirements:
1. Keep existing page structure and functionality — do not remove existing modules.
2. Optimize typography hierarchy, spacing, cards, buttons, colors, and interaction effects.
3. Style reference: Apple, Linear, Raycast, Notion — clean and refined.
4. Before making changes, list which files will be modified and let me confirm.
5. After changes, summarize what was changed and whether other pages are affected.
6. Do not introduce heavy frameworks — work within the current structure.
7. If terminal commands are needed, explain what they do and their risk level first.`,
        improvements: [
          'Broke down "look better" into specific design elements',
          'Requires file list before changes for transparency',
          'Constrained style references to avoid wild interpretation',
          'Added risk disclosure step for commands',
        ],
      };
    }
    return {
      original: raw,
      optimized: `请你作为前端 UI 设计和代码优化助手，帮我优化当前页面的视觉效果。

目标：
让页面更高级、更克制、更像成熟产品界面。

具体要求：
1. 保留现有页面结构和功能，不删除已有模块。
2. 优化字体层级、留白、卡片、按钮、颜色和交互动效。
3. 风格参考苹果系、Linear、Raycast、Notion 的克制高级感。
4. 修改前先列出会改哪些文件，让我确认。
5. 修改后总结具体改动，并说明是否影响其他页面。
6. 不要引入复杂框架，优先在当前结构内完成。
7. 如果需要执行命令，请先说明命令的作用和风险。`,
      improvements: [
        '把"高级"拆解为字体、留白、颜色、动效等具体要素',
        '要求先列文件再修改，增加安全感和透明度',
        '限定了风格参考，避免 AI 自由发挥',
        '加入了风险告知步骤',
      ],
    };
  }

  if (isBug) {
    if (lang === 'en') {
      return {
        original: raw,
        optimized: `Act as a debugging and troubleshooting assistant. Help me identify and fix the following issue:

Problem description:
${raw}

Debugging requirements:
1. First, infer possible causes based on the description.
2. List files and configurations that need to be checked.
3. Provide 2-3 most likely fixes, ranked by recommendation priority.
4. For each fix, explain the expected outcome and possible side effects.
5. Before running any commands, explain what they do and their risk level — wait for my confirmation.
6. After fixing, explain the root cause so I can avoid it in the future.`,
        improvements: [
          'Broke down vague "fix it" into diagnose → infer → fix → review',
          'Requires multiple solutions with priority ranking',
          'Explains root cause for learning',
          'Added command risk disclosure safety mechanism',
        ],
      };
    }
    return {
      original: raw,
      optimized: `请你作为代码调试和问题排查助手，帮我定位并修复以下问题：

问题描述：
${raw}

排查要求：
1. 先根据描述推断可能的错误原因。
2. 列出需要检查的文件和配置。
3. 给出 2-3 个最可能的修复方案，按推荐优先级排序。
4. 每个方案说明修复后的预期结果和可能的副作用。
5. 需要执行命令时，先说明命令作用和风险，等我确认。
6. 修复成功后，解释这个 bug 的根本原因，方便我以后避免。`,
      improvements: [
        '把模糊的"修好"拆解为排查→推断→修复→复盘四步',
        '要求多方案排序，让用户有选择权',
        '要求解释根本原因，帮助用户学习',
        '加入了命令风险告知的安全机制',
      ],
    };
  }

  // Default dev prompt
  if (lang === 'en') {
    return {
      original: raw,
      optimized: `Act as a programming assistant. Help me with the following task:

Request:
${raw}

Execution requirements:
1. First analyze the request — tell me your understanding and approach.
2. List files to create or modify.
3. Implement step by step — confirm with me after important steps.
4. After completion, summarize what changed, why, and whether other modules are affected.
5. Before running terminal commands, explain what they do and their risk level.`,
      improvements: [
        'Established "analyze first, then act" workflow',
        'Requires step-by-step confirmation to reduce errors',
        'Requires summary of changes and impact',
        'Added command risk disclosure safety mechanism',
      ],
    };
  }
  return {
    original: raw,
    optimized: `请你作为编程开发助手，帮我完成以下任务：

需求：
${raw}

执行要求：
1. 先分析需求，告诉我你的理解和实现思路。
2. 列出需要创建或修改的文件。
3. 分步骤实现，重要步骤完成后向我确认。
4. 完成后用中文总结改了什么、为什么这样改、是否影响其他模块。
5. 如果需要执行终端命令，请先说明命令作用和风险等级。`,
    improvements: [
      '明确了"先分析再动手"的流程',
      '要求分步骤确认，降低出错风险',
      '要求中文总结，适合非程序员理解',
      '加入了命令风险告知的安全机制',
    ],
  };
}

function optimizeBusinessPrompt(raw: string, lang: OutputLanguage): types.PromptOptimization {
  if (lang === 'en') {
    return {
      original: raw,
      optimized: `Act as a business consultant and planning expert. Help me structure my business ideas into an actionable plan.

My request:
${raw}

Please structure the output as:
1. Core problem definition: What is the essential problem I'm solving?
2. Market & competitive overview: Current landscape, main competitors, and their strengths.
3. Target user profile: Who is my core user and what are their pain points?
4. Business model summary: Revenue streams, cost structure, breakeven estimate.
5. SWOT analysis: Strengths, Weaknesses, Opportunities, Threats.
6. Execution roadmap: 3 phases with goals, key actions, and metrics per phase.
7. Risks & mitigation: 3-5 biggest risks with contingency plans.
8. Next action items: 5 things I can start this week.

Requirements:
1. Data-driven — cite sources for any industry data referenced.
2. Be specific and actionable — no vague theoretical frameworks.
3. If information is insufficient, list what I need to provide first.`,
      improvements: [
        'Provided complete eight-section business plan framework',
        'Requires data-driven analysis, not vague suggestions',
        'Includes phased execution roadmap',
        'Lists concrete next actions',
      ],
    };
  }
  return {
    original: raw,
    optimized: `请你作为商业顾问和方案策划专家，帮我梳理商业思路并输出可执行的方案。

我的需求：
${raw}

请你按以下框架输出：
1. 核心问题定义：我要解决的本质问题是什么？
2. 市场与竞品概览：当前市场格局、主要竞品及各自优势。
3. 目标用户画像：谁是我的核心用户，他们有什么痛点。
4. 商业模式简述：如何赚钱、核心成本结构、盈亏平衡预估。
5. SWOT 分析：优势、劣势、机会、威胁。
6. 执行路线图：分 3 个阶段，每阶段的目标、关键动作、衡量指标。
7. 风险与应对：列出 3-5 个最大风险及应对预案。
8. 下一步行动清单：本周可以开始做的 5 件事。

要求：
1. 数据驱动，如有行业数据请引用来源。
2. 不要只说"要做市场调研"，给出具体的调研方法和问题清单。
3. 如果信息不足，先列出需要我补充的关键信息。
4. 方案要具体可落地，不要只堆砌理论框架。`,
    improvements: [
      '提供了完整的商业方案八段结构',
      '要求数据驱动，避免空泛建议',
      '给出了分阶段执行路线图',
      '明确了下一步可操作的具体行动',
    ],
  };
}

function optimizeLearningPrompt(raw: string, lang: OutputLanguage): types.PromptOptimization {
  if (lang === 'en') {
    return {
      original: raw,
      optimized: `Act as a learning path planner. Help me design an effective study plan.

My learning goal:
${raw}

Please structure the output as:
1. Goal clarification: Turn my vague goal into specific, measurable objectives.
2. Prerequisites: What foundation do I need? What should I learn or review first?
3. Learning path: 3-4 phases, each with:
   · Content & key concepts
   · Recommended resources (books, courses, websites, projects — note free/paid)
   · Suggested time investment
   · Checkpoint: how to know I've mastered this phase
4. Study methods: Most effective techniques for this domain (e.g., spaced repetition, project-based learning, Feynman technique).
5. Common mistakes: 5 most frequent beginner pitfalls in this field.
6. Practice exercises: From easy to hard, with real projects.
7. Next directions: Where to go after mastering the basics.

Requirements:
1. Recommend specific resources — name the book, course, or website.
2. Time estimates must be realistic for part-time learners.
3. Do not overpromise results (no "master X in 30 days" claims).
4. If certification is involved, note exam dates, registration, and pass rates.`,
      improvements: [
        'Turned vague "want to learn" into phased, executable path',
        'Requires specific resource recommendations',
        'Includes common pitfalls and how to avoid them',
        'Maintains realistic expectations — no exaggerated promises',
      ],
    };
  }
  return {
    original: raw,
    optimized: `请你作为学习路径规划师，帮我制定科学高效的学习计划。

我的学习需求：
${raw}

请你按以下结构输出：
1. 学习目标明确化：帮我把模糊目标转化为可衡量的具体目标。
2. 前置知识与能力评估：学这个需要什么基础？我现在应该先补什么？
3. 学习路径图：分 3-4 个阶段，每阶段：
   · 学习内容与知识点
   · 推荐资源（书、课程、网站、项目，标注免费/付费）
   · 建议时间投入
   · 阶段检验标准（怎么判断自己学会了）
4. 学习方法建议：针对这个领域最高效的学习方法（如费曼学习法、项目驱动、间隔重复等）。
5. 常见误区与避坑：这个领域新手最容易犯的 5 个错误。
6. 实战练习清单：从小到大、从易到难的练习/项目。
7. 进阶方向：学完基础后可以往哪个方向发展。

要求：
1. 资源推荐要具体到书名、课程名、网站名，不要只说"找本书看"。
2. 时间规划要现实可行，考虑业余时间学习的场景。
3. 不要过度承诺学习效果（如"30 天精通"），保持务实。`,
    improvements: [
      '把模糊的"想学"转化为分阶段可执行路径',
      '要求推荐具体资源而非泛泛而谈',
      '加入了常见误区和避坑建议',
      '保持了务实态度，不夸大学习效果',
    ],
  };
}

function optimizeMeetingPrompt(raw: string, lang: OutputLanguage): types.PromptOptimization {
  if (lang === 'en') {
    return {
      original: raw,
      optimized: `Act as a meeting efficiency assistant. Help me organize meeting information.

Meeting context:
${raw}

Please structure the output as:
1. Meeting basics: Topic/purpose, attendees, time/location.
2. Key discussion points (prioritized).
3. Decisions & conclusions:
   · Items with consensus
   · Items needing further discussion
4. Action items: Who does what by when, with dependencies noted.
5. Next meeting preview: Suggested topics, materials to prepare.
6. Meeting effectiveness assessment & improvement suggestions.

Requirements:
1. Action items must be specific: "Who completes what by what deadline".
2. Language should be concise and professional.
3. Clearly distinguish "conclusions" from "discussion points".
4. Optionally generate a ready-to-send meeting minutes email version.`,
      improvements: [
        'Provided complete six-section meeting management structure',
        'Action items use clear responsibility-deadline format',
        'Distinguishes conclusions from discussion',
        'Can generate ready-to-send meeting minutes',
      ],
    };
  }
  return {
    original: raw,
    optimized: `请你作为会议效率助手，帮我组织和整理会议信息。

会议相关内容：
${raw}

请按以下格式输出：
1. 会议基本信息梳理：主题/目的、参会人员、时间地点。
2. 核心议题与讨论要点（按优先级排序）。
3. 关键决议与结论：已达成共识的事项、待进一步讨论的事项。
4. 行动项（Action Items）清单：谁负责什么、截止时间、依赖条件。
5. 下次会议预告：建议议题、需要提前准备的材料。
6. 会议效率评估与改进建议。

要求：
1. 行动项要具体明确，用"谁在什么时间前完成什么"的格式。
2. 语言简洁专业，适合职场场景。
3. 区分"结论"和"讨论过程中的观点"，避免混淆。`,
    improvements: [
      '提供了完整的会议管理六段结构',
      '行动项用明确的责任-时间-任务格式',
      '区分结论与讨论过程，避免混淆',
    ],
  };
}

function optimizeCommunicationPrompt(raw: string, lang: OutputLanguage): types.PromptOptimization {
  if (lang === 'en') {
    return {
      original: raw,
      optimized: `Act as a business communication advisor. Help me draft professional, appropriate communication.

Communication need:
${raw}

Please:
1. First analyze the communication scenario:
   · Who is the recipient (client/manager/colleague/partner)?
   · What is the goal (persuade/apologize/follow up/negotiate/report/thank)?
   · What are their likely concerns or positions?
2. Communication strategy:
   · Recommended tone and approach
   · What to emphasize and what to avoid
3. Draft the full message (email/chat/call script):
   · Opening greeting
   · Body (clear, logical, layered)
   · Closing and next steps
4. Provide 3 alternative versions (e.g., formal, gentle, direct).
5. Contingency responses:
   · If they decline or push back, how to respond
   · If they make additional requests, how to handle

Requirements:
1. Professional, appropriate, measured tone for business context.
2. For sensitive communications (payment reminders, complaints), be firm but polite.
3. Do not fabricate information — use [brackets] for details I need to fill in.`,
      improvements: [
        'Analyzes scenario before drafting, ensuring strategic fit',
        'Provides multiple tone versions to choose from',
        'Includes contingency response scripts',
        'Uses brackets for missing info instead of guessing',
      ],
    };
  }
  return {
    original: raw,
    optimized: `请你作为商务沟通顾问，帮我起草专业得体的沟通内容。

沟通需求：
${raw}

请你按以下方式输出：
1. 先分析沟通场景：沟通对象是谁（客户/领导/同事/合作伙伴）、沟通目的是什么（说服/道歉/催款/感谢/汇报/谈判）、对方的可能立场和顾虑。
2. 沟通策略建议：推荐用什么语气和切入点、应该强调什么、避免什么。
3. 输出完整沟通内容（邮件/微信/电话话术）：开头称呼与寒暄、正文、结尾与下一步。
4. 提供 3 个不同风格的备选版本（如：正式版、温和版、直接版）。
5. 常见应对预案：如果对方推脱/拒绝，应该怎么回复；如果对方提出额外要求，怎么应对。

要求：
1. 语言专业、得体、有分寸感，符合商务场景。
2. 如果是催款/投诉类敏感沟通，语气要坚定但有礼貌。
3. 不虚构我没有说过的信息，不确定的地方用方括号标注让我补充。`,
    improvements: [
      '先分析场景再写内容，确保策略对路',
      '提供多个风格版本供选择',
      '加入了常见应对预案',
      '考虑到商务场景的人情和关系维护',
    ],
  };
}

function optimizeGeneralPrompt(raw: string, lang: OutputLanguage): types.PromptOptimization {
  if (lang === 'en') {
    return {
      original: raw,
      optimized: `Act as a problem-solving and planning assistant. Help me turn this vague request into a clear, actionable plan.

My request:
${raw}

Please help me:
1. First determine what problem I'm really trying to solve.
2. Break down the key goals and constraints.
3. Provide 3-5 actionable directions.
4. Briefly explain the pros and cons of each direction.
5. End with the most recommended approach.
6. If information is insufficient, list the questions I need to answer first.
7. Avoid programming/development templates unless the problem actually involves code.`,
      improvements: [
        'Turned vague request into "problem → goals → directions → plan"',
        'Preserved original input without replacement',
        'Requires AI to confirm understanding before acting',
        'Does not assume programming context — works for life/work/study',
      ],
    };
  }
  return {
    original: raw,
    optimized: `请你作为问题拆解和执行规划助手，帮我把下面这个模糊需求拆解成清晰可执行的方案。

我的原始需求：
${raw}

请你帮我：
1. 先判断我真正想解决的问题是什么。
2. 拆解关键目标和限制条件。
3. 给出 3-5 个可执行方向。
4. 每个方向简要说明优缺点。
5. 最后给出最推荐的执行方案。
6. 如果信息不足，请先列出需要我补充的问题。
7. 回答时避免套用编程/开发模板，除非问题本身涉及代码。`,
    improvements: [
      '把模糊需求拆解为"问题→目标→方向→方案"',
      '保留了用户的原始信息不被替换',
      '要求 AI 先确认再行动，而非直接假设',
      '不预设编程场景，适用于生活/工作/学习等各类问题',
    ],
  };
}

// ============================================================
// 6. 智能分析 (v0.2) —— 自动检测输入类型并路由
// ============================================================

export function smartAnalyze(
  text: string,
  settings?: Partial<UserSettings>
): types.SmartAnalysisResult {
  const trimmed = text.trim();
  const outputLang = settings?.outputLanguage || 'zh';

  // 1. Detect content type
  let detectionType: types.DetectionType = 'mixed';
  let detectionLabel = 'Mixed Content';

  const isCode = isCSS(trimmed) || isHTML(trimmed) || isPython(trimmed) || isJSON(trimmed)
    || isJS(trimmed) || isHybridCode(trimmed) || isShell(trimmed) || isTerminalLog(trimmed);
  const isCmd = isCommandLike(trimmed);
  const isErr = isErrorLike(trimmed);
  const isNatural = !isCode && !isCmd && !isErr;

  if (isErr && !isCode) {
    detectionType = 'error';
    detectionLabel = outputLang === 'en' ? 'Error Log' : '报错日志';
  } else if (isCmd && !isErr && !isCode) {
    detectionType = 'command';
    detectionLabel = outputLang === 'en' ? 'Terminal Command' : '终端命令';
  } else if (isCode && !isCmd && !isErr) {
    detectionType = 'code';
    detectionLabel = outputLang === 'en' ? 'Code' : '代码';
  } else if (isCode && isCmd && !isErr) {
    detectionType = 'command';
    detectionLabel = outputLang === 'en' ? 'Terminal Command' : '终端命令';
  } else if (isNatural && trimmed.length > 10) {
    detectionType = 'naturalLang';
    detectionLabel = outputLang === 'en' ? 'Natural Language' : '自然语言需求';
  }

  // 2. Decide recommended action
  let recommendedAction: types.SmartAnalysisResult['recommendedAction'];
  let recommendedLabel: string;

  if (detectionType === 'naturalLang') {
    recommendedAction = 'optimizePrompt';
    recommendedLabel = outputLang === 'en' ? 'Prompt Optimizer' : '优化提示词';
  } else if (detectionType === 'code') {
    if (isShell(trimmed) || isTerminalLog(trimmed)) {
      recommendedAction = 'explainSafety';
      recommendedLabel = outputLang === 'en' ? 'Command Safety' : '命令安全分析';
    } else {
      recommendedAction = 'explainCode';
      recommendedLabel = outputLang === 'en' ? 'Code Explainer' : '解释代码';
    }
  } else if (detectionType === 'command') {
    recommendedAction = 'explainSafety';
    recommendedLabel = outputLang === 'en' ? 'Command Safety' : '命令安全分析';
  } else if (detectionType === 'error') {
    recommendedAction = 'explainError';
    recommendedLabel = outputLang === 'en' ? 'Error Translator' : '报错翻译';
  } else {
    recommendedAction = 'explainCode';
    recommendedLabel = outputLang === 'en' ? 'Code Explainer' : '解释代码';
  }

  // 3. Execute recommended action
  const result: types.SmartAnalysisResult = {
    detectionType,
    detectionLabel,
    recommendedAction,
    recommendedLabel,
    summary: '',
    suggestions: [],
  };

  if (recommendedAction === 'explainCode') {
    result.codeResult = explainCode(trimmed, outputLang);
    result.summary = result.codeResult.summary;
    result.suggestions = outputLang === 'en'
      ? ['Check line-by-line explanation to understand each line', 'Review key terms to learn technical vocabulary']
      : ['查看逐行解释了解每行代码的作用', '查看逐词拆解学习专业术语'];
  } else if (recommendedAction === 'explainSafety') {
    result.safetyResult = explainCommandSafety(trimmed, outputLang);
    result.summary = result.safetyResult.summary;
    result.suggestions = [
      `${outputLang === 'en' ? 'Risk Level' : '风险等级'}：${result.safetyResult.riskLevel}`,
      result.safetyResult.suggestion,
    ];
  } else if (recommendedAction === 'explainError') {
    result.errorResult = explainError(trimmed, outputLang);
    result.summary = result.errorResult.plainChinese;
    result.suggestions = result.errorResult.nextSteps;
  } else if (recommendedAction === 'optimizePrompt') {
    result.promptResult = optimizePrompt(trimmed, outputLang);
    result.summary = outputLang === 'en'
      ? 'Your natural language request has been optimized into an AI-ready prompt'
      : '已将你的自然语言需求优化为 AI 可执行的提示词';
    result.suggestions = outputLang === 'en'
      ? ['Copy the optimized prompt and send it to ChatGPT, Claude, or other AI tools', ...result.promptResult.improvements]
      : ['点击复制优化后的提示词，发给 ChatGPT / Claude 等 AI 工具', ...result.promptResult.improvements];
  }

  return result;
}

// ============================================================
// 5. 从解释结果中提取词典条目
// ============================================================

export function extractDictionaryEntries(
  result: types.ExplanationResult | types.SafetyResult
): types.DictionaryEntry[] {
  const entries: types.DictionaryEntry[] = [];
  const now = new Date().toISOString().slice(0, 10);

  if ('wordByWord' in result) {
    for (const w of result.wordByWord) {
      entries.push({ word: w.word, meaning: w.meaning, learnedAt: now });
    }
  }

  return entries;
}
