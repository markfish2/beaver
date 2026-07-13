import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { search } from '../api/data';
import type { SearchResultItem } from '../api/data';
import { FileText, CalendarDays, StickyNote, X, ArrowLeft } from 'lucide-react';

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
  const query = searchParams.get('q') || '';
  const [inputValue, setInputValue] = useState(query);
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setInputValue(query);
  }, [query]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    const fetchResults = async () => {
      setIsLoading(true);
      try {
        const response = await search(query);
        setResults(response.results);
      } catch (error) {
        console.error('Search failed', error);
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    };
    fetchResults();
  }, [query]);

  const handleResultClick = (result: SearchResultItem) => {
    switch (result.result_type) {
      case 'document':
      case 'document_title':
        if (result.node_id) {
          navigate(`/d/${result.entity_id}?nodeId=${result.node_id}`);
        } else {
          navigate(`/d/${result.entity_id}`);
        }
        break;
      case 'diary':
        navigate(`/d/${result.entity_id}`);
        break;
      case 'memo':
        navigate(`/?search=${encodeURIComponent(query)}&highlight=${result.entity_id}`);
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
      {/* 顶部导航栏 - 与 MobileTopBar 一致 */}
      <div
        className="fixed left-3 right-3 z-30 flex items-center justify-between"
        style={{
          top: `calc(8px + env(safe-area-inset-top, 0px))`,
          height: '44px',
        }}
      >
        {/* 左侧：返回按钮 */}
        <button
          onClick={() => navigate(-1)}
          className="flex items-center justify-center w-[36px] h-[36px] rounded-full
                     bg-white/75 dark:bg-gray-800/75 backdrop-blur-2xl
                     shadow-[0_2px_12px_-4px_rgba(0,0,0,0.1)]
                     text-gray-600 dark:text-gray-300
                     active:scale-95 transition-transform"
        >
          <ArrowLeft className="w-[18px] h-[18px]" />
        </button>

        {/* 中间：标题胶囊 */}
        <div className="absolute left-1/2 -translate-x-1/2 flex items-center justify-center h-[36px] px-4
                        bg-white/75 dark:bg-gray-800/75 backdrop-blur-2xl
                        rounded-full
                        shadow-[0_2px_12px_-4px_rgba(0,0,0,0.1)]">
          <span className="text-[13px] font-semibold text-gray-800 dark:text-gray-200">
            搜索
          </span>
        </div>

        {/* 右侧：关闭按钮 */}
        <button
          onClick={() => navigate(-1)}
          className="flex items-center justify-center w-[36px] h-[36px] rounded-full
                     bg-white/75 dark:bg-gray-800/75 backdrop-blur-2xl
                     shadow-[0_2px_12px_-4px_rgba(0,0,0,0.1)]
                     text-gray-500 dark:text-gray-400
                     active:scale-95 transition-transform"
        >
          <X className="w-[16px] h-[16px]" />
        </button>
      </div>

      {/* 搜索输入框 */}
      <div className="shrink-0 px-4 pb-2" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 58px)' }}>
        <div className="relative">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
            placeholder="搜索笔记、日记、随想..."
            className="w-full pl-4 pr-10 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-gray-100"
            autoFocus
          />
          {inputValue && (
            <button
              onClick={() => setInputValue('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        {query && !isLoading && (
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-2 px-1">
            共找到 {results.length} 条结果
          </p>
        )}
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto">
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
