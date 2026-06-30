/**
 * Shared markdown preprocessing functions used by MemoCard and MarkdownNoteEditor.
 */

export function normalizeTaskLists(content: string): string {
  return content.replace(/^(\s*)[-*+]\s*\[([ xX*])\] /gm, '$1- [$2] ');
}


export function normalizeHighlight(content: string): string {
  const lines = content.split('\n');
  const result: string[] = [];
  let inCodeBlock = false;
  for (const line of lines) {
    if (line.trimStart().startsWith('```')) inCodeBlock = !inCodeBlock;
    if (inCodeBlock) { result.push(line); continue; }
    result.push(line.replace(/==(.*?)==/g, '<mark>$1</mark>'));
  }
  return result.join('\n');
}

export function normalizeListSeparators(content: string): string {
  const lines = content.split('\n');
  const result: string[] = [];
  let inCodeBlock = false;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trimStart();
    if (trimmed.startsWith('```')) inCodeBlock = !inCodeBlock;
    result.push(lines[i]);
    if (inCodeBlock) continue;
    const next = lines[i + 1];
    if (!next) continue;
    const cur = lines[i];
    const isListItem = /^\s*[-*+]\s/.test(cur) || /^\s*\d+\.\s/.test(cur);
    const isBlockquote = cur.trimStart().startsWith('>');
    if (!isListItem && !isBlockquote) continue;
    const nextTrimmed = next.trimStart();
    const nextIsListItem = /^\s*[-*+]\s/.test(next) || /^\s*\d+\.\s/.test(next);
    const nextIsBlank = nextTrimmed === '';
    const nextIsIndented = /^\s{2,}/.test(next) || /^\t/.test(next);
    const nextIsBlockquote = nextTrimmed.startsWith('>');
    if (isListItem && !nextIsListItem && !nextIsBlank && !nextIsIndented && !nextIsBlockquote) {
      result.push('');
    }
    if (isBlockquote && !nextIsBlockquote && !nextIsBlank) {
      result.push('');
    }
  }
  return result.join('\n');
}

export function normalizeCodeBlocks(content: string): string {
  const lines = content.split('\n');
  const result: string[] = [];
  let inCodeBlock = false;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trimStart();
    if (trimmed.startsWith('```')) {
      if (!inCodeBlock) {
        if (i > 0 && result[result.length - 1]?.trim() !== '') {
          result.push('');
        }
        inCodeBlock = true;
      } else {
        inCodeBlock = false;
        if (result[result.length - 1]?.trim() !== '') {
          result.push('');
        }
        result.push(lines[i]);
        const next = lines[i + 1];
        if (next !== undefined && next.trim() !== '') {
          result.push('');
        }
        continue;
      }
    }
    result.push(lines[i]);
  }
  return result.join('\n');
}

export function stripTags(content: string): string {
  return content.replace(/#[a-zA-Z0-9_一-龥]+/g, '').replace(/\n{3,}/g, '\n\n').trim();
}

export function stripAttachments(content: string): string {
  return content
    // 保留音频文件标记，只删除图片
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, alt, url) => {
      if (/\.(mp4|webm|ogg|wav|mp3|m4a)(\?|$)/i.test(url)) {
        return `![${alt}](${url})`; // 保留音频
      }
      return ''; // 删除图片
    })
    .replace(/(?<!!)\[([^\]]+)\]\((?!\/d\/)([^)]+)\)/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * 将 GitHub 风格的 callout 语法转换为 HTML
 * 输入：> [!note] 标题\n> 内容
 */
export function normalizeCallouts(content: string): string {
  // SVG 线条图标（currentColor 继承文字颜色）
  const icons: Record<string, string> = {
    note: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>',
    tip: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/></svg>',
    warning: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    danger: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    info: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
    question: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    quote: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V21z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3z"/></svg>',
  };

  const defaultIcon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>';
  const labels: Record<string, string> = {
    note: '注意', tip: '提示', warning: '警告', danger: '危险',
    info: '信息', question: '问题', quote: '引用',
  };

  return content.replace(
    /^>\s*\[!(\w+)\]\s*(.*?)\n((?:>.*\n?)*)/gm,
    (_match, type: string, title: string, body: string) => {
      const lowerType = type.toLowerCase();
      const icon = icons[lowerType] || defaultIcon;
      const cleanBody = body
        .split('\n')
        .map((line: string) => line.replace(/^>\s?/, ''))
        .join('\n')
        .trim();
      return `<div class="callout callout-${lowerType}"><span class="callout-icon">${icon}</span><div class="callout-body"><div class="callout-content">${cleanBody}</div></div></div>\n`;
    }
  );
}

/** Full preprocessing pipeline: strip tags/attachments, then normalize lists/highlights/code blocks/callouts. */
/**
 * 转义代码块内的 HTML 标签，防止 rehypeRaw 解析
 */
export function escapeCodeBlockHtml(content: string): string {
  return content.replace(
    /(```[\s\S]*?```)/g,
    (match) => match.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  );
}

export function preprocessMarkdown(content: string): string {
  return escapeCodeBlockHtml(escapeFullWidthColon(normalizeCodeBlocks(normalizeListSeparators(normalizeHighlight(normalizeTaskLists(stripAttachments(stripTags(normalizeCallouts(content)))))))));
}
