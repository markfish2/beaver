import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Loader2, BookmarkPlus, Database, Globe, Wand2, StickyNote, FileText } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import remarkMath from 'remark-math';
import rehypeRaw from 'rehype-raw';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { preserveCodeBlocks } from '../utils/preserveCodeBlocks';
import { askAI, getAIConversation, createMemo, createDocument, createNode, getSkills, Skill } from '../api/data';
import MermaidBlock from './MermaidBlock';
import { useDocuments } from '../context/DocumentContext';
import { useAuth } from '../context/AuthContext';
import { showToast } from '../utils/toast';

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

interface AIChatMainViewProps {
  conversationId: string | null;
  onConversationCreated?: (convId: string) => void;
  onNavigate?: (type: string, id: string) => void;
}

export default function AIChatMainView({ conversationId, onConversationCreated, onNavigate }: AIChatMainViewProps) {
  const { addDocument } = useDocuments();
  const { user } = useAuth();
  const nickname = user?.nickname || user?.username || '';
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingConv, setLoadingConv] = useState(false);
  const [saveMenuIndex, setSaveMenuIndex] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<'data' | 'web'>('data');
  const [skills, setSkills] = useState<Skill[]>([]);
  const [showSkillMenu, setShowSkillMenu] = useState(false);
  const [activeSkill, setActiveSkill] = useState<Skill | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const saveMenuRef = useRef<HTMLDivElement>(null);
  const skillMenuRef = useRef<HTMLDivElement>(null);

  // 加载 skills
  useEffect(() => {
    getSkills().then(setSkills).catch(() => {});
  }, []);

  // 点击外部关闭 skill 菜单
  useEffect(() => {
    if (!showSkillMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (skillMenuRef.current && !skillMenuRef.current.contains(e.target as Node)) {
        setShowSkillMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showSkillMenu]);

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
      await createMemo(content, true);
      setSaveMenuIndex(null);
      showToast('已保存到随想');
      // 跳转到随想首页
      if (onNavigate) onNavigate('memo', '');
    } catch (e) {
      showToast('保存失败：' + (e instanceof Error ? e.message : '未知错误'), 'error');
    } finally {
      setSaving(false);
    }
  }, [onNavigate]);

  // 保存到普通笔记
  const handleSaveToNote = useCallback(async (content: string) => {
    setSaving(true);
    try {
      const title = content.split('\n')[0].slice(0, 50) || 'AI 回复';
      const doc = await createDocument(title, 'note', null, Date.now(), true);
      await createNode(doc.id, content);
      addDocument(doc);
      setSaveMenuIndex(null);
      showToast('已保存到笔记');
      // 跳转到新建的笔记
      if (onNavigate) onNavigate('note', doc.id);
    } catch (e) {
      showToast('保存失败：' + (e instanceof Error ? e.message : '未知错误'), 'error');
    } finally {
      setSaving(false);
    }
  }, [onNavigate, addDocument]);

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

  // 输入清空时重置 textarea 高度
  useEffect(() => {
    if (input === '' && inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
  }, [input]);

  // 发送消息
  const handleSend = useCallback(async () => {
    if (!input.trim() || loading) return;
    // 如果有选中的 skill，将 prompt 拼接到用户消息前面
    const content = activeSkill ? `${activeSkill.prompt}\n\n${input.trim()}` : input.trim();
    const userMsg: Message = { role: 'user', content };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setActiveSkill(null);
    setLoading(true);

    try {
      let assistantContent = '';
      let sources: Source[] = [];
      let convId = conversationId || undefined;

      for await (const chunk of askAI(newMessages, convId, mode)) {
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
  }, [input, messages, loading, conversationId, onConversationCreated, mode, activeSkill]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSend();
    }
  };

  const isEmpty = messages.length === 0 && !loadingConv;

  return (
    <div className={`flex-1 flex flex-col h-full bg-[#FAFAF5] dark:bg-gray-900 ${isEmpty ? 'items-center justify-center' : ''}`}>
      {/* Messages */}
      <div className={`${isEmpty ? 'hidden' : 'flex-1 overflow-y-auto'}`}>
        <div className="max-w-[700px] mx-auto px-4 pb-4 space-y-4" style={{ paddingTop: `max(calc(env(safe-area-inset-top, 0px) + 58px), 1rem)` }}>
        {loadingConv ? (
          <div className="text-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400 mx-auto" />
          </div>
        ) : null}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`px-4 py-3 relative group overflow-hidden ${
              msg.role === 'user'
                ? 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 max-w-[70%]'
                : 'bg-white dark:bg-gray-800/50 border border-[#dad9d4] dark:border-gray-700/40 text-gray-800 dark:text-gray-200'
            }`} style={{ borderRadius: '8px', wordBreak: 'break-word', maxWidth: msg.role === 'user' ? undefined : 'calc(100% - 30px)' }}>
              {msg.role === 'user' ? (
                <div className="text-sm whitespace-pre-wrap">{msg.content}</div>
              ) : (
                <div className="text-sm prose prose-sm dark:prose-invert max-w-none overflow-hidden">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm, remarkBreaks, remarkMath]}
                    rehypePlugins={[rehypeRaw, preserveCodeBlocks, rehypeKatex]}
                    components={{
                      code: (props: any) => {
                        const match = /language-(\w+)/.exec(props.className || '');
                        if (match && match[1] === 'mermaid') {
                          return <MermaidBlock code={String(props.children).replace(/\n$/, '')} />;
                        }
                        return <code {...props} />;
                      },
                      a: ({ href, children, ...props }: any) => {
                        if (href && href.startsWith('/d/')) {
                          return (
                            <a
                              href={href}
                              className="text-blue-600 dark:text-blue-400 underline hover:text-blue-800 dark:hover:text-blue-300 cursor-pointer"
                              onClick={(e) => {
                                e.preventDefault();
                                onNavigate?.('document', href.replace('/d/', ''));
                              }}
                              {...props}
                            >
                              {children}
                            </a>
                          );
                        }
                        return <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 underline" {...props}>{children}</a>;
                      },
                    }}
                  >{msg.content}</ReactMarkdown>
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
              {/* 来源已在回复正文中以内嵌链接形式展示 */}
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
      </div>

      {/* Input */}
      <div className={`px-4 ${isEmpty ? 'w-full' : 'pb-4'}`} style={isEmpty ? {} : { paddingBottom: `max(calc(env(safe-area-inset-bottom, 0px) + 72px), 1rem)` }}>
        <div className={`relative max-w-[700px] mx-auto ${isEmpty ? 'mb-6' : ''}`}>
          {/* 光晕渐变背景 */}
          {isEmpty && (
            <div className="absolute -inset-x-96 -inset-y-64 pointer-events-none" style={{ background: 'radial-gradient(ellipse at center, rgba(186,230,253,0.5) 0%, rgba(224,242,254,0.2) 50%, transparent 70%)' }} />
          )}
          {isEmpty && (
            <p className="relative text-xl text-gray-800 dark:text-gray-200 text-center font-medium mb-6">
              {nickname ? `${nickname}，` : ''}有什么新灵感想聊聊吗？
            </p>
          )}
          <div>
            <div className="relative bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-2xl focus-within:border-gray-400 dark:focus-within:border-gray-500 transition-colors shadow-sm">
            {/* 第一行：模式 + Skill + Skill 标签 */}
            <div className="flex items-center gap-1 px-3 pt-2.5">
              <button
                onClick={() => setMode(mode === 'data' ? 'web' : 'data')}
                className="flex-shrink-0 w-6 h-6 flex items-center justify-center text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                title={mode === 'data' ? '当前：数据模式，点击切换' : '当前：网络模式，点击切换'}
              >
                {mode === 'data' ? <Database className="w-4 h-4" /> : <Globe className="w-4 h-4" />}
              </button>
              <div className="relative flex items-center" ref={skillMenuRef}>
                <button
                  onClick={() => setShowSkillMenu(!showSkillMenu)}
                  className="flex-shrink-0 w-6 h-6 flex items-center justify-center text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                  title="Skills"
                >
                  <Wand2 className="w-4 h-4" />
                </button>
                {showSkillMenu && (
                  <div className="absolute left-0 bottom-full mb-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg py-1.5 min-w-[180px] z-20">
                    {skills.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-gray-400 dark:text-gray-500">
                        暂无 Skill，请将 .md 文件放入 data/skill/ 目录
                      </div>
                    ) : skills.map(skill => (
                      <button
                        key={skill.id}
                        onClick={() => {
                          setActiveSkill(skill);
                          setShowSkillMenu(false);
                          setTimeout(() => inputRef.current?.focus(), 50);
                        }}
                        className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 transition-colors"
                      >
                        <span className="text-base">{skill.icon}</span>
                        <span>{skill.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {activeSkill && (
                <span className="flex-shrink-0 flex items-center gap-1 px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-full">
                  <span>{activeSkill.icon}</span>
                  <span>{activeSkill.name}</span>
                  <button
                    onClick={() => setActiveSkill(null)}
                    className="ml-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                  >
                    ×
                  </button>
                </span>
              )}
            </div>
            {/* 第二行：输入框 + 发送按钮 */}
            <div className="flex items-end px-3 pb-2.5 pt-1">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => {
                  setInput(e.target.value);
                  const el = e.target;
                  el.style.height = 'auto';
                  el.style.height = Math.min(el.scrollHeight, 150) + 'px';
                }}
                onKeyDown={handleKeyDown}
                placeholder={mode === 'data' ? '基于笔记内容回答...' : '输入任何问题...'}
                rows={1}
                className="flex-1 resize-none py-1.5 text-sm bg-transparent placeholder-gray-400 text-gray-800 dark:text-gray-200 focus:outline-none"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || loading}
                className={`flex-shrink-0 ml-2 w-8 h-8 flex items-center justify-center rounded-full transition-colors ${
                  input.trim()
                    ? 'bg-black dark:bg-white text-white dark:text-black hover:bg-gray-800 dark:hover:bg-gray-200'
                    : 'bg-gray-200 dark:bg-gray-600 text-gray-500 dark:text-gray-400'
                } disabled:opacity-30 disabled:cursor-not-allowed`}
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
