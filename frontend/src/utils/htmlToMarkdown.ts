import TurndownService from 'turndown';
import type { Node } from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
  emDelimiter: '*',
  strongDelimiter: '**',
});
const headingLevels = new WeakMap<Node, number>();

function parseCssPixels(value: string | null): number | null {
  if (!value) return null;
  const match = value.match(/(-?\d+(?:\.\d+)?)\s*(px|pt|em|rem)/i);
  if (!match) return null;
  const number = Number(match[1]);
  switch (match[2].toLowerCase()) {
    case 'pt': return number * 1.333;
    case 'em':
    case 'rem': return number * 16;
    default: return number;
  }
}

function getHeadingLevelFromVisualStyle(node: Node): number | null {
  const el = node as unknown as HTMLElement;
  if (!el.getAttribute || /^H[1-6]$/.test(node.nodeName)) return null;

  const role = (el.getAttribute('role') || '').toLowerCase();
  const ariaLevel = Number(el.getAttribute('aria-level'));
  if (role === 'heading' && ariaLevel >= 1 && ariaLevel <= 6) return ariaLevel;

  const cls = (el.getAttribute('class') || '').toLowerCase();
  const classLevel = cls.match(/(?:^|\s)(?:h|heading-?)([1-6])(?:$|\s)/);
  if (classLevel) return Number(classLevel[1]);
  if (/\b(article-title|post-title|headline|heading|title)\b/.test(cls)) return 2;

  const utilitySize = cls.match(/(?:^|\s)text-(4xl|3xl|2xl|xl)(?:$|\s)/);
  if (utilitySize) {
    return ({ '4xl': 1, '3xl': 1, '2xl': 2, xl: 3 } as Record<string, number>)[utilitySize[1]];
  }

  // Clipboard HTML from X and some rich editors often flattens headings into
  // div/span elements. Only promote clearly larger, short blocks so ordinary
  // paragraphs that happen to be bold remain paragraphs.
  const style = (el.getAttribute('style') || '').toLowerCase();
  const fontSize = parseCssPixels(style.match(/font-size\s*:\s*([^;]+)/)?.[1] ?? null);
  const fontWeight = style.match(/font-weight\s*:\s*([^;]+)/)?.[1]?.trim() || '';
  const weight = fontWeight === 'bold' ? 700 : Number(fontWeight);
  const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
  const isBlock = /^(DIV|P|SECTION|ARTICLE|HEADER|LI|H[1-6])$/.test(node.nodeName);
  if (!isBlock || !fontSize || !text || text.length > 180) return null;

  // Use absolute sizes when available; relative units are intentionally only
  // accepted when the element is also visibly bold.
  if (fontSize >= 28) return 1;
  if (fontSize >= 22) return 2;
  if (fontSize >= 19 && weight >= 600) return 3;
  return null;
}

// Recover headings that were copied as styled blocks rather than <h1>-<h6>.
// This rule must run before boldStyle, otherwise a heading's bold font would
// be emitted as ordinary **bold text**.
turndown.addRule('headingVisualStyle', {
  filter(node: Node) {
    const level = getHeadingLevelFromVisualStyle(node);
    if (level) headingLevels.set(node, level);
    return level !== null;
  },
  replacement(content, node) {
    const level = headingLevels.get(node) ?? 2;
    return `\n\n${'#'.repeat(level)} ${content.trim()}\n\n`;
  },
});

// 启用 GFM 插件（表格、删除线、任务列表）。自定义表格规则紧随其后，覆盖默认表格实现。
turndown.use(gfm);

/**
 * GFM 表格要求每一行列数一致。浏览器剪贴板经常带有 colspan/rowspan，
 * 交给默认规则会把单元格内容错位，因此先展开成规则矩阵再输出。
 */
turndown.addRule('tableToGfm', {
  filter: 'table',
  replacement(_content, node) {
    const table = node as unknown as HTMLTableElement;
    const matrix: string[][] = [];
    const occupied = new Map<string, string>();
    let maxColumns = 0;
    const rows = Array.from(table.rows).filter(row => row.cells.length > 0 && row.textContent?.trim());

    rows.forEach((row, rowIndex) => {
      const values = matrix[rowIndex] ?? (matrix[rowIndex] = []);
      let column = 0;
      Array.from(row.cells).forEach(cell => {
        while (occupied.has(`${rowIndex}:${column}`)) column += 1;
        const html = (cell as HTMLElement).innerHTML || '';
        const value = turndown.turndown(html).replace(/\s+/g, ' ').trim().replace(/\|/g, '\\|') || ' ';
        const tableCell = cell as HTMLTableCellElement;
        const colspan = Math.max(1, tableCell.colSpan || Number(cell.getAttribute('colspan')) || 1);
        const rowspan = Math.max(1, tableCell.rowSpan || Number(cell.getAttribute('rowspan')) || 1);
        for (let y = 0; y < rowspan; y += 1) {
          const target = matrix[rowIndex + y] ?? (matrix[rowIndex + y] = []);
          for (let x = 0; x < colspan; x += 1) {
            const targetColumn = column + x;
            target[targetColumn] = value;
            if (y > 0) occupied.set(`${rowIndex + y}:${targetColumn}`, value);
          }
        }
        column += colspan;
      });
      maxColumns = Math.max(maxColumns, ...matrix.slice(rowIndex).map(current => current.length), values.length);
    });

    if (!maxColumns || !matrix.length) return '';
    const normalized = matrix.map(row => Array.from({ length: maxColumns }, (_, index) => row[index] || ' '));
    const header = normalized[0];
    const separator = header.map(() => '---');
    const body = normalized.slice(1);
    // Markdown 表格必须有表头；无 th 的 HTML 表格按第一行作为表头。
    return `\n\n| ${header.join(' | ')} |\n| ${separator.join(' | ')} |${body.length ? `\n${body.map(row => `| ${row.join(' | ')} |`).join('\n')}` : ''}\n\n`;
  },
});


function getVisibleUrl(node: Node): string | null {
  if (node.nodeName !== 'A') return null;
  const text = (node.textContent || '').replace(/\s+/g, ' ').trim();
  if (/^(?:https?|ftp):\/\/[^\s<>]+$/i.test(text)) return text;
  return null;
}

// 网页（尤其是 X）经常把真实 URL 作为链接文字，但 href 指向 t.co 等
// 追踪短链。笔记中保留可读的真实地址，避免生成
// [https://example.com](https://t.co/...) 这种内容。
turndown.addRule('visibleUrlLink', {
  filter(node: Node) {
    return getVisibleUrl(node) !== null;
  },
  replacement(_content, node) {
    return getVisibleUrl(node) || _content;
  },
});

// 加粗：识别 style="font-weight:bold/700" 和 class="bold/font-bold/fw-bold"
// 跳过 h1-h6 标签（标题标签的 font-weight:bold 不应转为加粗）
turndown.addRule('boldStyle', {
  filter(node: Node) {
    if (/^H[1-6]$/.test(node.nodeName)) return false;
    if (getHeadingLevelFromVisualStyle(node) !== null) return false;
    const el = node as unknown as HTMLElement;
    if (!el.getAttribute) return false;
    const style = (el.getAttribute('style') || '').toLowerCase();
    const cls = (el.getAttribute('class') || '').toLowerCase();
    if (/font-weight\s*:\s*(bold|[7-9]\d{2})/.test(style)) return true;
    if (/\b(bold|font-bold|fw-bold|text-bold)\b/.test(cls)) return true;
    return false;
  },
  replacement(content) {
    const trimmed = content.trim();
    if (!trimmed) return content;
    return `**${trimmed}**`;
  },
});

// 斜体：识别 style="font-style:italic" 和 class="italic"
turndown.addRule('italicStyle', {
  filter(node: Node) {
    const el = node as unknown as HTMLElement;
    if (!el.getAttribute) return false;
    const style = (el.getAttribute('style') || '').toLowerCase();
    const cls = (el.getAttribute('class') || '').toLowerCase();
    if (/font-style\s*:\s*italic/.test(style)) return true;
    if (/\b(italic|font-italic|text-italic)\b/.test(cls)) return true;
    return false;
  },
  replacement(content) {
    const trimmed = content.trim();
    if (!trimmed) return content;
    return `*${trimmed}*`;
  },
});

// 标题：识别 class="h1/h2/h3/heading/title" 等非语义化标题
turndown.addRule('headingClass', {
  filter(node: Node) {
    // 只处理非标准 h1-h6 标签
    if (/^H[1-6]$/.test(node.nodeName)) return false;
    const el = node as unknown as HTMLElement;
    if (!el.getAttribute) return false;
    const cls = (el.getAttribute('class') || '').toLowerCase();
    const match = cls.match(/\bh([1-6])\b/);
    if (match) {
      headingLevels.set(node, parseInt(match[1], 10));
      return true;
    }
    if (/\b(heading|title)\b/.test(cls) && /^(DIV|P|SPAN|SECTION)$/.test(node.nodeName)) {
      headingLevels.set(node, 2);
      return true;
    }
    return false;
  },
  replacement(content, node) {
    const level = headingLevels.get(node) ?? 2;
    const prefix = '#'.repeat(level);
    return `\n\n${prefix} ${content.trim()}\n\n`;
  },
});

// 删除线
turndown.addRule('strikethrough', {
  filter: ['del', 's'],
  replacement: (content) => `~~${content}~~`,
});

// 处理带 SVG 图标或复杂结构的 <pre> 代码块
// 很多网站（如 GitHub、技术博客）在代码块顶部添加 SVG 语言图标
turndown.addRule('preCodeBlock', {
  filter(node: Node) {
    if (node.nodeName !== 'PRE') return false;
    const el = node as unknown as HTMLElement;
    // 包含 <code> 子元素，或包含 SVG 图标
    return !!(el.querySelector('code') || el.querySelector('svg'));
  },
  replacement(_content, node) {
    const el = node as unknown as HTMLElement;
    const codeEl = el.querySelector('code');
    const target = codeEl || el;
    // 先把 <br> 转为换行符，再提取 textContent
    const cloned = target.cloneNode(true) as HTMLElement;
    cloned.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
    // 移除 SVG 图标
    cloned.querySelectorAll('svg').forEach(svg => svg.remove());
    const text = cloned.textContent || '';
    // 尝试从 class 提取语言
    const cls = (codeEl?.getAttribute('class') || el.getAttribute('class') || '').toLowerCase();
    const langMatch = cls.match(/(?:language|lang|highlight-source)-(\w+)/);
    const lang = langMatch ? langMatch[1] : '';
    return `\n\n\`\`\`${lang}\n${text.replace(/\n+$/, '')}\n\`\`\`\n\n`;
  },
});

// 识别非标准代码块：class 含 code/highlight/hljs，或 style 含 monospace
turndown.addRule('fencedCodeBlock', {
  filter(node: Node) {
    if (node.nodeName === 'PRE') return false; // 已由 preCodeBlock 处理
    const el = node as unknown as HTMLElement;
    if (!el.getAttribute) return false;
    const cls = (el.getAttribute('class') || '').toLowerCase();
    const style = (el.getAttribute('style') || '').toLowerCase();
    const hasCodeClass = /\b(code|highlight|hljs|syntax|prism)\b/.test(cls);
    const hasMonoFont = /font-family\s*:\s*.*\b(monospace|consolas|courier)\b/i.test(style);
    if (!hasCodeClass && !hasMonoFont) return false;
    // 必须包含 <code> 或 <pre> 子节点，或本身内容像代码
    const inner = el.innerHTML || '';
    return /<code|<pre/i.test(inner) || el.textContent!.includes('\n');
  },
  replacement(_content, node) {
    const el = node as unknown as HTMLElement;
    // 提取 code 元素的文本，或直接用元素文本
    const codeEl = el.querySelector('code');
    const text = (codeEl || el).textContent || '';
    // 尝试从 class 提取语言
    const cls = (codeEl?.getAttribute('class') || el.getAttribute('class') || '').toLowerCase();
    const langMatch = cls.match(/(?:language|lang|highlight-source)-(\w+)/);
    const lang = langMatch ? langMatch[1] : '';
    return `\n\n\`\`\`${lang}\n${text.replace(/\n+$/, '')}\n\`\`\`\n\n`;
  },
});

// 清理多余空行
function cleanMarkdown(md: string): string {
  let result = md.replace(/\n{3,}/g, '\n\n');
  // Some rich-text clipboards split a generated heading into a marker line
  // and its text line. Rejoin only a marker followed by the next non-empty
  // line, so the pasted title remains a valid Markdown heading.
  result = result.replace(/(^|\n)(#{1,6})\s*\n+(?=\S)/g, '$1$2 ');
  // 链接文字与地址完全相同时，简化为纯 URL（remark-gfm 自动识别为链接）
  result = result.replace(/\[(https?:\/\/[^\s)\]]+)\]\(\1\)/g, '$1');
  return result.trim();
}

/**
 * 预处理 HTML：清理表格和列表结构，使 turndown 能正确解析
 * 使用 DOMParser 解析，避免正则表达式的边界问题
 */
function preprocessHtml(html: string): string {
  // 1. 移除 <style> 和 <script> 标签
  html = html.replace(/<style[\s\S]*?<\/style>/gi, '');
  html = html.replace(/<script[\s\S]*?<\/script>/gi, '');

  // 2. 使用 DOMParser 解析
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // 清理表格：移除 td/th 内部的块级元素
    const tables = doc.querySelectorAll('table');
    tables.forEach((table) => {
      const cells = table.querySelectorAll('td, th');
      cells.forEach((cell) => {
        const cleaned = cleanCellContent(cell.innerHTML);
        cell.innerHTML = cleaned;
      });
      while (table.attributes.length > 0) {
        table.removeAttribute(table.attributes[0].name);
      }
    });

    // 清理列表项：移除 li 内部的 div/p 标签，避免 turndown 产生双列表标记
    const listItems = doc.querySelectorAll('li');
    listItems.forEach((li) => {
      const cleaned = cleanListItemContent(li.innerHTML);
      li.innerHTML = cleaned;
    });

    preserveRichTextLineBreaks(doc.body);

    return doc.body.innerHTML;
  } catch {
    return preprocessHtmlFallback(html);
  }
}

/**
 * 清理单元格内容：移除块级元素，保留内联格式
 */
function cleanCellContent(html: string): string {
  // 移除块级元素标签，保留内容
  let result = html
    .replace(/<div[^>]*>/gi, '')
    .replace(/<\/div>/gi, '')
    .replace(/<p[^>]*>/gi, '')
    .replace(/<\/p>/gi, '')
    .replace(/<section[^>]*>/gi, '')
    .replace(/<\/section>/gi, '')
    .replace(/<br\s*\/?>/gi, ' ');

  // 合并多余空白
  result = result.replace(/\s+/g, ' ').trim();

  return result || ' ';
}

/**
 * 清理列表项内容：移除 div/p 等块级元素，但保留嵌套列表
 * 避免 turndown 在 <li> 内的 <div> 前插入额外的列表标记
 */
function cleanListItemContent(html: string): string {
  // 先保护嵌套列表，用占位符替换
  const nestedLists: string[] = [];
  let result = html.replace(/<ul[\s\S]*?<\/ul>/gi, (match) => {
    nestedLists.push(match);
    return `__NESTED_LIST_${nestedLists.length - 1}__`;
  });
  result = result.replace(/<ol[\s\S]*?<\/ol>/gi, (match) => {
    nestedLists.push(match);
    return `__NESTED_LIST_${nestedLists.length - 1}__`;
  });

  // 移除块级元素标签
  result = result
    .replace(/<div[^>]*>/gi, '')
    .replace(/<\/div>/gi, '')
    .replace(/<p[^>]*>/gi, '')
    .replace(/<\/p>/gi, '')
    .replace(/<section[^>]*>/gi, '')
    .replace(/<\/section>/gi, '')
    .replace(/<br\s*\/?>/gi, ' ');

  // 合并多余空白
  result = result.replace(/\s+/g, ' ').trim();

  // 恢复嵌套列表
  nestedLists.forEach((list, i) => {
    result = result.replace(`__NESTED_LIST_${i}__`, list);
  });

  return result;
}

function preservesTextLineBreaks(element: Element): boolean {
  let current: Element | null = element;
  while (current) {
    // Code blocks have their own Turndown handling and must not be rewritten.
    if (current.tagName === 'PRE' || current.tagName === 'CODE') return false;

    const style = current.getAttribute('style') || '';
    if (/white-space\s*:\s*(?:pre|pre-wrap|pre-line|break-spaces)\b/i.test(style)) {
      return true;
    }

    // X uses React Native Web's r-bcqeeo class for white-space: pre-wrap.
    // Keep the marker narrow so ordinary HTML indentation is not converted.
    const className = current.getAttribute('class') || '';
    if (/(?:^|\s)(?:r-bcqeeo|whitespace-pre(?:-wrap|-line)?|white-space-pre(?:-wrap|-line)?)(?:$|\s)/i.test(className)) {
      return true;
    }

    if (current.getAttribute('data-testid') === 'tweetText') return true;
    current = current.parentElement;
  }
  return false;
}

/**
 * Turndown 会把普通文本节点中的换行压成空格。网页复制（尤其是 X）常把
 * 段落保存为 pre-wrap 文本节点而不是多个 p/br，因此先显式转成 br。
 */
function preserveRichTextLineBreaks(root: HTMLElement): void {
  const walker = root.ownerDocument.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */);
  const textNodes: Text[] = [];
  let current = walker.nextNode();
  while (current) {
    if (current.nodeType === 3) textNodes.push(current as Text);
    current = walker.nextNode();
  }

  for (const textNode of textNodes) {
    const data = textNode.data.replace(/\r\n?/g, '\n');
    if (!data.includes('\n') || !textNode.parentElement) continue;

    const hasExplicitParagraphBreak = /\n[ \t]*\n/.test(data);
    if (!preservesTextLineBreaks(textNode.parentElement) && !hasExplicitParagraphBreak) continue;

    const fragment = textNode.ownerDocument.createDocumentFragment();
    const lines = data.split('\n');
    lines.forEach((line, index) => {
      if (line) fragment.appendChild(textNode.ownerDocument.createTextNode(line));
      if (index < lines.length - 1) fragment.appendChild(textNode.ownerDocument.createElement('br'));
    });
    textNode.replaceWith(fragment);
  }
}

function preserveRichTextLineBreaksFallback(html: string): string {
  const wrapperPattern = /(<(div|span|p)\b[^>]*>)([\s\S]*?)(<\/\2>)/gi;
  return html.replace(wrapperPattern, (match, opening: string, _tag: string, content: string, closing: string) => {
    const hasPreWrapStyle = /white-space\s*:\s*(?:pre|pre-wrap|pre-line|break-spaces)\b/i.test(opening);
    const hasPreWrapClass = /\b(?:r-bcqeeo|whitespace-pre(?:-wrap|-line)?|white-space-pre(?:-wrap|-line)?)\b/i.test(opening);
    const isTweetText = /data-testid\s*=\s*(['"])tweetText\1/i.test(opening);
    if ((!hasPreWrapStyle && !hasPreWrapClass && !isTweetText) || !/\r?\n/.test(content)) return match;

    const contentWithBreaks = content
      .split(/(<[^>]*>)/g)
      .map(part => part.startsWith('<') ? part : part.replace(/\r\n?/g, '\n').replace(/\n/g, '<br>'))
      .join('');
    return `${opening}${contentWithBreaks}${closing}`;
  });
}

/**
 * 回退方案：使用正则表达式清理表格
 */
function preprocessHtmlFallback(html: string): string {
  html = html.replace(/<table[\s\S]*?<\/table>/gi, (tableHtml) => {
    let cleaned = tableHtml;

    // 清理 td/th 内容
    cleaned = cleaned.replace(/<td[^>]*>([\s\S]*?)<\/td>/gi, (_match, inner) => {
      const text = cleanCellContent(inner);
      return `<td>${text}</td>`;
    });
    cleaned = cleaned.replace(/<th[^>]*>([\s\S]*?)<\/th>/gi, (_match, inner) => {
      const text = cleanCellContent(inner);
      return `<th>${text}</th>`;
    });

    // 移除标签间空白
    cleaned = cleaned.replace(/>\s+</g, '><');
    cleaned = cleaned.replace(/\s+>/g, '>');
    cleaned = cleaned.replace(/<\s+/g, '<');

    // 空单元格填充
    cleaned = cleaned.replace(/<td[^>]*><\/td>/gi, '<td> </td>');
    cleaned = cleaned.replace(/<th[^>]*><\/th>/gi, '<th> </th>');

    // 清理 table 属性
    cleaned = cleaned.replace(/<table[^>]*>/gi, '<table>');

    return cleaned;
  });

  return preserveRichTextLineBreaksFallback(html);
}

/**
 * 将 HTML 字符串转换为 Markdown
 */
export function htmlToMarkdown(html: string): string {
  try {
    const cleaned = preprocessHtml(html);
    return cleanMarkdown(turndown.turndown(cleaned));
  } catch {
    return '';
  }
}

function readClipboardData(clipboardData: DataTransfer, type: string): string {
  try {
    return clipboardData.getData(type);
  } catch {
    return '';
  }
}

function getHtmlClipboardItem(clipboardData: DataTransfer): DataTransferItem | null {
  return Array.from(clipboardData.items || []).find(
    item => item.kind === 'string' && item.type.toLowerCase() === 'text/html',
  ) ?? null;
}

/** 判断剪贴板是否声明了 HTML，供粘贴事件在异步读取前同步阻止浏览器默认粘贴。 */
export function hasHtmlClipboardData(clipboardData: DataTransfer): boolean {
  return Boolean(readClipboardData(clipboardData, 'text/html') || getHtmlClipboardItem(clipboardData));
}

/**
 * 从粘贴事件中提取 HTML 并转为 Markdown。
 * 没有富文本或明显 Markdown 结构时返回 null，让浏览器保留原生纯文本粘贴行为。
 */
export function getPasteMarkdown(clipboardData: DataTransfer): string | null {
  const html = readClipboardData(clipboardData, 'text/html');
  if (html) {
    const md = htmlToMarkdown(html);
    if (md) return md;
  }

  // Some browsers/editors expose only text/plain when copying Markdown from
  // CodeMirror or a PWA preview. Preserve its structure when pasted into Memo.
  const text = readClipboardData(clipboardData, 'text/plain');
  if (!text) return null;
  // HTML 存在但 Turndown 无法产出内容时，至少保留网页的纯文本，避免粘贴结果丢失。
  if (html) return text.trim() || null;
  if (!/(^#{1,6}\s|^\s*[-*+]\s|^\s*\d+\.\s|```|\*\*|!\[)/m.test(text)) return null;
  return text.trim() || null;
}

/**
 * 兼容少数浏览器 getData('text/html') 为空、但 DataTransferItem 仍提供 HTML 的情况。
 * 事件处理器必须先同步 preventDefault，再调用此异步回退。
 */
export async function getPasteMarkdownAsync(clipboardData: DataTransfer): Promise<string | null> {
  const direct = getPasteMarkdown(clipboardData);
  if (direct) return direct;

  const htmlItem = getHtmlClipboardItem(clipboardData);
  if (!htmlItem) return null;

  const html = await new Promise<string>(resolve => {
    try {
      htmlItem.getAsString(resolve);
    } catch {
      resolve('');
    }
  });
  const markdown = html ? htmlToMarkdown(html) : '';
  if (markdown) return markdown;

  const text = readClipboardData(clipboardData, 'text/plain');
  return text.trim() || null;
}
