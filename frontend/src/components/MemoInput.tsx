import { useState, useRef, useCallback, useEffect, useMemo, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { Send, Image, Paperclip, ChevronDown, Mic, Maximize2, X, Sparkles } from 'lucide-react';
import { createMemo, uploadFile, uploadAudio, getMemoTags, createTodo, getAIConfigs } from '../api/data';
import { useAudioRecorder } from '../hooks/useAudioRecorder';
import VoiceRecordCard from './VoiceRecordCard';
import { getPasteMarkdown } from '../utils/htmlToMarkdown';
import { localizeMarkdownImages } from '../utils/markdownImageUpload';
import { showToast } from '../utils/toast';
import MarkdownEditor from './MarkdownEditor';
import type { MarkdownEditorHandle } from './MarkdownEditor';
import EditorToolbar from './EditorToolbar';
import TagMentionPopup from './TagMentionPopup';
import type { PopupItem } from './TagMentionPopup';
import { tagMentionExtension } from '../extensions/tagMentionExtension';
import type { TagMentionState } from '../extensions/tagMentionExtension';
import type { Memo, Document } from '../api/data';

const AIChatPanel = lazy(() => import('./AIChatPanel'));

interface MemoInputProps {
  onMemoCreated: (memo: Memo) => void;
  documents?: Document[];
}

export default function MemoInput({ onMemoCreated, documents }: MemoInputProps) {
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showExpandEditor, setShowExpandEditor] = useState(false);
  const [showVoiceCard, setShowVoiceCard] = useState(false);
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [hasAIConfig, setHasAIConfig] = useState(false);
  const [isTodoMode, setIsTodoMode] = useState(false);
  const editorRef = useRef<MarkdownEditorHandle>(null);
  const expandEditorRef = useRef<MarkdownEditorHandle>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recorder = useAudioRecorder();

  const [allTags, setAllTags] = useState<string[]>([]);
  const [tagState, setTagState] = useState<TagMentionState>({ type: null, query: '', coords: null, from: 0, to: 0 });
  const [mentionState, setMentionState] = useState<TagMentionState>({ type: null, query: '', coords: null, from: 0, to: 0 });
  const [tagDropdownIndex, setTagDropdownIndex] = useState(0);
  const [mentionDropdownIndex, setMentionDropdownIndex] = useState(0);

  useEffect(() => { getMemoTags().then(setAllTags).catch(() => {}); }, []);
  useEffect(() => { getAIConfigs().then(configs => setHasAIConfig(configs.length > 0)).catch(() => setHasAIConfig(false)); }, []);

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

  // 文件上传
  const handleFileUpload = useCallback(async (file: File, isImage: boolean) => {
    if (file.size > 50 * 1024 * 1024) { alert('文件大小不能超过 50MB'); return; }
    setUploading(true);
    try {
      const res = await uploadFile(file);
      const url = res.file_path.replace(/^\/api/, '');
      const text = isImage ? `![${res.file_name}](${url})` : `[${res.file_name}](${url})`;
      const active = showExpandEditor ? expandEditorRef.current : editorRef.current;
      active?.insertText(text);
    } catch (e) { console.error('Upload failed', e); alert('上传失败'); }
    finally { setUploading(false); }
  }, [showExpandEditor]);

  // 录音
  const handleAudioRecord = useCallback(async () => {
    if (recorder.isRecording) { recorder.stopRecording(); return; }
    const blob = await recorder.startRecording();
    if (!blob || blob.size === 0) return;
    setUploading(true);
    try {
      const ext = blob.type.includes('webm') ? 'webm' : blob.type.includes('mp4') ? 'mp4' : 'ogg';
      const file = new File([blob], `recording-${Date.now()}.${ext}`, { type: blob.type });
      const res = await uploadAudio(file);
      const url = res.file_path.replace(/^\/api/, '');
      const sec = Math.floor(recorder.duration / 1000);
      const min = Math.floor(sec / 60);
      const s = sec % 60;
      const active = showExpandEditor ? expandEditorRef.current : editorRef.current;
      active?.insertText(`🎙 录音 ${min}:${s.toString().padStart(2, '0')} ![](${url})`);
    } catch (e) { console.error('Audio upload failed', e); alert('录音上传失败'); }
    finally { setUploading(false); }
  }, [recorder, showExpandEditor]);

  // 发布
  const handleSubmit = useCallback(async () => {
    const trimmed = content.trim();
    if (!trimmed || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const memo = await createMemo(trimmed);
      onMemoCreated(memo);
      setContent('');
      showToast('笔记已发布');
    } catch (e) { console.error('Failed to create memo', e); }
    finally { setIsSubmitting(false); }
  }, [content, isSubmitting, onMemoCreated]);

  const handlePublishAsTodo = useCallback(async () => {
    const trimmed = content.trim();
    if (!trimmed || isSubmitting) return;
    const lines = trimmed.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) return;
    setIsSubmitting(true);
    try {
      await Promise.all(lines.map(line => createTodo(line)));
      setContent('');
      showToast(`已创建 ${lines.length} 条待办`);
    } catch (e) { console.error('Failed to publish as todo', e); }
    finally { setIsSubmitting(false); }
  }, [content, isSubmitting]);

  // Tag/mention handlers
  const handleTagSelect = useCallback((tag: string) => {
    const active = showExpandEditor ? expandEditorRef.current : editorRef.current;
    const view = active?.view;
    if (!view) return;
    view.dispatch({ changes: { from: tagState.from, to: tagState.to, insert: `${tag} ` }, selection: { anchor: tagState.from + tag.length + 1 } });
    setTagState({ type: null, query: '', coords: null, from: 0, to: 0 });
    setTagDropdownIndex(0);
    setContent(view.state.doc.toString());
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
    setContent(view.state.doc.toString());
    view.focus();
  }, [mentionState, showExpandEditor]);

  // Rich paste
  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === 'file') { e.preventDefault(); const file = item.getAsFile(); if (file) handleFileUpload(file, item.type.startsWith('image/')); return; }
    }
    const md = getPasteMarkdown(e.clipboardData);
    if (md) {
      e.preventDefault();
      const active = showExpandEditor ? expandEditorRef.current : editorRef.current;
      active?.insertText(md);
      const newContent = active?.getValue() ?? content;
      setContent(newContent);
      if (md.includes('![')) {
        setUploading(true);
        try {
          const result = await localizeMarkdownImages(md);
          const view = active?.view;
          if (!view) return;
          let updated = view.state.doc.toString();
          const localizedFragment = result.markdown;
          if (localizedFragment !== md) updated = updated.replace(md, localizedFragment);
          if (updated !== view.state.doc.toString()) {
            view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: updated } });
            setContent(updated);
          }
          if (result.failedUrls.length > 0) {
            showToast(`${result.failedUrls.length} 张图片未能本地化`, 'error');
          }
        } finally {
          setUploading(false);
        }
      }
    }
  }, [handleFileUpload, content, showExpandEditor]);

  const showTagPopup = tagState.type === 'tag' && filteredTags.length > 0 && tagState.coords;
  const showMentionPopup = mentionState.type === 'mention' && filteredDocs.length > 0 && mentionState.coords;
  return (
    <div className="memo-input-shell mb-6 relative">
      <div className="bg-[#ffffff] dark:bg-gray-800/50 rounded-xl overflow-visible border border-[#dad9d4] dark:border-gray-700/40">
        {/* 紧凑 CodeMirror 编辑器 */}
        <div onPasteCapture={handlePaste}>
          <MarkdownEditor
            ref={editorRef}
            value={content}
            onChange={setContent}
            compact={true}
            minHeight={60}
            maxHeight={400}
            placeholder="记录你的想法... (支持 Markdown，输入 # 添加标签，@ 链接笔记)"
            className="memo-editor-surface px-4 pt-4 pb-2"
            extensions={[tmExtension]}
          />
        </div>

        {/* Tag/mention popups */}
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

        {uploading && <div className="px-4 pb-2 text-sm text-blue-500">上传中...</div>}

        <div className="flex items-center justify-between px-4 pb-3">
          <div className="flex items-center gap-1">
            <button onClick={() => setShowExpandEditor(true)} disabled={uploading || isSubmitting}
              className="p-1.5 text-gray-400 hover:text-blue-500 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-40" title="展开编辑">
              <Maximize2 className="w-4 h-4" />
            </button>
            <button onClick={() => imageInputRef.current?.click()} disabled={uploading || isSubmitting}
              className="p-1.5 text-gray-400 hover:text-blue-500 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-40" title="添加图片">
              <Image className="w-4 h-4" />
            </button>
            <button onClick={() => fileInputRef.current?.click()} disabled={uploading || isSubmitting}
              className="p-1.5 text-gray-400 hover:text-blue-500 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-40" title="添加附件">
              <Paperclip className="w-4 h-4" />
            </button>
            <button onClick={(e) => { e.stopPropagation(); setShowVoiceCard(true); }} disabled={uploading || isSubmitting}
              className="p-1.5 text-gray-400 hover:text-blue-500 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-40" title="语音记录">
              <Mic className="w-4 h-4" />
            </button>
            {hasAIConfig && (
              <button onClick={(e) => { e.stopPropagation(); setShowAIPanel(true); }} disabled={uploading || isSubmitting}
                className="p-1.5 text-gray-400 hover:text-blue-500 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-40" title="AI 整理">
                <Sparkles className="w-4 h-4" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className={`flex items-center rounded-lg overflow-hidden transition-colors ${isTodoMode ? 'bg-emerald-600' : content.trim() ? 'bg-gray-900 dark:bg-gray-100' : 'bg-[#ebebeb] dark:bg-gray-700'}`}>
              <button onClick={isTodoMode ? handlePublishAsTodo : handleSubmit} disabled={!content.trim() || isSubmitting}
                className={`flex items-center gap-1.5 pl-4 pr-2 py-1.5 text-base font-medium transition-colors disabled:cursor-not-allowed ${isTodoMode ? 'text-white hover:bg-emerald-700' : content.trim() ? 'text-white dark:text-gray-900' : 'text-gray-500 dark:text-gray-400'}`}>
                <Send className="w-3.5 h-3.5" />{isTodoMode ? '发布待办' : '发布'}
              </button>
              <button onClick={() => setIsTodoMode(!isTodoMode)}
                className={`px-1.5 py-1.5 ${isTodoMode ? 'text-white' : content.trim() ? 'text-white dark:text-gray-900' : 'text-gray-600 dark:text-gray-400'}`}>
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 隐藏文件选择器 */}
      <input ref={imageInputRef} type="file" accept="image/*" multiple className="hidden"
        onChange={(e) => { const files = e.target.files; if (files) { for (let i = 0; i < files.length; i++) handleFileUpload(files[i], true); } e.target.value = ''; }} />
      <input ref={fileInputRef} type="file" multiple className="hidden"
        onChange={(e) => { const files = e.target.files; if (files) { for (let i = 0; i < files.length; i++) handleFileUpload(files[i], false); } e.target.value = ''; }} />

      {/* 展开编辑器弹窗 */}
      {showExpandEditor && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40" onClick={() => {
          const newContent = expandEditorRef.current?.getValue() ?? content;
          setContent(newContent);
          setShowExpandEditor(false);
        }}>
          <div className="memo-expanded-editor flex flex-col w-[90vw] max-w-[680px] h-[75vh] bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-end px-4 py-2 border-b border-gray-200 dark:border-gray-700 shrink-0 gap-2">
              {uploading && <span className="text-xs text-blue-500 mr-auto">上传中...</span>}
              <button onClick={() => { const newContent = expandEditorRef.current?.getValue() ?? content; setContent(newContent); setShowExpandEditor(false); setTimeout(() => handleSubmit(), 0); }}
                disabled={isSubmitting || !content.trim()}
                className="editor-topbar-action inline-flex min-h-8 items-center gap-1.5 rounded-md px-2.5 py-1 text-sm text-white dark:text-gray-900 bg-gray-900 dark:bg-gray-100 hover:bg-gray-700 dark:hover:bg-gray-300 transition-colors disabled:opacity-40">
                <Send className="h-[14px] w-[14px]" /><span>发布</span>
              </button>
              <button onClick={() => { const newContent = expandEditorRef.current?.getValue() ?? content; setContent(newContent); setShowExpandEditor(false); }}
                className="editor-topbar-action inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors">
                <X className="h-[14px] w-[14px]" />
              </button>
            </div>
            <div className="flex-1 overflow-hidden" onPasteCapture={handlePaste}>
              <MarkdownEditor
                ref={expandEditorRef}
                value={content}
                onChange={setContent}
                compact={false}
                autoFocus
                scrollable
                placeholder="记录你的想法... (支持 Markdown，输入 # 添加标签，@ 链接笔记)"
                className="memo-editor-surface h-full"
                extensions={[tmExtension]}
                toolbar={<EditorToolbar editorRef={expandEditorRef} onUploadImage={() => imageInputRef.current?.click()} onUploadFile={() => fileInputRef.current?.click()} onRecordAudio={handleAudioRecord} isRecording={recorder.isRecording} onOpenAI={() => setShowAIPanel(true)} />}
              />
            </div>
            {/* Tag/mention popups for expanded editor */}
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
      )}

      {showVoiceCard && <VoiceRecordCard onClose={() => setShowVoiceCard(false)} onSaved={(audioUrl, durationFormatted) => { editorRef.current?.insertText(`🎙 录音 ${durationFormatted} ![](${audioUrl})`); showToast('录音已保存'); }} />}

      {showAIPanel && (
        <Suspense fallback={null}><AIChatPanel context={content}
          onWriteBack={(newContent) => {
            setContent(newContent);
            const activeEditor = showExpandEditor ? expandEditorRef.current : editorRef.current;
            activeEditor?.view?.dispatch({ changes: { from: 0, to: activeEditor.view.state.doc.length, insert: newContent } });
          }}
          onClose={() => setShowAIPanel(false)} /></Suspense>
      )}
    </div>
  );
}
