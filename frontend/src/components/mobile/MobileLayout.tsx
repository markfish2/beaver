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
  const { activeConvId, setActiveConvId, refreshConvList, setUserSubView, setMobileEditingDocId } = useUserView();
  const [activeTab, setActiveTab] = useState<MobileTab>('memos');
  const [showNewMenu, setShowNewMenu] = useState(false);
  const [showAIHistory, setShowAIHistory] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  // ── 状态导航：用 editingDocId 控制编辑器显示 ──
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [prevTab, setPrevTab] = useState<MobileTab>('memos');
  const isEditing = editingDocId !== null;

  // 同步 editingDocId 到 context，让 MainArea 能读取
  useEffect(() => {
    setMobileEditingDocId(editingDocId);
  }, [editingDocId, setMobileEditingDocId]);
  // 标记是否由代码触发的 pushState，避免 popstate 重复处理
  const programmaticNav = useRef(false);

  // 监听 URL 变化：处理直接访问 /d/{id} 和文件树点击导航
  useEffect(() => {
    const match = location.pathname.match(/^\/d\/(.+)$/);
    if (match) {
      const urlDocId = match[1];
      if (urlDocId !== editingDocId) {
        setPrevTab(activeTab);
        setEditingDocId(urlDocId);
      }
    } else if (editingDocId && !programmaticNav.current) {
      // URL 变成 / 且不是代码触发的 → 清除编辑状态
      setEditingDocId(null);
    }
  }, [location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  // editingDocId 变化时同步 URL（pushState 不触发 React 重渲染）
  useEffect(() => {
    if (editingDocId) {
      programmaticNav.current = true;
      window.history.pushState(null, '', `/d/${editingDocId}`);
    }
  }, [editingDocId]);

  // 监听浏览器返回按钮（popstate）
  useEffect(() => {
    const handler = () => {
      if (programmaticNav.current) {
        programmaticNav.current = false;
        return;
      }
      // 浏览器返回：从 URL 判断应该显示什么
      const match = window.location.pathname.match(/^\/d\/(.+)$/);
      if (match) {
        setEditingDocId(match[1]);
      } else {
        setEditingDocId(null);
        // 恢复 tab（从 URL 或默认）
        setActiveTab('memos');
      }
    };
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, []);

  // 监听键盘状态
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

  // ── 进入编辑器 ──
  const enterEditor = useCallback((id: string) => {
    setPrevTab(activeTab);
    setUserSubView(null);
    setDiaryDocId(null);
    setEditingDocId(id);
  }, [activeTab, setUserSubView]);

  // ── 返回 ──
  const handleBack = useCallback(() => {
    setEditingDocId(null);
    setActiveTab(prevTab);
    setUserSubView(null);
    programmaticNav.current = true;
    window.history.replaceState(null, '', '/');
  }, [prevTab, setUserSubView]);

  const handleTabChange = useCallback((tab: MobileTab) => {
    if (tab === 'new') {
      setShowNewMenu(true);
      return;
    }
    if (tab !== 'diary') {
      setDiaryDocId(null);
    }
    setActiveTab(tab);
    // 切换 tab 时如果在编辑中，退出编辑
    if (isEditing) {
      setEditingDocId(null);
      programmaticNav.current = true;
      window.history.replaceState(null, '', '/');
    }
  }, [isEditing]);

  const handleSearch = useCallback((query: string) => {
    navigate(`/search?q=${encodeURIComponent(query)}`);
  }, [navigate]);

  const handleNewMenuClose = useCallback(() => {
    setShowNewMenu(false);
  }, []);

  const handleDocumentCreated = useCallback((id: string, type: string) => {
    setShowNewMenu(false);
    setUserSubView(null);
    setDiaryDocId(null);
    if (type === 'folder') {
      setActiveTab('files');
    } else {
      setPrevTab(activeTab);
      setEditingDocId(id);
    }
  }, [activeTab, setUserSubView]);

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
          // Document editor mode
          <>
            <div style={{ height: 'calc(env(safe-area-inset-top, 0px) + 44px)', flexShrink: 0 }} />
            <ToolbarSlot showZoom={true} hasTabBar={false} />
            {children}
          </>
        ) : activeTab === 'diary' ? (
          // Diary tab
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
          <div className="flex-1 flex flex-col overflow-hidden">
            <div style={{ height: 'calc(env(safe-area-inset-top, 0px) + 44px)', flexShrink: 0 }} />
            <div className="flex-1 relative overflow-hidden flex flex-col">
              <div className="flex-1 min-h-0">
                <AIChatMainView
                  conversationId={activeConvId}
                  onConversationCreated={(convId) => { setActiveConvId(convId); refreshConvList(); }}
                />
              </div>
              <div style={{ height: 'calc(60px + env(safe-area-inset-bottom, 0px))', flexShrink: 0 }} />
              <button
                onClick={() => setShowAIHistory(true)}
                className="absolute top-2 right-2 w-8 h-8 flex items-center justify-center bg-white/80 dark:bg-gray-800/80 backdrop-blur border border-gray-200 dark:border-gray-700 rounded-full shadow-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                title="历史对话"
              >
                <MessageSquare className="w-4 h-4" />
              </button>
            </div>
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
          children
        )}
      </div>

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

import MainArea from '../MainArea';

function DiaryMainArea({ diaryDocId, onDiaryDocChange }: { diaryDocId: string; onDiaryDocChange: (id: string) => void }) {
  return <MainArea diaryDocId={diaryDocId} onDiaryDocChange={onDiaryDocChange} />;
}
