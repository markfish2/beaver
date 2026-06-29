import React, { useRef, useState, useCallback, useEffect, useMemo, Component, Suspense } from 'react';
import type { ReactNode, ErrorInfo } from 'react';
import { Excalidraw, MainMenu, exportToBlob, exportToSvg } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { Download, Image, FileJson, FileText, Loader2 } from 'lucide-react';
import { getExcalidrawDataFresh, updateExcalidrawData, loadExcalidrawFiles, VersionConflictError } from '../api/excalidraw';

// Error boundary to catch Excalidraw rendering errors (React 19 compatibility)
class ExcalidrawErrorBoundary extends Component<
  { children: ReactNode; onRetry: () => void },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode; onRetry: () => void }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Excalidraw render error:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-4 text-gray-500">
          <p>画布加载失败</p>
          <button
            onClick={() => {
              this.setState({ hasError: false });
              this.props.onRetry();
            }}
            className="px-4 py-2 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700"
          >
            重试
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
import { SaveStatusIndicator } from './SaveStatusIndicator';

// 简单的 debounce 实现（带 cancel 方法）
const debounce = <T extends (...args: any[]) => any>(func: T, wait: number) => {
  let timeout: NodeJS.Timeout | null = null;
  const debounced = (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
  debounced.cancel = () => {
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
    }
  };
  return debounced;
};

// 导入 CSS
import "@excalidraw/excalidraw/index.css";

interface ExcalidrawEditorProps {
  documentId: string;
  readOnly?: boolean;
  title?: string;
  onTitleChange?: (newTitle: string) => void;
}

export const ExcalidrawEditor: React.FC<ExcalidrawEditorProps> = ({
  documentId,
  readOnly = false,
  title = '',
  onTitleChange,
}) => {
  const excalidrawRef = useRef<ExcalidrawImperativeAPI>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [initialData, setInitialData] = useState<{ elements: any[]; appState: any; files?: any } | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error' | 'conflict'>('idle');
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [localTitle, setLocalTitle] = useState(title);
  const [isMobile, setIsMobile] = useState(false);
  // 标记是否已加载初始数据
  const hasLoadedInitialData = useRef(false);
  // 版本号（乐观锁）
  const versionRef = useRef<number>(0);
  // documentId ref（避免闭包捕获旧值）
  const documentIdRef = useRef(documentId);
  documentIdRef.current = documentId;
  // saveData ref（用于在 effect 中访问最新的 debounce 函数）
  const saveDataRef = useRef<any>(null);

  // React Router 导航拦截：有未保存数据时弹窗确认
  useEffect(() => {
    const origPush = window.history.pushState;
    const origReplace = window.history.replaceState;

    const intercept = (fn: typeof origPush) => {
      return function (this: History, data: any, unused: string, url?: string | URL | null) {
        if (hasUnsavedChangesRef.current && url) {
          const current = window.location.pathname + window.location.search;
          const next = typeof url === 'string' ? url : url?.toString() || '';
          if (next !== current && !next.startsWith('#')) {
            if (!window.confirm('画布有未保存的更改，确定要离开吗？')) {
              return;
            }
          }
        }
        return fn.call(this, data, unused, url);
      };
    };

    window.history.pushState = intercept(origPush);
    window.history.replaceState = intercept(origReplace);

    return () => {
      window.history.pushState = origPush;
      window.history.replaceState = origReplace;
    };
  }, []);

  // 同步标题
  useEffect(() => {
    setLocalTitle(title);
  }, [title]);

  // 检测移动端
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768 || 'ontouchstart' in window);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // 加载画布数据，设置 initialData 供 Excalidraw 首次渲染
  useEffect(() => {
    let cancelled = false;
    hasLoadedInitialData.current = false;
    setInitialData(null);
    hasFittedContent.current = false;
    filesRef.current = null;
    filesDirtyRef.current = false;
    hasUnsavedChangesRef.current = false;
    savedFingerprintRef.current = '';
    pendingElementsRef.current = null;
    versionRef.current = 0;
    pendingAppStateRef.current = null;
    saveDataRef.current?.cancel?.();

    const loadData = async () => {
      const loadedDocId = documentId;
      try {
        const data = await getExcalidrawDataFresh(loadedDocId);
        if (cancelled || documentIdRef.current !== loadedDocId) return;

        if (data?.scene_data) {
          versionRef.current = data.version || 0;
          const sceneData = JSON.parse(data.scene_data);
          if (sceneData.elements?.length > 0) {
            const { scrollX, scrollY, zoom, ...restAppState } = sceneData.appState || {};

            // 并行加载图片，与场景数据一起传入 initialData
            const files = await loadExcalidrawFiles(loadedDocId);
            if (cancelled || documentIdRef.current !== loadedDocId) return;

            const scenePayload: any = { elements: sceneData.elements, appState: restAppState };
            if (Object.keys(files).length > 0) {
              scenePayload.files = files;
              filesRef.current = files;
            }
            setInitialData(scenePayload);
            savedFingerprintRef.current = fingerprint(sceneData.elements);
            // 延迟重置未保存状态，防止 Excalidraw 加载初始数据时误报
            setTimeout(() => {
              if (!cancelled) {
                hasUnsavedChangesRef.current = false;
                // 更新指纹为 Excalidraw 处理后的元素
                if (excalidrawRef.current) {
                  const els = excalidrawRef.current.getSceneElements();
                  if (els && els.length > 0) {
                    savedFingerprintRef.current = fingerprint(Array.from(els));
                  }
                }
              }
            }, 1000);
          }
        }
      } catch (error) {
        console.error('[Excalidraw] 加载失败:', error);
      } finally {
        if (!cancelled) {
          hasLoadedInitialData.current = true;
          setIsLoading(false);
        }
      }
    };

    loadData();
    return () => { cancelled = true; };
  }, [documentId]);

  // 页面关闭/组件卸载时立即保存未完成的变更
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const elements = pendingElementsRef.current;
      const appState = pendingAppStateRef.current;
      // 有未保存的变更时，弹出确认对话框
      if (hasUnsavedChangesRef.current && elements && elements.length > 0) {
        e.preventDefault();
        e.returnValue = '画布有未保存的更改，确定要离开吗？';
        // 同时尝试保存
        const payload: any = {
          elements,
          appState: { viewBackgroundColor: appState?.viewBackgroundColor, gridSize: appState?.gridSize },
        };
        if (filesDirtyRef.current && filesRef.current) {
          payload.files = filesRef.current;
        }
        const token = localStorage.getItem('token');
        fetch(`/api/excalidraw/${documentIdRef.current}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ scene_data: JSON.stringify(payload), version: versionRef.current }),
          keepalive: true,
        });
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      // 组件卸载时用 fetch keepalive 同步保存（async flushSave 在卸载时无法完成）
      const elements = pendingElementsRef.current;
      const appState = pendingAppStateRef.current;
      if (hasUnsavedChangesRef.current && elements && elements.length > 0) {
        const payload: any = {
          elements,
          appState: { viewBackgroundColor: appState?.viewBackgroundColor, gridSize: appState?.gridSize },
        };
        if (filesDirtyRef.current && filesRef.current) {
          payload.files = filesRef.current;
        }
        const token = localStorage.getItem('token');
        fetch(`/api/excalidraw/${documentIdRef.current}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ scene_data: JSON.stringify(payload), version: versionRef.current }),
          keepalive: true,
        });
      }
    };
  }, [documentId]);

  // 首次加载完成后，自动适配画布内容到视口
  const hasFittedContent = useRef(false);
  useEffect(() => {
    if (!initialData || !excalidrawRef.current || hasFittedContent.current) return;
    hasFittedContent.current = true;
    requestAnimationFrame(() => {
      const api = excalidrawRef.current;
      if (api) {
        const elements = api.getSceneElements();
        if (elements.length > 0) {
          api.scrollToContent(elements, { fitToContent: true, animate: false });
        }
      }
    });
  }, [initialData]);

  // 图片注入：initialData 设置后，将 files 注入已挂载的 Excalidraw
  // Excalidraw 只在 componentDidMount 处理 initialData.files，
  // 但 setInitialData 是异步调用的，此时组件已挂载，需要显式调用 addFiles
  useEffect(() => {
    if (!initialData || !excalidrawRef.current || !filesRef.current) return;
    const files = filesRef.current;
    if (Object.keys(files).length > 0) {
      excalidrawRef.current.addFiles(Object.values(files));
    }
    filesRef.current = null;
  }, [initialData]);

  // 保存锁、files 缓存、待保存数据
  const isSavingRef = useRef(false);
  const saveCompleteRef = useRef<(() => void) | null>(null);
  const filesRef = useRef<any>(null);
  const filesDirtyRef = useRef(false);
  const pendingElementsRef = useRef<any[]>(null);
  const pendingAppStateRef = useRef<any>(null);

  // 立即保存（绕过 debounce，用于页面关闭/组件卸载）
  const flushSave = useCallback(async () => {
    const elements = pendingElementsRef.current;
    const appState = pendingAppStateRef.current;
    if (!elements || elements.length === 0) return;

    // 如果 debounce 正在保存，等待它完成后再检查是否有更新的数据
    if (isSavingRef.current) {
      await new Promise<void>(resolve => { saveCompleteRef.current = resolve; });
      // debounce 完成后，检查是否还有更新的数据需要保存
      if (!pendingElementsRef.current || pendingElementsRef.current.length === 0) return;
      return flushSave(); // 递归：用最新数据再保存一次
    }

    isSavingRef.current = true;
    try {
      const payload: any = {
        elements,
        appState: {
          viewBackgroundColor: appState?.viewBackgroundColor,
          gridSize: appState?.gridSize,
        },
      };
      if (filesDirtyRef.current && filesRef.current) {
        payload.files = filesRef.current;
        filesDirtyRef.current = false;
      }
      const sceneData = JSON.stringify(payload);
      const currentDocId = documentIdRef.current;
      const result = await updateExcalidrawData(currentDocId, sceneData, versionRef.current);
      versionRef.current = result.version || versionRef.current + 1;
      pendingElementsRef.current = null;
      pendingAppStateRef.current = null;
      hasUnsavedChangesRef.current = false;
      savedFingerprintRef.current = fingerprint(elements);
    } catch (error) {
      if (error instanceof VersionConflictError) {
        // 版本冲突：静默重新加载
        await reloadCanvas();
      } else {
        console.error('Flush save failed:', error);
      }
    } finally {
      isSavingRef.current = false;
      // 通知等待者保存完成
      if (saveCompleteRef.current) {
        saveCompleteRef.current();
        saveCompleteRef.current = null;
      }
    }
  }, [documentId]);

  // 重新加载画布数据（版本冲突时使用）
  const reloadCanvas = useCallback(async () => {
    try {
      const data = await getExcalidrawDataFresh(documentId);
      if (data?.scene_data) {
        const sceneData = JSON.parse(data.scene_data);
        versionRef.current = data.version || 0;
        filesDirtyRef.current = false;
        const { scrollX, scrollY, zoom, ...restAppState } = sceneData.appState || {};
        // 用 updateScene 更新已挂载的 Excalidraw
        if (excalidrawRef.current) {
          excalidrawRef.current.updateScene({
            elements: sceneData.elements,
            appState: restAppState,
          });
        }
        // 标记当前元素指纹，防止 updateScene 触发的 onChange 误报为未保存
        savedFingerprintRef.current = fingerprint(sceneData.elements);
        hasUnsavedChangesRef.current = false;
        // 异步加载图片
        const files = await loadExcalidrawFiles(documentId);
        if (Object.keys(files).length > 0) {
          filesRef.current = files;
          if (excalidrawRef.current) {
            excalidrawRef.current.addFiles(Object.values(files));
          }
        }
      }
    } catch (e) {
      console.error('Reload canvas failed:', e);
    }
  }, [documentId]);

  // 未保存数据标记（用于离开拦截）
  const hasUnsavedChangesRef = useRef(false);
  // 上次保存时的 elements 指纹（用于判断是否真正有变化）
  const savedFingerprintRef = useRef<string>('');
  const fingerprint = (els: any[]) => `${els.length}:${els[els.length - 1]?.id || ''}:${els[els.length - 1]?.version || ''}`;

  // 防抖保存
  const saveData = useMemo(
    () =>
      debounce(async (elements: any[], appState: any) => {
        if (!elements || elements.length === 0) return;
        if (isSavingRef.current) return;

        isSavingRef.current = true;
        setSaveStatus('saving');

        // saving 超时保护：30 秒后强制回退到 error
        const savingTimeout = setTimeout(() => {
          if (isSavingRef.current) {
            isSavingRef.current = false;
            setSaveStatus('error');
            setTimeout(() => setSaveStatus('idle'), 5000);
          }
        }, 30000);

        try {
          const payload: any = {
            elements,
            appState: {
              viewBackgroundColor: appState.viewBackgroundColor,
              gridSize: appState.gridSize,
            },
          };
          if (filesDirtyRef.current && filesRef.current) {
            payload.files = filesRef.current;
            filesDirtyRef.current = false;
          }
          const sceneData = JSON.stringify(payload);
          const currentDocId = documentIdRef.current;
          const filesWereSaved = !!payload.files;
          const result = await updateExcalidrawData(currentDocId, sceneData, versionRef.current);
          // 更新本地版本号
          versionRef.current = result.version || versionRef.current + 1;
          // 保存成功，清除待保存标记
          pendingElementsRef.current = null;
          pendingAppStateRef.current = null;
          hasUnsavedChangesRef.current = false;
          savedFingerprintRef.current = fingerprint(elements);
          setSaveStatus('saved');
          setTimeout(() => setSaveStatus('idle'), 2000);
          // 图片保存成功后，将 pending 状态的图片元素更新为 saved
          if (filesWereSaved && excalidrawRef.current) {
            const currentElements = excalidrawRef.current.getSceneElements();
            const updatedElements = currentElements.map((el: any) => {
              if (el.type === 'image' && el.status === 'pending' && el.fileId) {
                return { ...el, status: 'saved' };
              }
              return el;
            });
            const hasChanges = updatedElements.some((el: any, i: number) => el !== currentElements[i]);
            if (hasChanges) {
              excalidrawRef.current.updateScene({ elements: updatedElements });
            }
          }
        } catch (error) {
          if (error instanceof VersionConflictError) {
            // 版本冲突：其他窗口已更新，重新加载最新数据
            console.warn('Version conflict, reloading...');
            setSaveStatus('conflict');
            await reloadCanvas();
            setTimeout(() => setSaveStatus('idle'), 3000);
          } else {
            console.error('Save failed:', error);
            setSaveStatus('error');
            // error 自动恢复：10 秒后回退到 idle
            setTimeout(() => setSaveStatus('idle'), 10000);
          }
        } finally {
          clearTimeout(savingTimeout);
          isSavingRef.current = false;
          if (saveCompleteRef.current) {
            saveCompleteRef.current();
            saveCompleteRef.current = null;
          }
        }
      }, 2000),
    [reloadCanvas]
  );

  // 切换标签页时检查是否有新版本，自动刷新
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.hidden || !hasLoadedInitialData.current) return;
      try {
        const data = await getExcalidrawDataFresh(documentId);
        const serverVersion = data?.version || 0;
        if (serverVersion > versionRef.current) {
          // 有新版本，自动刷新
          setSaveStatus('conflict');
          await reloadCanvas();
          setTimeout(() => setSaveStatus('idle'), 3000);
        }
      } catch {
        // 静默失败，不影响正常使用
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [documentId, reloadCanvas]);

  // 监听变化（用 ref 保存最新的 saveData，避免 Excalidraw 缓存旧回调）
  saveDataRef.current = saveData;
  const flushSaveRef = useRef(flushSave);
  flushSaveRef.current = flushSave;
  const handleChange = useCallback(
    (elements: any[], appState: any, files: any) => {
      if (elements && elements.length > 0) {
        // 记录最新数据（用于页面关闭时立即保存）
        pendingElementsRef.current = elements;
        pendingAppStateRef.current = appState;
        // 只在内容真正变化时标记未保存（避免 Excalidraw 内部渲染触发的 onChange 误报）
        const fp = fingerprint(elements);
        if (fp !== savedFingerprintRef.current) {
          hasUnsavedChangesRef.current = true;
        }
        // 缓存最新的 files，标记为脏
        if (files && Object.keys(files).length > 0) {
          filesRef.current = files;
          filesDirtyRef.current = true;
        }
        saveDataRef.current(elements, appState);
      }
    },
    [isLoading, readOnly, saveData]
  );

  // 导出功能
  const handleExport = async (format: 'png' | 'svg' | 'json') => {
    if (!excalidrawRef.current) return;

    const api = excalidrawRef.current;
    setShowExportMenu(false);

    switch (format) {
      case 'png':
        const pngBlob = await exportToBlob({
          elements: api.getSceneElements(),
          appState: api.getAppState(),
          mimeType: 'image/png',
          quality: 1,
          scale: 2,
        });
        downloadBlob(pngBlob, `canvas-${Date.now()}.png`);
        break;

      case 'svg':
        const svg = await exportToSvg({
          elements: api.getSceneElements(),
          appState: api.getAppState(),
        });
        const svgBlob = new Blob([svg.outerHTML], { type: 'image/svg+xml' });
        downloadBlob(svgBlob, `canvas-${Date.now()}.svg`);
        break;

      case 'json':
        const elements = api.getSceneElements();
        const appState = api.getAppState();
        const jsonData = JSON.stringify({ elements, appState }, null, 2);
        const jsonBlob = new Blob([jsonData], { type: 'application/json' });
        downloadBlob(jsonBlob, `canvas-${Date.now()}.excalidraw`);
        break;
    }
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-gray-100 mx-auto mb-4"></div>
          <p className="text-gray-500 dark:text-gray-400">加载画布中...</p>
        </div>
      </div>
    );
  }

  const handleTitleBlur = () => {
    if (onTitleChange && localTitle !== title) {
      onTitleChange(localTitle);
    }
  };

  return (
    <div className="excalidraw-editor-wrapper" style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }}>
      {/* 标题栏 */}
      <div className="flex items-center gap-3 px-4 py-2 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 shrink-0">
        <input
          type="text"
          value={localTitle}
          onChange={(e) => setLocalTitle(e.target.value)}
          onBlur={handleTitleBlur}
          placeholder="无标题画布"
          className="flex-1 text-lg font-medium text-gray-800 dark:text-gray-100 bg-transparent outline-none border-none placeholder-gray-400 dark:placeholder-gray-500"
          readOnly={readOnly}
        />
        {/* 保存状态 */}
        <SaveStatusIndicator status={saveStatus} />
        {/* 导出按钮 */}
        <div className="relative">
          <button
            onClick={() => setShowExportMenu(!showExportMenu)}
            className="px-3 py-1.5 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 flex items-center gap-2 transition-colors text-sm"
          >
            <Download className="w-4 h-4" />
            <span>导出</span>
          </button>

          {showExportMenu && (
            <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg overflow-hidden z-50">
              <button
                onClick={() => handleExport('png')}
                className="w-full px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 transition-colors"
              >
                <Image className="w-4 h-4" />
                <span>导出为 PNG</span>
              </button>
              <button
                onClick={() => handleExport('svg')}
                className="w-full px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 transition-colors"
              >
                <FileText className="w-4 h-4" />
                <span>导出为 SVG</span>
              </button>
              <button
                onClick={() => handleExport('json')}
                className="w-full px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 transition-colors"
              >
                <FileJson className="w-4 h-4" />
                <span>导出为 JSON</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Excalidraw 编辑器 */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          position: 'relative',
          overflow: 'hidden',
          paddingBottom: isMobile ? 'max(1rem, env(safe-area-inset-bottom))' : undefined,
        }}
      >
        <ExcalidrawErrorBoundary onRetry={() => setInitialData(prev => ({ ...prev }))}>
        <Suspense fallback={<div className="flex-1 flex items-center justify-center text-gray-400"><Loader2 className="w-6 h-6 animate-spin" /></div>}>
        <Excalidraw
          key={documentId}
          ref={excalidrawRef}
          initialData={initialData || undefined}
          onChange={handleChange}
          viewModeEnabled={readOnly}
          theme="light"
          langCode="zh-CN"
          UIOptions={{
            canvasActions: {
              changeViewBackgroundColor: true,
              export: false,
              loadScene: false,
              saveToActiveFile: false,
            },
          }}
        >
          <MainMenu>
            <MainMenu.DefaultItems.ClearCanvas />
            <MainMenu.DefaultItems.Export />
            <MainMenu.DefaultItems.SaveAsImage />
            <MainMenu.Separator />
            <MainMenu.ItemCustom>
              <button
                onClick={() => handleExport('json')}
                className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                导出为 .excalidraw 文件
              </button>
            </MainMenu.ItemCustom>
          </MainMenu>
        </Excalidraw>
        </Suspense>
        </ExcalidrawErrorBoundary>
      </div>
    </div>
  );
};
