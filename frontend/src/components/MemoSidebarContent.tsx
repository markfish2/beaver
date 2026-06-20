import { useState, useCallback, useEffect } from 'react';
import { Archive, Globe, Shuffle, Image as ImageIcon } from 'lucide-react';
import MemoHeatmapCalendar from './MemoHeatmapCalendar';
import HabitTracker from './HabitTracker';
import MemoTagsPanel from './MemoTagsPanel';

const MEMO_VIEW_KEY = 'miniflowy-memo-view';
const MEMO_TAG_KEY = 'miniflowy-memo-tag';

type MemoView = 'active' | 'archived' | 'public' | 'wanderer' | 'media';

/**
 * Memo 侧边栏内容组件
 * 在左侧栏展开时显示，替代原来的右侧边栏
 */
export default function MemoSidebarContent() {
  const [memoView, setMemoView] = useState<MemoView>(
    () => (localStorage.getItem(MEMO_VIEW_KEY) as MemoView) || 'active'
  );
  const [activeTag, setActiveTag] = useState<string | null>(
    () => localStorage.getItem(MEMO_TAG_KEY) || null
  );

  // 监听 MemoHome 的状态变化，同步侧边栏高亮
  useEffect(() => {
    const handleViewChange = (e: Event) => {
      const { view, tag, source } = (e as CustomEvent).detail;
      if (source === 'sidebar') return; // 忽略自己派发的事件
      if (view !== undefined) setMemoView(view);
      if (tag !== undefined) setActiveTag(tag);
    };
    window.addEventListener('memo-view-change', handleViewChange);
    return () => window.removeEventListener('memo-view-change', handleViewChange);
  }, []);

  // 切换视图模式
  const switchView = useCallback((view: MemoView) => {
    const newView = memoView === view ? 'active' : view;
    setMemoView(newView);
    setActiveTag(null);
    localStorage.setItem(MEMO_VIEW_KEY, newView);
    localStorage.removeItem(MEMO_TAG_KEY);
    window.dispatchEvent(new CustomEvent('memo-view-change', { detail: { view: newView, tag: null, source: 'sidebar' } }));
  }, [memoView]);

  // 点击标签
  const handleTagClick = useCallback((tag: string) => {
    const newTag = activeTag === tag ? null : tag;
    setActiveTag(newTag);
    if (newTag) {
      localStorage.setItem(MEMO_TAG_KEY, newTag);
    } else {
      localStorage.removeItem(MEMO_TAG_KEY);
    }
    window.dispatchEvent(new CustomEvent('memo-view-change', { detail: { view: 'active', tag: newTag, source: 'sidebar' } }));
  }, [activeTag]);

  const btnClass = (active: boolean, color: string) =>
    `w-full flex items-center gap-2 px-3 py-1.5 text-sm font-medium transition-colors rounded-md ${
      active
        ? `text-${color}-600 dark:text-${color}-400 bg-${color}-50 dark:bg-${color}-900/20`
        : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/50'
    }`;

  return (
    <div className="px-3 py-3 space-y-4">
      {/* 热力日历 */}
      <MemoHeatmapCalendar embedded />

      {/* 习惯打卡 */}
      <HabitTracker embedded />

      {/* 快捷操作按钮 */}
      <div className="space-y-0.5">
        <button onClick={() => switchView('archived')} className={btnClass(memoView === 'archived', 'blue')}>
          <Archive className="w-4 h-4" />
          <span>已归档</span>
        </button>
        <button onClick={() => switchView('public')} className={btnClass(memoView === 'public', 'green')}>
          <Globe className="w-4 h-4" />
          <span>已公开</span>
        </button>
        <button onClick={() => switchView('wanderer')} className={btnClass(memoView === 'wanderer', 'purple')}>
          <Shuffle className="w-4 h-4" />
          <span>随机漫游</span>
        </button>
        <button onClick={() => switchView('media')} className={btnClass(memoView === 'media', 'pink')}>
          <ImageIcon className="w-4 h-4" />
          <span>图片文件</span>
        </button>
      </div>

      {/* 标签 */}
      <MemoTagsPanel activeTag={activeTag} onTagClick={handleTagClick} embedded />
    </div>
  );
}
