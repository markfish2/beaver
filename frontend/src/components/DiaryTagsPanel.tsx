import { useEffect, useState } from 'react';
import { Tag } from 'lucide-react';
import { getDiarySummary } from '../api/data';

interface DiaryTagsPanelProps {
  onTagClick: (tag: string) => void;
  activeTag?: string | null;
  embedded?: boolean;
}

export default function DiaryTagsPanel({ onTagClick, activeTag, embedded = false }: DiaryTagsPanelProps) {
  const [tags, setTags] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    void getDiarySummary().then((data) => {
      if (!cancelled) setTags(data.tags);
    }).catch(() => {
      if (!cancelled) setTags([]);
    });
    return () => { cancelled = true; };
  }, []);

  const wrapperClass = embedded
    ? 'px-0'
    : 'bg-white dark:bg-gray-800/50 rounded-xl p-4 border border-[#e7e7e5] dark:border-gray-700/40';

  return (
    <div className={wrapperClass}>
      <div className="flex items-center gap-1.5 text-base font-medium text-gray-400 dark:text-gray-500 mb-2">
        <Tag className="w-4 h-4" />
        标签
      </div>
      {tags.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">使用 #标签 来创建</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <button
              key={tag}
              onClick={() => onTagClick(tag)}
              className={`px-2.5 py-1 text-sm rounded-full transition-colors border ${
                activeTag === tag
                  ? 'bg-[var(--app-link-pale)] dark:bg-[var(--app-link-dark)] text-[var(--app-link)] border-[var(--app-link)]'
                  : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:bg-[var(--app-link-pale)] dark:hover:bg-[var(--app-link-dark)] hover:text-[var(--app-link)] border-gray-200 dark:border-gray-700'
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
