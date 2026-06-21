import { createContext, useContext, useState, useCallback, useMemo, ReactNode } from 'react';

export type UserSubView = 'profile' | 'token' | 'ai' | 'trash' | 'password' | 'ai-chat';

interface UserViewContextType {
  userSubView: UserSubView | null;
  setUserSubView: (view: UserSubView | null) => void;
  activeConvId: string | null;
  setActiveConvId: (id: string | null) => void;
  convListRefreshTrigger: number;
  refreshConvList: () => void;
  mobileEditingDocId: string | null;
  setMobileEditingDocId: (id: string | null) => void;
}

const UserViewContext = createContext<UserViewContextType | undefined>(undefined);

export function UserViewProvider({ children }: { children: ReactNode }) {
  const [userSubView, setUserSubViewState] = useState<UserSubView | null>(null);
  const [activeConvId, setActiveConvIdState] = useState<string | null>(null);
  const [convListRefreshTrigger, setConvListRefreshTrigger] = useState(0);
  const [mobileEditingDocId, setMobileEditingDocIdState] = useState<string | null>(null);

  const setUserSubView = useCallback((view: UserSubView | null) => {
    setUserSubViewState(view);
  }, []);

  const setActiveConvId = useCallback((id: string | null) => {
    setActiveConvIdState(id);
  }, []);

  const refreshConvList = useCallback(() => {
    setConvListRefreshTrigger(prev => prev + 1);
  }, []);

  const setMobileEditingDocId = useCallback((id: string | null) => {
    setMobileEditingDocIdState(id);
  }, []);

  const value = useMemo(() => ({
    userSubView,
    setUserSubView,
    activeConvId,
    setActiveConvId,
    convListRefreshTrigger,
    refreshConvList,
    mobileEditingDocId,
    setMobileEditingDocId,
  }), [userSubView, setUserSubView, activeConvId, setActiveConvId, convListRefreshTrigger, refreshConvList, mobileEditingDocId, setMobileEditingDocId]);

  return (
    <UserViewContext.Provider value={value}>
      {children}
    </UserViewContext.Provider>
  );
}

export function useUserView() {
  const context = useContext(UserViewContext);
  if (context === undefined) {
    return { userSubView: null, setUserSubView: () => {}, activeConvId: null, setActiveConvId: () => {}, convListRefreshTrigger: 0, refreshConvList: () => {}, mobileEditingDocId: null, setMobileEditingDocId: () => {} };
  }
  return context;
}
