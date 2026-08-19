import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import DocumentTypeIcon from './DocumentTypeIcon';
import type { DocumentTab } from './documentTabTypes';

interface DocumentTabsProps {
  tabs: DocumentTab[];
  activeKey: string | null;
  onSelect: (tab: DocumentTab) => void;
  onClose: (tab: DocumentTab) => void;
}

export default function DocumentTabs({ tabs, activeKey, onSelect, onClose }: DocumentTabsProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;
    setCanScrollLeft(element.scrollLeft > 1);
    setCanScrollRight(element.scrollLeft + element.clientWidth < element.scrollWidth - 1);
  }, []);

  useEffect(() => {
    updateScrollState();
    const element = scrollRef.current;
    if (!element) return;
    const observer = new ResizeObserver(updateScrollState);
    observer.observe(element);
    return () => observer.disconnect();
  }, [tabs.length, updateScrollState]);

  useEffect(() => {
    const activeTab = scrollRef.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    activeTab?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    requestAnimationFrame(updateScrollState);
  }, [activeKey, updateScrollState]);

  const scrollTabs = (direction: 'left' | 'right') => {
    scrollRef.current?.scrollBy({ left: direction === 'left' ? -240 : 240, behavior: 'smooth' });
    window.setTimeout(updateScrollState, 220);
  };

  return (
    <div className="flex min-w-0 flex-1 items-center" role="tablist" aria-label="已打开的笔记">
      <button
        type="button"
        onClick={() => scrollTabs('left')}
        disabled={!canScrollLeft}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:pointer-events-none disabled:opacity-0 dark:hover:bg-gray-800 dark:hover:text-gray-200"
        aria-label="查看前面的笔记 Tab"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <div ref={scrollRef} onScroll={updateScrollState} className="document-tabs min-w-0 flex-1 overflow-x-auto scrollbar-none">
      <div className="flex min-w-max items-center gap-1 px-1">
        {tabs.map(tab => {
          const isActive = tab.key === activeKey;
          const iconType = tab.mode === 'mindmap' ? 'document' : tab.type;
          return (
            <div
              key={tab.key}
              role="tab"
              aria-selected={isActive}
              className={`group flex h-8 max-w-[220px] min-w-[120px] items-center gap-1.5 rounded-md px-2 text-sm transition-colors ${
                isActive
                  ? 'bg-[#c9ddd7] font-medium text-[#285f52] dark:bg-[#3f7468] dark:text-white'
                  : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200'
              }`}
            >
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-left"
                onClick={() => onSelect(tab)}
                aria-label={tab.mode === 'mindmap' ? `${tab.title} · 思维导图` : tab.title || '无标题'}
              >
                <DocumentTypeIcon type={iconType} className="h-4 w-4" />
                <span className="truncate">{tab.title || '无标题'}</span>
                {tab.mode === 'mindmap' && <span className="shrink-0 text-[10px] opacity-60">图</span>}
                {tab.dirty && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#4d9383]" aria-label="有未保存修改" />}
              </button>
              <button
                type="button"
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-current opacity-60 transition-opacity hover:bg-black/10 hover:opacity-100 dark:hover:bg-white/10"
                onClick={(event) => {
                  event.stopPropagation();
                  onClose(tab);
                }}
                aria-label={`关闭${tab.title || '无标题'}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
      </div>
      <button
        type="button"
        onClick={() => scrollTabs('right')}
        disabled={!canScrollRight}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:pointer-events-none disabled:opacity-0 dark:hover:bg-gray-800 dark:hover:text-gray-200"
        aria-label="查看后面的笔记 Tab"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
