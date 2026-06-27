import { useState, useRef, useCallback, useEffect, useMemo, memo } from 'react';
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
import { Pencil, Eye, Image, Paperclip, Copy, CheckCheck, Save, Bold, Italic, Heading1, Heading2, Heading3, List, ListOrdered, Quote, Code, Link, Minus, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getNodes, createNode, updateNode, uploadFile, uploadFromUrl, getMemoTags, getDocuments, updateDocument } from '../api/data';
import { useDocuments } from '../context/DocumentContext';
import type { Node, Document } from '../api/data';
import MermaidBlock from './MermaidBlock';
import { handleListContinuation } from '../utils/listContinuation';
import { normalizeTaskLists, normalizeHighlight, normalizeListSeparators, normalizeCodeBlocks, normalizeCallouts } from '../utils/markdownPreprocess';
import { getPasteMarkdown, extractExternalImageUrls } from '../utils/htmlToMarkdown';
import MentionDropdown from './MentionDropdown';
import AIChatPanel from './AIChatPanel';

interface Props {
  documentId: string;
  isNew?: boolean;
}

// 普通笔记预处理：不剥离图片和标签（与 MemoCard 不同，图片内联渲染）
function preprocess(content: string): string {
  return normalizeCodeBlocks(normalizeListSeparators(normalizeHighlight(normalizeTaskLists(normalizeCallouts(content)))));
}

// --- 代码块组件 (同 MemoCard) ---
function useIsDark() {
  const check = () => {
    try {
      const saved = localStorage.getItem('outline-font-settings');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.theme === 'dark') return true;
        if (parsed.theme && parsed.theme !== 'dark') return false;
      }
    } catch { /* ignore parse error */ }
    return document.documentElement.classList.contains('dark') || window.matchMedia('(prefers-color-scheme: dark)').matches;
  };
  const [isDark, setIsDark] = useState(check);
  useEffect(() => {
    const update = () => setIsDark(check());
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
  }, []);
  return isDark;
}

const codeBlockCustomStyle = (isDark: boolean): React.CSSProperties => ({
  margin: 0,
  borderRadius: '0 0 0.5rem 0.5rem',
  fontSize: '0.95em',
  background: isDark ? '#282c34' : '#fbfbf8',
  border: 'none',
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
    const useHighlight = language && language !== 'markdown' && language !== 'text';
    return (
      <div className="relative rounded-lg overflow-hidden border border-[#dad9d4] dark:border-gray-700">
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#dad9d4] dark:border-gray-700"
          style={{ background: isDark ? '#282c34' : '#f6f5f0' }}
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

  return (
    <code className={className} {...props}>{children}</code>
  );
});

// --- 图片组件 ---
function NoteImage({ src, alt }: { src?: string; alt?: string }) {
  if (!src) return null;
  return <img src={src} alt={alt || ''} className="max-w-full rounded-lg my-2" loading="lazy" />;
}

// --- 工具栏按钮 ---
function ToolbarBtn({ onClick, title, children, active }: { onClick: () => void; title: string; children: React.ReactNode; active?: boolean }) {
  return (
    <button onClick={onClick} title={title}
      className={`p-1.5 rounded transition-colors ${active ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
      {children}
    </button>
  );
}

// --- 主组件 ---
export default function MarkdownNoteEditor({ documentId, isNew = false }: Props) {
  const navigate = useNavigate();
  const { updateDocumentTitle } = useDocuments();
  const [isEditing, setIsEditing] = useState(isNew);
  const [content, setContent] = useState('');
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [title, setTitle] = useState('');
  const [nodeId, setNodeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [documents, setDocuments] = useState<Document[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef('');
  const pendingSaveRef = useRef<string | null>(null);

  // 组件卸载时 flush 待保存内容
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (pendingSaveRef.current !== null && nodeId) {
        const token = localStorage.getItem('token');
        const data = JSON.stringify({ content: pendingSaveRef.current });
        fetch(`/api/nodes/${nodeId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
          },
          body: data,
          keepalive: true,
        }).catch(() => {});
      }
    };
  }, [nodeId]);

  // 标签搜索
  const [allTags, setAllTags] = useState<string[]>([]);
  const [tagSearch, setTagSearch] = useState<{ keyword: string; start: number } | null>(null);
  const [tagDropdownIndex, setTagDropdownIndex] = useState(0);

  // @提及
  const [showMention, setShowMention] = useState(false);
  const [mentionPosition, setMentionPosition] = useState({ top: 0, left: 0 });
  const [mentionSearchText, setMentionSearchText] = useState('');
  const [mentionStartOffset, setMentionStartOffset] = useState<number | null>(null);

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

  // 加载内容
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [nodes, docs] = await Promise.all([getNodes(documentId), getDocuments()]);
        if (cancelled) return;
        setDocuments(docs);
        const docMeta = docs.find(d => d.id === documentId);
        setTitle(docMeta?.title || '新笔记');
        if (nodes.length > 0) {
          const root = nodes.find(n => !n.parent_node_id) || nodes[0];
          setNodeId(root.id);
          setContent(root.content || '');
          lastSavedRef.current = root.content || '';
        } else {
          const newNode = await createNode(documentId, '', null);
          if (cancelled) return;
          setNodeId(newNode.id);
          setContent('');
          lastSavedRef.current = '';
        }
      } catch (e) {
        console.error('Failed to load note', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [documentId]);

  useEffect(() => {
    getMemoTags().then(setAllTags).catch(() => {});
  }, []);

  // 自动保存
  const scheduleSave = useCallback((newContent: string) => {
    if (newContent === lastSavedRef.current) { pendingSaveRef.current = null; return; }
    pendingSaveRef.current = newContent;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      if (!nodeId) return;
      setSaving(true);
      try {
        await updateNode(nodeId, { content: newContent });
        lastSavedRef.current = newContent;
        pendingSaveRef.current = null;
      } catch (e) {
        console.error('Failed to save note', e);
      } finally {
        setSaving(false);
      }
    }, 500);
  }, [nodeId]);

  // 保存标题
  const saveTitle = useCallback(async (newTitle: string) => {
    try {
      updateDocumentTitle(documentId, newTitle);
      await updateDocument(documentId, { title: newTitle });
    } catch (e) {
      console.error('Failed to save title', e);
    }
  }, [documentId, updateDocumentTitle]);

  // 光标位置计算（缓存镜像 DOM）
  const mirrorRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    return () => {
      if (mirrorRef.current && mirrorRef.current.parentNode) {
        mirrorRef.current.parentNode.removeChild(mirrorRef.current);
      }
    };
  }, []);

  // 标准 span 标记法
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
      mirror.style.cssText = 'position:absolute;visibility:hidden;top:-9999px;left:-9999px;white-space:pre-wrap;overflow-wrap:break-word';
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
    if (after) mirror.appendChild(document.createTextNode(after));

    const top = rect.top + borderTop + padTop + marker.offsetTop - textarea.scrollTop + 4;
    const left = rect.left + borderLeft + padLeft + marker.offsetLeft;

    while (mirror.childNodes.length > 1) mirror.removeChild(mirror.lastChild!);
    return { top, left };
  }, []);

  // @提及
  const detectMentionSearch = useCallback((text: string, cursorPos: number) => {
    const before = text.slice(0, cursorPos);
    const match = before.match(/(?:^|\s)@([a-zA-Z0-9_一-龥]*)$/);
    if (match) {
      const start = cursorPos - match[0].length + (match[0][0] === '@' ? 0 : 1);
      setMentionSearchText(text.substring(start + 1, cursorPos));
      setMentionStartOffset(start);
      const el = textareaRef.current;
      if (el) setMentionPosition(getCursorPos(el, cursorPos));
    } else {
      setShowMention(false);
      setMentionStartOffset(null);
    }
  }, [getCursorPos]);

  const insertMention = useCallback((doc: Document) => {
    const el = textareaRef.current;
    if (!el || mentionStartOffset === null) return;
    const end = mentionStartOffset + 1 + mentionSearchText.length;
    const before = el.value.slice(0, mentionStartOffset);
    const after = el.value.slice(end);
    const linkText = `[@${doc.title || '无标题'}](/d/${doc.id})`;
    const newContent = before + linkText + ' ' + after;
    el.value = newContent;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    setContent(newContent);
    scheduleSave(newContent);
    setShowMention(false);
    setMentionSearchText('');
    setMentionStartOffset(null);
    requestAnimationFrame(() => { el.focus(); el.selectionStart = el.selectionEnd = before.length + linkText.length + 1; });
  }, [mentionStartOffset, mentionSearchText, scheduleSave]);

  // 标签
  const detectTagSearch = useCallback((text: string, cursorPos: number) => {
    const before = text.slice(0, cursorPos);
    const match = before.match(/(?:^|\s)#([a-zA-Z0-9_一-龥]*)$/);
    if (match) {
      const start = cursorPos - match[0].length + (match[0][0] === '#' ? 0 : 1);
      setTagSearch({ keyword: match[1], start });
      setTagDropdownIndex(0);
    } else {
      setTagSearch(null);
    }
  }, []);

  const insertTag = useCallback((tagName: string) => {
    const el = textareaRef.current;
    if (!el || !tagSearch) return;
    const cursorPos = el.selectionStart;
    const before = el.value.slice(0, tagSearch.start);
    const after = el.value.slice(cursorPos);
    const newContent = before + tagName + ' ' + after;
    el.value = newContent;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    setContent(newContent);
    scheduleSave(newContent);
    setTagSearch(null);
    requestAnimationFrame(() => { el.focus(); el.selectionStart = el.selectionEnd = tagSearch.start + tagName.length + 1; });
  }, [tagSearch, scheduleSave]);

  // 插入 Markdown 格式
  const insertFormat = useCallback((before: string, after: string = '', placeholder: string = '') => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = el.value.slice(start, end);
    const insertText = selected || placeholder;
    const newContent = el.value.slice(0, start) + before + insertText + after + el.value.slice(end);
    el.value = newContent;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    setContent(newContent);
    scheduleSave(newContent);
    requestAnimationFrame(() => {
      el.focus();
      if (selected) {
        el.selectionStart = start + before.length;
        el.selectionEnd = start + before.length + insertText.length;
      } else {
        el.selectionStart = el.selectionEnd = start + before.length + placeholder.length;
      }
    });
  }, [scheduleSave]);

  const insertLinePrefix = useCallback((prefix: string) => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const value = el.value;
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    const newContent = value.slice(0, lineStart) + prefix + value.slice(lineStart);
    el.value = newContent;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    setContent(newContent);
    scheduleSave(newContent);
    requestAnimationFrame(() => { el.focus(); el.selectionStart = el.selectionEnd = start + prefix.length; });
  }, [scheduleSave]);

  // 文件上传
  const handleFileUpload = useCallback(async (file: File, isImage: boolean) => {
    if (file.size > 50 * 1024 * 1024) { alert('文件大小不能超过 50MB'); return; }
    setUploading(true);
    try {
      const res = await uploadFile(file);
      const url = res.file_path.replace(/^\/api/, '');
      const el = textareaRef.current;
      if (!el) return;
      const start = el.selectionStart;
      const text = isImage ? `![${res.file_name}](${url})` : `[${res.file_name}](${url})`;
      const newContent = el.value.slice(0, start) + text + el.value.slice(start);
      // textarea 是非受控组件，需要直接修改 DOM 值
      el.value = newContent;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      setContent(newContent);
      scheduleSave(newContent);
      requestAnimationFrame(() => { el.focus(); el.selectionStart = el.selectionEnd = start + text.length; });
    } catch (e) {
      console.error('Upload failed', e);
      alert('上传失败');
    } finally {
      setUploading(false);
    }
  }, [scheduleSave]);

  // 键盘处理
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showMention) {
      if (e.key === 'Escape') { e.preventDefault(); setShowMention(false); setMentionSearchText(''); setMentionStartOffset(null); return; }
    }
    if (tagSearch && filteredTags.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setTagDropdownIndex(prev => (prev + 1) % filteredTags.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setTagDropdownIndex(prev => (prev - 1 + filteredTags.length) % filteredTags.length); return; }
      if ((e.key === 'Enter' && !e.nativeEvent.isComposing) || e.key === 'Tab') { e.preventDefault(); insertTag(filteredTags[tagDropdownIndex]); return; }
      if (e.key === 'Escape') { e.preventDefault(); setTagSearch(null); return; }
    }
    // Tab 插入缩进
    if (e.key === 'Tab') {
      e.preventDefault();
      const el = textareaRef.current;
      if (!el) return;
      // 使用 execCommand 插入文本，保留撤销历史
      document.execCommand('insertText', false, '  ');
      return;
    }
    // 传入 textarea 实时值而非 stale state
    handleListContinuation(e, textareaRef.current?.value ?? content, setContent, textareaRef);
  };

  // 内容变化
  const handleContentChange = (newValue: string) => {
    const el = textareaRef.current;
    const cursorPos = el?.selectionStart || newValue.length;
    // 同步 content 状态，避免 stale state
    setContent(newValue);
    scheduleSave(newValue);
    detectTagSearch(newValue, cursorPos);
    if (newValue.length > content.length && newValue.charAt(cursorPos - 1) === '@') {
      if (el) setMentionPosition(getCursorPos(el, cursorPos - 1));
      setMentionSearchText('');
      setMentionStartOffset(cursorPos - 1);
      setShowMention(true);
    }
    if (showMention) detectMentionSearch(newValue, cursorPos);
  };

  // Markdown 组件
  const navigate_fn = useNavigate();
  const mdComponents = useMemo((): Components => ({
    code: (props: any) => {
      const match = /language-(\w+)/.exec(props.className || '');
      if (match && match[1] === 'mermaid') {
        return <MermaidBlock code={String(props.children).replace(/\n$/, '')} />;
      }
      return <CodeBlock {...props} />;
    },
    img: ({ src, alt }) => <NoteImage src={src} alt={alt} />,
    a: ({ href, children, ...props }) => {
      if (href?.startsWith('/d/')) {
        const docId = href.replace('/d/', '');
        return <a href={href} className="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 bg-blue-50 dark:bg-blue-900/30 px-1 rounded cursor-pointer"
          onClick={(e) => { e.preventDefault(); navigate_fn(`/d/${docId}`); }}>{children}</a>;
      }
      return <a {...props} href={href} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 underline">{children}</a>;
    },
  }), [navigate_fn]);

  const processedContent = useMemo(() => preprocess(content), [content]);

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="text-gray-400 dark:text-gray-500 text-sm">加载中...</div></div>;
  }

  return (
    <div className="flex flex-col h-full bg-[#FBF8F3] dark:bg-transparent">
      {/* 顶部工具栏 */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 dark:border-gray-800 shrink-0">
        {/* 左侧：标题 + 编辑模式工具 */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => { if (title.trim()) saveTitle(title.trim()); }}
            className="text-lg font-semibold text-gray-900 dark:text-gray-100 bg-transparent border-none outline-none placeholder-gray-400 dark:placeholder-gray-500 flex-1 min-w-0 truncate"
            placeholder="笔记标题"
          />
          {saving && <span className="text-xs text-gray-400 shrink-0"><Save className="w-3 h-3 inline mr-0.5" />保存中</span>}
          {uploading && <span className="text-xs text-blue-500 shrink-0">上传中...</span>}
        </div>

        {/* 右侧：模式切换 */}
        <button
          onClick={() => {
            // 切换前同步 textarea 最新内容到 state，确保编辑/预览一致
            if (isEditing && textareaRef.current) {
              setContent(textareaRef.current.value);
            }
            setIsEditing(!isEditing);
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors shrink-0 ml-4"
        >
          {isEditing ? <><Eye className="w-4 h-4" />阅读</> : <><Pencil className="w-4 h-4" />编辑</>}
        </button>
      </div>

      {/* Markdown 快捷工具栏（仅编辑模式） */}
      {isEditing && (
        <div className="flex items-center gap-0.5 px-4 py-1.5 border-b border-gray-100 dark:border-gray-800 shrink-0 overflow-x-auto">
          <ToolbarBtn onClick={() => insertLinePrefix('# ')} title="一级标题"><Heading1 className="w-4 h-4" /></ToolbarBtn>
          <ToolbarBtn onClick={() => insertLinePrefix('## ')} title="二级标题"><Heading2 className="w-4 h-4" /></ToolbarBtn>
          <ToolbarBtn onClick={() => insertLinePrefix('### ')} title="三级标题"><Heading3 className="w-4 h-4" /></ToolbarBtn>
          <div className="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-1" />
          <ToolbarBtn onClick={() => insertFormat('**', '**', '粗体')} title="粗体"><Bold className="w-4 h-4" /></ToolbarBtn>
          <ToolbarBtn onClick={() => insertFormat('*', '*', '斜体')} title="斜体"><Italic className="w-4 h-4" /></ToolbarBtn>
          <ToolbarBtn onClick={() => insertFormat('`', '`', '代码')} title="行内代码"><Code className="w-4 h-4" /></ToolbarBtn>
          <ToolbarBtn onClick={() => insertFormat('\n```\n', '\n```\n', '代码块')} title="代码块"><span className="text-xs font-mono font-bold">B</span></ToolbarBtn>
          <ToolbarBtn onClick={() => insertFormat('~~', '~~', '删除线')} title="删除线"><span className="text-xs line-through">S</span></ToolbarBtn>
          <div className="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-1" />
          <ToolbarBtn onClick={() => insertLinePrefix('- ')} title="无序列表"><List className="w-4 h-4" /></ToolbarBtn>
          <ToolbarBtn onClick={() => insertLinePrefix('1. ')} title="有序列表"><ListOrdered className="w-4 h-4" /></ToolbarBtn>
          <ToolbarBtn onClick={() => insertLinePrefix('> ')} title="引用"><Quote className="w-4 h-4" /></ToolbarBtn>
          <ToolbarBtn onClick={() => insertLinePrefix('- [ ] ')} title="任务列表"><span className="text-xs">☑</span></ToolbarBtn>
          <div className="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-1" />
          <ToolbarBtn onClick={() => insertFormat('[', '](url)', '链接文字')} title="链接"><Link className="w-4 h-4" /></ToolbarBtn>
          <ToolbarBtn onClick={() => insertFormat('\n---\n')} title="分割线"><Minus className="w-4 h-4" /></ToolbarBtn>
          <div className="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-1" />
          <ToolbarBtn onClick={() => imageInputRef.current?.click()} title="上传图片"><Image className="w-4 h-4" /></ToolbarBtn>
          <ToolbarBtn onClick={() => fileInputRef.current?.click()} title="上传附件"><Paperclip className="w-4 h-4" /></ToolbarBtn>
          <div className="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-1" />
          <ToolbarBtn onClick={() => setShowAIPanel(true)} title="AI 整理"><Sparkles className="w-4 h-4" /></ToolbarBtn>
        </div>
      )}

      {/* 编辑/预览区域 */}
      <div className="flex-1 overflow-y-auto scrollbar-none relative flex flex-col items-center">
        {isEditing ? (
          <>
            <div className="w-full max-w-[768px] h-full scrollbar-none">
            <textarea
              ref={textareaRef}
              defaultValue={content}
              onChange={(e) => {
                const newValue = e.target.value;
                handleContentChange(newValue);
              }}
              onKeyDown={handleKeyDown}
              onPaste={(e) => {
                // 优先处理文件粘贴（图片/附件）
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
                  let newContent = before + md + after;
                  el.value = newContent;
                  el.dispatchEvent(new Event('input', { bubbles: true }));
                  setContent(newContent);
                  scheduleSave(newContent);
                  const cursorPos = start + md.length;
                  requestAnimationFrame(() => {
                    el.selectionStart = el.selectionEnd = cursorPos;
                  });
                  // 异步通过后端代理下载外部图片并上传到本地
                  const externalUrls = extractExternalImageUrls(md);
                  if (externalUrls.length > 0) {
                    setUploading(true);
                    Promise.allSettled(
                      externalUrls.map(async (url) => {
                        try {
                          const res = await uploadFromUrl(url);
                          const localUrl = res.file_path.replace(/^\/api/, '');
                          return { originalUrl: url, localUrl };
                        } catch {
                          return null;
                        }
                      })
                    ).then((results) => {
                      const el = textareaRef.current;
                      if (!el) { setUploading(false); return; }
                      let updated = el.value;
                      for (const r of results) {
                        if (r && r.status === 'fulfilled' && r.value) {
                          updated = updated.split(r.value.originalUrl).join(r.value.localUrl);
                        }
                      }
                      if (updated !== el.value) {
                        el.value = updated;
                        el.dispatchEvent(new Event('input', { bubbles: true }));
                        setContent(updated);
                        scheduleSave(updated);
                      }
                      setUploading(false);
                    });
                  }
                }
              }}
              onClick={(e) => detectTagSearch((e.target as HTMLTextAreaElement).value, (e.target as HTMLTextAreaElement).selectionStart)}
              onSelect={(e) => detectTagSearch((e.target as HTMLTextAreaElement).value, (e.target as HTMLTextAreaElement).selectionStart)}
              onBlur={() => setTimeout(() => setTagSearch(null), 200)}
              placeholder="开始书写... (支持 Markdown，输入 # 添加标签，@ 链接笔记)"
              className="w-full h-full min-h-full bg-transparent text-gray-800 dark:text-gray-200 text-base p-6 resize-none focus:outline-none scrollbar-none"
              style={{ fontFamily: 'inherit', lineHeight: '1.75' }}
            />
            </div>

            {/* 标签下拉 */}
            {tagSearch && filteredTags.length > 0 && (
              <div className="absolute left-6 w-40 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                {filteredTags.map((tag, i) => (
                  <button key={tag} onMouseDown={(e) => { e.preventDefault(); insertTag(tag); }}
                    className={`w-full text-left px-4 py-2 text-base transition-colors ${i === tagDropdownIndex ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                    {tag}
                  </button>
                ))}
              </div>
            )}

            {/* @提及下拉 */}
            {showMention && createPortal(
              <MentionDropdown documents={documents} onSelect={insertMention}
                onClose={() => { setShowMention(false); setMentionSearchText(''); setMentionStartOffset(null); textareaRef.current?.focus(); }}
                position={mentionPosition} searchText={mentionSearchText} />,
              document.body
            )}
          </>
        ) : (
          <div className="memo-content prose prose-gray dark:prose-invert max-w-[768px] w-full text-base text-gray-700 dark:text-gray-300 p-6" style={{ lineHeight: '1.75' }}>
            {content.trim() ? (
              <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks, remarkMath]} rehypePlugins={[rehypeRaw, preserveCodeBlocks, rehypeKatex]} components={mdComponents}>{processedContent}</ReactMarkdown>
            ) : (
              <p className="text-gray-400 dark:text-gray-500 italic">空笔记</p>
            )}
          </div>
        )}
      </div>

      {/* 隐藏文件选择器 */}
      <input ref={imageInputRef} type="file" accept="image/*" multiple className="hidden"
        onChange={(e) => { const files = e.target.files; if (files) { for (let i = 0; i < files.length; i++) { handleFileUpload(files[i], true); } } e.target.value = ''; }} />
      <input ref={fileInputRef} type="file" multiple className="hidden"
        onChange={(e) => { const files = e.target.files; if (files) { for (let i = 0; i < files.length; i++) { handleFileUpload(files[i], false); } } e.target.value = ''; }} />

      {/* AI 对话面板 */}
      {showAIPanel && (
        <AIChatPanel
          context={content}
          onWriteBack={(newContent) => {
            setContent(newContent);
            if (textareaRef.current) textareaRef.current.value = newContent;
            scheduleSave(newContent);
          }}
          onClose={() => setShowAIPanel(false)}
        />
      )}
    </div>
  );
}
