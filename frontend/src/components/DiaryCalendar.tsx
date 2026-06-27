import { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronLeft, ChevronRight, ChevronDown, MoreHorizontal, CalendarDays, Trash2, Pencil } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getDiaryMonths, getMonthlyDiary, getOrCreateDayNode, getDiaryDayDates, deleteTodo, createNode, updateTodo } from '../api/data';
import type { Todo } from '../api/data';
import { useDiary } from '../context/DiaryContext';
import { parseTodoDueDate } from '../utils/todoDueDate';
import { showToast } from '../utils/toast';

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number) {
  const day = new Date(year, month - 1, 1).getDay();
  return day === 0 ? 6 : day - 1;
}

interface DiaryCalendarProps {
  onNavigate?: () => void;
  pendingTasks?: Todo[];
  onTaskToggle?: (todoId: string) => void;
  onTaskMoved?: () => void;
}

export default function DiaryCalendar({ onNavigate, pendingTasks = [], onTaskToggle, onTaskMoved }: DiaryCalendarProps) {
  const navigate = useNavigate();
  const diaryCtx = useDiary();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [localDiaryDays, setLocalDiaryDays] = useState<Set<number>>(new Set());
  const [monthItems, setMonthItems] = useState<{ year: number; months: number[] }[]>([]);
  const [expandedYears, setExpandedYears] = useState<Set<number>>(new Set([today.getFullYear()]));
  const [loading, setLoading] = useState(false);
  const [dragOverDay, setDragOverDay] = useState<number | null>(null);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);

  // Handle todo drop on a day cell: create diary node from todo, then delete todo
  const handleTodoDrop = async (day: number, e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverDay(null);
    const todoId = e.dataTransfer.getData('text/todo-id');
    const todoContent = e.dataTransfer.getData('text/todo-content');
    if (!todoId || !todoContent) return;
    try {
      const [diaryData, dayResult] = await Promise.all([
        getMonthlyDiary(year, month),
        getOrCreateDayNode(year, month, day),
      ]);
      // Create a child node under the day node with the todo content
      const newNode = await createNode(diaryData.document.id, todoContent, dayResult.node_id, { is_todo: true });
      // Delete the todo from the independent todo list
      await deleteTodo(todoId);
      showToast(`已安排到 ${month}月${day}日`);
      onTaskMoved?.();

      // Hot update: if viewing this month's diary, add node to editor
      const isActive = diaryCtx.activeDiary?.year === year && diaryCtx.activeDiary?.month === month;
      if (isActive && diaryCtx.handleDayClick && diaryCtx.addNodeToEditor) {
        await diaryCtx.handleDayClick(day); // ensure day node exists & scroll
        diaryCtx.addNodeToEditor(newNode);   // add todo node to editor
        diaryCtx.setDiaryDays(prev => new Set([...prev, day]));
      }
    } catch (err) {
      console.error('Failed to drop todo to day:', err);
    }
  };

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

  // "安排到今天" - move todo to today's diary
  const handleScheduleToday = async (todo: Todo) => {
    setActiveMenuId(null);
    try {
      const t = new Date();
      const y = t.getFullYear();
      const m = t.getMonth() + 1;
      const d = t.getDate();
      const [diaryData, dayResult] = await Promise.all([
        getMonthlyDiary(y, m),
        getOrCreateDayNode(y, m, d),
      ]);
      const newNode = await createNode(diaryData.document.id, todo.content, dayResult.node_id, { is_todo: true });
      await deleteTodo(todo.id);
      showToast('已安排到今天');
      onTaskMoved?.();

      // Hot update: if viewing this month's diary, add node to editor
      const isActive = diaryCtx.activeDiary?.year === y && diaryCtx.activeDiary?.month === m;
      if (isActive && diaryCtx.handleDayClick && diaryCtx.addNodeToEditor) {
        await diaryCtx.handleDayClick(d);
        diaryCtx.addNodeToEditor(newNode);
        diaryCtx.setDiaryDays(prev => new Set([...prev, d]));
      }
    } catch (err) {
      console.error('Failed to schedule todo for today:', err);
    }
  };

  // Delete todo
  const handleDeleteTodo = async (todoId: string) => {
    setActiveMenuId(null);
    try {
      await deleteTodo(todoId);
      showToast('待办已删除');
      onTaskMoved?.();
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
      onTaskMoved?.();
    } catch (err) {
      console.error('Failed to update todo:', err);
    }
  };

  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  // Use context diaryDays when viewing the same month, otherwise use local
  const isActiveMonth = diaryCtx.activeDiary?.year === year && diaryCtx.activeDiary?.month === month;
  const diaryDays = isActiveMonth ? diaryCtx.diaryDays : localDiaryDays;

  // Fetch which days have content for current month view
  const fetchDays = useCallback(async (y: number, m: number) => {
    try {
      const days = await getDiaryDayDates(y, m);
      setLocalDiaryDays(new Set(days));
    } catch {
      setLocalDiaryDays(new Set());
    }
  }, []);

  // Fetch year archive
  const fetchMonths = useCallback(async () => {
    try {
      const items = await getDiaryMonths();
      setMonthItems(items);
    } catch {
      setMonthItems([]);
    }
  }, []);

  useEffect(() => {
    fetchDays(year, month);
    fetchMonths();
  }, [year, month, fetchDays, fetchMonths]);

  const prevMonth = () => {
    if (month === 1) { setYear(year - 1); setMonth(12); }
    else { setMonth(month - 1); }
  };

  const nextMonth = () => {
    if (month === 12) { setYear(year + 1); setMonth(1); }
    else { setMonth(month + 1); }
  };

  // Click a month header → navigate to monthly diary
  const handleMonthClick = async (y: number, m: number) => {
    setLoading(true);
    try {
      const data = await getMonthlyDiary(y, m);
      if (data.is_new) fetchMonths();
      navigate(`/d/${data.document.id}`);
      onNavigate?.();
    } catch (e) {
      console.error('Failed to open diary', e);
    } finally {
      setLoading(false);
    }
  };

  // Click a day in calendar → navigate and create day node
  const handleDayClick = async (day: number) => {
    // If already viewing this month's diary, use context handler (no navigation)
    if (isActiveMonth && diaryCtx.handleDayClick) {
      diaryCtx.handleDayClick(day);
      return;
    }
    setLoading(true);
    try {
      const [data] = await Promise.all([
        getMonthlyDiary(year, month),
        getOrCreateDayNode(year, month, day),
      ]);
      if (data.is_new) fetchMonths();
      navigate(`/d/${data.document.id}`);
      onNavigate?.();
    } catch (e) {
      console.error('Failed to open diary', e);
    } finally {
      setLoading(false);
    }
  };

  // Click a year in archive → toggle expand
  const toggleYear = (y: number) => {
    setExpandedYears(prev => {
      const next = new Set(prev);
      if (next.has(y)) next.delete(y);
      else next.add(y);
      return next;
    });
  };

  const daysInMonth = getDaysInMonth(year, month);
  const firstDayOfWeek = getFirstDayOfWeek(year, month);
  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth() + 1;

  // Build calendar grid
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDayOfWeek; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="flex flex-col h-full">
      {/* Calendar */}
      <div className="px-2 py-3">
        {/* Month header */}
        <div className="flex items-center justify-between mb-3">
          <button onClick={prevMonth} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors">
            <ChevronLeft className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          </button>
          <button
            onClick={() => handleMonthClick(year, month)}
            className="text-sm font-medium text-gray-700 dark:text-gray-200 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
          >
            {year}年{month}月
          </button>
          <button onClick={nextMonth} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors">
            <ChevronRight className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        {/* Weekday labels */}
        <div className="grid grid-cols-7 mb-1">
          {WEEKDAYS.map(d => (
            <div key={d} className="text-center text-[10px] text-gray-400 dark:text-gray-500 py-1">{d}</div>
          ))}
        </div>

        {/* Day grid */}
        <div className="grid grid-cols-7">
          {cells.map((day, i) => {
            if (day === null) return <div key={`empty-${i}`} className="h-8" />;
            const isToday = isCurrentMonth && day === today.getDate();
            const hasEntry = diaryDays.has(day);
            return (
              <button
                key={day}
                onClick={() => handleDayClick(day)}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOverDay(day); }}
                onDragLeave={() => setDragOverDay(null)}
                onDrop={(e) => handleTodoDrop(day, e)}
                className={`relative h-8 flex flex-col items-center justify-center text-xs rounded transition-colors ${
                  dragOverDay === day
                    ? 'bg-blue-200 dark:bg-blue-800 ring-2 ring-blue-400 dark:ring-blue-500'
                    : isToday
                    ? 'bg-[#3f587f] dark:bg-[#3f587f] text-white dark:text-white font-semibold'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                <span>{day}</span>
                {hasEntry && (
                  <span className={`absolute bottom-0.5 w-1 h-1 rounded-full ${isToday ? 'bg-white' : 'bg-gray-400 dark:bg-gray-500'}`} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Pending todos */}
      {pendingTasks.length > 0 && (
        <div className="px-2 py-2">
          <div className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2 px-1">待办</div>
          <div className="space-y-1.5">
            {pendingTasks.map(task => {
              const isEditing = editingId === task.id;
              const parsed = parseTodoDueDate(isEditing ? editText : task.content);
              const dateClass = parsed.urgency === 'today' ? 'text-orange-500 font-medium' :
                parsed.urgency === 'soon' ? 'text-amber-500' :
                'text-gray-400 dark:text-gray-500';
              return (
              <div
                key={task.id}
                draggable={!isEditing}
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/todo-id', task.id);
                  e.dataTransfer.setData('text/todo-content', task.content);
                  e.dataTransfer.effectAllowed = 'move';
                }}
                className="relative flex items-start gap-2 px-2.5 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 cursor-grab active:cursor-grabbing group"
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
                    setActiveMenuId(activeMenuId === task.id ? null : task.id);
                  }}
                  className="shrink-0 p-0.5 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors opacity-0 group-hover:opacity-100"
                >
                  <MoreHorizontal className="w-3.5 h-3.5" />
                </button>
                {activeMenuId === task.id && (
                  <div
                    ref={menuRef}
                    className="absolute right-0 top-full mt-1 z-50 w-36 bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-700 py-1"
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
                      onClick={(e) => { e.stopPropagation(); handleDeleteTodo(task.id); }}
                      className="w-full px-3 py-1.5 text-left text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      删除
                    </button>
                  </div>
                )}
              </div>
            );
            })}
          </div>
        </div>
      )}

      {/* Divider */}
      <div className="border-t border-gray-200 dark:border-gray-700 mx-2" />

      {/* Year archive */}
      <div className="flex-1 overflow-y-auto px-2 py-2 custom-scrollbar">
        <div className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2 px-1">归档</div>
        {monthItems.length === 0 ? (
          <div className="text-xs text-gray-400 text-center py-4">暂无日记</div>
        ) : (
          monthItems.map(item => (
            <div key={item.year} className="mb-1">
              <button
                onClick={() => toggleYear(item.year)}
                className="w-full flex items-center gap-1 px-1 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
              >
                <ChevronDown className={`w-3 h-3 transition-transform ${expandedYears.has(item.year) ? '' : '-rotate-90'}`} />
                {item.year}年
              </button>
              {expandedYears.has(item.year) && (
                <div className="flex flex-wrap gap-1 pl-5 pb-1">
                  {item.months.map(m => (
                    <button
                      key={m}
                      onClick={() => handleMonthClick(item.year, m)}
                      className={`px-2 py-1 text-xs rounded transition-colors ${
                        item.year === year && m === month
                          ? 'bg-[#3f587f] dark:bg-[#3f587f] text-white dark:text-white font-medium'
                          : 'text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                      }`}
                    >
                      {m}月
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {loading && (
        <div className="text-center text-[10px] text-gray-400 py-1">加载中...</div>
      )}
    </div>
  );
}
