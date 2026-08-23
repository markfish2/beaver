import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface EditorActionPortalProps {
  children: ReactNode;
}

const MobileEditorActionsHostContext = createContext<HTMLElement | null>(null);
const MobileEditorActionsRegisterContext = createContext<((host: HTMLElement | null) => void) | null>(null);

export function MobileEditorActionsProvider({ children }: { children: ReactNode }) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const registerHost = useCallback((nextHost: HTMLElement | null) => {
    setHost(previous => previous === nextHost ? previous : nextHost);
  }, []);
  return (
    <MobileEditorActionsRegisterContext.Provider value={registerHost}>
      <MobileEditorActionsHostContext.Provider value={host}>
        {children}
      </MobileEditorActionsHostContext.Provider>
    </MobileEditorActionsRegisterContext.Provider>
  );
}

export function MobileEditorActionsSlot({
  className,
}: {
  className?: string;
}) {
  const registerHost = useContext(MobileEditorActionsRegisterContext);
  const register = useCallback((element: HTMLDivElement | null) => {
    registerHost?.(element);
  }, [registerHost]);
  return <div ref={register} className={className} aria-label="笔记操作" />;
}

/** 将当前编辑器的操作按钮放入统一顶部操作区；移动端放入左侧胶囊。 */
export default function EditorActionPortal({ children }: EditorActionPortalProps) {
  const mobileHost = useContext(MobileEditorActionsHostContext);
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (mobileHost) return;
    const frame = requestAnimationFrame(() => {
      setHost(document.getElementById('editor-action-slot'));
    });
    return () => cancelAnimationFrame(frame);
  }, [mobileHost]);

  const target = mobileHost ?? host;
  return target ? createPortal(children, target) : null;
}
