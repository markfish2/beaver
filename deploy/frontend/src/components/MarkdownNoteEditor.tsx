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
import { Pencil, Eye, Save, Columns2, Image, Paperclip, Copy, CheckCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getNodes, createNode, updateNode, uploadFile, uploadFromUrl, getMemoTags, getDocuments, updateDocument } from '../api/data';
import { useDocuments } from '../context/DocumentContext';
import type { Node, Document } from '../api/data';
import MermaidBlock from './MermaidBlock';
import { normalizeTaskLists, normalizeHighlight, normalizeListSeparators, normalizeCodeBlocks, normalizeCallouts } from '../utils/markdownPreprocess';
import { getPasteMarkdown, extractExternalImageUrls } from '../utils/htmlToMarkdown';
import { useIsDark } from '../hooks/useIsDark';
import MarkdownEditor from './MarkdownEditor';
import type { MarkdownEditorHandle } from './MarkdownEditor';
import EditorToolbar from './EditorToolbar';
import TagMentionPopup from './TagMentionPopup';
import type { PopupItem } from './TagMentionPopup';
import { tagMentionExtension } from '../extensions/tagMentionExtension';
import type { TagMentionState } from '../extensions/tagMentionExtension';
import AIChatPanel from './AIChatPanel';

interface Props {
  documentId: string;
  isNew?: boolean;
}

function preprocess(content: string): string {
  return normalizeCodeBlocks(normalizeListSeparators(normalizeHighlight(normalizeTaskLists(normalizeCallouts(content)))));
}

const codeBlockCustomStyle = (isDark: boolean): React.CSSProperties => ({
  margin: 0, borderRadius: '0 0 0.5rem 0.5rem', fontSize: '0.95em',
  background: isDark ? '#282c34' : '#fbfbf8', border: 'none', padding: '16px',
});

const CodeBlock = memo(function CodeBlock({ className, children, ...props }: { className?: string; children: React.ReactNode; [key: string]: any }) {
  const [copied, setCopied] = useState(false);
  const isDark = useIsDark();
  const match = /language-(\w+)/.exec(className || '');
  const language = match ? match[1] : '';
  const code = String(children).replace(/\n$/, '');
  const isBlock = code.includes('\n') || language;
  const handleCopy = useCallback(async () => { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000); }, [code]);

  if (isBlock) {
    const useHighlight = language && language !== 'markdown' && language !== 'text';
    return (
      <div className="relative rounded-lg overflow-hidden border border-[#dad9d4] dark:border-gray-700">
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#dad9d4] dark:border-gray-700" style={{ background: isDark ? '#282c34' : '#f6f5f0' }}>
          <span className={`text-[11px] font-mono ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{language || 'text'}</span>
          <button onClick={handleCopy} className="flex items-center p-1 rounded-md bg-white/90 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 border border-gray-200 dark:border-gray-600 transition-all" title={copied ? '已复制' : '复制代码'}>
            {copied ? <CheckCheck className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          </button>
        </div>
        {useHighlight ? (
          <SyntaxHighlighter style={isDark ? oneDark : ghcolors} language={language} PreTag="div" customStyle={{ ...codeBlockCustomStyle(isDark) }}>{code}</SyntaxHighlighter>
        ) : (
          <pre className="p-4 overflow-x-auto text-sm font-mono" style={{ background: isDark ? '#1e1e1e' : '#fafafa', margin: 0 }}><code>{code}</code></pre>
        )}
      </div>
    );
  }
  return <code className={className} {...props}>{children}</code>;
});

function NoteImage({ src, alt }: { src?: string; alt?: string }) {
  if (!src) return null;
  return <img src={src} alt={alt || ''} className="max-w-full rounded-lg my-2" loading="lazy" />;
}

export default function MarkdownNoteEditor({ documentId, isNew = false }: Props) {
  const navigate = useNavigate();
  const { updateDocumentTitle } = useDocuments();
  const [viewMode, setViewMode] = useState<'edit' | 'preview' | 'split'>(isNew ? 'edit' : 'preview');
  const [content, setContent] = useState('');
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [title, setTitle] = useState('');
  const [nodeId, setNodeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  const editorRef = useRef<MarkdownEditorHandle>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef('');
  const pendingSaveRef = useRef<string | null>(null);

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
  }), [allTags.length, documents.length, filteredTags, filteredDocs, tagDropdownIndex, mentionDropdownIndex, isTagPopupActive, isMentionPopupActive]);

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
      } catch (e) { console.error('Failed to load note', e); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [documentId]);

  useEffect(() => { getMemoTags().then(setAllTags).catch(() => {}); }, []);

  const scheduleSave = useCallback((newContent: string) => {
    if (newContent === lastSavedRef.current) { pendingSaveRef.current = null; return; }
    pendingSaveRef.current = newContent;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      if (!nodeId) return;
      setSaving(true);
      try { await updateNode(nodeId, { content: newContent }); lastSavedRef.current = newContent; pendingSaveRef.current = null; }
      catch (e) { console.error('Failed to save note', e); }
      finally { setSaving(false); }
    }, 500);
  }, [nodeId]);

  const saveTitle = useCallback(async (newTitle: string) => {
    try { updateDocumentTitle(documentId, newTitle); await updateDocument(documentId, { title: newTitle }); }
    catch (e) { console.error('Failed to save title', e); }
  }, [documentId, updateDocumentTitle]);

  const handleFileUpload = useCallback(async (file: File, isImage: boolean) => {
    if (file.size > 50 * 1024 * 1024) { alert('文件大小不能超过 50MB'); return; }
    setUploading(true);
    try {
      const res = await uploadFile(file);
      const url = res.file_path.replace(/^\/api/, '');
      const text = isImage ? `![${res.file_name}](${url})` : `[${res.file_name}](${url})`;
      editorRef.current?.insertText(text);
      scheduleSave(editorRef.current?.getValue() ?? content);
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
      scheduleSave(newContent);
      const externalUrls = extractExternalImageUrls(md);
      if (externalUrls.length > 0) {
        setUploading(true);
        Promise.allSettled(externalUrls.map(async (url) => {
          try { const res = await uploadFromUrl(url); return { originalUrl: url, localUrl: res.file_path.replace(/^\/api/, '') }; }
          catch { return null; }
        })).then((results) => {
          const view = editorRef.current?.view;
          if (!view) { setUploading(false); return; }
          let updated = view.state.doc.toString();
          for (const r of results) { if (r && r.status === 'fulfilled' && r.value) updated = updated.split(r.value.originalUrl).join(r.value.localUrl); }
          if (updated !== view.state.doc.toString()) view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: updated } });
          scheduleSave(updated);
          setUploading(false);
        });
      }
    }
  }, [handleFileUpload, scheduleSave, content]);

  const navigate_fn = useNavigate();
  const mdComponents = useMemo((): Components => ({
    code: (props: any) => {
      const match = /language-(\w+)/.exec(props.className || '');
      if (match && match[1] === 'mermaid') return <MermaidBlock code={String(props.children).replace(/\n$/, '')} />;
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

  if (loading) return <div className="flex items-center justify-center h-64"><div className="text-gray-400 dark:text-gray-500 text-sm">加载中...</div></div>;

  const showTagPopup = tagState.type === 'tag' && filteredTags.length > 0 && tagState.coords;
  const showMentionPopup = mentionState.type === 'mention' && filteredDocs.length > 0 && mentionState.coords;

  return (
    <div className="flex flex-col h-full bg-[#FBF8F3] dark:bg-transparent">
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 dark:border-gray-800 shrink-0">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
            onBlur={() => { if (title.trim()) saveTitle(title.trim()); }}
            className="text-lg font-semibold text-gray-900 dark:text-gray-100 bg-transparent border-none outline-none placeholder-gray-400 dark:placeholder-gray-500 flex-1 min-w-0 truncate"
            placeholder="笔记标题" />
          {saving && <span className="text-xs text-gray-400 shrink-0"><Save className="w-3 h-3 inline mr-0.5" />保存中</span>}
          {uploading && <span className="text-xs text-blue-500 shrink-0">上传中...</span>}
        </div>
        <div className="flex items-center gap-1 shrink-0 ml-4">
          <button onClick={() => setViewMode(viewMode === 'preview' ? 'edit' : 'preview')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
            {viewMode === 'preview' ? <><Pencil className="w-4 h-4" />编辑</> : <><Eye className="w-4 h-4" />阅读</>}
          </button>
          <button onClick={() => setViewMode(viewMode === 'split' ? 'edit' : 'split')}
            className={`p-1.5 rounded-lg transition-colors ${viewMode === 'split' ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
            title="分屏模式"><Columns2 className="w-4 h-4" /></button>
        </div>
      </div>

      <div className={`flex-1 overflow-hidden ${viewMode === 'split' ? 'flex' : ''}`}>
        {(viewMode === 'edit' || viewMode === 'split') && (
          <div className={`${viewMode === 'split' ? 'w-1/2 border-r border-gray-200 dark:border-gray-700' : 'w-full'} flex flex-col overflow-hidden relative`}>
            <div className="flex-1 overflow-y-auto scrollbar-none flex justify-center">
              <div className="w-full max-w-[768px]" onPaste={handlePaste}>
                <MarkdownEditor ref={editorRef} value={content} onChange={(val) => { setContent(val); scheduleSave(val); }}
                  compact={false} placeholder="开始书写... (支持 Markdown，输入 # 添加标签，@ 链接笔记)" className="h-full p-6"
                  extensions={[tmExtension]}
                  toolbar={<EditorToolbar editorRef={editorRef} onUploadImage={() => imageInputRef.current?.click()} onUploadFile={() => fileInputRef.current?.click()} onOpenAI={() => setShowAIPanel(true)} />}
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
          <div className={`${viewMode === 'split' ? 'w-1/2' : 'w-full'} overflow-y-auto scrollbar-none flex flex-col items-center`}>
            <div className="memo-content max-w-[768px] w-full text-base text-gray-700 dark:text-gray-300 p-6" style={{ lineHeight: '1.75' }}>
              {content.trim() ? (
                <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks, remarkMath]} rehypePlugins={[rehypeRaw, preserveCodeBlocks, rehypeKatex]} components={mdComponents}>{processedContent}</ReactMarkdown>
              ) : <p className="text-gray-400 dark:text-gray-500 italic">空笔记</p>}
            </div>
          </div>
        )}
      </div>

      <input ref={imageInputRef} type="file" accept="image/*" multiple className="hidden"
        onChange={(e) => { const files = e.target.files; if (files) { for (let i = 0; i < files.length; i++) { handleFileUpload(files[i], true); } } e.target.value = ''; }} />
      <input ref={fileInputRef} type="file" multiple className="hidden"
        onChange={(e) => { const files = e.target.files; if (files) { for (let i = 0; i < files.length; i++) { handleFileUpload(files[i], false); } } e.target.value = ''; }} />

      {showAIPanel && (
        <AIChatPanel context={content}
          onWriteBack={(newContent) => { setContent(newContent); editorRef.current?.view?.dispatch({ changes: { from: 0, to: editorRef.current.view.state.doc.length, insert: newContent } }); scheduleSave(newContent); }}
          onClose={() => setShowAIPanel(false)} />
      )}
    </div>
  );
}
