import { useState, useMemo } from 'react';
import { X, ChevronRight, ChevronDown, Folder, FileText } from 'lucide-react';
import { useDocuments } from '../context/DocumentContext';
import { createDocument, createNodesBatch } from '../api/data';
import { parseMemoToNodes } from '../utils/convertMemo';
import type { Document } from '../api/data';

interface MemoToDocDialogProps {
  content: string;
  onClose: () => void;
  onConverted: (docId: string) => void;
}

export default function MemoToDocDialog({ content, onClose, onConverted }: MemoToDocDialogProps) {
  const { documents, refreshDocuments } = useDocuments();
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  const { title, nodes } = useMemo(() => parseMemoToNodes(content), [content]);
  const [editedTitle, setEditedTitle] = useState(title);

  const folders = useMemo(() => documents.filter(d => d.type === 'folder'), [documents]);

  const toggleFolder = (id: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderFolderTree = (parentId: string | null, level: number) => {
    const children = folders.filter(f => f.parent_id === parentId);
    if (children.length === 0) return null;
    return children.map(folder => (
      <div key={folder.id}>
        <button
          onClick={() => setSelectedFolderId(folder.id)}
          className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded text-sm transition-colors ${
            selectedFolderId === folder.id
              ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
              : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
          }`}
          style={{ paddingLeft: `${level * 16 + 8}px` }}
        >
          {folders.some(f => f.parent_id === folder.id) ? (
            <button
              onClick={e => { e.stopPropagation(); toggleFolder(folder.id); }}
              className="p-0.5"
            >
              {expandedFolders.has(folder.id)
                ? <ChevronDown className="w-3.5 h-3.5" />
                : <ChevronRight className="w-3.5 h-3.5" />
              }
            </button>
          ) : (
            <span className="w-4.5" />
          )}
          <Folder className="w-4 h-4 text-yellow-500 shrink-0" />
          <span className="truncate">{folder.title}</span>
        </button>
        {expandedFolders.has(folder.id) && renderFolderTree(folder.id, level + 1)}
      </div>
    ));
  };

  const handleConvert = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const doc = await createDocument(editedTitle || title, 'document', selectedFolderId);
      if (nodes.length > 0) {
        const batchData = nodes.map(n => ({
          document_id: doc.id,
          content: n.content,
          parent_node_id: null as string | null, // will be resolved by tempId mapping
          sort_order: n.sort_order,
          is_todo: n.is_todo,
          is_completed: n.is_completed,
          note: n.note,
          content_type: n.content_type,
          file_path: n.file_path,
          file_name: n.file_name,
        }));
        // Build tempId → index mapping for parent resolution
        const tempIdToIndex = new Map<string, number>();
        nodes.forEach((n, i) => tempIdToIndex.set(n.tempId, i));
        // We need to use createNodesBatch which handles temp_id mapping
        // But the batch API expects string IDs. Let's use single creation with temp IDs
        // Actually, let's just create nodes sequentially for simplicity with parent mapping
        await createNodesBatch(
          nodes.map((n, i) => ({
            id: n.tempId,
            document_id: doc.id,
            content: n.content,
            parent_node_id: n.parentTempId,
            sort_order: n.sort_order,
            is_todo: n.is_todo,
            is_completed: n.is_completed,
            note: n.note,
            content_type: n.content_type,
            file_path: n.file_path,
            file_name: n.file_name,
          }))
        );
      }
      await refreshDocuments();
      onConverted(doc.id);
    } catch (e) {
      console.error('转换失败', e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-[420px] max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200">转换为大纲笔记</h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1.5">文档标题</label>
            <input
              type="text"
              value={editedTitle}
              onChange={e => setEditedTitle(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 dark:text-gray-200"
            />
          </div>

          {/* Folder picker */}
          <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1.5">目标文件夹</label>
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg max-h-48 overflow-y-auto">
              {/* Root option */}
              <button
                onClick={() => setSelectedFolderId(null)}
                className={`w-full flex items-center gap-1.5 px-2 py-1.5 text-sm transition-colors ${
                  selectedFolderId === null
                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                <span className="w-4.5" />
                <FileText className="w-4 h-4 text-gray-400 shrink-0" />
                <span>根目录</span>
              </button>
              {renderFolderTree(null, 0)}
            </div>
          </div>

          {/* Preview */}
          <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1.5">
              预览（{nodes.length} 个节点）
            </label>
            <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-3 max-h-32 overflow-y-auto text-xs text-gray-600 dark:text-gray-400 font-mono whitespace-pre-wrap">
              {nodes.length === 0
                ? '（空笔记）'
                : nodes.slice(0, 10).map(n => {
                    const indent = '  '.repeat(n.parentTempId ? 1 : 0);
                    const prefix = n.is_todo ? (n.is_completed ? '- [x] ' : '- [ ] ') : '- ';
                    return `${indent}${prefix}${n.content}`;
                  }).join('\n') + (nodes.length > 10 ? '\n...' : '')
              }
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleConvert}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? '转换中...' : '确认转换'}
          </button>
        </div>
      </div>
    </div>
  );
}
