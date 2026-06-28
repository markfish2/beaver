import { useState, useCallback, useEffect, useRef, lazy, Suspense } from 'react';
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
  const { activeConvId, setActiveConvId, refreshConvList } = useUserView();
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

  // 监听桌面小组件打开 memo 输入框事件
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.fromWidget) {
        // 切换到 memos tab
        setActiveTab('memos');
        // 导航到首页
        navigate('/', { replace: true });
      }
    };
    window.addEventListener('openMemoInput', handler);
    return () => window.removeEventListener('openMemoInput', handler);
  }, [navigate]);

  // Diary state
  const [diaryDocId, setDiaryDocId] = useState<string | null>(null);

  // Is user viewing a specific document (not diary tab)?
  const isEditing = location.pathname.startsWith('/d/');

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
    console.log('[Mobile] isEditing effect', { isEditing, activeTab, prevEditing: prevEditingRef.current, path: location.pathname });
    if (prevEditingRef.current && !isEditing) {
      console.log('[Mobile] exiting editor, restoring tab:', prevTabRef.current);
      setActiveTab(prevTabRef.current);
    }
    if (isEditing) {
      prevTabRef.current = activeTab;
    }
    prevEditingRef.current = isEditing;
  }, [isEditing, activeTab]);

  const handleTabChange = useCallback((tab: MobileTab) => {
    console.log('[Mobile] handleTabChange', { tab, isEditing, activeTab, path: location.pathname });
    if (tab === 'new') {
      setShowNewMenu(true);
      return;
    }
    setActiveTab(tab);
    if (isEditing && tab !== 'diary') {
      console.log('[Mobile] switching from editor to tab, navigating to /');
      navigate('/', { replace: true });
    }
  }, [isEditing, navigate, activeTab, location.pathname]);

  // location.key === "default" 表示用户直接通过 URL 打开（历史栈无上一页）
  // 否则用 navigate(-1) 返回应用内上一页
  const handleBack = useCallback(() => {
    window.history.back();
  }, []);

  const handleSearch = useCallback((query: string) => {
    navigate(`/search?q=${encodeURIComponent(query)}`);
  }, [navigate]);

  const handleNewMenuClose = useCallback(() => {
    setShowNewMenu(false);
  }, []);

  const handleDocumentCreated = useCallback((id: string, type: string) => {
    console.log('[Mobile] handleDocumentCreated', { id, type });
    setShowNewMenu(false);
    if (type === 'folder') {
      setActiveTab('files');
      return;
    }
    // React 19 延迟 navigate()，用 window.location.href 立即跳转
    window.location.href = `/d/${id}`;
  }, []);

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
        {(() => { console.log('[Mobile] render', { isEditing, activeTab, path: location.pathname }); return null; })()}
        {isEditing && activeTab !== 'diary' ? (
          // Document editor mode: toolbar below topbar, then content
          <>
            <div style={{ height: 'calc(env(safe-area-inset-top, 0px) + 58px)', flexShrink: 0 }} />
            <ToolbarSlot showZoom={true} hasTabBar={false} />
            {children}
          </>
        ) : activeTab === 'diary' ? (
          // Diary tab: todos + toolbar + inline MainArea
          <div className="flex-1 overflow-hidden flex flex-col">
            <div style={{ height: 'calc(env(safe-area-inset-top, 0px) + 58px)', flexShrink: 0 }} />
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
            <div style={{ height: 'calc(env(safe-area-inset-top, 0px) + 58px)', flexShrink: 0 }} />
            <FileTreeView />
          </Suspense>
        ) : activeTab === 'ai' ? (
          // AI 问答 - 全屏，导航栏悬浮覆盖
          <>
            <div className="flex-1 min-h-0 relative">
              <AIChatMainView
                conversationId={activeConvId}
                onConversationCreated={(convId) => { setActiveConvId(convId); refreshConvList(); }}
              />
              {/* 历史对话按钮 */}
              <button
                onClick={() => setShowAIHistory(true)}
                className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center bg-white/80 dark:bg-gray-800/80 backdrop-blur border border-gray-200 dark:border-gray-700 rounded-full shadow-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors z-10"
                title="历史对话"
              >
                <MessageSquare className="w-4 h-4" />
              </button>
            </div>
            {/* 历史对话侧边栏 */}
            {showAIHistory && (
              <>
                <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setShowAIHistory(false)} />
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
          </>
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
