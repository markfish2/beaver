import { useEffect, useRef, useState } from 'react';

interface ScrollSnapshot {
  target: EventTarget | null;
  top: number;
}

type ScrollEdge = 'top' | 'bottom' | null;

/**
 * 控制移动端顶部/底部应用栏的显隐。
 * 监听捕获阶段的 scroll，是因为移动端页面由多个内部滚动容器组成，
 * scroll 事件不会冒泡到 window。
 */
export function useMobileScrollChrome(disabled = false, keyboardOpen = false): boolean {
  const [hidden, setHidden] = useState(false);
  const snapshotRef = useRef<ScrollSnapshot>({ target: null, top: 0 });
  const accumulatedRef = useRef(0);
  const frameRef = useRef<number | null>(null);
  const pendingRef = useRef(false);
  const edgeRef = useRef<ScrollEdge>(null);

  useEffect(() => {
    if (disabled) {
      return;
    }

    const reset = () => {
      snapshotRef.current = { target: null, top: 0 };
      accumulatedRef.current = 0;
      pendingRef.current = false;
      edgeRef.current = null;
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      setHidden(false);
    };

    reset();

    const handleScroll = (event: Event) => {
      // 键盘打开/关闭会改变 visual viewport，但不应改变应用栏的滚动状态。
      if (keyboardOpen) return;

      const target = event.target;
      const element = target instanceof HTMLElement ? target : null;
      const top = element ? element.scrollTop : window.scrollY;
      const maxTop = element
        ? Math.max(0, element.scrollHeight - element.clientHeight)
        : Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      const previous = snapshotRef.current;

      // 短内容没有真实滚动空间时，浏览器仍可能在触摸回弹过程中派发
      // scroll 事件。此时不能把手势方向当成页面滚动，否则顶部栏会被
      // 隐藏后无法通过“向下滚动”恢复。
      if (maxTop <= 2) {
        snapshotRef.current = { target, top };
        accumulatedRef.current = 0;
        edgeRef.current = null;
        setHidden(false);
        return;
      }

      if (previous.target !== target) {
        snapshotRef.current = { target, top };
        accumulatedRef.current = 0;
        edgeRef.current = null;
        return;
      }

      const delta = top - previous.top;
      snapshotRef.current = { target, top };
      if (Math.abs(delta) < 1) return;

      // 移动端到达滚动边界时可能产生回弹事件。锁住边界附近的方向，
      // 避免顶部栏和底部 Tab 在底部来回闪烁；离开边界 18px 后再恢复检测。
      if (edgeRef.current === 'bottom') {
        // 在底部向下反向滑动时页面无法继续滚动，但这是明确的“返回顶部栏”
        // 手势，必须立即恢复顶部/底部应用栏。
        if (delta < 0) {
          edgeRef.current = null;
          accumulatedRef.current = 0;
          setHidden(false);
          return;
        }
        if (maxTop - top <= 18) return;
        edgeRef.current = null;
        accumulatedRef.current = 0;
        return;
      }
      if (edgeRef.current === 'top') {
        if (top <= 18) return;
        edgeRef.current = null;
        accumulatedRef.current = 0;
        return;
      }
      if (maxTop > 0 && top >= maxTop - 2) {
        edgeRef.current = 'bottom';
        accumulatedRef.current = 0;
        return;
      }
      if (top <= 2) {
        edgeRef.current = 'top';
        accumulatedRef.current = 0;
        return;
      }

      accumulatedRef.current += delta;
      if (Math.abs(accumulatedRef.current) < 14) return;

      const shouldHide = accumulatedRef.current > 0;
      accumulatedRef.current = 0;

      if (pendingRef.current) return;
      pendingRef.current = true;
      frameRef.current = window.requestAnimationFrame(() => {
        pendingRef.current = false;
        frameRef.current = null;
        setHidden(current => current === shouldHide ? current : shouldHide);
      });
    };

    document.addEventListener('scroll', handleScroll, { capture: true, passive: true });
    return () => {
      document.removeEventListener('scroll', handleScroll, true);
      reset();
    };
  }, [disabled, keyboardOpen]);

  return hidden && !keyboardOpen;
}
