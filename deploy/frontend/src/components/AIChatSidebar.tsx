import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Loader2, FileText, ListTree, StickyNote, PenTool, Plus, Trash2, MessageSquare } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { askAI, getAIConversations, getAIConversation, deleteAIConversation } from '../api/data';

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

interface Conversation {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
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

interface AIChatSidebarProps {
  onNavigate?: (type: string, id: string) => void;
}

export default function AIChatSidebar({ onNavigate }: AIChatSidebarProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingConv, setLoadingConv] = useState(false);
  const [isNewChat, setIsNewChat] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // 加载对话列表
  const fetchConversations = useCallback(async () => {
    try {
      const data = await getAIConversations();
      setConversations(data);
    } catch (e) {
      console.error('获取对话列表失败', e);
    }
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 加载对话消息
  const loadConversation = useCallback(async (convId: string) => {
    setLoadingConv(true);
    try {
      const data = await getAIConversation(convId);
      setActiveConvId(convId);
      setMessages(data.messages || []);
    } catch (e) {
      console.error('加载对话失败', e);
    } finally {
      setLoadingConv(false);
    }
  }, []);

  // 新建对话
  const handleNewConversation = useCallback(() => {
    setActiveConvId(null);
    setMessages([]);
    setIsNewChat(true);
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  // 删除对话
  const handleDeleteConversation = useCallback(async (convId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('确定删除这条对话吗？')) return;
    try {
      await deleteAIConversation(convId);
      setConversations(prev => prev.filter(c => c.id !== convId));
      if (activeConvId === convId) {
        setActiveConvId(null);
        setMessages([]);
      }
    } catch (e) {
      console.error('删除对话失败', e);
    }
  }, [activeConvId]);

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
      let convId = activeConvId;

      for await (const chunk of askAI(newMessages, convId || undefined)) {
        try {
          const data = JSON.parse(chunk);
          if (data.type === 'conversation_id') {
            convId = data.id;
            setActiveConvId(convId);
            // 刷新对话列表
            fetchConversations();
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
  }, [input, messages, loading, activeConvId, fetchConversations]);

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

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return '刚刚';
    if (diffMin < 60) return `${diffMin}分钟前`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour}小时前`;
    const diffDay = Math.floor(diffHour / 24);
    if (diffDay < 7) return `${diffDay}天前`;
    return d.toLocaleDateString('zh-CN');
  };

  // 如果没有激活的对话且不是新建对话状态，显示对话列表
  if (!activeConvId && messages.length === 0 && !isNewChat) {
    return (
      <div className="flex flex-col h-full bg-white dark:bg-gray-900">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-sm font-medium text-gray-800 dark:text-gray-200">AI 问答</h2>
        </div>
        <div className="px-3 py-2">
          <button
            onClick={handleNewConversation}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
          >
            <Plus className="w-4 h-4" />
            新对话
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <div className="text-center py-8">
              <MessageSquare className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
              <p className="text-sm text-gray-400">还没有对话记录</p>
              <p className="text-xs text-gray-300 mt-1">点击"新对话"开始</p>
            </div>
          ) : (
            <div className="px-2">
              {conversations.map(conv => (
                <div
                  key={conv.id}
                  onClick={() => loadConversation(conv.id)}
                  className="flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors group"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800 dark:text-gray-200 truncate">{conv.title || '新对话'}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{formatTime(conv.updated_at)}</p>
                  </div>
                  <button
                    onClick={(e) => handleDeleteConversation(conv.id, e)}
                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors opacity-0 group-hover:opacity-100"
                    title="删除"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // 返回对话列表
  const handleBackToList = useCallback(() => {
    setActiveConvId(null);
    setMessages([]);
    setIsNewChat(false);
    fetchConversations().catch(() => {});
  }, [fetchConversations]);

  // 显示聊天界面
  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center gap-2">
        <button
          onClick={handleBackToList}
          className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
          title="返回列表"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <h2 className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate flex-1">
          {conversations.find(c => c.id === activeConvId)?.title || '新对话'}
        </h2>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {loadingConv ? (
          <div className="text-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400 mx-auto" />
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-gray-400">输入问题开始对话</p>
            <p className="text-xs text-gray-300 mt-1">AI 会基于你的笔记内容回答</p>
          </div>
        ) : null}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-lg px-3 py-2 ${
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
            <div className="bg-gray-100 dark:bg-gray-800 rounded-lg px-3 py-2">
              <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-gray-200 dark:border-gray-700">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入问题..."
            rows={1}
            className="flex-1 resize-none px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg placeholder-gray-400 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-400"
            style={{ maxHeight: 100 }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || loading}
            className="p-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
