import { useMemo, memo, useRef, useEffect, useCallback, useState, type ReactNode } from 'react';
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
  onLoadMore: () => Promise<void>;
  hasMore: boolean;
  highlightId?: string | null;
  documents?: Document[];
  deferOffscreen?: boolean;
}

function DeferredMemoCard({ enabled, estimatedHeight, children }: { enabled: boolean; estimatedHeight: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(!enabled);

  useEffect(() => {
    if (!enabled || visible) return;
    const element = ref.current;
    if (!element || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: '600px 0px' });
    observer.observe(element);
    return () => observer.disconnect();
  }, [enabled, visible]);

  return <div ref={ref} style={!visible ? { minHeight: estimatedHeight } : undefined}>{visible ? children : null}</div>;
}

function estimateHeight(m: Memo, compact: boolean): number {
  const lines = m.content.split('\n').length;
  const codeBlocks = (m.content.match(/```/g) || []).length / 2;
  const chars = m.content.length;
  const charsPerLine = compact ? 46 : 80;
  const raw = lines * 20 + codeBlocks * (compact ? 105 : 120) + Math.floor(chars / charsPerLine) * 20;
  const contentH = Math.min(raw, 400);
  const hasCollapse = raw > 400 ? 24 : 0;
  const tagCount = (m.content.match(/#[a-zA-Z0-9_一-龥]+/g) || []).length;
  const tags = tagCount > 0 ? Math.ceil(tagCount / (compact ? 3 : 6)) * 28 : 0;
  const imageCount = (m.content.match(/!\[/g) || []).length;
  const images = imageCount > 0 ? (compact ? 150 : 220) : 0;
  const attachmentCount = (m.content.match(/(?<!!)\[[^\]]+\]\([^)]+\)/g) || []).length;
  const attachments = attachmentCount > 0 ? 46 + attachmentCount * 34 : 0;
  const urlCount = (m.content.match(/https?:\/\//g) || []).length;
  const linkPreviews = urlCount > 0 ? urlCount * 72 : 0;
  return 60 + contentH + hasCollapse + tags + images + attachments + linkPreviews;
}

function LoadMoreSentinel({ onLoadMore, hasMore }: { onLoadMore: () => Promise<void>; hasMore: boolean }) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const armedRef = useRef(true);
  const [loading, setLoading] = useState(false);

  const handleIntersect = useCallback(async (entries: IntersectionObserverEntry[]) => {
    const entry = entries[0];
    if (!entry.isIntersecting) {
      // 只有哨兵离开底部预加载区域后，下一次进入才允许加载下一页。
      armedRef.current = true;
      return;
    }
    if (armedRef.current && hasMore && !loading) {
      armedRef.current = false;
      setLoading(true);
      try {
        await onLoadMore();
      } catch (error: unknown) {
        console.error('Failed to load more memos', error);
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

const MemoList = memo(function MemoList({ memos, columns, onEdit, onDelete, onTogglePin, onToggleArchive, onTogglePublic, onToggleAI, onTagClick, onLoadMore, hasMore, highlightId, documents, deferOffscreen = false }: MemoListProps) {
  const { leftCol, rightCol } = useMemo(() => {
    if (columns !== 2) return { leftCol: [], rightCol: [] };
    const left: Memo[] = [];
    const right: Memo[] = [];
    let leftH = 0, rightH = 0;
    for (const memo of memos) {
      const h = estimateHeight(memo, true);
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
                <DeferredMemoCard enabled={deferOffscreen} estimatedHeight={estimateHeight(memo, true)}><MemoCard memo={memo} onEdit={onEdit} onDelete={onDelete} onTogglePin={onTogglePin} onToggleArchive={onToggleArchive} onTogglePublic={onTogglePublic} onToggleAI={onToggleAI} onTagClick={onTagClick} isHighlighted={highlightId === memo.id} documents={documents} compact /></DeferredMemoCard>
              </div>
            ))}
          </div>
          <div className="space-y-3" style={{ contain: 'layout' }}>
            {rightCol.map(memo => (
              <div key={memo.id} id={`memo-${memo.id}`}>
                <DeferredMemoCard enabled={deferOffscreen} estimatedHeight={estimateHeight(memo, true)}><MemoCard memo={memo} onEdit={onEdit} onDelete={onDelete} onTogglePin={onTogglePin} onToggleArchive={onToggleArchive} onTogglePublic={onTogglePublic} onToggleAI={onToggleAI} onTagClick={onTagClick} isHighlighted={highlightId === memo.id} documents={documents} compact /></DeferredMemoCard>
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
          <DeferredMemoCard enabled={deferOffscreen} estimatedHeight={estimateHeight(memo, false)}><MemoCard
            memo={memo}
            onEdit={onEdit}
            onDelete={onDelete}
            onTogglePin={onTogglePin}
            onToggleArchive={onToggleArchive}
            onTogglePublic={onTogglePublic}
            onToggleAI={onToggleAI}
            onTagClick={onTagClick}
            isHighlighted={highlightId === memo.id}
            documents={documents}
          /></DeferredMemoCard>
        </div>
      ))}
      <LoadMoreSentinel onLoadMore={onLoadMore} hasMore={hasMore} />
    </div>
  );
});

export default MemoList;
