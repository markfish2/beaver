import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Shuffle } from 'lucide-react';
import type { Memo } from '../api/data';
import { getMemos } from '../api/data';
import MemoCard from './MemoCard';

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function MemoWanderer({ onExit, initialMemoId }: { onExit: () => void; initialMemoId?: string | null }) {
  console.log('MemoWanderer: initialMemoId =', initialMemoId);

  const [memos, setMemos] = useState<Memo[]>([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  const loadMemos = useCallback(async () => {
    setLoading(true);
    try {
      let all: Memo[] = [];
      let page = 1;
      // Load both active and archived memos
      while (true) {
        const data = await getMemos(page, 100, false);
        console.log('MemoWanderer: Page', page, 'active memos:', data.memos.length, 'total:', data.total);
        all = all.concat(data.memos);
        if (all.length >= data.total || data.memos.length === 0) break;
        page++;
      }
      // Also load archived memos
      let archivedPage = 1;
      while (true) {
        const data = await getMemos(archivedPage, 100, true);
        console.log('MemoWanderer: Page', archivedPage, 'archived memos:', data.memos.length, 'total:', data.total);
        all = all.concat(data.memos);
        if (all.length >= data.total || data.memos.length === 0) break;
        archivedPage++;
      }

      console.log('MemoWanderer: Loaded', all.length, 'memos total, initialMemoId =', initialMemoId);
      console.log('MemoWanderer: All memo IDs:', all.map(m => m.id));

      // If initialMemoId is provided, put that memo first
      if (initialMemoId) {
        // Normalize: remove hyphens for comparison
        const normalizedInitialId = initialMemoId.replace(/-/g, '');
        const targetIndex = all.findIndex(m => m.id.replace(/-/g, '') === normalizedInitialId);
        console.log('MemoWanderer: targetIndex =', targetIndex);
        if (targetIndex >= 0) {
          const [target] = all.splice(targetIndex, 1);
          all.unshift(target);
          console.log('MemoWanderer: Moved memo to first position');
        }
      } else {
        all = shuffleArray(all);
      }

      setMemos(all);
      setIndex(0);
    } catch (e) {
      console.error('Failed to load memos for wanderer', e);
    } finally {
      setLoading(false);
    }
  }, [initialMemoId]);

  useEffect(() => { loadMemos(); }, [loadMemos]);

  const current = memos[index];

  const goPrev = useCallback(() => {
    setIndex(i => (i > 0 ? i - 1 : memos.length - 1));
  }, [memos.length]);

  const goNext = useCallback(() => {
    setIndex(i => (i < memos.length - 1 ? i + 1 : 0));
  }, [memos.length]);

  const reshuffle = useCallback(() => {
    setMemos(shuffleArray(memos));
    setIndex(0);
  }, [memos]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goPrev();
      else if (e.key === 'ArrowRight') goNext();
      else if (e.key === 'Escape') onExit();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [goPrev, goNext, onExit]);

  // No-op handlers for readOnly mode
  const noop = useCallback(async () => {}, []);
  const noopTag = useCallback((_tag: string) => {}, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400 dark:text-gray-500 text-sm">加载中...</div>
      </div>
    );
  }

  if (memos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <p className="text-gray-400 dark:text-gray-500 text-sm">还没有随想笔记</p>
        <button onClick={onExit} className="text-sm text-blue-500 hover:text-blue-600">返回</button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center">
      {/* Page counter */}
      <div className="w-full max-w-xl mb-3 flex items-center justify-end px-1">
        <span className="text-xs text-gray-300 dark:text-gray-600 tabular-nums">
          {index + 1} / {memos.length}
        </span>
      </div>

      {/* Card with side arrows */}
      <div className="relative w-full max-w-xl">
        {/* Left arrow */}
        <button
          onClick={goPrev}
          className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-4 lg:-translate-x-12 w-10 h-10 flex items-center justify-center rounded-full bg-white dark:bg-gray-700 shadow-md border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-600 hover:text-gray-700 dark:hover:text-gray-200 transition-colors z-10"
          title="上一条 (←)"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        {/* MemoCard in readOnly mode */}
        {current && (
          <MemoCard
            memo={current}
            readOnly
            onEdit={noop}
            onDelete={noop}
            onTogglePin={noop}
            onToggleArchive={noop}
            onTagClick={noopTag}
          />
        )}

        {/* Right arrow */}
        <button
          onClick={goNext}
          className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-4 lg:translate-x-12 w-10 h-10 flex items-center justify-center rounded-full bg-white dark:bg-gray-700 shadow-md border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-600 hover:text-gray-700 dark:hover:text-gray-200 transition-colors z-10"
          title="下一条 (→)"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Bottom controls */}
      <div className="flex items-center gap-4 mt-5">
        <button
          onClick={goPrev}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          上一条
        </button>
        <button
          onClick={reshuffle}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          title="重新随机"
        >
          <Shuffle className="w-4 h-4" />
          重新洗牌
        </button>
        <button
          onClick={goNext}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        >
          下一条
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
