import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronUp, ChevronDown, MoreHorizontal, CalendarDays, Trash2, Pencil } from 'lucide-react';
import { getTodos, deleteTodo, createTodo, updateTodo, getMonthlyDiary, getOrCreateDayNode, createNode } from '../../api/data';
import type { Todo } from '../../api/data';
import { parseTodoDueDate } from '../../utils/todoDueDate';
import { showToast } from '../../utils/toast';
import DeleteConfirmDialog from '../DeleteConfirmDialog';

interface MobileTodosProps {
  onTasksChanged?: () => void;
}

export default function MobileTodos({ onTasksChanged }: MobileTodosProps) {
  const [tasks, setTasks] = useState<Todo[]>([]);
  const [expanded, setExpanded] = useState(true);
  const [loading, setLoading] = useState(true);
  const [newTodoText, setNewTodoText] = useState('');
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [pendingDelete, setPendingDelete] = useState<{ id: string; content: string } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const newTodoInputRef = useRef<HTMLInputElement>(null);

  const fetchTodos = async () => {
    try {
      const todos = await getTodos(false);
      setTasks(todos);
    } catch (err) {
      console.error('Failed to fetch todos:', err);
    }
  };

  // Initial fetch
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const todos = await getTodos(false);
        if (!cancelled) setTasks(todos);
      } catch (err) {
        console.error('Failed to fetch todos:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  // Close menu on outside click
  useEffect(() => {
    if (!activeMenuId) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setActiveMenuId(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [activeMenuId]);

  // 日记节点进入编辑状态时，键盘会占用移动端的可视区域；此时把顶部待办栏
  // 收起，给正在编辑的日记内容让出空间。待办栏自身的输入框不触发收起，
  // 否则编辑待办时会把正在输入的区域突然移走。
  useEffect(() => {
    const handleKeyboardChange = (event: Event) => {
      const open = (event as CustomEvent<{ open?: boolean }>).detail?.open === true;
      if (!open || editingId !== null) return;

      const activeElement = document.activeElement;
      if (!(activeElement instanceof HTMLElement)) return;
      const isDiaryNodeEditor = (
        activeElement.id.startsWith('node-') || activeElement.id.startsWith('note-')
      ) && !!activeElement.closest('.outline-content-scroll-area');
      if (isDiaryNodeEditor) setExpanded(false);
    };

    window.addEventListener('keyboard-change', handleKeyboardChange);
    return () => window.removeEventListener('keyboard-change', handleKeyboardChange);
  }, [editingId]);

  const handleAddTodo = async () => {
    const trimmed = newTodoText.trim();
    if (!trimmed) return;
    try {
      await createTodo(trimmed);
      setNewTodoText('');
      showToast('待办已创建');
      fetchTodos();
      onTasksChanged?.();
    } catch (err) {
      console.error('Failed to create todo:', err);
    }
  };

  const handleScheduleToday = async (todo: Todo) => {
    setActiveMenuId(null);
    try {
      const t = new Date();
      const [diaryData, dayResult] = await Promise.all([
        getMonthlyDiary(t.getFullYear(), t.getMonth() + 1),
        getOrCreateDayNode(t.getFullYear(), t.getMonth() + 1, t.getDate()),
      ]);
      await createNode(diaryData.document.id, todo.content, dayResult.node_id, { is_todo: true });
      await deleteTodo(todo.id);
      showToast('已安排到今天');
      fetchTodos();
      onTasksChanged?.();
    } catch (err) {
      console.error('Failed to schedule todo for today:', err);
    }
  };

  const requestDeleteTodo = (task: Todo) => {
    setActiveMenuId(null);
    setPendingDelete({ id: task.id, content: task.content });
  };

  const handleDeleteTodo = async () => {
    if (!pendingDelete) return;
    try {
      await deleteTodo(pendingDelete.id);
      setPendingDelete(null);
      showToast('待办已删除');
      fetchTodos();
      onTasksChanged?.();
    } catch (err) {
      console.error('Failed to delete todo:', err);
    }
  };

  const handleStartEdit = (task: Todo) => {
    setActiveMenuId(null);
    setEditingId(task.id);
    setEditText(task.content);
  };

  const handleSaveEdit = async (todoId: string) => {
    const trimmed = editText.trim();
    if (!trimmed) { setEditingId(null); return; }
    try {
      await updateTodo(todoId, { content: trimmed });
      setEditingId(null);
      showToast('待办已更新');
      fetchTodos();
      onTasksChanged?.();
    } catch (err) {
      console.error('Failed to update todo:', err);
    }
  };

  if (loading && tasks.length === 0) {
    return null;
  }

  if (tasks.length === 0) {
    return (
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <input
            ref={newTodoInputRef}
            type="text"
            value={newTodoText}
            onChange={(e) => setNewTodoText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAddTodo(); }}
            onBlur={handleAddTodo}
            placeholder="添加待办..."
            className="flex-1 text-sm bg-transparent border-none outline-none placeholder-gray-400 text-gray-800 dark:text-gray-200"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="border-b border-gray-200 dark:border-gray-700">
      {/* Header with collapse toggle */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-2 text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wider hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
      >
        <span>待办 ({tasks.length})</span>
        {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>

      {expanded && (
        <div className="px-4 pb-3 space-y-1.5">
          {tasks.map(task => {
            const isEditing = editingId === task.id;
            const parsed = parseTodoDueDate(isEditing ? editText : task.content);
            const dateClass = parsed.urgency === 'today' ? 'text-orange-500 font-medium' :
              parsed.urgency === 'soon' ? 'text-amber-500' :
              'text-gray-400 dark:text-gray-500';
            return (
            <div
              key={task.id}
              className="relative flex items-start gap-2 px-2.5 py-2 bg-gray-50 dark:bg-gray-800 rounded-lg group"
            >
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-gray-400 dark:bg-gray-500 shrink-0" />
              {isEditing ? (
                <>
                  <input
                    ref={editInputRef}
                    type="text"
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveEdit(task.id);
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                    onBlur={() => handleSaveEdit(task.id)}
                    className="flex-1 text-sm text-gray-700 dark:text-gray-300 bg-transparent border-none outline-none"
                  />
                  {parsed.dueDateLabel && (
                    <span className={`text-xs shrink-0 whitespace-nowrap ${dateClass}`}>
                      {parsed.dueDateLabel}
                    </span>
                  )}
                </>
              ) : (
                <span className="flex-1 flex items-center gap-2 min-w-0">
                  <span className="flex-1 text-sm text-gray-700 dark:text-gray-300 leading-snug break-all">
                    {parsed.displayContent || '无内容'}
                  </span>
                  {parsed.dueDateLabel && (
                    <span className={`text-xs shrink-0 whitespace-nowrap ${dateClass}`}>
                      {parsed.dueDateLabel}
                    </span>
                  )}
                </span>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (activeMenuId === task.id) {
                    setActiveMenuId(null);
                    setMenuPosition(null);
                    return;
                  }
                  const row = e.currentTarget.parentElement;
                  const rect = row?.getBoundingClientRect();
                  if (rect) {
                    const menuWidth = 144;
                    const menuHeight = 124;
                    const top = rect.bottom + 4;
                    setMenuPosition({
                      top: top + menuHeight > window.innerHeight ? Math.max(8, rect.top - menuHeight - 4) : top,
                      left: Math.max(8, Math.min(window.innerWidth - menuWidth - 8, rect.right - menuWidth)),
                    });
                  }
                  setActiveMenuId(task.id);
                }}
                className="shrink-0 p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                <MoreHorizontal className="w-3.5 h-3.5" />
              </button>
              {activeMenuId === task.id && (
                createPortal(<div
                  ref={menuRef}
                  style={menuPosition ? { top: menuPosition.top, left: menuPosition.left } : undefined}
                  className="fixed z-[var(--layer-overlay)] w-36 bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-700 py-1"
                >
                  <button
                    onClick={(e) => { e.stopPropagation(); handleStartEdit(task); }}
                    className="w-full px-3 py-1.5 text-left text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    编辑
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleScheduleToday(task); }}
                    className="w-full px-3 py-1.5 text-left text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 transition-colors"
                  >
                    <CalendarDays className="w-3.5 h-3.5" />
                    安排到今天
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); requestDeleteTodo(task); }}
                    className="w-full px-3 py-1.5 text-left text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    删除
                  </button>
                </div>, document.body)
              )}
            </div>
            );
          })}

          {/* Add new todo input */}
          <div className="flex items-center gap-2 px-2.5 py-1.5">
            <span className="w-1.5 h-1.5 rounded-full border border-gray-300 dark:border-gray-600 shrink-0" />
            <input
              ref={newTodoInputRef}
              type="text"
              value={newTodoText}
              onChange={(e) => setNewTodoText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddTodo(); }}
              onBlur={handleAddTodo}
              placeholder="添加待办..."
              className="flex-1 text-sm bg-transparent border-none outline-none placeholder-gray-400 text-gray-800 dark:text-gray-200"
            />
          </div>
        </div>
      )}

      {/* 删除待办确认 */}
      <DeleteConfirmDialog
        isOpen={pendingDelete !== null}
        title="删除待办"
        message={`确定要删除「${pendingDelete?.content || ''}」吗？此操作无法撤销。`}
        onConfirm={() => void handleDeleteTodo()}
        onCancel={() => setPendingDelete(null)}
        showBackdrop={false}
      />
    </div>
  );
}
