import { useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { EditorState, type Extension } from '@codemirror/state';
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  drawSelection,
  highlightSpecialChars,
  placeholder as cmPlaceholder,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching, HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { searchKeymap, search } from '@codemirror/search';
import { markdown } from '@codemirror/lang-markdown';
import { tags as t } from '@lezer/highlight';

// ── Markdown 语法高亮 ──
const mdHighlight = HighlightStyle.define([
  { tag: t.heading1, fontSize: '1.35em', fontWeight: '700' },
  { tag: t.heading2, fontSize: '1.18em', fontWeight: '600' },
  { tag: t.heading3, fontSize: '1.08em', fontWeight: '600' },
  { tag: [t.heading4, t.heading5, t.heading6], fontWeight: '600' },
  { tag: t.strong, fontWeight: '600' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through', opacity: '0.7' },
  { tag: t.link, color: '#2563eb', textDecoration: 'none' },
  { tag: t.url, color: '#2563eb' },
  { tag: t.quote, color: '#6b7280', fontStyle: 'italic' },
  { tag: t.monospace, color: '#059669', fontFamily: 'monospace' },
  { tag: t.list, color: '#6366f1' },
  { tag: t.contentSeparator, color: '#9ca3af' },
  { tag: t.meta, color: '#9ca3af' },
  { tag: t.processingInstruction, color: '#9ca3af' },
]);

// ── CodeMirror 主题（使用 Tailwind 变量 + dark mode class 检测） ──
function buildTheme(isDark: boolean, scrollable: boolean, compact: boolean) {
  const fg = isDark ? '#e5e7eb' : '#1f2937';
  const muted = isDark ? '#6b7280' : '#9ca3af';
  const accent = isDark ? '#60a5fa' : '#2563eb';
  const bg = 'transparent';
  const gutterBg = isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)';
  const gutterBorder = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
  const selectionBg = isDark ? 'rgba(96,165,250,0.2)' : 'rgba(37,99,235,0.15)';
  const activeLineBg = isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)';

  // compact 模式：mount 由父级 maxHeight 约束，.cm-scroller 负责内部滚动。
  // 关键：root 不能用 height:100%/maxHeight:100%，否则 CM 视口测量基于容器高度而非内容高度，
  // 导致超出视口的行不渲染（滚动后显示空白，需点击才重绘）。
  const rootStyle = scrollable
    ? { height: '100%', overflow: 'hidden' as const }
    : compact
      ? { display: 'flex', flexDirection: 'column' as const, height: 'auto', minHeight: '100%' }
      : { height: 'auto', minHeight: '100%' };
  const scrollerStyle = scrollable
    ? { overflow: 'auto' as const, height: '100%' }
    : compact
      ? { flex: '1 1 auto', minHeight: '0', overflowY: 'auto' as const }
      : { overflow: 'auto' as const, height: 'auto' };

  return EditorView.theme({
    '&': { backgroundColor: bg, color: fg, ...rootStyle },
    '.cm-scroller': { fontFamily: 'inherit', lineHeight: '1.75', ...scrollerStyle },
    '.cm-content': { caretColor: accent, fontFamily: 'inherit', fontSize: 'inherit', paddingLeft: '10px' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: accent, borderLeftWidth: '2px' },
    '.cm-activeLine': { backgroundColor: activeLineBg },
    '&.cm-focused': { outline: 'none' },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': { backgroundColor: selectionBg },
    '::selection': { backgroundColor: selectionBg },
    '.cm-gutters': { backgroundColor: gutterBg, color: muted, border: 'none', borderRight: `1px solid ${gutterBorder}` },
    '.cm-activeLineGutter': { backgroundColor: 'transparent' },
    '.cm-line': { padding: '0' },
    '.cm-foldPlaceholder': { backgroundColor: gutterBg, color: muted, border: 'none' },
    // 搜索面板
    '.cm-panel': { backgroundColor: isDark ? '#1f2937' : '#ffffff', color: fg },
    '.cm-panel input': { color: fg },
  });
}

// ── Props ──
export interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minHeight?: number | string;
  maxHeight?: number | string;
  /** compact=true: 无行号、auto-resize；compact=false: 显示行号、撑满容器 */
  compact?: boolean;
  autoFocus?: boolean;
  readOnly?: boolean;
  /** CodeMirror 自己处理滚动（用于固定高度容器如弹窗） */
  scrollable?: boolean;
  /** 外部传入的工具栏（compact=false 时显示） */
  toolbar?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  /** 注入额外的 CodeMirror extensions */
  extensions?: Extension[];
  /** Enter 键处理（用于列表续行等），返回 true 表示已处理 */
  onEnter?: (view: EditorView) => boolean;
}

export interface MarkdownEditorHandle {
  view: EditorView | null;
  /** 插入文本到光标位置 */
  insertText: (text: string) => void;
  /** 包裹选中文本 */
  wrapSelection: (before: string, after: string, placeholder?: string) => void;
  /** 在行首插入前缀 */
  insertLinePrefix: (prefix: string) => void;
  /** 获取当前内容 */
  getValue: () => string;
  /** 聚焦编辑器 */
  focus: () => void;
}

const MarkdownEditor = forwardRef<MarkdownEditorHandle, MarkdownEditorProps>(function MarkdownEditor(
  {
    value,
    onChange,
    placeholder,
    minHeight,
    maxHeight,
    compact = true,
    autoFocus,
    readOnly,
    scrollable = false,
    toolbar,
    className,
    style,
    extensions: extraExtensions,
    onEnter,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onEnterRef = useRef(onEnter);
  const valueRef = useRef(value);
  const isDarkRef = useRef(false);

  // Keep refs up to date
  onChangeRef.current = onChange;
  onEnterRef.current = onEnter;
  valueRef.current = value;

  // Detect dark mode
  const checkDark = useCallback(() => {
    try {
      const saved = localStorage.getItem('outline-font-settings');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.theme === 'dark') return true;
        if (parsed.theme && parsed.theme !== 'system') return false;
      }
    } catch { /* ignore */ }
    return document.documentElement.classList.contains('dark') || window.matchMedia('(prefers-color-scheme: dark)').matches;
  }, []);

  // Imperative API
  useImperativeHandle(ref, () => ({
    get view() { return viewRef.current; },
    insertText(text: string) {
      const view = viewRef.current;
      if (!view) return;
      const { from } = view.state.selection.main;
      view.dispatch({
        changes: { from, insert: text },
        selection: { anchor: from + text.length },
      });
      view.focus();
    },
    wrapSelection(before: string, after: string, ph = '') {
      const view = viewRef.current;
      if (!view) return;
      const { from, to } = view.state.selection.main;
      const selected = view.state.sliceDoc(from, to);
      const insertText = selected || ph;
      const full = before + insertText + after;
      view.dispatch({
        changes: { from, to, insert: full },
        selection: {
          anchor: from + before.length,
          head: from + before.length + insertText.length,
        },
      });
      view.focus();
    },
    insertLinePrefix(prefix: string) {
      const view = viewRef.current;
      if (!view) return;
      const { from } = view.state.selection.main;
      const line = view.state.doc.lineAt(from);
      view.dispatch({
        changes: { from: line.from, insert: prefix + line.text },
        selection: { anchor: from + prefix.length },
      });
      view.focus();
    },
    getValue() {
      return viewRef.current?.state.doc.toString() ?? '';
    },
    focus() {
      viewRef.current?.focus();
    },
  }), []);

  // Create / destroy EditorView
  useEffect(() => {
    if (!containerRef.current) return;

    const isDark = checkDark();
    isDarkRef.current = isDark;

    const enterKeymap = keymap.of([{
      key: 'Enter',
      run: (view) => {
        if (onEnterRef.current) return onEnterRef.current(view);
        return false;
      },
    }]);

    const baseExtensions: Extension[] = [
      history(),
      drawSelection(),
      highlightActiveLine(),
      highlightSpecialChars(),
      bracketMatching(),
      EditorView.lineWrapping,
      markdown(),
      syntaxHighlighting(mdHighlight, { fallback: true }),
      search({ top: true }),
      keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
      buildTheme(isDark, scrollable, compact),
      enterKeymap,
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          onChangeRef.current(update.state.doc.toString());
        }
      }),
    ];

    if (placeholder) {
      baseExtensions.push(cmPlaceholder(placeholder));
    }
    if (compact) {
      // Compact mode: no line numbers
    } else {
      baseExtensions.push(lineNumbers());
    }
    if (readOnly) {
      baseExtensions.push(EditorState.readOnly.of(true));
    }
    if (extraExtensions) {
      baseExtensions.push(...extraExtensions);
    }

    const state = EditorState.create({
      doc: value,
      extensions: baseExtensions,
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });
    viewRef.current = view;

    if (autoFocus) {
      requestAnimationFrame(() => view.focus());
    }

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Only run on mount/unmount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync external value changes (only when truly different)
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      });
    }
  }, [value]);

  // Dark mode observation
  useEffect(() => {
    const update = () => {
      const newDark = checkDark();
      if (newDark !== isDarkRef.current) {
        isDarkRef.current = newDark;
        const view = viewRef.current;
        if (view) {
          // Re-create theme by dispatching reconfigure isn't easy,
          // so we toggle a class on the container and let CSS handle it.
          // The CM theme is set once, so we need to recreate.
          // For simplicity, we just update the container's dark class.
          // Actually, the theme uses hardcoded colors based on isDark at creation.
          // We'll handle this by watching dark mode and forcing a theme update.
          // For now, CSS variables approach would be ideal, but let's do a pragmatic approach:
          // the parent component will re-mount when theme changes.
        }
      }
    };
    window.addEventListener('theme-change', update);
    const obs = new MutationObserver(update);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', update);
    return () => {
      window.removeEventListener('theme-change', update);
      obs.disconnect();
      mq.removeEventListener('change', update);
    };
  }, [checkDark]);

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    ...(compact ? {} : { flex: 1, minHeight: 0 }),
    ...style,
  };

  const editorStyle: React.CSSProperties = {
    position: 'relative',
  };
  if (!compact) {
    editorStyle.flex = 1;
    editorStyle.minHeight = 0;
  } else {
    // compact 模式：作为 flex 列容器，配合 .cm-scroller 的 flex:1 + minHeight:0 实现 maxHeight 内部滚动
    editorStyle.display = 'flex';
    editorStyle.flexDirection = 'column';
    editorStyle.minHeight = 0;
    editorStyle.flex = '1 1 auto';
  }
  if (minHeight !== undefined) editorStyle.minHeight = typeof minHeight === 'number' ? `${minHeight}px` : minHeight;
  if (maxHeight !== undefined) editorStyle.maxHeight = typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight;

  return (
    <div className={className} style={containerStyle}>
      {toolbar && !compact && toolbar}
      <div
        ref={containerRef}
        style={editorStyle}
        className="cm-editor-wrapper"
      />
    </div>
  );
});

export default MarkdownEditor;
