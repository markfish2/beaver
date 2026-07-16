import { keymap } from '@codemirror/view';
import type { KeyBinding } from '@codemirror/view';

/**
 * CodeMirror keymap extension: auto-continue markdown list markers on Enter.
 * Supports task lists, unordered lists, ordered lists, and blockquotes.
 * Empty list item + Enter breaks out of the list.
 */
import type { EditorView } from '@codemirror/view';

const listContinuationHandler = (view: EditorView): boolean => {
  const { state } = view;
  const pos = state.selection.main.head;
  const line = state.doc.lineAt(pos);
  const lineText = line.text;
  const cursorInLine = pos - line.from;
  const textBefore = lineText.slice(0, cursorInLine);

  // Match list prefixes against text before cursor
  const taskDone = textBefore.match(/^(\s*)([-*+])\s*\[[xX]\]\s*/);
  const taskTodo = textBefore.match(/^(\s*)([-*+])\s*\[ \]\s*/);
  const unordered = textBefore.match(/^(\s*)([-*+])\s+/);
  const ordered = textBefore.match(/^(\s*)(\d+)\.\s+/);
  const blockquote = textBefore.match(/^(>\s*)/);

  let prefix: string | null = null;
  let removeFrom = -1;

  if (taskDone) {
    const marker = `${taskDone[2]} [x]`;
    if (textBefore.trim() === marker || textBefore.trim() === `${taskDone[2]} [X]`) {
      prefix = '';
      removeFrom = line.from;
    } else {
      prefix = `${taskDone[1]}${taskDone[2]} [ ] `;
    }
  } else if (taskTodo) {
    const marker = `${taskTodo[2]} [ ]`;
    if (textBefore.trim() === marker) {
      prefix = '';
      removeFrom = line.from;
    } else {
      prefix = `${taskTodo[1]}${taskTodo[2]} [ ] `;
    }
  } else if (ordered) {
    const num = parseInt(ordered[2], 10);
    if (textBefore.trim() === `${num}.`) {
      prefix = '';
      removeFrom = line.from;
    } else {
      prefix = `${ordered[1]}${num + 1}. `;
    }
  } else if (unordered) {
    if (textBefore.trim() === unordered[2]) {
      prefix = '';
      removeFrom = line.from;
    } else {
      prefix = `${unordered[1]}${unordered[2]} `;
    }
  } else if (blockquote) {
    if (textBefore.trim() === '>') {
      prefix = '';
      removeFrom = line.from;
    } else {
      prefix = blockquote[1];
    }
  }

  if (prefix === null) return false;

  // Break out of empty list item
  if (prefix === '') {
    view.dispatch({
      changes: { from: removeFrom, to: pos },
      selection: { anchor: removeFrom },
    });
    return true;
  }

  // Continue list with same prefix
  const insert = '\n' + prefix;
  view.dispatch({
    changes: { from: pos, insert },
    selection: { anchor: pos + insert.length },
  });
  return true;
};

const listContinuationKeymap: KeyBinding[] = [
  { key: 'Enter', run: listContinuationHandler },
];

export const listContinuation = () => keymap.of(listContinuationKeymap);
