import { useState, useRef, useCallback, useEffect, useMemo, memo, lazy, Suspense, Children, isValidElement } from 'react';
import type { RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import type { Root } from 'hast';
import { EditorView } from '@codemirror/view';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import remarkBreaks from 'remark-breaks';
import rehypeRaw from 'rehype-raw';
import { preserveCodeBlocks } from '../utils/preserveCodeBlocks';
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter';
import { ghcolors } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import jsx from 'react-syntax-highlighter/dist/esm/languages/prism/jsx';
import python from 'react-syntax-highlighter/dist/esm/languages/prism/python';
import javascript from 'react-syntax-highlighter/dist/esm/languages/prism/javascript';
import typescript from 'react-syntax-highlighter/dist/esm/languages/prism/typescript';
import bash from 'react-syntax-highlighter/dist/esm/languages/prism/bash';
import json from 'react-syntax-highlighter/dist/esm/languages/prism/json';
import css from 'react-syntax-highlighter/dist/esm/languages/prism/css';
import html from 'react-syntax-highlighter/dist/esm/languages/prism/markup';
import sql from 'react-syntax-highlighter/dist/esm/languages/prism/sql';
import markdown from 'react-syntax-highlighter/dist/esm/languages/prism/markdown';
import java from 'react-syntax-highlighter/dist/esm/languages/prism/java';
import c from 'react-syntax-highlighter/dist/esm/languages/prism/c';
import cpp from 'react-syntax-highlighter/dist/esm/languages/prism/cpp';
import go from 'react-syntax-highlighter/dist/esm/languages/prism/go';
import rust from 'react-syntax-highlighter/dist/esm/languages/prism/rust';
import yaml from 'react-syntax-highlighter/dist/esm/languages/prism/yaml';

SyntaxHighlighter.registerLanguage('jsx', jsx);
SyntaxHighlighter.registerLanguage('python', python);
SyntaxHighlighter.registerLanguage('javascript', javascript);
SyntaxHighlighter.registerLanguage('typescript', typescript);
SyntaxHighlighter.registerLanguage('bash', bash);
SyntaxHighlighter.registerLanguage('json', json);
SyntaxHighlighter.registerLanguage('css', css);
SyntaxHighlighter.registerLanguage('html', html);
SyntaxHighlighter.registerLanguage('markup', html);
SyntaxHighlighter.registerLanguage('sql', sql);
SyntaxHighlighter.registerLanguage('markdown', markdown);
SyntaxHighlighter.registerLanguage('java', java);
SyntaxHighlighter.registerLanguage('c', c);
SyntaxHighlighter.registerLanguage('cpp', cpp);
SyntaxHighlighter.registerLanguage('go', go);
SyntaxHighlighter.registerLanguage('rust', rust);
SyntaxHighlighter.registerLanguage('yaml', yaml);
import { Pencil, Eye, Save, Columns2, Copy, CheckCheck, Download, Share2 } from 'lucide-react';
import { getNodes, createNode, updateNode, uploadFile, getDocuments, updateDocument, downloadAttachment, getRelatedNotes } from '../api/data';
import { useDocuments } from '../context/DocumentContext';
import type { Document, Node, RelatedNote } from '../api/data';
import MermaidBlock from './MermaidBlock';
import { normalizeTaskLists, normalizeHighlight, normalizeListSeparators, normalizeCodeBlocks, normalizeCallouts, getMarkdownTaskOrdinalAtLine, toggleMarkdownTaskByOrdinal } from '../utils/markdownPreprocess';
import { getPasteMarkdown } from '../utils/htmlToMarkdown';
import { localizeMarkdownImages } from '../utils/markdownImageUpload';
import { useIsDark } from '../hooks/useIsDark';
import { usePhoneLayout } from '../hooks/usePhoneLayout';
import MarkdownEditor from './MarkdownEditor';
import type { MarkdownEditorHandle } from './MarkdownEditor';
import EditorToolbar from './EditorToolbar';
import TagMentionPopup from './TagMentionPopup';
import type { PopupItem } from './TagMentionPopup';
import { tagMentionExtension } from '../extensions/tagMentionExtension';
import type { TagMentionState } from '../extensions/tagMentionExtension';
import { extractTagCandidates } from '../utils/tagCandidates';
import { isMentionableDocument } from '../utils/documentMention';
import ShareDialog from './ShareDialog';
import { exportNotePdf } from '../utils/notePdf';
import { showToast } from '../utils/toast';
import DocumentTabs from './DocumentTabs';
import EditorActionPortal from './EditorActionPortal';
import type { DocumentTab } from './documentTabTypes';
import ImageViewer from './ImageViewer';

const AIChatPanel = lazy(() => import('./AIChatPanel'));

interface Props {
  documentId: string;
  isNew?: boolean;
  initialNodes?: Node[];
  initialDocuments?: Document[];
  documentTabs?: DocumentTab[];
  activeDocumentTabKey?: string | null;
  showDocumentTabs?: boolean;
  onDocumentTabSelect?: (tab: DocumentTab) => void;
  onDocumentTabClose?: (tab: DocumentTab) => void;
  onRelatedNoteOpen?: (note: RelatedNote) => void;
  onDirtyChange?: (dirty: boolean) => void;
}

function preprocess(content: string): string {
  return normalizeCodeBlocks(normalizeListSeparators(normalizeHighlight(normalizeTaskLists(normalizeCallouts(content)))));
}

const BLOCK_CODE_FONT_SIZE = 'var(--markdown-block-code-font-size)';
const MARKDOWN_REMARK_PLUGINS = [remarkGfm, remarkBreaks, remarkMath];
const MARKDOWN_REHYPE_PLUGINS = [rehypeRaw, preserveCodeBlocks, rehypeKatex];

// 预览模式按顶层 Markdown 块延迟挂载，避免长笔记首次打开时一次性执行全部重渲染。
function wrapMarkdownBlocks() {
  return (tree: Root) => {
    tree.children = tree.children.map((child) => ({
      type: 'element' as const,
      tagName: 'div',
      properties: { 'data-markdown-block': 'true' },
      children: [child],
    }));
  };
}

const LAZY_MARKDOWN_REHYPE_PLUGINS = [...MARKDOWN_REHYPE_PLUGINS, wrapMarkdownBlocks];

const codeBlockCustomStyle = (isDark: boolean): React.CSSProperties => {
  // 非默认主题的暗色模式不设置内联背景，让 CSS 主题变量控制
  const mdStyle = typeof document !== 'undefined' ? document.documentElement.dataset.markdownStyle : '';
  if (mdStyle && mdStyle !== 'default' && isDark) {
    return { margin: 0, borderRadius: '0 0 0.5rem 0.5rem', fontSize: BLOCK_CODE_FONT_SIZE, background: 'transparent', border: 'none', padding: '16px', overflowX: 'auto', whiteSpace: 'pre' };
  }
  return { margin: 0, borderRadius: '0 0 0.5rem 0.5rem', fontSize: BLOCK_CODE_FONT_SIZE, background: isDark ? '#1e1e1e' : '#fbfbf8', border: 'none', padding: '16px', overflowX: 'auto', whiteSpace: 'pre' };
};

const codeLineNumberStyle = (isDark: boolean): React.CSSProperties => ({
  minWidth: '2.25em',
  paddingRight: '0.9em',
  marginRight: '0.9em',
  textAlign: 'right',
  userSelect: 'none',
  opacity: 0.58,
  fontStyle: 'normal',
  color: isDark ? '#8b949e' : '#8c959f',
  borderRight: `1px solid ${isDark ? 'rgba(139,148,158,0.28)' : 'rgba(140,149,159,0.28)'}`,
});

type MarkdownCodeProps = Parameters<NonNullable<Components['code']>>[0];

type MarkdownAstNodeWithPosition = {
  position?: {
    start?: {
      line?: number;
    };
  };
};

function getNodeStartLine(node: unknown): number | null {
  const line = (node as MarkdownAstNodeWithPosition | undefined)?.position?.start?.line;
  return typeof line === 'number' && Number.isFinite(line) ? line : null;
}

function PlainCodeWithLineNumbers({ code, isDark }: { code: string; isDark: boolean }) {
  const lineNumberStyle = codeLineNumberStyle(isDark);
  const mdStyle = typeof document !== 'undefined' ? document.documentElement.dataset.markdownStyle : '';
  const plainBg = (mdStyle && mdStyle !== 'default' && isDark) ? 'transparent' : (isDark ? '#1e1e1e' : '#fafafa');
  return (
    <pre className="markdown-code-body p-4 overflow-x-auto font-mono" style={{ background: plainBg, margin: 0, fontSize: BLOCK_CODE_FONT_SIZE, paddingLeft: '11px' }}>
      <code className="block min-w-max">
        {code.split('\n').map((line, index) => (
          <span key={index} className="flex whitespace-pre">
            <span style={lineNumberStyle}>{String(index + 1).padStart(2, '0')}</span>
            <span>{line || ' '}</span>
          </span>
        ))}
      </code>
    </pre>
  );
}

type MarkdownDivProps = Parameters<NonNullable<Components['div']>>[0];

function DeferredMarkdownBlock({
  children,
  minHeight,
  rootRef,
}: {
  children: React.ReactNode;
  minHeight: number;
  rootRef: RefObject<HTMLElement | null>;
}) {
  const blockRef = useRef<HTMLDivElement>(null);
  const [isNearViewport, setIsNearViewport] = useState(false);

  useEffect(() => {
    const element = blockRef.current;
    if (!element || typeof IntersectionObserver === 'undefined') {
      setIsNearViewport(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setIsNearViewport(true);
        observer.disconnect();
      },
      { root: rootRef.current, rootMargin: '600px 0px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [rootRef]);

  return (
    <div ref={blockRef} style={{ minHeight: isNearViewport ? undefined : minHeight }}>
      {isNearViewport ? children : null}
    </div>
  );
}

interface NoteTocItem {
  id: string;
  text: string;
  level: 1 | 2 | 3 | 4 | 5 | 6;
  sourceLine: number;
}

const TOC_LEVEL_INDENT: Record<NoteTocItem['level'], number> = {
  1: 0,
  2: 12,
  3: 24,
  4: 36,
  5: 48,
  6: 60,
};

function stripInlineMarkdown(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[`*_~]/g, '')
    .replace(/<[^>]+>/g, '')
    .trim();
}

function extractMarkdownHeadings(markdown: string): NoteTocItem[] {
  const lines = markdown.split(/\r?\n/);
  const items: NoteTocItem[] = [];
  let inFence = false;
  let fenceMarker: '```' | '~~~' | null = null;

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const trimmedStart = line.trimStart();
    const fence = trimmedStart.match(/^(```|~~~)/);
    if (fence) {
      const marker = fence[1] as '```' | '~~~';
      if (!inFence) {
        inFence = true;
        fenceMarker = marker;
      } else if (fenceMarker === marker) {
        inFence = false;
        fenceMarker = null;
      }
      continue;
    }
    if (inFence) continue;

    const match = line.match(/^ {0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (!match) continue;

    const text = stripInlineMarkdown(match[2]);
    if (!text) continue;

    const sourceLine = index + 1;
    items.push({
      id: `note-heading-${sourceLine}-${items.length}`,
      text,
      level: match[1].length as NoteTocItem['level'],
      sourceLine,
    });
  }

  return items;
}

function NoteTableOfContents({
  items,
  scrollRootRef,
  onJump,
  documentId,
}: {
  items: NoteTocItem[];
  scrollRootRef: RefObject<HTMLDivElement | null>;
  onJump: (item: NoteTocItem) => void;
  documentId: string;
}) {
  const [, setActiveId] = useState<string | null>(items[0]?.id ?? null);
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 0 });
  const [visibleRail, setVisibleRail] = useState({ top: 0, height: 0 });
  const [closedDocumentId, setClosedDocumentId] = useState<string | null>(null);
  const rafRef = useRef<number>(0);
  const tocListRef = useRef<HTMLDivElement>(null);
  const tocItemRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    const list = tocListRef.current;
    const first = tocItemRefs.current[items[visibleRange.start]?.id];
    const last = tocItemRefs.current[items[visibleRange.end]?.id];
    if (!list || !first || !last) return;
    const next = {
      top: first.offsetTop,
      height: Math.max(1, last.offsetTop + last.offsetHeight - first.offsetTop),
    };
    setVisibleRail(previous => previous.top === next.top && previous.height === next.height ? previous : next);
  }, [items, visibleRange]);

  useEffect(() => {
    const list = tocListRef.current;
    const first = tocItemRefs.current[items[visibleRange.start]?.id];
    const last = tocItemRefs.current[items[visibleRange.end]?.id];
    if (!list || !first || !last) return;
    const viewportTop = list.scrollTop;
    const viewportBottom = viewportTop + list.clientHeight;
    const rangeTop = first.offsetTop;
    const rangeBottom = last.offsetTop + last.offsetHeight;
    if (rangeTop < viewportTop) {
      first.scrollIntoView({ block: 'nearest' });
    } else if (rangeBottom > viewportBottom) {
      last.scrollIntoView({ block: 'nearest' });
    }
  }, [items, visibleRange]);

  useEffect(() => {
    const scrollRoot = scrollRootRef.current;
    if (!scrollRoot || items.length === 0) return;

    const updateActive = () => {
      const rootRect = scrollRoot.getBoundingClientRect();
      const threshold = rootRect.top + rootRect.height * 0.2;
      let bestId: string | null = null;
      let bestTop = -Infinity;

      let firstVisible = -1;
      let lastVisible = -1;
      for (const [index, item] of items.entries()) {
        const el = scrollRoot.querySelector<HTMLElement>(`[data-note-heading-id="${item.id}"]`);
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (rect.bottom > rootRect.top && rect.top < rootRect.bottom) {
          if (firstVisible === -1) firstVisible = index;
          lastVisible = index;
        }
        if (rect.top <= threshold && rect.top > bestTop) {
          bestTop = rect.top;
          bestId = item.id;
        }
      }

      if (bestId) setActiveId(previous => previous === bestId ? previous : bestId);
      if (firstVisible !== -1) {
        setVisibleRange(previous => (
          previous.start === firstVisible && previous.end === lastVisible
            ? previous
            : { start: firstVisible, end: lastVisible }
        ));
      }
    };

    const onScroll = () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(updateActive);
    };

    scrollRoot.addEventListener('scroll', onScroll, { passive: true });
    updateActive();

    return () => {
      scrollRoot.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(rafRef.current);
    };
  }, [items, scrollRootRef]);

  if (items.length === 0 || closedDocumentId === documentId) return null;

  return (
    <aside className="toc-responsive w-[240px] shrink-0 px-3 py-4">
      <div
        className="sticky top-4 max-h-[calc(100vh-7rem)] overflow-hidden flex flex-col text-gray-600 dark:text-gray-300"
      >
        <div className="flex items-center justify-between px-2 py-1.5 shrink-0">
          <span className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
            <svg className="h-4 w-4 text-gray-500 dark:text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M5 6h14M5 12h14M5 18h14" />
            </svg>
            目录
          </span>
          <button
            type="button"
            onClick={() => setClosedDocumentId(documentId)}
            className="w-5 h-5 flex items-center justify-center rounded hover:bg-gray-200/60 dark:hover:bg-gray-700/60 transition-colors"
            title="关闭目录"
          >
            <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div ref={tocListRef} className="relative flex-1 overflow-y-auto custom-scrollbar scrollbar-auto-hide py-0.5 pl-2">
          <div className="absolute left-[10px] top-0 bottom-0 w-px bg-gray-200 dark:bg-gray-700" aria-hidden="true" />
          {visibleRange.end >= visibleRange.start && (
            <div
              className="pointer-events-none absolute left-[10px] z-20 w-px bg-[var(--app-link)]"
              style={{ top: visibleRail.top, height: visibleRail.height }}
              aria-hidden="true"
            >
              <span className="absolute left-1/2 bottom-[-2px] h-1 w-1 -translate-x-1/2 rounded-full bg-[var(--app-link)]" />
            </div>
          )}
          {items.map((item, index) => {
            return (
              <button
                key={item.id}
                type="button"
                ref={(element) => { tocItemRefs.current[item.id] = element; }}
                onClick={() => onJump(item)}
                className={`relative z-10 w-full text-left leading-tight py-1 pr-2 pl-5 transition-all duration-150 truncate ${
                  index >= visibleRange.start && index <= visibleRange.end
                    ? 'text-[var(--app-link)] font-medium'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                }`}
                style={{ paddingLeft: `${20 + TOC_LEVEL_INDENT[item.level]}px`, fontSize: '13px' }}
                title={item.text}
              >
                {item.text}
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
}

const CodeBlock = memo(function CodeBlock({ className, children, ...props }: MarkdownCodeProps) {
  const [copied, setCopied] = useState(false);
  const isDark = useIsDark();
  const match = /language-(\w+)/.exec(className || '');
  const language = match ? match[1] : '';
  const rawCode = String(children);
  const code = rawCode.replace(/\n+$/, '');
  const isBlock = rawCode.endsWith('\n') || code.includes('\n') || Boolean(language);
  const handleCopy = useCallback(async () => { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000); }, [code]);

  if (isBlock) {
    const useHighlight = language && language !== 'markdown' && language !== 'text';
    const mdStyle = typeof document !== 'undefined' ? document.documentElement.dataset.markdownStyle : '';
    const headerBg = (mdStyle && mdStyle !== 'default' && isDark) ? 'transparent' : (isDark ? '#282c34' : '#f6f5f0');
    return (
      <div className="markdown-code-block markdown-code-block-root relative rounded-lg overflow-hidden border border-[#dad9d4] dark:border-gray-700">
        <div className="markdown-code-header flex items-center justify-between px-3 py-1.5 border-b border-[#dad9d4] dark:border-gray-700" style={{ background: headerBg }}>
          <span className={`markdown-code-language text-[11px] font-mono ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{language || 'text'}</span>
          <button onClick={handleCopy} className="markdown-code-copy flex items-center p-1 rounded-md bg-white/90 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 border border-gray-200 dark:border-gray-600 transition-all" title={copied ? '已复制' : '复制代码'}>
            {copied ? <CheckCheck className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          </button>
        </div>
        {useHighlight ? (
          <SyntaxHighlighter
            style={(() => {
              const base = isDark ? oneDark : ghcolors;
              if (mdStyle && mdStyle !== 'default' && isDark) {
                return {
                  ...base,
                  'code[class*="language-"]': { ...base['code[class*="language-"]'], background: 'transparent' },
                  'pre[class*="language-"]': { ...base['pre[class*="language-"]'], background: 'transparent' },
                  'code[class*="language-"] > span': { ...base['code[class*="language-"] > span'] },
                };
              }
              if (isDark) {
                return {
                  ...base,
                  'code[class*="language-"]': { ...base['code[class*="language-"]'], background: 'transparent' },
                  'pre[class*="language-"]': { ...base['pre[class*="language-"]'], background: 'transparent' },
                };
              }
              return base;
            })()}
            language={language}
            PreTag="div"
            className="markdown-code-body"
            customStyle={{ ...codeBlockCustomStyle(isDark), paddingLeft: '11px' }}
            showLineNumbers
            lineNumberStyle={codeLineNumberStyle(isDark)}
          >
            {code}
          </SyntaxHighlighter>
        ) : (
          <PlainCodeWithLineNumbers code={code} isDark={isDark} />
        )}
      </div>
    );
  }
  return <code className={className} {...props}>{children}</code>;
});

function NoteImage({ src, alt, onPreview }: { src?: string; alt?: string; onPreview: (src: string) => void }) {
  if (!src) return null;
  return (
    <img
      src={src}
      alt={alt || ''}
      className="max-w-full rounded-lg my-2 cursor-pointer hover:opacity-80 transition-opacity"
      loading="lazy"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onPreview(src);
      }}
    />
  );
}

function containsNoteImage(children: React.ReactNode): boolean {
  return Children.toArray(children).some((child) => {
    if (!isValidElement<{ children?: React.ReactNode }>(child)) return false;
    if (child.type === NoteImage) return true;
    return child.props.children ? containsNoteImage(child.props.children) : false;
  });
}

function RelatedNotes({ notes, onOpen }: { notes: RelatedNote[]; onOpen: (note: RelatedNote) => void }) {
  if (notes.length === 0) return null;
  const typeLabel: Record<RelatedNote['type'], string> = {
    memo: 'Memo',
    note: '普通笔记',
    document: '大纲笔记',
  };
  const shorten = (value: string) => value.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/[#>*_`~]/g, '').replaceAll('[', '').replaceAll(']', '').replace(/\s+/g, ' ').trim();

  return (
    <section className="related-notes mt-12 border-t border-gray-200 pt-6 dark:border-gray-700" aria-label="相关笔记">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
        <span className="h-4 w-1 rounded-full bg-[var(--app-link)]" aria-hidden="true" />
        <span>相关笔记</span>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {notes.map((note) => (
          <button
            key={`${note.type}:${note.id}`}
            type="button"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onOpen(note);
            }}
            className="min-w-0 rounded-xl border border-gray-200 bg-white p-4 text-left transition-colors hover:border-[var(--app-link)] hover:bg-[#f5faf8] dark:border-gray-700 dark:bg-gray-800 dark:hover:border-[var(--app-link)] dark:hover:bg-gray-750"
          >
            <span className="mb-2 block text-[11px] text-[var(--app-link)]">{typeLabel[note.type]}</span>
            <span className="block truncate text-sm font-medium text-gray-800 dark:text-gray-100">{note.title || '无标题'}</span>
            <span className="mt-2 block max-h-10 overflow-hidden text-xs leading-5 text-gray-500 dark:text-gray-400">{shorten(note.snippet) || '暂无摘要'}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

export default function MarkdownNoteEditor({ documentId, isNew = false, initialNodes, initialDocuments, documentTabs = [], activeDocumentTabKey = null, showDocumentTabs = true, onDocumentTabSelect, onDocumentTabClose, onRelatedNoteOpen, onDirtyChange }: Props) {
  const { updateDocumentTitle } = useDocuments();
  const isMobile = usePhoneLayout();
  const [viewMode, setViewMode] = useState<'edit' | 'preview' | 'split'>(isNew ? 'edit' : 'preview');
  const [content, setContent] = useState('');
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [title, setTitle] = useState('');
  const [nodeId, setNodeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [documents, setDocuments] = useState<Document[]>([]);
  const allTags = useMemo(() => extractTagCandidates([content]), [content]);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [relatedNotesState, setRelatedNotesState] = useState<{ key: string; notes: RelatedNote[] }>({ key: '', notes: [] });
  const editorRef = useRef<MarkdownEditorHandle>(null);
  const editorScrollRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const exportSurfaceRef = useRef<HTMLDivElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef('');
  const pendingSaveRef = useRef<string | null>(null);
  const previousDocumentIdRef = useRef(documentId);

  useEffect(() => {
    if (previousDocumentIdRef.current === documentId) return;
    previousDocumentIdRef.current = documentId;
    setViewMode(isNew ? 'edit' : 'preview');
  }, [documentId, isNew]);

  useEffect(() => {
    const relatedQueryKey = `${documentId}:${viewMode}:${content}`;
    if (viewMode !== 'preview' || isNew || content.trim().length < 30) {
      return;
    }
    let cancelled = false;
    getRelatedNotes(documentId, 3)
      .then((notes) => { if (!cancelled) setRelatedNotesState({ key: relatedQueryKey, notes }); })
      .catch(() => { if (!cancelled) setRelatedNotesState({ key: relatedQueryKey, notes: [] }); });
    return () => { cancelled = true; };
  }, [content, documentId, isNew, viewMode]);

  const handleDownload = useCallback(() => {
    const currentContent = editorRef.current?.getValue() ?? content;
    const url = URL.createObjectURL(new Blob([currentContent], { type: 'text/markdown;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${title || 'note'}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [content, title]);

  // 点击外部关闭导出菜单
  useEffect(() => {
    if (!showExportMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setShowExportMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showExportMenu]);

  const handleExportPdf = useCallback(async () => {
    if (exportingPdf || !exportSurfaceRef.current) return;
    setExportingPdf(true);
    try {
      await exportNotePdf({ surface: exportSurfaceRef.current, title: title || 'note' });
    } catch (e) {
      console.error('导出 PDF 失败', e);
      showToast('导出 PDF 失败：' + (e instanceof Error ? e.message : '未知错误'), 'error');
    } finally {
      setExportingPdf(false);
    }
  }, [exportingPdf, title]);

  // 预览区双击进入编辑模式（链接/按钮等交互元素除外）
  const handlePreviewDoubleClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('a, button, input, textarea, [role="checkbox"], .markdown-code-copy')) return;
    setViewMode('edit');
    setTimeout(() => editorRef.current?.focus(), 0);
  }, []);

  const [tagState, setTagState] = useState<TagMentionState>({ type: null, query: '', coords: null, from: 0, to: 0 });
  const [mentionState, setMentionState] = useState<TagMentionState>({ type: null, query: '', coords: null, from: 0, to: 0 });
  const [tagDropdownIndex, setTagDropdownIndex] = useState(0);
  const [mentionDropdownIndex, setMentionDropdownIndex] = useState(0);

  const filteredTags = useMemo(() => {
    if (!tagState.type || tagState.type !== 'tag') return [];
    const kw = tagState.query.toLowerCase();
    if (!kw) return allTags.slice(0, 8);
    const prefixMatches: string[] = [];
    const containsMatches: string[] = [];
    for (const tag of allTags) {
      const name = tag.slice(1).toLowerCase();
      if (name.startsWith(kw)) prefixMatches.push(tag);
      else if (name.includes(kw)) containsMatches.push(tag);
    }
    return [...prefixMatches, ...containsMatches].slice(0, 8);
  }, [tagState, allTags]);

  const filteredDocs = useMemo(() => {
    if (!mentionState.type || mentionState.type !== 'mention') return [];
    const kw = mentionState.query.toLowerCase();
    const mentionableDocuments = documents.filter(isMentionableDocument);
    if (!kw) return mentionableDocuments.slice(0, 8);
    const prefixMatches: Document[] = [];
    const containsMatches: Document[] = [];
    for (const doc of mentionableDocuments) {
      const name = (doc.title || '').toLowerCase();
      if (name.startsWith(kw)) prefixMatches.push(doc);
      else if (name.includes(kw)) containsMatches.push(doc);
    }
    return [...prefixMatches, ...containsMatches].slice(0, 8);
  }, [mentionState, documents]);

  const isTagPopupActive = useCallback(() => tagState.type === 'tag' && filteredTags.length > 0, [tagState, filteredTags]);
  const isMentionPopupActive = useCallback(() => mentionState.type === 'mention' && filteredDocs.length > 0, [mentionState, filteredDocs]);

  // CodeMirror stores these callbacks and invokes them only for editor events, never during React render.
  // eslint-disable-next-line react-hooks/refs
  const tmExtension = useMemo(() => tagMentionExtension({
    onTagSearch: (s) => { setTagState(s); setTagDropdownIndex(0); },
    onMentionSearch: (s) => { setMentionState(s); setMentionDropdownIndex(0); },
    onNavigateUp: () => {
      if (isTagPopupActive()) setTagDropdownIndex(i => Math.max(0, i - 1));
      else if (isMentionPopupActive()) setMentionDropdownIndex(i => Math.max(0, i - 1));
    },
    onNavigateDown: () => {
      if (isTagPopupActive()) setTagDropdownIndex(i => Math.min(filteredTags.length - 1, i + 1));
      else if (isMentionPopupActive()) setMentionDropdownIndex(i => Math.min(filteredDocs.length - 1, i + 1));
    },
    onPopupSelect: () => {
      if (isTagPopupActive() && filteredTags[tagDropdownIndex]) {
        handleTagSelect(filteredTags[tagDropdownIndex]);
      } else if (isMentionPopupActive() && filteredDocs[mentionDropdownIndex]) {
        handleMentionSelect(filteredDocs[mentionDropdownIndex]);
      }
    },
    onPopupClose: () => {
      setTagState({ type: null, query: '', coords: null, from: 0, to: 0 });
      setMentionState({ type: null, query: '', coords: null, from: 0, to: 0 });
      editorRef.current?.focus();
    },
    isPopupActive: () => isTagPopupActive() || isMentionPopupActive(),
  }), [allTags.length, documents.length, filteredTags, filteredDocs, tagDropdownIndex, mentionDropdownIndex, isTagPopupActive, isMentionPopupActive]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (pendingSaveRef.current !== null && nodeId) {
        const token = localStorage.getItem('token');
        fetch(`/api/nodes/${nodeId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
          body: JSON.stringify({ content: pendingSaveRef.current }),
          keepalive: true,
        }).catch(() => {});
      }
    };
  }, [nodeId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        // MainArea 已经加载过当前文档时直接复用，避免普通笔记再次请求同一批数据。
        const [nodes, docs] = await Promise.all([
          initialNodes ? Promise.resolve(initialNodes) : getNodes(documentId),
          initialDocuments ? Promise.resolve(initialDocuments) : getDocuments(),
        ]);
        if (cancelled) return;
        setDocuments(docs);
        const docMeta = docs.find(d => d.id === documentId);
        setTitle(docMeta?.title || '新笔记');
        if (nodes.length > 0) {
          const root = nodes.find(n => !n.parent_node_id) || nodes[0];
          setNodeId(root.id);
          setContent(root.content || '');
          lastSavedRef.current = root.content || '';
          onDirtyChange?.(false);
        } else {
          const newNode = await createNode(documentId, '', null);
          if (cancelled) return;
          setNodeId(newNode.id);
          setContent('');
          lastSavedRef.current = '';
          onDirtyChange?.(false);
        }
      } catch (e) { console.error('Failed to load note', e); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [documentId, initialNodes, initialDocuments, onDirtyChange]);

  const scheduleSave = useCallback((newContent: string) => {
    if (newContent === lastSavedRef.current) { pendingSaveRef.current = null; onDirtyChange?.(false); return; }
    onDirtyChange?.(true);
    pendingSaveRef.current = newContent;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      if (!nodeId) return;
      setSaving(true);
      try { await updateNode(nodeId, { content: newContent }); lastSavedRef.current = newContent; pendingSaveRef.current = null; onDirtyChange?.(false); }
      catch (e) { console.error('Failed to save note', e); }
      finally { setSaving(false); }
    }, 500);
  }, [nodeId, onDirtyChange]);

  const saveTitle = useCallback(async (newTitle: string) => {
      try { await updateDocumentTitle(documentId, newTitle); await updateDocument(documentId, { title: newTitle }); onDirtyChange?.(false); }
    catch (e) { console.error('Failed to save title', e); }
  }, [documentId, onDirtyChange, updateDocumentTitle]);

  const handleFileUpload = useCallback(async (file: File, isImage: boolean) => {
    if (file.size > 50 * 1024 * 1024) { alert('文件大小不能超过 50MB'); return; }
    setUploading(true);
    try {
      const res = await uploadFile(file);
      const url = res.file_path.replace(/^\/api/, '');
      const text = isImage ? `![${res.file_name}](${url})` : `[${res.file_name}](${url})`;
      editorRef.current?.insertText(text);
      const newContent = editorRef.current?.getValue() ?? content;
      setContent(newContent);
      scheduleSave(newContent);
    } catch (e) { console.error('Upload failed', e); alert('上传失败'); }
    finally { setUploading(false); }
  }, [scheduleSave, content]);

  const handleTagSelect = useCallback((tag: string) => {
    const view = editorRef.current?.view;
    if (!view) return;
    view.dispatch({ changes: { from: tagState.from, to: tagState.to, insert: `${tag} ` }, selection: { anchor: tagState.from + tag.length + 1 } });
    setTagState({ type: null, query: '', coords: null, from: 0, to: 0 });
    setTagDropdownIndex(0);
    scheduleSave(view.state.doc.toString());
    view.focus();
  }, [tagState, scheduleSave]);

  const handleMentionSelect = useCallback((doc: Document) => {
    const view = editorRef.current?.view;
    if (!view) return;
    const insert = `[@${doc.title || '无标题'}](/d/${doc.id}) `;
    view.dispatch({ changes: { from: mentionState.from, to: mentionState.to, insert }, selection: { anchor: mentionState.from + insert.length } });
    setMentionState({ type: null, query: '', coords: null, from: 0, to: 0 });
    setMentionDropdownIndex(0);
    scheduleSave(view.state.doc.toString());
    view.focus();
  }, [mentionState, scheduleSave]);

  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === 'file') { e.preventDefault(); const file = item.getAsFile(); if (file) handleFileUpload(file, item.type.startsWith('image/')); return; }
    }
    const md = getPasteMarkdown(e.clipboardData);
    if (md) {
      e.preventDefault();
      editorRef.current?.insertText(md);
      const newContent = editorRef.current?.getValue() ?? content;
      // CodeMirror 的 updateListener 与 React 状态更新可能不在同一批次，
      // 显式同步，确保粘贴后立即切换预览时使用最新内容。
      setContent(newContent);
      scheduleSave(newContent);
      if (md.includes('![')) {
        setUploading(true);
        try {
          const result = await localizeMarkdownImages(md);
          const view = editorRef.current?.view;
          if (!view) return;
          let updated = view.state.doc.toString();
          if (result.markdown !== md) updated = updated.replace(md, result.markdown);
          if (updated !== view.state.doc.toString()) view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: updated } });
          setContent(updated);
          scheduleSave(updated);
          if (result.failedUrls.length > 0) alert(`${result.failedUrls.length} 张图片未能自动上传，已保留原地址`);
        } finally {
          setUploading(false);
        }
      }
    }
  }, [handleFileUpload, scheduleSave, content]);

  const navigate_fn = useNavigate();
  const handleImagePreview = useCallback((src: string) => setPreviewImage(src), []);
  const processedContent = useMemo(() => preprocess(content), [content]);
  const renderedHeadings = useMemo(() => extractMarkdownHeadings(processedContent), [processedContent]);
  const headingIdByLine = useMemo(() => {
    const map = new Map<number, string>();
    for (const item of renderedHeadings) map.set(item.sourceLine, item.id);
    return map;
  }, [renderedHeadings]);
  const tocItems = useMemo(() => {
    const rawHeadings = extractMarkdownHeadings(content);
    return rawHeadings.map((item, index) => ({
      ...item,
      id: renderedHeadings[index]?.id ?? item.id,
    }));
  }, [content, renderedHeadings]);
  const showNoteToc = !isMobile && viewMode !== 'split' && tocItems.length > 0;

  const handleTocJump = useCallback((item: NoteTocItem) => {
    if (viewMode === 'preview') {
      const scrollRoot = previewRef.current;
      const target = scrollRoot?.querySelector<HTMLElement>(`[data-note-heading-id="${item.id}"]`);
      if (!scrollRoot || !target) return;

      const rootRect = scrollRoot.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const targetTop = scrollRoot.scrollTop + targetRect.top - rootRect.top - 32;
      scrollRoot.scrollTo({ top: targetTop, behavior: 'smooth' });
      return;
    }

    const view = editorRef.current?.view;
    if (!view) return;
    const lineNumber = Math.min(Math.max(item.sourceLine, 1), view.state.doc.lines);
    const line = view.state.doc.line(lineNumber);
    view.dispatch({
      selection: { anchor: line.from },
      effects: EditorView.scrollIntoView(line.from, { y: 'start', yMargin: 72 }),
    });
    view.focus();
  }, [viewMode]);

  const handlePreviewTaskToggle = useCallback((sourceLine: number | null) => {
    const taskIndex = getMarkdownTaskOrdinalAtLine(processedContent, sourceLine);
    if (taskIndex == null) return;
    const nextContent = toggleMarkdownTaskByOrdinal(content, taskIndex);
    if (nextContent === content) return;
    setContent(nextContent);
    const view = editorRef.current?.view;
    if (view) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: nextContent } });
    }
    scheduleSave(nextContent);
  }, [content, processedContent, scheduleSave]);

  const mdComponents = useMemo((): Components => ({
    div: ({ node, children, ...props }: MarkdownDivProps) => {
      const properties = (node as { properties?: Record<string, unknown> } | undefined)?.properties;
      if (properties?.['data-markdown-block'] === 'true') {
        const startLine = getNodeStartLine((node as { children?: unknown[] }).children?.[0]);
        const endLine = (node as { children?: Array<{ position?: { end?: { line?: number } } }> }).children?.[0]?.position?.end?.line;
        const estimatedLines = startLine && endLine && endLine >= startLine ? endLine - startLine + 1 : 2;
        return (
          <DeferredMarkdownBlock
            minHeight={Math.max(44, Math.min(420, estimatedLines * 28))}
            rootRef={previewRef}
          >
            {children}
          </DeferredMarkdownBlock>
        );
      }
      return <div {...props}>{children}</div>;
    },
    code: (props: MarkdownCodeProps) => {
      const match = /language-(\w+)/.exec(props.className || '');
      if (match && match[1] === 'mermaid') return <MermaidBlock code={String(props.children).replace(/\n$/, '')} />;
      return <CodeBlock {...props} />;
    },
    h1: ({ node, children, ...props }) => {
      const line = getNodeStartLine(node);
      const id = line == null ? undefined : headingIdByLine.get(line);
      return <h1 {...props} id={id} data-note-heading-id={id}>{children}</h1>;
    },
    h2: ({ node, children, ...props }) => {
      const line = getNodeStartLine(node);
      const id = line == null ? undefined : headingIdByLine.get(line);
      return <h2 {...props} id={id} data-note-heading-id={id}>{children}</h2>;
    },
    h3: ({ node, children, ...props }) => {
      const line = getNodeStartLine(node);
      const id = line == null ? undefined : headingIdByLine.get(line);
      return <h3 {...props} id={id} data-note-heading-id={id}>{children}</h3>;
    },
    h4: ({ node, children, ...props }) => {
      const line = getNodeStartLine(node);
      const id = line == null ? undefined : headingIdByLine.get(line);
      return <h4 {...props} id={id} data-note-heading-id={id}>{children}</h4>;
    },
    h5: ({ node, children, ...props }) => {
      const line = getNodeStartLine(node);
      const id = line == null ? undefined : headingIdByLine.get(line);
      return <h5 {...props} id={id} data-note-heading-id={id}>{children}</h5>;
    },
    h6: ({ node, children, ...props }) => {
      const line = getNodeStartLine(node);
      const id = line == null ? undefined : headingIdByLine.get(line);
      return <h6 {...props} id={id} data-note-heading-id={id}>{children}</h6>;
    },
    img: ({ src, alt }) => <NoteImage src={src} alt={alt} onPreview={handleImagePreview} />,
    a: ({ href, children, ...props }) => {
      // 兼容旧笔记中 [![图片](图片地址)](原文章地址) 的格式，
      // 图片不应继续继承外层文章链接。
      if (containsNoteImage(children)) {
        return <span className="note-image-link-contents">{children}</span>;
      }
      if (href?.startsWith('/d/')) {
        const docId = href.replace('/d/', '');
        const linkedDocument = documents.find(document => document.id === docId);
        const childText = Children.toArray(children)
          .filter((child): child is string => typeof child === 'string')
          .join('');
        const linkedLabel = linkedDocument
          ? (childText.trimStart().startsWith('@') ? `@${linkedDocument.title || '无标题'}` : linkedDocument.title || '无标题')
          : children;
        return <a href={href} className="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 bg-blue-50 dark:bg-blue-900/30 px-1 rounded cursor-pointer"
          onClick={(e) => { e.preventDefault(); navigate_fn(`/d/${docId}`); }}>{linkedLabel}</a>;
      }
      if (href?.startsWith('/uploads/')) {
        return (
          <a
            {...props}
            href={href}
            onClick={(e) => {
              e.preventDefault();
              void downloadAttachment(href, typeof children === 'string' ? children : undefined);
            }}
            className="text-blue-500 underline hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300"
            title="下载附件"
          >
            {children}
          </a>
        );
      }
      return <a {...props} href={href} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 underline">{children}</a>;
    },
    li: ({ children, ordered, index, node, ...props }) => {
      void ordered;
      void index;
      const liClassName = typeof props.className === 'string' ? props.className : '';
      if (liClassName.includes('task-list-item')) {
        const sourceLine = getNodeStartLine(node);
        return (
          <li
            {...props}
            className={`${liClassName} relative list-none`}
            style={{ paddingLeft: 22, marginLeft: 0, listStyle: 'none' }}
            onClick={(e) => {
              const target = e.target as HTMLElement;
              const checkbox = target.closest('[role="checkbox"]');
              if (!checkbox || !e.currentTarget.contains(checkbox)) return;
              e.preventDefault();
              e.stopPropagation();
              handlePreviewTaskToggle(sourceLine);
            }}
          >
            {children}
          </li>
        );
      }
      return <li {...props}>{children}</li>;
    },
    input: ({ checked, type, className, ...props }) => {
      if (type === 'checkbox') {
        return (
          <button
            type="button"
            role="checkbox"
            aria-checked={checked}
            className={`absolute left-0 top-[5px] z-20 inline-flex h-[14px] w-[14px] shrink-0 cursor-pointer items-center justify-center rounded-full border transition-colors ${
              checked
                ? 'border-[var(--app-link)] bg-[var(--app-link)]'
                : 'border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-800'
            }`}
            onMouseDown={(e) => {
              e.preventDefault();
            }}
            onClick={(e) => {
              e.preventDefault();
            }}
          >
            {checked && (
              <svg viewBox="0 0 16 16" fill="none" className="h-2 w-2 text-white" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3.5 8.5L6.5 11.5L12.5 4.5" />
              </svg>
            )}
          </button>
        );
      }
      return <input type={type} checked={checked} className={className} {...props} />;
    },
  }), [documents, handleImagePreview, handlePreviewTaskToggle, headingIdByLine, navigate_fn]);

  // Scroll sync: bidirectional editor ↔ preview in split mode (from markamd)
  useEffect(() => {
    if (viewMode !== 'split') return;

    const editor = editorScrollRef.current;
    const preview = previewRef.current;
    if (!editor || !preview) return;

    const echo = { editor: 0, preview: 0 };

    const makeSync = (
      src: HTMLElement,
      dst: HTMLElement,
      srcKey: 'editor' | 'preview',
      dstKey: 'editor' | 'preview',
    ) => {
      let pending = false;
      return () => {
        if (echo[srcKey] > 0) { echo[srcKey] -= 1; return; }
        if (pending) return;
        pending = true;
        requestAnimationFrame(() => {
          pending = false;
          const srcRange = src.scrollHeight - src.clientHeight;
          const dstRange = dst.scrollHeight - dst.clientHeight;
          if (srcRange <= 0 || dstRange <= 0) return;
          const ratio = src.scrollTop / srcRange;
          const target = ratio * dstRange;
          if (Math.abs(dst.scrollTop - target) < 1) return;
          echo[dstKey] += 1;
          dst.scrollTop = target;
        });
      };
    };

    const onEditor = makeSync(editor, preview, 'editor', 'preview');
    const onPreview = makeSync(preview, editor, 'preview', 'editor');
    editor.addEventListener('scroll', onEditor, { passive: true });
    preview.addEventListener('scroll', onPreview, { passive: true });

    return () => {
      editor.removeEventListener('scroll', onEditor);
      preview.removeEventListener('scroll', onPreview);
    };
  }, [viewMode]);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="text-gray-400 dark:text-gray-500 text-sm">加载中...</div></div>;

  const showTagPopup = tagState.type === 'tag' && filteredTags.length > 0 && tagState.coords;
  const showMentionPopup = mentionState.type === 'mention' && filteredDocs.length > 0 && mentionState.coords;

  return (
    <div className="flex flex-col h-full bg-[var(--app-canvas)]">
      <div className="hidden">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {showDocumentTabs && onDocumentTabSelect && onDocumentTabClose && (
            <DocumentTabs
              tabs={documentTabs}
              activeKey={activeDocumentTabKey}
              onSelect={onDocumentTabSelect}
              onClose={onDocumentTabClose}
            />
          )}
          {saving && <span className="text-xs text-gray-400 shrink-0"><Save className="w-3 h-3 inline mr-0.5" />保存中</span>}
          {uploading && <span className="text-xs text-blue-500 shrink-0">上传中...</span>}
        </div>
        <EditorActionPortal>
        <div className="flex items-center gap-1 shrink-0 ml-4">
          <div className="relative" ref={exportMenuRef}>
            <button
              onClick={() => setShowExportMenu(v => !v)}
              className="editor-topbar-button"
              title="导出"
            >
              <Download className="h-[14px] w-[14px]" />
              <span className="hidden lg:inline">导出</span>
            </button>
            {showExportMenu && (
              <div className="absolute right-0 top-full z-50 mt-1 min-w-[150px] overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-800">
                <button
                  onClick={() => { setShowExportMenu(false); handleDownload(); }}
                  className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  <Download className="h-4 w-4" />
                  导出 Markdown
                </button>
                <button
                  onClick={() => { setShowExportMenu(false); void handleExportPdf(); }}
                  disabled={exportingPdf}
                  className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  <Download className="h-4 w-4" />
                  {exportingPdf ? '导出中...' : '导出 PDF'}
                </button>
              </div>
            )}
          </div>
          <button
            onClick={() => setShowShareDialog(true)}
            className="editor-topbar-button"
            title="分享笔记"
          >
            <Share2 className="h-[14px] w-[14px]" />
            <span className="hidden lg:inline">分享</span>
          </button>
          <button onClick={() => setViewMode(viewMode === 'preview' ? 'edit' : 'preview')}
            className={`editor-topbar-button ${viewMode !== 'preview' ? 'is-active' : ''}`}>
            {viewMode === 'preview' ? <Pencil className="h-[14px] w-[14px]" /> : <Eye className="h-[14px] w-[14px]" />}
          </button>
          <button onClick={() => setViewMode(viewMode === 'split' ? 'edit' : 'split')}
            className={`editor-topbar-button ${viewMode === 'split' ? 'is-active' : ''}`}
            title="分屏模式"><Columns2 className="h-[14px] w-[14px]" /></button>
        </div>
        </EditorActionPortal>
      </div>

      <div className="toc-layout-container flex-1 min-h-0 flex">
        {(viewMode === 'edit' || viewMode === 'split') && (
          <div className={`${viewMode === 'split' ? 'w-1/2 border-r border-gray-200 dark:border-gray-700' : 'flex-1 min-w-0 h-full'} flex flex-col`}>
            {/* 编辑模式固定头部：标题和快捷工具栏不参与正文滚动。 */}
            <div
              className={`shrink-0 ${viewMode === 'split' ? 'w-full' : 'flex justify-center'}`}
              style={isMobile ? { paddingTop: 'calc(env(safe-area-inset-top, 0px) + 58px)' } : undefined}
            >
              <div className={`w-full ${viewMode === 'split' ? '' : 'max-w-[768px]'}`}>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => { setTitle(e.target.value); onDirtyChange?.(true); }}
                  onBlur={() => { if (title.trim()) saveTitle(title.trim()); }}
                  className="w-full bg-transparent px-6 pb-[15px] pt-[15px] text-xl font-semibold leading-tight text-gray-900 outline-none placeholder:text-gray-400 dark:text-gray-100"
                  placeholder="笔记标题"
                  aria-label="笔记标题"
                />
                <div className="w-full bg-[var(--app-canvas)]">
                  <div className="overflow-x-auto">
                    <EditorToolbar
                      editorRef={editorRef}
                      onUploadImage={() => imageInputRef.current?.click()}
                      onUploadFile={() => fileInputRef.current?.click()}
                      onOpenAI={() => setShowAIPanel(true)}
                    />
                  </div>
                </div>
              </div>
            </div>
            <div ref={editorScrollRef} className={`flex-1 min-h-0 overflow-y-auto custom-scrollbar scrollbar-auto-hide ${viewMode === 'split' ? '' : 'flex justify-center'}`}>
              <div className={`flex flex-col ${viewMode === 'split' ? 'w-full' : 'w-full max-w-[768px]'}`} onPasteCapture={handlePaste}>
                <MarkdownEditor ref={editorRef} value={content} onChange={(val) => { setContent(val); scheduleSave(val); }}
                  compact={false} placeholder="开始书写... (支持 Markdown，输入 # 添加标签，@ 链接笔记)" className="min-h-0 px-6 pt-5"
                  extensions={[tmExtension]}
                />
              </div>
            </div>
            {showTagPopup && createPortal(
              <TagMentionPopup items={filteredTags.map((t): PopupItem => ({ label: t, value: t }))} selectedIndex={tagDropdownIndex}
                onSelect={(item) => handleTagSelect(item.value)} onClose={() => setTagState({ type: null, query: '', coords: null, from: 0, to: 0 })}
                position={tagState.coords!} type="tag" />, document.body
            )}
            {showMentionPopup && createPortal(
              <TagMentionPopup items={filteredDocs.map((d): PopupItem => ({ label: d.title || '无标题', value: d.id, detail: d.type }))} selectedIndex={mentionDropdownIndex}
                onSelect={(item) => handleMentionSelect(filteredDocs.find(d => d.id === item.value)!)} onClose={() => setMentionState({ type: null, query: '', coords: null, from: 0, to: 0 })}
                position={mentionState.coords!} type="mention" />, document.body
            )}
          </div>
        )}
        {(viewMode === 'preview' || viewMode === 'split') && (
          <div
            ref={previewRef}
            className={`${viewMode === 'split' ? 'w-1/2' : 'flex-1 min-w-0 h-full'} overflow-x-hidden overflow-y-auto custom-scrollbar scrollbar-auto-hide flex flex-col items-center`}
            style={isMobile ? { paddingTop: 'calc(env(safe-area-inset-top, 0px) + 58px)' } : undefined}
          >
            <div
              onDoubleClick={handlePreviewDoubleClick}
              className="markdown-note-preview memo-content max-w-[768px] w-full cursor-text text-base text-gray-700 dark:text-gray-300 p-6"
              style={{ lineHeight: '1.75' }}

            >
              <h1 className="markdown-note-title mb-6 text-3xl font-semibold leading-tight text-gray-900 dark:text-gray-100">{title || '无标题'}</h1>
              {content.trim() ? (
                <ReactMarkdown remarkPlugins={MARKDOWN_REMARK_PLUGINS} rehypePlugins={LAZY_MARKDOWN_REHYPE_PLUGINS} components={mdComponents}>{processedContent}</ReactMarkdown>
              ) : <p className="text-gray-400 dark:text-gray-500 italic">空笔记</p>}
              {viewMode === 'preview' && relatedNotesState.key === `${documentId}:${viewMode}:${content}` && (
                <RelatedNotes
                  notes={relatedNotesState.notes}
                  onOpen={(note) => {
                    if (onRelatedNoteOpen) {
                      onRelatedNoteOpen(note);
                      return;
                    }
                    navigate(note.type === 'memo' ? `/?view=wanderer&memoId=${note.id}` : `/d/${note.id}`);
                  }}
                />
              )}
            </div>
          </div>
        )}
        {showNoteToc && (
          <NoteTableOfContents
            items={tocItems}
            scrollRootRef={viewMode === 'preview' ? previewRef : editorScrollRef}
            onJump={handleTocJump}
            documentId={documentId}
          />
        )}
      </div>

      <ImageViewer
        src={previewImage || ''}
        alt="笔记图片"
        isOpen={previewImage !== null}
        onClose={() => setPreviewImage(null)}
      />

      <input ref={imageInputRef} type="file" accept="image/*" multiple className="hidden"
        onChange={(e) => { const files = e.target.files; if (files) { for (let i = 0; i < files.length; i++) { handleFileUpload(files[i], true); } } e.target.value = ''; }} />
      <input ref={fileInputRef} type="file" multiple className="hidden"
        onChange={(e) => { const files = e.target.files; if (files) { for (let i = 0; i < files.length; i++) { handleFileUpload(files[i], false); } } e.target.value = ''; }} />

      {showAIPanel && (
        <Suspense fallback={null}><AIChatPanel context={content}
          onWriteBack={(newContent) => { setContent(newContent); editorRef.current?.view?.dispatch({ changes: { from: 0, to: editorRef.current.view.state.doc.length, insert: newContent } }); scheduleSave(newContent); }}
          onClose={() => setShowAIPanel(false)} /></Suspense>
      )}
      <ShareDialog
        key={`${documentId}-${showShareDialog}`}
        isOpen={showShareDialog}
        documentId={documentId}
        onCancel={() => setShowShareDialog(false)}
      />

      {/* 导出 PDF 用的隐藏渲染面：与预览同一套渲染管线，任意视图下都可导出 */}
      <div
        ref={exportSurfaceRef}
        className="markdown-note-preview memo-content"
        style={{ position: 'fixed', left: -99999, top: 0, width: 768, background: '#ffffff', color: '#1f2937', lineHeight: 1.75, zIndex: -1, pointerEvents: 'none', visibility: 'hidden', overflow: 'hidden', contain: 'layout paint style' }}
        aria-hidden="true"
      >
        {content.trim() ? (
          <ReactMarkdown
            remarkPlugins={MARKDOWN_REMARK_PLUGINS}
            rehypePlugins={MARKDOWN_REHYPE_PLUGINS}
            components={mdComponents}
          >
            {processedContent}
          </ReactMarkdown>
        ) : null}
      </div>
    </div>
  );
}
