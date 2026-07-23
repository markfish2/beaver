import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  Check, Circle, ChevronDown, ChevronRight, Plus, Trash2, GripVertical,
} from 'lucide-react';
import type { Task } from '../api/projects';
import DeleteConfirmDialog from './DeleteConfirmDialog';

// ==================== Dark mode hook ====================

function useIsDark() {
  const [isDark, setIsDark] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('outline-font-settings') || '{}');
      if (saved.theme === 'dark') return true;
      if (saved.theme && saved.theme !== 'dark') return false;
    } catch { /* ignore */ }
    return document.documentElement.classList.contains('dark') ||
      window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    const onThemeChange = () => {
      try {
        const saved = JSON.parse(localStorage.getItem('outline-font-settings') || '{}');
        if (saved.theme === 'dark') { setIsDark(true); return; }
        if (saved.theme && saved.theme !== 'dark') { setIsDark(false); return; }
      } catch { /* ignore */ }
      setIsDark(document.documentElement.classList.contains('dark'));
    };
    window.addEventListener('theme-change', onThemeChange);
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    mql.addEventListener('change', onThemeChange);
    return () => {
      window.removeEventListener('theme-change', onThemeChange);
      mql.removeEventListener('change', onThemeChange);
    };
  }, []);

  return isDark;
}

// ==================== Depth-based colors ====================

const DEPTH_COLORS = [
  { bg: 'bg-white dark:bg-gray-900', border: 'border-transparent' },
];

function getDepthStyle(depth: number, isDone: boolean) {
  if (isDone) {
    return { bg: 'bg-gray-100 dark:bg-gray-800/30', border: 'border-gray-200 dark:border-gray-700/50' };
  }
  return DEPTH_COLORS[depth % DEPTH_COLORS.length];
}

// ==================== Drag & Drop ====================

interface DragState {
  draggedId: string | null;
  overId: string | null;
  dropPosition: 'before' | 'after' | 'inside' | null;
}

// ==================== Types ====================

interface TaskCardProps {
  task: Task;
  onToggle: (id: string) => void;
  onUpdate: (id: string, data: Partial<Task>) => void;
  onDelete: (id: string) => void;
  onAddChild: (parentId: string) => void;
  onMove?: (taskId: string, targetId: string, position: 'before' | 'after' | 'inside') => void;
  depth?: number;
  isLastChild?: boolean;
  parentTreeLines?: boolean[];
  dragState?: DragState;
  onDragStart?: (id: string) => void;
  onDragOver?: (id: string, position: 'before' | 'after' | 'inside') => void;
  onDragEnd?: () => void;
}

// ==================== Date helpers ====================

function formatMMDD(dateStr: string): string {
  if (!dateStr) return '--/--';
  try {
    const d = new Date(dateStr + 'T00:00:00');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${mm}/${dd}`;
  } catch {
    return dateStr;
  }
}

// ==================== Inline date editor ====================

function InlineDate({ value, onChange, className }: { value: string; onChange: (v: string) => void; className?: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const handleClick = () => {
    if (inputRef.current) {
      inputRef.current.showPicker?.() || inputRef.current.click();
    }
  };
  return (
    <span className={`relative inline-flex items-center ${className || ''}`}>
      <span
        onClick={handleClick}
        className="text-[11px] cursor-pointer hover:text-blue-500 transition-colors w-[40px] text-center"
      >
        {formatMMDD(value)}
      </span>
      <input
        ref={inputRef}
        type="date"
        value={value || ''}
        onChange={e => { if (e.target.value) onChange(e.target.value); }}
        className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
        style={{ fontSize: '16px' }}
      />
    </span>
  );
}

// ==================== Component ====================

export default function TaskCard({
  task,
  onToggle,
  onUpdate,
  onDelete,
  onAddChild,
  onMove,
  depth = 0,
  dragState,
  onDragStart,
  onDragOver,
  onDragEnd,
  isLastChild = true,
  parentTreeLines = [],
}: TaskCardProps) {
  const isDark = useIsDark();
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);
  const [collapsed, setCollapsed] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [narrow, setNarrow] = useState(false);

  // Tree line data to pass to children
  const currentTreeLines = useMemo(() => {
    if (depth === 0) return [];
    return [...parentTreeLines, !isLastChild];
  }, [depth, parentTreeLines, isLastChild]);

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        setNarrow(entry.contentRect.width < 320);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleTitleClick = useCallback(() => {
    setIsEditing(true);
    setEditTitle(task.title);
  }, [task.title]);

  const handleSaveTitle = useCallback(async () => {
    const trimmed = editTitle.trim();
    if (trimmed && trimmed !== task.title) {
      try { await onUpdate(task.id, { title: trimmed }); }
      catch (err) { console.error('Failed to update task title:', err); }
    }
    setIsEditing(false);
  }, [editTitle, task.id, task.title, onUpdate]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); handleSaveTitle(); }
    else if (e.key === 'Escape') { setEditTitle(task.title); setIsEditing(false); }
  }, [handleSaveTitle, task.title]);

  const handleDateChange = useCallback(async (field: 'start_date' | 'end_date', value: string) => {
    try { await onUpdate(task.id, { [field]: value }); }
    catch (err) { console.error('Failed to update task date:', err); }
  }, [task.id, onUpdate]);

  const handleToggle = useCallback(async () => {
    try { await onToggle(task.id); }
    catch (err) { console.error('Failed to toggle task:', err); }
  }, [task.id, onToggle]);

  const handleDeleteConfirm = useCallback(async () => {
    setShowDeleteDialog(false);
    try { await onDelete(task.id); }
    catch (err) { console.error('Failed to delete task:', err); }
  }, [task.id, onDelete]);

  const handleAddChild = useCallback(async () => {
    try { await onAddChild(task.id); }
    catch (err) { console.error('Failed to add child task:', err); }
  }, [task.id, onAddChild]);

  // Drag handlers
  const handleDragStart = useCallback((e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', task.id);
    onDragStart?.(task.id);
  }, [task.id, onDragStart]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!cardRef.current || !onDragOver) return;
    const rect = cardRef.current.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const h = rect.height;
    let position: 'before' | 'after' | 'inside';
    if (y < h * 0.25) position = 'before';
    else if (y > h * 0.75) position = 'after';
    else position = 'inside';
    onDragOver(task.id, position);
  }, [task.id, onDragOver]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const draggedId = e.dataTransfer.getData('text/plain');
    if (draggedId && draggedId !== task.id && onMove && dragState?.dropPosition) {
      onMove(draggedId, task.id, dragState.dropPosition);
    }
    onDragEnd?.();
  };

  const handleDragEnd = useCallback(() => {
    onDragEnd?.();
  }, [onDragEnd]);

  const hasChildren = task.children && task.children.length > 0;
  const colors = getDepthStyle(depth, task.is_done);
  const isDragTarget = dragState?.overId === task.id;
  const isDragging = dragState?.draggedId === task.id;

  return (
    <div>
      {/* Drop indicator: before */}
      {isDragTarget && dragState?.dropPosition === 'before' && (
        <div className="h-0.5 bg-blue-500 rounded-full mb-0.5 mx-4" />
      )}

      {/* Tree + card row */}
      <div className="flex items-stretch">
        {/* Tree connectors — outside the card, in the indent area */}
        {depth > 0 && (
          <div className="flex-shrink-0 flex" style={{ width: depth * 16 }}>
            {parentTreeLines.map((continueLine, i) => (
              <div key={i} className="w-4 flex justify-center">
                {continueLine && <div className="w-px h-full bg-gray-300 dark:bg-gray-700" />}
              </div>
            ))}
            <div className="w-4 flex items-start justify-center pt-3">
              <span className="text-gray-300 dark:text-gray-700 text-[15px] leading-none select-none">
                {isLastChild ? '└─' : '├─'}
              </span>
            </div>
          </div>
        )}

        {/* Card */}
        <div
          ref={cardRef}
          draggable
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onDragEnd={handleDragEnd}
          className={`
            flex-1 min-w-0
            rounded-none px-3 py-2 border transition-all duration-150 shadow-sm
            ${colors.bg} ${colors.border}
            ${isDragging ? 'opacity-40 scale-95' : ''}
            ${isDragTarget && dragState?.dropPosition === 'inside' ? 'ring-2 ring-blue-400 dark:ring-blue-500' : ''}
          `}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
        {narrow ? (
          <>
            {/* Row 1: handle + collapse + checkbox + title */}
            <div className="flex items-center gap-1.5">
              <GripVertical size={12} className="flex-shrink-0 text-gray-300 dark:text-gray-600 cursor-grab active:cursor-grabbing" />
              {hasChildren ? (
                <button
                  onClick={() => setCollapsed(!collapsed)}
                  className="flex-shrink-0 p-0.5 rounded hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                >
                  {collapsed
                    ? <ChevronRight size={12} className="text-gray-400" />
                    : <ChevronDown size={12} className="text-gray-400" />
                  }
                </button>
              ) : (
                <span className="w-4 flex-shrink-0" />
              )}
              <button
                onClick={handleToggle}
                className="flex-shrink-0 p-0.5 rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
              >
                {task.is_done
                  ? <Check size={14} className="text-green-500" />
                  : <Circle size={14} className="text-gray-400" />
                }
              </button>
              <div className="flex-1 min-w-0">
                {isEditing ? (
                  <input
                    ref={inputRef}
                    type="text"
                    value={editTitle}
                    onChange={e => setEditTitle(e.target.value)}
                    onBlur={handleSaveTitle}
                    onKeyDown={handleKeyDown}
                    className={`w-full bg-transparent outline-none border-b border-blue-400 text-[13px] py-0 ${
                      task.is_done ? 'line-through opacity-50 text-gray-500 dark:text-gray-400' : 'text-gray-800 dark:text-gray-100'
                    }`}
                  />
                ) : (
                  <span
                    onClick={handleTitleClick}
                    className={`text-[13px] cursor-pointer select-none ${
                      task.is_done
                        ? 'line-through opacity-50 text-gray-500 dark:text-gray-400'
                        : 'text-gray-800 dark:text-gray-100 hover:text-blue-600 dark:hover:text-blue-400'
                    }`}
                  >
                    {task.title}
                  </span>
                )}
              </div>
            </div>
            {/* Row 2: dates + actions, indented past the icons */}
            <div className="flex items-center gap-1.5 ml-6 mt-1">
              <div className="flex items-center gap-0.5 flex-shrink-0">
                <InlineDate
                  value={task.start_date}
                  onChange={v => handleDateChange('start_date', v)}
                  className="text-gray-500 dark:text-gray-400"
                />
                <span className="text-gray-300 dark:text-gray-600 text-[11px]">—</span>
                <InlineDate
                  value={task.end_date}
                  onChange={v => handleDateChange('end_date', v)}
                  className="text-gray-500 dark:text-gray-400"
                />
              </div>
              <div className="flex-1" />
              {isHovered && (
                <div className="flex items-center gap-0.5 flex-shrink-0">
                  <button onClick={handleAddChild} className="p-0.5 rounded hover:bg-black/5 dark:hover:bg-white/5 transition-colors" title="添加子任务">
                    <Plus size={12} className="text-gray-400" />
                  </button>
                  <button onClick={() => setShowDeleteDialog(true)} className="p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors" title="删除任务">
                    <Trash2 size={12} className="text-gray-400 hover:text-red-500" />
                  </button>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex items-center gap-1.5">
            {/* Drag handle */}
            <GripVertical size={12} className="flex-shrink-0 text-gray-300 dark:text-gray-600 cursor-grab active:cursor-grabbing" />

            {/* Collapse/expand toggle */}
            {hasChildren ? (
              <button
                onClick={() => setCollapsed(!collapsed)}
                className="flex-shrink-0 p-0.5 rounded hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
              >
                {collapsed
                  ? <ChevronRight size={12} className="text-gray-400" />
                  : <ChevronDown size={12} className="text-gray-400" />
                }
              </button>
            ) : (
              <span className="w-4 flex-shrink-0" />
            )}

            {/* Checkbox */}
            <button
              onClick={handleToggle}
              className="flex-shrink-0 p-0.5 rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            >
              {task.is_done
                ? <Check size={14} className="text-green-500" />
                : <Circle size={14} className="text-gray-400" />
              }
            </button>

            {/* Title */}
            <div className="flex-1 min-w-0">
              {isEditing ? (
                <input
                  ref={inputRef}
                  type="text"
                  value={editTitle}
                  onChange={e => setEditTitle(e.target.value)}
                  onBlur={handleSaveTitle}
                  onKeyDown={handleKeyDown}
                  className={`w-full bg-transparent outline-none border-b border-blue-400 text-[13px] py-0 ${
                    task.is_done ? 'line-through opacity-50 text-gray-500 dark:text-gray-400' : 'text-gray-800 dark:text-gray-100'
                  }`}
                />
              ) : (
                <span
                  onClick={handleTitleClick}
                  className={`text-[13px] cursor-pointer select-none ${
                    task.is_done
                      ? 'line-through opacity-50 text-gray-500 dark:text-gray-400'
                      : 'text-gray-800 dark:text-gray-100 hover:text-blue-600 dark:hover:text-blue-400'
                  }`}
                >
                  {task.title}
                </span>
              )}
            </div>

            {/* Date range: MM/DD - MM/DD */}
            <div className="flex items-center gap-0.5 flex-shrink-0">
              <InlineDate
                value={task.start_date}
                onChange={v => handleDateChange('start_date', v)}
                className="text-gray-500 dark:text-gray-400"
              />
              <span className="text-gray-300 dark:text-gray-600 text-[11px]">—</span>
              <InlineDate
                value={task.end_date}
                onChange={v => handleDateChange('end_date', v)}
                className="text-gray-500 dark:text-gray-400"
              />
            </div>

            {/* Hover actions */}
            {isHovered && (
              <div className="flex items-center gap-0.5 flex-shrink-0">
                <button onClick={handleAddChild} className="p-0.5 rounded hover:bg-black/5 dark:hover:bg-white/5 transition-colors" title="添加子任务">
                  <Plus size={12} className="text-gray-400" />
                </button>
                <button onClick={() => setShowDeleteDialog(true)} className="p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors" title="删除任务">
                  <Trash2 size={12} className="text-gray-400 hover:text-red-500" />
                </button>
              </div>
            )}
          </div>
        )}
        </div>
      </div>

      {/* Drop indicator: after */}
      {isDragTarget && dragState?.dropPosition === 'after' && (
        <div className="h-0.5 bg-blue-500 rounded-full mt-0.5 mx-4" />
      )}

      {/* Children */}
      {hasChildren && !collapsed && (
        <div className="mt-0.5 space-y-0.5">
          {task.children.map((child, idx) => (
            <TaskCard
              key={child.id}
              task={child}
              onToggle={onToggle}
              onUpdate={onUpdate}
              onDelete={onDelete}
              onAddChild={onAddChild}
              onMove={onMove}
              depth={depth + 1}
              isLastChild={idx === task.children.length - 1}
              parentTreeLines={currentTreeLines}
              dragState={dragState}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDragEnd={onDragEnd}
            />
          ))}
        </div>
      )}

      {/* Delete confirmation dialog */}
      <DeleteConfirmDialog
        isOpen={showDeleteDialog}
        title="删除任务"
        message={`确定要删除「${task.title}」吗？${hasChildren ? '子任务也会一并删除。' : ''}`}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setShowDeleteDialog(false)}
      />
    </div>
  );
}
