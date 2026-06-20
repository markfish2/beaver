import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Loader2, FileText, ListTree, StickyNote, PenTool, BookmarkPlus } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { askAI, getAIConversation, createMemo, createDocument, createNode } from '../api/data';

interface Source {
  id: string;
  title: string;
  type: 'document' | 'memo' | 'note' | 'excalidraw';
  snippet: string;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  sources?: Source[];
}

const TYPE_ICONS: Record<string, typeof FileText> = {
  document: ListTree,
  note: FileText,
  memo: StickyNote,
  excalidraw: PenTool,
};

const TYPE_LABELS: Record<string, string> = {
  document: '大纲笔记',
  note: '普通笔记',
  memo: '随想',
  excalidraw: '画布',
};

interface AIChatMainViewProps {
  conversationId: string | null;
  onConversationCreated?: (convId: string) => void;
  onNavigate?: (type: string, id: string) => void;
}

export default function AIChatMainView({ conversationId, onConversationCreated, onNavigate }: AIChatMainViewProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingConv, setLoadingConv] = useState(false);
  const [saveMenuIndex, setSaveMenuIndex] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const saveMenuRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭保存菜单
  useEffect(() => {
    if (saveMenuIndex === null) return;
    const handleClick = (e: MouseEvent) => {
      if (saveMenuRef.current && !saveMenuRef.current.contains(e.target as Node)) {
        setSaveMenuIndex(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [saveMenuIndex]);

  // 保存到随想
  const handleSaveToMemo = useCallback(async (content: string) => {
    setSaving(true);
    try {
      await createMemo(content);
      setSaveMenuIndex(null);
      alert('已保存到随想');
    } catch (e) {
      alert('保存失败：' + (e instanceof Error ? e.message : '未知错误'));
    } finally {
      setSaving(false);
    }
  }, []);

  // 保存到普通笔记
  const handleSaveToNote = useCallback(async (content: string) => {
    setSaving(true);
    try {
      const title = content.split('\n')[0].slice(0, 50) || 'AI 回复';
      const doc = await createDocument(title, 'note');
      await createNode(doc.id, content);
      setSaveMenuIndex(null);
      if (onNavigate) onNavigate('note', doc.id);
    } catch (e) {
      alert('保存失败：' + (e instanceof Error ? e.message : '未知错误'));
    } finally {
      setSaving(false);
    }
  }, [onNavigate]);

  // 加载已有对话消息
  useEffect(() => {
    if (!conversationId) {
      setMessages([]);
      setTimeout(() => inputRef.current?.focus(), 100);
      return;
    }
    let cancelled = false;
    setLoadingConv(true);
    getAIConversation(conversationId)
      .then(data => {
        if (!cancelled) setMessages(data.messages || []);
      })
      .catch(e => console.error('加载对话失败', e))
      .finally(() => { if (!cancelled) setLoadingConv(false); });
    return () => { cancelled = true; };
  }, [conversationId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 发送消息
  const handleSend = useCallback(async () => {
    if (!input.trim() || loading) return;
    const userMsg: Message = { role: 'user', content: input.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setLoading(true);

    try {
      let assistantContent = '';
      let sources: Source[] = [];
      let convId = conversationId || undefined;

      for await (const chunk of askAI(newMessages, convId)) {
        try {
          const data = JSON.parse(chunk);
          if (data.type === 'conversation_id') {
            convId = data.id;
            onConversationCreated?.(convId);
          } else if (data.type === 'sources') {
            sources = data.sources;
          } else if (data.type === 'content') {
            assistantContent += data.content;
            setMessages(prev => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last?.role === 'assistant') {
                updated[updated.length - 1] = { ...last, content: assistantContent };
              } else {
                updated.push({ role: 'assistant', content: assistantContent, sources });
              }
              return updated;
            });
          } else if (data.type === 'error') {
            assistantContent += data.content;
            setMessages(prev => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last?.role === 'assistant') {
                updated[updated.length - 1] = { ...last, content: assistantContent };
              } else {
                updated.push({ role: 'assistant', content: assistantContent });
              }
              return updated;
            });
          }
        } catch {
          assistantContent += chunk;
          setMessages(prev => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last?.role === 'assistant') {
              updated[updated.length - 1] = { ...last, content: assistantContent };
            } else {
              updated.push({ role: 'assistant', content: assistantContent });
            }
            return updated;
          });
        }
      }

      // 设置来源
      if (sources.length > 0) {
        setMessages(prev => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role === 'assistant') {
            updated[updated.length - 1] = { ...last, sources };
          }
          return updated;
        });
      }
    } catch (e) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `请求失败：${e instanceof Error ? e.message : '未知错误'}`,
      }]);
    } finally {
      setLoading(false);
    }
  }, [input, messages, loading, conversationId, onConversationCreated]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSourceClick = (source: Source) => {
    if (onNavigate) {
      onNavigate(source.type, source.id);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-white dark:bg-gray-900">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {loadingConv ? (
          <div className="text-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400 mx-auto" />
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-lg text-gray-400">输入问题开始对话</p>
            <p className="text-sm text-gray-300 mt-2">AI 会基于你的笔记内容回答</p>
          </div>
        ) : null}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[70%] rounded-lg px-4 py-3 relative group ${
              msg.role === 'user'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200'
            }`}>
              {msg.role === 'user' ? (
                <div className="text-sm whitespace-pre-wrap">{msg.content}</div>
              ) : (
                <div className="text-sm prose prose-sm dark:prose-invert max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{msg.content}</ReactMarkdown>
                </div>
              )}
              {msg.role === 'assistant' && msg.content && !msg.content.startsWith('请求失败') && (
                <div className="flex justify-end mt-1.5 relative" ref={saveMenuIndex === i ? saveMenuRef : undefined}>
                  <button
                    onClick={(e) => { e.stopPropagation(); setSaveMenuIndex(saveMenuIndex === i ? null : i); }}
                    className="p-1 text-gray-400 hover:text-blue-500 rounded transition-colors"
                    title="保存"
                  >
                    <BookmarkPlus className="w-3.5 h-3.5" />
                  </button>
                  {saveMenuIndex === i && (
                    <div className="absolute right-0 bottom-full mb-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 min-w-[120px] z-10">
                      <button
                        onClick={() => handleSaveToMemo(msg.content)}
                        disabled={saving}
                        className="w-full px-3 py-1.5 text-left text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 transition-colors"
                      >
                        <StickyNote className="w-3.5 h-3.5" />
                        保存到随想
                      </button>
                      <button
                        onClick={() => handleSaveToNote(msg.content)}
                        disabled={saving}
                        className="w-full px-3 py-1.5 text-left text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 transition-colors"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        保存到笔记
                      </button>
                    </div>
                  )}
                </div>
              )}
              {msg.sources && msg.sources.length > 0 && (
                <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                  <p className="text-xs text-gray-400 mb-1">来源：</p>
                  <div className="space-y-1">
                    {msg.sources.map((source, j) => {
                      const Icon = TYPE_ICONS[source.type] || FileText;
                      return (
                        <button
                          key={j}
                          onClick={() => handleSourceClick(source)}
                          className="flex items-center gap-1.5 w-full text-left px-2 py-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                        >
                          <Icon className="w-3 h-3 text-gray-400 shrink-0" />
                          <span className="text-xs text-gray-600 dark:text-gray-300 truncate">{source.title}</span>
                          <span className="text-[10px] text-gray-400 shrink-0">{TYPE_LABELS[source.type]}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && messages[messages.length - 1]?.role !== 'assistant' && (
          <div className="flex justify-start">
            <div className="bg-gray-100 dark:bg-gray-800 rounded-lg px-4 py-3">
              <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-gray-200 dark:border-gray-700">
        <div className="flex items-end gap-2 max-w-3xl mx-auto">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入问题..."
            rows={1}
            className="flex-1 resize-none px-4 py-3 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg placeholder-gray-400 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-400"
            style={{ maxHeight: 120 }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || loading}
            className="p-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
