import { useState, useEffect, useCallback } from 'react';
import { X, Trash2, RotateCcw, AlertTriangle, FileText, ListTree, StickyNote, Folder, PenTool } from 'lucide-react';
import { getTrash, restoreFromTrash, permanentDelete, emptyTrash } from '../api/data';
import type { TrashItem, TrashResponse } from '../api/data';

interface TrashDialogProps {
  onClose: () => void;
  onRestore?: () => void;
}

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

export default function TrashDialog({ onClose, onRestore }: TrashDialogProps) {
  const [trash, setTrash] = useState<TrashResponse>({ documents: [], memos: [] });
  const [loading, setLoading] = useState(true);
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchTrash = useCallback(async () => {
    try {
      const data = await getTrash();
      setTrash(data);
    } catch (e) {
      console.error('Failed to fetch trash', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTrash(); }, [fetchTrash]);

  const handleRestore = async (itemType: 'document' | 'memo', itemId: string) => {
    try {
      await restoreFromTrash(itemType, itemId);
      setTrash(prev => ({
        documents: itemType === 'document' ? prev.documents.filter(d => d.id !== itemId) : prev.documents,
        memos: itemType === 'memo' ? prev.memos.filter(m => m.id !== itemId) : prev.memos,
      }));
      onRestore?.();
    } catch (e) {
      console.error('Failed to restore', e);
    }
  };

  const handlePermanentDelete = async (itemType: 'document' | 'memo', itemId: string) => {
    setDeletingId(itemId);
    try {
      await permanentDelete(itemType, itemId);
      setTrash(prev => ({
        documents: itemType === 'document' ? prev.documents.filter(d => d.id !== itemId) : prev.documents,
        memos: itemType === 'memo' ? prev.memos.filter(m => m.id !== itemId) : prev.memos,
      }));
    } catch (e) {
      console.error('Failed to permanently delete', e);
    } finally {
      setDeletingId(null);
    }
  };

  const handleEmpty = async () => {
    try {
      await emptyTrash();
      setTrash({ documents: [], memos: [] });
      setConfirmEmpty(false);
    } catch (e) {
      console.error('Failed to empty trash', e);
    }
  };

  const allItems: { item: TrashItem; type: 'document' | 'memo' }[] = [
    ...trash.documents.map(d => ({ item: d, type: 'document' as const })),
    ...trash.memos.map(m => ({ item: m, type: 'memo' as const })),
  ].sort((a, b) => new Date(b.item.deleted_at).getTime() - new Date(a.item.deleted_at).getTime());

  const isEmpty = allItems.length === 0;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[80dvh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <div className="flex items-center gap-2">
            <Trash2 className="w-5 h-5 text-gray-500" />
            <span className="text-lg font-semibold text-gray-800 dark:text-gray-200">回收站</span>
            {!isEmpty && <span className="text-sm text-gray-400 ml-1">({allItems.length})</span>}
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-gray-400 text-sm">加载中...</div>
          ) : isEmpty ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <Trash2 className="w-10 h-10 mb-3 text-gray-300 dark:text-gray-600" />
              <p className="text-sm">回收站是空的</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {allItems.map(({ item, type }) => {
                const Icon = TYPE_ICONS[item.type || type] || FileText;
                const label = TYPE_LABELS[item.type || type] || type;
                const title = type === 'memo'
                  ? (item.content || '').slice(0, 60) || '空笔记'
                  : item.title || '无标题';
                return (
                  <div key={`${type}-${item.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                    <Icon className="w-4 h-4 text-gray-400 dark:text-gray-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800 dark:text-gray-200 truncate">{title}</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                        <span className="inline-block px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-[10px] mr-1.5">{label}</span>
                        {formatTime(item.deleted_at)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleRestore(type, item.id)}
                        className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
                        title="恢复"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handlePermanentDelete(type, item.id)}
                        disabled={deletingId === item.id}
                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors disabled:opacity-40"
                        title="彻底删除"
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

        {/* Footer */}
        {!isEmpty && (
          <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-700 shrink-0">
            {confirmEmpty ? (
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                <span className="text-sm text-red-600 dark:text-red-400 flex-1">确定清空？不可恢复！</span>
                <button
                  onClick={() => setConfirmEmpty(false)}
                  className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleEmpty}
                  className="px-3 py-1.5 text-sm text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
                >
                  清空
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmEmpty(true)}
                className="w-full text-sm text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 py-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
              >
                清空回收站
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
