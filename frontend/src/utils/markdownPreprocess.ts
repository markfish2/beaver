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
 * 输出：<div class="callout callout-note"><span class="callout-icon">📝</span><div class="callout-body"><div class="callout-title">标题</div><div class="callout-content">内容</div></div></div>
 */
export function normalizeCallouts(content: string): string {
  const calloutTypes: Record<string, { icon: string; label: string }> = {
    note: { icon: '📝', label: '注意' },
    tip: { icon: '💡', label: '提示' },
    warning: { icon: '⚠️', label: '警告' },
    danger: { icon: '🚨', label: '危险' },
    info: { icon: 'ℹ️', label: '信息' },
    question: { icon: '❓', label: '问题' },
    quote: { icon: '💬', label: '引用' },
  };

  return content.replace(
    /^>\s*\[!(\w+)\]\s*(.*?)\n((?:>.*\n?)*)/gm,
    (_match, type: string, title: string, body: string) => {
      const lowerType = type.toLowerCase();
      const config = calloutTypes[lowerType] || { icon: '📌', label: type };
      const icon = config.icon;
      const displayTitle = title.trim() || config.label;
      const cleanBody = body
        .split('\n')
        .map((line: string) => line.replace(/^>\s?/, ''))
        .join('\n')
        .trim();
      return `<div class="callout callout-${lowerType}"><span class="callout-icon">${icon}</span><div class="callout-body"><div class="callout-title">${displayTitle}</div><div class="callout-content">${cleanBody}</div></div></div>\n`;
    }
  );
}

/** Full preprocessing pipeline: strip tags/attachments, then normalize lists/highlights/code blocks/callouts. */
export function preprocessMarkdown(content: string): string {
  return escapeFullWidthColon(normalizeCodeBlocks(normalizeListSeparators(normalizeHighlight(normalizeTaskLists(stripAttachments(stripTags(normalizeCallouts(content))))))));
}
