import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Cloud, CloudOff, Loader2, Check, X, RefreshCw } from 'lucide-react';
import { clsx } from 'clsx';

type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error' | 'offline' | 'conflict';

interface PendingOperation {
  id: string;
  type: string;
  timestamp: Date;
  error?: string;
}

interface SaveStatusIndicatorProps {
  status: SaveStatus;
  pendingCount?: number;
  pendingOperations?: PendingOperation[];
  offlineQueueCount?: number;
  onRetry?: () => void;
  onRetryOperation?: (operationId: string) => void;
  onStatusChange?: (status: SaveStatus) => void;
}

export const SaveStatusIndicator: React.FC<SaveStatusIndicatorProps> = ({
  status: externalStatus,
  pendingCount = 0,
  pendingOperations = [],
  offlineQueueCount = 0,
  onRetry,
  onRetryOperation,
  onStatusChange
}) => {
  const [showPanel, setShowPanel] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const prevStatusRef = useRef<SaveStatus>(externalStatus);
  const animationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const savedTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [animationState, setAnimationState] = useState<'idle' | 'animating'>('idle');

  const currentStatus = useMemo(() => {
    return externalStatus;
  }, [externalStatus]);

  useEffect(() => {
    const handleAnimation = () => {
      if (externalStatus !== prevStatusRef.current) {
        setAnimationState('animating');
        animationTimeoutRef.current = setTimeout(() => {
          setAnimationState('idle');
        }, 300);
        prevStatusRef.current = externalStatus;
      }
    };

    handleAnimation();

    return () => {
      if (animationTimeoutRef.current) {
        clearTimeout(animationTimeoutRef.current);
      }
    };
  }, [externalStatus]);

  useEffect(() => {
    if (externalStatus === 'saved' && onStatusChange) {
      savedTimeoutRef.current = setTimeout(() => {
        onStatusChange('idle');
      }, 2000);
    }

    return () => {
      if (savedTimeoutRef.current) {
        clearTimeout(savedTimeoutRef.current);
      }
    };
  }, [externalStatus, onStatusChange]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setShowPanel(false);
      }
    };

    if (showPanel) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showPanel]);

  const getIcon = useCallback(() => {
    switch (currentStatus) {
      case 'saving':
        return <Loader2 className="w-4 h-4 animate-spin text-blue-500" />;
      case 'pending':
        return (
          <div className="relative inline-flex">
            <Cloud className="w-5 h-5 text-yellow-500" />
            <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-yellow-500 rounded-full shadow-sm" />
          </div>
        );
      case 'saved':
        return (
          <div className="relative inline-flex">
            <Cloud className="w-5 h-5 text-green-500" />
            <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-green-500 rounded-full flex items-center justify-center shadow-sm">
              <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />
            </div>
          </div>
        );
      case 'error':
        return (
          <div className="relative inline-flex">
            <Cloud className="w-5 h-5 text-red-500" />
            <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-red-500 rounded-full flex items-center justify-center shadow-sm">
              <X className="w-2.5 h-2.5 text-white" strokeWidth={3} />
            </div>
          </div>
        );
      case 'conflict':
        return <RefreshCw className="w-4 h-4 animate-spin text-orange-500" />;
      case 'offline':
        return (
          <div className="relative inline-flex">
            <CloudOff className="w-5 h-5 text-gray-400 dark:text-gray-500" />
            <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-red-500 rounded-full flex items-center justify-center shadow-sm">
              <X className="w-2.5 h-2.5 text-white" strokeWidth={3} />
            </div>
          </div>
        );
      case 'idle':
      default:
        return (
          <div className="relative inline-flex">
            <Cloud className="w-5 h-5 text-gray-400 dark:text-gray-500" />
            <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-green-500 rounded-full flex items-center justify-center shadow-sm">
              <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />
            </div>
          </div>
        );
    }
  }, [currentStatus]);

  const getTooltip = useCallback(() => {
    switch (currentStatus) {
      case 'saving':
        return '正在同步...';
      case 'pending':
        return pendingCount > 0 ? `${pendingCount} 个操作待同步` : '有未保存的更改';
      case 'saved':
        return '已同步';
      case 'error':
        return '同步失败，点击重试';
      case 'conflict':
        return '检测到新版本，正在刷新...';
      case 'offline':
        return offlineQueueCount > 0 
          ? `离线模式，${offlineQueueCount} 个操作待同步` 
          : '离线模式，更改将在恢复连接后同步';
      case 'idle':
      default:
        return '已同步';
    }
  }, [currentStatus, pendingCount, offlineQueueCount]);

  const getStatusColor = useCallback(() => {
    switch (currentStatus) {
      case 'saving':
        return 'border-blue-300 dark:border-blue-600 bg-blue-50/50 dark:bg-blue-900/20';
      case 'pending':
        return 'border-yellow-300 dark:border-yellow-600 bg-yellow-50/50 dark:bg-yellow-900/20';
      case 'saved':
        return 'border-green-300 dark:border-green-600 bg-green-50/50 dark:bg-green-900/20';
      case 'error':
        return 'border-red-300 dark:border-red-600 bg-red-50/50 dark:bg-red-900/20';
      case 'conflict':
        return 'border-orange-300 dark:border-orange-600 bg-orange-50/50 dark:bg-orange-900/20';
      case 'offline':
        return 'border-gray-300 dark:border-gray-600 bg-gray-50/50 dark:bg-gray-800/50';
      default:
        return 'border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-gray-800/80';
    }
  }, [currentStatus]);

  const handleClick = useCallback(() => {
    if (currentStatus === 'error' && onRetry) {
      onRetry();
    } else {
      setShowPanel(!showPanel);
    }
  }, [currentStatus, onRetry, showPanel]);

  const formatTime = useCallback((date: Date) => {
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (diff < 60) return '刚刚';
    if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
    return date.toLocaleDateString();
  }, []);

  const getOperationLabel = useCallback((type: string) => {
    const labels: Record<string, string> = {
      'update': '更新节点',
      'create': '创建节点',
      'delete': '删除节点',
      'move': '移动节点',
      'style': '修改样式',
      'note': '更新备注'
    };
    return labels[type] || type;
  }, []);

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={handleClick}
        className={clsx(
          'flex items-center justify-center w-8 h-8 rounded-md backdrop-blur-sm shadow-sm border transition-all duration-300 cursor-pointer hover:scale-105',
          getStatusColor(),
          animationState === 'animating' && 'animate-pulse'
        )}
        title={getTooltip()}
      >
        <div className={clsx(
          'transition-opacity duration-300',
          animationState === 'animating' ? 'opacity-0' : 'opacity-100'
        )}>
          {getIcon()}
        </div>
        {pendingCount > 0 && currentStatus === 'pending' && (
          <div className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-yellow-500 text-white text-xs font-bold rounded-full flex items-center justify-center px-1 shadow-md animate-bounce">
            {pendingCount}
          </div>
        )}
        {offlineQueueCount > 0 && currentStatus === 'offline' && (
          <div className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center px-1 shadow-md">
            {offlineQueueCount}
          </div>
        )}
      </button>

      {showPanel && (
        <div className="absolute top-full right-0 mt-2 w-72 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="p-3 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">同步状态</h3>
              <button
                onClick={() => setShowPanel(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="p-3">
            <div className="flex items-center gap-2 mb-3">
              {getIcon()}
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {getTooltip()}
              </span>
            </div>

            {pendingCount > 0 && (
              <div className="mb-3 p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded-md border border-yellow-200 dark:border-yellow-700">
                <p className="text-xs text-yellow-800 dark:text-yellow-200">
                  {pendingCount} 个操作待同步
                </p>
              </div>
            )}

            {offlineQueueCount > 0 && currentStatus === 'offline' && (
              <div className="mb-3 p-2 bg-red-50 dark:bg-red-900/20 rounded-md border border-red-200 dark:border-red-700">
                <p className="text-xs text-red-800 dark:text-red-200">
                  离线模式：{offlineQueueCount} 个操作将在恢复连接后自动同步
                </p>
              </div>
            )}

            {pendingOperations.length > 0 && (
              <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  待同步操作
                </p>
                {pendingOperations.map((op) => (
                  <div
                    key={op.id}
                    className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700/50 rounded text-xs"
                  >
                    <div className="flex-1">
                      <p className="font-medium text-gray-700 dark:text-gray-300">
                        {getOperationLabel(op.type)}
                      </p>
                      <p className="text-gray-500 dark:text-gray-400">
                        {formatTime(new Date(op.timestamp))}
                      </p>
                      {op.error && (
                        <p className="text-red-500 text-xs mt-1">{op.error}</p>
                      )}
                    </div>
                    {currentStatus === 'error' && onRetryOperation && (
                      <button
                        onClick={() => onRetryOperation(op.id)}
                        className="ml-2 p-1 text-blue-500 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded"
                        title="重试此操作"
                      >
                        <RefreshCw className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {currentStatus === 'error' && onRetry && (
              <button
                onClick={onRetry}
                className="mt-3 w-full flex items-center justify-center gap-2 px-3 py-2 bg-red-500 hover:bg-red-600 text-white text-sm font-medium rounded-md transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                重试所有操作
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
