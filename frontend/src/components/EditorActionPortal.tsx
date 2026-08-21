import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface EditorActionPortalProps {
  children: ReactNode;
}

/** 将当前编辑器的操作按钮放入统一顶部操作区；移动端放入左侧胶囊。 */
export default function EditorActionPortal({ children }: EditorActionPortalProps) {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setHost(
        document.getElementById('mobile-editor-action-slot')
        ?? document.getElementById('editor-action-slot'),
      );
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  return host ? createPortal(children, host) : null;
}
