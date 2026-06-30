import { useState, useEffect, useCallback } from 'react';
import { RotateCcw, Trash2, Loader2, ListTree, FileText, StickyNote, Folder, PenTool } from 'lucide-react';
import { getTrash, restoreFromTrash, permanentDelete, emptyTrash } from '../api/data';
import type { TrashItem, TrashResponse } from '../api/data';
import { showToast } from '../utils/toast';

const TYPE_LABELS: Record<string, string> = {
  document: '大纲笔记',
  note: '普通笔记',
  folder: '文件夹',
  excalidraw: '画布',
  memo: '随想笔记',
};

const TYPE_ICONS: Record<string, typeof FileText> = {
  document: ListTree,
  note: FileText,
  folder: Folder,
  excalidraw: PenTool,
  memo: StickyNote,
};

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return '刚刚';
  if (diffMins < 60) return `${diffMins} 分钟前`;
  if (diffHours < 24) return `${diffHours} 小时前`;
  if (diffDays < 30) return `${diffDays} 天前`;
  return d.toLocaleDateString('zh-CN');
}

export default function TrashPanel() {
  const [trash, setTrash] = useState<TrashResponse>({ documents: [], memos: [] });
  const [loading, setLoading] = useState(true);
  const [confirmEmpty, setConfirmEmpty] = useState(false);

  const fetchTrash = useCallback(async () => {
    try {
      const data = await getTrash();
      setTrash(data);
    } catch (err) {
      console.error('Failed to fetch trash:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTrash();
  }, [fetchTrash]);

  const handleRestore = async (type: 'document' | 'memo', id: string) => {
    try {
      await restoreFromTrash(type, id);
      showToast('已恢复');
      fetchTrash();
    } catch (err) {
      console.error('Failed to restore:', err);
      showToast('恢复失败', 'error');
    }
  };

  const handlePermanentDelete = async (type: 'document' | 'memo', id: string) => {
    if (!confirm('确定要永久删除吗？此操作不可撤销。')) return;
    try {
      await permanentDelete(type, id);
      showToast('已永久删除');
      fetchTrash();
    } catch (err) {
      console.error('Failed to delete:', err);
      showToast('删除失败', 'error');
    }
  };

  const handleEmpty = async () => {
    try {
      await emptyTrash();
      showToast('回收站已清空');
      setConfirmEmpty(false);
      fetchTrash();
    } catch (err) {
      console.error('Failed to empty trash:', err);
      showToast('清空失败', 'error');
    }
  };

  const allItems = [
    ...trash.documents.map(d => ({ ...d, type: d.type || 'document' })),
    ...trash.memos.map(m => ({ ...m, type: 'memo' })),
  ].sort((a, b) => new Date(b.deleted_at).getTime() - new Date(a.deleted_at).getTime());

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">回收站</h1>
          {allItems.length > 0 && (
            confirmEmpty ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleEmpty}
                  className="px-3 py-1.5 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                >
                  确认清空
                </button>
                <button
                  onClick={() => setConfirmEmpty(false)}
                  className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                >
                  取消
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmEmpty(true)}
                className="px-3 py-1.5 text-sm text-red-600 hover:text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
              >
                清空回收站
              </button>
            )
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : allItems.length === 0 ? (
          <div className="text-center py-12">
            <Trash2 className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400 dark:text-gray-500">回收站为空</p>
          </div>
        ) : (
          <div className="space-y-2">
            {allItems.map(item => {
              const Icon = TYPE_ICONS[item.type] || FileText;
              return (
                <div key={item.id} className="flex items-center justify-between py-3 px-4 bg-gray-50 dark:bg-gray-800 rounded-lg group">
                  <div className="flex items-center gap-3 min-w-0">
                    <Icon className="w-4 h-4 text-gray-400 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm text-gray-800 dark:text-gray-200 truncate">
                        {item.title || (item.content ? item.content.slice(0, 30) : '无标题')}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {TYPE_LABELS[item.type] || item.type} · 删除于 {formatTime(item.deleted_at)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleRestore(item.type === 'memo' ? 'memo' : 'document', item.id)}
                      className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
                      title="恢复"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handlePermanentDelete(item.type === 'memo' ? 'memo' : 'document', item.id)}
                      className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                      title="永久删除"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
