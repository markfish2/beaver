import React, { useRef, useState, useCallback, useEffect, useMemo, Component, Suspense } from 'react';
import type { ReactNode, ErrorInfo } from 'react';
import { Excalidraw, MainMenu, exportToBlob, exportToSvg, FONT_FAMILY } from "@excalidraw/excalidraw";
import type { AppState, BinaryFiles, ExcalidrawImperativeAPI, ExcalidrawInitialDataState } from "@excalidraw/excalidraw/types";
import { ChevronLeft, ChevronRight, Download, FileJson, FileText, GripVertical, Image, Loader2, Play, Presentation, StickyNote, Wand2, X } from 'lucide-react';
import { getExcalidrawData, getExcalidrawDataFresh, updateExcalidrawData, loadExcalidrawFiles, VersionConflictError } from '../api/excalidraw';
import NoteEmbedContent from './NoteEmbedContent';
import NotePickerDialog from './NotePickerDialog';
import { usePhoneLayout } from '../hooks/usePhoneLayout';

// 模块级变量存储 Excalidraw API
let _excalidrawApiInstance: ExcalidrawImperativeAPI | null = null;

// 导出图片时给元素四周保留稳定的呼吸空间，避免内容贴住图片边缘。
const CANVAS_EXPORT_PADDING = 100;

const CANVAS_FONT_OPTIONS = [
  { value: FONT_FAMILY.Excalifont, label: 'Excalifont' },
  { value: FONT_FAMILY.Helvetica, label: '系统默认' },
] as const;

const DEFAULT_CANVAS_FONT = FONT_FAMILY.Excalifont;

function normalizeCanvasFont(fontFamily: unknown): AppState['currentItemFontFamily'] {
  return CANVAS_FONT_OPTIONS.some(option => option.value === fontFamily)
    ? fontFamily as AppState['currentItemFontFamily']
    : DEFAULT_CANVAS_FONT;
}

function omitViewportState<T extends Record<string, unknown>>(appState: T): T {
  const result = { ...appState };
  delete result.scrollX;
  delete result.scrollY;
  delete result.zoom;
  return result;
}

function fingerprint(elements: ReadonlyArray<{ id: string; version: number; type?: string; name?: string | null }>): string {
  return elements
    .map(element => `${element.id}:${element.version}:${element.type || ''}:${element.name || ''}`)
    .join('|');
}

interface PresentationSlide {
  frameId: string;
  /** Legacy field retained when loading old scenes; frame.name is authoritative. */
  title?: string;
  order: number;
  visible: boolean;
}

interface PresentationConfig {
  slides: PresentationSlide[];
}

type FrameElement = {
  id: string;
  type: 'frame' | 'magicframe';
  x: number;
  y: number;
  width: number;
  height: number;
  name?: string | null;
};

const isFrameElement = (element: { type?: string; id?: string; isDeleted?: boolean }): element is FrameElement =>
  element.isDeleted !== true &&
  (element.type === 'frame' || element.type === 'magicframe') &&
  typeof element.id === 'string';

const getFrameElements = (elements: ReadonlyArray<{ type?: string; id?: string; isDeleted?: boolean }>): FrameElement[] =>
  elements.filter(isFrameElement);

const sortFramesByPosition = (frames: FrameElement[]) => [...frames].sort((a, b) => a.y - b.y || a.x - b.x);

function normalizePresentation(config: Partial<PresentationConfig> | null | undefined, frames: FrameElement[]): PresentationConfig {
  const frameMap = new Map(frames.map(frame => [frame.id, frame]));
  const configured = Array.isArray(config?.slides) ? config.slides : [];
  const validSlides = configured
    .filter(slide => slide && typeof slide.frameId === 'string' && frameMap.has(slide.frameId))
    .sort((a, b) => a.order - b.order)
    .map((slide, index) => ({
      frameId: slide.frameId,
      order: index + 1,
      visible: slide.visible !== false,
    }));
  const existingIds = new Set(validSlides.map(slide => slide.frameId));
  const missingSlides = sortFramesByPosition(frames)
    .filter(frame => !existingIds.has(frame.id))
    .map((frame, index) => ({
      frameId: frame.id,
      order: validSlides.length + index + 1,
      visible: true,
    }));
  return { slides: [...validSlides, ...missingSlides] };
}

function getFrameTitle(frame: FrameElement, pageIndex: number): string {
  return frame.name?.trim() || `未命名画框 ${pageIndex + 1}`;
}

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
import DocumentTabs from './DocumentTabs';
import EditorActionPortal from './EditorActionPortal';
import type { DocumentTab } from './documentTabTypes';

// 简单的 debounce 实现（带 cancel 方法）
const debounce = <TArgs extends unknown[]>(func: (...args: TArgs) => void, wait: number) => {
  let timeout: NodeJS.Timeout | null = null;
  const debounced = (...args: TArgs) => {
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
  mobileViewOnly?: boolean;
  title?: string;
  documentTabs?: DocumentTab[];
  activeDocumentTabKey?: string | null;
  showDocumentTabs?: boolean;
  isActive?: boolean;
  onDocumentTabSelect?: (tab: DocumentTab) => void;
  onDocumentTabClose?: (tab: DocumentTab) => void;
  onDirtyChange?: (dirty: boolean) => void;
}

export const ExcalidrawEditor: React.FC<ExcalidrawEditorProps> = ({
  documentId,
  readOnly = false,
  mobileViewOnly = false,
  title = '',
  documentTabs = [],
  activeDocumentTabKey = null,
  showDocumentTabs = true,
  isActive: _isActive = true,
  onDocumentTabSelect,
  onDocumentTabClose,
  onDirtyChange,
}) => {
  const excalidrawRef = useRef<ExcalidrawImperativeAPI>(null);
  const [isLoading, setIsLoading] = useState(true);
  type SceneElements = ReturnType<ExcalidrawImperativeAPI['getSceneElements']>;
  type SceneElement = SceneElements[number];
  type SaveData = (elements: SceneElements, appState: AppState) => void;
  type ScenePayload = { elements: SceneElements; appState: Partial<AppState>; files?: BinaryFiles; presentation?: PresentationConfig };

  const [initialData, setInitialData] = useState<ExcalidrawInitialDataState | null>(null);
  // Excalidraw 只在挂载时读取 initialData。文档切换后场景是异步到达的，
  // 用版本号确保新场景到达后重新挂载实例，而不是只更新一个不会再被读取的 prop。
  const [sceneInstanceVersion, setSceneInstanceVersion] = useState(0);
  const [sceneReady, setSceneReady] = useState(false);
  const [mobilePreview, setMobilePreview] = useState<'idle' | 'ready' | 'error'>('idle');
  const mobilePreviewRef = useRef<HTMLDivElement>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error' | 'conflict'>('idle');
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showPresentationPanel, setShowPresentationPanel] = useState(false);
  const [isPresenting, setIsPresenting] = useState(false);
  const [presentationIndex, setPresentationIndex] = useState(0);
  const [presentationSceneVersion, setPresentationSceneVersion] = useState(0);
  const [frameElements, setFrameElements] = useState<FrameElement[]>([]);
  const [presentation, setPresentation] = useState<PresentationConfig>({ slides: [] });
  const [dragOverSlideId, setDragOverSlideId] = useState<string | null>(null);
  const isMobile = usePhoneLayout();
  const [showNotePicker, setShowNotePicker] = useState(false);
  const [canvasFontFamily, setCanvasFontFamily] = useState<AppState['currentItemFontFamily']>(DEFAULT_CANVAS_FONT);
  // 缓存已渲染的笔记引用，避免拖动时每帧重建 React 组件
  const embedCacheRef = useRef<Map<string, React.ReactNode>>(new Map());
  // 标记是否已加载初始数据
  const hasLoadedInitialData = useRef(false);
  // Excalidraw 首次挂载场景时可能触发一次内部 onChange，不应把它当成用户编辑。
  const isHydratingSceneRef = useRef(false);
  // 版本号（乐观锁）
  const versionRef = useRef<number>(0);
  // documentId ref（避免闭包捕获旧值）
  const documentIdRef = useRef(documentId);
  useEffect(() => {
    documentIdRef.current = documentId;
  }, [documentId]);
  // saveData ref（用于在 effect 中访问最新的 debounce 函数）
  const saveDataRef = useRef<SaveData | null>(null);
  const reloadCanvasRef = useRef<() => Promise<void>>(async () => {});

  // renderEmbeddable: 渲染笔记引用
  const renderEmbeddable = useCallback((element: SceneElement) => {
    const link = element.link as string;
    if (!link || !link.startsWith('beaver://')) return null;
    const cacheKey = element.id;
    if (embedCacheRef.current.has(cacheKey)) {
      return embedCacheRef.current.get(cacheKey);
    }
    try {
      const url = new URL(link);
      const noteId = url.pathname.replace(/^\//, '');
      const noteType = url.searchParams.get('type') || 'document';
      const noteTitle = url.searchParams.get('title') || '';
      const node = <NoteEmbedContent noteId={noteId} noteType={noteType} title={noteTitle} />;
      embedCacheRef.current.set(cacheKey, node);
      return node;
    } catch {
      return null;
    }
  }, []);

  // validateEmbeddable: 允许所有链接（禁用 Excalidraw 内置域名验证）
  const validateEmbeddable = useCallback(() => true, []);
  const handleLinkOpen = useCallback((
    element: { link: string | null },
    event: CustomEvent,
  ) => {
    if (element.link?.startsWith('beaver://')) {
      event.preventDefault();
    }
  }, []);

  // 插入笔记引用
  const handleInsertNote = useCallback((doc: { id: string; title: string; type: string }) => {
    setShowNotePicker(false);
    const api = excalidrawRef.current || _excalidrawApiInstance;
    if (!api) return;

    const noteType = doc.type === 'memo' ? 'memo' : doc.type === 'note' ? 'note' : 'document';
    const link = `beaver://note/${doc.id}?type=${noteType}&title=${encodeURIComponent(doc.title || '')}`;

    const appState = api.getAppState();
    const lastPointer = lastCanvasPointerRef.current;
    const centerX = lastPointer?.x ?? ((appState.scrollX || 0) + ((appState.width || 800) / 2));
    const centerY = lastPointer?.y ?? ((appState.scrollY || 0) + ((appState.height || 600) / 2));

    const id = `embeddable_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const width = 320;
    const height = 240;

    const embeddableElement = {
      id,
      type: 'embeddable' as const,
      x: centerX - width / 2,
      y: centerY - height / 2,
      width,
      height,
      link,
      strokeColor: 'transparent',
      backgroundColor: 'transparent',
      fillStyle: 'solid' as const,
      strokeWidth: 1,
      strokeStyle: 'solid' as const,
      roughness: 0 as const,
      opacity: 100,
      angle: 0,
      groupIds: [],
      frameId: null,
      roundness: { type: 3 as const },
      seed: Math.floor(Math.random() * 2000000000),
      version: 1,
      versionNonce: Math.floor(Math.random() * 2000000000),
      index: null,
      isDeleted: false,
      boundElements: null,
      updated: Date.now(),
      locked: false,
      customData: { noteType, noteId: doc.id, title: doc.title },
    };

    const elements = api.getSceneElements();
    api.updateScene({ elements: [...elements, embeddableElement] as unknown as SceneElements });
  }, []);

  // React Router 导航拦截：有未保存数据时弹窗确认
  useEffect(() => {
    const origPush = window.history.pushState;
    const origReplace = window.history.replaceState;

    const intercept = (fn: typeof origPush) => {
      return function (this: History, data: unknown, unused: string, url?: string | URL | null) {
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

  // 加载画布数据，设置 initialData 供 Excalidraw 首次渲染
  useEffect(() => {
    let cancelled = false;
    hasLoadedInitialData.current = false;
    isHydratingSceneRef.current = false;
    setInitialData(null);
    setSceneReady(false);
    hasFittedContent.current = false;
    filesRef.current = null;
    filesDirtyRef.current = false;
    hasUnsavedChangesRef.current = false;
    savedFingerprintRef.current = '';
    savedFontFamilyRef.current = null;
    setCanvasFontFamily(DEFAULT_CANVAS_FONT);
    pendingElementsRef.current = null;
    versionRef.current = 0;
    pendingAppStateRef.current = null;
    sceneElementsRef.current = [];
    frameSignatureRef.current = '';
    setFrameElements([]);
    presentationRef.current = { slides: [] };
    setPresentation({ slides: [] });
    setShowPresentationPanel(false);
    setIsPresenting(false);
    setPresentationSceneVersion(0);
    presentationSceneFingerprintRef.current = '';
    presentationExportCacheRef.current.clear();
    presentationExportInFlightRef.current.clear();
    saveDataRef.current?.cancel?.();

    const loadData = async () => {
      const loadedDocId = documentId;
      try {
        // 首次打开优先复用短期缓存，避免每次切换画布都强制等待网络。
        const data = await getExcalidrawData(loadedDocId);
        if (cancelled || documentIdRef.current !== loadedDocId) return;

        if (data?.scene_data) {
          versionRef.current = data.version || 0;
          const sceneData = JSON.parse(data.scene_data);
          const files = await loadExcalidrawFiles(loadedDocId);
          if (cancelled || documentIdRef.current !== loadedDocId) return;
          const loadedFrames = getFrameElements(sceneData.elements || []);
          const loadedPresentation = normalizePresentation(sceneData.presentation, loadedFrames);
          sceneElementsRef.current = sceneData.elements || [];
          presentationRef.current = loadedPresentation;
          setFrameElements(loadedFrames);
          setPresentation(loadedPresentation);
          const elements = sceneData.elements || [];
          const restAppState = omitViewportState(sceneData.appState || {});
          const loadedFontFamily = normalizeCanvasFont(sceneData.appState?.currentItemFontFamily);
          setCanvasFontFamily(loadedFontFamily);
          savedFontFamilyRef.current = loadedFontFamily;
          const scenePayload = { elements, appState: restAppState, files } as ExcalidrawInitialDataState;
          // 图片、场景和空画布都在实例首次挂载前准备完成，避免切换文档时复用旧场景。
          setInitialData(scenePayload);
          setSceneInstanceVersion(version => version + 1);
          setSceneReady(true);
          setIsLoading(false);
          hasLoadedInitialData.current = true;
          isHydratingSceneRef.current = true;
          savedFingerprintRef.current = fingerprint(elements);
          filesRef.current = files;
        } else {
          setInitialData({ elements: [], appState: {} });
          setSceneInstanceVersion(version => version + 1);
          setSceneReady(true);
        }
      } catch (error) {
        console.error('[Excalidraw] 加载失败:', error);
        if (!cancelled && documentIdRef.current === documentId) {
          setInitialData({ elements: [], appState: {} });
          setSceneInstanceVersion(version => version + 1);
          setSceneReady(true);
        }
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
      if (hasUnsavedChangesRef.current && elements) {
        e.preventDefault();
        e.returnValue = '画布有未保存的更改，确定要离开吗？';
        // 同时尝试保存
        const payload: ScenePayload = {
          elements,
          appState: { viewBackgroundColor: appState?.viewBackgroundColor, gridSize: appState?.gridSize },
          presentation: presentationRef.current,
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
      if (hasUnsavedChangesRef.current && elements) {
        const payload: ScenePayload = {
          elements,
          appState: { viewBackgroundColor: appState?.viewBackgroundColor, gridSize: appState?.gridSize },
          presentation: presentationRef.current,
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
    if (!initialData || hasFittedContent.current) return;
    let cancelled = false;
    let attempts = 0;
    let frameId: number | null = null;

    // initialData 更新与 Excalidraw API/容器尺寸就绪不一定在同一帧。
    // 只在拿到真实元素且画布已有尺寸后标记完成，避免首次调用过早导致仍停留在 100%。
    const fitContent = () => {
      if (cancelled) return;
      const api = excalidrawRef.current;
      const appState = api?.getAppState();
      if (api && appState && appState.width > 0 && appState.height > 0) {
        const elements = api.getSceneElements();
        if (elements.length > 0) {
          api.scrollToContent(elements, { fitToContent: true, animate: false });
          hasFittedContent.current = true;
          return;
        }
      }

      // 场景尚未挂载完成时继续等待少量帧，不让一次过早调用永久阻断适配。
      if (attempts < 30) {
        attempts += 1;
        frameId = requestAnimationFrame(fitContent);
      }
    };

    frameId = requestAnimationFrame(fitContent);
    return () => {
      cancelled = true;
      if (frameId !== null) cancelAnimationFrame(frameId);
    };
  }, [initialData]);

  // 保存锁、files 缓存、待保存数据
  const isSavingRef = useRef(false);
  const saveCompleteRef = useRef<(() => void) | null>(null);
  const filesRef = useRef<BinaryFiles | null>(null);
  const filesDirtyRef = useRef(false);
  const pendingElementsRef = useRef<SceneElements | null>(null);
  const pendingAppStateRef = useRef<AppState | null>(null);
  const presentationRef = useRef<PresentationConfig>({ slides: [] });
  const sceneElementsRef = useRef<SceneElements>([]);
  const frameSignatureRef = useRef('');
  const previousViewportRef = useRef<Partial<AppState> | null>(null);
  const draggedSlideRef = useRef<string | null>(null);
  const touchStartXRef = useRef<number | null>(null);
  const presentationPreviewRef = useRef<HTMLDivElement>(null);
  const presentationSceneFingerprintRef = useRef('');
  const presentationExportCacheRef = useRef(new Map<string, string>());
  const presentationExportInFlightRef = useRef(new Map<string, Promise<string>>());
  // 记录画布上最后一次有效点击的场景坐标，供嵌入笔记引用作为默认落点。
  const lastCanvasPointerRef = useRef<{ x: number; y: number } | null>(null);

  // 移动端只查看画布时生成隔离 SVG，不挂载完整 Excalidraw React UI。
  // SVG 直接挂载到 DOM，避免 iOS/部分 Android WebView 无法解码 Blob SVG。
  // Beaver 笔记引用会先转换为普通矢量卡片，防止导出器渲染成黑色 iframe 占位块。
  useEffect(() => {
    if (!mobileViewOnly || !initialData) return;
    let cancelled = false;
    const previewRoot = mobilePreviewRef.current;
    setMobilePreview('idle');
    previewRoot?.replaceChildren();

    const renderPreview = async () => {
      try {
        const sourceElements = (initialData.elements ?? []).filter(element => !element.isDeleted);
        const elements = sourceElements.flatMap(element => {
          if (element.type !== 'embeddable' || !element.link?.startsWith('beaver://')) {
            return [element];
          }

          let noteTitle = '笔记引用';
          let noteType = '笔记';
          try {
            const url = new URL(element.link);
            noteTitle = url.searchParams.get('title') || element.customData?.title as string || noteTitle;
            const type = url.searchParams.get('type');
            noteType = type === 'memo' ? '随想' : type === 'document' ? '大纲' : '笔记';
          } catch {
            // 链接损坏时仍显示可识别的引用卡片，不中断整张画布。
          }

          const fontSize = Math.max(14, Math.min(24, element.height / 7));
          const card = {
            ...element,
            type: 'rectangle',
            link: null,
            strokeColor: '#94a3b8',
            backgroundColor: '#f8fafc',
            fillStyle: 'solid',
            roughness: 0,
          };
          const label = {
            ...element,
            id: `${element.id}-mobile-label`,
            type: 'text',
            x: element.x + 16,
            y: element.y + 16,
            width: Math.max(1, element.width - 32),
            height: fontSize * 2.6,
            angle: 0,
            link: null,
            strokeColor: '#334155',
            backgroundColor: 'transparent',
            roundness: null,
            boundElements: null,
            containerId: null,
            originalText: `${noteTitle}\n${noteType}`,
            text: `${noteTitle}\n${noteType}`,
            fontSize,
            fontFamily: 5,
            textAlign: 'left',
            verticalAlign: 'top',
            lineHeight: 1.3,
            autoResize: false,
          };
          return [card, label];
        }) as Parameters<typeof exportToSvg>[0]['elements'];

        if (elements.length === 0) {
          setMobilePreview('ready');
          return;
        }
        const svg = await exportToSvg({
          elements,
          appState: {
            ...(initialData.appState ?? {}),
            exportBackground: true,
          },
          files: initialData.files ?? filesRef.current,
          exportPadding: CANVAS_EXPORT_PADDING,
        });
        if (cancelled || !previewRoot) return;
        svg.removeAttribute('width');
        svg.removeAttribute('height');
        svg.setAttribute('role', 'img');
        svg.setAttribute('aria-label', title || '画布预览');
        svg.style.display = 'block';
        svg.style.width = '100%';
        svg.style.height = '100%';
        svg.style.maxWidth = '100%';
        svg.style.maxHeight = '100%';
        previewRoot.replaceChildren(svg);
        setMobilePreview('ready');
      } catch (error) {
        console.error('Mobile canvas preview failed:', error);
        if (!cancelled) setMobilePreview('error');
      }
    };

    void renderPreview();
    return () => {
      cancelled = true;
      previewRoot?.replaceChildren();
    };
  }, [initialData, mobileViewOnly, title]);

  // 立即保存（绕过 debounce，用于页面关闭/组件卸载）
  const flushSave = useCallback(async () => {
    const elements = pendingElementsRef.current;
    const appState = pendingAppStateRef.current;
    if (!elements) return;

    // 如果 debounce 正在保存，等待它完成后再检查是否有更新的数据
    if (isSavingRef.current) {
      await new Promise<void>(resolve => { saveCompleteRef.current = resolve; });
      // debounce 完成后，检查是否还有更新的数据需要保存
      if (!pendingElementsRef.current) return;
      return flushSave(); // 递归：用最新数据再保存一次
    }

    isSavingRef.current = true;
    try {
      const payload: ScenePayload = {
        elements,
        appState: {
          viewBackgroundColor: appState?.viewBackgroundColor,
          gridSize: appState?.gridSize,
          currentItemFontFamily: appState?.currentItemFontFamily,
        },
        presentation: presentationRef.current,
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
      savedFontFamilyRef.current = appState?.currentItemFontFamily ?? null;
    } catch (error) {
      if (error instanceof VersionConflictError) {
        // 版本冲突：静默重新加载
        await reloadCanvasRef.current();
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
  }, []);

  // 重新加载画布数据（版本冲突时使用）
  const reloadCanvas = useCallback(async () => {
    try {
      const data = await getExcalidrawDataFresh(documentId);
      if (data?.scene_data) {
        const sceneData = JSON.parse(data.scene_data);
        versionRef.current = data.version || 0;
        presentationSceneFingerprintRef.current = '';
        presentationExportCacheRef.current.clear();
        const loadedFrames = getFrameElements(sceneData.elements || []);
        const loadedPresentation = normalizePresentation(sceneData.presentation, loadedFrames);
        sceneElementsRef.current = sceneData.elements || [];
        presentationRef.current = loadedPresentation;
        setFrameElements(loadedFrames);
        setPresentation(loadedPresentation);
        filesDirtyRef.current = false;
        const restAppState = omitViewportState(sceneData.appState || {});
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

  useEffect(() => {
    reloadCanvasRef.current = reloadCanvas;
  }, [reloadCanvas]);

  // 未保存数据标记（用于离开拦截）
  const hasUnsavedChangesRef = useRef(false);
  // 上次保存时的 elements 指纹（用于判断是否真正有变化）
  const savedFingerprintRef = useRef<string>('');
  // 画布默认字体属于场景状态，单独记录它以便字体变化但元素未变化时仍能保存。
  const savedFontFamilyRef = useRef<AppState['currentItemFontFamily'] | null>(null);
  // 防抖保存
  const saveData = useMemo(
    () =>
      debounce(async (elements: SceneElements, appState: AppState) => {
        if (!elements) return;
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
          const payload: ScenePayload = {
            elements,
            appState: {
              viewBackgroundColor: appState.viewBackgroundColor,
              gridSize: appState.gridSize,
              currentItemFontFamily: appState.currentItemFontFamily,
            },
            presentation: presentationRef.current,
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
          // 保存成功，更新指纹
          savedFingerprintRef.current = fingerprint(elements);
          savedFontFamilyRef.current = appState.currentItemFontFamily ?? null;
          setSaveStatus('saved');
          setTimeout(() => setSaveStatus('idle'), 2000);
          // 检查保存期间是否有新变更（竞态保护）
          // 如果 pendingElementsRef 已被 handleChange 更新为更新的数据，
          // 说明保存期间有新操作（如插入嵌入引用），需要再保存一次
          const pendingEls = pendingElementsRef.current;
          const pendingAs = pendingAppStateRef.current;
          if (pendingEls && fingerprint(pendingEls) !== fingerprint(elements)) {
            // 有待保存的新数据，立即触发保存
            pendingElementsRef.current = null;
            pendingAppStateRef.current = null;
            hasUnsavedChangesRef.current = true;
            saveDataRef.current(pendingEls, pendingAs || {});
          } else {
            // 没有新变更，正常清除
            pendingElementsRef.current = null;
            pendingAppStateRef.current = null;
            hasUnsavedChangesRef.current = false;
            onDirtyChange?.(false);
          }
          // 图片保存成功后，将 pending 状态的图片元素更新为 saved
          if (filesWereSaved && excalidrawRef.current) {
            const currentElements = excalidrawRef.current.getSceneElements();
            const updatedElements = currentElements.map((el) => {
              if (el.type === 'image' && el.status === 'pending' && el.fileId) {
                return { ...el, status: 'saved' };
              }
              return el;
            });
            const hasChanges = updatedElements.some((el, i: number) => el !== currentElements[i]);
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
    [onDirtyChange, reloadCanvas]
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
  const flushSaveRef = useRef(flushSave);
  useEffect(() => {
    saveDataRef.current = saveData;
    flushSaveRef.current = flushSave;
  }, [saveData, flushSave]);

  const syncPresentationFrames = useCallback((elements: ReadonlyArray<{ type?: string; id?: string; isDeleted?: boolean }>) => {
    const nextFrames = getFrameElements(elements);
    const nextFrameSignature = nextFrames
      .map(frame => `${frame.id}:${frame.x}:${frame.y}:${frame.width}:${frame.height}:${frame.name || ''}`)
      .join('|');
    if (nextFrameSignature === frameSignatureRef.current) return;
    frameSignatureRef.current = nextFrameSignature;
    setFrameElements(nextFrames);
    const nextPresentation = normalizePresentation(presentationRef.current, nextFrames);
    presentationRef.current = nextPresentation;
    setPresentation(nextPresentation);
  }, []);

  // Excalidraw 的 onChange 可能晚于删除操作触发，打开面板时以当前场景校正一次。
  useEffect(() => {
    if (!showPresentationPanel || !excalidrawRef.current) return;
    syncPresentationFrames(excalidrawRef.current.getSceneElements());
  }, [showPresentationPanel, syncPresentationFrames]);

  const handleChange = useCallback(
    (elements: SceneElements, appState: AppState, files: BinaryFiles) => {
      if (elements) {
        sceneElementsRef.current = elements;
        const nextSceneFingerprint = fingerprint(elements);
        if (nextSceneFingerprint !== presentationSceneFingerprintRef.current) {
          presentationSceneFingerprintRef.current = nextSceneFingerprint;
          presentationExportCacheRef.current.clear();
          if (isPresenting || showPresentationPanel) {
            setPresentationSceneVersion(version => version + 1);
          }
        }
        const fp = fingerprint(elements);
        // 初次挂载时 Excalidraw 可能会重新整理元素并触发 onChange。
        // 以整理后的场景作为基线，避免打开画布后立刻出现“未保存”。
        if (isHydratingSceneRef.current) {
          isHydratingSceneRef.current = false;
          savedFingerprintRef.current = fp;
          savedFontFamilyRef.current = appState.currentItemFontFamily ?? null;
          pendingElementsRef.current = null;
          pendingAppStateRef.current = null;
          hasUnsavedChangesRef.current = false;
          syncPresentationFrames(elements);
          onDirtyChange?.(false);
          return;
        }

        // 视口移动、缩放、选择等操作也会触发 onChange，但不会改变 elements。
        // 只有元素真正变化时才进入待保存队列；否则离开页面不应提示保存。
        const fontFamilyChanged = appState.currentItemFontFamily !== savedFontFamilyRef.current;
        if (fp === savedFingerprintRef.current && !fontFamilyChanged) return;

        pendingElementsRef.current = elements;
        pendingAppStateRef.current = appState;
        if (files && Object.keys(files).length > 0) {
          filesRef.current = files;
          filesDirtyRef.current = true;
        }
        hasUnsavedChangesRef.current = true;
        syncPresentationFrames(elements);
        onDirtyChange?.(true);
        saveDataRef.current(elements, appState);
      }
    },
    [isPresenting, onDirtyChange, showPresentationPanel, syncPresentationFrames]
  );

  const handleCanvasFontChange = useCallback((fontFamily: AppState['currentItemFontFamily']) => {
    setCanvasFontFamily(fontFamily);
    const api = excalidrawRef.current;
    if (!api) return;
    const elements = api.getSceneElements();
    const updatedElements = elements.map(element => (
      element.type === 'text'
        ? { ...element, fontFamily }
        : element
    ));
    api.updateScene({
      elements: updatedElements,
      appState: { currentItemFontFamily: fontFamily },
    });
  }, []);

  // 导出功能
  const handleExport = async (format: 'png' | 'svg' | 'json') => {
    if (!excalidrawRef.current) return;

    const api = excalidrawRef.current;
    setShowExportMenu(false);

    switch (format) {
      case 'png': {
        const pngBlob = await exportToBlob({
          elements: api.getSceneElements(),
          appState: api.getAppState(),
          files: api.getFiles(),
          mimeType: 'image/png',
          quality: 1,
          scale: 2,
          exportPadding: CANVAS_EXPORT_PADDING,
        });
        downloadBlob(pngBlob, `canvas-${Date.now()}.png`);
        break;
      }

      case 'svg': {
        const svg = await exportToSvg({
          elements: api.getSceneElements(),
          appState: api.getAppState(),
          files: api.getFiles(),
          exportPadding: CANVAS_EXPORT_PADDING,
        });
        const svgBlob = new Blob([svg.outerHTML], { type: 'image/svg+xml' });
        downloadBlob(svgBlob, `canvas-${Date.now()}.svg`);
        break;
      }

      case 'json': {
        const elements = api.getSceneElements();
        const appState = api.getAppState();
        const jsonData = JSON.stringify({ elements, appState, presentation: presentationRef.current }, null, 2);
        const jsonBlob = new Blob([jsonData], { type: 'application/json' });
        downloadBlob(jsonBlob, `canvas-${Date.now()}.excalidraw`);
        break;
      }
    }
  };

  const availableSlides = useMemo(
    () => presentation.slides.filter(slide => slide.visible && frameElements.some(frame => frame.id === slide.frameId)),
    [presentation.slides, frameElements],
  );

  const focusFrame = useCallback((frameId: string, animate = true) => {
    const api = excalidrawRef.current;
    const frame = frameElements.find(item => item.id === frameId);
    if (!api || !frame) return;
    api.scrollToContent(frame as never, {
      fitToViewport: true,
      viewportZoomFactor: 1,
      canvasOffsets: { top: 0, right: 0, bottom: 0, left: 0 },
      animate,
    });
  }, [frameElements]);

  const queuePresentationSave = useCallback((nextPresentation: PresentationConfig) => {
    presentationRef.current = nextPresentation;
    setPresentation(nextPresentation);
    if (readOnly || !excalidrawRef.current) return;
    const elements = excalidrawRef.current.getSceneElements();
    const appState = excalidrawRef.current.getAppState();
    if (elements.length === 0) return;
    sceneElementsRef.current = elements;
    pendingElementsRef.current = elements;
    pendingAppStateRef.current = appState;
    hasUnsavedChangesRef.current = true;
    saveDataRef.current?.(elements, appState);
  }, [readOnly]);

  const reorderSlides = useCallback((fromFrameId: string, toFrameId: string) => {
    if (readOnly || fromFrameId === toFrameId) return;
    const slides = [...presentationRef.current.slides];
    const fromIndex = slides.findIndex(slide => slide.frameId === fromFrameId);
    const toIndex = slides.findIndex(slide => slide.frameId === toFrameId);
    if (fromIndex < 0 || toIndex < 0) return;
    const [moved] = slides.splice(fromIndex, 1);
    slides.splice(toIndex, 0, moved);
    queuePresentationSave({ slides: slides.map((slide, index) => ({ ...slide, order: index + 1 })) });
  }, [queuePresentationSave, readOnly]);

  const arrangeSlidesByCanvas = useCallback(() => {
    if (readOnly) return;
    const order = new Map(sortFramesByPosition(frameElements).map((frame, index) => [frame.id, index]));
    const slides = [...presentationRef.current.slides].sort((a, b) => (order.get(a.frameId) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.frameId) ?? Number.MAX_SAFE_INTEGER));
    queuePresentationSave({ slides: slides.map((slide, index) => ({ ...slide, order: index + 1 })) });
  }, [frameElements, queuePresentationSave, readOnly]);

  const exitPresentation = useCallback(() => {
    setIsPresenting(false);
    const viewport = previousViewportRef.current;
    if (viewport && excalidrawRef.current) {
      if (viewport.frameRendering) {
        excalidrawRef.current.updateFrameRendering(viewport.frameRendering);
      }
      excalidrawRef.current.updateScene({ appState: viewport });
    }
    previousViewportRef.current = null;
  }, []);

  const startPresentation = useCallback(() => {
    if (availableSlides.length === 0 || !excalidrawRef.current) return;
    const appState = excalidrawRef.current.getAppState();
    previousViewportRef.current = {
      scrollX: appState.scrollX,
      scrollY: appState.scrollY,
      zoom: appState.zoom,
      frameRendering: appState.frameRendering,
    };
    // 保留画框裁剪，隐藏画框线和名称，避免相邻画框内容溢出到当前幻灯片。
    excalidrawRef.current.updateFrameRendering({ enabled: false, outline: false, name: false, clip: true });
    setPresentationIndex(0);
    setShowPresentationPanel(false);
    setIsPresenting(true);
  }, [availableSlides.length]);

  // 播放时只导出当前画框，生成成功前保留上一页，避免翻页失败时出现空白。
  useEffect(() => {
    if (!isPresenting) return;
    const slide = availableSlides[presentationIndex];
    const api = excalidrawRef.current;
    const previewRoot = presentationPreviewRef.current;
    const frame = slide && frameElements.find(item => item.id === slide.frameId);
    if (!api || !previewRoot || !frame) return;

    let cancelled = false;
    const elements = api.getSceneElements();
    const files = api.getFiles();
    const appState = {
      ...api.getAppState(),
      exportBackground: true,
      frameRendering: { enabled: false, outline: false, name: false, clip: true },
    };
    const sceneFingerprint = fingerprint(elements);

    const getCacheKey = (targetFrame: FrameElement) =>
      `${sceneFingerprint}:${targetFrame.id}:${targetFrame.x}:${targetFrame.y}:${targetFrame.width}:${targetFrame.height}`;

    const renderFrameMarkup = (targetFrame: FrameElement, targetIndex: number): Promise<string> => {
      const cacheKey = getCacheKey(targetFrame);
      const cachedMarkup = presentationExportCacheRef.current.get(cacheKey);
      if (cachedMarkup) return Promise.resolve(cachedMarkup);

      const inFlight = presentationExportInFlightRef.current.get(cacheKey);
      if (inFlight) return inFlight;

      const renderPromise = exportToSvg({
        elements,
        appState,
        files,
        exportingFrame: targetFrame as never,
        exportPadding: 0,
        renderEmbeddables: true,
      }).then(svg => {
        svg.setAttribute('role', 'img');
        svg.setAttribute('aria-label', getFrameTitle(targetFrame, targetIndex));
        svg.style.display = 'block';
        svg.style.width = '100%';
        svg.style.height = '100%';
        svg.style.maxWidth = '100%';
        svg.style.maxHeight = '100%';
        const markup = svg.outerHTML;
        presentationExportCacheRef.current.set(cacheKey, markup);
        return markup;
      }).finally(() => {
        presentationExportInFlightRef.current.delete(cacheKey);
      });
      presentationExportInFlightRef.current.set(cacheKey, renderPromise);
      return renderPromise;
    };

    const mountMarkup = (markup: string) => {
      const template = document.createElement('template');
      template.innerHTML = markup;
      const svg = template.content.firstElementChild;
      if (!(svg instanceof SVGSVGElement)) throw new Error('Invalid presentation SVG');
      return svg;
    };

    const renderPreview = async () => {
      try {
        const markup = await renderFrameMarkup(frame, presentationIndex);
        if (cancelled) return;
        previewRoot.replaceChildren(mountMarkup(markup));

        // 单线程预渲染下一页，翻页时直接恢复已生成的 SVG 字符串。
        const nextSlide = availableSlides[presentationIndex + 1];
        const nextFrame = nextSlide && frameElements.find(item => item.id === nextSlide.frameId);
        if (nextFrame) {
          void renderFrameMarkup(nextFrame, presentationIndex + 1).catch(error => {
            console.warn('Presentation next frame pre-render failed:', error);
          });
        }
      } catch (error) {
        console.error('Presentation frame preview failed:', error);
      }
    };
    void renderPreview();
    return () => {
      cancelled = true;
    };
  }, [availableSlides, frameElements, isPresenting, presentationIndex, presentationSceneVersion]);

  useEffect(() => {
    if (!isPresenting) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        exitPresentation();
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        setPresentationIndex(index => Math.max(0, index - 1));
      } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown' || event.key === ' ') {
        event.preventDefault();
        setPresentationIndex(index => Math.min(availableSlides.length - 1, index + 1));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [availableSlides.length, exitPresentation, isPresenting]);

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    // SVG Blob 通常在 click 后仍由浏览器异步读取，不能立即释放 Object URL。
    window.setTimeout(() => {
      URL.revokeObjectURL(url);
      a.remove();
    }, 1000);
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

  if (mobileViewOnly) {
    return (
      <div className="absolute inset-0 flex items-center justify-center overflow-auto bg-white dark:bg-gray-900 p-3">
        <div
          ref={mobilePreviewRef}
          className="absolute inset-3 flex items-center justify-center"
          aria-hidden={mobilePreview !== 'ready'}
        />
        {mobilePreview === 'error' ? (
          <div className="flex flex-col items-center gap-2 px-6 text-center">
            <p className="text-sm text-gray-600 dark:text-gray-300">画布预览生成失败</p>
            <p className="text-xs text-gray-400 dark:text-gray-500">请稍后重试，或在桌面端打开此画布</p>
          </div>
        ) : mobilePreview === 'idle' && initialData?.elements?.length ? (
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        ) : mobilePreview === 'ready' && !initialData?.elements?.length ? (
          <p className="text-sm text-gray-400 dark:text-gray-500">这是一个空画布</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className={`excalidraw-editor-wrapper ${isPresenting ? 'presentation-active' : ''}`} style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }}>
      {/* 标题栏 */}
      <div className="presentation-editor-chrome hidden">
        {showDocumentTabs && onDocumentTabSelect && onDocumentTabClose && documentTabs.length > 1 ? (
          <DocumentTabs
            tabs={documentTabs}
            activeKey={activeDocumentTabKey}
            onSelect={onDocumentTabSelect}
            onClose={onDocumentTabClose}
          />
        ) : documentTabs.length <= 1 || showDocumentTabs ? (
          <span className="min-w-0 flex-1 truncate text-lg font-medium text-gray-800 dark:text-gray-100">{title || '无标题画布'}</span>
        ) : <span className="min-w-0 flex-1" />}
        <EditorActionPortal>
        <div className="flex items-center gap-2">
        <button
          onClick={() => setShowPresentationPanel(value => !value)}
          disabled={frameElements.length === 0}
          className="editor-topbar-button disabled:cursor-not-allowed disabled:opacity-40"
          title={frameElements.length === 0 ? '请先创建画框' : '管理幻灯片'}
        >
          <Presentation className="w-4 h-4" />
          <span className="hidden md:inline">幻灯片</span>
        </button>
        {/* 导出按钮 */}
        <div className="relative">
          <button
            onClick={() => setShowExportMenu(!showExportMenu)}
            className="editor-topbar-button"
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
        {/* 保存状态：与大纲笔记一致，固定在顶部操作区最右侧 */}
        <SaveStatusIndicator borderless status={saveStatus} />
        </div>
        </EditorActionPortal>
      </div>

      {showPresentationPanel && !isPresenting && (
        <div className="absolute right-3 top-[52px] z-30 flex w-[min(360px,calc(100vw-24px))] max-h-[calc(100%-64px)] flex-col overflow-hidden rounded-xl border border-gray-200 bg-white/95 shadow-xl backdrop-blur dark:border-gray-700 dark:bg-gray-900/95">
          <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2.5 dark:border-gray-700">
            <div>
              <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">幻灯片</h2>
              <p className="text-xs text-gray-400">拖动左侧手柄调整播放顺序</p>
            </div>
            <button onClick={() => { setShowPresentationPanel(false); setDragOverSlideId(null); }} className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200" title="关闭">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {presentation.slides.map((slide, index) => {
              const frame = frameElements.find(item => item.id === slide.frameId);
              if (!frame) return null;
              return (
                <div
                  key={slide.frameId}
                  draggable={!readOnly}
                  onDragStart={() => { draggedSlideRef.current = slide.frameId; setDragOverSlideId(null); }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = 'move';
                    if (draggedSlideRef.current !== slide.frameId) setDragOverSlideId(slide.frameId);
                  }}
                  onDrop={() => {
                    if (draggedSlideRef.current) reorderSlides(draggedSlideRef.current, slide.frameId);
                    draggedSlideRef.current = null;
                    setDragOverSlideId(null);
                  }}
                  onDragEnd={() => { draggedSlideRef.current = null; setDragOverSlideId(null); }}
                  className={`relative mb-1 flex items-center gap-1 rounded-lg border p-1 ${
                    dragOverSlideId === slide.frameId && draggedSlideRef.current !== slide.frameId
                      ? 'border-blue-400 bg-blue-50/70 dark:border-blue-500 dark:bg-blue-950/30'
                      : 'border-transparent hover:border-gray-200 hover:bg-gray-50 dark:hover:border-gray-700 dark:hover:bg-gray-800/70'
                  }`}
                >
                  {dragOverSlideId === slide.frameId && draggedSlideRef.current !== slide.frameId && (
                    <span className="pointer-events-none absolute -top-2 left-8 z-10 rounded bg-blue-600 px-1.5 py-0.5 text-[10px] font-medium text-white shadow-sm">
                      放置到此处
                    </span>
                  )}
                  <button
                    disabled={readOnly}
                    className="cursor-grab rounded p-1 text-gray-400 hover:bg-gray-200 active:cursor-grabbing dark:hover:bg-gray-700 disabled:cursor-default"
                    title="拖动排序"
                  >
                    <GripVertical className="h-4 w-4" />
                  </button>
                  <button onClick={() => { focusFrame(slide.frameId); setShowPresentationPanel(false); }} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-gray-100 text-xs font-semibold tabular-nums text-gray-500 dark:bg-gray-800 dark:text-gray-400">{String(index + 1).padStart(2, '0')}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-gray-700 dark:text-gray-200">{getFrameTitle(frame, index)}</span>
                      <span className="block truncate text-[11px] text-gray-400">{Math.round(frame.width)} × {Math.round(frame.height)}</span>
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-gray-200 p-2 dark:border-gray-700">
            {!readOnly && (
              <button onClick={arrangeSlidesByCanvas} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800" title="按画框在画布中的位置排序">
                <Wand2 className="h-3.5 w-3.5" />
                自动排序
              </button>
            )}
            <button onClick={startPresentation} disabled={availableSlides.length === 0} className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-40">
              <Play className="h-3.5 w-3.5" />
              播放
            </button>
          </div>
        </div>
      )}

      {/* Excalidraw 编辑器 */}
      <div
        className="excalidraw-canvas-container"
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
        {sceneReady && initialData ? <Excalidraw
          key={`${documentId}-${sceneInstanceVersion}`}
          excalidrawAPI={(api) => {
            excalidrawRef.current = api;
            _excalidrawApiInstance = api;
          }}
          initialData={initialData || undefined}
          onChange={readOnly ? undefined : handleChange}
          viewModeEnabled={readOnly}
          theme="light"
          langCode="zh-CN"
          validateEmbeddable={validateEmbeddable}
          renderEmbeddable={renderEmbeddable}
          onLinkOpen={handleLinkOpen}
          onPointerDown={(_activeTool, pointerDownState) => {
            lastCanvasPointerRef.current = { ...pointerDownState.origin };
          }}
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
            <MainMenu.ItemCustom>
              <button
                onClick={() => setShowNotePicker(true)}
                className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-2"
              >
                <StickyNote className="w-4 h-4" />
                嵌入笔记引用
              </button>
            </MainMenu.ItemCustom>
            <MainMenu.ItemCustom>
              <label className="flex w-full items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="flex items-center gap-2">
                  <span className="inline-flex h-4 w-4 items-center justify-center text-xs font-semibold">A</span>
                  画布字体
                </span>
                <select
                  value={canvasFontFamily}
                  onChange={event => {
                    const fontFamily = Number(event.target.value) as AppState['currentItemFontFamily'];
                    handleCanvasFontChange(fontFamily);
                  }}
                  onClick={event => event.stopPropagation()}
                  className="max-w-[120px] rounded border border-gray-200 bg-white px-1.5 py-1 text-xs text-gray-700 outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
                  aria-label="画布字体"
                >
                  {CANVAS_FONT_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
            </MainMenu.ItemCustom>
            <MainMenu.Separator />
            <MainMenu.DefaultItems.ClearCanvas />
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
        </Excalidraw> : <div className="flex h-full items-center justify-center text-gray-400"><Loader2 className="h-6 w-6 animate-spin" /></div>}
        </Suspense>
        </ExcalidrawErrorBoundary>
      </div>

      {isPresenting && availableSlides.length > 0 && (
        <div
          className="presentation-stage absolute inset-0 z-40 flex flex-col text-white"
          onTouchStart={event => { touchStartXRef.current = event.touches[0]?.clientX ?? null; }}
          onTouchEnd={event => {
            const startX = touchStartXRef.current;
            const endX = event.changedTouches[0]?.clientX;
            touchStartXRef.current = null;
            if (startX === null || endX === undefined || Math.abs(endX - startX) < 48) return;
            setPresentationIndex(index => endX < startX ? Math.min(availableSlides.length - 1, index + 1) : Math.max(0, index - 1));
          }}
        >
          <div ref={presentationPreviewRef} className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center" aria-hidden="true" />
          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between px-4 pt-4">
            <span className="presentation-chip pointer-events-auto max-w-[30vw] truncate px-3 py-1.5 text-sm font-medium">
              {title.trim() || '无标题画布'}
            </span>
            <span className="presentation-chip pointer-events-auto absolute left-1/2 max-w-[40vw] -translate-x-1/2 truncate px-4 py-1.5 text-sm font-medium">
              {availableSlides[presentationIndex] && getFrameTitle(
                frameElements.find(frame => frame.id === availableSlides[presentationIndex].frameId)!,
                presentationIndex,
              )}
            </span>
            <button onClick={exitPresentation} className="presentation-chip pointer-events-auto rounded-full p-1" title="退出播放（Esc）">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="min-h-0 flex-1" />
          <div className="presentation-chip presentation-controls pointer-events-auto absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-full px-1 py-1">
            <button onClick={() => setPresentationIndex(index => Math.max(0, index - 1))} disabled={presentationIndex === 0} className="rounded-full p-1 text-zinc-800 hover:bg-black/10 disabled:text-zinc-400" title="上一页">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <span className="min-w-12 px-1 text-center text-xs tabular-nums text-zinc-800/80">{presentationIndex + 1} / {availableSlides.length}</span>
            <button onClick={() => setPresentationIndex(index => Math.min(availableSlides.length - 1, index + 1))} disabled={presentationIndex === availableSlides.length - 1} className="rounded-full p-1 text-zinc-800 hover:bg-black/10 disabled:text-zinc-400" title="下一页">
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      <NotePickerDialog
        key={`${documentId}-${showNotePicker}`}
        isOpen={showNotePicker}
        onSelect={handleInsertNote}
        onClose={() => setShowNotePicker(false)}
      />
    </div>
  );
};
