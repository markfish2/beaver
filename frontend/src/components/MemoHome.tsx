import { useState, useEffect, useRef, useCallback } from 'react';
import { Menu, Archive, X, Globe, Shuffle, Image as ImageIcon } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import MemoInput from './MemoInput';
import MemoList from './MemoList';
import MemoHeatmapCalendar from './MemoHeatmapCalendar';
import HabitTracker from './HabitTracker';
import MemoTagsPanel from './MemoTagsPanel';
import MemoWanderer from './MemoWanderer';
import MemoMediaGallery from './MemoMediaGallery';
import { getMemos, getDiarySummary, updateMemo, deleteMemo, toggleMemoPinned, toggleMemoArchived, toggleMemoPublic, updateNode } from '../api/data';
import type { Memo, Node } from '../api/data';
import { useDocuments } from '../context/DocumentContext';
import { useAuth } from '../context/AuthContext';
import { updateSettings } from '../api/auth';
import { saveViewState, loadViewState, saveMemosCache, loadMemosCache } from '../utils/pwaState';

interface MemoHomeProps {
  sidebarOpen: boolean;
  isMobile: boolean;
}

export default function MemoHome({ sidebarOpen, isMobile }: MemoHomeProps) {
  const { user } = useAuth();
  const { documents } = useDocuments();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Memo state
  const [memos, setMemos] = useState<Memo[]>([]);
  const memosRef = useRef(memos);
  memosRef.current = memos;
  const [memoPage, setMemoPage] = useState(1);
  const [memoTotal, setMemoTotal] = useState(0);
  const [memoColumns, setMemoColumns] = useState<1 | 2>(1);
  const [memoView, setMemoView] = useState<'active' | 'archived' | 'public' | 'wanderer' | 'media'>(() => {
    const saved = loadViewState();
    return saved.memoView || 'active';
  });
  const [tagFilter, setTagFilter] = useState<string | null>(() => {
    const saved = loadViewState();
    return saved.tagFilter || null;
  });
  const searchFromUrl = searchParams.get('search');
  const highlightFromUrl = searchParams.get('highlight');
  const [searchFilter, setSearchFilter] = useState<string | null>(searchFromUrl);
  const [highlightMemoId, setHighlightMemoId] = useState<string | null>(highlightFromUrl);
  const [showRightPanel, setShowRightPanel] = useState(false);
  const [allPendingTasks, setAllPendingTasks] = useState<Node[]>([]);
  const [completingTaskIds, setCompletingTaskIds] = useState<Set<string>>(new Set());

  // Refs
  const memoPageRef = useRef(memoPage);
  memoPageRef.current = memoPage;
  const memoViewRef = useRef(memoView);
  memoViewRef.current = memoView;
  const tagFilterRef = useRef(tagFilter);
  tagFilterRef.current = tagFilter;
  const searchFilterRef = useRef(searchFilter);
  searchFilterRef.current = searchFilter;

  // 从用户设置初始化 memoColumns
  useEffect(() => {
    if (user?.memo_columns === 2) {
      setMemoColumns(2);
    }
  }, [user]);

  // 切换单双栏并同步到后端
  const toggleMemoColumns = useCallback(async () => {
    const next: 1 | 2 = memoColumns === 1 ? 2 : 1;
    setMemoColumns(next);
    try {
      await updateSettings({ memo_columns: next });
    } catch (e) {
      console.error('Failed to save memo_columns setting', e);
    }
  }, [memoColumns]);

  // 首页数据搜集：日记摘要（待办任务）
  useEffect(() => {
    const fetchTasks = async () => {
      try {
        const summary = await getDiarySummary();
        setAllPendingTasks(summary.tasks);
      } catch (e) {
        console.error('获取日记摘要失败', e);
      }
    };
    fetchTasks();
  }, []);

  // 首页随想数据（根据 memoView 切换活跃/归档，支持标签/搜索筛选）
  useEffect(() => {
    const fetchMemos = async () => {
      try {
        const isArchived = memoView === 'archived';
        const isPublic = memoView === 'public';
        const data = await getMemos(1, 20, isArchived, tagFilter || undefined, searchFilter || undefined, isPublic);
        setMemos(data.memos);
        setMemoTotal(data.total);
        setMemoPage(1);
      } catch (e) {
        console.error('Failed to fetch memos', e);
      }
    };
    fetchMemos();
  }, [memoView, tagFilter, searchFilter]);

  // 从搜索结果页跳转过来时，同步 URL 参数到状态并清理
  useEffect(() => {
    if (searchFromUrl) {
      setSearchFilter(searchFromUrl);
      setTagFilter(null);
      if (highlightFromUrl) setHighlightMemoId(highlightFromUrl);
      const params = new URLSearchParams(searchParams);
      params.delete('search');
      params.delete('highlight');
      setSearchParams(params, { replace: true });
    }
  }, [searchFromUrl, highlightFromUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  // 高亮目标 memo（从搜索结果跳转过来）
  useEffect(() => {
    if (!highlightMemoId || memos.length === 0) return;
    const el = document.getElementById(`memo-${highlightMemoId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'instant', block: 'center' });
      const timer = setTimeout(() => setHighlightMemoId(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [highlightMemoId, memos]);

  // 保存视图状态到 localStorage
  useEffect(() => {
    saveViewState({ memoView, tagFilter });
  }, [memoView, tagFilter]);

  // iOS PWA 状态持久化：保存/恢复笔记缓存
  useEffect(() => {
    const saveState = () => {
      if (memos.length > 0) {
        saveMemosCache({ memos, total: memoTotal, page: memoPage, view: memoView, tag: tagFilter });
      }
    };

    const handlePageHide = () => saveState();
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') saveState();
    };

    window.addEventListener('pagehide', handlePageHide);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [memos, memoTotal, memoPage, memoView, tagFilter]);

  // 页面加载时恢复笔记缓存（仅无标签/搜索筛选时）
  useEffect(() => {
    if (!tagFilter && !searchFilter) {
      loadMemosCache().then(cache => {
        if (cache && cache.memos.length > 0 && cache.view === memoView) {
          setMemos(cache.memos as Memo[]);
          setMemoTotal(cache.total);
          setMemoPage(cache.page);
        }
      });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 全局任务完成处理器（带平滑退场动画延迟）
  const handleGlobalTaskComplete = (task: Node) => {
    if (task.is_completed) {
      const updatedContent = task.content.replace(/\[x\]/, '[ ]');
      updateNode(task.id, { content: updatedContent, is_completed: false, is_in_progress: false }).catch(error => {
        console.error('任务更新失败', error);
      });
      setAllPendingTasks(prev => prev.map(t => t.id === task.id ? { ...t, content: updatedContent, is_completed: false, is_in_progress: false } : t));
    } else if (task.is_in_progress) {
      setCompletingTaskIds(prev => new Set(prev).add(task.id));
      setTimeout(async () => {
        const updatedContent = task.content.replace(/\[-\]/, '[x]');
        try {
          await updateNode(task.id, { content: updatedContent, is_completed: true, is_in_progress: false });
          setAllPendingTasks(prev => prev.filter(t => t.id !== task.id));
          setCompletingTaskIds(prev => { const next = new Set(prev); next.delete(task.id); return next; });
        } catch (error) {
          console.error('任务更新失败', error);
          setCompletingTaskIds(prev => { const next = new Set(prev); next.delete(task.id); return next; });
        }
      }, 600);
    } else {
      const updatedContent = task.content.replace(/\[ \]/, '[-]');
      updateNode(task.id, { content: updatedContent, is_in_progress: true }).catch(error => {
        console.error('任务更新失败', error);
      });
      setAllPendingTasks(prev => prev.map(t => t.id === task.id ? { ...t, content: updatedContent, is_in_progress: true } : t));
    }
  };

  // 随想 handlers
  const handleMemoCreated = useCallback((memo: Memo) => {
    setMemos(prev => {
      const firstNonPinned = prev.findIndex(m => !m.is_pinned);
      if (firstNonPinned === -1) return [memo, ...prev];
      const result = [...prev];
      result.splice(firstNonPinned, 0, memo);
      return result;
    });
    setMemoTotal(prev => prev + 1);
  }, []);

  const handleMemoEdit = useCallback(async (id: string, content: string) => {
    const prevContent = memosRef.current.find(m => m.id === id)?.content;
    setMemos(prev => prev.map(m => m.id === id ? { ...m, content } : m));
    try {
      const updated = await updateMemo(id, content);
      setMemos(prev => prev.map(m => m.id === id ? updated : m));
    } catch (e) {
      if (prevContent !== undefined) {
        setMemos(prev => prev.map(m => m.id === id ? { ...m, content: prevContent } : m));
      }
      console.error('Failed to update memo', e);
    }
  }, []);

  const handleMemoDelete = useCallback(async (id: string) => {
    await deleteMemo(id);
    setMemos(prev => prev.filter(m => m.id !== id));
    setMemoTotal(prev => prev - 1);
  }, []);

  const handleMemoTogglePin = useCallback(async (id: string, is_pinned: boolean) => {
    const updated = await toggleMemoPinned(id, is_pinned);
    setMemos(prev => {
      const next = prev.map(m => m.id === id ? updated : m);
      return next.sort((a, b) => {
        if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
    });
  }, []);

  const handleMemoToggleArchive = useCallback(async (id: string, is_archived: boolean) => {
    await toggleMemoArchived(id, is_archived);
    setMemos(prev => prev.filter(m => m.id !== id));
    setMemoTotal(prev => prev - 1);
  }, []);

  const handleMemoTagClick = useCallback((tag: string) => {
    setSearchFilter(null);
    setTagFilter(prev => prev === tag ? null : tag);
  }, []);

  const handleMemoColorChange = useCallback((id: string, color: string | null) => {
    setMemos(prev => prev.map(m => m.id === id ? { ...m, color } : m));
  }, []);

  const handleMemoTogglePublic = useCallback(async (id: string, is_public: boolean) => {
    setMemos(prev => prev.map(m => m.id === id ? { ...m, is_public } : m));
    try {
      await toggleMemoPublic(id, is_public);
    } catch (e) {
      console.error('[TogglePublic] API error:', e);
      setMemos(prev => prev.map(m => m.id === id ? { ...m, is_public: !is_public } : m));
    }
  }, []);

  const handleLoadMoreMemos = useCallback(async () => {
    const nextPage = memoPageRef.current + 1;
    const isArchived = memoViewRef.current === 'archived';
    const isPublic = memoViewRef.current === 'public';
    const tag = tagFilterRef.current || undefined;
    const search = searchFilterRef.current || undefined;
    const data = await getMemos(nextPage, 20, isArchived, tag, search, isPublic);
    setMemos(prev => [...prev, ...data.memos]);
    setMemoPage(nextPage);
  }, []);

  return (
    <div className={`overflow-y-auto bg-[#FBF9F1] dark:bg-gray-900 custom-scrollbar ${document.documentElement.dataset.mobileLayout ? 'flex-1' : 'flex-1 h-screen'}`}
      style={document.documentElement.dataset.mobileLayout ? { paddingTop: 'calc(env(safe-area-inset-top, 0px) + 44px)', paddingBottom: '52px' } : undefined}
    >
      {/* 移动端菜单按钮 (hidden when MobileLayout is active) */}
      {isMobile && !sidebarOpen && !showRightPanel && !document.documentElement.dataset.mobileLayout && (
        <button
          onClick={() => {
            const event = new CustomEvent('toggleSidebar');
            window.dispatchEvent(event);
          }}
          className="lg:hidden fixed left-4 z-40 p-2.5 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 rounded-full shadow-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}
          title="打开菜单"
        >
          <Menu className="w-5 h-5" />
        </button>
      )}

      <div className="flex flex-row max-w-6xl mx-auto px-4 pb-20 gap-6" style={{ paddingTop: document.documentElement.dataset.mobileLayout ? '24px' : 'calc(env(safe-area-inset-top, 0px) + 24px)' }}>
        {/* 左栏：输入框 + 待办 + 随想 */}
        <div className="flex-1 min-w-0">
          {memoView === 'active' && <MemoInput onMemoCreated={handleMemoCreated} documents={documents} />}

          {/* 待办事项（仅日记待办，归档/公开视图不显示） */}
          {memoView === 'active' && allPendingTasks.length > 0 && (
            <div className="mb-6">
              <h2 className="text-sm font-semibold text-gray-400 dark:text-gray-500 mb-3 uppercase tracking-wider">未完成事项</h2>
              <div className="bg-white dark:bg-gray-800/50 rounded-2xl p-4 border border-[#ebebeb] dark:border-gray-700 ">
                <div>
                  {allPendingTasks.map(task => {
                    const isCompleting = completingTaskIds.has(task.id);
                    const inProgress = task.is_in_progress && !isCompleting;
                    return (
                      <div
                        key={task.id}
                        className={`flex items-center group transition-all duration-500 ease-out pb-1.5 mb-1 border-b border-gray-100 dark:border-gray-700/50 last:border-0 last:mb-0 last:pb-0 ${
                          isCompleting ? 'opacity-0 translate-x-4 scale-95' : 'opacity-100'
                        }`}
                      >
                        <span
                          role="checkbox"
                          aria-checked={isCompleting}
                          className={`inline-flex items-center justify-center w-4 h-4 rounded-full border cursor-pointer shrink-0 transition-colors ${
                            isCompleting
                              ? 'bg-blue-500 border-blue-500'
                              : inProgress
                                ? 'bg-white dark:bg-gray-700 border-blue-400'
                                : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-500'
                          }`}
                          onClick={() => !isCompleting && handleGlobalTaskComplete(task)}
                        >
                          {isCompleting ? (
                            <svg viewBox="0 0 16 16" fill="none" className="w-2.5 h-2.5 text-white" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M3.5 8.5L6.5 11.5L12.5 4.5" />
                            </svg>
                          ) : inProgress ? (
                            <span className="w-2 h-0.5 bg-blue-400 rounded-full"></span>
                          ) : null}
                        </span>
                        <span
                          className={`ml-3 cursor-pointer transition-all duration-300 truncate text-base ${
                            isCompleting
                              ? 'text-gray-700 dark:text-gray-300'
                              : inProgress
                                ? 'text-blue-500 dark:text-blue-400'
                                : 'text-gray-700 dark:text-gray-300 hover:text-blue-600'
                          }`}
                          onClick={() => !isCompleting && navigate(`/d/${task.document_id}?nodeId=${task.id}`)}
                          title={task.content.replace(/\[[ xX-]\]/, '').trim()}
                        >
                          {task.content.replace(/\[[ xX-]\]/, '').trim() || '无标题任务'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* 随想记录 */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                {memoView !== 'active' && (
                  <button
                    onClick={() => { setMemoView('active'); setTagFilter(null); setSearchFilter(null); }}
                    className="flex items-center gap-1 px-2 py-1 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                    title="返回随想"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    <span>返回</span>
                  </button>
                )}
                <h2 className="text-sm font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                  {memoView === 'archived' ? '已归档' : memoView === 'public' ? '已公开' : memoView === 'wanderer' ? '随机漫游' : memoView === 'media' ? '图片文件' : '随想记录'}
                </h2>
              </div>
              {memoView !== 'media' && (
              <button
                onClick={toggleMemoColumns}
                className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                title={memoColumns === 1 ? '切换双栏' : '切换单栏'}
              >
                {memoColumns === 1 ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
                  </svg>
                )}
              </button>
              )}
            </div>
            {tagFilter && (
              <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800">
                <span className="text-sm text-blue-600 dark:text-blue-400">筛选: {tagFilter}</span>
                <button
                  onClick={() => setTagFilter(null)}
                  className="ml-auto p-0.5 text-blue-400 hover:text-blue-600 dark:hover:text-blue-300 rounded transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            {searchFilter && (
              <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800">
                <span className="text-sm text-blue-600 dark:text-blue-400">搜索: {searchFilter}</span>
                <button
                  onClick={() => setSearchFilter(null)}
                  className="ml-auto p-0.5 text-blue-400 hover:text-blue-600 dark:hover:text-blue-300 rounded transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            {memoView === 'wanderer' ? (
              <MemoWanderer onExit={() => { setMemoView('active'); setTagFilter(null); setSearchFilter(null); }} />
            ) : memoView === 'media' ? (
              <MemoMediaGallery />
            ) : (
              <MemoList
                memos={memos}
                columns={memoColumns}
                onEdit={handleMemoEdit}
                onDelete={handleMemoDelete}
                onTogglePin={handleMemoTogglePin}
                onToggleArchive={handleMemoToggleArchive}
                onTogglePublic={handleMemoTogglePublic}
                onTagClick={handleMemoTagClick}
                onColorChange={handleMemoColorChange}
                onLoadMore={handleLoadMoreMemos}
                hasMore={memos.length < memoTotal}
                highlightId={highlightMemoId}
                documents={documents}
              />
            )}
          </div>
        </div>

        {/* 右栏：桌面端内联显示 */}
        <div className="hidden lg:block w-72 shrink-0">
          <div className="space-y-4">
            <MemoHeatmapCalendar />
            <HabitTracker />
            {/* 已归档 / 已公开 */}
            <div className="bg-white dark:bg-gray-800/50 rounded-2xl border border-[#ebebeb] dark:border-gray-700 overflow-hidden ">
              <button
                onClick={() => { setMemoView(memoView === 'archived' ? 'active' : 'archived'); setTagFilter(null); setSearchFilter(null); }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-base font-medium transition-colors ${
                  memoView === 'archived'
                    ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                <Archive className="w-4 h-4" />
                <span>已归档</span>
              </button>
              <div className="border-t border-gray-100 dark:border-gray-700" />
              <button
                onClick={() => { setMemoView(memoView === 'public' ? 'active' : 'public'); setTagFilter(null); setSearchFilter(null); }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-base font-medium transition-colors ${
                  memoView === 'public'
                    ? 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                <Globe className="w-4 h-4" />
                <span>已公开</span>
              </button>
              <div className="border-t border-gray-100 dark:border-gray-700" />
              <button
                onClick={() => { setMemoView(memoView === 'wanderer' ? 'active' : 'wanderer'); setTagFilter(null); setSearchFilter(null); }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-base font-medium transition-colors ${
                  memoView === 'wanderer'
                    ? 'text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                <Shuffle className="w-4 h-4" />
                <span>随机漫游</span>
              </button>
              <div className="border-t border-gray-100 dark:border-gray-700" />
              <button
                onClick={() => { setMemoView(memoView === 'media' ? 'active' : 'media'); setTagFilter(null); setSearchFilter(null); }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-base font-medium transition-colors ${
                  memoView === 'media'
                    ? 'text-pink-600 dark:text-pink-400 bg-pink-50 dark:bg-pink-900/20'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                <ImageIcon className="w-4 h-4" />
                <span>图片文件</span>
              </button>
            </div>
            <MemoTagsPanel onTagClick={handleMemoTagClick} activeTag={tagFilter} />
          </div>
        </div>
      </div>

      {/* 移动端：右栏展开/收起按钮 */}
      {!sidebarOpen && (
      <button
        onClick={() => setShowRightPanel(!showRightPanel)}
        className="lg:hidden fixed right-4 z-40 p-2.5 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 rounded-full shadow-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        style={{ bottom: document.documentElement.dataset.mobileLayout ? 'calc(env(safe-area-inset-bottom, 0px) + 72px)' : 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}
        title={showRightPanel ? '收起面板' : '展开日历和标签'}
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          {showRightPanel ? (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
          )}
        </svg>
      </button>
      )}

      {/* 移动端：右栏浮层 */}
      {showRightPanel && (
        <div className="lg:hidden fixed inset-0 z-30" onClick={() => setShowRightPanel(false)}>
          <div
            className="absolute right-0 w-72 bg-white dark:bg-gray-900 shadow-xl overflow-y-auto custom-scrollbar p-4 space-y-4"
            style={{
              top: document.documentElement.dataset.mobileLayout
                ? 'calc(env(safe-area-inset-top, 0px) + 44px)'
                : '0px',
              bottom: document.documentElement.dataset.mobileLayout
                ? 'calc(env(safe-area-inset-bottom, 0px) + 52px)'
                : '0px',
              paddingTop: document.documentElement.dataset.mobileLayout ? '16px' : 'calc(env(safe-area-inset-top) + 16px)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <MemoHeatmapCalendar />
            <HabitTracker />
            {/* 已归档 / 已公开 */}
            <div className="bg-white dark:bg-gray-800/50 rounded-2xl border border-[#ebebeb] dark:border-gray-700 overflow-hidden ">
              <button
                onClick={() => { setMemoView(memoView === 'archived' ? 'active' : 'archived'); setTagFilter(null); setSearchFilter(null); setShowRightPanel(false); }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-base font-medium transition-colors ${
                  memoView === 'archived'
                    ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                <Archive className="w-4 h-4" />
                <span>已归档</span>
              </button>
              <div className="border-t border-gray-100 dark:border-gray-700" />
              <button
                onClick={() => { setMemoView(memoView === 'public' ? 'active' : 'public'); setTagFilter(null); setSearchFilter(null); setShowRightPanel(false); }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-base font-medium transition-colors ${
                  memoView === 'public'
                    ? 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                <Globe className="w-4 h-4" />
                <span>已公开</span>
              </button>
              <div className="border-t border-gray-100 dark:border-gray-700" />
              <button
                onClick={() => { setMemoView(memoView === 'wanderer' ? 'active' : 'wanderer'); setTagFilter(null); setSearchFilter(null); setShowRightPanel(false); }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-base font-medium transition-colors ${
                  memoView === 'wanderer'
                    ? 'text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                <Shuffle className="w-4 h-4" />
                <span>随机漫游</span>
              </button>
              <div className="border-t border-gray-100 dark:border-gray-700" />
              <button
                onClick={() => { setMemoView(memoView === 'media' ? 'active' : 'media'); setTagFilter(null); setSearchFilter(null); setShowRightPanel(false); }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-base font-medium transition-colors ${
                  memoView === 'media'
                    ? 'text-pink-600 dark:text-pink-400 bg-pink-50 dark:bg-pink-900/20'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                <ImageIcon className="w-4 h-4" />
                <span>图片文件</span>
              </button>
            </div>
            <MemoTagsPanel onTagClick={(tag) => { handleMemoTagClick(tag); setShowRightPanel(false); }} activeTag={tagFilter} />
          </div>
        </div>
      )}
    </div>
  );
}
