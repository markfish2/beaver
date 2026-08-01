import { useState, useCallback, useEffect, useRef, useMemo, memo, Children, isValidElement, type TouchEvent as ReactTouchEvent } from 'react';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
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
import { extractMemoFileLinks as extractFileLinks, extractMemoImages as extractImages, extractMemoTags as extractTags, extractMemoUrls as extractUrls, formatMemoTime as formatTime } from './memoCardContent';

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
import { MoreVertical, Pencil, Trash2, Pin, PinOff, X, Check, Copy, CheckCheck, Image, Paperclip, FileText, Download, Archive, ArchiveRestore, ArrowUpRight, Globe, Maximize2, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { Memo, Document, LinkPreview } from '../api/data';
import { uploadFile, getMemoTags, updateMemoColor, getThumbnailUrl, fetchLinkPreview, retryLinkPreview } from '../api/data';
import MermaidBlock from './MermaidBlock';
import LinkPreviewCard from './LinkPreviewCard';
import MarkdownEditor from './MarkdownEditor';
import type { MarkdownEditorHandle } from './MarkdownEditor';
import EditorToolbar from './EditorToolbar';
import TagMentionPopup from './TagMentionPopup';
import type { PopupItem } from './TagMentionPopup';
import { tagMentionExtension } from '../extensions/tagMentionExtension';
import type { TagMentionState } from '../extensions/tagMentionExtension';
import { stripTags, stripAttachments, normalizeTaskLists, normalizeHighlight, normalizeListSeparators, normalizeCodeBlocks, normalizeCallouts, escapeCodeBlockHtml } from '../utils/markdownPreprocess';
import MemoToDocDialog from './MemoToDocDialog';
import AudioPlayer from './AudioPlayer';
import AIChatPanel from './AIChatPanel';
import { useIsDark } from '../hooks/useIsDark';
import { getMemoPalette, getMemoPaletteStyle, MEMO_COLOR_OPTIONS, MEMO_TAG_COLORS, type MemoCardPalette } from './memoCardTheme';
import { getPasteMarkdown } from '../utils/htmlToMarkdown';
import { localizeMarkdownImages } from '../utils/markdownImageUpload';

function tagColorIndex(tag: string): number {
  let h = 0;
  for (let i = 0; i < tag.length; i++) {
    h = (h * 31 + tag.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % MEMO_TAG_COLORS.length;
}

interface MemoCardProps {
  memo: Memo;
  onEdit: (id: string, content: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onTogglePin: (id: string, is_pinned: boolean) => Promise<void>;
  onToggleArchive: (id: string, is_archived: boolean) => Promise<void>;
  onTogglePublic?: (id: string, is_public: boolean) => Promise<void>;
  onToggleAI?: (id: string, ai_excluded: boolean) => Promise<void>;
  onTagClick: (tag: string) => void;
  onColorChange?: (id: string, color: string | null) => void;
  isHighlighted?: boolean;
  documents?: Document[];
  readOnly?: boolean;
  compact?: boolean;
}
const codeBlockCustomStyle = (palette: MemoCardPalette): React.CSSProperties => ({
  margin: 0,
  borderRadius: '0 0 0.5rem 0.5rem',
  fontSize: '0.95em',
  background: palette.codeBlockBackground ?? palette.surfaceStrong,
  border: 'none',
  padding: '16px',
});

type CodeBlockProps = React.ComponentPropsWithoutRef<'code'> & { palette: MemoCardPalette; compact?: boolean };

const CodeBlock = memo(function CodeBlock({ className, children, palette, compact = false, ...props }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const match = /language-(\w+)/.exec(className || '');
  const language = match ? match[1] : '';
  const code = String(children).replace(/\n$/, '');
  const isBlock = code.includes('\n') || language;

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [code]);

  if (isBlock) {
    const useHighlight = language && language !== 'markdown' && language !== 'text';
    return (
      <div className="markdown-code-block relative rounded-lg overflow-hidden border" style={{ borderColor: palette.codeBorder ?? palette.surfaceBorder }}>
        <div
          className={`markdown-code-header flex items-center justify-between border-b ${compact ? 'px-2 py-1' : 'px-3 py-1.5'}`}
          style={{ background: palette.codeHeaderBackground ?? palette.surface, borderColor: palette.codeBorder ?? palette.surfaceBorder }}
        >
          <span className="markdown-code-language text-[11px] font-mono" style={{ color: palette.codeMutedText ?? palette.mutedText }}>{language || 'text'}</span>
          <button
            onClick={handleCopy}
            className="markdown-code-copy flex items-center p-1 rounded-md border transition-opacity hover:opacity-80"
            style={{
              color: palette.codeButtonText ?? palette.text,
              background: palette.codeButtonBackground ?? palette.surfaceStrong,
              borderColor: palette.codeButtonBorder ?? palette.surfaceBorder,
            }}
            title={copied ? '已复制' : '复制代码'}
          >
            {copied ? <CheckCheck className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          </button>
        </div>
        {useHighlight ? (
          <SyntaxHighlighter
            style={palette.isDarkSurface ? oneDark : ghcolors}
            language={language}
            PreTag="div"
            className="markdown-code-body"
            customStyle={{ ...codeBlockCustomStyle(palette), padding: compact ? '10px' : '16px', fontSize: compact ? '0.82em' : '0.95em' }}
          >
            {code}
          </SyntaxHighlighter>
        ) : (
          <pre className={`markdown-code-body ${compact ? 'p-2.5 text-xs' : 'p-4 text-sm'} overflow-x-auto font-mono`} style={{ background: palette.plainCodeBlockBackground ?? palette.surfaceStrong, color: palette.codeText ?? palette.text, margin: 0 }}>
            <code style={{ color: palette.codeText ?? palette.text }}>{code}</code>
          </pre>
        )}
      </div>
    );
  }

  return (
    <code
      className={className}
      {...props}
      style={{ background: palette.inlineCodeBackground, color: palette.inlineCodeText }}
    >
      {children}
    </code>
  );
});

function ImagePreview({ images, src: initialSrc, onClose }: { images: string[]; src: string; onClose: () => void }) {
  const [currentSrc, setCurrentSrc] = useState(initialSrc);
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const pinchStartRef = useRef<{ dist: number; scale: number } | null>(null);
  const dragStartRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const doubleTapRef = useRef<number>(0);

  const currentIndex = images.indexOf(currentSrc);
  const src = currentSrc;

  const navigate = useCallback((newIndex: number) => {
    if (newIndex >= 0 && newIndex < images.length) {
      setCurrentSrc(images[newIndex]);
      setScale(1);
      setTranslate({ x: 0, y: 0 });
    }
  }, [images]);

  // Keyboard navigation
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') navigate(currentIndex - 1);
      else if (e.key === 'ArrowRight') navigate(currentIndex + 1);
      else if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [currentIndex, navigate, onClose]);

  const getTouchDist = (touches: TouchList) => {
    if (touches.length < 2) return 0;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const handleTouchStart = useCallback((e: ReactTouchEvent) => {
    e.stopPropagation();
    const touches = e.touches;

    if (touches.length === 2) {
      // Pinch start
      const dist = getTouchDist(touches);
      pinchStartRef.current = { dist, scale };
    } else if (touches.length === 1) {
      // Double-tap detection
      const now = Date.now();
      if (now - doubleTapRef.current < 300) {
        // Double tap: toggle zoom
        if (scale > 1.5) {
          setScale(1);
          setTranslate({ x: 0, y: 0 });
        } else {
          setScale(2.5);
        }
        doubleTapRef.current = 0;
        return;
      }
      doubleTapRef.current = now;

      // Single finger drag start (only when zoomed)
      if (scale > 1) {
        setIsDragging(true);
        dragStartRef.current = {
          x: touches[0].clientX,
          y: touches[0].clientY,
          tx: translate.x,
          ty: translate.y,
        };
      }
    }
  }, [scale, translate]);

  const handleTouchMove = useCallback((e: ReactTouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const touches = e.touches;

    if (touches.length === 2 && pinchStartRef.current) {
      // Pinch zoom
      const dist = getTouchDist(touches);
      const newScale = Math.max(0.5, Math.min(5, pinchStartRef.current.scale * (dist / pinchStartRef.current.dist)));
      setScale(newScale);
    } else if (touches.length === 1 && isDragging && dragStartRef.current) {
      // Pan when zoomed
      const dx = touches[0].clientX - dragStartRef.current.x;
      const dy = touches[0].clientY - dragStartRef.current.y;
      setTranslate({
        x: dragStartRef.current.tx + dx,
        y: dragStartRef.current.ty + dy,
      });
    }
  }, [isDragging]);

  const handleTouchEnd = useCallback((e: ReactTouchEvent) => {
    if (e.touches.length < 2) {
      pinchStartRef.current = null;
    }
    if (e.touches.length === 0) {
      setIsDragging(false);
      dragStartRef.current = null;
      // Snap back if scale < 1
      if (scale < 1) {
        setScale(1);
        setTranslate({ x: 0, y: 0 });
      }
    }
  }, [scale]);

  const handleClose = useCallback(() => {
    if (scale <= 1.05 && Math.abs(translate.x) < 10 && Math.abs(translate.y) < 10) {
      onClose();
    }
  }, [scale, translate, onClose]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setScale(s => Math.max(0.5, Math.min(5, s * delta)));
  }, []);

  const imgStyle = useMemo(() => ({
    transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
    cursor: (scale > 1 ? 'grab' : 'zoom-in') as string,
  }), [translate.x, translate.y, scale]);

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center touch-none select-none"
      onClick={handleClose}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onWheel={handleWheel}
    >
      {/* 左箭头 */}
      {images.length > 1 && currentIndex > 0 && (
        <button
          className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition-colors"
          onClick={(e) => { e.stopPropagation(); navigate(currentIndex - 1); }}
        >
          ‹
        </button>
      )}

      <img
        src={src}
        alt=""
        draggable={false}
        className="max-w-[95vw] max-h-[95vh] object-contain rounded-lg shadow-2xl transition-transform duration-100"
        style={imgStyle}
        onClick={(e) => {
          e.stopPropagation();
          if (scale <= 1.05) {
            const now = Date.now();
            if (now - doubleTapRef.current < 300) {
              setScale(2.5);
              doubleTapRef.current = 0;
            } else {
              doubleTapRef.current = now;
            }
          }
        }}
      />

      {/* 右箭头 */}
      {images.length > 1 && currentIndex < images.length - 1 && (
        <button
          className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition-colors"
          onClick={(e) => { e.stopPropagation(); navigate(currentIndex + 1); }}
        >
          ›
        </button>
      )}

      {/* 页码指示器 */}
      {images.length > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/70 text-sm bg-black/40 px-3 py-1 rounded-full">
          {currentIndex + 1} / {images.length}
        </div>
      )}
    </div>
  );
}

const MemoImage = memo(function MemoImage({ src, alt, onPreview }: { src?: string; alt?: string; onPreview: (url: string) => void }) {
  if (!src) return null;
  return (
    <img
      src={getThumbnailUrl(src)}
      alt={alt || ''}
      className="cursor-pointer hover:opacity-80 transition-opacity"
      onClick={() => onPreview(src)}
    />
  );
});

function isUnchecked(trimmed: string): boolean {
  return /^[-*+]\s*\[ \]\s/.test(trimmed);
}

function isInProgress(trimmed: string): boolean {
  return /^[-*+]\s*\[-\]\s/.test(trimmed);
}

function isChecked(trimmed: string): boolean {
  return /^[-*+]\s*\[[xX*]\]\s/.test(trimmed);
}

function isTaskLine(trimmed: string): boolean {
  return isUnchecked(trimmed) || isInProgress(trimmed) || isChecked(trimmed);
}

function toggleTaskCheckbox(content: string, taskIndex: number): string {
  const lines = content.split('\n');
  const strippedLines = lines.map(l => {
    let s = l.replace(/#[a-zA-Z0-9_一-龥]+/g, '');
    s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '');
    s = s.replace(/(?<!!)\[([^\]]+)\]\(([^)]+)\)/g, '');
    return s;
  });
  let taskCount = 0;
  for (let i = 0; i < strippedLines.length; i++) {
    const trimmed = strippedLines[i].trimStart();
    if (isTaskLine(trimmed)) {
      if (taskCount === taskIndex) {
        const origTrimmed = lines[i].trimStart();
        const marker = origTrimmed[0];
        const indent = lines[i].slice(0, lines[i].indexOf(origTrimmed[0]));
        const rest = origTrimmed.slice(origTrimmed.indexOf(']') + 2);
        // 两态循环：[ ] ↔ [x]（memo 不需要进行中状态）
        let newMark: string;
        if (isChecked(origTrimmed) || isInProgress(origTrimmed)) {
          newMark = '[ ]';
        } else {
          newMark = '[x]';
        }
        lines[i] = `${indent}${marker} ${newMark} ${rest}`;
        return lines.join('\n');
      }
      taskCount++;
    }
  }
  return content;
}

// 将 [-] 进行中任务转为未完成复选框（memo 只需要两态）
function normalizeInProgressTasks(content: string): string {
  return content.replace(/^(\s*[-*+]) \[-\] /gm, '$1 [ ] ');
}

const markdownComponents = (
  onPreview: (url: string) => void,
  onToggleCheckbox: (taskIndex: number) => void,
  checkboxCounter: { current: number },
  navigate: (to: string) => void,
  palette: MemoCardPalette,
  compact: boolean,
): Components => {
  return {
    code: (props) => {
      const match = /language-(\w+)/.exec(props.className || '');
      if (match && match[1] === 'mermaid') {
        return <MermaidBlock code={String(props.children).replace(/\n$/, '')} dark={palette.isDarkSurface} />;
      }
      return <CodeBlock {...props} palette={palette} compact={compact} />;
    },
    img: ({ src, alt }) => {
      // 检测音频文件
      if (src && /\.(mp4|webm|ogg|wav|mp3|m4a)(\?|$)/i.test(src)) {
        return <AudioPlayer src={src} themed />;
      }
      return <MemoImage src={src} alt={alt} onPreview={onPreview} />;
    },
    a: ({ href, children, ...props }) => {
      if (href?.startsWith('/d/')) {
        return (
          <a
            href={href}
            className="memo-document-link px-1 rounded cursor-pointer"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              navigate(href);
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            {children}
          </a>
        );
      }
      return <a {...props} href={href} target="_blank" rel="noopener noreferrer">{children}</a>;
    },
    li: ({ children, ordered, index, node, ...props }) => {
      void ordered;
      void index;
      void node;
      const liClassName = typeof props.className === 'string' ? props.className : '';
      const isTaskItem = liClassName.includes('task-list-item');
      const hasCheckboxDeep = (nodes: React.ReactNode[]): boolean =>
        nodes.some(child => {
          if (!isValidElement<{ role?: string; children?: React.ReactNode }>(child)) return false;
          if (child.props.role === 'checkbox') return true;
          if (child.props?.children) {
            return hasCheckboxDeep(Children.toArray(child.props.children));
          }
          return false;
        });
      const arr = Children.toArray(children);
      const hasCheckbox = isTaskItem || hasCheckboxDeep(arr);
      // 任务列表使用自定义渲染，普通列表使用浏览器原生渲染
      if (hasCheckbox) {
        return <li className="list-none relative pl-[22px] leading-[1.5]">{children}</li>;
      }
      // 普通列表：让浏览器原生渲染标记（有序数字/无序圆点）
      return <li {...props}>{children}</li>;
    },
    input: ({ checked, type, className: inputClassName, ...props }) => {
      if (type === 'checkbox') {
        const idx = checkboxCounter.current++;
        return (
          <span
            role="checkbox"
            aria-checked={checked}
            className={`absolute left-0 top-[5px] inline-flex items-center justify-center w-[14px] h-[14px] rounded-full border cursor-pointer shrink-0 transition-colors ${
              checked
                ? 'bg-[#3f587f] border-[#3f587f]'
                : ''
            }`}
            style={checked ? undefined : { background: palette.surface, borderColor: palette.surfaceBorder }}
            onClick={(e) => {
              e.stopPropagation();
              onToggleCheckbox(idx);
            }}
          >
            {checked && (
              <svg viewBox="0 0 16 16" fill="none" className="w-2 h-2 text-white" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3.5 8.5L6.5 11.5L12.5 4.5" />
              </svg>
            )}
          </span>
        );
      }
      return <input type={type} checked={checked} className={inputClassName} {...props} />;
    },
    blockquote: ({ children, ...props }) => <blockquote {...props}>{children}</blockquote>,
  };
};

const MemoCard = memo(function MemoCard({ memo, onEdit, onDelete, onTogglePin, onToggleArchive, onTogglePublic, onToggleAI, onTagClick, onColorChange, isHighlighted, documents, readOnly, compact = false }: MemoCardProps) {
  const isDark = useIsDark();
  const navigate = useNavigate();
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(memo.content);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showExpandEditor, setShowExpandEditor] = useState(false);
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [showConvertDialog, setShowConvertDialog] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  const editorRef = useRef<MarkdownEditorHandle>(null);
  const expandEditorRef = useRef<MarkdownEditorHandle>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [isLong, setIsLong] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const palette = getMemoPalette(isDark, memo.color);
  const bgColor = palette.background;

  // Tag/mention state
  const [allTags, setAllTags] = useState<string[]>([]);
  const [tagState, setTagState] = useState<TagMentionState>({ type: null, query: '', coords: null, from: 0, to: 0 });
  const [mentionState, setMentionState] = useState<TagMentionState>({ type: null, query: '', coords: null, from: 0, to: 0 });
  const [tagDropdownIndex, setTagDropdownIndex] = useState(0);
  const [mentionDropdownIndex, setMentionDropdownIndex] = useState(0);

  useEffect(() => {
    if (isEditing) {
      getMemoTags().then(setAllTags).catch(() => {});
    }
  }, [isEditing]);

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
    if (!mentionState.type || mentionState.type !== 'mention' || !documents) return [];
    const kw = mentionState.query.toLowerCase();
    if (!kw) return documents.slice(0, 8);
    const prefixMatches: Document[] = [];
    const containsMatches: Document[] = [];
    for (const doc of documents) {
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
      if (isTagPopupActive() && filteredTags[tagDropdownIndex]) handleTagSelect(filteredTags[tagDropdownIndex]);
      else if (isMentionPopupActive() && filteredDocs[mentionDropdownIndex]) handleMentionSelect(filteredDocs[mentionDropdownIndex]);
    },
    onPopupClose: () => {
      setTagState({ type: null, query: '', coords: null, from: 0, to: 0 });
      setMentionState({ type: null, query: '', coords: null, from: 0, to: 0 });
      const active = showExpandEditor ? expandEditorRef.current : editorRef.current;
      active?.focus();
    },
    isPopupActive: () => isTagPopupActive() || isMentionPopupActive(),
  }), [allTags.length, documents?.length, filteredTags, filteredDocs, tagDropdownIndex, mentionDropdownIndex, isTagPopupActive, isMentionPopupActive, showExpandEditor]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTagSelect = useCallback((tag: string) => {
    const active = showExpandEditor ? expandEditorRef.current : editorRef.current;
    const view = active?.view;
    if (!view) return;
    view.dispatch({ changes: { from: tagState.from, to: tagState.to, insert: `${tag} ` }, selection: { anchor: tagState.from + tag.length + 1 } });
    setTagState({ type: null, query: '', coords: null, from: 0, to: 0 });
    setTagDropdownIndex(0);
    setEditContent(view.state.doc.toString());
    view.focus();
  }, [tagState, showExpandEditor]);

  const handleMentionSelect = useCallback((doc: Document) => {
    const active = showExpandEditor ? expandEditorRef.current : editorRef.current;
    const view = active?.view;
    if (!view) return;
    const insert = `[@${doc.title || '无标题'}](/d/${doc.id}) `;
    view.dispatch({ changes: { from: mentionState.from, to: mentionState.to, insert }, selection: { anchor: mentionState.from + insert.length } });
    setMentionState({ type: null, query: '', coords: null, from: 0, to: 0 });
    setMentionDropdownIndex(0);
    setEditContent(view.state.doc.toString());
    view.focus();
  }, [mentionState, showExpandEditor]);

  const tags = useMemo(() => extractTags(memo.content), [memo.content]);
  const images = useMemo(() => extractImages(memo.content), [memo.content]);
  const fileLinks = useMemo(() => extractFileLinks(memo.content), [memo.content]);
  const strippedContent = useMemo(() => {
    let content = memo.content;
    content = normalizeCallouts(content);
    content = stripTags(content);
    content = stripAttachments(content);
    content = normalizeTaskLists(content);
    content = normalizeHighlight(content);
    content = normalizeListSeparators(content);
    content = normalizeCodeBlocks(content);
    content = normalizeInProgressTasks(content);
    content = escapeCodeBlockHtml(content);
    return content;
  }, [memo.content]);

  // Link previews (fetchLinkPreview uses localStorage cache, returns instantly for cached URLs)
  const urls = useMemo(() => extractUrls(memo.content), [memo.content]);
  const [linkPreviews, setLinkPreviews] = useState<Map<string, LinkPreview | null>>(new Map());

  useEffect(() => {
    if (urls.length === 0) return;
    let cancelled = false;

    Promise.allSettled(urls.map(url => fetchLinkPreview(url))).then(results => {
      if (cancelled) return;
      setLinkPreviews(prev => {
        const next = new Map(prev);
        const failedUrls: string[] = [];
        urls.forEach((url, i) => {
          const r = results[i];
          const val = r.status === 'fulfilled' ? r.value : null;
          next.set(url, val);
          if (val === null) failedUrls.push(url);
        });
        // Retry failed previews after a short delay
        if (failedUrls.length > 0) {
          setTimeout(() => {
            if (cancelled) return;
            Promise.allSettled(failedUrls.map(url => retryLinkPreview(url))).then(retryResults => {
              if (cancelled) return;
              setLinkPreviews(prev2 => {
                const next2 = new Map(prev2);
                failedUrls.forEach((url, i) => {
                  const r = retryResults[i];
                  const val = r.status === 'fulfilled' ? r.value : null;
                  if (val !== null) next2.set(url, val);
                });
                return next2;
              });
            });
          }, 3000);
        }
        return next;
      });
    });

    return () => { cancelled = true; };
  }, [urls]);

  const toggleCheckbox = useCallback((taskIndex: number) => {
    const newContent = toggleTaskCheckbox(memo.content, taskIndex);
    if (newContent !== memo.content) {
      onEdit(memo.id, newContent);
    }
  }, [memo.content, memo.id, onEdit]);
  // 每次 Markdown 渲染使用独立计数器，保证任务序号从零开始且不在 render 阶段写 React ref。
  const checkboxCounter = { current: 0 };
  const mdComponents = markdownComponents(setPreviewImage, toggleCheckbox, checkboxCounter, navigate, palette, compact);

  // CodeMirror 编辑器自动管理高度，无需手动调整

  // 测量内容高度，判断是否需要折叠
  useEffect(() => {
    if (isEditing) return;
    const el = contentRef.current;
    if (el) {
      const long = el.scrollHeight > 400;
      setIsLong(long);
      if (!long) setExpanded(false);
    }
  }, [strippedContent, isEditing]);

  // 点击外部关闭菜单 & 更新菜单位置
  useEffect(() => {
    if (!showMenu) return;
    const updatePos = () => {
      const btn = menuButtonRef.current;
      if (btn) {
        const rect = btn.getBoundingClientRect();
        setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
      }
    };
    updatePos();
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (menuRef.current && !menuRef.current.contains(target) &&
          menuButtonRef.current && !menuButtonRef.current.contains(target)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    window.addEventListener('scroll', updatePos, true);
    window.addEventListener('resize', updatePos);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      window.removeEventListener('scroll', updatePos, true);
      window.removeEventListener('resize', updatePos);
    };
  }, [showMenu]);

  const insertAtCursor = useCallback((text: string) => {
    const active = showExpandEditor ? expandEditorRef.current : editorRef.current;
    if (!active) return;
    active.insertText(text);
    setEditContent(active.getValue());
  }, [showExpandEditor]);

  const handleFileUpload = useCallback(async (file: File, isImage: boolean) => {
    if (file.size > 50 * 1024 * 1024) {
      alert('文件大小不能超过 50MB');
      return;
    }
    setUploading(true);
    try {
      const res = await uploadFile(file);
      const url = res.file_path.replace(/^\/api/, '');
      if (isImage) {
        insertAtCursor(`![${res.file_name}](${url})`);
      } else {
        insertAtCursor(`[${res.file_name}](${url})`);
      }
    } catch (e) {
      console.error('Upload failed', e);
      alert('上传失败');
    } finally {
      setUploading(false);
    }
  }, [insertAtCursor]);

  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    for (const item of Array.from(e.clipboardData.items)) {
      if (item.kind !== 'file') continue;
      e.preventDefault();
      const file = item.getAsFile();
      if (file) await handleFileUpload(file, item.type.startsWith('image/'));
      return;
    }

    const markdown = getPasteMarkdown(e.clipboardData);
    if (!markdown) return;

    e.preventDefault();
    const active = showExpandEditor ? expandEditorRef.current : editorRef.current;
    active?.insertText(markdown);
    setEditContent(active?.getValue() ?? editContent);

    if (!markdown.includes('![')) return;
    setUploading(true);
    try {
      const result = await localizeMarkdownImages(markdown);
      const view = active?.view;
      if (!view) return;
      let updated = view.state.doc.toString();
      if (result.markdown !== markdown) updated = updated.replace(markdown, result.markdown);
      if (updated !== view.state.doc.toString()) {
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: updated } });
      }
      setEditContent(updated);
      if (result.failedUrls.length > 0) {
        alert(`${result.failedUrls.length} 张图片未能自动上传，已保留原地址`);
      }
    } finally {
      setUploading(false);
    }
  }, [editContent, handleFileUpload, showExpandEditor]);

  const handleSave = useCallback(async () => {
    const currentContent = editorRef.current?.getValue() || editContent;
    if (currentContent.trim() === memo.content) {
      setIsEditing(false);
      resetUserHeight();
      return;
    }
    try {
      await onEdit(memo.id, currentContent);
      setIsEditing(false);
      resetUserHeight();
    } catch (e) {
      console.error('Failed to update memo', e);
    }
  }, [editContent, memo.id, memo.content, onEdit]);

  const handleDelete = useCallback(async () => {
    try {
      await onDelete(memo.id);
    } catch (e) {
      console.error('Failed to delete memo', e);
    }
  }, [memo.id, onDelete]);

  const handleColorChange = useCallback((color: string | null) => {
    setShowMenu(false);
    onColorChange?.(memo.id, color);
    updateMemoColor(memo.id, color).catch(e => console.error('Failed to update color', e));
  }, [memo.id, onColorChange]);

  const handleContentDoubleClick = useCallback(() => {
    setIsEditing(true);
    setEditContent(memo.content);
  }, [memo.content]);

  const showTagPopup = tagState.type === 'tag' && filteredTags.length > 0 && tagState.coords;
  const showMentionPopup = mentionState.type === 'mention' && filteredDocs.length > 0 && mentionState.coords;

  // 展开编辑器 portal
  const expandEditorPortal = showExpandEditor && createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40" onClick={() => {
      const newContent = expandEditorRef.current?.getValue() ?? editContent;
      setEditContent(newContent);
      setShowExpandEditor(false);
    }}>
      <div className="flex flex-col w-[90vw] max-w-[680px] h-[75vh] bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-end px-4 py-2 border-b border-gray-200 dark:border-gray-700 shrink-0 gap-2">
          {uploading && <span className="text-xs text-blue-500 mr-auto">上传中...</span>}
            <button
              onClick={() => {
                const newContent = expandEditorRef.current?.getValue() ?? editContent;
                setEditContent(newContent);
                setShowExpandEditor(false);
                setTimeout(() => handleSave(), 0);
              }}
              disabled={uploading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-white dark:text-gray-900 bg-gray-900 dark:bg-gray-100 hover:bg-gray-700 dark:hover:bg-gray-300 rounded-lg transition-colors disabled:opacity-40"
            >
              <Check className="w-4 h-4" />
              <span>保存</span>
            </button>
            <button
              onClick={() => {
                const newContent = expandEditorRef.current?.getValue() ?? editContent;
                setEditContent(newContent);
                setShowExpandEditor(false);
              }}
              className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
        </div>
        <div className="flex-1 overflow-hidden" onPasteCapture={handlePaste}>
            {(() => {
              try {
                return (
                  <MarkdownEditor
                    ref={expandEditorRef}
                    value={editContent}
                    onChange={setEditContent}
                    compact={false}
                    autoFocus
                    scrollable
                    placeholder="编辑笔记..."
                    className="h-full"
                    extensions={[tmExtension]}
                    toolbar={<EditorToolbar editorRef={expandEditorRef} onUploadImage={() => imageInputRef.current?.click()} onUploadFile={() => fileInputRef.current?.click()} />}
                  />
                );
              } catch (error) {
                console.error('[MemoCard] Error rendering MarkdownEditor:', error);
                return <div className="p-4 text-red-500">Error loading editor</div>;
              }
            })()}
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
    </div>,
    document.body
  );

  // AI 对话 portal
  const aiChatPanel = showAIPanel && createPortal(
    <AIChatPanel
      context={editContent}
      onWriteBack={(newContent) => {
        setEditContent(newContent);
        const active = showExpandEditor ? expandEditorRef.current : editorRef.current;
        active?.view?.dispatch({ changes: { from: 0, to: active.view.state.doc.length, insert: newContent } });
      }}
      onClose={() => setShowAIPanel(false)}
    />,
    document.body
  );

  if (isEditing) {
    return (
      <div className={`rounded-xl p-4 border min-w-0 overflow-visible ${
        memo.is_pinned
          ? 'border-amber-200 dark:border-amber-800/60'
          : 'border-[#dad9d4] dark:border-gray-700'
      }`}
      style={{ ...getMemoPaletteStyle(palette), backgroundColor: bgColor, color: palette.text, borderColor: palette.border }}
      >
        <div className="relative" onPasteCapture={handlePaste}>
          <MarkdownEditor
            ref={editorRef}
            value={editContent}
            onChange={setEditContent}
            compact={true}
            minHeight={80}
            maxHeight={500}
            autoFocus
            placeholder="编辑笔记..."
            className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700"
            extensions={[tmExtension]}
          />
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
        {uploading && (
          <div className="px-1 pt-1 text-sm text-blue-500">上传中...</div>
        )}
        <div className="flex items-center justify-between mt-2">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowExpandEditor(true)}
              disabled={uploading}
              className="p-1.5 text-gray-400 hover:text-blue-500 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-40"
              title="展开编辑"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setShowAIPanel(true); }}
              disabled={uploading}
              className="p-1.5 text-gray-400 hover:text-blue-500 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-40"
              title="AI 整理"
            >
              <Sparkles className="w-4 h-4" />
            </button>
            <button
              onClick={() => imageInputRef.current?.click()}
              disabled={uploading}
              className="p-1.5 text-gray-400 hover:text-blue-500 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-40"
              title="添加图片"
            >
              <Image className="w-4 h-4" />
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="p-1.5 text-gray-400 hover:text-blue-500 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-40"
              title="添加附件"
            >
              <Paperclip className="w-4 h-4" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setIsEditing(false); setEditContent(memo.content); resetUserHeight(); }}
              className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              取消
            </button>
            <button
              onClick={handleSave}
              className="flex items-center gap-1 px-3 py-1.5 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
            >
              <Check className="w-3.5 h-3.5" />
              保存
            </button>
          </div>
        </div>

        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = e.target.files;
            if (files) {
              for (let i = 0; i < files.length; i++) {
                handleFileUpload(files[i], true);
              }
            }
            e.target.value = '';
          }}
        />
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = e.target.files;
            if (files) {
              for (let i = 0; i < files.length; i++) {
                handleFileUpload(files[i], false);
              }
            }
            e.target.value = '';
          }}
        />
        {expandEditorPortal}
        {aiChatPanel}
      </div>
    );
  }

  return (
    <div id={`memo-${memo.id}`} className={`memo-card-themed group rounded-xl min-w-0 overflow-hidden border ${compact ? 'p-3' : 'p-4'} ${
      isHighlighted ? 'outline outline-2 outline-blue-400 dark:outline-blue-500 outline-offset-2' : ''}`}
    style={{ ...getMemoPaletteStyle(palette), backgroundColor: bgColor, color: palette.text, borderColor: palette.border, contain: 'layout' }}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {memo.is_pinned && (
            <Pin className="w-3 h-3 text-amber-500 dark:text-amber-400 fill-current" />
          )}
          <span className="text-sm" style={{ color: palette.mutedText }}>
            {formatTime(memo.created_at)}
          </span>
        </div>

        {/* 右侧：AI排除图标 + 地球图标 + 三点菜单 */}
        <div className="flex items-center gap-1">
          {memo.ai_excluded && (
            <svg className="w-3.5 h-3.5" style={{ color: palette.mutedText }} viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5"/>
              <line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          )}
          {memo.is_public && (
            <Globe className="w-3.5 h-3.5" style={{ color: palette.mutedText }} />
          )}
        {!readOnly && (() => {
          return (
            <button
              ref={menuButtonRef}
              onClick={() => setShowMenu(!showMenu)}
              className="p-1 rounded transition-opacity hover:opacity-70"
              style={{ color: palette.mutedText }}
              title="更多操作"
            >
              <MoreVertical className="w-4 h-4" />
            </button>
          );
        })()}
        </div>
      </div>

      <div
        ref={contentRef}
        className={`memo-content text-base relative ${readOnly ? '' : 'cursor-text'}`}
        style={{
          lineHeight: '1.75',
          color: palette.text,
          ...(!expanded && isLong ? { maxHeight: '400px', overflow: 'hidden' } : {}),
        }}
        onDoubleClick={readOnly ? undefined : handleContentDoubleClick}
        title={readOnly ? undefined : "双击编辑"}
      >
        <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks, remarkMath]} rehypePlugins={[rehypeRaw, preserveCodeBlocks, rehypeKatex]} components={mdComponents}>{strippedContent}</ReactMarkdown>
        {!expanded && isLong && (
          <>
            <div className="absolute bottom-0 left-0 right-0 h-16 pointer-events-none"
              style={{ background: `linear-gradient(to top, ${bgColor} 30%, transparent)` }} />
          </>
        )}
      </div>
      {isLong && (
        <button
          onClick={() => setExpanded(prev => !prev)}
          className="mt-1 text-sm transition-opacity hover:opacity-75"
          style={{ color: palette.link }}
        >
          {expanded ? '收起' : '显示更多'}
        </button>
      )}

      {/* 图片画廊 */}
      {images.length > 0 && (() => {
        const count = images.length;
        const cols = count === 1 ? 1 : compact ? 2 : Math.min(count, 4);
        const hasMore = count > (compact ? 2 : 4);
        const scrollbarStyle = { scrollbarWidth: 'thin' as const, scrollbarColor: isDark ? '#4b5563 transparent' : '#d1d5db transparent' };
        return (
          <div className="mt-3 rounded-lg overflow-hidden border" style={{ borderColor: palette.codeBorder ?? palette.surfaceBorder }}>
            <div
              className="px-3 py-1.5 text-xs border-b"
              style={{
                color: palette.codeMutedText ?? palette.mutedText,
                background: palette.codeHeaderBackground ?? palette.surface,
                borderColor: palette.codeBorder ?? palette.surfaceBorder,
              }}
            >
              图片 ({count})
            </div>
            {hasMore ? (
              // >4张：横向滚动，每张大小和4张一致
              <div
                className="flex"
                style={{ gap: '5px', padding: '5px', overflowX: 'auto', background: palette.codeBlockBackground ?? palette.surfaceStrong, ...scrollbarStyle }}
              >
                {images.map((img, i) => (
                  <img
                    key={i}
                    src={getThumbnailUrl(img.url)}
                    alt={img.alt}
                    className="flex-shrink-0 aspect-square object-cover border cursor-pointer hover:opacity-80 transition-opacity"
                    style={{ width: compact ? 'calc((100% - 5px) / 2)' : 'calc((100% - 15px) / 4)', borderRadius: 0, borderColor: palette.codeBorder ?? palette.surfaceBorder }}
                    onClick={() => setPreviewImage(img.url)}
                  />
                ))}
              </div>
            ) : (
              // ≤4张：Grid 均分
              <div
                style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: '5px', padding: '5px', background: palette.codeBlockBackground ?? palette.surfaceStrong }}
              >
                {images.map((img, i) => (
                  <img
                    key={i}
                    src={getThumbnailUrl(img.url)}
                    alt={img.alt}
                    className={`w-full object-cover border cursor-pointer hover:opacity-80 transition-opacity ${count === 1 ? 'max-h-80' : 'aspect-square'}`}
                    style={{ borderRadius: 0, borderColor: palette.codeBorder ?? palette.surfaceBorder }}
                    onClick={() => setPreviewImage(img.url)}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* 附件列表 */}
      {fileLinks.length > 0 && (
        <div className="mt-3 rounded-lg overflow-hidden border" style={{ borderColor: palette.codeBorder ?? palette.surfaceBorder }}>
          <div
            className="px-3 py-1.5 text-xs border-b"
            style={{
              color: palette.codeMutedText ?? palette.mutedText,
              background: palette.codeHeaderBackground ?? palette.surface,
              borderColor: palette.codeBorder ?? palette.surfaceBorder,
            }}
          >
            附件 ({fileLinks.length})
          </div>
          <div className="flex flex-col gap-1 p-3" style={{ background: palette.codeBlockBackground ?? palette.surfaceStrong }}>
            {fileLinks.map((file, i) => (
              <a
                key={i}
                href={file.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg transition-opacity hover:opacity-80 min-w-0"
                style={{
                  color: palette.codeText ?? palette.text,
                  background: palette.plainCodeBlockBackground ?? palette.surface,
                }}
              >
                <FileText className="w-3.5 h-3.5 flex-shrink-0" style={{ color: palette.codeMutedText ?? palette.mutedText }} />
                <span className="truncate">{file.name}</span>
                <Download className="w-3 h-3 flex-shrink-0 ml-auto" style={{ color: palette.codeMutedText ?? palette.mutedText }} />
              </a>
            ))}
          </div>
        </div>
      )}

      {/* 链接预览 */}
      {urls.length > 0 && (
        <div className="flex flex-col gap-2 mt-3">
          {urls.map(url => (
            <LinkPreviewCard
              key={url}
              preview={linkPreviews.get(url) ?? null}
              isLoading={!linkPreviews.has(url)}
              error={linkPreviews.has(url) && linkPreviews.get(url) === null}
              palette={palette}
              compact={compact}
            />
          ))}
        </div>
      )}

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {tags.map(tag => {
            const c = MEMO_TAG_COLORS[tagColorIndex(tag)];
            return (
              <button
                key={tag}
                onClick={(e) => { e.stopPropagation(); onTagClick(tag); }}
                className="px-2.5 py-0.5 rounded-full cursor-pointer transition-opacity hover:opacity-80"
                style={{
                  fontSize: '11px',
                  backgroundColor: isDark ? c.darkBg : c.bg,
                  color: isDark ? c.darkText : c.text,
                  border: `1px solid ${isDark ? c.darkBorder : c.border}`,
                }}
              >
                {tag}
              </button>
            );
          })}
        </div>
      )}

      {/* 删除确认弹窗 - portal 到 body 避免被 contain:layout 裁剪 */}
      {showDeleteConfirm && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowDeleteConfirm(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-xl max-w-xs w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <p className="text-base text-gray-700 dark:text-gray-200 mb-4">确定要删除这条随想吗？此操作无法撤销。</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-1.5 text-base text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-1.5 text-base text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors"
              >
                删除
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* 转换为大纲笔记对话框 */}
      {showConvertDialog && createPortal(
        <MemoToDocDialog
          content={memo.content}
          onClose={() => setShowConvertDialog(false)}
          onConverted={(docId) => {
            setShowConvertDialog(false);
            navigate(`/d/${docId}`);
          }}
        />,
        document.body
      )}

      {/* 图片放大预览 — Portal 到 body，绕开 contain:'layout' 的层叠上下文 */}
      {previewImage && createPortal(
        <ImagePreview images={images.map(i => i.url)} src={previewImage} onClose={() => setPreviewImage(null)} />,
        document.body
      )}

      {/* 菜单 Portal — 渲染在 body 上，绕开 contain: 'content' 的层叠上下文 */}
      {showMenu && menuPos && createPortal(
        <div
          ref={menuRef}
          className="fixed z-50 w-40 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 py-1 animate-in fade-in zoom-in-95 duration-100"
          style={{ top: menuPos.top, right: menuPos.right }}
        >
          <button
            onClick={() => { setShowMenu(false); setIsEditing(true); setEditContent(memo.content); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" />
            编辑
          </button>
          <button
            onClick={() => { setShowMenu(false); onTogglePin(memo.id, !memo.is_pinned); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            {memo.is_pinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
            {memo.is_pinned ? '取消置顶' : '置顶'}
          </button>
          <button
            onClick={() => { setShowMenu(false); onToggleArchive(memo.id, !memo.is_archived); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            {memo.is_archived ? <ArchiveRestore className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
            {memo.is_archived ? '取消归档' : '归档'}
          </button>
          <button
            onClick={() => { setShowMenu(false); onTogglePublic?.(memo.id, !memo.is_public); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <Globe className="w-3.5 h-3.5" />
            {memo.is_public ? '取消公开' : '公开'}
          </button>
          <button
            onClick={() => { setShowMenu(false); onToggleAI?.(memo.id, !memo.ai_excluded); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <Sparkles className={`w-3.5 h-3.5 ${memo.ai_excluded ? 'text-gray-400' : 'text-blue-500'}`} />
            {memo.ai_excluded ? '取消不参与 AI' : '不参与 AI'}
          </button>
          <div className="border-t border-gray-100 dark:border-gray-700 my-1" />
          <div className="px-3 py-2">
            <div className="flex items-center gap-1.5">
              {MEMO_COLOR_OPTIONS.map(c => (
                <button
                  key={c.value}
                  onClick={() => handleColorChange(memo.color === c.value ? null : c.value)}
                  className={`w-5 h-5 rounded-full border transition-transform hover:scale-110 ${
                    memo.color === c.value
                      ? 'ring-2 ring-offset-1 ring-gray-500 dark:ring-gray-300 dark:ring-offset-gray-800'
                      : c.value === '#ffffff'
                        ? 'border-gray-400 dark:border-gray-500'
                        : 'border-white/20 dark:border-white/10'
                  }`}
                  style={{ backgroundColor: (isDark ? c.dark : c.light).background }}
                  title={c.name}
                />
              ))}
            </div>
          </div>
          <div className="border-t border-gray-100 dark:border-gray-700 my-1" />
          <button
            onClick={() => { setShowMenu(false); setShowConvertDialog(true); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <ArrowUpRight className="w-3.5 h-3.5" />
            转换为大纲笔记
          </button>
          <button
            onClick={() => { setShowMenu(false); setShowDeleteConfirm(true); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            删除
          </button>
        </div>,
        document.body
      )}

      {expandEditorPortal}
      {aiChatPanel}
    </div>
  );
});

export default MemoCard;
