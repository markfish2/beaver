import { useState, useCallback, useEffect, useRef, lazy, Suspense } from 'react';
import { flushSync } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import MobileTopBar from './MobileTopBar';
import MobileBottomTabBar, { type MobileTab } from './MobileBottomTabBar';
import MobileToolbar from '../MobileToolbar';
import { MobileToolbarProvider, useMobileToolbar } from '../../context/MobileToolbarContext';
import { getMonthlyDiary, getOrCreateDayNode } from '../../api/data';
import NewMenuPopup from './NewMenuPopup';
import AIChatMainView from '../AIChatMainView';
import AIChatSidebar from '../AIChatSidebar';
import { useUserView } from '../../context/UserViewContext';
import { MessageSquare } from 'lucide-react';
import type { ReactNode } from 'react';

const FileTreeView = lazy(() => import('./FileTreeView'));
const MobileTodos = lazy(() => import('./MobileTodos'));

interface MobileLayoutProps {
  children: ReactNode;
}

// ToolbarSlot reads from MobileToolbarContext and renders MobileToolbar
// Toolbar is position: fixed at bottom, above keyboard
function ToolbarSlot({ showZoom, hasTabBar }: { showZoom?: boolean; hasTabBar?: boolean }) {
  const { isVisible, handlers } = useMobileToolbar();
  return (
    <>
      <MobileToolbar
        isVisible={isVisible}
        onIndent={handlers?.onIndent ?? (() => {})}
        onOutdent={handlers?.onOutdent ?? (() => {})}
        onToggleTodo={handlers?.onToggleTodo ?? (() => {})}
        onAddNote={handlers?.onAddNote ?? (() => {})}
        onMoveUp={handlers?.onMoveUp ?? (() => {})}
        onMoveDown={handlers?.onMoveDown ?? (() => {})}
        onZoom={handlers?.onZoom ?? (() => {})}
        onUndo={handlers?.onUndo ?? (() => {})}
        onDelete={handlers?.onDelete ?? (() => {})}
        showZoom={showZoom}
        hasTabBar={hasTabBar}
      />
      {isVisible && <div className="h-10 shrink-0" />}
    </>
  );
}

export default function MobileLayout({ children }: MobileLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { activeConvId, setActiveConvId, refreshConvList, setUserSubView } = useUserView();
  const [activeTab, setActiveTab] = useState<MobileTab>('memos');
  const [showNewMenu, setShowNewMenu] = useState(false);
  const [showAIHistory, setShowAIHistory] = useState(false);
  const prevTabRef = useRef<MobileTab>('memos');
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  // 监听键盘状态（由 MobileToolbar 通过 CustomEvent 通知）
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setKeyboardOpen(detail?.open ?? false);
    };
    window.addEventListener('keyboard-change', handler);
    return () => window.removeEventListener('keyboard-change', handler);
  }, []);

  // Diary state
  const [diaryDocId, setDiaryDocId] = useState<string | null>(null);

  // Is user viewing a specific document (not diary tab)?
  // 用 state 追踪，确保 navigate() 后能触发重渲染
  const [editingPath, setEditingPath] = useState(location.pathname);
  useEffect(() => {
    setEditingPath(location.pathname);
  }, [location.pathname]);
  const isEditing = editingPath.startsWith('/d/');

  // Load diary when switching to diary tab
  useEffect(() => {
    if (activeTab !== 'diary') return;
    let cancelled = false;
    const today = new Date();
    const y = today.getFullYear();
    const m = today.getMonth() + 1;
    const d = today.getDate();

    (async () => {
      try {
        const data = await getMonthlyDiary(y, m);
        if (cancelled) return;
        setDiaryDocId(data.document.id);

        // Auto-create today's node if needed
        await getOrCreateDayNode(y, m, d);
      } catch (err) {
        console.error('Failed to load diary:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [activeTab]);

  // Signal to MemoHome/MainArea that MobileLayout is active
  useEffect(() => {
    document.documentElement.dataset.mobileLayout = 'true';
    return () => { delete document.documentElement.dataset.mobileLayout; };
  }, []);

  const prevEditingRef = useRef(false);
  useEffect(() => {
    if (prevEditingRef.current && !isEditing) {
      setActiveTab(prevTabRef.current);
    }
    if (isEditing) {
      // 进入编辑模式时清除用户子视图，确保 MainArea 渲染文档编辑器
      setUserSubView(null);
      prevTabRef.current = activeTab;
    }
    prevEditingRef.current = isEditing;
  }, [isEditing, activeTab]);

  const handleTabChange = useCallback((tab: MobileTab) => {
    if (tab === 'new') {
      setShowNewMenu(true);
      return;
    }
    // 切离日记 tab 时清除 diaryDocId，避免影响其他页面的 documentId
    if (tab !== 'diary') {
      setDiaryDocId(null);
    }
    setActiveTab(tab);
    // Navigate to root when switching away from editor (but not diary)
    // Use replace to avoid polluting browser history stack
    if (isEditing && tab !== 'diary') {
      navigate('/', { replace: true });
    }
  }, [isEditing, navigate]);

  // location.key === "default" 表示用户直接通过 URL 打开（历史栈无上一页）
  // 否则用 navigate(-1) 返回应用内上一页
  const handleBack = useCallback(() => {
    setUserSubView(null);
    setDiaryDocId(null);
    if (location.key === 'default') {
      navigate('/', { replace: true });
    } else {
      navigate(-1);
    }
  }, [navigate, location.key, setUserSubView]);

  const handleSearch = useCallback((query: string) => {
    navigate(`/search?q=${encodeURIComponent(query)}`);
  }, [navigate]);

  const handleNewMenuClose = useCallback(() => {
    setShowNewMenu(false);
  }, []);

  const handleDocumentCreated = useCallback((id: string, type: string) => {
    flushSync(() => {
      setShowNewMenu(false);
      setDiaryDocId(null);
      setUserSubView(null);
    });
    if (type === 'folder') {
      setActiveTab('files');
    } else {
      navigate(`/d/${id}`);
    }
  }, [navigate, setUserSubView]);

  // Determine top bar title
  const getTopBarTitle = () => {
    if (isEditing) return '编辑';
    switch (activeTab) {
      case 'memos': return '随想';
      case 'diary': return '日记';
      case 'files': return '文件';
      case 'ai': return 'AI 问答';
      default: return '随想';
    }
  };

  const showTabBar = (!isEditing || activeTab === 'diary') && !keyboardOpen;


  return (
    <MobileToolbarProvider>
    <div className="flex flex-col bg-white dark:bg-gray-900" style={{ height: '100dvh' }}>
      <MobileTopBar
        title={getTopBarTitle()}
        showBack={isEditing}
        onBack={handleBack}
        onSearch={handleSearch}
      />

      <div className="flex-1 overflow-hidden flex flex-col">
        {isEditing && activeTab !== 'diary' ? (
          // Document editor mode: toolbar below topbar, then content
          <>
            <div style={{ height: 'calc(env(safe-area-inset-top, 0px) + 44px)', flexShrink: 0 }} />
            <ToolbarSlot showZoom={true} hasTabBar={false} />
            {children}
          </>
        ) : activeTab === 'diary' ? (
          // Diary tab: todos + toolbar + inline MainArea
          <div className="flex-1 overflow-hidden flex flex-col">
            <div style={{ height: 'calc(env(safe-area-inset-top, 0px) + 44px)', flexShrink: 0 }} />
            <div className="max-h-[40vh] overflow-y-auto scrollbar-none shrink-0">
              <Suspense fallback={null}>
                <MobileTodos />
              </Suspense>
            </div>
            <ToolbarSlot showZoom={false} hasTabBar={true} />
            <div className="flex-1 min-h-0 overflow-y-auto scrollbar-none">
              {diaryDocId ? (
                <DiaryMainArea diaryDocId={diaryDocId} onDiaryDocChange={setDiaryDocId} />
              ) : (
                <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">加载中...</div>
              )}
            </div>
          </div>
        ) : activeTab === 'files' ? (
          <Suspense fallback={<div className="flex-1 flex items-center justify-center text-gray-400 text-sm">加载中...</div>}>
            <div style={{ height: 'calc(env(safe-area-inset-top, 0px) + 44px)', flexShrink: 0 }} />
            <FileTreeView />
          </Suspense>
        ) : activeTab === 'ai' ? (
          // AI 问答
          <div className="flex-1 flex flex-col overflow-hidden">
            <div style={{ height: 'calc(env(safe-area-inset-top, 0px) + 44px)', flexShrink: 0 }} />
            <div className="flex-1 relative overflow-hidden flex flex-col">
              <div className="flex-1 min-h-0">
                <AIChatMainView
                  conversationId={activeConvId}
                  onConversationCreated={(convId) => { setActiveConvId(convId); refreshConvList(); }}
                />
              </div>
              {/* 底部间距，避免输入框被 tab 栏遮挡 */}
              <div style={{ height: 'calc(60px + env(safe-area-inset-bottom, 0px))', flexShrink: 0 }} />
              {/* 历史对话按钮 */}
              <button
                onClick={() => setShowAIHistory(true)}
                className="absolute top-2 right-2 w-8 h-8 flex items-center justify-center bg-white/80 dark:bg-gray-800/80 backdrop-blur border border-gray-200 dark:border-gray-700 rounded-full shadow-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                title="历史对话"
              >
                <MessageSquare className="w-4 h-4" />
              </button>
            </div>
            {/* 历史对话侧边栏 */}
            {showAIHistory && (
              <>
                <div
                  className="fixed inset-0 bg-black/40 z-40"
                  onClick={() => setShowAIHistory(false)}
                />
                <div className="fixed top-0 right-0 bottom-0 w-72 bg-[#FAFAF5] dark:bg-gray-800 z-50 shadow-xl flex flex-col">
                  <AIChatSidebar
                    activeConvId={activeConvId}
                    onSelectConversation={(convId) => {
                      setActiveConvId(convId);
                      setShowAIHistory(false);
                    }}
                  />
                </div>
              </>
            )}
          </div>
        ) : (
          // Memos tab: MainArea renders MemoHome
          children
        )}
      </div>

      {/* Fixed bottom tab bar */}
      {showTabBar && (
        <MobileBottomTabBar
          activeTab={activeTab}
          onTabChange={handleTabChange}
        />
      )}

      {showNewMenu && (
        <NewMenuPopup
          onClose={handleNewMenuClose}
          onDocumentCreated={handleDocumentCreated}
        />
      )}
    </div>
    </MobileToolbarProvider>
  );
}

// Inline diary rendering - uses MainArea with diaryDocId prop
import MainArea from '../MainArea';

function DiaryMainArea({ diaryDocId, onDiaryDocChange }: { diaryDocId: string; onDiaryDocChange: (id: string) => void }) {
  return <MainArea diaryDocId={diaryDocId} onDiaryDocChange={onDiaryDocChange} />;
}
