import TurndownService from 'turndown';
import type { Node } from 'turndown';

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
  emDelimiter: '*',
  strongDelimiter: '**',
});

// 加粗：识别 style="font-weight:bold/700" 和 class="bold/font-bold/fw-bold"
turndown.addRule('boldStyle', {
  filter(node: Node) {
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

// 识别非标准代码块：class 含 code/highlight/hljs，或 style 含 monospace
turndown.addRule('fencedCodeBlock', {
  filter(node: Node) {
    if (node.nodeName === 'PRE') return false; // 标准 pre>code 已由 turndown 内置处理
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
 * 将 HTML 字符串转换为 Markdown
 */
export function htmlToMarkdown(html: string): string {
  try {
    return cleanMarkdown(turndown.turndown(html));
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
