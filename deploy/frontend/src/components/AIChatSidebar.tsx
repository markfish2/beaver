import { useState, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react';
import { Plus, Trash2, MessageSquare } from 'lucide-react';
import { getAIConversations, deleteAIConversation } from '../api/data';
import { useUserView } from '../context/UserViewContext';

interface Conversation {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

interface AIChatSidebarProps {
  onSelectConversation: (convId: string | null) => void;
  activeConvId?: string | null;
}

export interface AIChatSidebarHandle {
  refresh: () => void;
}

const AIChatSidebar = forwardRef<AIChatSidebarHandle, AIChatSidebarProps>(
  ({ onSelectConversation, activeConvId }, ref) => {
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const { convListRefreshTrigger } = useUserView();

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

    // 当外部创建新对话时刷新列表
    useEffect(() => {
      if (convListRefreshTrigger > 0) {
        fetchConversations();
      }
    }, [convListRefreshTrigger, fetchConversations]);

    // 暴露 refresh 方法给父组件
    useImperativeHandle(ref, () => ({
      refresh: fetchConversations,
    }), [fetchConversations]);

    // 删除对话
    const handleDeleteConversation = useCallback(async (convId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if (!window.confirm('确定删除这条对话吗？')) return;
      try {
        await deleteAIConversation(convId);
        setConversations(prev => prev.filter(c => c.id !== convId));
      } catch (e) {
        console.error('删除对话失败', e);
      }
    }, []);

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

    return (
      <div className="flex flex-col h-full bg-[#FAFAF5] dark:bg-gray-800">
        <div className="px-3 py-2">
          <button
            onClick={() => onSelectConversation(null)}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
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
                  onClick={() => onSelectConversation(conv.id)}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition-colors group ${
                    activeConvId === conv.id
                      ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                      : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm truncate ${
                      activeConvId === conv.id
                        ? 'text-blue-700 dark:text-blue-300 font-medium'
                        : 'text-gray-800 dark:text-gray-200'
                    }`}>{conv.title || '新对话'}</p>
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
);

AIChatSidebar.displayName = 'AIChatSidebar';
export default AIChatSidebar;
