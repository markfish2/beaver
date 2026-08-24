import { memo, useState, useEffect, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import {
  ChevronRight, ChevronLeft, CheckSquare, MessageSquare,
  ChevronUp, ChevronDown, Maximize2, Undo, Trash2, Hash
} from 'lucide-react';

interface MobileToolbarProps {
  isVisible: boolean;
  onIndent: () => void;
  onOutdent: () => void;
  onToggleTodo: () => void;
  onAddNote: () => void;
  onTag: () => void;
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

const isHarmonyBrowser = typeof navigator !== 'undefined'
  && /HarmonyOS|OpenHarmony|ArkWeb|HUAWEI/i.test(navigator.userAgent);

const MobileToolbar = memo(function MobileToolbar({
  isVisible,
  onIndent,
  onOutdent,
  onToggleTodo,
  onAddNote,
  onTag,
  onMoveUp,
  onMoveDown,
  onZoom,
  onUndo,
  onDelete,
  showZoom = true,
  hasTabBar = false,
}: MobileToolbarProps) {
  // 工具栏固定在浏览器为键盘让出的布局底部。
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  // 必须在组件首次挂载时记录基准。鸿蒙上键盘可能先收缩视口，
  // 然后才触发 focusedNode 状态更新；在 isVisible=true 时再记录会把键盘高度当成基准。
  const layoutHeightRef = useRef(
    Math.max(
      window.innerHeight,
      document.documentElement.clientHeight,
      window.visualViewport?.height ?? 0,
    ),
  );

  const updatePosition = useCallback(() => {
    const viewport = window.visualViewport;
    if (!viewport) {
      // 部分移动端浏览器（尤其是隐私模式/内置浏览器）没有 visualViewport，
      // 但键盘弹出时仍会通过 window.resize 缩小布局视口。
      const active = document.activeElement;
      const isEditable = active instanceof HTMLElement && (
        active.isContentEditable
        || active.tagName === 'INPUT'
        || active.tagName === 'TEXTAREA'
      );
      // 没有 visualViewport 时只能以编辑框焦点作为键盘可见的兜底信号；
      // 键盘收起后编辑框通常会失焦，focusout 会再次刷新状态。
      const keyboardHeight = Math.max(0, layoutHeightRef.current - window.innerHeight);
      // 日记有底部导航栏：不能用“仍然聚焦”作为键盘打开的依据，否则
      // 鸿蒙收起键盘后 contenteditable 仍保持焦点，快捷栏会永久占住底部。
      const isOpen = keyboardHeight > 50 || (!hasTabBar && (isEditable || isVisible));
      setKeyboardOpen(isOpen);
      window.dispatchEvent(new CustomEvent('keyboard-change', { detail: { open: isOpen } }));
      return;
    }

    // 鸿蒙部分版本会同时缩小 layout viewport 和 visual viewport，
    // 因此不能只用 window.innerHeight - viewport.height 判断键盘。
    const layoutHeight = layoutHeightRef.current;
    const keyboardHeight = Math.max(
      layoutHeight - window.innerHeight,
      layoutHeight - viewport.height,
      0,
    );
    // 鸿蒙部分 ArkWeb 版本不会同步更新 visualViewport，但编辑焦点是可靠的。
    // isVisible 由 MainArea 的当前编辑节点控制，因此可以作为键盘附件栏的兜底信号。
    // 大纲笔记没有底部导航栏，保留鸿蒙上焦点兜底；日记必须以视口收缩为准，
    // 键盘收起后立即卸载快捷栏，让底部导航栏恢复原位。
    const isOpen = keyboardHeight > 50 || (isHarmonyBrowser && isVisible && !hasTabBar);
    setKeyboardOpen(isOpen);

    // 只有确认键盘关闭后才更新基准，避免把键盘收缩后的高度记录进去。
    if (!isOpen) {
      layoutHeightRef.current = Math.max(
        window.innerHeight,
        document.documentElement.clientHeight,
        viewport.height,
      );
    }

    window.dispatchEvent(new CustomEvent('keyboard-change', { detail: { open: isOpen } }));
  }, [hasTabBar, isVisible]);

  useEffect(() => {
    if (!isVisible) {
      window.dispatchEvent(new CustomEvent('keyboard-change', { detail: { open: false } }));
      return;
    }
    const viewport = window.visualViewport;

    const frame = window.requestAnimationFrame(updatePosition);
    window.addEventListener('resize', updatePosition);
    document.addEventListener('focusin', updatePosition);
    document.addEventListener('focusout', updatePosition);
    viewport?.addEventListener('resize', updatePosition);
    viewport?.addEventListener('scroll', updatePosition);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', updatePosition);
      document.removeEventListener('focusin', updatePosition);
      document.removeEventListener('focusout', updatePosition);
      viewport?.removeEventListener('resize', updatePosition);
      viewport?.removeEventListener('scroll', updatePosition);
      window.dispatchEvent(new CustomEvent('keyboard-change', { detail: { open: false } }));
    };
  }, [isVisible, updatePosition]);

  // 工具栏只服务于正在编辑的节点，并且只在输入法键盘可见时显示。
  // 键盘收起后必须卸载，不能继续固定在页面底部遮挡内容。
  if (!isVisible || !keyboardOpen) return null;

  return (
    <div
      role="toolbar"
      aria-label="节点编辑工具栏"
      className="keyboard-toolbar flex-none mx-3 mb-2 overflow-hidden rounded-full border border-white/55 bg-white/45 shadow-lg shadow-gray-400/15 backdrop-blur-2xl backdrop-saturate-200 dark:border-gray-700/70 dark:bg-gray-800/55 dark:shadow-black/20 z-50"
      style={{ flex: '0 0 44px' }}
      onMouseDown={(event) => event.preventDefault()}
      onTouchStart={(event) => event.preventDefault()}
    >
      <div className="flex h-full items-center justify-around">
        <ToolbarButton icon={<ChevronRight size={18} />} label="缩进" onClick={onIndent} />
        <ToolbarButton icon={<ChevronLeft size={18} />} label="提升" onClick={onOutdent} />
        <ToolbarButton icon={<CheckSquare size={18} />} label="待办" onClick={onToggleTodo} />
        <ToolbarButton icon={<MessageSquare size={18} />} label="备注" onClick={onAddNote} />
        <ToolbarButton icon={<Hash size={18} />} label="标签" onClick={onTag} />
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
