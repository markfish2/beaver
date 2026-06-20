import { useMemo, memo, useRef, useEffect, useCallback, useState } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import MemoCard from './MemoCard';
import type { Memo, Document } from '../api/data';

interface MemoListProps {
  memos: Memo[];
  columns: 1 | 2;
  onEdit: (id: string, content: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onTogglePin: (id: string, is_pinned: boolean) => Promise<void>;
  onToggleArchive: (id: string, is_archived: boolean) => Promise<void>;
  onTogglePublic?: (id: string, is_public: boolean) => Promise<void>;
  onToggleAI?: (id: string, ai_excluded: boolean) => Promise<void>;
  onTagClick: (tag: string) => void;
  onColorChange?: (id: string, color: string | null) => void;
  onLoadMore: () => Promise<void>;
  hasMore: boolean;
  highlightId?: string | null;
  documents?: Document[];
}

function estimateHeight(m: Memo): number {
  const lines = m.content.split('\n').length;
  const codeBlocks = (m.content.match(/```/g) || []).length / 2;
  const chars = m.content.length;
  const raw = lines * 20 + codeBlocks * 120 + Math.floor(chars / 80) * 20;
  const contentH = Math.min(raw, 400);
  const hasCollapse = raw > 400 ? 24 : 0;
  const tags = (m.content.match(/#[a-zA-Z0-9_一-龥]+/g) || []).length > 0 ? 32 : 0;
  const images = (m.content.match(/!\[/g) || []).length > 0 ? 96 : 0;
  const urlCount = (m.content.match(/https?:\/\//g) || []).length;
  const linkPreviews = urlCount > 0 ? urlCount * 72 : 0;
  return 60 + contentH + hasCollapse + tags + images + linkPreviews;
}

function LoadMoreSentinel({ onLoadMore, hasMore }: { onLoadMore: () => Promise<void>; hasMore: boolean }) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(false);

  const handleIntersect = useCallback(async (entries: IntersectionObserverEntry[]) => {
    if (entries[0].isIntersecting && hasMore && !loading) {
      setLoading(true);
      try {
        await onLoadMore();
      } finally {
        setLoading(false);
      }
    }
  }, [hasMore, loading, onLoadMore]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(handleIntersect, { rootMargin: '200px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, [handleIntersect]);

  if (!hasMore && !loading) return null;

  return (
    <div ref={sentinelRef} className="flex justify-center py-4">
      {loading && <Loader2 className="w-5 h-5 text-gray-400 dark:text-gray-500 animate-spin" />}
    </div>
  );
}

const MemoList = memo(function MemoList({ memos, columns, onEdit, onDelete, onTogglePin, onToggleArchive, onTogglePublic, onToggleAI, onTagClick, onColorChange, onLoadMore, hasMore, highlightId, documents }: MemoListProps) {
  const { leftCol, rightCol } = useMemo(() => {
    if (columns !== 2) return { leftCol: [], rightCol: [] };
    const left: Memo[] = [];
    const right: Memo[] = [];
    let leftH = 0, rightH = 0;
    for (const memo of memos) {
      const h = estimateHeight(memo);
      if (leftH <= rightH) {
        left.push(memo);
        leftH += h;
      } else {
        right.push(memo);
        rightH += h;
      }
    }
    return { leftCol: left, rightCol: right };
  }, [memos, columns]);

  if (memos.length === 0) {
    return (
      <div className="text-center py-12">
        <FileText className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
        <p className="text-sm text-gray-400 dark:text-gray-500">
          还没有随想记录，在上方输入你的第一条想法
        </p>
      </div>
    );
  }

  if (columns === 2) {
    return (
      <div style={{ contain: 'layout' }}>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-3" style={{ contain: 'layout' }}>
            {leftCol.map(memo => (
              <div key={memo.id} id={`memo-${memo.id}`}>
                <MemoCard memo={memo} onEdit={onEdit} onDelete={onDelete} onTogglePin={onTogglePin} onToggleArchive={onToggleArchive} onTogglePublic={onTogglePublic} onToggleAI={onToggleAI} onTagClick={onTagClick} onColorChange={onColorChange} isHighlighted={highlightId === memo.id} documents={documents} />
              </div>
            ))}
          </div>
          <div className="space-y-3" style={{ contain: 'layout' }}>
            {rightCol.map(memo => (
              <div key={memo.id} id={`memo-${memo.id}`}>
                <MemoCard memo={memo} onEdit={onEdit} onDelete={onDelete} onTogglePin={onTogglePin} onToggleArchive={onToggleArchive} onTogglePublic={onTogglePublic} onToggleAI={onToggleAI} onTagClick={onTagClick} onColorChange={onColorChange} isHighlighted={highlightId === memo.id} documents={documents} />
              </div>
            ))}
          </div>
        </div>
        <LoadMoreSentinel onLoadMore={onLoadMore} hasMore={hasMore} />
      </div>
    );
  }

  return (
    <div className="space-y-3" style={{ contain: 'layout' }}>
      {memos.map(memo => (
        <div key={memo.id} id={`memo-${memo.id}`}>
          <MemoCard
            memo={memo}
            onEdit={onEdit}
            onDelete={onDelete}
            onTogglePin={onTogglePin}
            onToggleArchive={onToggleArchive}
            onTogglePublic={onTogglePublic}
            onToggleAI={onToggleAI}
            onTagClick={onTagClick}
            onColorChange={onColorChange}
            isHighlighted={highlightId === memo.id}
            documents={documents}
          />
        </div>
      ))}
      <LoadMoreSentinel onLoadMore={onLoadMore} hasMore={hasMore} />
    </div>
  );
});

export default MemoList;
