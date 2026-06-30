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
import { MoreVertical, Pencil, Trash2, Pin, PinOff, X, Check, Copy, CheckCheck, Image, Paperclip, FileText, Download, Archive, ArchiveRestore, ArrowUpRight, Globe, Maximize2, Minimize2, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { Memo, Document, LinkPreview } from '../api/data';
import { uploadFile, getMemoTags, updateMemoColor, getThumbnailUrl, fetchLinkPreview, retryLinkPreview } from '../api/data';
import MermaidBlock from './MermaidBlock';
import LinkPreviewCard from './LinkPreviewCard';
import { handleListContinuation } from '../utils/listContinuation';
import { getPasteMarkdown } from '../utils/htmlToMarkdown';
import { stripTags, stripAttachments, normalizeTaskLists, normalizeHighlight, normalizeListSeparators, normalizeCodeBlocks, normalizeCallouts, escapeCodeBlockHtml } from '../utils/markdownPreprocess';
import MemoToDocDialog from './MemoToDocDialog';
import AudioPlayer from './AudioPlayer';
import AIChatPanel from './AIChatPanel';
import { useResizableTextarea } from '../hooks/useResizableTextarea';
import { useAuth } from '../context/AuthContext';

const MEMO_COLORS = [
  { name: '白', value: '#ffffff', dark: '#1f2937', whiteText: false },
  { name: '浅卡片', value: '#E5DFD2', dark: '#2a2720', whiteText: false },
  { name: '强调黑', value: '#1A1A1A', dark: '#1A1A1A', whiteText: true },
  { name: '标志橙', value: '#b37f90', dark: '#8B4A2E', whiteText: true },
  { name: '鼠尾草', value: '#d1dfe8', dark: '#2a3a2d', whiteText: false },
  { name: '深鼠尾草', value: '#9ec8a8', dark: '#3d5240', whiteText: true },
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
  onToggleAI?: (id: string, ai_excluded: boolean) => Promise<void>;
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
    return '#1f2937';
  }
  return color || '#ffffff';
}

function getMemoTextColor(isDark: boolean, color: string | null): string {
  if (!color) return '';
  const found = MEMO_COLORS.find(c => c.value === color);
  if (!found) return '';
  if (isDark) {
    if (found.value === '#1A1A1A' || found.value === '#9ec8a8') return 'text-white';
    return '';
  }
  return found.whiteText ? 'text-white' : '';
}

function getMemoSecondaryBg(isDark: boolean, color: string | null): string {
  // 代码块、图片块、附件块的背景色，基于卡片颜色适配
  if (!color) return '';
  const found = MEMO_COLORS.find(c => c.value === color);
  if (!found) return '';
  if (isDark) {
    if (found.value === '#1A1A1A') return 'bg-[#111111]';
    if (found.value === '#b37f90') return 'bg-[#6b4a55]';
    if (found.value === '#9ec8a8') return 'bg-[#4a7a55]';
    if (found.value === '#d1dfe8') return 'bg-[#3a4a55]';
    return '';
  }
  if (found.value === '#1A1A1A') return 'bg-[#252525]';
  if (found.value === '#b37f90') return 'bg-[#c9a0ae]';
  if (found.value === '#9ec8a8') return 'bg-[#85b892]';
  if (found.value === '#d1dfe8') return 'bg-[#b8cdd8]';
  if (found.value === '#E5DFD2') return 'bg-[#d9d3c6]';
  return '';
}

function getMemoSecondaryBorder(isDark: boolean, color: string | null): string {
  if (!color) return '';
  const found = MEMO_COLORS.find(c => c.value === color);
  if (!found) return '';
  if (isDark) {
    if (found.value === '#1A1A1A') return 'border-[#333333]';
    if (found.value === '#b37f90') return 'border-[#8a5a68]';
    if (found.value === '#9ec8a8') return 'border-[#5a8a65]';
    if (found.value === '#d1dfe8') return 'border-[#4a6a7a]';
    return '';
  }
  if (found.value === '#1A1A1A') return 'border-[#3a3a3a]';
  if (found.value === '#b37f90') return 'border-[#a06a7a]';
  if (found.value === '#9ec8a8') return 'border-[#70a87e]';
  if (found.value === '#d1dfe8') return 'border-[#a0b8c5]';
  if (found.value === '#E5DFD2') return 'border-[#c9c3b6]';
  return '';
}

const codeBlockCustomStyle = (isDark: boolean): React.CSSProperties => ({
  margin: 0,
  borderRadius: '0 0 0.5rem 0.5rem',
  fontSize: '0.95em',
  background: isDark ? '#282c34' : '#fbfbf8',
  border: 'none',
  padding: '16px',
});

const CodeBlock = memo(function CodeBlock({ className, children, cardColor, ...props }: { className?: string; children: React.ReactNode; cardColor?: string | null; [key: string]: any }) {
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

  const secondaryBg = getMemoSecondaryBg(isDark, cardColor);
  const secondaryBorder = getMemoSecondaryBorder(isDark, cardColor);
  const isCardDark = !!cardColor && !!(MEMO_COLORS.find(c => c.value === cardColor)?.whiteText);
  const codeHeaderBg = secondaryBg ? undefined : (isDark ? '#282c34' : '#f6f5f0');
  const codeBorderClass = secondaryBorder || 'border-[#dad9d4] dark:border-gray-700';

  if (isBlock) {
    const useHighlight = language && language !== 'markdown' && language !== 'text';
    return (
      <div className={`relative rounded-lg overflow-hidden border ${codeBorderClass}`}>
        <div className={`flex items-center justify-between px-3 py-1.5 border-b ${codeBorderClass} ${secondaryBg || ''}`}
          style={codeHeaderBg ? { background: codeHeaderBg } : undefined}
        >
          <span className={`text-[11px] font-mono ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{language || 'text'}</span>
          <button
            onClick={handleCopy}
            className="flex items-center p-1 rounded-md bg-white/90 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 border border-gray-200 dark:border-gray-600 transition-all"
            title={copied ? '已复制' : '复制代码'}
          >
            {copied ? <CheckCheck className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          </button>
        </div>
        {useHighlight ? (
          <SyntaxHighlighter
            style={isDark ? oneDark : ghcolors}
            language={language}
            PreTag="div"
            customStyle={{ ...codeBlockCustomStyle(isDark) }}
          >
            {code}
          </SyntaxHighlighter>
        ) : (
          <pre className="p-4 overflow-x-auto text-sm font-mono" style={{ background: isDark ? '#1e1e1e' : '#fafafa', margin: 0 }}>
            <code>{code}</code>
          </pre>
        )}
      </div>
    );
  }

  // 行内代码：深色卡片适配
  const inlineCodeStyle = isCardDark ? (() => {
    if (cardColor === '#1A1A1A') return { background: 'rgba(255,255,255,0.15)', color: '#e5e5e5' };
    if (cardColor === '#b37f90') return { background: 'rgba(255,255,255,0.18)', color: '#f0ebe6' };
    if (cardColor === '#9ec8a8') return { background: 'rgba(255,255,255,0.15)', color: '#e8e0d8' };
    return undefined;
  })() : undefined;

  return (
    <code className={className} {...props} style={inlineCodeStyle}>{children}</code>
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
  cardColor?: string | null,
): Components => {
  const cardColorDef = cardColor ? MEMO_COLORS.find(c => c.value === cardColor) : null;
  const isCardDark = !!cardColorDef?.whiteText;
  const markerClass = isCardDark ? 'text-white/60' : 'text-gray-500 dark:text-gray-400';
  return {
    code: (props: any) => {
      const match = /language-(\w+)/.exec(props.className || '');
      if (match && match[1] === 'mermaid') {
        return <MermaidBlock code={String(props.children).replace(/\n$/, '')} />;
      }
      return <CodeBlock {...props} cardColor={cardColor} />;
    },
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
            className="text-[#3f587f] hover:text-[#2d4159] dark:text-[#6b8ab5] dark:hover:text-[#a3bdd6] bg-[#3f587f]/10 dark:bg-[#3f587f]/20 px-1 rounded cursor-pointer"
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
        ? <span className={`shrink-0 select-none tabular-nums ${markerClass}`}>{(index ?? 0) + 1}.</span>
        : <span className={`shrink-0 leading-none select-none ${markerClass}`} aria-hidden="true">•</span>;
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
      return <li {...mergeClass('list-none flex items-baseline gap-1.5')}>{marker}<span className="flex-1">{children}</span></li>;
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
                ? 'bg-[#3f587f] border-[#3f587f]'
                : isCardDark
                  ? 'bg-white/20 border-white/40'
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
    blockquote: ({ children, ...props }: any) => {
      const isWarmDark = cardColor === '#b37f90' || cardColor === '#9ec8a8';
      const bqStyle = isCardDark
        ? isWarmDark
          ? { color: '#f0ebe6', borderLeftColor: '#e8e0d8' }
          : { color: 'rgba(255,255,255,0.8)', borderLeftColor: 'rgba(255,255,255,0.4)' }
        : undefined;
      return (
        <blockquote {...props} style={bqStyle}>
          {children}
        </blockquote>
      );
    },
  };
};

const MemoCard = memo(function MemoCard({ memo, onEdit, onDelete, onTogglePin, onToggleArchive, onTogglePublic, onToggleAI, onTagClick, onColorChange, isHighlighted, documents, readOnly }: MemoCardProps) {
  const isDark = useIsDark();
  const { user } = useAuth();
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(memo.content);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showExpandEditor, setShowExpandEditor] = useState(false);
  const [showAIPanel, setShowAIPanel] = useState(false);
  const activeTextareaRef = useRef<HTMLTextAreaElement | null>(null);
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

  const detectTagSearch = useCallback((text: string, cursorPos: number, externalEl?: HTMLTextAreaElement) => {
    const before = text.slice(0, cursorPos);
    const match = before.match(/(?:^|\s)#([a-zA-Z0-9_一-龥]*)$/);
    if (match) {
      const start = cursorPos - match[0].length + (match[0][0] === '#' ? 0 : 1);
      setTagSearch({ keyword: match[1], start });
      setTagDropdownIndex(0);
      const el = externalEl || activeTextareaRef.current || textareaRef.current;
      if (el) {
        setTagDropdownPos(getCursorPos(el, cursorPos));
      }
    } else {
      setTagSearch(null);
    }
  }, [getCursorPos]);

  const detectMentionSearch = useCallback((text: string, cursorPos: number, externalEl?: HTMLTextAreaElement) => {
    const before = text.slice(0, cursorPos);
    const match = before.match(/(?:^|\s)@([a-zA-Z0-9_一-龥]*)$/);
    if (match) {
      const start = cursorPos - match[0].length + (match[0][0] === '@' ? 0 : 1);
      setMentionSearch({ keyword: match[1], start });
      setMentionDropdownIndex(0);
      const el = externalEl || activeTextareaRef.current || textareaRef.current;
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
    const el = activeTextareaRef.current || textareaRef.current;
    if (!el || !tagSearch) return;
    const cursorPos = el.selectionStart;
    const before = el.value.slice(0, tagSearch.start);
    const after = el.value.slice(cursorPos);
    const newContent = before + tagName + ' ' + after;
    el.value = newContent;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    setEditContent(newContent);
    if (textareaRef.current && textareaRef.current !== el) textareaRef.current.value = newContent;
    setTagSearch(null);
    requestAnimationFrame(() => {
      el.focus();
      const newPos = tagSearch.start + tagName.length + 1;
      el.selectionStart = el.selectionEnd = newPos;
    });
  }, [tagSearch]);

  // @提及：插入文档链接
  const insertMention = useCallback((doc: Document) => {
    const el = activeTextareaRef.current || textareaRef.current;
    if (!el || !mentionSearch) return;
    const cursorPos = el.selectionStart;
    const before = el.value.slice(0, mentionSearch.start);
    const after = el.value.slice(cursorPos);
    const linkText = `[@${doc.title || '无标题'}](/d/${doc.id})`;
    const newContent = before + linkText + ' ' + after;
    el.value = newContent;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    setEditContent(newContent);
    if (textareaRef.current && textareaRef.current !== el) textareaRef.current.value = newContent;
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
  const mdComponents = useMemo(() => markdownComponents(setPreviewImage, toggleCheckboxRef, checkboxIndexRef, (...args) => navigateRef.current(...args), memo.color), [memo.color]);

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

  // 展开编辑器 portal（编辑/显示模式都需要渲染）
  const expandEditorPortal = showExpandEditor && createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40" onClick={() => {
      const expandEl = document.querySelector('[data-expand-textarea]') as HTMLTextAreaElement;
      if (expandEl) {
        setEditContent(expandEl.value);
        if (textareaRef.current) textareaRef.current.value = expandEl.value;
      }
      activeTextareaRef.current = textareaRef.current;
      setShowExpandEditor(false);
    }}>
      <div className="flex flex-col w-[90vw] max-w-[680px] h-[75vh] bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 shrink-0">
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
            {uploading && <span className="text-xs text-blue-500">上传中...</span>}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const expandEl = document.querySelector('[data-expand-textarea]') as HTMLTextAreaElement;
                if (expandEl) {
                  setEditContent(expandEl.value);
                  if (textareaRef.current) textareaRef.current.value = expandEl.value;
                }
                activeTextareaRef.current = textareaRef.current;
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
                const expandEl = document.querySelector('[data-expand-textarea]') as HTMLTextAreaElement;
                if (expandEl) {
                  setEditContent(expandEl.value);
                  if (textareaRef.current) textareaRef.current.value = expandEl.value;
                }
                activeTextareaRef.current = textareaRef.current;
                setShowExpandEditor(false);
              }}
              className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        <textarea
          data-expand-textarea
          defaultValue={textareaRef.current?.value ?? editContent}
          onFocus={(e) => { activeTextareaRef.current = e.target as HTMLTextAreaElement; }}
          onChange={(e) => {
            const expandEl = e.target as HTMLTextAreaElement;
            const newVal = expandEl.value;
            const cursorPos = expandEl.selectionStart;
            setEditContent(newVal);
            if (textareaRef.current) textareaRef.current.value = newVal;
            detectTagSearch(newVal, cursorPos, expandEl);
            if (mentionSearch) detectMentionSearch(newVal, cursorPos, expandEl);
            if (newVal.length > editContent.length && newVal.charAt(cursorPos - 1) === '@') {
              detectMentionSearch(newVal, cursorPos, expandEl);
            }
          }}
          onKeyDown={(e) => {
            const expandEl = e.currentTarget as HTMLTextAreaElement;
            // 提及下拉导航
            if (mentionSearch && filteredMentionDocs.length > 0) {
              if (e.key === 'ArrowDown') { e.preventDefault(); setMentionDropdownIndex(prev => (prev + 1) % filteredMentionDocs.length); return; }
              if (e.key === 'ArrowUp') { e.preventDefault(); setMentionDropdownIndex(prev => (prev - 1 + filteredMentionDocs.length) % filteredMentionDocs.length); return; }
              if ((e.key === 'Enter' && !e.nativeEvent.isComposing) || e.key === 'Tab') { e.preventDefault(); insertMention(filteredMentionDocs[mentionDropdownIndex]); return; }
              if (e.key === 'Escape') { e.preventDefault(); setMentionSearch(null); return; }
            }
            // 标签下拉导航
            if (tagSearch && filteredTags.length > 0) {
              if (e.key === 'ArrowDown') { e.preventDefault(); setTagDropdownIndex(prev => (prev + 1) % filteredTags.length); return; }
              if (e.key === 'ArrowUp') { e.preventDefault(); setTagDropdownIndex(prev => (prev - 1 + filteredTags.length) % filteredTags.length); return; }
              if ((e.key === 'Enter' && !e.nativeEvent.isComposing) || e.key === 'Tab') { e.preventDefault(); insertTag(filteredTags[tagDropdownIndex]); return; }
              if (e.key === 'Escape') { e.preventDefault(); setTagSearch(null); return; }
            }
            // 列表续行
            if (handleListContinuation(e, expandEl.value, setEditContent, { current: expandEl })) return;
            // Esc 关闭
            if (e.key === 'Escape' && !e.nativeEvent.isComposing) {
              e.preventDefault();
              setEditContent(expandEl.value);
              if (textareaRef.current) textareaRef.current.value = expandEl.value;
              activeTextareaRef.current = textareaRef.current;
              setShowExpandEditor(false);
            }
          }}
          className="flex-1 w-full bg-transparent text-gray-800 dark:text-gray-200 text-base p-4 resize-none focus:outline-none scrollbar-none"
          style={{ fontFamily: 'inherit', lineHeight: '1.75' }}
          autoFocus
        />
        {/* 标签下拉 */}
        {tagSearch && filteredTags.length > 0 && (
          <div className="fixed w-40 z-[10000] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg max-h-48 overflow-y-auto" style={{ top: tagDropdownPos.top, left: tagDropdownPos.left }}>
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
          </div>
        )}
        {/* 提及下拉 */}
        {mentionSearch && filteredMentionDocs.length > 0 && (
          <div className="fixed w-52 z-[10000] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg max-h-48 overflow-y-auto" style={{ top: mentionDropdownPos.top, left: mentionDropdownPos.left }}>
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
          </div>
        )}
      </div>
    </div>,
    document.body
  );

  // AI 对话 portal（编辑/显示模式都需要渲染）
  const aiChatPanel = showAIPanel && createPortal(
    <AIChatPanel
      context={editContent}
      onWriteBack={(newContent) => {
        setEditContent(newContent);
        if (textareaRef.current) textareaRef.current.value = newContent;
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
      style={{ backgroundColor: bgColor }}
      >
        <div className="relative" data-resizable-container>
          <textarea
            ref={textareaRef}
            data-resizable-textarea
            defaultValue={editContent}
            onFocus={(e) => { activeTextareaRef.current = e.target as HTMLTextAreaElement; }}
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
    <div id={`memo-${memo.id}`} className={`group rounded-xl p-4 min-w-0 overflow-hidden border border-[#dad9d4] dark:border-gray-700 ${
      isHighlighted ? 'outline outline-2 outline-blue-400 dark:outline-blue-500 outline-offset-2' : ''}`}
    style={{ backgroundColor: bgColor, contain: 'layout' }}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {memo.is_pinned && (
            <Pin className="w-3 h-3 text-amber-500 dark:text-amber-400 fill-current" />
          )}
          <span className={`text-sm ${getMemoTextColor(isDark, memo.color) || 'text-gray-400 dark:text-gray-500'}`}>
            {formatTime(memo.created_at)}
          </span>
        </div>

        {/* 右侧：AI排除图标 + 地球图标 + 三点菜单 */}
        <div className="flex items-center gap-1">
          {memo.ai_excluded && (
            <svg className={`w-3.5 h-3.5 ${getMemoTextColor(isDark, memo.color) || 'text-gray-400 dark:text-gray-500'}`} viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5"/>
              <line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          )}
          {memo.is_public && (
            <Globe className={`w-3.5 h-3.5 ${getMemoTextColor(isDark, memo.color) || 'text-gray-400 dark:text-gray-500'}`} />
          )}
        {!readOnly && (() => {
          const iconClass = getMemoTextColor(isDark, memo.color) || 'text-gray-400 dark:text-gray-500';
          const hoverClass = (memo.color && MEMO_COLORS.find(cl => cl.value === memo.color)?.whiteText && !isDark)
            ? 'hover:text-white/80'
            : 'hover:text-gray-600 dark:hover:text-gray-300';
          return (
            <button
              ref={menuButtonRef}
              onClick={() => setShowMenu(!showMenu)}
              className={`p-1 rounded transition-colors ${iconClass} ${hoverClass}`}
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
        className={`memo-content text-base relative ${getMemoTextColor(isDark, memo.color) || 'text-gray-700 dark:text-gray-300'} ${readOnly ? '' : 'cursor-text'}`}
        style={{ lineHeight: '1.75' }}
        style={!expanded && isLong ? { maxHeight: '400px', overflow: 'hidden' } : undefined}
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
          className={`mt-1 text-sm transition-colors ${
            (memo.color && MEMO_COLORS.find(cl => cl.value === memo.color)?.whiteText && !isDark)
              ? 'text-white/70 hover:text-white'
              : 'text-blue-500 dark:text-blue-400 hover:text-blue-600 dark:hover:text-blue-300'
          }`}
        >
          {expanded ? '收起' : '显示更多'}
        </button>
      )}

      {/* 图片画廊 */}
      {images.length > 0 && (() => {
        const count = images.length;
        const cols = count === 1 ? 2 : count === 2 ? 2 : count === 3 ? 3 : 4;
        const hasMore = count > 4;
        const bgStyle = getMemoSecondaryBg(isDark, memo.color) ? {} : { background: isDark ? '#111827' : '#fbfbf8' };
        const scrollbarStyle = { scrollbarWidth: 'thin' as const, scrollbarColor: isDark ? '#4b5563 transparent' : '#d1d5db transparent' };
        return (
          <div className={`mt-3 rounded-lg overflow-hidden border ${getMemoSecondaryBorder(isDark, memo.color) || 'border-[#dad9d4] dark:border-gray-700'}`}>
            <div
              className={`px-3 py-1.5 text-xs border-b ${getMemoSecondaryBorder(isDark, memo.color) || 'border-[#dad9d4] dark:border-gray-700'} ${getMemoTextColor(isDark, memo.color) || 'text-gray-500 dark:text-gray-400'} ${getMemoSecondaryBg(isDark, memo.color) || ''}`}
              style={getMemoSecondaryBg(isDark, memo.color) ? undefined : { background: isDark ? '#1f2937' : '#f6f5f0' }}
            >
              图片 ({count})
            </div>
            {hasMore ? (
              // >4张：横向滚动，每张大小和4张一致
              <div
                className={`flex ${getMemoSecondaryBg(isDark, memo.color) || ''}`}
                style={{ gap: '5px', padding: '5px', overflowX: 'auto', ...bgStyle, ...scrollbarStyle }}
              >
                {images.map((img, i) => (
                  <img
                    key={i}
                    src={getThumbnailUrl(img.url)}
                    alt={img.alt}
                    className={`flex-shrink-0 aspect-square object-cover border cursor-pointer hover:opacity-80 transition-opacity ${getMemoSecondaryBorder(isDark, memo.color) || 'border-[#dad9d4] dark:border-gray-700'}`}
                    style={{ width: 'calc((100% - 25px) / 4)', borderRadius: 0 }}
                    onClick={() => setPreviewImage(img.url)}
                  />
                ))}
              </div>
            ) : (
              // ≤4张：Grid 均分
              <div
                className={getMemoSecondaryBg(isDark, memo.color) || ''}
                style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: '5px', padding: '5px', ...bgStyle }}
              >
                {images.map((img, i) => (
                  <img
                    key={i}
                    src={getThumbnailUrl(img.url)}
                    alt={img.alt}
                    className={`w-full aspect-square object-cover border cursor-pointer hover:opacity-80 transition-opacity ${getMemoSecondaryBorder(isDark, memo.color) || 'border-[#dad9d4] dark:border-gray-700'}`}
                    style={{ borderRadius: 0 }}
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
        <div className={`mt-3 rounded-lg overflow-hidden border ${getMemoSecondaryBorder(isDark, memo.color) || 'border-[#dad9d4] dark:border-gray-700'}`}>
          <div
            className={`px-3 py-1.5 text-xs border-b ${getMemoSecondaryBorder(isDark, memo.color) || 'border-[#dad9d4] dark:border-gray-700'} ${getMemoTextColor(isDark, memo.color) || 'text-gray-500 dark:text-gray-400'} ${getMemoSecondaryBg(isDark, memo.color) || ''}`}
            style={getMemoSecondaryBg(isDark, memo.color) ? undefined : { background: isDark ? '#1f2937' : '#f6f5f0' }}
          >
            附件 ({fileLinks.length})
          </div>
          <div className={`flex flex-col gap-1 p-3 ${getMemoSecondaryBg(isDark, memo.color) || ''}`} style={getMemoSecondaryBg(isDark, memo.color) ? undefined : { background: isDark ? '#111827' : '#fbfbf8' }}>
            {fileLinks.map((file, i) => (
              <a
                key={i}
                href={file.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-700/50 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors min-w-0"
              >
                <FileText className="w-3.5 h-3.5 flex-shrink-0 text-gray-400 dark:text-gray-500" />
                <span className="truncate">{file.name}</span>
                <Download className="w-3 h-3 flex-shrink-0 text-gray-400 dark:text-gray-500 ml-auto" />
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
            />
          ))}
        </div>
      )}

      {tags.length > 0 && (() => {
        const cardColorDef = memo.color ? MEMO_COLORS.find(cl => cl.value === memo.color) : null;
        const isCardDark = cardColorDef?.whiteText && !isDark;
        const isCardMuted = !isDark && cardColorDef && (cardColorDef.value === '#E5DFD2' || cardColorDef.value === '#d1dfe8');
        return (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {tags.map(tag => {
              const c = TAG_COLORS[tagColorIndex(tag)];
              // 深色卡片：半透明白色
              if (isCardDark) {
                return (
                  <button
                    key={tag}
                    onClick={(e) => { e.stopPropagation(); onTagClick(tag); }}
                    className="px-2.5 py-0.5 rounded-full cursor-pointer transition-colors"
                    style={{
                      fontSize: '11px',
                      backgroundColor: 'rgba(255,255,255,0.2)',
                      color: '#ffffff',
                      border: '1px solid rgba(255,255,255,0.3)',
                    }}
                  >
                    {tag}
                  </button>
                );
              }
              // 柔和底色卡片：深灰色标签
              if (isCardMuted) {
                return (
                  <button
                    key={tag}
                    onClick={(e) => { e.stopPropagation(); onTagClick(tag); }}
                    className="px-2.5 py-0.5 rounded-full cursor-pointer transition-colors"
                    style={{
                      fontSize: '11px',
                      backgroundColor: 'rgba(0,0,0,0.08)',
                      color: '#374151',
                      border: '1px solid rgba(0,0,0,0.12)',
                    }}
                  >
                    {tag}
                  </button>
                );
              }
              // 默认白色卡片：原有彩色标签
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
        );
      })()}

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
              {MEMO_COLORS.map(c => (
                <button
                  key={c.value}
                  onClick={() => handleColorChange(memo.color === c.value ? null : c.value)}
                  className={`w-5 h-5 rounded-full border transition-transform hover:scale-110 ${
                    memo.color === c.value
                      ? 'ring-2 ring-offset-1 dark:ring-offset-gray-800 ' + (c.whiteText ? 'ring-white/70' : 'ring-gray-400 dark:ring-gray-500')
                      : c.value === '#ffffff'
                        ? 'border-gray-400 dark:border-gray-500'
                        : 'border-white/20 dark:border-white/10'
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

      {expandEditorPortal}
      {aiChatPanel}
    </div>
  );
});

export default MemoCard;
