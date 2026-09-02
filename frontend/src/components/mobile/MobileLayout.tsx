import { useState, useCallback, useEffect, useRef, lazy, Suspense } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import MobileTopBar from './MobileTopBar';
import MobileBottomTabBar, { type MobileTab } from './MobileBottomTabBar';
import MobileToolbar from '../MobileToolbar';
import { MobileToolbarProvider, useMobileToolbar } from '../../context/MobileToolbarContext';
import { MobileEditorActionsProvider } from '../EditorActionPortal';
import { getMonthlyDiary, getOrCreateDayNode } from '../../api/data';
import NewMenuPopup from './NewMenuPopup';
import AIChatMainView from '../AIChatMainView';
import AIChatSidebar from '../AIChatSidebar';
import { useUserView } from '../../context/UserViewContext';
import type { ReactNode } from 'react';
import { createMobileDocumentState, getMobileTabFromState, resolveMobileBackTarget } from '../../utils/mobileNavigation';
import { useViewportMetrics } from '../../hooks/useViewportMetrics';
import { useMobileScrollChrome } from '../../hooks/useMobileScrollChrome';

const FileTreeView = lazy(() => import('./FileTreeView'));
const MobileTodos = lazy(() => import('./MobileTodos'));

interface MobileLayoutProps {
  children: ReactNode;
}

  // ToolbarSlot 是根 Flex 容器的底部子节点，键盘缩小 100dvh 后自然位于键盘上方。
function ToolbarSlot({ showZoom, hasTabBar, enabled }: {
  showZoom?: boolean;
  hasTabBar?: boolean;
  enabled: boolean;
}) {
  const { isVisible, handlers } = useMobileToolbar();
  return (
    <>
      <MobileToolbar
        isVisible={enabled && isVisible}
        onIndent={handlers?.onIndent ?? (() => {})}
        onOutdent={handlers?.onOutdent ?? (() => {})}
        onToggleTodo={handlers?.onToggleTodo ?? (() => {})}
        onAddNote={handlers?.onAddNote ?? (() => {})}
        onTag={handlers?.onTag ?? (() => {})}
        onMoveUp={handlers?.onMoveUp ?? (() => {})}
        onMoveDown={handlers?.onMoveDown ?? (() => {})}
        onZoom={handlers?.onZoom ?? (() => {})}
        showZoom={showZoom}
        hasTabBar={hasTabBar}
      />
    </>
  );
}

export default function MobileLayout({ children }: MobileLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { userSubView, setUserSubView, activeConvId, setActiveConvId, refreshConvList } = useUserView();
  const [activeTab, setActiveTab] = useState<MobileTab>(
    () => getMobileTabFromState(location.state) ?? 'memos',
  );
  const [showNewMenu, setShowNewMenu] = useState(false);
  const [showAIHistory, setShowAIHistory] = useState(false);
  const prevTabRef = useRef<MobileTab>('memos');
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const { keyboardOpen: viewportKeyboardOpen } = useViewportMetrics();
  const chromeHidden = useMobileScrollChrome(false, keyboardOpen || viewportKeyboardOpen);
  const topChromeHidden = activeTab !== 'diary' && chromeHidden;

  // 编辑区获得焦点后，始终把光标所在节点滚到可视范围；不能用焦点状态
  // 全局隐藏底部 Tab，普通笔记、画布、Memo 等编辑区域仍应保留导航。
  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      return target.isContentEditable
        || target.tagName === 'INPUT'
        || target.tagName === 'TEXTAREA';
    };
    const handleFocusIn = (event: FocusEvent) => {
      if (isEditableTarget(event.target) && event.target instanceof HTMLElement) {
        const focusedElement = event.target;
        window.setTimeout(() => {
          focusedElement.scrollIntoView({
            behavior: 'smooth',
            block: 'nearest',
            inline: 'nearest',
          });
        }, 300);
      }
    };
    document.addEventListener('focusin', handleFocusIn);
    return () => {
      document.removeEventListener('focusin', handleFocusIn);
    };
  }, []);

  // 键盘弹出时统一隐藏底部 Tab，键盘收起后恢复；不依赖编辑框是否失焦。
  useEffect(() => {
    const handler = (event: Event) => {
      const open = (event as CustomEvent<{ open?: boolean }>).detail?.open ?? false;
      setKeyboardOpen(open);
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

  // URL 是移动端入口状态的可恢复来源；点击文件/项目等入口后，避免仍停留在上一次的随想视图。
  useEffect(() => {
    const view = new URLSearchParams(location.search).get('view');
    const nextTab: MobileTab | null = view === 'diary'
      ? 'diary'
      : view === 'starred'
        ? 'starred'
        : view === 'files' || view === 'projects' || view === 'recent'
          ? 'files'
        : view === 'ai'
          ? 'ai'
          : null;
    if (nextTab && !isEditing) {
      window.setTimeout(() => setActiveTab(nextTab), 0);
    }
  }, [isEditing, location.search]);

  const prevEditingRef = useRef(false);
  useEffect(() => {
    if (prevEditingRef.current && !isEditing) {
      setActiveTab(prevTabRef.current);
    }
    if (isEditing) {
      prevTabRef.current = activeTab;
    }
    prevEditingRef.current = isEditing;
  }, [isEditing, activeTab]);

  const handleTabChange = useCallback((tab: MobileTab) => {
    if (tab === 'new') {
      setShowNewMenu(true);
      return;
    }
    // 离开日记编辑时，立即清理键盘/快捷栏状态，避免旧的工具栏
    // 在文件、memo 或 AI 页面切换完成前暂时顶替底部导航栏。
    setKeyboardOpen(false);
    window.dispatchEvent(new CustomEvent('keyboard-change', { detail: { open: false } }));
    setActiveTab(tab);
    if (tab === 'starred') {
      navigate('/?view=starred', { replace: true });
    } else if (tab === 'files') {
      navigate('/', { replace: true });
    } else if (tab === 'memos') {
      navigate('/', { replace: true });
    } else if (isEditing && tab !== 'diary') {
      navigate('/', { replace: true });
    }
  }, [isEditing, navigate]);

  const handleBack = useCallback(() => {
    if (userSubView) {
      setUserSubView(null);
      return;
    }

    // 大纲与思维导图共用同一条文档路由。返回时先回到同一篇笔记的大纲，
    // 避免把思维导图误当成文档入口直接退回列表。
    const documentMatch = location.pathname.match(/^\/d\/([^/]+)$/);
    if (documentMatch) {
      try {
        const activeTabKey = sessionStorage.getItem('beaver:active-document-tab:v1');
        if (activeTabKey === `${documentMatch[1]}:mindmap`) {
          window.dispatchEvent(new CustomEvent('mobile-outline-back', {
            detail: { documentId: documentMatch[1] },
          }));
          return;
        }
      } catch {
        // sessionStorage 不可用时继续使用普通返回逻辑。
      }
    }

    const target = resolveMobileBackTarget(location.key, location.state, window.history.length);
    if (target.kind === 'history') {
      navigate(-1);
      return;
    }
    if (target.tab) {
      setActiveTab(target.tab);
    }
    const targetPath = target.tab === 'starred' ? '/?view=starred' : target.to;
    navigate(targetPath, {
      replace: true,
      state: target.tab ? { mobileReturnTab: target.tab } : undefined,
    });
  }, [location.key, location.pathname, location.state, navigate, setUserSubView, userSubView]);

  const handleSearch = useCallback((query: string) => {
    navigate(`/search?q=${encodeURIComponent(query)}`, {
      state: createMobileDocumentState(
        `${location.pathname}${location.search}`,
        activeTab,
      ),
    });
  }, [activeTab, location.pathname, location.search, navigate]);

  const handleNewMenuClose = useCallback(() => {
    setShowNewMenu(false);
  }, []);

  const handleDocumentCreated = useCallback((id: string, type: string) => {
    setShowNewMenu(false);
    if (type === 'folder') {
      setActiveTab('files');
      return;
    }
    navigate(`/d/${id}`, {
      state: createMobileDocumentState('/', activeTab),
    });
  }, [activeTab, navigate]);

  // Determine top bar title
  const getTopBarTitle = () => {
    if (isEditing) return '编辑';
    if (userSubView) {
      switch (userSubView) {
        case 'profile': return '个人资料';
        case 'appearance': return '外观与主题';
        case 'token': return 'API Token';
        case 'ai': return 'AI 设置';
        case 'trash': return '回收站';
        case 'password': return '修改密码';
        default: return '设置';
      }
    }
    switch (activeTab) {
      case 'memos': return '随想';
      case 'diary': return '日记';
      case 'files': return '文件';
      case 'starred': return '收藏';
      case 'ai': return 'AI 问答';
      default: return '随想';
    }
  };

  // 只要键盘弹出，所有界面都隐藏底部 Tab；键盘收起后恢复。
  // 编辑框焦点本身不参与判断，避免普通编辑区域因焦点残留而永久隐藏。
  const showTabBar = (!isEditing || activeTab === 'diary')
    && !keyboardOpen
    && !viewportKeyboardOpen;
  const mobileView = new URLSearchParams(location.search).get('view');
  const fileViewMode = mobileView === 'recent' ? 'recent' : mobileView === 'starred' ? 'starred' : 'all';


  return (
    <MobileToolbarProvider>
    <MobileEditorActionsProvider>
    <div className="app-container flex flex-col bg-[var(--app-canvas)] dark:bg-gray-900" style={{ height: '100dvh', width: '100vw', overflow: 'hidden' }}>
      {/*
       * 顶部操作栏隐藏时的沉浸渐变。
       * 渐变从安全区下方开始，不能覆盖系统状态栏，避免 Chrome PWA
       * 将状态栏与网页内容之间再次绘制出接缝线。
       */}
      <div
        aria-hidden="true"
        className={`mobile-top-gradient ${topChromeHidden ? 'is-visible' : ''}`}
      />
      <MobileTopBar
        title={getTopBarTitle()}
        showBack={isEditing || !!userSubView}
        isDocumentPage={isEditing && activeTab !== 'diary'}
        onBack={handleBack}
        onSearch={handleSearch}
        showAIHistory={activeTab === 'ai' && !isEditing && !userSubView}
        onAIHistory={() => setShowAIHistory(true)}
        // 日记的实际内容滚动区在下方，顶部功能栏始终保留。
        chromeHidden={topChromeHidden}
      />

      <div className="flex-1 overflow-hidden flex flex-col">
        {location.pathname === '/search' ? (
          // 搜索结果页
          children
        ) : isEditing && activeTab !== 'diary' ? (
          // Document editor mode: toolbar below topbar, then content
          <>
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
            <div className="flex-1 min-h-0 overflow-y-auto scrollbar-none">
              {diaryDocId ? (
                <DiaryMainArea diaryDocId={diaryDocId} onDiaryDocChange={setDiaryDocId} />
              ) : (
                <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">加载中...</div>
              )}
            </div>
          </div>
        ) : mobileView === 'projects' ? (
          // 项目详情由 MainArea/ProjectView 负责，不能误降级成文件树。
          children
        ) : activeTab === 'files' || activeTab === 'starred' ? (
          <Suspense fallback={<div className="flex-1 flex items-center justify-center text-gray-400 text-sm">加载中...</div>}>
            <div
              aria-hidden="true"
              style={{
                // 顶部栏隐藏只改变自身视觉状态，不改变安全区占位；否则内容会
                // 突然顶到状态栏边界，部分 Chrome PWA 会绘制一条分隔线。
                height: 'calc(env(safe-area-inset-top, 0px) + 58px)',
                flexShrink: 0,
              }}
            />
            <FileTreeView viewMode={fileViewMode} />
          </Suspense>
        ) : activeTab === 'ai' ? (
          // AI 问答 - 全屏，导航栏悬浮覆盖
          <>
            <div className="flex-1 min-h-0 relative">
              <AIChatMainView
                conversationId={activeConvId}
                onConversationCreated={(convId) => { setActiveConvId(convId); refreshConvList(); }}
              />
            </div>
            {/* 历史对话侧边栏 */}
            {showAIHistory && (
              <>
                <div className="fixed inset-0 z-[var(--layer-overlay)]" onClick={() => setShowAIHistory(false)} />
                <div
                  className="fixed left-3 z-[var(--layer-overlay)] flex w-[min(85vw,320px)] flex-col overflow-hidden rounded-[28px] border border-white/70 bg-[var(--app-sidebar)]/95 shadow-2xl backdrop-blur-2xl backdrop-saturate-150 dark:border-gray-700/70"
                  style={{
                    top: 'calc(env(safe-area-inset-top, 0px) + 72px)',
                    bottom: 'calc(env(safe-area-inset-bottom, 0px) + 78px)',
                  }}
                >
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

      {/* 键盘快捷工具栏必须位于根 Flex 容器底部，不能悬浮在编辑区之外。 */}
      <ToolbarSlot
        showZoom={isEditing && activeTab !== 'diary'}
        hasTabBar={activeTab === 'diary'}
        enabled={isEditing || activeTab === 'diary'}
      />

      {/* Fixed bottom tab bar */}
      {showTabBar && (
        <MobileBottomTabBar
          activeTab={activeTab}
          onTabChange={handleTabChange}
          chromeHidden={chromeHidden}
          newMenuOpen={showNewMenu}
        />
      )}

      {showNewMenu && (
        <NewMenuPopup
          onClose={handleNewMenuClose}
          onDocumentCreated={handleDocumentCreated}
        />
      )}
    </div>
    </MobileEditorActionsProvider>
    </MobileToolbarProvider>
  );
}

// Inline diary rendering - uses MainArea with diaryDocId prop
import MainArea from '../MainArea';

function DiaryMainArea({ diaryDocId, onDiaryDocChange }: { diaryDocId: string; onDiaryDocChange: (id: string) => void }) {
  return <MainArea diaryDocId={diaryDocId} onDiaryDocChange={onDiaryDocChange} />;
}
