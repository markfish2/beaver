import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Send, Image, Paperclip, ChevronDown, Mic, MicOff, Maximize2, Minimize2, X, Sparkles } from 'lucide-react';
import { createMemo, uploadFile, uploadAudio, uploadFromUrl, getMemoTags, createTodo, getAIConfigs } from '../api/data';
import { useAudioRecorder } from '../hooks/useAudioRecorder';
import { useResizableTextarea } from '../hooks/useResizableTextarea';
import WaveformCanvas from './WaveformCanvas';
import VoiceRecordCard from './VoiceRecordCard';
import AIChatPanel from './AIChatPanel';
import { handleListContinuation } from '../utils/listContinuation';
import { getPasteMarkdown, extractExternalImageUrls } from '../utils/htmlToMarkdown';
import { showToast } from '../utils/toast';
import MentionDropdown from './MentionDropdown';
import type { Memo, Document } from '../api/data';

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
  const activeTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recorder = useAudioRecorder();
  const { isUserResized, resetUserHeight, onResizeStart } = useResizableTextarea({ minHeight: 60, maxHeight: 400 });

  // 标签搜索状态
  const [allTags, setAllTags] = useState<string[]>([]);
  const [tagSearch, setTagSearch] = useState<{ keyword: string; start: number } | null>(null);
  const [tagDropdownIndex, setTagDropdownIndex] = useState(0);
  const [tagDropdownPos, setTagDropdownPos] = useState({ top: 0, left: 0 });
  const [mentionDropdownIndex, setMentionDropdownIndex] = useState(0);

  // @提及文档搜索状态
  const [showMention, setShowMention] = useState(false);
  const [mentionPosition, setMentionPosition] = useState({ top: 0, left: 0 });
  const [mentionDropdownPos, setMentionDropdownPos] = useState({ top: 0, left: 0 });
  const [mentionSearchText, setMentionSearchText] = useState('');
  const [isTodoMode, setIsTodoMode] = useState(false);
  const [mentionStartOffset, setMentionStartOffset] = useState<number | null>(null);
  useEffect(() => {
    getMemoTags().then(setAllTags).catch(() => {});
  }, []);

  // 检查是否配置了 AI 模型
  useEffect(() => {
    getAIConfigs().then(configs => setHasAIConfig(configs.length > 0)).catch(() => setHasAIConfig(false));
  }, []);

  const filteredTags = useMemo(() => {
    if (!tagSearch) return [];
    const kw = tagSearch.keyword.toLowerCase();
    if (!kw) return allTags.slice(0, 8);
    const prefixMatches: string[] = [];
    const containsMatches: string[] = [];
    for (const tag of allTags) {
      const name = tag.slice(1).toLowerCase(); // 去掉 #
      if (name.startsWith(kw)) prefixMatches.push(tag);
      else if (name.includes(kw)) containsMatches.push(tag);
    }
    return [...prefixMatches, ...containsMatches].slice(0, 8);
  }, [tagSearch, allTags]);

  const filteredMentionDocs = useMemo(() => {
    if (!showMention || !documents) return [];
    const kw = mentionSearchText.toLowerCase();
    if (!kw) return documents.slice(0, 8);
    const prefixMatches: Document[] = [];
    const containsMatches: Document[] = [];
    for (const doc of documents) {
      const title = (doc.title || '无标题').toLowerCase();
      if (title.startsWith(kw)) prefixMatches.push(doc);
      else if (title.includes(kw)) containsMatches.push(doc);
    }
    return [...prefixMatches, ...containsMatches].slice(0, 8);
  }, [showMention, mentionSearchText, documents]);

  // 计算 textarea 中光标的像素位置（逐字符测量）
  const mirrorRef = useRef<HTMLDivElement | null>(null);
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
    // 同步 textarea 的文字样式
    const props = ['width', 'wordBreak', 'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing', 'lineHeight', 'tabSize', 'paddingTop', 'paddingLeft', 'paddingRight', 'borderTopWidth', 'borderLeftWidth'] as const;
    mirror.style.width = (textarea.clientWidth - padLeft - parseFloat(style.paddingRight || '0')) + 'px';
    mirror.style.fontFamily = style.fontFamily;
    mirror.style.fontSize = style.fontSize;
    mirror.style.fontWeight = style.fontWeight;
    mirror.style.fontStyle = style.fontStyle;
    mirror.style.letterSpacing = style.letterSpacing;
    mirror.style.lineHeight = style.lineHeight;
    mirror.style.tabSize = style.tabSize;
    mirror.style.wordBreak = style.wordBreak || 'break-word';

    // 清空并重建内容：text_before + <span id="caret"></span> + text_after
    const before = textarea.value.substring(0, pos);
    const after = textarea.value.substring(pos);
    mirror.textContent = before;
    const marker = document.createElement('span');
    marker.textContent = '​'; // 零宽空格，确保 span 有高度
    mirror.appendChild(marker);
    if (after) {
      const afterNode = document.createTextNode(after);
      mirror.appendChild(afterNode);
    }

    const top = rect.top + borderTop + padTop + marker.offsetTop - textarea.scrollTop + 4;
    const left = rect.left + borderLeft + padLeft + marker.offsetLeft;

    // 清理（移除 afterNode，保留 mirror 和 marker 供复用）
    while (mirror.childNodes.length > 1) {
      mirror.removeChild(mirror.lastChild!);
    }

    return { top, left };
  }, []);

  // 检测光标前的 @提及片段（仅用于更新搜索关键字，不主动打开下拉框）
  const detectMentionSearch = useCallback((text: string, cursorPos: number, externalEl?: HTMLTextAreaElement) => {
    const before = text.slice(0, cursorPos);
    const match = before.match(/(?:^|\s)@([a-zA-Z0-9_一-龥]*)$/);
    if (match) {
      const start = cursorPos - match[0].length + (match[0][0] === '@' ? 0 : 1);
      const searchText = text.substring(start + 1, cursorPos);
      setMentionSearchText(searchText);
      setMentionStartOffset(start);
      setMentionDropdownIndex(0);

      const el = externalEl || textareaRef.current;
      if (el) {
        const pos = getCursorPos(el, cursorPos);
        setMentionPosition(pos);
        setMentionDropdownPos(pos);
      }
    } else {
      setShowMention(false);
      setMentionStartOffset(null);
    }
  }, [getCursorPos]);

  const adjustHeight = useCallback(() => {
    if (isUserResized()) return;
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 200) + 'px';
    }
  }, [isUserResized]);

  // 插入文档链接
  const insertMention = useCallback((doc: Document, externalEl?: HTMLTextAreaElement) => {
    const el = externalEl || activeTextareaRef.current || textareaRef.current;
    if (!el || mentionStartOffset === null) return;
    const searchTextLength = mentionSearchText.length;
    const mentionEndOffset = mentionStartOffset + 1 + searchTextLength;
    const before = el.value.slice(0, mentionStartOffset);
    const after = el.value.slice(mentionEndOffset);
    const linkText = `[@${doc.title || '无标题'}](/d/${doc.id})`;
    const newContent = before + linkText + ' ' + after;
    setContent(newContent);
    if (textareaRef.current && textareaRef.current !== el) textareaRef.current.value = newContent;
    setShowMention(false);
    setMentionSearchText('');
    setMentionStartOffset(null);
    requestAnimationFrame(() => {
      el.focus();
      const newPos = before.length + linkText.length + 1;
      el.selectionStart = el.selectionEnd = newPos;
    });
  }, [mentionStartOffset, mentionSearchText]);

  // 内容变化时自动调整高度（包括 handleListContinuation 触发的变化）
  useEffect(() => {
    // 双重 rAF 确保浏览器完成布局后再测量
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        adjustHeight();
      });
    });
  }, [content, adjustHeight]);

  const insertAtCursor = useCallback((text: string) => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const before = el.value.slice(0, start);
    const after = el.value.slice(end);
    const newContent = before + text + after;
    setContent(newContent);
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = start + text.length;
      adjustHeight();
    });
  }, [adjustHeight]);

  // 检测光标前的标签片段
  const detectTagSearch = useCallback((text: string, cursorPos: number, externalEl?: HTMLTextAreaElement) => {
    const before = text.slice(0, cursorPos);
    const match = before.match(/(?:^|\s)#([a-zA-Z0-9_一-龥]*)$/);
    if (match) {
      const start = cursorPos - match[0].length + (match[0][0] === '#' ? 0 : 1);
      setTagSearch({ keyword: match[1], start });
      setTagDropdownIndex(0);
      const el = externalEl || textareaRef.current;
      if (el) {
        setTagDropdownPos(getCursorPos(el, cursorPos));
      }
    } else {
      setTagSearch(null);
    }
  }, [getCursorPos]);

  const insertTag = useCallback((tagName: string, externalEl?: HTMLTextAreaElement) => {
    const el = externalEl || activeTextareaRef.current || textareaRef.current;
    if (!el || !tagSearch) return;
    const cursorPos = el.selectionStart;
    const before = el.value.slice(0, tagSearch.start);
    const after = el.value.slice(cursorPos);
    const newContent = before + tagName + ' ' + after;
    setContent(newContent);
    if (textareaRef.current && textareaRef.current !== el) textareaRef.current.value = newContent;
    setTagSearch(null);
    requestAnimationFrame(() => {
      el.focus();
      const newPos = tagSearch.start + tagName.length + 1;
      el.selectionStart = el.selectionEnd = newPos;
    });
  }, [tagSearch]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showMention) {
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowMention(false);
        setMentionSearchText('');
        setMentionStartOffset(null);
        return;
      }
    }
    if (tagSearch && filteredTags.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setTagDropdownIndex(prev => (prev + 1) % filteredTags.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setTagDropdownIndex(prev => (prev - 1 + filteredTags.length) % filteredTags.length);
        return;
      }
      if ((e.key === 'Enter' && !e.nativeEvent.isComposing) || e.key === 'Tab') {
        e.preventDefault();
        insertTag(filteredTags[tagDropdownIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setTagSearch(null);
        return;
      }
    }
    if (handleListContinuation(e, content, setContent, textareaRef)) return;
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (isTodoMode) {
        handlePublishAsTodo();
      } else {
        handleSubmit();
      }
    }
  };

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

  const handleAudioRecord = useCallback(async () => {
    if (recorder.isRecording) {
      recorder.stopRecording();
      return;
    }
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
      const timeStr = `${min}:${s.toString().padStart(2, '0')}`;
      insertAtCursor(`🎙 录音 ${timeStr} ![](${url})`);
    } catch (e) {
      console.error('Audio upload failed', e);
      alert('录音上传失败');
    } finally {
      setUploading(false);
    }
  }, [recorder, insertAtCursor]);

  const handleSubmit = async () => {
    const trimmed = content.trim();
    if (!trimmed || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const memo = await createMemo(trimmed);
      onMemoCreated(memo);
      setContent('');
      showToast('笔记已发布');
      setTagSearch(null);
      setShowMention(false);
      setMentionSearchText('');
      setMentionStartOffset(null);
      resetUserHeight();
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    } catch (e) {
      console.error('Failed to create memo', e);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePublishAsTodo = async () => {
    const trimmed = content.trim();
    if (!trimmed || isSubmitting) return;

    const lines = trimmed.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) return;

    setIsSubmitting(true);
    try {
      await Promise.all(lines.map(line => createTodo(line)));
      setContent('');
      showToast(`已创建 ${lines.length} 条待办`);
      resetUserHeight();
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    } catch (e) {
      console.error('Failed to publish as todo', e);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mb-6 relative">
      <div className="bg-white dark:bg-gray-800/50 rounded-xl overflow-visible border border-[#dad9d4] dark:border-gray-700/40 " data-resizable-container>
        <textarea
          ref={textareaRef}
          data-resizable-textarea
          value={content}
          onChange={(e) => {
            const newValue = e.target.value;
            const cursorPos = e.target.selectionStart;
            setContent(newValue);
            adjustHeight();
            detectTagSearch(newValue, cursorPos);
            // 仅在刚输入 @ 字符时打开下拉框，点击/移动光标不触发
            if (newValue.length > content.length && newValue.charAt(cursorPos - 1) === '@') {
              // 计算下拉框位置
              const el = textareaRef.current;
              if (el) {
                setMentionPosition(getCursorPos(el, cursorPos - 1));
              }
              setMentionSearchText('');
              setMentionStartOffset(cursorPos - 1);
              setShowMention(true);
            }
            // 下拉框已打开时，持续更新搜索关键字
            if (showMention) {
              detectMentionSearch(newValue, cursorPos);
            }
          }}
          onKeyDown={handleKeyDown}
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
              document.execCommand('insertText', false, md);
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
                  let updated = content;
                  // 重新读取最新内容（可能用户在上传期间继续输入）
                  if (textareaRef.current) {
                    updated = textareaRef.current.value;
                  }
                  let changed = false;
                  for (const r of results) {
                    if (r && r.status === 'fulfilled' && r.value) {
                      const replaced = updated.split(r.value.originalUrl).join(r.value.localUrl);
                      if (replaced !== updated) {
                        updated = replaced;
                        changed = true;
                      }
                    }
                  }
                  if (changed) {
                    setContent(updated);
                  }
                  setUploading(false);
                });
              }
            }
          }}
          onClick={(e) => {
            detectTagSearch(content, (e.target as HTMLTextAreaElement).selectionStart);
          }}
          onFocus={(e) => { activeTextareaRef.current = e.target as HTMLTextAreaElement; }}
          onSelect={(e) => {
            detectTagSearch(content, (e.target as HTMLTextAreaElement).selectionStart);
          }}
          onBlur={() => setTimeout(() => setTagSearch(null), 200)}
          placeholder="记录你的想法... (支持 Markdown，输入 # 添加标签，@ 链接笔记)"
          rows={2}
          className="w-full px-4 pt-4 pb-2 bg-transparent text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 resize-none focus:outline-none text-base leading-relaxed"
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

        {/* 标签搜索下拉框 */}
        {tagSearch && filteredTags.length > 0 && createPortal(
          <div className="fixed w-40 z-[9999] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg max-h-48 overflow-y-auto" style={{ top: tagDropdownPos.top, left: tagDropdownPos.left }}>
            {filteredTags.map((tag, i) => (
              <button
                key={tag}
                onMouseDown={(e) => { e.preventDefault(); insertTag(tag, activeTextareaRef.current || undefined); }}
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

        {/* @提及文档下拉框 */}
        {showMention && createPortal(
          <MentionDropdown
            documents={documents || []}
            onSelect={(doc) => insertMention(doc, activeTextareaRef.current || undefined)}
            onClose={() => {
              setShowMention(false);
              setMentionSearchText('');
              setMentionStartOffset(null);
              (activeTextareaRef.current || textareaRef.current)?.focus();
            }}
            position={mentionPosition}
            searchText={mentionSearchText}
            zIndex={showExpandEditor ? 10000 : 50}
          />,
          document.body
        )}

        {/* 上传的文件名预览 */}
        {uploading && (
          <div className="px-4 pb-2 text-sm text-blue-500">上传中...</div>
        )}

        <div className="flex items-center justify-between px-4 pb-3">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowExpandEditor(true)}
              disabled={uploading || isSubmitting}
              className="p-1.5 text-gray-400 hover:text-blue-500 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-40"
              title="展开编辑"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => imageInputRef.current?.click()}
              disabled={uploading || isSubmitting}
              className="p-1.5 text-gray-400 hover:text-blue-500 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-40"
              title="添加图片"
            >
              <Image className="w-4 h-4" />
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || isSubmitting}
              className="p-1.5 text-gray-400 hover:text-blue-500 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-40"
              title="添加附件"
            >
              <Paperclip className="w-4 h-4" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setShowVoiceCard(true); }}
              disabled={uploading || isSubmitting}
              className="p-1.5 text-gray-400 hover:text-blue-500 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-40"
              title="语音记录"
            >
              <Mic className="w-4 h-4" />
            </button>
            {hasAIConfig && (
              <button
                onClick={(e) => { e.stopPropagation(); setShowAIPanel(true); }}
                disabled={uploading || isSubmitting}
                className="p-1.5 text-gray-400 hover:text-blue-500 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-40"
                title="AI 整理"
              >
                <Sparkles className="w-4 h-4" />
              </button>
            )}
            <span className="text-xs text-gray-400 dark:text-gray-500 ml-1">
              Ctrl+Enter 发布
            </span>
          </div>
          <div className={`flex items-center rounded-lg overflow-hidden transition-colors ${
            isTodoMode ? 'bg-emerald-600' : content.trim() ? 'bg-gray-900 dark:bg-gray-100' : 'bg-[#ebebeb] dark:bg-gray-700'
          }`}>
            <button
              onClick={isTodoMode ? handlePublishAsTodo : handleSubmit}
              disabled={!content.trim() || isSubmitting}
              className={`flex items-center gap-1.5 pl-4 pr-2 py-1.5 text-base font-medium transition-colors disabled:cursor-not-allowed ${
                isTodoMode
                  ? 'text-white hover:bg-emerald-700'
                  : content.trim()
                    ? 'text-white dark:text-gray-900'
                    : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              <Send className="w-3.5 h-3.5" />
              {isTodoMode ? '发布待办' : '发布'}
            </button>
            <button
              onClick={() => setIsTodoMode(!isTodoMode)}
              className={`px-1.5 py-1.5 ${
                isTodoMode
                  ? 'text-white'
                  : content.trim()
                    ? 'text-white dark:text-gray-900'
                    : 'text-gray-600 dark:text-gray-400'
              }`}
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* 隐藏的文件选择器 */}
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

      {/* 展开编辑器弹窗 */}
      {showExpandEditor && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40" onClick={() => {
          const expandEl = document.querySelector('[data-expand-textarea]') as HTMLTextAreaElement;
          if (expandEl) {
            setContent(expandEl.value);
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
                  disabled={uploading || isSubmitting}
                  className="p-1.5 text-gray-400 hover:text-blue-500 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-40"
                  title="添加图片"
                >
                  <Image className="w-4 h-4" />
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading || isSubmitting}
                  className="p-1.5 text-gray-400 hover:text-blue-500 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-40"
                  title="添加附件"
                >
                  <Paperclip className="w-4 h-4" />
                </button>
                <button
                  onClick={handleAudioRecord}
                  disabled={uploading || isSubmitting}
                  className={`p-1.5 rounded-lg transition-colors disabled:opacity-40 ${
                    recorder.isRecording
                      ? 'text-red-500 animate-pulse bg-red-50 dark:bg-red-900/20'
                      : 'text-gray-400 hover:text-blue-500 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                  title={recorder.isRecording ? '停止录音' : '录音'}
                >
                  {recorder.isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </button>
                {uploading && <span className="text-xs text-blue-500">上传中...</span>}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const expandEl = document.querySelector('[data-expand-textarea]') as HTMLTextAreaElement;
                    if (expandEl) {
                      setContent(expandEl.value);
                      if (textareaRef.current) textareaRef.current.value = expandEl.value;
                    }
                    activeTextareaRef.current = textareaRef.current;
                    setShowExpandEditor(false);
                    setTimeout(() => handleSubmit(), 0);
                  }}
                  disabled={isSubmitting || !content.trim()}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-white dark:text-gray-900 bg-gray-900 dark:bg-gray-100 hover:bg-gray-700 dark:hover:bg-gray-300 rounded-lg transition-colors disabled:opacity-40"
                >
                  <Send className="w-4 h-4" />
                  <span>发布</span>
                </button>
                <button
                  onClick={() => {
                    const expandEl = document.querySelector('[data-expand-textarea]') as HTMLTextAreaElement;
                    if (expandEl) {
                      setContent(expandEl.value);
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
              defaultValue={textareaRef.current?.value ?? content}
              onFocus={(e) => { activeTextareaRef.current = e.target as HTMLTextAreaElement; }}
              onChange={(e) => {
                const expandEl = e.target as HTMLTextAreaElement;
                const newVal = expandEl.value;
                const cursorPos = expandEl.selectionStart;
                setContent(newVal);
                if (textareaRef.current) textareaRef.current.value = newVal;
                detectTagSearch(newVal, cursorPos, expandEl);
                // 检测 @ 输入或持续搜索
                if (newVal.length > content.length && newVal.charAt(cursorPos - 1) === '@') {
                  setShowMention(true);
                  detectMentionSearch(newVal, cursorPos, expandEl);
                } else if (showMention) {
                  detectMentionSearch(newVal, cursorPos, expandEl);
                }
              }}
              onKeyDown={(e) => {
                const expandEl = e.currentTarget as HTMLTextAreaElement;
                // 标签下拉导航
                if (tagSearch && filteredTags.length > 0) {
                  if (e.key === 'ArrowDown') { e.preventDefault(); setTagDropdownIndex(prev => (prev + 1) % filteredTags.length); return; }
                  if (e.key === 'ArrowUp') { e.preventDefault(); setTagDropdownIndex(prev => (prev - 1 + filteredTags.length) % filteredTags.length); return; }
                  if ((e.key === 'Enter' && !e.nativeEvent.isComposing) || e.key === 'Tab') { e.preventDefault(); insertTag(filteredTags[tagDropdownIndex], expandEl); return; }
                  if (e.key === 'Escape') { e.preventDefault(); setTagSearch(null); return; }
                }
                // 提及下拉导航
                if (showMention && filteredMentionDocs.length > 0) {
                  if (e.key === 'ArrowDown') { e.preventDefault(); setMentionDropdownIndex(prev => (prev + 1) % filteredMentionDocs.length); return; }
                  if (e.key === 'ArrowUp') { e.preventDefault(); setMentionDropdownIndex(prev => (prev - 1 + filteredMentionDocs.length) % filteredMentionDocs.length); return; }
                  if ((e.key === 'Enter' && !e.nativeEvent.isComposing) || e.key === 'Tab') { e.preventDefault(); insertMention(filteredMentionDocs[mentionDropdownIndex], expandEl); return; }
                  if (e.key === 'Escape') { e.preventDefault(); setShowMention(false); setMentionSearchText(''); setMentionStartOffset(null); return; }
                }
                // 列表续行
                if (handleListContinuation(e, expandEl.value, setContent, { current: expandEl })) return;
                // Esc 关闭
                if (e.key === 'Escape' && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  setContent(expandEl.value);
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
                    onMouseDown={(e) => { e.preventDefault(); insertTag(tag, activeTextareaRef.current || undefined); }}
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
            {showMention && filteredMentionDocs.length > 0 && (
              <div className="fixed w-52 z-[10000] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg max-h-48 overflow-y-auto" style={{ top: mentionDropdownPos.top, left: mentionDropdownPos.left }}>
                {filteredMentionDocs.map((doc, i) => (
                  <button
                    key={doc.id}
                    onMouseDown={(e) => { e.preventDefault(); insertMention(doc, activeTextareaRef.current || undefined); }}
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
      )}
      {/* 语音录音卡片 */}
      {showVoiceCard && (
        <VoiceRecordCard
          onClose={() => setShowVoiceCard(false)}
          onSaved={(audioUrl, durationFormatted) => {
            insertAtCursor(`🎙 录音 ${durationFormatted} ![](${audioUrl})`);
            showToast('录音已保存');
          }}
        />
      )}

      {/* AI 对话面板 */}
      {showAIPanel && (
        <AIChatPanel
          context={content}
          onWriteBack={(newContent) => {
            setContent(newContent);
            if (textareaRef.current) textareaRef.current.value = newContent;
          }}
          onClose={() => setShowAIPanel(false)}
        />
      )}
    </div>
  );
}
