import { memo, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import {
  ChevronRight, ChevronLeft, CheckSquare, MessageSquare,
  ChevronUp, ChevronDown, Maximize2, Undo, Trash2
} from 'lucide-react';

interface MobileToolbarProps {
  isVisible: boolean;
  onIndent: () => void;
  onOutdent: () => void;
  onToggleTodo: () => void;
  onAddNote: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onZoom: () => void;
  onUndo: () => void;
  onDelete: () => void;
  showZoom?: boolean;
  hasTabBar?: boolean;
}

function ToolbarButton({ icon, label, onClick, danger }: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      className={`flex-1 flex items-center justify-center py-2 active:bg-gray-200 dark:active:bg-gray-600 transition-colors ${danger ? 'text-red-500' : 'text-gray-600 dark:text-gray-300'}`}
      aria-label={label}
    >
      {icon}
    </button>
  );
}

const TAB_BAR_HEIGHT = 52;

const MobileToolbar = memo(function MobileToolbar({
  isVisible,
  onIndent,
  onOutdent,
  onToggleTodo,
  onAddNote,
  onMoveUp,
  onMoveDown,
  onZoom,
  onUndo,
  onDelete,
  showZoom = true,
  hasTabBar = false,
}: MobileToolbarProps) {
  // 用 top 定位，锚定在 visualViewport 底部边缘
  const [top, setTop] = useState(() => window.innerHeight - TAB_BAR_HEIGHT);

  const updatePosition = useCallback(() => {
    const viewport = window.visualViewport;
    if (!viewport) {
      setTop(window.innerHeight - (hasTabBar ? TAB_BAR_HEIGHT : 0) - 44);
      window.dispatchEvent(new CustomEvent('keyboard-change', { detail: { open: false } }));
      return;
    }

    const viewportBottom = viewport.offsetTop + viewport.height;
    const keyboardHeight = window.innerHeight - viewport.height;
    const isOpen = keyboardHeight > 50;

    if (isOpen) {
      // 键盘弹出：工具栏顶部 = 可视视口底部 - 工具栏高度（紧贴键盘上方）
      setTop(viewportBottom - 44);
    } else {
      // 键盘收起：用布局视口计算，避开 Tab 栏
      setTop(window.innerHeight - (hasTabBar ? TAB_BAR_HEIGHT : 0) - 44);
    }

    window.dispatchEvent(new CustomEvent('keyboard-change', { detail: { open: isOpen } }));
  }, [hasTabBar]);

  useEffect(() => {
    if (!isVisible) {
      window.dispatchEvent(new CustomEvent('keyboard-change', { detail: { open: false } }));
      return;
    }
    const viewport = window.visualViewport;
    if (!viewport) return;

    updatePosition();
    viewport.addEventListener('resize', updatePosition);
    viewport.addEventListener('scroll', updatePosition);

    return () => {
      viewport.removeEventListener('resize', updatePosition);
      viewport.removeEventListener('scroll', updatePosition);
      window.dispatchEvent(new CustomEvent('keyboard-change', { detail: { open: false } }));
    };
  }, [isVisible, updatePosition]);

  if (!isVisible) return null;

  return (
    <div
      role="toolbar"
      aria-label="节点编辑工具栏"
      className="fixed left-0 right-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 z-50"
      style={{ top: `${top}px` }}
    >
      <div className="flex items-center justify-around border-b border-gray-100 dark:border-gray-700">
        <ToolbarButton icon={<ChevronRight size={18} />} label="缩进" onClick={onIndent} />
        <ToolbarButton icon={<ChevronLeft size={18} />} label="提升" onClick={onOutdent} />
        <ToolbarButton icon={<CheckSquare size={18} />} label="待办" onClick={onToggleTodo} />
        <ToolbarButton icon={<MessageSquare size={18} />} label="备注" onClick={onAddNote} />
        <ToolbarButton icon={<ChevronUp size={18} />} label="上移" onClick={onMoveUp} />
        <ToolbarButton icon={<ChevronDown size={18} />} label="下移" onClick={onMoveDown} />
        {showZoom && <ToolbarButton icon={<Maximize2 size={18} />} label="放大" onClick={onZoom} />}
        <ToolbarButton icon={<Undo size={18} />} label="撤销" onClick={onUndo} />
        <ToolbarButton icon={<Trash2 size={18} />} label="删除" onClick={onDelete} danger />
      </div>
    </div>
  );
});

export default MobileToolbar;
