import { useCallback, useRef } from 'react';

interface UseResizableTextareaOptions {
  minHeight?: number;
  maxHeight?: number;
}

/**
 * Hook that adds a draggable resize handle to a textarea.
 * Returns a ref to attach to the textarea and a reset function.
 *
 * When the user drags the handle, the auto-adjust (adjustHeight) is skipped
 * until resetUserHeight() is called (e.g. on submit or exit edit mode).
 */
export function useResizableTextarea(options: UseResizableTextareaOptions = {}) {
  const { minHeight = 80, maxHeight = 500 } = options;
  const userHeightRef = useRef<number | null>(null);
  const dragStateRef = useRef<{ startY: number; startHeight: number } | null>(null);

  /** Called by adjustHeight — returns true if user has manually set height (skip auto). */
  const isUserResized = useCallback(() => userHeightRef.current !== null, []);

  /** Reset user height (call on submit / exit edit mode). */
  const resetUserHeight = useCallback(() => {
    userHeightRef.current = null;
  }, []);

  /** Mouse/touch down handler for the resize handle. */
  const onResizeStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Find the textarea — the handle is inside a wrapper that is a sibling of the textarea
    const handle = e.currentTarget as HTMLElement;
    const container = handle.closest('[data-resizable-container]');
    const textarea = container?.querySelector<HTMLTextAreaElement>('[data-resizable-textarea]');
    if (!textarea) return;

    const startY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const startHeight = textarea.offsetHeight;
    dragStateRef.current = { startY, startHeight };

    const onMove = (ev: MouseEvent | TouchEvent) => {
      if (!dragStateRef.current) return;
      const currentY = 'touches' in ev ? ev.touches[0].clientY : (ev as MouseEvent).clientY;
      const delta = currentY - dragStateRef.current.startY;
      const newHeight = Math.max(minHeight, Math.min(maxHeight, dragStateRef.current.startHeight + delta));
      textarea.style.height = newHeight + 'px';
      userHeightRef.current = newHeight;
    };

    const onUp = () => {
      dragStateRef.current = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onUp);
    document.body.style.cursor = 'nwse-resize';
    document.body.style.userSelect = 'none';
  }, [minHeight, maxHeight]);

  return {
    isUserResized,
    resetUserHeight,
    onResizeStart,
  };
}
