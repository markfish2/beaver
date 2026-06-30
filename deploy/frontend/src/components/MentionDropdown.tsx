import React, { useState, useEffect, useRef, useMemo } from 'react';
import { FileText, ListTree } from 'lucide-react';
import type { Document } from '../api/data';

interface MentionDropdownProps {
  documents: Document[];
  onSelect: (doc: Document) => void;
  onClose: () => void;
  position: { top: number; left: number };
  searchText: string;
  onSearchChange?: (text: string) => void;
  zIndex?: number;
}

const MentionDropdown: React.FC<MentionDropdownProps> = ({
  documents,
  onSelect,
  onClose,
  position,
  searchText,
  onSearchChange,
  zIndex = 50
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [localSearchText, setLocalSearchText] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // 合并外部搜索文本和本地搜索文本
  const effectiveSearchText = localSearchText || searchText;

  const filteredDocs = useMemo(() => {
    if (!documents || documents.length === 0) return [];
    if (!effectiveSearchText) return documents.slice(0, 10);
    const lowerSearch = effectiveSearchText.toLowerCase();
    return documents
      .filter(doc => {
        const title = doc.title?.toLowerCase() || '';
        // 支持模糊匹配
        return title.includes(lowerSearch);
      })
      .slice(0, 10);
  }, [documents, effectiveSearchText]);


  // 不自动聚焦搜索框，避免从 textarea 偷走焦点导致编辑模式关闭

  useEffect(() => {
    setSelectedIndex(0);
  }, [effectiveSearchText]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 如果焦点在搜索框中，只处理特殊键
      if (document.activeElement === searchInputRef.current) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === 'Escape') {
          // 继续处理
        } else {
          return; // 让搜索框正常输入
        }
      }
      
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          e.stopPropagation();
          setSelectedIndex(prev => 
            prev < filteredDocs.length - 1 ? prev + 1 : prev
          );
          break;
        case 'ArrowUp':
          e.preventDefault();
          e.stopPropagation();
          setSelectedIndex(prev => prev > 0 ? prev - 1 : prev);
          break;
        case 'Enter':
          e.preventDefault();
          e.stopPropagation();
          if (filteredDocs[selectedIndex]) {
            onSelect(filteredDocs[selectedIndex]);
          }
          break;
        case 'Escape':
          e.preventDefault();
          e.stopPropagation();
          onClose();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [filteredDocs, selectedIndex, onSelect, onClose]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    // 使用 setTimeout 延迟添加事件监听，避免立即触发
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);
    
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  // preventDefault 阻止 textarea 失焦，stopPropagation 阻止 click-outside 关闭
  const handleSearchMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // 手动聚焦搜索框（因为 preventDefault 阻止了默认聚焦）
    requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
  };

  useEffect(() => {
    if (dropdownRef.current) {
      const selectedEl = dropdownRef.current.querySelector(`[data-index="${selectedIndex}"]`);
      if (selectedEl) {
        selectedEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setLocalSearchText(value);
    onSearchChange?.(value);
  };

  return (
    <div
      ref={dropdownRef}
      className={`fixed bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 max-h-80 overflow-hidden min-w-[280px]`}
      style={{ top: position.top, left: position.left, zIndex }}
    >
      {/* 搜索框 */}
      <div className="px-2 py-2 border-b border-gray-100 dark:border-gray-700">
        <div className="relative">
          <svg 
            className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={searchInputRef}
            type="text"
            value={localSearchText}
            onChange={handleSearchChange}
            onMouseDown={handleSearchMouseDown}
            placeholder="搜索文章..."
            className="w-full pl-8 pr-3 py-1.5 text-sm bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 dark:text-gray-200 dark:placeholder-gray-400"
          />
        </div>
      </div>
      
      {/* 文章列表 */}
      <div className="max-h-56 overflow-y-auto">
        {filteredDocs.length === 0 ? (
          <div className="px-3 py-4 text-sm text-gray-500 dark:text-gray-400 text-center">
            <svg className="w-8 h-8 mx-auto mb-2 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            没有找到匹配的文章
          </div>
        ) : (
          <>
            <div className="px-2 py-1 text-xs text-gray-400 dark:text-gray-500 flex items-center justify-between">
              <span>选择要链接的文章</span>
              <span className="text-xs">{filteredDocs.length} 篇</span>
            </div>
            {filteredDocs.map((doc, index) => (
              <div
                key={doc.id}
                data-index={index}
                className={`px-3 py-2 cursor-pointer flex items-center gap-2 ${
                  index === selectedIndex
                    ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
                onMouseDown={(e) => { e.preventDefault(); onSelect(doc); }}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                {doc.type === 'note' ? (
                  <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                ) : (
                  <ListTree className="w-4 h-4 text-gray-400 flex-shrink-0" />
                )}
                <span className="truncate text-sm">{doc.title || '无标题'}</span>
              </div>
            ))}
          </>
        )}
      </div>
      
      {/* 底部提示 */}
      <div className="px-2 py-1 border-t border-gray-100 dark:border-gray-700 text-xs text-gray-400 dark:text-gray-500 flex items-center justify-between">
        <span>↑↓ 导航 · Enter 选择 · Esc 关闭</span>
      </div>
    </div>
  );
};

export default MentionDropdown;
