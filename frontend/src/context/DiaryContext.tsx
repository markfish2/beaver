import { createContext, useContext, useState, useCallback, useMemo, useRef, ReactNode } from 'react';

interface DiaryContextType {
  /** Current diary year/month being viewed, null if not viewing a diary doc */
  activeDiary: { year: number; month: number } | null;
  /** Handler to add a day node without navigation. Returns true if handled. */
  handleDayClick: ((day: number) => Promise<boolean>) | null;
  /** Register handler from MainArea when viewing a diary doc */
  register: (year: number, month: number, handler: (day: number) => Promise<boolean>) => void;
  /** Unregister when leaving diary doc */
  unregister: () => void;
  /** Days that have content in the active diary month */
  diaryDays: Set<number>;
  setDiaryDays: (days: Set<number> | ((prev: Set<number>) => Set<number>)) => void;
  /** Add a node directly to the editor (for drag-drop hot update) */
  addNodeToEditor: ((node: unknown) => void) | null;
  /** Register/unregister addNode callback from MainArea */
  registerAddNode: (fn: (node: unknown) => void) => void;
  unregisterAddNode: () => void;
}

const DiaryContext = createContext<DiaryContextType>({
  activeDiary: null,
  handleDayClick: null,
  register: () => {},
  unregister: () => {},
  diaryDays: new Set(),
  setDiaryDays: () => {},
  addNodeToEditor: null,
  registerAddNode: () => {},
  unregisterAddNode: () => {},
});

export function DiaryProvider({ children }: { children: ReactNode }) {
  const [activeDiary, setActiveDiary] = useState<{ year: number; month: number } | null>(null);
  const [handler, setHandler] = useState<((day: number) => Promise<boolean>) | null>(null);
  const [diaryDays, setDiaryDays] = useState<Set<number>>(new Set());
  const [addNodeFn, setAddNodeFn] = useState<((node: unknown) => void) | null>(null);
  const activeDiaryRef = useRef<{ year: number; month: number } | null>(null);

  const register = useCallback((year: number, month: number, h: (day: number) => Promise<boolean>) => {
    const prev = activeDiaryRef.current;
    if (prev && prev.year === year && prev.month === month) {
      // Same month, just update handler
      setHandler(() => h);
      return;
    }
    activeDiaryRef.current = { year, month };
    setActiveDiary({ year, month });
    setHandler(() => h);
  }, []);

  const unregister = useCallback(() => {
    if (activeDiaryRef.current === null) return;
    activeDiaryRef.current = null;
    setActiveDiary(null);
    setHandler(null);
  }, []);

  const registerAddNode = useCallback((fn: (node: unknown) => void) => {
    setAddNodeFn(() => fn);
  }, []);

  const unregisterAddNode = useCallback(() => {
    setAddNodeFn(null);
  }, []);

  const value = useMemo(() => ({
    activeDiary,
    handleDayClick: handler,
    register,
    unregister,
    diaryDays,
    setDiaryDays,
    addNodeToEditor: addNodeFn,
    registerAddNode,
    unregisterAddNode,
  }), [activeDiary, handler, register, unregister, diaryDays, setDiaryDays, addNodeFn, registerAddNode, unregisterAddNode]);

  return (
    <DiaryContext.Provider value={value}>
      {children}
    </DiaryContext.Provider>
  );
}

export function useDiary() {
  return useContext(DiaryContext);
}
