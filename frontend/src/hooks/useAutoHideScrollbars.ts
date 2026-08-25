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

    const bindDescendants = (root: Node): void => {
      if (root.nodeType !== Node.ELEMENT_NODE) return;
      const element = root as HTMLElement;
      if (element.matches(SCROLLBAR_SELECTOR)) bind(element);
      element.querySelectorAll<HTMLElement>(SCROLLBAR_SELECTOR).forEach(bind);
    };

    document.querySelectorAll<HTMLElement>(SCROLLBAR_SELECTOR).forEach(bind);
    const observer = new MutationObserver((records) => {
      // 页面中 Mermaid/编辑器等组件更新时，不再反复扫描整个 document，
      // 只处理这批 mutation 新增的节点，避免滚动条 hook 变成全局热路径。
      for (const record of records) {
        record.addedNodes.forEach(bindDescendants);
      }

      // 移除组件后释放其定时器和监听，避免长时间打开多个 Tab 累积引用。
      cleanups.forEach((cleanup, element) => {
        if (!element.isConnected) {
          cleanup();
          cleanups.delete(element);
        }
      });
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      cleanups.forEach(cleanup => cleanup());
      cleanups.clear();
    };
  }, []);
}
