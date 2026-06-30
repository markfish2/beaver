import { useState, useEffect } from 'react';
import { AlertTriangle, Cloud, Laptop } from 'lucide-react';
import { onConflict, type ConflictInfo } from '../utils/conflictResolver';
import { updateDocument, updateNode } from '../api/data';
import { useDocuments } from '../context/DocumentContext';

export default function ConflictResolver() {
  const [conflict, setConflict] = useState<ConflictInfo | null>(null);
  const { updateDocumentLocal } = useDocuments();

  useEffect(() => {
    return onConflict((info) => {
      setConflict(info);
    });
  }, []);

  if (!conflict) return null;

  const handleUseServer = () => {
    // Discard local changes, refresh will pick up server version
    setConflict(null);
    window.location.reload();
  };

  const handleUseLocal = async () => {
    try {
      if (conflict.entityType === 'document') {
        const { expected_version, ...rest } = conflict.localData as any;
        await updateDocument(conflict.entityId, { ...rest, expected_version: conflict.serverVersion });
        updateDocumentLocal(conflict.entityId, rest);
      } else if (conflict.entityType === 'node') {
        const { expected_version, ...rest } = conflict.localData as any;
        await updateNode(conflict.entityId, { ...rest, expected_version: conflict.serverVersion });
      }
      setConflict(null);
    } catch (e) {
      console.error('Force update failed:', e);
      setConflict(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6 max-w-md w-full mx-4">
        <div className="flex items-center gap-3 mb-4">
          <AlertTriangle className="w-6 h-6 text-amber-500" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">数据冲突</h3>
        </div>

        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
          此{conflict.entityType === 'document' ? '文档' : '节点'}在其他设备上已被修改，与本地修改冲突。请选择保留哪个版本：
        </p>

        {conflict.serverData?.current_content && (
          <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">云端版本内容：</p>
            <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-3">{conflict.serverData.current_content}</p>
          </div>
        )}
        {conflict.serverData?.current_title && (
          <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">云端版本标题：</p>
            <p className="text-sm text-gray-700 dark:text-gray-300">{conflict.serverData.current_title}</p>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={handleUseServer}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-sm"
          >
            <Cloud className="w-4 h-4" />
            使用云端版本
          </button>
          <button
            onClick={handleUseLocal}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition-colors text-sm"
          >
            <Laptop className="w-4 h-4" />
            使用本地版本
          </button>
        </div>
      </div>
    </div>
  );
}
