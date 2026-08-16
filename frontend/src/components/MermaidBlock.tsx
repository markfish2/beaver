import { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';
import elkLayouts from '@mermaid-js/layout-elk';
import { Maximize2, Minus, Plus, RotateCcw, X } from 'lucide-react';

let initializedTheme: 'dark' | 'default' | null = null;

async function initMermaid(dark?: boolean) {
  const theme = (dark ?? document.documentElement.classList.contains('dark')) ? 'dark' : 'default';
  if (initializedTheme === theme) return;
  await mermaid.registerExternalDiagrams([elkLayouts]);
  mermaid.initialize({
    startOnLoad: false,
    theme,
    securityLevel: 'loose',
    // htmlLabels 是顶层配置（flowchart.htmlLabels 在 v11 已废弃且对节点不生效）。
    // 关闭后节点标签使用原生 SVG 文本，多行自动换行、节点高度自适应，
    // 不会受 Markdown 主题对 p/div 的字体与行高影响而出现文字被裁切。
    htmlLabels: false,
    fontFamily: 'Arial, "Microsoft YaHei", sans-serif',
    flowchart: {
      curve: 'basis',
      nodeSpacing: 50,
      rankSpacing: 80,
      padding: 15,
    },
    themeVariables: theme === 'dark'
      ? {
          primaryColor: '#374151',
          primaryTextColor: '#f3f4f6',
          primaryBorderColor: '#9ca3af',
          lineColor: '#9ca3af',
          secondaryColor: '#4b5563',
          tertiaryColor: '#1f2937',
        }
      : {
          primaryColor: '#f8fafc',
          primaryTextColor: '#374151',
          primaryBorderColor: '#9ca3af',
          lineColor: '#9ca3af',
          secondaryColor: '#f3f4f6',
          tertiaryColor: '#ffffff',
        },
  });
  initializedTheme = theme;
}

interface MermaidBlockProps {
  code: string;
  dark?: boolean;
}

export default function MermaidBlock({ code, dark }: MermaidBlockProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ distance: number; scale: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [svgMarkup, setSvgMarkup] = useState<string | null>(null);
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const viewerContentRef = useRef<HTMLDivElement>(null);
  const svgNaturalSizeRef = useRef<{ width: number; height: number } | null>(null);

  useEffect(() => {
    let cancelled = false;

    const render = async () => {
      try {
        await initMermaid(dark);
        if (!containerRef.current) return;

        // 预处理：修复常见语法问题。普通 flowchart 使用平滑曲线，保留用户明确指定的渲染器。
        const processedCode = code.trim()
          .replace(/<br\s*\/?\s*>/gi, '<br/>')
          .replace(/&(?!amp;|lt;|gt;|quot;|apos;|#)/g, '&amp;');
        const id = `mermaid-${Math.random().toString(36).slice(2, 10)}`;
        const { svg } = await mermaid.render(id, processedCode);
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg;
          setSvgMarkup(svg);
          setScale(1);
          setPan({ x: 0, y: 0 });
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : '渲染失败');
          setSvgMarkup(null);
        }
      }
    };

    void render();
    return () => { cancelled = true; };
  }, [code, dark]);

  useEffect(() => {
    if (!isViewerOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsViewerOpen(false);
    };
    const handleViewerWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      event.stopPropagation();
      setScale((value) => Math.min(3, Math.max(0.5, value * (event.deltaY < 0 ? 1.1 : 0.9))));
    };
    window.addEventListener('keydown', handleKeyDown);
    // 在捕获阶段拦截浏览器默认的页面缩放，确保 Ctrl+滚轮只缩放 Mermaid 图。
    window.addEventListener('wheel', handleViewerWheel, { capture: true, passive: false });
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('wheel', handleViewerWheel, true);
    };
  }, [isViewerOpen]);

  // iOS Safari 会对 CSS transform scale 的 SVG 先栅格化再放大，导致模糊；
  // 改为直接调整 SVG 宽高（矢量按新尺寸重渲染），transform 只用于平移。
  useEffect(() => {
    const svg = viewerContentRef.current?.querySelector('svg');
    if (!isViewerOpen || !svg) {
      svgNaturalSizeRef.current = null;
      return;
    }
    if (!svgNaturalSizeRef.current) {
      const rect = svg.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        svgNaturalSizeRef.current = { width: rect.width, height: rect.height };
      } else {
        return;
      }
    }
    svg.style.setProperty('width', `${svgNaturalSizeRef.current.width * scale}px`, 'important');
    svg.style.setProperty('height', `${svgNaturalSizeRef.current.height * scale}px`, 'important');
  }, [isViewerOpen, scale]);

  if (error) {
    return (
      <div className="my-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-600 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
        <p className="mb-1 font-medium">Mermaid 渲染错误</p>
        <pre className="whitespace-pre-wrap text-[11px]">{error}</pre>
        <pre className="mt-2 whitespace-pre-wrap text-[11px] text-gray-500">{code}</pre>
      </div>
    );
  }

  return (
    <>
      <div className="mermaid-surface group relative my-2 overflow-hidden rounded-xl border border-gray-200/80 p-3 dark:border-gray-700/80">
        <div
          ref={containerRef}
          className="mermaid-diagram flex max-h-none justify-center overflow-auto"
        />
        {svgMarkup && (
          <button
            type="button"
            onClick={() => {
              setScale(1);
              setPan({ x: 0, y: 0 });
              setIsViewerOpen(true);
            }}
            className="absolute right-2 top-2 inline-flex h-4 w-4 items-center justify-center rounded border border-gray-200 bg-white/95 p-0 text-gray-600 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-white/95 dark:text-gray-600 dark:hover:bg-gray-100"
            title="放大查看 Mermaid 图"
            aria-label="放大查看 Mermaid 图"
          >
            <Maximize2 className="h-2 w-2" aria-hidden="true" />
          </button>
        )}
      </div>

      {isViewerOpen && svgMarkup && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-0 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          aria-label="Mermaid 图查看器"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIsViewerOpen(false);
          }}
        >
          <div className="mermaid-surface flex h-screen w-screen min-w-0 flex-col overflow-hidden shadow-2xl">
            <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-3 py-2 dark:border-gray-700">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Mermaid 图</span>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => setScale((value) => Math.max(0.5, value - 0.25))} className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800" title="缩小" aria-label="缩小">
                  <Minus className="h-4 w-4" aria-hidden="true" />
                </button>
                <span className="min-w-12 text-center text-xs tabular-nums text-gray-500 dark:text-gray-400">{Math.round(scale * 100)}%</span>
                <button type="button" onClick={() => setScale((value) => Math.min(3, value + 0.25))} className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800" title="放大" aria-label="放大">
                  <Plus className="h-4 w-4" aria-hidden="true" />
                </button>
                <button type="button" onClick={() => { setScale(1); setPan({ x: 0, y: 0 }); }} className="ml-1 rounded-md p-1.5 text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800" title="恢复大小和位置" aria-label="恢复大小和位置">
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                </button>
                <button type="button" onClick={() => setIsViewerOpen(false)} className="ml-1 rounded-md p-1.5 text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800" title="关闭" aria-label="关闭">
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>
            <div
              className="mermaid-surface min-h-0 flex-1 cursor-grab overflow-auto p-6 select-none active:cursor-grabbing"
              style={{ touchAction: 'none' }}
              onPointerDown={(event) => {
                if (event.button !== 0) return;
                pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
                event.currentTarget.setPointerCapture(event.pointerId);
                if (pointersRef.current.size === 2) {
                  const points = [...pointersRef.current.values()];
                  pinchRef.current = {
                    distance: Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y),
                    scale,
                  };
                  dragRef.current = null;
                  return;
                }
                dragRef.current = {
                  pointerId: event.pointerId,
                  startX: event.clientX,
                  startY: event.clientY,
                  originX: pan.x,
                  originY: pan.y,
                };
              }}
              onPointerMove={(event) => {
                if (pointersRef.current.has(event.pointerId)) {
                  pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
                }
                if (pointersRef.current.size >= 2 && pinchRef.current) {
                  const points = [...pointersRef.current.values()];
                  const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
                  setScale(Math.min(3, Math.max(0.5, pinchRef.current.scale * distance / pinchRef.current.distance)));
                  return;
                }
                const drag = dragRef.current;
                if (!drag || drag.pointerId !== event.pointerId) return;
                setPan({
                  x: drag.originX + event.clientX - drag.startX,
                  y: drag.originY + event.clientY - drag.startY,
                });
              }}
              onPointerUp={(event) => {
                pointersRef.current.delete(event.pointerId);
                if (pointersRef.current.size < 2) pinchRef.current = null;
                if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
                event.currentTarget.releasePointerCapture(event.pointerId);
              }}
              onPointerCancel={(event) => {
                pointersRef.current.delete(event.pointerId);
                pinchRef.current = null;
                if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
                event.currentTarget.releasePointerCapture(event.pointerId);
              }}
            >
              <div
                ref={viewerContentRef}
                className="mermaid-diagram mermaid-viewer-content flex min-h-full min-w-full items-start justify-center"
                style={{
                  transform: `translate3d(${pan.x}px, ${pan.y}px, 0)`,
                }}
                dangerouslySetInnerHTML={{ __html: svgMarkup }}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
