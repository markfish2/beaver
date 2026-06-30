import React from 'react';
import type { PendingOperation } from '../utils/saveStateManager';

interface RecoveryDialogProps {
  isOpen: boolean;
  pendingOperations: PendingOperation[];
  onRecover: () => void;
  onDiscard: () => void;
  isRecovering?: boolean;
}

const RecoveryDialog: React.FC<RecoveryDialogProps> = ({
  isOpen,
  pendingOperations,
  onRecover,
  onDiscard,
  isRecovering = false
}) => {
  if (!isOpen) return null;

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return '刚刚';
    if (diffMins < 60) return `${diffMins} 分钟前`;
    if (diffHours < 24) return `${diffHours} 小时前`;
    if (diffDays < 7) return `${diffDays} 天前`;
    
    return date.toLocaleString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getOperationTypeLabel = (data: any) => {
    if (!data || !data.type) return '未知操作';
    
    const typeLabels: Record<string, string> = {
      'updateContent': '更新内容',
      'undoUpdateContent': '撤销更新内容',
      'updateNote': '更新备注',
      'undoUpdateNote': '撤销更新备注',
      'toggleProperty': '切换属性',
      'undoToggleProperty': '撤销切换属性',
      'batchToggleProperty': '批量切换属性',
      'undoBatchToggleProperty': '撤销批量切换属性',
      'moveNode': '移动节点',
      'undoMoveNode': '撤销移动节点',
      'batchMove': '批量移动',
      'undoBatchMove': '撤销批量移动',
      'deleteNode': '删除节点',
      'undoDeleteNode': '撤销删除节点',
      'batchDelete': '批量删除',
      'undoBatchDelete': '撤销批量删除',
      'createNode': '创建节点',
      'undoCreateNode': '撤销创建节点',
      'composite': '复合操作',
      'undoComposite': '撤销复合操作'
    };
    
    return typeLabels[data.type] || '未知操作';
  };

  const getOperationPreview = (data: any) => {
    if (!data) return '';
    
    if (data.newContent !== undefined) {
      return data.newContent.length > 30 
        ? `${data.newContent.substring(0, 30)}...` 
        : data.newContent;
    }
    
    if (data.newNote !== undefined) {
      return data.newNote.length > 30 
        ? `${data.newNote.substring(0, 30)}...` 
        : data.newNote;
    }
    
    if (data.nodeData && data.nodeData.content) {
      return data.nodeData.content.length > 30 
        ? `${data.nodeData.content.substring(0, 30)}...` 
        : data.nodeData.content;
    }
    
    if (data.ids && Array.isArray(data.ids)) {
      return `${data.ids.length} 个节点`;
    }
    
    if (data.updates && Array.isArray(data.updates)) {
      return `${data.updates.length} 个节点`;
    }
    
    if (data.allNodes && Array.isArray(data.allNodes)) {
      return `${data.allNodes.length} 个节点`;
    }
    
    return '';
  };

  const operationCounts = pendingOperations.reduce((acc, op) => {
    const type = op.data?.type || 'unknown';
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[300] animate-in fade-in duration-200">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-lg w-full mx-4 overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <svg 
                className="w-5 h-5 text-amber-600 dark:text-amber-400" 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth={2} 
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" 
                />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                发现未保存的更改
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                上次会话中有 {pendingOperations.length} 个操作未完成保存
              </p>
            </div>
          </div>

          <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4 mb-4 max-h-60 overflow-y-auto custom-scrollbar">
            <div className="space-y-2">
              {Object.entries(operationCounts).map(([type, count]) => (
                <div 
                  key={type}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="text-gray-600 dark:text-gray-400">
                    {getOperationTypeLabel({ type })}
                  </span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {count} 个
                  </span>
                </div>
              ))}
            </div>

            {pendingOperations.length <= 5 && (
              <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">操作详情：</p>
                <div className="space-y-2">
                  {pendingOperations.map((op, index) => (
                    <div 
                      key={op.id}
                      className="text-xs bg-white dark:bg-gray-800 rounded p-2 border border-gray-200 dark:border-gray-700"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-gray-700 dark:text-gray-300">
                          {getOperationTypeLabel(op.data)}
                        </span>
                        <span className="text-gray-400 dark:text-gray-500">
                          {formatTimestamp(op.timestamp)}
                        </span>
                      </div>
                      {getOperationPreview(op.data) && (
                        <p className="text-gray-500 dark:text-gray-400 truncate">
                          {getOperationPreview(op.data)}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onDiscard}
              disabled={isRecovering}
              className="flex-1 px-4 py-2.5 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              放弃更改
            </button>
            <button
              onClick={onRecover}
              disabled={isRecovering}
              className="flex-1 px-4 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isRecovering ? (
                <>
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>恢复中...</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <span>恢复更改</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RecoveryDialog;
