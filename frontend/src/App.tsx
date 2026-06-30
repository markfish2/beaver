import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useState, useEffect, lazy, Suspense } from 'react';
import Sidebar from './components/Sidebar';
import MainArea from './components/MainArea';
import MobileLayout from './components/mobile/MobileLayout';
import { AuthProvider, useAuth } from './context/AuthContext';
import { DocumentProvider } from './context/DocumentContext';
import { SearchProvider } from './context/SearchContext';
import { DiaryProvider } from './context/DiaryContext';
import { UserViewProvider, useUserView } from './context/UserViewContext';
import { useRetryFailedPreviews } from './hooks/useRetryFailedPreviews';
import type { ReactNode } from 'react';

const SetupPage = lazy(() => import('./pages/SetupPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const SearchResultsPage = lazy(() => import('./pages/SearchResultsPage'));
const SharePage = lazy(() => import('./pages/SharePage'));
const ShareTargetPage = lazy(() => import('./pages/ShareTargetPage'));
const ReloadPrompt = lazy(() => import('./components/ReloadPrompt'));
const ConflictResolver = lazy(() => import('./components/ConflictResolver'));

// Protected Route Component
const ProtectedRoute = ({ children }: { children: ReactNode }) => {
  const { isAuthenticated, isLoading, isSetupRequired } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <div className="h-screen flex items-center justify-center bg-white dark:bg-gray-900 text-gray-900 dark:text-white">Loading...</div>;
  }

  if (isSetupRequired) {
    return <Navigate to="/setup" replace />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};

const AppLayout = ({ children }: { children: ReactNode }) => {
  const [isMobile, setIsMobile] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
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

  if (isMobile) {
    return <MobileLayout>{children}</MobileLayout>;
  }

  return (
    <div className="flex h-screen bg-white dark:bg-gray-900" style={{ paddingBottom: 'var(--safe-area-inset-bottom)' }}>
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
  const { isAuthenticated } = useAuth();

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
      </AuthProvider>
    </Router>
  );
}

export default App;
