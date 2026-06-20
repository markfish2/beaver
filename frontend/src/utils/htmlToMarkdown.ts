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

// 启用 GFM 插件（表格、删除线、任务列表）
turndown.use(gfm);

// 加粗：识别 style="font-weight:bold/700" 和 class="bold/font-bold/fw-bold"
// 跳过 h1-h6 标签（标题标签的 font-weight:bold 不应转为加粗）
turndown.addRule('boldStyle', {
  filter(node: Node) {
    if (/^H[1-6]$/.test(node.nodeName)) return false;
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
      (el as any).__headingLevel = parseInt(match[1]);
      return true;
    }
    if (/\b(heading|title)\b/.test(cls) && /^(DIV|P|SPAN|SECTION)$/.test(node.nodeName)) {
      (el as any).__headingLevel = 2;
      return true;
    }
    return false;
  },
  replacement(content, node) {
    const el = node as unknown as HTMLElement;
    const level = (el as any).__headingLevel || 2;
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
  return md.replace(/\n{3,}/g, '\n\n').trim();
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

  return html;
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

/**
 * 从粘贴事件中提取 HTML 并转为 Markdown。
 * 没有 HTML 内容时返回 null。
 */
export function getPasteMarkdown(clipboardData: DataTransfer): string | null {
  const html = clipboardData.getData('text/html');
  if (!html) return null;
  const md = htmlToMarkdown(html);
  return md || null;
}

/**
 * 从 Markdown 中提取所有外部图片 URL（排除已经是本地 /uploads/ 的）
 */
export function extractExternalImageUrls(markdown: string): string[] {
  const urls: string[] = [];
  const regex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  let match;
  while ((match = regex.exec(markdown)) !== null) {
    const url = match[2];
    if (url && !url.startsWith('/uploads/') && !url.startsWith('data:')) {
      urls.push(url);
    }
  }
  return [...new Set(urls)];
}
