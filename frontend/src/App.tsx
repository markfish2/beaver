import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useState, useEffect, lazy, Suspense } from 'react';
import { Capacitor } from '@capacitor/core';
import Sidebar from './components/Sidebar';
import MainArea from './components/MainArea';
import MobileLayout from './components/mobile/MobileLayout';
import { AuthProvider, useAuth } from './context/AuthContext';
import { DataProviderComponent, useData } from './context/DataContext';
import { DocumentProvider } from './context/DocumentContext';
import { SearchProvider } from './context/SearchContext';
import { DiaryProvider } from './context/DiaryContext';
import { UserViewProvider, useUserView } from './context/UserViewContext';
import { useRetryFailedPreviews } from './hooks/useRetryFailedPreviews';
import type { ReactNode } from 'react';

const SetupPage = lazy(() => import('./pages/SetupPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const ModeSelectPage = lazy(() => import('./pages/ModeSelectPage'));
const SearchResultsPage = lazy(() => import('./pages/SearchResultsPage'));
const SharePage = lazy(() => import('./pages/SharePage'));
const ShareTargetPage = lazy(() => import('./pages/ShareTargetPage'));
const ReloadPrompt = lazy(() => import('./components/ReloadPrompt'));
const ConflictResolver = lazy(() => import('./components/ConflictResolver'));

// Mode Selection Gate - checks if mode is selected
const ModeGate = ({ children }: { children: ReactNode }) => {
  const { mode, isReady, showModeSelect } = useData();

  // 显示模式选择页面
  if (showModeSelect) {
    return <ModeSelectPage />;
  }

  if (!isReady) {
    return (
      <div className="h-screen flex items-center justify-center bg-white dark:bg-gray-900">
        <div className="text-center">
          <div className="w-12 h-12 mx-auto mb-4 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-500 dark:text-gray-400">正在初始化...</p>
        </div>
      </div>
    );
  }

  // 如果是本地模式，跳过认证直接进入
  if (mode === 'local') {
    return <>{children}</>;
  }

  // 远程模式需要认证
  return <>{children}</>;
};

// Protected Route Component
const ProtectedRoute = ({ children }: { children: ReactNode }) => {
  const { isAuthenticated, isLoading, isSetupRequired } = useAuth();
  const { mode } = useData();
  const location = useLocation();

  // 本地模式不需要认证
  if (mode === 'local') {
    return <>{children}</>;
  }

  if (isLoading) {
    return <div className="h-screen flex items-center justify-center bg-white dark:bg-gray-900 text-gray-900 dark:text-white">Loading...</div>;
  }

  // If setup is required and we are not on the setup page, redirect to setup
  if (isSetupRequired) {
    return <Navigate to="/setup" replace />;
  }

  // If not authenticated and not on login page, redirect to login
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};

// Layout Component for authenticated pages
const AppLayout = ({ children }: { children: ReactNode }) => {
  const [isMobile, setIsMobile] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    const handleToggleSidebar = () => {
      setSidebarOpen(prev => {
        const newState = !prev;
        window.dispatchEvent(new CustomEvent(newState ? 'sidebarOpen' : 'sidebarClose'));
        return newState;
      });
    };
    const handleSidebarOpen = () => setSidebarOpen(true);
    const handleSidebarClose = () => setSidebarOpen(false);
    window.addEventListener('toggleSidebar', handleToggleSidebar);
    window.addEventListener('sidebarOpen', handleSidebarOpen);
    window.addEventListener('sidebarClose', handleSidebarClose);
    return () => {
      window.removeEventListener('toggleSidebar', handleToggleSidebar);
      window.removeEventListener('sidebarOpen', handleSidebarOpen);
      window.removeEventListener('sidebarClose', handleSidebarClose);
    };
  }, []);

  // Mobile: bottom tab bar layout
  if (isMobile) {
    return <MobileLayout>{children}</MobileLayout>;
  }

  // Desktop: sidebar layout
  return (
    <div className="flex h-screen bg-white dark:bg-gray-900" style={{ paddingBottom: 'var(--safe-area-inset-bottom)' }}>
      <Sidebar isMobile={false} onDocumentSelect={() => {}} />
      {children}
    </div>
  );
};

const PageLoading = () => <div className="h-screen flex items-center justify-center bg-white dark:bg-gray-900 text-gray-500">Loading...</div>;

// Wrapper to pass userSubView and activeConvId from context to MainArea
function MainAreaWithUserView() {
  const { userSubView, activeConvId } = useUserView();
  return <MainArea userSubView={userSubView} activeConvId={activeConvId} />;
}

function AppRoutes() {
  useRetryFailedPreviews();
  const { isAuthenticated } = useAuth();
  const { mode, isReady } = useData();

  // 登录后检查是否有待处理的分享数据（从 ShareTargetPage 存入的）
  useEffect(() => {
    if (!isAuthenticated || mode === 'local') return;
    const pending = sessionStorage.getItem('pendingShare');
    if (pending) {
      sessionStorage.removeItem('pendingShare');
      try {
        const { title, text, url } = JSON.parse(pending);
        const params = new URLSearchParams();
        if (title) params.set('title', title);
        if (text) params.set('text', text);
        if (url) params.set('url', url);
        window.location.href = `/share?${params.toString()}`;
      } catch {
        // ignore
      }
    }
  }, [isAuthenticated, mode]);

  // 本地模式直接进入应用，无需认证
  if (mode === 'local' && isReady) {
    return (
      <Suspense fallback={<PageLoading />}>
        <Routes>
          <Route path="/" element={
            <AppLayout>
              <MainAreaWithUserView />
            </AppLayout>
          } />
          <Route path="/d/:documentId" element={
            <AppLayout>
              <MainAreaWithUserView />
            </AppLayout>
          } />
          <Route path="/search" element={<SearchResultsPage />} />
          <Route path="/share" element={<ShareTargetPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    );
  }

  // 远程模式需要认证
  return (
    <Suspense fallback={<PageLoading />}>
      <Routes>
        <Route path="/setup" element={<SetupPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/s/:shareToken" element={<SharePage />} />
        <Route path="/share" element={<ShareTargetPage />} />

        <Route path="/" element={
          <ProtectedRoute>
            <AppLayout>
              <MainAreaWithUserView />
            </AppLayout>
          </ProtectedRoute>
        } />

        <Route path="/d/:documentId" element={
          <ProtectedRoute>
            <AppLayout>
              <MainAreaWithUserView />
            </AppLayout>
          </ProtectedRoute>
        } />

        <Route path="/search" element={
          <ProtectedRoute>
            <SearchResultsPage />
          </ProtectedRoute>
        } />
      </Routes>
    </Suspense>
  );
}

function App() {
  return (
    <Router>
      <AuthProvider>
        <DataProviderComponent>
          <SearchProvider>
            <DocumentProvider>
              <DiaryProvider>
                <UserViewProvider>
                  <ModeGate>
                    <AppRoutes />
                  </ModeGate>
                  <Suspense fallback={null}>
                    <ReloadPrompt />
                    <ConflictResolver />
                  </Suspense>
                </UserViewProvider>
              </DiaryProvider>
            </DocumentProvider>
          </SearchProvider>
        </DataProviderComponent>
      </AuthProvider>
    </Router>
  );
}

export default App;
