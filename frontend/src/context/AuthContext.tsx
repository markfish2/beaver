import { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef, ReactNode } from 'react';
import { checkSetupStatus, getMe, login as apiLogin, setupAdmin as apiSetupAdmin } from '../api/auth';
import type { User } from '../api/auth';
import { useNavigate } from 'react-router-dom';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isSetupRequired: boolean | null;
  login: (username: string, password: string) => Promise<void>;
  setup: (username: string, password: string) => Promise<void>;
  logout: () => void;
  checkStatus: () => Promise<void>;
  refreshUser: () => Promise<void>;
  applyUser: (user: User) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSetupRequired, setIsSetupRequired] = useState<boolean | null>(null);
  const initialCheckStartedRef = useRef(false);

  const navigate = useNavigate();

  const checkStatus = useCallback(async () => {
    setIsLoading(true);
    const token = localStorage.getItem('token');

    // 启动时两个请求互不依赖，并行执行，避免登录恢复被 setup 状态检查额外阻塞一轮 RTT。
    const setupStatusPromise = checkSetupStatus();
    const userPromise = token ? getMe() : Promise.resolve(null);
    try {
      const [setupResult, userResult] = await Promise.allSettled([setupStatusPromise, userPromise]);

      if (setupResult.status === 'fulfilled') {
        const status = setupResult.value;
        setIsSetupRequired(status.setup_required);
        if (status.setup_required) {
          if (window.location.pathname !== '/setup') navigate('/setup');
          setIsLoading(false);
          return;
        }
      }

      // setup 检查失败时仍允许有效 token 恢复登录；getMe 失败则清理失效 token。
      if (token && userResult.status === 'fulfilled' && userResult.value) {
        setUser(userResult.value);
        setIsAuthenticated(true);
      } else if (token && userResult.status === 'rejected') {
        localStorage.removeItem('token');
        setIsAuthenticated(false);
      }
    } catch (error) {
      // Promise.allSettled 本身通常不会失败，保留兜底以防运行环境异常。
      console.warn('auth bootstrap failed', error);
    } finally {
      setIsLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    if (initialCheckStartedRef.current) return;
    initialCheckStartedRef.current = true;
    void checkStatus();
  }, [checkStatus]);

  const login = useCallback(async (username: string, password: string) => {
    const data = await apiLogin(username, password);
    localStorage.setItem('token', data.access_token);
    const userData = await getMe();
    setUser(userData);
    setIsAuthenticated(true);
    navigate('/');
  }, [navigate]);

  const setup = useCallback(async (username: string, password: string) => {
    await apiSetupAdmin(username, password);
    await login(username, password);
    setIsSetupRequired(false);
  }, [login]);

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    setUser(null);
    setIsAuthenticated(false);
    navigate('/login');
  }, [navigate]);

  const refreshUser = useCallback(async () => {
    try {
      const userData = await getMe();
      setUser(userData);
    } catch {
      // ignore
    }
  }, []);

  const applyUser = useCallback((nextUser: User) => {
    setUser(nextUser);
    setIsAuthenticated(true);
  }, []);

  const value = useMemo(() => ({
    user, isAuthenticated, isLoading, isSetupRequired, login, setup, logout, checkStatus, refreshUser, applyUser
  }), [user, isAuthenticated, isLoading, isSetupRequired, login, setup, logout, checkStatus, refreshUser, applyUser]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
