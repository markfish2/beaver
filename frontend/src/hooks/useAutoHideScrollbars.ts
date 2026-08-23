import { useEffect } from 'react';

const SCROLLBAR_SELECTOR = '.scrollbar-auto-hide';
const HIDE_DELAY = 700;

/** 让指定滚动容器只在滚动期间显示竖向滚动条。 */
export function useAutoHideScrollbars(): void {
  useEffect(() => {
    const timers = new Map<HTMLElement, number>();
    const cleanups = new Map<HTMLElement, () => void>();

    const bind = (element: HTMLElement): void => {
      if (cleanups.has(element)) return;

      const handleScroll = (): void => {
        element.classList.add('is-scrolling');
        const previousTimer = timers.get(element);
        if (previousTimer !== undefined) window.clearTimeout(previousTimer);
        const timer = window.setTimeout(() => {
          element.classList.remove('is-scrolling');
          timers.delete(element);
        }, HIDE_DELAY);
        timers.set(element, timer);
      };

      element.addEventListener('scroll', handleScroll, { passive: true });
      cleanups.set(element, () => {
        element.removeEventListener('scroll', handleScroll);
        const timer = timers.get(element);
        if (timer !== undefined) window.clearTimeout(timer);
        element.classList.remove('is-scrolling');
        timers.delete(element);
      });
    };

    const bindAll = (): void => {
      document.querySelectorAll<HTMLElement>(SCROLLBAR_SELECTOR).forEach(bind);
    };

    bindAll();
    const observer = new MutationObserver(bindAll);
    observer.observe(document.documentElement, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      cleanups.forEach(cleanup => cleanup());
      cleanups.clear();
    };
  }, []);
}
