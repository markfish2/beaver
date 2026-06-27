import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Check, X, Loader2 } from 'lucide-react';
import { aiChat } from '../api/data';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface AIChatPanelProps {
  /** 编辑框的当前内容，作为 AI 上下文 */
  context: string;
  /** 写回：只传最后一条 AI 回复 */
  onWriteBack: (content: string) => void;
  /** 关闭面板 */
  onClose: () => void;
}

export default function AIChatPanel({ context, onWriteBack, onClose }: AIChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [thinkingTime, setThinkingTime] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const thinkingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  // 清理计时器
  useEffect(() => {
    return () => {
      if (thinkingTimerRef.current) clearInterval(thinkingTimerRef.current);
    };
  }, []);

  const handleSend = useCallback(async () => {
    if (!input.trim() || loading) return;
    const userMsg: Message = { role: 'user', content: input.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setLoading(true);
    setStreamingText('');
    setThinkingTime(0);

    // 启动思考计时器
    thinkingTimerRef.current = setInterval(() => {
      setThinkingTime(prev => prev + 1);
    }, 1000);

    try {
      let fullText = '';
      let firstToken = true;
      for await (const chunk of aiChat(newMessages, context)) {
        if (firstToken) {
          // 收到第一个 token，停止思考计时器
          if (thinkingTimerRef.current) {
            clearInterval(thinkingTimerRef.current);
            thinkingTimerRef.current = null;
          }
          firstToken = false;
        }
        fullText += chunk;
        setStreamingText(fullText);
      }
      setMessages([...newMessages, { role: 'assistant', content: fullText }]);
      setStreamingText('');
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : '请求失败';
      setMessages([...newMessages, { role: 'assistant', content: `❌ ${errMsg}` }]);
      setStreamingText('');
    } finally {
      if (thinkingTimerRef.current) {
        clearInterval(thinkingTimerRef.current);
        thinkingTimerRef.current = null;
      }
      setLoading(false);
      setThinkingTime(0);
    }
  }, [input, loading, messages, context]);

  // 取最后一条 AI 回复，写回编辑框
  const handleWriteBack = useCallback(() => {
    const lastAiMsg = [...messages].reverse().find(m => m.role === 'assistant');
    if (lastAiMsg) {
      onWriteBack(lastAiMsg.content);
    }
    onClose();
  }, [messages, onWriteBack, onClose]);

  // 快捷指令
  const handleQuickAction = useCallback((action: string) => {
    setInput(action);
  }, []);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="flex flex-col w-[90vw] max-w-[680px] h-[75vh] bg-[#FAFAF5] dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* 顶栏 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <span className="text-sm font-medium text-gray-500 dark:text-gray-400">✨ AI 整理</span>
          <div className="flex items-center gap-2">
            <button
              onClick={handleWriteBack}
              disabled={messages.length === 0 || !messages.some(m => m.role === 'assistant')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-white dark:text-gray-900 bg-gray-900 dark:bg-gray-100 hover:bg-gray-700 dark:hover:bg-gray-300 rounded-lg transition-colors disabled:opacity-40"
            >
              <Check className="w-4 h-4" />
              写入
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 当前内容预览 */}
        {context && (
          <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 shrink-0">
            <div className="text-xs text-gray-400 mb-1">当前内容</div>
            <div className="text-sm text-gray-600 dark:text-gray-300 max-h-16 overflow-y-auto whitespace-pre-wrap line-clamp-3">{context}</div>
          </div>
        )}

        {/* 对话区域 */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {messages.length === 0 && (
            <div className="text-center text-sm text-gray-400 py-8 space-y-3">
              <p>让 AI 帮你整理、润色、撰写内容</p>
              <div className="flex flex-col gap-2 items-center">
                {[
                  '帮我润色这段文字',
                  '提取要点，整理成列表',
                  '基于上面的核心观点，寻找相关成熟理论或者常识，整理成300字以内的精炼知识',
                  '寻找上面思考可能的应用场景，整理成300字以内的精炼知识',
                ].map(action => (
                  <button
                    key={action}
                    onClick={() => handleQuickAction(action)}
                    className="px-4 py-2 text-xs bg-white dark:bg-gray-800/50 border border-[#dad9d4] dark:border-gray-700/40 text-gray-500 dark:text-gray-400 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left w-full max-w-md"
                  >
                    {action}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] px-3 py-2 text-sm whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100'
                  : 'bg-white dark:bg-gray-800/50 border border-[#dad9d4] dark:border-gray-700/40 text-gray-800 dark:text-gray-200'
              }`} style={{ borderRadius: '8px' }}>
                {msg.content}
              </div>
            </div>
          ))}
          {/* 思考中提示 */}
          {loading && !streamingText && (
            <div className="flex justify-start">
              <div className="px-3 py-2 text-sm bg-white dark:bg-gray-800/50 border border-[#dad9d4] dark:border-gray-700/40 text-gray-500 dark:text-gray-400 flex items-center gap-2" style={{ borderRadius: '8px' }}>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                思考中：{thinkingTime}s
              </div>
            </div>
          )}
          {/* 流式输出 */}
          {streamingText && (
            <div className="flex justify-start">
              <div className="max-w-[85%] px-3 py-2 text-sm whitespace-pre-wrap bg-white dark:bg-gray-800/50 border border-[#dad9d4] dark:border-gray-700/40 text-gray-800 dark:text-gray-200" style={{ borderRadius: '8px' }}>
                {streamingText}<span className="animate-pulse">▌</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* 输入区 */}
        <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-800 shrink-0">
          <div className="flex gap-2">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.nativeEvent.isComposing && handleSend()}
              placeholder="让 AI 帮你整理、润色..."
              className="flex-1 px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
              disabled={loading}
            />
            <button
              onClick={handleSend}
              disabled={loading || !input.trim()}
              className="p-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-40"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
