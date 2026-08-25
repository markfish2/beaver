import { useEffect, useCallback, useRef } from 'react';
import { isPhoneLayout } from '../utils/deviceLayout';

interface UseKeyboardScrollOptions {
  enabled?: boolean;
  extraOffset?: number;
}

export const useKeyboardScroll = (options: UseKeyboardScrollOptions = {}) => {
  const { enabled = true, extraOffset = 100 } = options;
  const lastScrollTimeRef = useRef(0);
  const viewportScrollTimerRef = useRef<number | null>(null);

  const scrollToElement = useCallback((elementId: string, field: 'content' | 'note' = 'content') => {
    if (!enabled) return;

    const element = document.getElementById(`${field}-${elementId}`);
    if (!element) return;

    const now = Date.now();
    if (now - lastScrollTimeRef.current < 100) return;
    lastScrollTimeRef.current = now;

    const isMobile = isPhoneLayout();
    if (!isMobile) return;

    const rect = element.getBoundingClientRect();
    const viewportHeight = window.visualViewport?.height || window.innerHeight;

    const safeAreaTop = 60;
    const safeAreaBottom = extraOffset;
    
    const elementTop = rect.top;
    const elementBottom = rect.bottom;
    
    const visibleTop = safeAreaTop;
    const visibleBottom = viewportHeight - safeAreaBottom;
    
    if (elementTop < visibleTop || elementBottom > visibleBottom) {
      // 让浏览器选择真正承载内容的滚动容器，而不是只滚动 window。
      // 日记和大纲在移动端都使用内部 overflow-y-auto 容器。
      element.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'nearest',
      });
    }
  }, [enabled, extraOffset]);

  const handleVisualViewportChange = useCallback(() => {
    const isMobile = isPhoneLayout();
    if (!isMobile) return;

    const activeElement = document.activeElement;
    if (!activeElement) return;

    const nodeId = activeElement.id.replace(/^(content|note)-/, '');
    const field = activeElement.id.startsWith('content-') ? 'content' : 'note';
    
    if (nodeId && field) {
      scrollToElement(nodeId, field);
    }
  }, [scrollToElement]);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined' || !window.visualViewport) return;

    const visualViewport = window.visualViewport;
    
    const handleResize = () => {
      // visualViewport 在键盘动画期间会连续发出事件，只保留最后一次，
      // 避免重复测量布局并排队多个 scrollIntoView。
      if (viewportScrollTimerRef.current !== null) {
        window.clearTimeout(viewportScrollTimerRef.current);
      }
      viewportScrollTimerRef.current = window.setTimeout(() => {
        viewportScrollTimerRef.current = null;
        handleVisualViewportChange();
      }, 100);
    };

    visualViewport.addEventListener('resize', handleResize);
    visualViewport.addEventListener('scroll', handleResize);

    return () => {
      visualViewport.removeEventListener('resize', handleResize);
      visualViewport.removeEventListener('scroll', handleResize);
      if (viewportScrollTimerRef.current !== null) {
        window.clearTimeout(viewportScrollTimerRef.current);
        viewportScrollTimerRef.current = null;
      }
    };
  }, [enabled, handleVisualViewportChange]);

  return { scrollToElement };
};
