import { createContext, useContext, useState, useEffect, useMemo, useCallback, ReactNode } from 'react';
import { checkSetupStatus, getMe, login as apiLogin, setupAdmin as apiSetupAdmin } from '../api/auth';
import type { User } from '../api/auth';
import { useNavigate, useLocation } from 'react-router-dom';

// 本地模式默认用户
const LOCAL_USER: User = {
  id: 'local-user',
  username: 'local',
  theme: 'system',
  font_family: 'system',
  font_size: 'medium',
  memo_columns: 1,
};

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
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSetupRequired, setIsSetupRequired] = useState<boolean | null>(null);

  const navigate = useNavigate();
  const location = useLocation();

  // 获取当前数据模式
  const dataMode = localStorage.getItem('dataMode') || 'local';

  // Initial check
  useEffect(() => {
    checkStatus();
  }, []);

  const checkStatus = useCallback(async () => {
    setIsLoading(true);

    // 本地模式：自动设置为已认证，无需服务器
    if (dataMode === 'local') {
      setUser(LOCAL_USER);
      setIsAuthenticated(true);
      setIsSetupRequired(false);
      setIsLoading(false);
      return;
    }

    // 远程模式：检查服务器状态
    try {
      const status = await checkSetupStatus();
      setIsSetupRequired(status.setup_required);

      if (status.setup_required) {
        if (location.pathname !== '/setup') {
          navigate('/setup');
        }
        setIsLoading(false);
        return;
      }

      const token = localStorage.getItem('token');
      if (token) {
        try {
          const userData = await getMe();
          setUser(userData);
          setIsAuthenticated(true);
        } catch (error) {
          localStorage.removeItem('token');
          setIsAuthenticated(false);
        }
      }
    } catch (error) {
      console.error('Failed to check status', error);
    } finally {
      setIsLoading(false);
    }
  }, [location.pathname, navigate, dataMode]);

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
  }, [login, navigate]);

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

  const value = useMemo(() => ({
    user, isAuthenticated, isLoading, isSetupRequired, login, setup, logout, checkStatus, refreshUser
  }), [user, isAuthenticated, isLoading, isSetupRequired, login, setup, logout, checkStatus, refreshUser]);

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
