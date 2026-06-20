import { createContext, useContext, useState, useCallback, useMemo, ReactNode } from 'react';

export type UserSubView = 'profile' | 'token' | 'ai' | 'trash' | 'password';

interface UserViewContextType {
  userSubView: UserSubView | null;
  setUserSubView: (view: UserSubView | null) => void;
}

const UserViewContext = createContext<UserViewContextType | undefined>(undefined);

export function UserViewProvider({ children }: { children: ReactNode }) {
  const [userSubView, setUserSubViewState] = useState<UserSubView | null>(null);

  const setUserSubView = useCallback((view: UserSubView | null) => {
    setUserSubViewState(view);
  }, []);

  const value = useMemo(() => ({
    userSubView,
    setUserSubView,
  }), [userSubView, setUserSubView]);

  return (
    <UserViewContext.Provider value={value}>
      {children}
    </UserViewContext.Provider>
  );
}

export function useUserView() {
  const context = useContext(UserViewContext);
  if (context === undefined) {
    return { userSubView: null, setUserSubView: () => {} };
  }
  return context;
}
