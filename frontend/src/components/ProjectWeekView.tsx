import { useCallback, useMemo, useEffect, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { getProjects, getTasks } from '../api/projects';
import type { Task } from '../api/projects';
import { useUserView } from '../context/UserViewContext';

interface ProjectWeekViewProps {
  embedded?: boolean;
}

interface WeekTask extends Task {
  projectId: string;
  projectName: string;
}

// 简单内存缓存，避免重复请求
let cachedTasks: WeekTask[] | null = null;
let cacheTime = 0;
const CACHE_TTL = 30_000; // 30s

function getFreshCachedTasks(): WeekTask[] | null {
  return cachedTasks && Date.now() - cacheTime <= CACHE_TTL ? cachedTasks : null;
}

const BAR_COLOR = 'bg-[#6b8ab5] dark:bg-[#3f587f]';

const DAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'];

function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatDay(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export default function ProjectWeekView({ embedded = false }: ProjectWeekViewProps) {
  const { setSelectedProjectId } = useUserView();
  const [initialTasks] = useState(getFreshCachedTasks);
  const [weekTasks, setWeekTasks] = useState<WeekTask[]>(initialTasks ?? []);
  const [loading, setLoading] = useState(initialTasks === null);

  useEffect(() => {
    if (initialTasks) return;

    let cancelled = false;
    const load = async () => {
      try {
        const projects = await getProjects();
        const active = projects.filter(p => !p.is_archived);
        if (active.length === 0) {
          if (!cancelled) { setWeekTasks([]); setLoading(false); }
          return;
        }

        // 并行请求所有项目的任务
        const results = await Promise.all(
          active.map(p => getTasks(p.id).then(tasks => ({ project: p, tasks })))
        );

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const weekLater = new Date(today);
        weekLater.setDate(weekLater.getDate() + 7);

        const allTasks: WeekTask[] = [];
        for (const { project, tasks } of results) {
          const walk = (list: Task[]) => {
            for (const t of list) {
              if (!t.is_done) {
                const start = new Date(t.start_date + 'T00:00:00');
                const end = new Date(t.end_date + 'T00:00:00');
                if (end >= today && start <= weekLater) {
                  allTasks.push({ ...t, projectId: project.id, projectName: project.name });
                }
              }
              if (t.children?.length) walk(t.children);
            }
          };
          walk(tasks);
        }

        if (!cancelled) {
          cachedTasks = allTasks;
          cacheTime = Date.now();
          setWeekTasks(allTasks);
        }
      } catch { /* ignore */ }
      finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [initialTasks]);

  const handleClick = useCallback((projectId: string) => {
    setSelectedProjectId(projectId);
    window.dispatchEvent(new CustomEvent('switch-view', { detail: { view: 'projects', projectId } }));
  }, [setSelectedProjectId]);

  // Build 7-day header
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const days: Date[] = useMemo(() => {
    const arr: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      arr.push(d);
    }
    return arr;
  }, [today]);

  if (loading) {
    return (
      <div className={embedded ? 'px-3' : 'px-3 py-2'}>
        <div className="flex items-center gap-1.5 text-base font-medium text-gray-400 dark:text-gray-500 mb-2"><CalendarDays className="w-4 h-4" />近 7 天计划</div>
        <div className="text-xs text-gray-400 py-2">加载中...</div>
      </div>
    );
  }

  if (weekTasks.length === 0) {
    return (
      <div className={embedded ? 'px-3' : 'px-3 py-2'}>
        <div className="flex items-center gap-1.5 text-base font-medium text-gray-400 dark:text-gray-500 mb-2"><CalendarDays className="w-4 h-4" />近 7 天计划</div>
        <p className="text-xs text-gray-400 py-2">暂无计划</p>
      </div>
    );
  }

  return (
    <div className={embedded ? 'px-3' : 'px-3 py-2'}>
      <div className="flex items-center gap-1.5 text-base font-medium text-gray-400 dark:text-gray-500 mb-2">
        <CalendarDays className="w-4 h-4" />
        近 7 天计划
      </div>

      {/* Day headers */}
      <div className="flex gap-px mb-1">
        {days.map((d, i) => {
          const isToday = d.getTime() === today.getTime();
          const isWeekend = d.getDay() === 0 || d.getDay() === 6;
          return (
            <div
              key={i}
              className={`flex-1 text-center leading-tight py-0.5 rounded-sm ${
                isToday
                  ? 'bg-[#6b8ab5] dark:bg-[#3f587f] text-white font-medium'
                  : isWeekend
                    ? 'text-gray-400 dark:text-gray-500'
                    : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              <div style={{ fontSize: '10px', transform: 'scale(1.0)', transformOrigin: 'center', lineHeight: 1, paddingTop: '4px' }}>{DAY_LABELS[d.getDay()]}</div>
              <div style={{ fontSize: '10px', transform: 'scale(1.0)', transformOrigin: 'center', lineHeight: 1, paddingBottom: '2px' }}>{d.getDate()}</div>
            </div>
          );
        })}
      </div>

      {/* Task bars */}
      <div className="space-y-0.5">
        {weekTasks.map((task) => {
          const taskStart = parseDate(task.start_date);
          const taskEnd = parseDate(task.end_date);

          // Calculate position within 7-day window
          const startOffset = Math.max(0, daysBetween(today, taskStart));
          const endOffset = Math.min(7, daysBetween(today, taskEnd) + 1);
          const barStart = startOffset / 7;
          const barWidth = (endOffset - startOffset) / 7;

          if (barWidth <= 0) return null;

          return (
            <button
              key={task.id}
              onClick={() => handleClick(task.projectId)}
              className="w-full h-5 flex items-center group cursor-pointer"
              title={`${task.title} (${task.projectName})\n${task.start_date} ~ ${task.end_date}`}
            >
              <div className="relative w-full h-full">
                {/* Bar */}
                <div
                  className={`absolute h-full rounded-sm ${BAR_COLOR} opacity-80 group-hover:opacity-100 transition-opacity`}
                  style={{
                    left: `${barStart * 100}%`,
                    width: `${Math.max(barWidth * 100, 8)}%`,
                  }}
                />
                {/* Label */}
                <div
                  className="absolute h-full flex items-center px-1"
                  style={{
                    left: `${barStart * 100}%`,
                    width: `${barWidth * 100}%`,
                  }}
                >
                  <span className="text-[10px] text-white font-medium truncate drop-shadow-sm">
                    {task.title}
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function daysBetween(a: Date, b: Date): number {
  const msPerDay = 86400000;
  return Math.floor((b.getTime() - a.getTime()) / msPerDay);
}
