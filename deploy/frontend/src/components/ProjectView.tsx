import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Archive, BarChart3, Calendar } from 'lucide-react';
import type { Task, Project } from '../api/projects';
import {
  getTasks, createTask, toggleTask, updateTask, deleteTask,
  getArchivedProjects, unarchiveProject,
} from '../api/projects';
import TaskCard from './TaskCard';
import GanttChart from './GanttChart';

interface ProjectViewProps {
  projectId: string | null;
  showArchived?: boolean;
  archivedReloadKey?: number;
  onToggleArchived?: (show: boolean) => void;
  onDeselectProject?: () => void;
  isMobile?: boolean;
}

function defaultDateRange(): { start: string; end: string } {
  const today = new Date();
  const end = new Date(today);
  end.setDate(end.getDate() + 7);
  const fmt = (d: Date) => d.toISOString().split('T')[0];
  return { start: fmt(today), end: fmt(end) };
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

export default function ProjectView({ projectId, showArchived = false, archivedReloadKey = 0, onToggleArchived, onDeselectProject, isMobile = false }: ProjectViewProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [showGantt, setShowGantt] = useState(true);
  const [splitRatio, setSplitRatio] = useState(0.5); // 0.2 ~ 0.8
  const isDraggingRef = useRef(false);
  const [ganttScale, setGanttScale] = useState<'day' | 'week'>('day');
  const [isLoading, setIsLoading] = useState(false);

  // Drag state
  const [dragState, setDragState] = useState<{ draggedId: string | null; overId: string | null; dropPosition: 'before' | 'after' | 'inside' | null }>({ draggedId: null, overId: null, dropPosition: null });

  const [archivedProjects, setArchivedProjects] = useState<Project[]>([]);

  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newStart, setNewStart] = useState('');
  const [newEnd, setNewEnd] = useState('');
  const newTitleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!projectId) return;
    let active = true;
    getTasks(projectId)
      .then(data => { if (active) setTasks(data); })
      .catch(error => console.error('Failed to load tasks:', error))
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, [projectId]);

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
      // 静默刷新以获取级联变化（父任务自动完成等）
      if (projectId) getTasks(projectId).then(setTasks).catch(() => {});
    } catch {
      // 回滚
      if (projectId) getTasks(projectId).then(setTasks);
    }
  }, [projectId]);

  const handleUpdate = useCallback(async (id: string, data: Partial<Task>) => {
    setTasks(prev => updateTaskInTree(prev, id, t => ({ ...t, ...data })));
    try {
      await updateTask(id, data);
    } catch {
      if (projectId) getTasks(projectId).then(setTasks);
    }
  }, [projectId]);

  const handleDelete = useCallback(async (id: string) => {
    setTasks(prev => removeTaskFromTree(prev, id));
    try {
      await deleteTask(id);
    } catch {
      if (projectId) getTasks(projectId).then(setTasks);
    }
  }, [projectId]);

  const handleAddChild = useCallback(async (parentId: string) => {
    if (!projectId) return;
    const { start, end } = defaultDateRange();
    try {
      const created = await createTask(projectId, {
        title: '新子任务',
        start_date: start,
        end_date: end,
        parent_id: parentId,
      });
      // 乐观插入
      setTasks(prev => addChildToTree(prev, parentId, { ...created, children: [] }));
    } catch (err) {
      console.error('Failed to add child task:', err);
    }
  }, [projectId]);

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

  const handleAddKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); handleCreateTask(); }
    else if (e.key === 'Escape') setShowAddForm(false);
  }, [handleCreateTask]);

  // ==================== 甘特图拖拽更新 ====================

  const handleGanttUpdate = useCallback(async (taskId: string, startDate: string, endDate: string) => {
    // 乐观更新
    setTasks(prev => updateTaskInTree(prev, taskId, t => ({ ...t, start_date: startDate, end_date: endDate })));
    try {
      await updateTask(taskId, { start_date: startDate, end_date: endDate });
    } catch {
      if (projectId) getTasks(projectId).then(setTasks);
    }
  }, [projectId]);

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
    // 乐观更新：移动本地树中的节点
    setTasks(prev => {
      const flat: Task[] = [];
      const flatten = (list: Task[]) => { for (const t of list) { flat.push(t); flatten(t.children); } };
      flatten(prev);
      const moved = flat.find(t => t.id === taskId);
      if (!moved) return prev;
      const without = removeTaskFromTree(prev, taskId);
      if (position === 'inside') {
        return addChildToTree(without, targetId, moved);
      }
      // before/after: insert as sibling
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
      return insertSibling(without);
    });
    // 后端同步
    try {
      const newParentId = position === 'inside' ? targetId : undefined;
      await updateTask(taskId, { parent_id: newParentId });
    } catch {
      if (projectId) getTasks(projectId).then(setTasks);
    }
  }, [projectId]);

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
        <div className="flex items-center justify-end px-4 py-3 border-b border-gray-200 dark:border-gray-700">
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
        <div className="flex-1 overflow-y-auto">
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
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          {!isMobile && (
            <>
              <button
                onClick={() => setShowGantt(!showGantt)}
                className={`p-1.5 rounded-lg transition-colors ${
                  showGantt
                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500'
                }`}
                title="甘特图"
              >
                <BarChart3 size={16} />
              </button>
              {showGantt && (
                <button
                  onClick={() => setGanttScale(ganttScale === 'day' ? 'week' : 'day')}
                  className="px-2 py-1 text-xs rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                >
                  {ganttScale === 'day' ? '天' : '周'}
                </button>
              )}
            </>
          )}
        </div>

        <div className="flex items-center gap-1" />
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
          className={`overflow-y-auto p-4 space-y-1 ${!isMobile && showGantt ? '' : 'flex-1 min-w-0'}`}
          style={!isMobile && showGantt ? { width: `${splitRatio * 100}%`, flexShrink: 0 } : undefined}
        >
          {isLoading ? (
            <div className="text-center text-gray-400 py-8">加载中...</div>
          ) : tasks.length === 0 && !showAddForm ? (
            <div className="text-center text-gray-400 py-8">暂无任务</div>
          ) : (
            <div className="space-y-1">
              {tasks.map((task, idx) => (
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
              <div className="flex items-center gap-2">
                <Calendar size={16} className="text-gray-400" />
                <input type="date" value={newStart} onChange={e => setNewStart(e.target.value)} className="text-sm bg-transparent outline-none text-gray-500 dark:text-gray-400 cursor-pointer" />
                <span className="text-gray-300 dark:text-gray-600 text-sm">-</span>
                <input type="date" value={newEnd} onChange={e => setNewEnd(e.target.value)} className="text-sm bg-transparent outline-none text-gray-500 dark:text-gray-400 cursor-pointer" />
                <div className="flex-1" />
                <button
                  onClick={() => setShowAddForm(false)}
                  className="px-3 py-1.5 rounded-full text-sm text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleCreateTask}
                  disabled={!newTitle.trim()}
                  className="px-3 py-1.5 rounded-full text-sm text-white bg-blue-500 hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
          <div className="flex-1 overflow-hidden min-w-0">
            <GanttChart tasks={tasks} scale={ganttScale} onTaskUpdate={handleGanttUpdate} />
          </div>
        )}
      </div>
    </div>
  );
}
