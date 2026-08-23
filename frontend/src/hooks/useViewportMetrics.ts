import { useEffect, useRef, useState } from 'react';

export interface ViewportMetrics {
  width: number;
  height: number;
  visualHeight: number;
  keyboardHeight: number;
  keyboardOpen: boolean;
  safeTop: number;
  safeBottom: number;
}

function readMetrics(layoutHeight: number): ViewportMetrics {
  const visualViewport = window.visualViewport;
  const visualHeight = visualViewport?.height ?? window.innerHeight;
  const offsetTop = visualViewport?.offsetTop ?? 0;
  // 部分移动浏览器在键盘出现时会同时缩小 innerHeight 和 visualViewport.height。
  // 使用键盘出现前保存的布局视口高度，避免把键盘误判成普通窗口缩放。
  const keyboardHeight = Math.max(0, layoutHeight - visualHeight - offsetTop);
  const styles = getComputedStyle(document.documentElement);
  const readSafeArea = (name: string) => {
    const value = styles.getPropertyValue(name).trim();
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  return {
    width: window.innerWidth,
    height: window.innerHeight,
    visualHeight,
    keyboardHeight,
    keyboardOpen: keyboardHeight > 50,
    safeTop: readSafeArea('--safe-area-top-px'),
    safeBottom: readSafeArea('--safe-area-bottom-px'),
  };
}

export function useViewportMetrics(): ViewportMetrics {
  const [initialLayoutHeight] = useState(() => window.innerHeight);
  const layoutHeightRef = useRef(initialLayoutHeight);
  const [metrics, setMetrics] = useState<ViewportMetrics>(() => readMetrics(initialLayoutHeight));

  useEffect(() => {
    let frame = 0;
    const update = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        setMetrics(previous => {
          // 先用旧基准计算，确认当前变化不是键盘造成的之后，才更新布局基准。
          // 如果先更新基准，键盘弹出时会把缩小后的视口误记为新基准，导致
          // keyboardOpen 永远为 false；Memo/AI 等没有快捷工具栏的页面尤其明显。
          let next = readMetrics(layoutHeightRef.current);
          if (!next.keyboardOpen && Math.abs(window.innerHeight - layoutHeightRef.current) > 80) {
            layoutHeightRef.current = window.innerHeight;
            next = readMetrics(layoutHeightRef.current);
          }
          return previous.width === next.width
            && previous.height === next.height
            && previous.visualHeight === next.visualHeight
            && previous.keyboardOpen === next.keyboardOpen
            ? previous
            : next;
        });
      });
    };

    const viewport = window.visualViewport;
    update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    viewport?.addEventListener('resize', update);
    viewport?.addEventListener('scroll', update);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
      viewport?.removeEventListener('resize', update);
      viewport?.removeEventListener('scroll', update);
    };
  }, []);

  return metrics;
}
