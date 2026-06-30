import { useEffect, useCallback, useRef } from 'react';

interface UseKeyboardScrollOptions {
  enabled?: boolean;
  extraOffset?: number;
}

export const useKeyboardScroll = (options: UseKeyboardScrollOptions = {}) => {
  const { enabled = true, extraOffset = 100 } = options;
  const lastScrollTimeRef = useRef(0);

  const scrollToElement = useCallback((elementId: string, field: 'content' | 'note' = 'content') => {
    if (!enabled) return;

    const element = document.getElementById(`${field}-${elementId}`);
    if (!element) return;

    const now = Date.now();
    if (now - lastScrollTimeRef.current < 100) return;
    lastScrollTimeRef.current = now;

    const isMobile = window.innerWidth < 768;
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
      const scrollTarget = elementTop - safeAreaTop - extraOffset / 2;
      
      window.scrollTo({
        top: window.scrollY + scrollTarget,
        behavior: 'smooth'
      });
    }
  }, [enabled, extraOffset]);

  const handleVisualViewportChange = useCallback(() => {
    const isMobile = window.innerWidth < 768;
    if (!isMobile) return;

    const activeElement = document.activeElement;
    if (!activeElement) return;

    const nodeId = activeElement.id.replace(/^(content|note)-/, '');
    const field = activeElement.id.startsWith('content-') ? 'content' : 'note';
    
    if (nodeId && field) {
      setTimeout(() => {
        scrollToElement(nodeId, field);
      }, 100);
    }
  }, [scrollToElement]);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined' || !window.visualViewport) return;

    const visualViewport = window.visualViewport;
    
    const handleResize = () => {
      handleVisualViewportChange();
    };

    visualViewport.addEventListener('resize', handleResize);
    visualViewport.addEventListener('scroll', handleResize);

    return () => {
      visualViewport.removeEventListener('resize', handleResize);
      visualViewport.removeEventListener('scroll', handleResize);
    };
  }, [enabled, handleVisualViewportChange]);

  return { scrollToElement };
};
