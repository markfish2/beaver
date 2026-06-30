import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { search } from '../api/data';
import type { SearchResultItem } from '../api/data';
import { FileText, CalendarDays, StickyNote } from 'lucide-react';

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
    <div className="flex-1 flex flex-col bg-white dark:bg-gray-900 h-screen overflow-hidden">
      {/* Header */}
      <div className="border-b border-gray-200 dark:border-gray-800 px-6 py-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-4 mb-4">
            <button
              onClick={() => navigate('/')}
              className="text-2xl font-bold text-gray-800 dark:text-gray-100 hover:opacity-80 transition-opacity"
            >
              beaver
            </button>
          </div>

          {/* Search Box */}
          <div className="relative">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
              placeholder="搜索笔记、日记、随想..."
              className="w-full px-4 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-gray-100"
            />
            <svg
              className="absolute right-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400"
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>

          {/* Stats */}
          {query && !isLoading && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
              共找到 {results.length} 条结果
            </p>
          )}
        </div>
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
