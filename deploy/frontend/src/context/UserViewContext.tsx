import { createContext, useContext, useState, useCallback, useMemo, ReactNode } from 'react';

export type UserSubView = 'profile' | 'token' | 'ai' | 'trash' | 'password' | 'ai-chat';

interface UserViewContextType {
  userSubView: UserSubView | null;
  setUserSubView: (view: UserSubView | null) => void;
  activeConvId: string | null;
  setActiveConvId: (id: string | null) => void;
  convListRefreshTrigger: number;
  refreshConvList: () => void;
  selectedProjectId: string | null;
  setSelectedProjectId: (id: string | null) => void;
}

const UserViewContext = createContext<UserViewContextType | undefined>(undefined);

export function UserViewProvider({ children }: { children: ReactNode }) {
  const [userSubView, setUserSubViewState] = useState<UserSubView | null>(null);
  const [activeConvId, setActiveConvIdState] = useState<string | null>(null);
  const [convListRefreshTrigger, setConvListRefreshTrigger] = useState(0);
  const [selectedProjectId, setSelectedProjectIdState] = useState<string | null>(() => {
    try { return localStorage.getItem('selectedProjectId') || null; } catch { return null; }
  });

  const setUserSubView = useCallback((view: UserSubView | null) => {
    setUserSubViewState(view);
  }, []);

  const setActiveConvId = useCallback((id: string | null) => {
    setActiveConvIdState(id);
  }, []);

  const refreshConvList = useCallback(() => {
    setConvListRefreshTrigger(prev => prev + 1);
  }, []);

  const setSelectedProjectId = useCallback((id: string | null) => {
    setSelectedProjectIdState(id);
    try {
      if (id) localStorage.setItem('selectedProjectId', id);
      else localStorage.removeItem('selectedProjectId');
    } catch { /* ignore */ }
  }, []);

  const value = useMemo(() => ({
    userSubView,
    setUserSubView,
    activeConvId,
    setActiveConvId,
    convListRefreshTrigger,
    refreshConvList,
    selectedProjectId,
    setSelectedProjectId,
  }), [userSubView, setUserSubView, activeConvId, setActiveConvId, convListRefreshTrigger, refreshConvList, selectedProjectId, setSelectedProjectId]);

  return (
    <UserViewContext.Provider value={value}>
      {children}
    </UserViewContext.Provider>
  );
}

export function useUserView() {
  const context = useContext(UserViewContext);
  if (context === undefined) {
    return { userSubView: null, setUserSubView: () => {}, activeConvId: null, setActiveConvId: () => {}, convListRefreshTrigger: 0, refreshConvList: () => {}, selectedProjectId: null, setSelectedProjectId: () => {} };
  }
  return context;
}
