import type React from 'react';

/**
 * Handle Enter key in a textarea to auto-continue markdown list markers.
 * Returns true if the event was handled (caller should call e.preventDefault()).
 */
export function handleListContinuation(
  e: React.KeyboardEvent<HTMLTextAreaElement>,
  content: string,
  setContent: (value: string) => void,
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
): boolean {
  if (e.key !== 'Enter' || e.shiftKey || e.metaKey || e.ctrlKey || e.nativeEvent.isComposing) return false;

  const el = textareaRef.current;
  if (!el) return false;

  const cursor = el.selectionStart;
  const before = content.slice(0, cursor);
  const after = content.slice(el.selectionEnd);

  // Get the current line (from last newline to cursor)
  const lineStart = before.lastIndexOf('\n') + 1;
  const currentLine = before.slice(lineStart);

  // Match list prefixes:
  // - [x] task done
  // - [ ] task todo
  // - / * / + unordered
  // 1. ordered
  // > blockquote
  const taskDone = currentLine.match(/^(\s*)([-*+])\s*\[[xX]\]\s*/);
  const taskTodo = currentLine.match(/^(\s*)([-*+])\s*\[ \]\s*/);
  const unordered = currentLine.match(/^(\s*)([-*+])\s+/);
  const ordered = currentLine.match(/^(\s*)(\d+)\.\s+/);
  const blockquote = currentLine.match(/^(>\s*)/);

  let prefix: string | null = null;
  let isListItem = false;

  if (taskDone) {
    isListItem = true;
    if (currentLine.trim() === `${taskDone[2]} [x]` || currentLine.trim() === `${taskDone[2]} [X]`) {
      // Empty task item → remove it, start fresh line
      prefix = '';
    } else {
      prefix = `${taskDone[1]}${taskDone[2]} [ ] `;
    }
  } else if (taskTodo) {
    isListItem = true;
    if (currentLine.trim() === `${taskTodo[2]} [ ]`) {
      prefix = '';
    } else {
      prefix = `${taskTodo[1]}${taskTodo[2]} [ ] `;
    }
  } else if (ordered) {
    isListItem = true;
    const num = parseInt(ordered[2], 10);
    if (currentLine.trim() === `${num}.`) {
      prefix = '';
    } else {
      prefix = `${ordered[1]}${num + 1}. `;
    }
  } else if (unordered) {
    isListItem = true;
    if (currentLine.trim() === unordered[2]) {
      prefix = '';
    } else {
      prefix = `${unordered[1]}${unordered[2]} `;
    }
  } else if (blockquote) {
    isListItem = true;
    if (currentLine.trim() === '>') {
      prefix = '';
    } else {
      prefix = blockquote[1];
    }
  }

  if (!isListItem) return false;

  e.preventDefault();

  // When removing empty list item, also remove the line before cursor
  if (prefix === '') {
    // 删除整行内容
    const beforeLine = content.slice(0, lineStart);
    const afterLine = after;
    const newContent = beforeLine + afterLine;
    setContent(newContent);
    requestAnimationFrame(() => {
      el.selectionStart = el.selectionEnd = lineStart;
    });
  } else {
    // 使用 execCommand 插入文本，保留撤销历史
    const insertText = '\n' + prefix;
    document.execCommand('insertText', false, insertText);
  }

  return true;
}
