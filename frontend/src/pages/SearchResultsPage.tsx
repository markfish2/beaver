import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { search } from '../api/data';
import type { SearchResultItem } from '../api/data';
import { FileText, CalendarDays, StickyNote, X, Search } from 'lucide-react';
import { createMobileDocumentState } from '../utils/mobileNavigation';

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

const SearchResultsPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const query = searchParams.get('q') || '';
  const [inputState, setInputState] = useState({ query, value: query });
  const inputValue = inputState.query === query ? inputState.value : query;
  const setInputValue = (value: string) => setInputState({ query, value });
  const [searchState, setSearchState] = useState<{ query: string; results: SearchResultItem[]; loading: boolean }>({
    query,
    results: [],
    loading: Boolean(query.trim()),
  });
  const results = searchState.query === query ? searchState.results : [];
  const isLoading = Boolean(query.trim()) && (searchState.query !== query || searchState.loading);

  useEffect(() => {
    if (!query.trim()) {
      return;
    }
    let active = true;
    search(query)
      .then(response => {
        if (active) setSearchState({ query, results: response.results, loading: false });
      })
      .catch(error => {
        console.error('Search failed', error);
        if (active) setSearchState({ query, results: [], loading: false });
      });
    return () => { active = false; };
  }, [query]);

  const handleResultClick = (result: SearchResultItem) => {
    const documentState = createMobileDocumentState(
      `${location.pathname}${location.search}`,
    );
    switch (result.result_type) {
      case 'document':
      case 'document_title':
        if (result.node_id) {
          navigate(`/d/${result.entity_id}?nodeId=${result.node_id}`, { state: documentState });
        } else {
          navigate(`/d/${result.entity_id}`, { state: documentState });
        }
        break;
      case 'diary':
        navigate(`/d/${result.entity_id}`, { state: documentState });
        break;
      case 'memo':
        navigate(`/?view=wanderer&highlight=${result.entity_id}`);
        break;
    }
  };

  const handleSearch = () => {
    const q = inputValue.trim();
    if (q) {
      navigate(`/search?q=${encodeURIComponent(q)}`);
    }
  };

  const documentResults = results.filter(r => r.result_type === 'document' || r.result_type === 'document_title');
  const diaryResults = results.filter(r => r.result_type === 'diary');
  const memoResults = results.filter(r => r.result_type === 'memo');

  const renderGroup = (title: string, icon: React.ReactNode, items: SearchResultItem[], colorClass: string) => {
    if (items.length === 0) return null;
    return (
      <div className="mb-6">
        <div className={`flex items-center gap-2 mb-3 ${colorClass}`}>
          {icon}
          <h3 className="text-sm font-semibold">{title}</h3>
          <span className="text-xs opacity-60">{items.length}</span>
        </div>
        <div className="divide-y divide-gray-200 dark:divide-gray-700">
          {items.map((result) => (
            <div
              key={`${result.result_type}-${result.entity_id}-${result.node_id || ''}`}
              className="px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
              onClick={() => handleResultClick(result)}
            >
              <div className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-1 truncate">
                {highlightText(result.title || '无标题', query)}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                {highlightText(result.snippet, query)}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col bg-white dark:bg-gray-900 h-full overflow-hidden">
      {/* PC 顶部栏：与其它页面顶栏风格一致，无悬浮返回/关闭按钮 */}
      <div className="flex shrink-0 items-center gap-3 border-b border-gray-200 bg-white px-4 py-2 dark:border-gray-700 dark:bg-gray-900">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
            placeholder="搜索笔记、日记、随想..."
            className="w-full rounded-lg border border-gray-200 bg-gray-50 py-1.5 pl-9 pr-8 text-sm outline-none placeholder:text-gray-400 focus:border-blue-400 focus:ring-1 focus:ring-blue-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
            autoFocus
          />
          {inputValue && (
            <button
              onClick={() => setInputValue('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              title="清空"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <span className="shrink-0 text-xs text-gray-400 dark:text-gray-500">
          {query && !isLoading ? `共 ${results.length} 条结果` : ''}
        </span>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="max-w-4xl mx-auto px-6 py-6">
          {isLoading ? (
            <div className="text-center py-12">
              <div className="text-gray-400 dark:text-gray-500">搜索中...</div>
            </div>
          ) : !query ? (
            <div className="text-center py-12">
              <p className="text-gray-400 dark:text-gray-500">输入关键词搜索</p>
            </div>
          ) : results.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-400 dark:text-gray-500">未找到匹配内容</p>
            </div>
          ) : (
            <>
              {renderGroup('大纲笔记', <FileText className="w-4 h-4" />, documentResults, 'text-emerald-600 dark:text-emerald-400')}
              {renderGroup('日记', <CalendarDays className="w-4 h-4" />, diaryResults, 'text-blue-600 dark:text-blue-400')}
              {renderGroup('随想', <StickyNote className="w-4 h-4" />, memoResults, 'text-amber-600 dark:text-amber-400')}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default SearchResultsPage;
