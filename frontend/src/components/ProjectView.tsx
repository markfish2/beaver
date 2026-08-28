import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Plus, Archive, BarChart3, Calendar, ChevronDown, ChevronRight, Check, Circle, Trash2, Download } from 'lucide-react';
import type { Task, Project } from '../api/projects';
import {
  getTasks, getProjects, createTask, toggleTask, updateTask, deleteTask,
  getArchivedProjects, unarchiveProject,
} from '../api/projects';
import { exportProjectPdf } from '../utils/projectPdf';
import TaskCard from './TaskCard';
import DeleteConfirmDialog from './DeleteConfirmDialog';
import GanttChart from './GanttChart';

interface ProjectViewProps {
  projectId: string | null;
  showArchived?: boolean;
  archivedReloadKey?: number;
  onToggleArchived?: (show: boolean) => void;
  onDeselectProject?: () => void;
  isMobile?: boolean;
}

interface FlatTaskRow {
  task: Task;
  depth: number;
}

const PROJECT_TASK_ROW_HEIGHT = 32;
const PROJECT_TASK_HEADER_HEIGHT = 40;
const EMPTY_COLLAPSED_TASK_IDS = new Set<string>();

function defaultDateRange(): { start: string; end: string } {
  const today = new Date();
  const end = new Date(today);
  end.setDate(end.getDate() + 7);
  const fmt = (d: Date) => d.toISOString().split('T')[0];
  return { start: fmt(today), end: fmt(end) };
}

function addDaysToDateStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function flattenVisibleTasks(tasks: Task[], collapsedIds: ReadonlySet<string>): FlatTaskRow[] {
  const rows: FlatTaskRow[] = [];
  const walk = (list: Task[], depth: number) => {
    for (const task of list) {
      rows.push({ task, depth });
      if (task.children.length > 0 && !collapsedIds.has(task.id)) {
        walk(task.children, depth + 1);
      }
    }
  };
  walk(tasks, 0);
  return rows;
}

/** 在树中深度查找并更新一个节点 */
function updateTaskInTree(tasks: Task[], id: string, updater: (t: Task) => Task): Task[] {
  return tasks.map(t => {
    if (t.id === id) return updater(t);
    if (t.children.length > 0) return { ...t, children: updateTaskInTree(t.children, id, updater) };
    return t;
  });
}

/** 从树中删除一个节点 */
function removeTaskFromTree(tasks: Task[], id: string): Task[] {
  return tasks
    .filter(t => t.id !== id)
    .map(t => t.children.length > 0 ? { ...t, children: removeTaskFromTree(t.children, id) } : t);
}

/** 往树中某个父节点下插入新子任务 */
function addChildToTree(tasks: Task[], parentId: string, child: Task): Task[] {
  return tasks.map(t => {
    if (t.id === parentId) return { ...t, children: [...t.children, child] };
    if (t.children.length > 0) return { ...t, children: addChildToTree(t.children, parentId, child) };
    return t;
  });
}

function findTaskInTree(tasks: Task[], id: string): Task | null {
  for (const task of tasks) {
    if (task.id === id) return task;
    const found = findTaskInTree(task.children, id);
    if (found) return found;
  }
  return null;
}

/** 父任务周期 = 覆盖所有子任务的最早开始 ~ 最晚结束（与后端推导规则一致） */
function deriveSummaryDates(tasks: Task[]): Task[] {
  return tasks.map(task => {
    const children = deriveSummaryDates(task.children);
    if (children.length === 0) {
      return { ...task, children };
    }
    let start = children[0].start_date;
    let end = children[0].end_date;
    for (const child of children) {
      if (child.start_date < start) start = child.start_date;
      if (child.end_date > end) end = child.end_date;
    }
    return { ...task, start_date: start, end_date: end, children };
  });
}

/** 收集某任务及其全部后代 id（用于防止拖成环） */
function collectSubtreeIds(tasks: Task[], rootId: string): Set<string> {
  const ids = new Set<string>();
  const walk = (list: Task[], inSubtree: boolean) => {
    for (const task of list) {
      const isRoot = task.id === rootId;
      if (inSubtree || isRoot) {
        ids.add(task.id);
        walk(task.children, true);
      } else {
        walk(task.children, false);
      }
    }
  };
  walk(tasks, false);
  return ids;
}

interface MoveTaskResult {
  tasks: Task[];
  parentId: string | null;
  sortOrder: number;
}

/** 在树中移动节点并推导父任务周期，返回新树与落点所在的父级、新的 sort_order */
function moveTaskInTree(
  tasks: Task[],
  taskId: string,
  targetId: string,
  position: 'before' | 'after' | 'inside'
): MoveTaskResult | null {
  const flat: Task[] = [];
  const flatten = (list: Task[]) => { for (const t of list) { flat.push(t); flatten(t.children); } };
  flatten(tasks);
  const moved = flat.find(t => t.id === taskId);
  if (!moved) return null;

  // 不能把任务拖进自己的后代（会形成环）
  if (position === 'inside' && collectSubtreeIds(tasks, taskId).has(targetId)) {
    return null;
  }

  const without = removeTaskFromTree(tasks, taskId);
  let next: Task[];
  if (position === 'inside') {
    next = addChildToTree(without, targetId, moved);
  } else {
    const insertSibling = (list: Task[]): Task[] => {
      const result: Task[] = [];
      for (const t of list) {
        if (t.id === targetId) {
          if (position === 'before') { result.push(moved); result.push(t); }
          else { result.push(t); result.push(moved); }
        } else {
          result.push(t.children.length > 0 ? { ...t, children: insertSibling(t.children) } : t);
        }
      }
      return result;
    };
    next = insertSibling(without);
  }
  const derived = deriveSummaryDates(next);

  // 在移动后的树里定位被移动节点，计算新父级与兄弟排序
  let parentId: string | null = null;
  let siblings: Task[] = derived;
  let placed: Task | null = null;
  const find = (list: Task[], parent: string | null) => {
    for (const t of list) {
      if (t.id === taskId) {
        placed = t;
        parentId = parent;
        siblings = list;
        return true;
      }
      if (find(t.children, t.id)) return true;
    }
    return false;
  };
  find(derived, null);
  if (!placed) return null;

  const index = siblings.findIndex(t => t.id === taskId);
  const prevOrder = index > 0 ? siblings[index - 1].sort_order : null;
  const nextOrder = index >= 0 && index < siblings.length - 1 ? siblings[index + 1].sort_order : null;
  let sortOrder: number;
  if (prevOrder !== null && nextOrder !== null) {
    sortOrder = (prevOrder + nextOrder) / 2;
  } else if (prevOrder !== null) {
    sortOrder = prevOrder + 1000;
  } else if (nextOrder !== null) {
    sortOrder = nextOrder > 0 ? nextOrder / 2 : nextOrder - 1000;
  } else {
    sortOrder = placed.sort_order;
  }

  return { tasks: derived, parentId, sortOrder };
}

export default function ProjectView({ projectId, showArchived = false, archivedReloadKey = 0, onToggleArchived, onDeselectProject, isMobile = false }: ProjectViewProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [showGantt, setShowGantt] = useState(true);
  const [splitRatio, setSplitRatio] = useState(0.25); // 默认列表 1/4，甘特图 3/4
  const isDraggingRef = useRef(false);
  const taskTableScrollRef = useRef<HTMLDivElement>(null);
  const taskListInnerRef = useRef<HTMLDivElement>(null);
  const ganttWrapRef = useRef<HTMLDivElement>(null);
  const [ganttScale, setGanttScale] = useState<'day' | 'week'>('day');
  const [isLoading, setIsLoading] = useState(false);
  const [taskListNarrow, setTaskListNarrow] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [collapsedTaskState, setCollapsedTaskState] = useState<{ projectId: string | null; ids: Set<string> }>(() => ({
    projectId: null,
    ids: new Set(),
  }));
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingTaskTitle, setEditingTaskTitle] = useState('');

  // Drag state
  const [dragState, setDragState] = useState<{ draggedId: string | null; overId: string | null; dropPosition: 'before' | 'after' | 'inside' | null }>({ draggedId: null, overId: null, dropPosition: null });

  const [archivedProjects, setArchivedProjects] = useState<Project[]>([]);
  const [taskPendingDelete, setTaskPendingDelete] = useState<Task | null>(null);

  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newStart, setNewStart] = useState('');
  const [newEnd, setNewEnd] = useState('');
  const newTitleRef = useRef<HTMLInputElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  const collapsedTaskIds = collapsedTaskState.projectId === projectId ? collapsedTaskState.ids : EMPTY_COLLAPSED_TASK_IDS;
  const displayTasks = useMemo(() => deriveSummaryDates(tasks), [tasks]);
  const flatTaskRows = useMemo(() => flattenVisibleTasks(displayTasks, collapsedTaskIds), [displayTasks, collapsedTaskIds]);

  useEffect(() => {
    if (!projectId) return;
    let active = true;
    getTasks(projectId)
      .then(data => { if (active) setTasks(deriveSummaryDates(data)); })
      .catch(error => console.error('Failed to load tasks:', error))
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, [projectId]);

  // 任务列表过窄时让添加/删除按钮常显，避免被宽度压缩隐藏
  useEffect(() => {
    const el = taskListInnerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        setTaskListNarrow(entry.contentRect.width < 320);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [projectId, showGantt, isMobile]);

  useEffect(() => {
    if (!projectId) return;
    let active = true;
    getProjects()
      .then(projects => {
        if (!active) return;
        const project = projects.find(p => p.id === projectId);
        if (project) setProjectName(project.name);
      })
      .catch(() => {});
    return () => { active = false; };
  }, [projectId]);

  useEffect(() => {
    if (editingTaskId) titleInputRef.current?.focus();
  }, [editingTaskId]);

  // Fetch archived projects when toggled on
  useEffect(() => {
    if (!showArchived || projectId) return;
    getArchivedProjects()
      .then(setArchivedProjects)
      .catch(err => console.error('Failed to load archived projects:', err));
  }, [showArchived, projectId, archivedReloadKey]);

  // ==================== 乐观更新的 CRUD ====================

  const handleToggle = useCallback(async (id: string) => {
    // 乐观更新：立即翻转本地状态
    setTasks(prev => updateTaskInTree(prev, id, t => ({ ...t, is_done: !t.is_done })));
    try {
      await toggleTask(id);
      window.dispatchEvent(new CustomEvent('projects-refresh'));
      // 完成/取消完成会联动当天日记，通知日记页热更新
      window.dispatchEvent(new CustomEvent('diary-tasks-updated'));
      // 静默刷新以获取级联变化（父任务自动完成等）
      if (projectId) getTasks(projectId).then(data => setTasks(deriveSummaryDates(data))).catch(() => {});
    } catch {
      // 回滚
      if (projectId) getTasks(projectId).then(data => setTasks(deriveSummaryDates(data)));
    }
  }, [projectId]);

  const handleUpdate = useCallback(async (id: string, data: Partial<Task>) => {
    const current = findTaskInTree(tasks, id);
    const safeData = current?.children.length
      ? Object.fromEntries(Object.entries(data).filter(([key]) => key !== 'start_date' && key !== 'end_date'))
      : data;
    if (Object.keys(safeData).length === 0) return;
    setTasks(prev => deriveSummaryDates(updateTaskInTree(prev, id, t => ({ ...t, ...safeData }))));
    try {
      await updateTask(id, safeData);
    } catch {
      if (projectId) getTasks(projectId).then(data => setTasks(deriveSummaryDates(data)));
    }
  }, [projectId, tasks]);

  const handleDelete = useCallback(async (id: string) => {
    setTasks(prev => deriveSummaryDates(removeTaskFromTree(prev, id)));
    try {
      await deleteTask(id);
    } catch {
      if (projectId) getTasks(projectId).then(data => setTasks(deriveSummaryDates(data)));
    }
  }, [projectId]);

  const handleAddChild = useCallback(async (parentId: string) => {
    if (!projectId) return;
    // 新子任务默认时间：第一个子节点从父节点开始日期起算；
    // 已有同级子节点时，从同级子节点的结束日期（取最大）起算，默认跨度 7 天
    const parent = findTaskInTree(tasks, parentId);
    let anchor: string;
    if (parent && parent.children.length > 0) {
      anchor = parent.children.reduce(
        (maxEnd, child) => (child.end_date > maxEnd ? child.end_date : maxEnd),
        parent.children[0].end_date
      );
    } else if (parent) {
      anchor = parent.start_date;
    } else {
      anchor = defaultDateRange().start;
    }
    const start = anchor;
    const end = addDaysToDateStr(anchor, 7);
    try {
      const created = await createTask(projectId, {
        title: '新子任务',
        start_date: start,
        end_date: end,
        parent_id: parentId,
      });
      // 乐观插入
      setTasks(prev => deriveSummaryDates(addChildToTree(prev, parentId, { ...created, children: [] })));
    } catch (err) {
      console.error('Failed to add child task:', err);
    }
  }, [projectId, tasks]);

  const handleConfirmDelete = useCallback(async () => {
    if (!taskPendingDelete) return;
    const id = taskPendingDelete.id;
    setTaskPendingDelete(null);
    try {
      await handleDelete(id);
    } catch (err) {
      console.error('Failed to delete task:', err);
    }
  }, [taskPendingDelete, handleDelete]);

  const handleExportPdf = useCallback(async () => {
    if (!projectId || isExportingPdf) return;
    setIsExportingPdf(true);
    try {
      const ganttCanvas = ganttWrapRef.current?.querySelector('canvas') ?? null;
      await exportProjectPdf({ projectName, tasks: displayTasks, ganttCanvas });
    } catch (err) {
      console.error('Failed to export project PDF:', err);
    } finally {
      setIsExportingPdf(false);
    }
  }, [projectId, isExportingPdf, projectName, displayTasks]);

  // ==================== 新建顶级任务 ====================

  const openAddForm = useCallback(() => {
    const { start, end } = defaultDateRange();
    setNewTitle('');
    setNewStart(start);
    setNewEnd(end);
    setShowAddForm(true);
    setTimeout(() => newTitleRef.current?.focus(), 0);
  }, []);

  const handleCreateTask = useCallback(async () => {
    const title = newTitle.trim();
    if (!title || !projectId) return;
    try {
      const created = await createTask(projectId, {
        title,
        start_date: newStart,
        end_date: newEnd,
      });
      // 乐观插入到列表末尾
      setTasks(prev => [...prev, { ...created, children: [] }]);
      setShowAddForm(false);
      setNewTitle('');
    } catch (err) {
      console.error('Failed to create task:', err);
    }
  }, [newTitle, newStart, newEnd, projectId]);

  const handleStartTitleEdit = useCallback((task: Task) => {
    setEditingTaskId(task.id);
    setEditingTaskTitle(task.title);
  }, []);

  const handleSaveTitleEdit = useCallback(async () => {
    if (!editingTaskId) return;
    const title = editingTaskTitle.trim();
    const current = flatTaskRows.find(row => row.task.id === editingTaskId)?.task;
    if (title && current && title !== current.title) {
      await handleUpdate(editingTaskId, { title });
    }
    setEditingTaskId(null);
  }, [editingTaskId, editingTaskTitle, flatTaskRows, handleUpdate]);

  const handleTaskTitleKeyDown = useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void handleSaveTitleEdit();
    } else if (event.key === 'Escape') {
      setEditingTaskId(null);
    }
  }, [handleSaveTitleEdit]);

  const toggleTaskCollapsed = useCallback((id: string) => {
    setCollapsedTaskState(prev => {
      const base = prev.projectId === projectId ? prev.ids : EMPTY_COLLAPSED_TASK_IDS;
      const next = new Set(base);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { projectId, ids: next };
    });
  }, [projectId]);

  const handleAddKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); handleCreateTask(); }
    else if (e.key === 'Escape') setShowAddForm(false);
  }, [handleCreateTask]);

  // ==================== 甘特图拖拽更新 ====================

  const handleGanttUpdate = useCallback(async (taskId: string, startDate: string, endDate: string) => {
    const current = findTaskInTree(tasks, taskId);
    if (!current || current.children.length > 0) return;
    // 乐观更新
    setTasks(prev => deriveSummaryDates(updateTaskInTree(prev, taskId, t => ({ ...t, start_date: startDate, end_date: endDate }))));
    try {
      await updateTask(taskId, { start_date: startDate, end_date: endDate });
    } catch {
      if (projectId) getTasks(projectId).then(data => setTasks(deriveSummaryDates(data)));
    }
  }, [projectId, tasks]);

  // ==================== 拖拽排序 ====================

  const handleDragStart = useCallback((id: string) => {
    setDragState(prev => ({ ...prev, draggedId: id }));
  }, []);

  const handleDragOver = useCallback((id: string, position: 'before' | 'after' | 'inside') => {
    setDragState(prev => ({ ...prev, overId: id, dropPosition: position }));
  }, []);

  const handleDragEnd = useCallback(() => {
    setDragState({ draggedId: null, overId: null, dropPosition: null });
  }, []);

  const handleMove = useCallback(async (taskId: string, targetId: string, position: 'before' | 'after' | 'inside') => {
    const result = moveTaskInTree(tasks, taskId, targetId, position);
    if (!result) return;

    // 乐观更新：移动本地树中的节点
    setTasks(result.tasks);

    // 后端同步：保存新的父级与排序
    try {
      await updateTask(taskId, {
        parent_id: result.parentId,
        sort_order: result.sortOrder,
      });
    } catch {
      if (projectId) getTasks(projectId).then(data => setTasks(deriveSummaryDates(data)));
    }
  }, [projectId, tasks]);

  // ==================== 项目操作 ====================

  const handleUnarchive = useCallback(async (id: string) => {
    try {
      await unarchiveProject(id);
      setArchivedProjects(prev => prev.filter(p => p.id !== id));
      window.dispatchEvent(new CustomEvent('projects-refresh'));
    } catch (err) {
      console.error('Failed to unarchive project:', err);
    }
  }, []);

  const handleArchiveToggle = useCallback(() => {
    if (projectId) {
      onDeselectProject?.();
      onToggleArchived?.(true);
      return;
    }
    onToggleArchived?.(!showArchived);
  }, [onDeselectProject, onToggleArchived, projectId, showArchived]);

  // ==================== Render ====================

  if (!projectId) {
    return (
      <div className="flex flex-col h-full">
        {/* Header with archived toggle */}
        <div className="flex items-center justify-end border-b border-gray-200 bg-white px-4 py-2 dark:border-gray-700 dark:bg-gray-900">
          <button
            onClick={handleArchiveToggle}
            className={`p-1.5 rounded-lg transition-colors ${
              showArchived
                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500'
            }`}
            title="查看已归档"
          >
            <Archive size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto scrollbar-auto-hide">
          {showArchived ? (
            archivedProjects.length === 0 ? (
              <div className="flex items-center justify-center h-full text-gray-400 dark:text-gray-500">
                暂无已归档项目
              </div>
            ) : (
              <div className="p-4 space-y-2">
                {archivedProjects.map(p => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800/50"
                  >
                    <span className="text-sm text-gray-600 dark:text-gray-300 truncate">{p.name}</span>
                    <button
                      onClick={() => handleUnarchive(p.id)}
                      className="ml-2 px-2 py-1 text-xs rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors shrink-0"
                    >
                      恢复
                    </button>
                  </div>
                ))}
              </div>
            )
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400 dark:text-gray-500">
              选择一个项目
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-2 dark:border-gray-700 dark:bg-gray-900">
        <div className="flex items-center gap-2">
          {!isMobile && (
            <>
              <button
                onClick={() => setShowGantt(!showGantt)}
                className={`editor-topbar-button editor-topbar-icon-button ${showGantt ? 'is-active' : ''}`}
                title="甘特图"
              >
                <BarChart3 size={16} />
              </button>
              {showGantt && (
                <button
                  onClick={() => setGanttScale(ganttScale === 'day' ? 'week' : 'day')}
                  className="editor-topbar-button"
                >
                  {ganttScale === 'day' ? '天' : '周'}
                </button>
              )}
            </>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => void handleExportPdf()}
            disabled={isExportingPdf}
            className="editor-topbar-button shrink-0 disabled:cursor-not-allowed disabled:opacity-50"
            title="导出项目为 PDF"
            aria-label="导出项目为 PDF"
          >
            <Download size={14} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Content: task list + optional gantt */}
      <div
        className="flex-1 flex overflow-hidden"
        onMouseMove={e => {
          if (!isDraggingRef.current) return;
          const container = e.currentTarget;
          const rect = container.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const ratio = Math.max(0.2, Math.min(0.8, x / rect.width));
          setSplitRatio(ratio);
        }}
        onMouseUp={() => { isDraggingRef.current = false; }}
        onMouseLeave={() => { isDraggingRef.current = false; }}
      >
        {/* Task list */}
        <div
          ref={!isMobile && showGantt ? taskTableScrollRef : undefined}
          className={
            !isMobile && showGantt
              ? 'overflow-y-auto custom-scrollbar scrollbar-auto-hide bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700'
              : 'overflow-y-auto scrollbar-auto-hide p-4 space-y-1 flex-1 min-w-0'
          }
          style={!isMobile && showGantt ? { width: `${splitRatio * 100}%`, flexShrink: 0 } : undefined}
        >
          {isLoading ? (
            <div className="text-center text-gray-400 py-8">加载中...</div>
          ) : tasks.length === 0 && !showAddForm ? (
            <div className="text-center text-gray-400 py-8">暂无任务</div>
          ) : !isMobile && showGantt ? (
            <div ref={taskListInnerRef}>
              <div
                className="grid grid-cols-[34px_minmax(0,1fr)] border-b border-gray-300 bg-white text-[11px] text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
                style={{ height: PROJECT_TASK_HEADER_HEIGHT }}
              >
                <div className="border-r border-gray-200 dark:border-gray-700" />
                <div className="flex items-center justify-center border-r border-gray-200 font-medium dark:border-gray-700">
                  Name
                </div>
              </div>
              <div>
                {flatTaskRows.map(({ task, depth }, index) => {
                  const hasChildren = task.children.length > 0;
                  const collapsed = collapsedTaskIds.has(task.id);
                  const isSummary = hasChildren;
                  const isDragging = dragState?.draggedId === task.id;
                  const isDragTarget = dragState?.overId === task.id;
                  return (
                    <div
                      key={task.id}
                      draggable={editingTaskId !== task.id}
                      onDragStart={e => {
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', task.id);
                        handleDragStart(task.id);
                      }}
                      onDragOver={e => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                        const rect = e.currentTarget.getBoundingClientRect();
                        const y = e.clientY - rect.top;
                        const ratio = y / rect.height;
                        handleDragOver(task.id, ratio < 0.25 ? 'before' : ratio > 0.75 ? 'after' : 'inside');
                      }}
                      onDrop={e => {
                        e.preventDefault();
                        const draggedId = e.dataTransfer.getData('text/plain');
                        if (draggedId && draggedId !== task.id && dragState?.dropPosition) {
                          void handleMove(draggedId, task.id, dragState.dropPosition);
                        }
                        handleDragEnd();
                      }}
                      onDragEnd={handleDragEnd}
                      className={`group relative grid grid-cols-[34px_minmax(0,1fr)] cursor-grab border-b border-gray-100 text-[13px] dark:border-gray-800 ${
                        isSummary
                          ? 'bg-gray-100 font-semibold text-gray-900 dark:bg-gray-800/70 dark:text-gray-100'
                          : index % 2 === 1
                            ? 'bg-gray-50/60 text-gray-800 dark:bg-gray-900/70 dark:text-gray-200'
                            : 'bg-white text-gray-800 dark:bg-gray-900 dark:text-gray-200'
                      } ${isDragging ? 'opacity-40' : ''}`}
                      style={{ height: PROJECT_TASK_ROW_HEIGHT }}
                    >
                      {/* 拖拽落点指示 */}
                      {isDragTarget && dragState?.dropPosition === 'before' && (
                        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-0.5 bg-blue-500" />
                      )}
                      {isDragTarget && dragState?.dropPosition === 'after' && (
                        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-0.5 bg-blue-500" />
                      )}
                      {isDragTarget && dragState?.dropPosition === 'inside' && (
                        <div className="pointer-events-none absolute inset-0 z-10 ring-2 ring-inset ring-blue-400" />
                      )}
                      <div className="flex items-center justify-center border-r border-gray-200 dark:border-gray-700">
                        <button
                          onClick={() => void handleToggle(task.id)}
                          className="inline-flex h-4 w-4 items-center justify-center rounded-sm border border-gray-400 text-gray-500 hover:border-blue-500 hover:text-blue-600 dark:border-gray-600 dark:text-gray-400"
                          title={task.is_done ? '标记未完成' : '标记完成'}
                        >
                          {task.is_done ? <Check size={12} /> : <Circle size={10} className="opacity-0" />}
                        </button>
                      </div>
                      <div
                        className="flex min-w-0 items-center gap-1 border-r border-gray-200 px-2 dark:border-gray-700"
                        style={{ paddingLeft: depth * 18 + 8 }}
                      >
                        {hasChildren ? (
                          <button
                            onClick={() => toggleTaskCollapsed(task.id)}
                            className="inline-flex h-5 w-5 shrink-0 items-center justify-center text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-100"
                            title={collapsed ? '展开' : '折叠'}
                          >
                            {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                          </button>
                        ) : (
                          <span className="h-5 w-5 shrink-0" />
                        )}
                        {editingTaskId === task.id ? (
                          <input
                            ref={titleInputRef}
                            value={editingTaskTitle}
                            onChange={event => setEditingTaskTitle(event.target.value)}
                            onBlur={() => void handleSaveTitleEdit()}
                            onKeyDown={handleTaskTitleKeyDown}
                            className="min-w-0 flex-1 border-b border-blue-400 bg-transparent px-0.5 py-0 text-[13px] outline-none"
                          />
                        ) : (
                          <button
                            onDoubleClick={() => handleStartTitleEdit(task)}
                            className={`min-w-0 flex-1 truncate text-left ${
                              task.is_done ? 'text-gray-400 line-through dark:text-gray-500' : ''
                            }`}
                            title={task.title}
                          >
                            {task.title}
                          </button>
                        )}
                        <button
                          onClick={() => void handleAddChild(task.id)}
                          className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-gray-400 transition-opacity hover:bg-gray-200 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-200 ${
                            taskListNarrow ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                          }`}
                          title="添加子任务"
                        >
                          <Plus size={13} />
                        </button>
                        <button
                          onClick={() => setTaskPendingDelete(task)}
                          className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-gray-400 transition-opacity hover:bg-red-100 hover:text-red-500 dark:hover:bg-red-900/30 dark:hover:text-red-400 ${
                            taskListNarrow ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                          }`}
                          title="删除任务"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="space-y-1">
              {displayTasks.map((task, idx) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onToggle={handleToggle}
                  onUpdate={handleUpdate}
                  onDelete={handleDelete}
                  onAddChild={handleAddChild}
                  onMove={handleMove}
                  depth={0}
                  isLastChild={idx === tasks.length - 1}
                  dragState={dragState}
                  onDragStart={handleDragStart}
                  onDragOver={handleDragOver}
                  onDragEnd={handleDragEnd}
                  isMobile={isMobile}
                />
              ))}
            </div>
          )}

          {/* Add task form */}
          {showAddForm && (
            <div className="rounded-2xl bg-gray-50 dark:bg-gray-800/50 p-3 space-y-2">
              <input
                ref={newTitleRef}
                type="text"
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                onKeyDown={handleAddKeyDown}
                placeholder="任务标题..."
                className="w-full bg-transparent text-base text-gray-800 dark:text-gray-100 outline-none border-b border-blue-400 py-1.5 placeholder:text-gray-400"
              />
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                <Calendar size={16} className="shrink-0 text-gray-400" />
                <input
                  type="date"
                  value={newStart}
                  onChange={e => setNewStart(e.target.value)}
                  className="min-w-0 flex-1 basis-28 cursor-pointer bg-transparent text-sm text-gray-500 outline-none dark:text-gray-400"
                />
                <span className="shrink-0 text-sm text-gray-300 dark:text-gray-600">-</span>
                <input
                  type="date"
                  value={newEnd}
                  onChange={e => setNewEnd(e.target.value)}
                  className="min-w-0 flex-1 basis-28 cursor-pointer bg-transparent text-sm text-gray-500 outline-none dark:text-gray-400"
                />
              </div>
              <div className="flex items-center justify-end gap-2 border-t border-gray-200 pt-2 dark:border-gray-700">
                <button
                  onClick={() => setShowAddForm(false)}
                  className="shrink-0 rounded-full bg-gray-100 px-4 py-1.5 text-sm text-gray-600 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                >
                  取消
                </button>
                <button
                  onClick={handleCreateTask}
                  disabled={!newTitle.trim()}
                  className="shrink-0 rounded-full bg-blue-500 px-4 py-1.5 text-sm text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  添加
                </button>
              </div>
            </div>
          )}

          {!showAddForm && (
            <button
              onClick={openAddForm}
              className="w-full flex items-center justify-center gap-1 py-2 px-3 rounded-none border-2 border-dashed border-gray-200 dark:border-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600 transition-colors text-sm"
            >
              <Plus size={14} />
              添加任务
            </button>
          )}
        </div>

        {/* Resize divider */}
        {!isMobile && showGantt && (
          <div
            className="w-1 shrink-0 cursor-col-resize bg-gray-200 dark:bg-gray-700 hover:bg-blue-400 dark:hover:bg-blue-500 transition-colors"
            onMouseDown={e => { e.preventDefault(); isDraggingRef.current = true; }}
          />
        )}

        {/* Gantt chart */}
        {!isMobile && showGantt && (
          <div ref={ganttWrapRef} className="flex-1 overflow-hidden min-w-0">
            <GanttChart
              key={projectId}
              tasks={displayTasks}
              scale={ganttScale}
              onTaskUpdate={handleGanttUpdate}
              scrollRef={taskTableScrollRef}
              collapsedTaskIds={collapsedTaskIds}
            />
          </div>
        )}
      </div>

      {/* 删除任务防呆确认 */}
      <DeleteConfirmDialog
        isOpen={taskPendingDelete !== null}
        title="删除任务"
        message={taskPendingDelete
          ? `确定要删除「${taskPendingDelete.title}」吗？${taskPendingDelete.children.length > 0 ? '子任务也会一并删除。' : ''}`
          : ''}
        onConfirm={() => void handleConfirmDelete()}
        onCancel={() => setTaskPendingDelete(null)}
      />
    </div>
  );
}
