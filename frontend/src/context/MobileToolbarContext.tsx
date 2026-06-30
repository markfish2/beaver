import { createContext, useContext, useState, useCallback } from 'react';
import type { ReactNode } from 'react';

export interface ToolbarHandlers {
  onIndent: () => void;
  onOutdent: () => void;
  onToggleTodo: () => void;
  onAddNote: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onZoom: () => void;
  onUndo: () => void;
  onDelete: () => void;
}

interface MobileToolbarContextValue {
  isVisible: boolean;
  handlers: ToolbarHandlers | null;
  isInsideProvider: boolean;
  publish: (isVisible: boolean, handlers: ToolbarHandlers) => void;
}

const MobileToolbarContext = createContext<MobileToolbarContextValue | null>(null);

export function MobileToolbarProvider({ children }: { children: ReactNode }) {
  const [isVisible, setIsVisible] = useState(false);
  const [handlers, setHandlers] = useState<ToolbarHandlers | null>(null);

  const publish = useCallback((visible: boolean, h: ToolbarHandlers) => {
    setIsVisible(visible);
    setHandlers(h);
  }, []);

  return (
    <MobileToolbarContext.Provider value={{ isVisible, handlers, isInsideProvider: true, publish }}>
      {children}
    </MobileToolbarContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useMobileToolbar() {
  const ctx = useContext(MobileToolbarContext);
  if (!ctx) {
    return {
      isVisible: false,
      handlers: null,
      isInsideProvider: false,
      publish: () => {},
    };
  }
  return ctx;
}
