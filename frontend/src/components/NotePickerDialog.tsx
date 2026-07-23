import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, FileText, ListTree, StickyNote, X } from 'lucide-react';
import { getDocuments, getMemos } from '../api/data';
import type { Document, Memo } from '../api/data';

interface NoteItem {
  id: string;
  title: string;
  type: 'document' | 'note' | 'memo';
}

interface NotePickerDialogProps {
  isOpen: boolean;
  onSelect: (item: NoteItem) => void;
  onClose: () => void;
}

export default function NotePickerDialog({ isOpen, onSelect, onClose }: NotePickerDialogProps) {
  const [query, setQuery] = useState('');
  const [documents, setDocuments] = useState<NoteItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadDocs = useCallback(async (search: string) => {
    setLoading(true);
    try {
      // 并行获取文档和 memo
      const [docs, memoRes] = await Promise.all([
        getDocuments(search || undefined),
        getMemos(1, 50, false, undefined, search || undefined),
      ]);
      const items: NoteItem[] = [];
      // 添加文档（大纲笔记、普通笔记）
      for (const d of docs) {
        if (d.type === 'folder' || d.type === 'excalidraw') continue;
        items.push({ id: d.id, title: d.title || '无标题', type: d.type as 'document' | 'note' });
      }
      // 添加 memo
      for (const m of memoRes.memos) {
        const preview = (m.content || '').replace(/[#*`\[\]>~\-]/g, '').trim().slice(0, 40);
        items.push({ id: m.id, title: preview || '空随想', type: 'memo' });
      }
      setDocuments(items);
    } catch {
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      void loadDocs('');
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, loadDocs]);

  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => void loadDocs(query), 200);
    return () => clearTimeout(timer);
  }, [query, isOpen, loadDocs]);

  const filteredDocs = documents.filter(d =>
    !query || d.title.toLowerCase().includes(query.toLowerCase())
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, filteredDocs.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredDocs[selectedIndex]) {
        onSelect(filteredDocs[selectedIndex]);
      }
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  const getDocIcon = (type: string) => {
    switch (type) {
      case 'note': return <StickyNote className="w-4 h-4 text-amber-500" />;
      case 'document': return <ListTree className="w-4 h-4 text-emerald-500" />;
      default: return <FileText className="w-4 h-4 text-blue-500" />;
    }
  };

  const getDocTypeLabel = (type: string) => {
    switch (type) {
      case 'note': return '笔记';
      case 'document': return '大纲';
      default: return '文档';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-[400px] max-h-[500px] bg-white dark:bg-gray-800 rounded-2xl shadow-2xl
                   border border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 dark:border-gray-700">
          <Search className="w-4 h-4 text-gray-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); setSelectedIndex(0); }}
            onKeyDown={handleKeyDown}
            placeholder="搜索笔记..."
            className="flex-1 bg-transparent outline-none text-sm text-gray-800 dark:text-gray-200
                       placeholder-gray-400"
          />
          <button onClick={onClose} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto max-h-[400px] py-1">
          {loading ? (
            <div className="px-4 py-8 text-center text-sm text-gray-400">加载中...</div>
          ) : filteredDocs.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-400">
              {query ? '未找到匹配笔记' : '暂无笔记'}
            </div>
          ) : (
            filteredDocs.map((doc, i) => (
              <button
                key={doc.id}
                onClick={() => onSelect(doc)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                  i === selectedIndex
                    ? 'bg-blue-50 dark:bg-blue-900/30'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                }`}
              >
                {getDocIcon(doc.type)}
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-gray-800 dark:text-gray-200 truncate">
                    {doc.title || '无标题'}
                  </div>
                </div>
                <span className="text-[10px] text-gray-400 dark:text-gray-500 shrink-0">
                  {getDocTypeLabel(doc.type)}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
