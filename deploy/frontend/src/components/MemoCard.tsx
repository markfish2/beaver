import { useState, useCallback, useEffect, useRef, useMemo, memo, Children, isValidElement, type TouchEvent as ReactTouchEvent } from 'react';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import rehypeRaw from 'rehype-raw';
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
import { MoreVertical, Pencil, Trash2, Pin, PinOff, X, Check, Copy, CheckCheck, Image, Paperclip, FileText, Download, Archive, ArchiveRestore, ArrowUpRight, Globe } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { Memo, Document, LinkPreview } from '../api/data';
import { uploadFile, getMemoTags, updateMemoColor, getThumbnailUrl, fetchLinkPreview, retryLinkPreview } from '../api/data';
import LinkPreviewCard from './LinkPreviewCard';
import { handleListContinuation } from '../utils/listContinuation';
import { getPasteMarkdown } from '../utils/htmlToMarkdown';
import { stripTags, stripAttachments, normalizeTaskLists, normalizeHighlight, normalizeListSeparators, normalizeCodeBlocks } from '../utils/markdownPreprocess';
import MemoToDocDialog from './MemoToDocDialog';
import AudioPlayer from './AudioPlayer';
import { useResizableTextarea } from '../hooks/useResizableTextarea';

const MEMO_COLORS = [
  { name: '白', value: '#ffffff', dark: '#1f2937' },
  { name: '黄', value: '#fef9c3', dark: '#422006' },
  { name: '绿', value: '#dcfce7', dark: '#14532d' },
  { name: '蓝', value: '#dbeafe', dark: '#1e3a5f' },
  { name: '紫', value: '#f3e8ff', dark: '#3b0764' },
];

const TAG_COLORS = [
  { bg: '#eff6ff', text: '#2563eb', border: '#93c5fd', darkBg: '#172554', darkText: '#60a5fa', darkBorder: '#1e40af' },
  { bg: '#f0fdf4', text: '#16a34a', border: '#86efac', darkBg: '#052e16', darkText: '#4ade80', darkBorder: '#166534' },
  { bg: '#fef3c7', text: '#d97706', border: '#fcd34d', darkBg: '#451a03', darkText: '#fbbf24', darkBorder: '#92400e' },
  { bg: '#fce7f3', text: '#db2777', border: '#f9a8d4', darkBg: '#500724', darkText: '#f472b6', darkBorder: '#9d174d' },
  { bg: '#f3e8ff', text: '#9333ea', border: '#c4b5fd', darkBg: '#2e1065', darkText: '#a78bfa', darkBorder: '#6b21a8' },
  { bg: '#ecfeff', text: '#0891b2', border: '#67e8f9', darkBg: '#083344', darkText: '#22d3ee', darkBorder: '#155e75' },
  { bg: '#fff1f2', text: '#e11d48', border: '#fda4af', darkBg: '#4c0519', darkText: '#fb7185', darkBorder: '#9f1239' },
  { bg: '#fdf4ff', text: '#c026d3', border: '#e879f9', darkBg: '#4a044e', darkText: '#d946ef', darkBorder: '#86198f' },
  { bg: '#f0f9ff', text: '#0284c7', border: '#7dd3fc', darkBg: '#082f49', darkText: '#38bdf8', darkBorder: '#075985' },
  { bg: '#fefce8', text: '#ca8a04', border: '#fde047', darkBg: '#422006', darkText: '#facc15', darkBorder: '#a16207' },
];

function tagColorIndex(tag: string): number {
  let h = 0;
  for (let i = 0; i < tag.length; i++) {
    h = (h * 31 + tag.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % TAG_COLORS.length;
}

interface MemoCardProps {
  memo: Memo;
  onEdit: (id: string, content: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onTogglePin: (id: string, is_pinned: boolean) => Promise<void>;
  onToggleArchive: (id: string, is_archived: boolean) => Promise<void>;
  onTogglePublic?: (id: string, is_public: boolean) => Promise<void>;
  onTagClick: (tag: string) => void;
  onColorChange?: (id: string, color: string | null) => void;
  isHighlighted?: boolean;
  documents?: Document[];
  readOnly?: boolean;
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr.endsWith('Z') ? dateStr : dateStr + 'Z');
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const get = (type: string) => parts.find(p => p.type === type)?.value || '';
  return `${get('month')}月${get('day')}日 ${get('hour')}:${get('minute')}`;
}

function extractTags(content: string): string[] {
  const cleaned = content.replace(/```[\s\S]*?```/g, '').replace(/`[^`]+`/g, '');
  const matches = cleaned.match(/#[a-zA-Z0-9_一-龥]+/g);
  if (!matches) return [];
  return [...new Set(matches.map(m => m.trim()))];
}

function extractImages(content: string): { alt: string; url: string }[] {
  const results: { alt: string; url: string }[] = [];
  const regex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    // 排除音频文件
    if (/\.(mp4|webm|ogg|wav|mp3|m4a)(\?|$)/i.test(match[2])) continue;
    results.push({ alt: match[1], url: match[2] });
  }
  return results;
}

function extractFileLinks(content: string): { name: string; url: string }[] {
  const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  const results: { name: string; url: string }[] = [];
  // 先收集所有图片 URL，用于排除 ![...](...) 被 [...]() 匹配
  const imageUrls = new Set<string>();
  let m;
  while ((m = imageRegex.exec(content)) !== null) {
    imageUrls.add(m[2]);
  }
  while ((m = linkRegex.exec(content)) !== null) {
    if (!imageUrls.has(m[2]) && !m[2].startsWith('/d/')) {
      results.push({ name: m[1], url: m[2] });
    }
  }
  return results;
}

function extractUrls(content: string): string[] {
  const urls = new Set<string>();

  // Match markdown link URLs: [text](url)
  const mdLinkRegex = /\[([^\]]*)\]\(([^)]+)\)/g;
  let m;
  while ((m = mdLinkRegex.exec(content)) !== null) {
    const url = m[2];
    if (url.startsWith('http://') || url.startsWith('https://')) {
      urls.add(url);
    }
  }

  // Match bare URLs (outside markdown links)
  const stripped = content.replace(/\[([^\]]*)\]\([^)]+\)/g, '');
  const bareUrlRegex = /(?<!\()(https?:\/\/[^\s<>\)\]]+)/g;
  while ((m = bareUrlRegex.exec(stripped)) !== null) {
    let url = m[1].replace(/[.,;:!?]+$/, '');
    urls.add(url);
  }

  return [...urls];
}

function useIsDark() {
  const check = () => {
    // 优先从 localStorage 读取用户明确选择的主题
    try {
      const saved = localStorage.getItem('outline-font-settings');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.theme === 'dark') return true;
        if (parsed.theme && parsed.theme !== 'dark') return false;
      }
    } catch { /* ignore parse error */ }
    // 无明确主题时，检查 DOM class 或系统偏好
    return document.documentElement.classList.contains('dark') || window.matchMedia('(prefers-color-scheme: dark)').matches;
  };
  const [isDark, setIsDark] = useState(check);
  useEffect(() => {
    const update = () => setIsDark(check());
    // 监听 FontSettings 派发的主题变更事件（Android PWA 兼容）
    window.addEventListener('theme-change', update);
    // MutationObserver 作为补充
    const obs = new MutationObserver(update);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    // 系统主题变化（桌面浏览器）
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', update);
    return () => {
      window.removeEventListener('theme-change', update);
      obs.disconnect();
      mq.removeEventListener('change', update);
    };
  }, []);
  return isDark;
}

function getMemoBg(isDark: boolean, color: string | null, isPinned: boolean): string {
  if (isDark) {
    if (color) {
      const found = MEMO_COLORS.find(c => c.value === color);
      return found ? found.dark : '#1f2937';
    }
    return isPinned ? '#3b2f0a' : '#1f2937';
  }
  return color || (isPinned ? '#fffbeb' : '#ffffff');
}

const codeBlockCustomStyle = (isDark: boolean): React.CSSProperties => ({
  margin: 0,
  borderRadius: '0.5rem',
  fontSize: '0.95em',
  background: isDark ? '#282c34' : '#f6f8fa',
  border: `1px solid ${isDark ? '#374067' : '#d0d7de'}`,
  padding: '16px',
});

const CodeBlock = memo(function CodeBlock({ className, children, ...props }: { className?: string; children: React.ReactNode; [key: string]: any }) {
  const [copied, setCopied] = useState(false);
  const isDark = useIsDark();
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
    return (
      <div className="relative">
        <div className={`flex items-center justify-between px-3 py-1.5 border border-b-0 rounded-t-lg ${
          isDark
            ? 'bg-[#282c34] border-[#374067]'
            : 'bg-[#f6f8fa] border-[#d0d7de]'
        }`}>
          <span className={`text-[11px] font-mono ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{language || 'text'}</span>
          <button
            onClick={handleCopy}
            className="flex items-center p-1 rounded-md bg-white/90 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 border border-gray-200 dark:border-gray-600 transition-all"
            title={copied ? '已复制' : '复制代码'}
          >
            {copied ? <CheckCheck className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          </button>
        </div>
        <SyntaxHighlighter
          style={isDark ? oneDark : ghcolors}
          language={language || 'text'}
          PreTag="div"
          customStyle={{ ...codeBlockCustomStyle(isDark), borderTopLeftRadius: 0, borderTopRightRadius: 0, borderTop: 'none' }}
        >
          {code}
        </SyntaxHighlighter>
      </div>
    );
  }

  return (
    <code className={className} {...props}>{children}</code>
  );
});

function ImagePreview({ images, src: initialSrc, onClose }: { images: string[]; src: string; onClose: () => void }) {
  const [currentSrc, setCurrentSrc] = useState(initialSrc);
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastTouchRef = useRef<{ dist: number; x: number; y: number; time: number } | null>(null);
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

  const getTouchCenter = (touches: TouchList) => ({
    x: (touches[0].clientX + touches[1].clientX) / 2,
    y: (touches[0].clientY + touches[1].clientY) / 2,
  });

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
  onToggleCheckboxRef: React.MutableRefObject<((taskIndex: number) => void) | undefined>,
  checkboxIndexRef: React.MutableRefObject<number>,
  navigate: (to: string) => void,
): Components => {
  return {
    code: CodeBlock as Components['code'],
    img: ({ src, alt }) => {
      // 检测音频文件
      if (src && /\.(mp4|webm|ogg|wav|mp3|m4a)(\?|$)/i.test(src)) {
        return <AudioPlayer src={src} />;
      }
      return <MemoImage src={src} alt={alt} onPreview={onPreview} />;
    },
    a: ({ href, children, ...props }) => {
      if (href?.startsWith('/d/')) {
        return (
          <a
            href={href}
            className="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 bg-blue-50 dark:bg-blue-900/30 px-1 rounded cursor-pointer"
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
    li: ({ children, ordered, index, ...props }) => {
      const liClassName = typeof props.className === 'string' ? props.className : '';
      const isTaskItem = liClassName.includes('task-list-item');
      const hasCheckboxDeep = (nodes: React.ReactNode[]): boolean =>
        nodes.some(child => {
          if (!isValidElement(child)) return false;
          if ((child.props as any)?.role === 'checkbox') return true;
          if (child.props?.children) {
            return hasCheckboxDeep(Children.toArray(child.props.children));
          }
          return false;
        });
      const arr = Children.toArray(children);
      const hasCheckbox = isTaskItem || hasCheckboxDeep(arr);
      const hasNestedList = arr.some(
        child => isValidElement(child) && (child.type === 'ul' || child.type === 'ol')
      );
      // 区分有序/无序标记
      const marker = ordered
        ? <span className="shrink-0 text-gray-500 dark:text-gray-400 select-none tabular-nums">{(index ?? 0) + 1}.</span>
        : <span className="shrink-0 leading-none select-none text-gray-500 dark:text-gray-400" aria-hidden="true">•</span>;
      const mergeClass = (cls: string) => ({ ...props, className: [props.className, cls].filter(Boolean).join(' ') });
      if (hasCheckbox && !hasNestedList) {
        return <li {...mergeClass('list-none relative pl-[22px] leading-[1.5]')}>{children}</li>;
      }
      if (hasNestedList) {
        // 分离嵌套列表和其他内容：保持 children 完整不丢弃文本
        const nestedLists = arr.filter(c => isValidElement(c) && (c.type === 'ul' || c.type === 'ol'));
        const rest = arr.filter(c => !(isValidElement(c) && (c.type === 'ul' || c.type === 'ol')));
        return (
          <li {...mergeClass('list-none')}>
            {!hasCheckbox && rest.length > 0 && (
              <span className="flex items-baseline gap-1.5">{marker}<span className="flex-1">{rest}</span></span>
            )}
            {nestedLists}
          </li>
        );
      }
      // 叶子节点：有序数字或无序圆点
      return <li {...mergeClass('list-none flex items-baseline gap-1.5')}>{marker}{children}</li>;
    },
    input: ({ checked, type, className: inputClassName, ...props }) => {
      if (type === 'checkbox') {
        const idx = checkboxIndexRef.current++;
        return (
          <span
            role="checkbox"
            aria-checked={checked}
            className={`absolute left-0 top-[5px] inline-flex items-center justify-center w-[14px] h-[14px] rounded-full border cursor-pointer shrink-0 transition-colors ${
              checked
                ? 'bg-blue-500 border-blue-500'
                : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-500'
            }`}
            onClick={(e) => {
              e.stopPropagation();
              onToggleCheckboxRef.current?.(idx);
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
  };
};

const MemoCard = memo(function MemoCard({ memo, onEdit, onDelete, onTogglePin, onToggleArchive, onTogglePublic, onTagClick, onColorChange, isHighlighted, documents, readOnly }: MemoCardProps) {
  const isDark = useIsDark();
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(memo.content);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showConvertDialog, setShowConvertDialog] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { isUserResized, resetUserHeight, onResizeStart } = useResizableTextarea({ minHeight: 80, maxHeight: 500 });
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [isLong, setIsLong] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const bgColor = getMemoBg(isDark, memo.color, memo.is_pinned);

  // 标签搜索状态
  const [allTags, setAllTags] = useState<string[]>([]);
  const [tagSearch, setTagSearch] = useState<{ keyword: string; start: number } | null>(null);
  const [tagDropdownIndex, setTagDropdownIndex] = useState(0);
  const [tagDropdownPos, setTagDropdownPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  // @提及文档搜索状态（与 # 标签一致的模式）
  const [mentionSearch, setMentionSearch] = useState<{ keyword: string; start: number } | null>(null);
  const [mentionDropdownIndex, setMentionDropdownIndex] = useState(0);
  const [mentionDropdownPos, setMentionDropdownPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  useEffect(() => {
    if (isEditing) {
      getMemoTags().then(setAllTags).catch(() => {});
    }
  }, [isEditing]);

  const filteredTags = useMemo(() => {
    if (!tagSearch) return [];
    const kw = tagSearch.keyword.toLowerCase();
    if (!kw) return allTags.slice(0, 8);
    const prefixMatches: string[] = [];
    const containsMatches: string[] = [];
    for (const tag of allTags) {
      const name = tag.slice(1).toLowerCase();
      if (name.startsWith(kw)) prefixMatches.push(tag);
      else if (name.includes(kw)) containsMatches.push(tag);
    }
    return [...prefixMatches, ...containsMatches].slice(0, 8);
  }, [tagSearch, allTags]);

  // 计算 textarea 中光标的像素位置（缓存镜像 DOM，避免每次创建/销毁）
  const mirrorRef = useRef<HTMLDivElement | null>(null);

  // 组件卸载时清理镜像元素
  useEffect(() => {
    return () => {
      if (mirrorRef.current && mirrorRef.current.parentNode) {
        mirrorRef.current.parentNode.removeChild(mirrorRef.current);
      }
    };
  }, []);

  // 标准 span 标记法：在光标位置插入零宽 span，同时保留后面的文字（保证换行一致）
  const getCursorPos = useCallback((textarea: HTMLTextAreaElement, pos: number): { top: number; left: number } => {
    const rect = textarea.getBoundingClientRect();
    const style = window.getComputedStyle(textarea);
    const padTop = parseFloat(style.paddingTop) || 0;
    const padLeft = parseFloat(style.paddingLeft) || 0;
    const borderTop = parseFloat(style.borderTopWidth) || 0;
    const borderLeft = parseFloat(style.borderLeftWidth) || 0;

    let mirror = mirrorRef.current;
    if (!mirror) {
      mirror = document.createElement('div');
      mirror.style.position = 'absolute';
      mirror.style.visibility = 'hidden';
      mirror.style.top = '-9999px';
      mirror.style.left = '-9999px';
      mirror.style.whiteSpace = 'pre-wrap';
      mirror.style.overflowWrap = 'break-word';
      document.body.appendChild(mirror);
      mirrorRef.current = mirror;
    }
    mirror.style.width = (textarea.clientWidth - padLeft - parseFloat(style.paddingRight || '0')) + 'px';
    mirror.style.fontFamily = style.fontFamily;
    mirror.style.fontSize = style.fontSize;
    mirror.style.fontWeight = style.fontWeight;
    mirror.style.fontStyle = style.fontStyle;
    mirror.style.letterSpacing = style.letterSpacing;
    mirror.style.lineHeight = style.lineHeight;
    mirror.style.tabSize = style.tabSize;
    mirror.style.wordBreak = style.wordBreak || 'break-word';

    const before = textarea.value.substring(0, pos);
    const after = textarea.value.substring(pos);
    mirror.textContent = before;
    const marker = document.createElement('span');
    marker.textContent = '​'; // 零宽空格
    mirror.appendChild(marker);
    if (after) {
      mirror.appendChild(document.createTextNode(after));
    }

    const top = rect.top + borderTop + padTop + marker.offsetTop - textarea.scrollTop + 4;
    const left = rect.left + borderLeft + padLeft + marker.offsetLeft;

    // 清理 afterNode
    while (mirror.childNodes.length > 1) {
      mirror.removeChild(mirror.lastChild!);
    }

    return { top, left };
  }, []);

  const detectTagSearch = useCallback((text: string, cursorPos: number) => {
    const before = text.slice(0, cursorPos);
    const match = before.match(/(?:^|\s)#([a-zA-Z0-9_一-龥]*)$/);
    if (match) {
      const start = cursorPos - match[0].length + (match[0][0] === '#' ? 0 : 1);
      setTagSearch({ keyword: match[1], start });
      setTagDropdownIndex(0);
      // 用当前光标位置定位（而非 # 字符位置）
      const el = textareaRef.current;
      if (el) {
        setTagDropdownPos(getCursorPos(el, cursorPos));
      }
    } else {
      setTagSearch(null);
    }
  }, [getCursorPos]);

  const detectMentionSearch = useCallback((text: string, cursorPos: number) => {
    const before = text.slice(0, cursorPos);
    const match = before.match(/(?:^|\s)@([a-zA-Z0-9_一-龥]*)$/);
    if (match) {
      const start = cursorPos - match[0].length + (match[0][0] === '@' ? 0 : 1);
      setMentionSearch({ keyword: match[1], start });
      setMentionDropdownIndex(0);
      const el = textareaRef.current;
      if (el) {
        setMentionDropdownPos(getCursorPos(el, cursorPos));
      }
    } else {
      setMentionSearch(null);
    }
  }, [getCursorPos]);

  const filteredMentionDocs = useMemo(() => {
    if (!mentionSearch || !documents) return [];
    const kw = mentionSearch.keyword.toLowerCase();
    if (!kw) return documents.slice(0, 8);
    const prefixMatches: Document[] = [];
    const containsMatches: Document[] = [];
    for (const doc of documents) {
      const title = (doc.title || '无标题').toLowerCase();
      if (title.startsWith(kw)) prefixMatches.push(doc);
      else if (title.includes(kw)) containsMatches.push(doc);
    }
    return [...prefixMatches, ...containsMatches].slice(0, 8);
  }, [mentionSearch, documents]);

  const insertTag = useCallback((tagName: string) => {
    const el = textareaRef.current;
    if (!el || !tagSearch) return;
    const cursorPos = el.selectionStart;
    const before = el.value.slice(0, tagSearch.start);
    const after = el.value.slice(cursorPos);
    const newContent = before + tagName + ' ' + after;
    el.value = newContent;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    setEditContent(newContent);
    setTagSearch(null);
    requestAnimationFrame(() => {
      el.focus();
      const newPos = tagSearch.start + tagName.length + 1;
      el.selectionStart = el.selectionEnd = newPos;
    });
  }, [tagSearch]);

  // @提及：插入文档链接
  const insertMention = useCallback((doc: Document) => {
    const el = textareaRef.current;
    if (!el || !mentionSearch) return;
    const cursorPos = el.selectionStart;
    const before = el.value.slice(0, mentionSearch.start);
    const after = el.value.slice(cursorPos);
    const linkText = `[@${doc.title || '无标题'}](/d/${doc.id})`;
    const newContent = before + linkText + ' ' + after;
    el.value = newContent;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    setEditContent(newContent);
    setMentionSearch(null);
    requestAnimationFrame(() => {
      el.focus();
      const newPos = mentionSearch.start + linkText.length + 1;
      el.selectionStart = el.selectionEnd = newPos;
    });
  }, [mentionSearch]);

  const tags = useMemo(() => extractTags(memo.content), [memo.content]);
  const images = useMemo(() => extractImages(memo.content), [memo.content]);
  const fileLinks = useMemo(() => extractFileLinks(memo.content), [memo.content]);
  const strippedContent = useMemo(() => normalizeInProgressTasks(normalizeCodeBlocks(normalizeListSeparators(normalizeHighlight(normalizeTaskLists(stripAttachments(stripTags(memo.content))))))), [memo.content]);

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

  // 用 ref 存储回调，避免闭包过期问题
  const toggleCheckboxRef = useRef<(taskIndex: number) => void>();
  toggleCheckboxRef.current = (taskIndex: number) => {
    const newContent = toggleTaskCheckbox(memo.content, taskIndex);
    if (newContent !== memo.content) {
      onEdit(memo.id, newContent);
    }
  };
  // 内容变化时重置 checkbox 计数器
  const checkboxIndexRef = useRef(0);
  checkboxIndexRef.current = 0;
  const mdComponents = useMemo(() => markdownComponents(setPreviewImage, toggleCheckboxRef, checkboxIndexRef, (...args) => navigateRef.current(...args)), []);

  // 编辑模式下自动调整 textarea 高度
  // 用 useEffect + 双重 rAF 替代 useLayoutEffect，确保浏览器完成布局后再测量
  useEffect(() => {
    if (!isEditing || isUserResized()) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          const el = textareaRef.current;
          el.style.height = 'auto';
          el.style.height = Math.min(Math.max(el.scrollHeight, 80), 400) + 'px';
        }
      });
    });
  }, [isEditing, editContent]);

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
    if (!showMenu) {
      setMenuPos(null);
      return;
    }
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
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const before = el.value.slice(0, start);
    const after = el.value.slice(end);
    const newContent = before + text + after;
    // textarea 是非受控组件（defaultValue），需要直接修改 DOM 值
    el.value = newContent;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    setEditContent(newContent);
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = start + text.length;
    });
  }, []);

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

  const handleSave = useCallback(async () => {
    const currentContent = textareaRef.current?.value || editContent;
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

  if (isEditing) {
    return (
      <div className={`rounded-2xl p-4 border min-w-0 overflow-visible ${
        memo.is_pinned
          ? 'border-amber-200 dark:border-amber-800/60'
          : 'border-[#ebebeb] dark:border-gray-700'
      }`}
      style={{ backgroundColor: bgColor }}
      >
        <div className="relative" data-resizable-container>
          <textarea
            ref={textareaRef}
            data-resizable-textarea
            defaultValue={editContent}
            onChange={(e) => {
              const newValue = e.target.value;
              const cursorPos = e.target.selectionStart;
              detectTagSearch(newValue, cursorPos);
              detectMentionSearch(newValue, cursorPos);
            }}
            onKeyDown={(e) => {
              if (mentionSearch && filteredMentionDocs.length > 0) {
                if (e.key === 'ArrowDown') { e.preventDefault(); setMentionDropdownIndex(prev => (prev + 1) % filteredMentionDocs.length); return; }
                if (e.key === 'ArrowUp') { e.preventDefault(); setMentionDropdownIndex(prev => (prev - 1 + filteredMentionDocs.length) % filteredMentionDocs.length); return; }
                if ((e.key === 'Enter' && !e.nativeEvent.isComposing) || e.key === 'Tab') { e.preventDefault(); insertMention(filteredMentionDocs[mentionDropdownIndex]); return; }
                if (e.key === 'Escape') { e.preventDefault(); setMentionSearch(null); return; }
              }
              if (tagSearch && filteredTags.length > 0) {
                if (e.key === 'ArrowDown') { e.preventDefault(); setTagDropdownIndex(prev => (prev + 1) % filteredTags.length); return; }
                if (e.key === 'ArrowUp') { e.preventDefault(); setTagDropdownIndex(prev => (prev - 1 + filteredTags.length) % filteredTags.length); return; }
                if ((e.key === 'Enter' && !e.nativeEvent.isComposing) || e.key === 'Tab') { e.preventDefault(); insertTag(filteredTags[tagDropdownIndex]); return; }
                if (e.key === 'Escape') { e.preventDefault(); setTagSearch(null); return; }
              }
              handleListContinuation(e, editContent, setEditContent, textareaRef);
            }}
            onPaste={(e) => {
              // 优先处理文件粘贴
              const items = e.clipboardData.items;
              for (let i = 0; i < items.length; i++) {
                const item = items[i];
                if (item.kind === 'file') {
                  e.preventDefault();
                  const file = item.getAsFile();
                  if (file) handleFileUpload(file, item.type.startsWith('image/'));
                  return;
                }
              }
              // 网页富文本粘贴 → 转为 Markdown
              const md = getPasteMarkdown(e.clipboardData);
              if (md) {
                e.preventDefault();
                const el = e.currentTarget;
                const start = el.selectionStart;
                const end = el.selectionEnd;
                const before = el.value.slice(0, start);
                const after = el.value.slice(end);
                const newContent = before + md + after;
                el.value = newContent;
                el.dispatchEvent(new Event('input', { bubbles: true }));
                setEditContent(newContent);
                requestAnimationFrame(() => {
                  el.selectionStart = el.selectionEnd = start + md.length;
                });
              }
            }}
            onClick={(e) => { const t = e.target as HTMLTextAreaElement; detectTagSearch(t.value, t.selectionStart); detectMentionSearch(t.value, t.selectionStart); }}
            onSelect={(e) => { const t = e.target as HTMLTextAreaElement; detectTagSearch(t.value, t.selectionStart); detectMentionSearch(t.value, t.selectionStart); }}
            onBlur={() => setTimeout(() => { setTagSearch(null); setMentionSearch(null); }, 200)}
            className="w-full bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 text-base rounded-lg p-3 border border-gray-200 dark:border-gray-700 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
          />
          {/* 右下角拖拽手柄 */}
          <div
            onMouseDown={onResizeStart}
            onTouchStart={onResizeStart}
            className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize opacity-0 hover:opacity-60 transition-opacity"
            style={{
              background: 'linear-gradient(135deg, transparent 50%, #9ca3af 50%, #9ca3af 60%, transparent 60%, transparent 70%, #9ca3af 70%, #9ca3af 80%, transparent 80%)',
            }}
          />
          {tagSearch && filteredTags.length > 0 && createPortal(
            <div className="fixed w-40 z-[9999] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg max-h-48 overflow-y-auto" style={{ top: tagDropdownPos.top, left: tagDropdownPos.left }}>
              {filteredTags.map((tag, i) => (
                <button
                  key={tag}
                  onMouseDown={(e) => { e.preventDefault(); insertTag(tag); }}
                  className={`w-full text-left px-4 py-2 text-base transition-colors ${
                    i === tagDropdownIndex
                      ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>,
            document.body
          )}
          {mentionSearch && filteredMentionDocs.length > 0 && createPortal(
            <div className="fixed w-52 z-[9999] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg max-h-48 overflow-y-auto" style={{ top: mentionDropdownPos.top, left: mentionDropdownPos.left }}>
              {filteredMentionDocs.map((doc, i) => (
                <button
                  key={doc.id}
                  onMouseDown={(e) => { e.preventDefault(); insertMention(doc); }}
                  className={`w-full text-left px-4 py-2 text-base transition-colors ${
                    i === mentionDropdownIndex
                      ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  {doc.title || '无标题'}
                </button>
              ))}
            </div>,
            document.body
          )}
        </div>
        {uploading && (
          <div className="px-1 pt-1 text-sm text-blue-500">上传中...</div>
        )}
        <div className="flex items-center justify-between mt-2">
          <div className="flex items-center gap-1">
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
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFileUpload(file, true);
            e.target.value = '';
          }}
        />
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFileUpload(file, false);
            e.target.value = '';
          }}
        />
      </div>
    );
  }

  return (
    <div className={`group rounded-2xl p-4 min-w-0 overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-200 ${
      memo.is_pinned
        ? 'border border-amber-200 dark:border-amber-800/60'
        : ''
    } ${isHighlighted ? 'outline outline-2 outline-blue-400 dark:outline-blue-500 outline-offset-2' : ''}`}
    style={{ backgroundColor: bgColor, contain: 'layout' }}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {memo.is_pinned && (
            <Pin className="w-3 h-3 text-amber-500 dark:text-amber-400 fill-current" />
          )}
          <span className="text-sm text-gray-400 dark:text-gray-500">
            {formatTime(memo.created_at)}
          </span>
        </div>

        {/* 右侧：地球图标 + 三点菜单 */}
        <div className="flex items-center gap-1">
          {memo.is_public && (
            <Globe className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
          )}
        {!readOnly && (
          <button
            ref={menuButtonRef}
            onClick={() => setShowMenu(!showMenu)}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded transition-colors"
            title="更多操作"
          >
            <MoreVertical className="w-4 h-4" />
          </button>
        )}
        </div>
      </div>

      <div
        ref={contentRef}
        className={`memo-content text-base text-gray-700 dark:text-gray-300 relative ${readOnly ? '' : 'cursor-text'}`}
        style={{ lineHeight: '1.75' }}
        style={!expanded && isLong ? { maxHeight: '400px', overflow: 'hidden' } : undefined}
        onDoubleClick={readOnly ? undefined : handleContentDoubleClick}
        title={readOnly ? undefined : "双击编辑"}
      >
        <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} rehypePlugins={[rehypeRaw]} components={mdComponents}>{strippedContent}</ReactMarkdown>
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
          className="mt-1 text-sm text-blue-500 dark:text-blue-400 hover:text-blue-600 dark:hover:text-blue-300 transition-colors"
        >
          {expanded ? '收起' : '显示更多'}
        </button>
      )}

      {/* 图片网格 */}
      {images.length > 0 && (() => {
        const imgClass = "w-full h-full object-cover rounded-lg border border-gray-200 dark:border-gray-600 cursor-pointer hover:opacity-80 transition-opacity";

        if (images.length === 1) {
          return (
            <div className="mt-3">
              <img src={getThumbnailUrl(images[0].url)} alt={images[0].alt} className={imgClass} style={{ aspectRatio: '16/10' }} onClick={() => setPreviewImage(images[0].url)} />
            </div>
          );
        }

        if (images.length === 2) {
          return (
            <div className="mt-3 grid grid-cols-2 gap-1">
              {images.map((img, i) => (
                <img key={i} src={getThumbnailUrl(img.url)} alt={img.alt} className={imgClass} style={{ aspectRatio: '1/1' }} onClick={() => setPreviewImage({ url: img.url, index: i })} />
              ))}
            </div>
          );
        }

        if (images.length === 3) {
          return (
            <div className="mt-3 grid grid-cols-2 gap-1" style={{ gridTemplateRows: '1fr 1fr' }}>
              <div className="row-span-2">
                <img src={getThumbnailUrl(images[0].url)} alt={images[0].alt} className={imgClass} style={{ aspectRatio: '1/2' }} onClick={() => setPreviewImage(images[0].url)} />
              </div>
              <img src={getThumbnailUrl(images[1].url)} alt={images[1].alt} className={imgClass} style={{ aspectRatio: '1/1' }} onClick={() => setPreviewImage(images[1].url)} />
              <img src={getThumbnailUrl(images[2].url)} alt={images[2].alt} className={imgClass} style={{ aspectRatio: '1/1' }} onClick={() => setPreviewImage(images[2].url)} />
            </div>
          );
        }

        if (images.length === 4) {
          return (
            <div className="mt-3 grid grid-cols-2 gap-1">
              {images.map((img, i) => (
                <img key={i} src={getThumbnailUrl(img.url)} alt={img.alt} className={imgClass} style={{ aspectRatio: '1/1' }} onClick={() => setPreviewImage({ url: img.url, index: i })} />
              ))}
            </div>
          );
        }

        // 5+ images: 3-column first row, then 2-column rows
        const firstRow = images.slice(0, 3);
        const rest = images.slice(3);
        return (
          <div className="mt-3 flex flex-col gap-1">
            <div className="grid grid-cols-3 gap-1">
              {firstRow.map((img, i) => (
                <img key={i} src={getThumbnailUrl(img.url)} alt={img.alt} className={imgClass} style={{ aspectRatio: '1/1' }} onClick={() => setPreviewImage({ url: img.url, index: i })} />
              ))}
            </div>
            {rest.length > 0 && (
              <div className="grid grid-cols-2 gap-1">
                {rest.map((img, i) => (
                  <img key={i + 3} src={getThumbnailUrl(img.url)} alt={img.alt} className={imgClass} style={{ aspectRatio: '1/1' }} onClick={() => setPreviewImage({ url: img.url, index: i + 3 })} />
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* 附件列表 */}
      {fileLinks.length > 0 && (
        <div className="flex flex-col gap-1.5 mt-3">
          {fileLinks.map((file, i) => (
            <a
              key={i}
              href={file.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700/50 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors min-w-0"
            >
              <FileText className="w-3.5 h-3.5 flex-shrink-0 text-gray-400 dark:text-gray-500" />
              <span className="truncate">{file.name}</span>
              <Download className="w-3 h-3 flex-shrink-0 text-gray-400 dark:text-gray-500 ml-auto" />
            </a>
          ))}
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
            />
          ))}
        </div>
      )}

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {tags.map(tag => {
            const c = TAG_COLORS[tagColorIndex(tag)];
            return (
              <button
                key={tag}
                onClick={(e) => { e.stopPropagation(); onTagClick(tag); }}
                className="px-2.5 py-0.5 rounded-full cursor-pointer transition-colors"
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
          <div className="border-t border-gray-100 dark:border-gray-700 my-1" />
          <div className="px-3 py-2">
            <div className="flex items-center gap-1.5">
              {MEMO_COLORS.map(c => (
                <button
                  key={c.value}
                  onClick={() => handleColorChange(memo.color === c.value ? null : c.value)}
                  className={`w-5 h-5 rounded-full border transition-transform hover:scale-110 ${
                    memo.color === c.value ? 'ring-2 ring-blue-500 ring-offset-1 dark:ring-offset-gray-800' : c.name === '白' ? 'border-gray-400 dark:border-gray-500' : 'border-gray-200 dark:border-gray-600'
                  }`}
                  style={{ backgroundColor: isDark ? c.dark : c.value }}
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
    </div>
  );
});

export default MemoCard;
