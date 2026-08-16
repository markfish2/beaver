import { useState, useEffect } from 'react';
import { Tag } from 'lucide-react';
import { getMemoTags } from '../api/data';

interface MemoTagsPanelProps {
  onTagClick: (tag: string) => void;
  activeTag?: string | null;
  embedded?: boolean;
}

export default function MemoTagsPanel({ onTagClick, activeTag, embedded = false }: MemoTagsPanelProps) {
  const [tags, setTags] = useState<string[]>([]);

  useEffect(() => {
    const fetch = async () => {
      try {
        const data = await getMemoTags();
        setTags(data);
      } catch (e) {
        console.error('Failed to fetch memo tags', e);
      }
    };
    fetch();
  }, []);

  if (tags.length === 0) {
    return (
      <div className={embedded ? 'px-0' : 'bg-white dark:bg-gray-800/50 rounded-xl p-4 border border-[#e7e7e5] dark:border-gray-700/40'}>
        <div className="flex items-center gap-1.5 text-base font-medium text-gray-400 dark:text-gray-500 mb-2">
          <Tag className="w-4 h-4" />
          标签
        </div>
        <p className="text-sm text-gray-400 dark:text-gray-500">使用 #标签 来创建</p>
      </div>
    );
  }

  return (
    <div className={embedded ? 'px-0' : 'bg-white dark:bg-gray-800/50 rounded-xl p-4 border border-[#e7e7e5] dark:border-gray-700/40'}>
      <div className="flex items-center gap-1.5 text-base font-medium text-gray-400 dark:text-gray-500 mb-2">
        <Tag className="w-4 h-4" />
        标签
      </div>
      <div className="flex flex-wrap gap-1.5">
        {tags.map(tag => (
          <button
            key={tag}
            onClick={() => onTagClick(tag)}
            className={`px-2.5 py-1 text-sm rounded-full transition-colors border ${
              activeTag === tag
                ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-600'
                : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 border-gray-200 dark:border-gray-700'
            }`}
          >
            {tag}
          </button>
        ))}
      </div>
    </div>
  );
}
