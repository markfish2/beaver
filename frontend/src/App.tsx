import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useEffect, lazy, Suspense, useRef } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { DocumentProvider } from './context/DocumentContext';
import { SearchProvider } from './context/SearchContext';
import { DiaryProvider } from './context/DiaryContext';
import { UserViewProvider, useUserView } from './context/UserViewContext';
import { useRetryFailedPreviews } from './hooks/useRetryFailedPreviews';
import type { ReactNode } from 'react';
import { AppearanceProvider } from './components/FontSettings';
import { usePhoneLayout } from './hooks/usePhoneLayout';
import { getDeviceLayoutSnapshot, isTabletDevice } from './utils/deviceLayout';

const SetupPage = lazy(() => import('./pages/SetupPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const SearchResultsPage = lazy(() => import('./pages/SearchResultsPage'));
const SharePage = lazy(() => import('./pages/SharePage'));
const ShareTargetPage = lazy(() => import('./pages/ShareTargetPage'));
const ReloadPrompt = lazy(() => import('./components/ReloadPrompt'));
const ConflictResolver = lazy(() => import('./components/ConflictResolver'));
const Sidebar = lazy(() => import('./components/Sidebar'));
const MainArea = lazy(() => import('./components/MainArea'));
const MobileLayout = lazy(() => import('./components/mobile/MobileLayout'));

const AppLayout = ({ children }: { children: ReactNode }) => {
  const isMobile = usePhoneLayout();
  // 平板走桌面布局，顶部状态栏可能覆盖操作区；手机布局由 MobileTopBar 自己处理安全区。
  const needsTabletTopInset = !isMobile && isTabletDevice(getDeviceLayoutSnapshot());
  const sidebarOpenRef = useRef(false);

  useEffect(() => {
    const handleToggleSidebar = () => {
      sidebarOpenRef.current = !sidebarOpenRef.current;
      window.dispatchEvent(new CustomEvent(sidebarOpenRef.current ? 'sidebarOpen' : 'sidebarClose'));
    };
    const handleSidebarOpen = () => { sidebarOpenRef.current = true; };
    const handleSidebarClose = () => { sidebarOpenRef.current = false; };
    window.addEventListener('toggleSidebar', handleToggleSidebar);
    window.addEventListener('sidebarOpen', handleSidebarOpen);
    window.addEventListener('sidebarClose', handleSidebarClose);
    return () => {
      window.removeEventListener('toggleSidebar', handleToggleSidebar);
      window.removeEventListener('sidebarOpen', handleSidebarOpen);
      window.removeEventListener('sidebarClose', handleSidebarClose);
    };
  }, []);

  if (isMobile) {
    return <MobileLayout>{children}</MobileLayout>;
  }

  return (
    <div
      className="flex h-[100dvh] overflow-hidden bg-white dark:bg-gray-900"
      style={{
        paddingTop: needsTabletTopInset ? 'var(--safe-area-inset-top)' : undefined,
        paddingBottom: 'var(--safe-area-inset-bottom)',
      }}
    >
      <Sidebar isMobile={false} onDocumentSelect={() => {}} />
      {children}
    </div>
  );
};

const PageLoading = () => <div className="h-screen flex items-center justify-center bg-white dark:bg-gray-900 text-gray-500">Loading...</div>;

function MainAreaWithUserView() {
  const { userSubView, activeConvId } = useUserView();
  return <MainArea userSubView={userSubView} activeConvId={activeConvId} />;
}

function AppRoutes() {
  useRetryFailedPreviews();
  const { isAuthenticated, isLoading, isSetupRequired } = useAuth();
  const location = useLocation();

  useEffect(() => {
    if (!isAuthenticated) return;
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
  }, [isAuthenticated]);

  const isPublicRoute = location.pathname === '/setup'
    || location.pathname === '/login'
    || location.pathname === '/share'
    || location.pathname.startsWith('/s/');

  if (isPublicRoute) {
    return (
      <Suspense fallback={<PageLoading />}>
        <Routes>
          <Route path="/setup" element={<SetupPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/s/:shareToken" element={<SharePage />} />
          <Route path="/share" element={<ShareTargetPage />} />
        </Routes>
      </Suspense>
    );
  }

  if (isLoading) {
    return <PageLoading />;
  }

  if (isSetupRequired) {
    return <Navigate to="/setup" replace />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return (
    <AppLayout>
      <Suspense fallback={<PageLoading />}>
        <Routes>
          <Route index element={<MainAreaWithUserView />} />
          <Route path="/d/:documentId" element={<MainAreaWithUserView />} />
          <Route path="/search" element={<SearchResultsPage />} />
        </Routes>
      </Suspense>
    </AppLayout>
  );
}

function App() {
  return (
    <Router>
      <AuthProvider>
        <AppearanceProvider>
          <SearchProvider>
            <DocumentProvider>
              <DiaryProvider>
                <UserViewProvider>
                  <AppRoutes />
                  <Suspense fallback={null}>
                    <ReloadPrompt />
                    <ConflictResolver />
                  </Suspense>
                </UserViewProvider>
              </DiaryProvider>
            </DocumentProvider>
          </SearchProvider>
        </AppearanceProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;
