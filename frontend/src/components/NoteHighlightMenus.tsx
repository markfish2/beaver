import { useEffect, useState, type CSSProperties, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Highlighter, Plus, Trash2 } from 'lucide-react';
import type { NoteHighlight } from '../api/data';
import type { NoteHighlightSelection } from '../utils/noteHighlights';

interface SelectionMenuProps {
  selection: NoteHighlightSelection;
  onHighlight: () => void;
}

export function shouldPlaceTabletHighlightActionAtBottom(selection: NoteHighlightSelection): boolean {
  return selection.rect.top < Math.max(128, window.innerHeight * 0.28);
}

export function NoteHighlightSelectionMenu({ selection, onHighlight }: SelectionMenuProps) {
  const width = 104;
  const left = Math.max(8, Math.min(window.innerWidth - width - 8, selection.rect.left + selection.rect.width / 2 - width / 2));
  const above = selection.rect.top >= 56;
  const top = above ? selection.rect.top - 48 : selection.rect.bottom + 8;
  return createPortal(
    <div
      className="fixed z-[var(--layer-overlay)] flex items-center rounded-lg border border-gray-200 bg-white p-1 shadow-lg dark:border-gray-700 dark:bg-gray-800"
      style={{ left, top }}
      onMouseDown={event => event.preventDefault()}
      role="toolbar"
      aria-label="划线操作"
    >
      <button
        type="button"
        onClick={onHighlight}
        className="flex h-8 items-center gap-1.5 rounded-md px-3 text-sm text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
      >
        <Highlighter className="h-4 w-4" />
        划线
      </button>
    </div>,
    document.body,
  );
}

export function NoteHighlightTabletAction({ onHighlight }: { onHighlight: () => void }) {
  return createPortal(
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[var(--layer-overlay)] flex justify-center px-4"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}
      role="toolbar"
      aria-label="划线操作"
    >
      <button
        type="button"
        onPointerDown={event => event.preventDefault()}
        onMouseDown={event => event.preventDefault()}
        onClick={onHighlight}
        className="pointer-events-auto flex h-10 items-center gap-2 rounded-full border border-gray-200 bg-white px-4 text-sm font-medium text-gray-700 shadow-xl transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
        aria-label="为选中内容划线"
      >
        <Highlighter className="h-4 w-4" />
        划线选中内容
      </button>
    </div>,
    document.body,
  );
}

interface NoteHighlightPanelProps {
  highlights: NoteHighlight[];
  isOpen: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  panelRef: RefObject<HTMLDivElement | null>;
  onJump: (highlight: NoteHighlight) => void;
  onDelete: (highlight: NoteHighlight) => void;
  onAddToMemo: () => void;
  isAddingToMemo: boolean;
}

function panelPosition(anchor: HTMLElement | null): CSSProperties {
  if (!anchor) return { visibility: 'hidden' };
  const rect = anchor.getBoundingClientRect();
  const width = Math.min(340, window.innerWidth - 24);
  const left = Math.max(12, Math.min(window.innerWidth - width - 12, rect.right - width));
  const availableBelow = window.innerHeight - rect.bottom - 12;
  if (availableBelow < 220 && rect.top > availableBelow) {
    return { left, bottom: Math.max(12, window.innerHeight - rect.top + 8), width };
  }
  return { left, top: rect.bottom + 8, width };
}

export function NoteHighlightPanel({ highlights, isOpen, anchorRef, panelRef, onJump, onDelete, onAddToMemo, isAddingToMemo }: NoteHighlightPanelProps) {
  const [position, setPosition] = useState<CSSProperties>({ visibility: 'hidden' });

  useEffect(() => {
    if (!isOpen) return;
    const updatePosition = () => setPosition(panelPosition(anchorRef.current));
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [anchorRef, isOpen]);

  if (!isOpen) return null;
  return createPortal(
    <div
      ref={panelRef}
      className="fixed z-[var(--layer-overlay)] max-h-[min(60vh,460px)] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-800"
      style={position}
      role="dialog"
      aria-label="划线列表"
    >
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-gray-700">
        <span className="flex items-center gap-2 text-sm font-medium text-gray-800 dark:text-gray-100">
          <Highlighter className="h-4 w-4 text-red-500" />
          我的划线
        </span>
        <span className="text-xs text-gray-400">{highlights.length} 条</span>
      </div>
      {highlights.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-gray-400 dark:text-gray-500">还没有划线内容</p>
      ) : (
        <div className="max-h-[calc(min(60vh,460px)-53px)] overflow-y-auto p-1.5">
          {highlights.map(highlight => (
            <div key={highlight.id} className="group flex items-start gap-1 rounded-lg px-2 py-2 hover:bg-gray-50 dark:hover:bg-gray-700/60">
              <button
                type="button"
                className="min-w-0 flex-1 text-left text-sm leading-6 text-gray-700 dark:text-gray-200"
                onClick={() => onJump(highlight)}
                title="定位到正文"
              >
                <span className="line-clamp-3 underline decoration-red-500 decoration-2 underline-offset-4">{highlight.quote}</span>
              </button>
              <button
                type="button"
                className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-gray-400 opacity-70 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/40"
                onClick={() => onDelete(highlight)}
                title="删除划线"
                aria-label={`删除划线：${highlight.quote}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="border-t border-gray-100 p-2 dark:border-gray-700">
        <button
          type="button"
          disabled={highlights.length === 0 || isAddingToMemo}
          onClick={onAddToMemo}
          className="flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-45 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
        >
          <Plus className="h-4 w-4" />
          {isAddingToMemo ? '添加中...' : '添加到 Memo'}
        </button>
      </div>
    </div>,
    document.body,
  );
}
