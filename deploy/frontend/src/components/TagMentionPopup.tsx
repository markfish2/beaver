import { useEffect, useRef } from 'react';
import { Hash, AtSign, FileText } from 'lucide-react';

export interface PopupItem {
  label: string;
  value: string;
  icon?: React.ReactNode;
  /** Extra info shown on the right */
  detail?: string;
}

interface TagMentionPopupProps {
  items: PopupItem[];
  selectedIndex: number;
  onSelect: (item: PopupItem) => void;
  onClose: () => void;
  /** Screen coordinates */
  position: { top: number; left: number };
  /** 'tag' for #, 'mention' for @ */
  type: 'tag' | 'mention';
  zIndex?: number;
}

export default function TagMentionPopup({
  items,
  selectedIndex,
  onSelect,
  onClose,
  position,
  type,
  zIndex = 9999,
}: TagMentionPopupProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to selected item
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  // Click outside to close
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (listRef.current && !listRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  if (items.length === 0) return null;

  const defaultIcon = type === 'tag'
    ? <Hash className="w-3.5 h-3.5 text-blue-500" />
    : <FileText className="w-3.5 h-3.5 text-purple-500" />;

  return (
    <div
      ref={listRef}
      className="fixed bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden"
      style={{
        top: position.top,
        left: position.left,
        zIndex,
        maxHeight: '240px',
        minWidth: '200px',
        maxWidth: '320px',
      }}
    >
      <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-gray-100 dark:border-gray-700 text-[11px] text-gray-400 dark:text-gray-500">
        {type === 'tag' ? <Hash className="w-3 h-3" /> : <AtSign className="w-3 h-3" />}
        {type === 'tag' ? '标签' : '提及'}
      </div>
      <div className="overflow-y-auto" style={{ maxHeight: '200px' }}>
        {items.map((item, i) => (
          <div
            key={item.value}
            ref={i === selectedIndex ? selectedRef : null}
            className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer text-sm transition-colors ${
              i === selectedIndex
                ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50'
            }`}
            onMouseDown={(e) => {
              e.preventDefault();
              onSelect(item);
            }}
            onMouseEnter={() => {/* could update selectedIndex but keeping it simple */}}
          >
            <span className="shrink-0">{item.icon || defaultIcon}</span>
            <span className="truncate flex-1">{item.label}</span>
            {item.detail && (
              <span className="text-[11px] text-gray-400 dark:text-gray-500 shrink-0">{item.detail}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
