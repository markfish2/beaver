import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { search } from '../api/data';
import type { SearchResultItem } from '../api/data';
import { FileText, CalendarDays, StickyNote, Search, ArrowRight } from 'lucide-react';
import { useSearch } from '../context/SearchContext';

const highlightText = (text: string, query: string) => {
  if (!query.trim()) return text;
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  const parts = text.split(regex);
  return parts.map((part, i) =>
    regex.test(part) ? (
      <mark key={i} className="bg-yellow-200 dark:bg-yellow-600/50 px-0.5 rounded">{part}</mark>
    ) : part
  );
};

interface GroupDef {
  key: string;
  label: string;
  icon: React.ReactNode;
  items: SearchResultItem[];
}

export default function GlobalSearchPalette() {
  const { searchOpen, setSearchOpen } = useSearch();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Ctrl/Cmd + K 唤起/关闭
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(!searchOpen);
        setActiveIndex(0);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [searchOpen, setSearchOpen]);

  // 打开时聚焦并全选输入框
  useEffect(() => {
    if (!searchOpen) return;
    const timer = setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
    return () => clearTimeout(timer);
  }, [searchOpen]);

  // 防抖全文搜索
  useEffect(() => {
    if (!searchOpen || !query.trim()) return;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const resp = await search(query.trim());
        setResults(resp.results);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [query, searchOpen]);

  const groups = useMemo<GroupDef[]>(() => {
    const defs: GroupDef[] = [];
    const docs = results.filter(r => r.result_type === 'document' || r.result_type === 'document_title');
    const diaries = results.filter(r => r.result_type === 'diary');
    const memos = results.filter(r => r.result_type === 'memo');
    if (docs.length > 0) defs.push({ key: 'docs', label: '文档', icon: <FileText className="h-3.5 w-3.5" />, items: docs });
    if (diaries.length > 0) defs.push({ key: 'diary', label: '日记', icon: <CalendarDays className="h-3.5 w-3.5" />, items: diaries });
    if (memos.length > 0) defs.push({ key: 'memo', label: '随想', icon: <StickyNote className="h-3.5 w-3.5" />, items: memos });
    return defs;
  }, [results]);

  const flatItems = useMemo(() => groups.flatMap(g => g.items), [groups]);
  const active = Math.min(activeIndex, Math.max(flatItems.length - 1, 0));

  // 高亮当前选中项并滚动到可见区域
  useEffect(() => {
    const activeEl = listRef.current?.querySelector('[data-active="true"]');
    activeEl?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const openResult = useCallback((result: SearchResultItem) => {
    setSearchOpen(false);
    switch (result.result_type) {
      case 'document':
      case 'document_title':
        navigate(result.node_id
          ? `/d/${result.entity_id}?nodeId=${result.node_id}`
          : `/d/${result.entity_id}`);
        break;
      case 'diary':
        navigate(`/d/${result.entity_id}`);
        break;
      case 'memo':
        navigate(`/?view=wanderer&highlight=${result.entity_id}`);
        break;
    }
  }, [navigate, setSearchOpen]);

  const openAllResults = useCallback(() => {
    const q = query.trim();
    if (!q) return;
    setSearchOpen(false);
    navigate(`/search?q=${encodeURIComponent(q)}`);
  }, [query, navigate, setSearchOpen]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      setSearchOpen(false);
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex(prev => Math.min(prev + 1, Math.max(flatItems.length - 1, 0)));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex(prev => Math.max(prev - 1, 0));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const item = flatItems[active];
      if (item) openResult(item);
    }
  }, [flatItems, active, openResult, setSearchOpen]);

  if (!searchOpen) return null;

  const totalCount = flatItems.length;
  let flatCursor = 0;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center bg-black/40 px-4 pt-[12vh] backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setSearchOpen(false);
      }}
      role="dialog"
      aria-modal="true"
      aria-label="全局搜索"
    >
      <div className="w-full max-w-[640px] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900">
        {/* 输入行 */}
        <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-3 dark:border-gray-700">
          <Search className="h-5 w-5 shrink-0 text-gray-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="搜索笔记、日记、随想...（Ctrl+K 唤起 / Esc 关闭）"
            className="min-w-0 flex-1 bg-transparent text-base text-gray-800 outline-none placeholder:text-gray-400 dark:text-gray-100"
          />
          {query.trim() && (
            <button
              onClick={() => setQuery('')}
              className="shrink-0 rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-200"
              title="清空"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* 结果区 */}
        <div ref={listRef} className="max-h-[52vh] overflow-y-auto custom-scrollbar py-2">
          {!query.trim() ? (
            <div className="px-4 py-8 text-center text-sm text-gray-400">输入关键词开始搜索</div>
          ) : loading ? (
            <div className="px-4 py-8 text-center text-sm text-gray-400">搜索中...</div>
          ) : totalCount === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-400">未找到匹配内容</div>
          ) : (
            groups.map(group => (
              <div key={group.key} className="mb-1">
                <div className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-gray-400 dark:text-gray-500">
                  {group.icon}
                  <span>{group.label}</span>
                  <span className="opacity-60">{group.items.length}</span>
                </div>
                {group.items.map(result => {
                  const index = flatCursor++;
                  const isActive = index === active;
                  return (
                    <button
                      key={`${result.result_type}-${result.entity_id}-${result.node_id || ''}`}
                      data-active={isActive ? 'true' : undefined}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => openResult(result)}
                      className={`block w-full px-4 py-2.5 text-left transition-colors ${
                        isActive ? 'bg-gray-100 dark:bg-gray-800' : 'hover:bg-gray-50 dark:hover:bg-gray-800/60'
                      }`}
                    >
                      <div className="truncate text-sm font-medium text-gray-800 dark:text-gray-100">
                        {highlightText(result.title || '无标题', query)}
                      </div>
                      {result.snippet && (
                        <div className="mt-0.5 line-clamp-2 text-xs text-gray-500 dark:text-gray-400">
                          {highlightText(result.snippet, query)}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* 底部：查看全部 */}
        {totalCount > 0 && (
          <div className="flex items-center justify-between border-t border-gray-200 px-4 py-2.5 dark:border-gray-700">
            <span className="text-xs text-gray-400 dark:text-gray-500">
              ↑↓ 选择 · Enter 打开 · Esc 关闭
            </span>
            <button
              onClick={openAllResults}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-blue-600 transition-colors hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/30"
            >
              查看全部 {totalCount} 条结果
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
