import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { Task } from '../api/projects';

// ==================== Types ====================

interface GanttChartProps {
  tasks: Task[];
  scale: 'day' | 'week';
  onTaskUpdate?: (taskId: string, startDate: string, endDate: string) => void;
  scrollRef?: React.RefObject<HTMLDivElement | null>;
  readOnly?: boolean;
  collapsedTaskIds?: ReadonlySet<string>;
}

interface DragState {
  taskId: string;
  mode: 'move' | 'resize-left' | 'resize-right';
  startMouseX: number;
  originalStartDate: string;
  originalEndDate: string;
  currentStartDate: string;
  currentEndDate: string;
}

interface FlattenedTask {
  task: Task;
  depth: number;
}

// ==================== Date Helpers ====================

function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function daysBetween(a: Date, b: Date): number {
  const msPerDay = 86400000;
  return Math.round((b.getTime() - a.getTime()) / msPerDay);
}

function addDays(d: Date, n: number): Date {
  const result = new Date(d);
  result.setDate(result.getDate() + n);
  return result;
}

function getToday(): string {
  return formatDate(new Date());
}

function isWeekend(d: Date): boolean {
  const day = d.getDay();
  return day === 0 || day === 6;
}

function getWeekNumber(d: Date): number {
  const date = new Date(d.getTime());
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
  const week1 = new Date(date.getFullYear(), 0, 4);
  return 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
}

// ==================== Flatten Task Tree ====================

function flattenTasks(tasks: Task[], collapsedTaskIds?: ReadonlySet<string>): FlattenedTask[] {
  const result: FlattenedTask[] = [];
  function walk(list: Task[], depth: number) {
    for (const task of list) {
      result.push({ task, depth });
      if (task.children && task.children.length > 0 && !collapsedTaskIds?.has(task.id)) {
        walk(task.children, depth + 1);
      }
    }
  }
  walk(tasks, 0);
  return result;
}

// ==================== Constants ====================

const ROW_HEIGHT = 32;
const HEADER_HEIGHT = 44;
const DRAG_HANDLE_WIDTH = 5;

const TASK_BAR_FILL = '#a9dcfb';
const TASK_BAR_STROKE = '#60b8f3';
const SUMMARY_BAR_FILL = '#d7d7d7';
const SUMMARY_BAR_STROKE = '#b7b7b7';
const DONE_COLOR = '#eef0f2';

/** 标准圆角矩形路径：四条直边 + 四个独立圆角，避免边向内弯曲 */
function traceRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ==================== Component ====================

const GanttChart: React.FC<GanttChartProps> = ({
  tasks,
  scale,
  onTaskUpdate,
  scrollRef,
  readOnly = false,
  collapsedTaskIds,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const prevTaskCountRef = useRef(0);

  const [zoom, setZoom] = useState<number>(1);
  const [dragState, setDragState] = useState<DragState | null>(null);

  // Derived data
  const flatTasks = flattenTasks(tasks, collapsedTaskIds);
  const todayStr = getToday();

  // Calculate date range
  const dateRange = useCallback(() => {
    if (flatTasks.length === 0) {
      const today = new Date();
      return {
        start: addDays(today, -14),
        end: addDays(today, 60),
      };
    }
    let minDate = parseDate(flatTasks[0].task.start_date);
    let maxDate = parseDate(flatTasks[0].task.end_date);
    for (const { task } of flatTasks) {
      const s = parseDate(task.start_date);
      const e = parseDate(task.end_date);
      if (s < minDate) minDate = s;
      if (e > maxDate) maxDate = e;
    }
    return {
      start: addDays(minDate, -7),
      end: addDays(maxDate, 14),
    };
  }, [flatTasks]);

  const { start: rangeStart, end: rangeEnd } = dateRange();
  const totalDays = daysBetween(rangeStart, rangeEnd) + 1;

  // Day width based on scale and zoom
  const baseDayWidth = scale === 'day' ? 18 : 12;
  const dayWidth = Math.max(6, Math.min(42, baseDayWidth * zoom));

  const canvasWidth = totalDays * dayWidth;
  const canvasHeight = HEADER_HEIGHT + flatTasks.length * ROW_HEIGHT;

  // Convert date string to pixel X
  const dateToX = useCallback(
    (dateStr: string): number => {
      const days = daysBetween(rangeStart, parseDate(dateStr));
      return days * dayWidth;
    },
    [dayWidth, rangeStart]
  );

  // 默认把「今天」放到甘特图最左边；数据首次加载完成后再对齐一次（可用 key 让每个项目重新定位）
  useEffect(() => {
    if (flatTasks.length === 0) return;
    if (prevTaskCountRef.current === 0) {
      prevTaskCountRef.current = flatTasks.length;
      const container = containerRef.current;
      if (container) {
        container.scrollLeft = Math.max(0, daysBetween(rangeStart, parseDate(todayStr)) * dayWidth);
      }
      return;
    }
    prevTaskCountRef.current = flatTasks.length;
  }, [flatTasks.length, rangeStart, todayStr, dayWidth]);

  // ==================== Drawing ====================

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvasWidth * dpr;
    canvas.height = canvasHeight * dpr;
    canvas.style.width = `${canvasWidth}px`;
    canvas.style.height = `${canvasHeight}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    // 1. Background
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // 2. Alternating row and weekend highlights
    for (let row = 0; row < flatTasks.length; row++) {
      const { task } = flatTasks[row];
      const y = HEADER_HEIGHT + row * ROW_HEIGHT;
      if (task.children && task.children.length > 0) {
        ctx.fillStyle = '#F3F4F6';
        ctx.fillRect(0, y, canvasWidth, ROW_HEIGHT);
      } else if (row % 2 === 1) {
        ctx.fillStyle = '#FBFBFB';
        ctx.fillRect(0, y, canvasWidth, ROW_HEIGHT);
      }
    }

    for (let i = 0; i < totalDays; i++) {
      const d = addDays(rangeStart, i);
      if (isWeekend(d)) {
        const x = i * dayWidth;
        ctx.fillStyle = 'rgba(244, 244, 245, 0.7)';
        ctx.fillRect(x, HEADER_HEIGHT, dayWidth, canvasHeight - HEADER_HEIGHT);
      }
    }

    // 4. Header background（先画，让竖线能贯穿表头与正文对齐）
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvasWidth, HEADER_HEIGHT);
    ctx.strokeStyle = '#D1D5DB';
    ctx.beginPath();
    ctx.moveTo(0, HEADER_HEIGHT);
    ctx.lineTo(canvasWidth, HEADER_HEIGHT);
    ctx.stroke();

    // 3. Grid lines（表头与正文同一条竖线）
    ctx.lineWidth = 1;
    for (let i = 0; i <= totalDays; i++) {
      const d = addDays(rangeStart, i);
      const x = i * dayWidth;

      if (scale === 'week') {
        ctx.strokeStyle = d.getDay() === 1 ? '#BFC4CB' : '#E5E7EB';
      } else {
        ctx.strokeStyle = d.getDate() === 1 ? '#9CA3AF' : '#DDE1E6';
      }
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvasHeight);
      ctx.stroke();
    }

    // Row lines
    for (let r = 0; r <= flatTasks.length; r++) {
      const y = HEADER_HEIGHT + r * ROW_HEIGHT;
      ctx.strokeStyle = '#EAECF0';
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvasWidth, y);
      ctx.stroke();
    }

    // Header labels
    ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';

    if (scale === 'day') {
      for (let i = 0; i < totalDays; i++) {
        const d = addDays(rangeStart, i);
        const x = i * dayWidth + dayWidth / 2;

        if (d.getDate() === 1 || i === 0) {
          ctx.fillStyle = '#374151';
          ctx.font = '600 12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
          const nextMonthStart = new Date(d.getFullYear(), d.getMonth() + 1, 1);
          const daysInMonthVisible = Math.min(
            daysBetween(d, rangeEnd) + 1,
            daysBetween(d, nextMonthStart)
          );
          const labelX = x + Math.max(dayWidth, daysInMonthVisible * dayWidth) / 2;
          ctx.fillText(`${d.getFullYear()}年${d.getMonth() + 1}月`, labelX, 12);
          ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        }

        // Date number
        ctx.fillStyle = isWeekend(d) ? '#8C96A3' : '#374151';
        ctx.fillText(String(d.getDate()), x, 26);

        // 星期几文字底部与表头下边框保留 3px 距离（9px 字号、middle 基线约 ±4.5px，表头 44px）
        ctx.fillStyle = '#8C96A3';
        ctx.font = '9px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        ctx.fillText(['日', '一', '二', '三', '四', '五', '六'][d.getDay()], x, 36);
        ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      }
    } else {
      // Week mode - group by week
      let weekStartIdx = -1;
      for (let i = 0; i <= totalDays; i++) {
        const d = addDays(rangeStart, i);
        if (d.getDay() === 1 || i === 0) {
          if (weekStartIdx >= 0) {
            // Draw previous week label
            const startX = weekStartIdx * dayWidth;
            const endX = i * dayWidth;
            const centerX = (startX + endX) / 2;
            const weekD = addDays(rangeStart, weekStartIdx);
            const wn = getWeekNumber(weekD);
            ctx.fillStyle = '#374151';
            ctx.fillText(`W${wn}`, centerX, HEADER_HEIGHT / 2 - 6);

            ctx.fillStyle = '#6B7280';
            ctx.font = '9px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
            const label = `${weekD.getMonth() + 1}/${weekD.getDate()}`;
            ctx.fillText(label, centerX, HEADER_HEIGHT / 2 + 8);
            ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
          }
          weekStartIdx = i;
        }
      }
      // Last week
      if (weekStartIdx >= 0 && weekStartIdx < totalDays) {
        const startX = weekStartIdx * dayWidth;
        const endX = totalDays * dayWidth;
        const centerX = (startX + endX) / 2;
        const weekD = addDays(rangeStart, weekStartIdx);
        const wn = getWeekNumber(weekD);
        ctx.fillStyle = '#374151';
        ctx.fillText(`W${wn}`, centerX, HEADER_HEIGHT / 2 - 6);

        ctx.fillStyle = '#6B7280';
        ctx.font = '9px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        const label = `${weekD.getMonth() + 1}/${weekD.getDate()}`;
        ctx.fillText(label, centerX, HEADER_HEIGHT / 2 + 8);
        ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      }
    }

    // 5. Task bars
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    for (let row = 0; row < flatTasks.length; row++) {
      const { task } = flatTasks[row];
      const y = HEADER_HEIGHT + row * ROW_HEIGHT;

      // Determine effective dates (use drag preview if dragging this task)
      let startDateStr = task.start_date;
      let endDateStr = task.end_date;
      if (dragState && dragState.taskId === task.id) {
        startDateStr = dragState.currentStartDate;
        endDateStr = dragState.currentEndDate;
      }

      const x1 = dateToX(startDateStr);
      const x2 = dateToX(endDateStr) + dayWidth; // end date is inclusive
      const barY = y + ROW_HEIGHT / 2 - 8;
      const barHeight = 16;
      const barWidth = Math.max(dayWidth, x2 - x1);

      const hasChildren = task.children && task.children.length > 0;
      const barColor = task.is_done ? DONE_COLOR : hasChildren ? SUMMARY_BAR_FILL : TASK_BAR_FILL;
      const strokeColor = task.is_done ? '#D1D5DB' : hasChildren ? SUMMARY_BAR_STROKE : TASK_BAR_STROKE;

      // Drag preview: semi-transparent
      const isDragging = dragState && dragState.taskId === task.id;

      // Draw rounded rect
      const radius = hasChildren ? 8 : 4;
      ctx.globalAlpha = isDragging ? 0.7 : 1;
      ctx.fillStyle = barColor;
      ctx.strokeStyle = strokeColor;
      traceRoundedRect(ctx, x1, barY, barWidth, barHeight, radius);
      ctx.fill();
      ctx.stroke();

      // Task title text：1~2 天的短任务条也显示名称（画在条右侧，超出画布时截断）
      ctx.fillStyle = task.is_done ? '#9CA3AF' : '#333333';
      ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      const maxTextWidth = Math.max(0, canvasWidth - x1 - barWidth - 16);
      const text = task.title;
      // Truncate if needed
      let displayText = text;
      const measured = ctx.measureText(text);
      if (measured.width > maxTextWidth) {
        while (displayText.length > 0 && ctx.measureText(displayText + '...').width > maxTextWidth) {
          displayText = displayText.slice(0, -1);
        }
        displayText += '...';
      }
      ctx.fillText(displayText, x1 + barWidth + 12, barY + barHeight / 2);

      ctx.globalAlpha = 1;
    }

    // 6. Today line
    const todayX = dateToX(todayStr);
    ctx.strokeStyle = '#4d9383';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(todayX, 0);
    ctx.lineTo(todayX, canvasHeight);
    ctx.stroke();
  }, [
    canvasWidth,
    canvasHeight,
    totalDays,
    rangeStart,
    rangeEnd,
    dayWidth,
    scale,
    flatTasks,
    dateToX,
    dragState,
    todayStr,
  ]);

  // Redraw on changes
  useEffect(() => {
    draw();
  }, [draw]);

  // ==================== Mouse Interactions ====================

  const hitTest = useCallback(
    (mouseX: number, mouseY: number): { taskId: string; mode: 'move' | 'resize-left' | 'resize-right' } | null => {
      if (mouseY < HEADER_HEIGHT) return null;

      const row = Math.floor((mouseY - HEADER_HEIGHT) / ROW_HEIGHT);
      if (row < 0 || row >= flatTasks.length) return null;

      const { task } = flatTasks[row];
      // 父任务周期由子任务推导，不允许直接拖动或拉伸
      if (task.children && task.children.length > 0) return null;

      const x1 = dateToX(task.start_date);
      const x2 = dateToX(task.end_date) + dayWidth;
      const barWidth = Math.max(dayWidth, x2 - x1);

      if (mouseX >= x1 && mouseX <= x1 + barWidth) {
        // Check drag handles
        if (mouseX <= x1 + DRAG_HANDLE_WIDTH) {
          return { taskId: task.id, mode: 'resize-left' };
        }
        if (mouseX >= x1 + barWidth - DRAG_HANDLE_WIDTH) {
          return { taskId: task.id, mode: 'resize-right' };
        }
        return { taskId: task.id, mode: 'move' };
      }

      return null;
    },
    [flatTasks, dateToX, dayWidth]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (readOnly) return;
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const hit = hitTest(mouseX, mouseY);
      if (!hit) return;

      const task = flatTasks.find((t) => t.task.id === hit.taskId)?.task;
      if (!task) return;

      setDragState({
        taskId: hit.taskId,
        mode: hit.mode,
        startMouseX: mouseX,
        originalStartDate: task.start_date,
        originalEndDate: task.end_date,
        currentStartDate: task.start_date,
        currentEndDate: task.end_date,
      });

      e.preventDefault();
    },
    [hitTest, flatTasks, readOnly]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // Update cursor
      if (!dragState) {
        const hit = hitTest(mouseX, mouseY);
        if (hit) {
          canvas.style.cursor =
            hit.mode === 'move' ? 'grab' : 'col-resize';
        } else {
          canvas.style.cursor = 'default';
        }
        return;
      }

      canvas.style.cursor =
        dragState.mode === 'move' ? 'grabbing' : 'col-resize';

      // Calculate date shift
      const pixelDelta = mouseX - dragState.startMouseX;
      const dayDelta = Math.round(pixelDelta / dayWidth);

      let newStart = parseDate(dragState.originalStartDate);
      let newEnd = parseDate(dragState.originalEndDate);

      if (dragState.mode === 'move') {
        newStart = addDays(newStart, dayDelta);
        newEnd = addDays(newEnd, dayDelta);
      } else if (dragState.mode === 'resize-left') {
        newStart = addDays(newStart, dayDelta);
        // Don't let start go past end
        if (newStart > newEnd) newStart = newEnd;
      } else if (dragState.mode === 'resize-right') {
        newEnd = addDays(newEnd, dayDelta);
        // Don't let end go before start
        if (newEnd < newStart) newEnd = newStart;
      }

      setDragState((prev) =>
        prev
          ? {
              ...prev,
              currentStartDate: formatDate(newStart),
              currentEndDate: formatDate(newEnd),
            }
          : null
      );
    },
    [dragState, hitTest, dayWidth]
  );

  const handleMouseUp = useCallback(() => {
    if (!dragState) return;

    // Only call onTaskUpdate if dates actually changed
    if (
      dragState.currentStartDate !== dragState.originalStartDate ||
      dragState.currentEndDate !== dragState.originalEndDate
    ) {
      onTaskUpdate?.(dragState.taskId, dragState.currentStartDate, dragState.currentEndDate);
    }

    setDragState(null);
  }, [dragState, onTaskUpdate]);

  const handleMouseLeave = useCallback(() => {
    if (dragState) {
      // Commit drag on leave
      if (
        dragState.currentStartDate !== dragState.originalStartDate ||
        dragState.currentEndDate !== dragState.originalEndDate
      ) {
        onTaskUpdate?.(dragState.taskId, dragState.currentStartDate, dragState.currentEndDate);
      }
      setDragState(null);
    }
  }, [dragState, onTaskUpdate]);

  // ==================== Zoom ====================

  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        setZoom((prev) => {
          const delta = e.deltaY > 0 ? 0.9 : 1.1;
          return Math.max(0.13, Math.min(2, prev * delta));
        });
      }
    },
    []
  );

  // ==================== Scroll Sync ====================

  const handleContainerScroll = useCallback(() => {
    if (!scrollRef?.current || !containerRef.current) return;
    scrollRef.current.scrollTop = containerRef.current.scrollTop;
  }, [scrollRef]);

  // Sync scroll from task list to gantt
  useEffect(() => {
    if (!scrollRef?.current || !containerRef.current) return;

    const taskList = scrollRef.current;
    const gantt = containerRef.current;

    const syncFromTaskList = () => {
      gantt.scrollTop = taskList.scrollTop;
    };

    taskList.addEventListener('scroll', syncFromTaskList, { passive: true });
    return () => {
      taskList.removeEventListener('scroll', syncFromTaskList);
    };
  }, [scrollRef]);

  return (
    <div
      ref={containerRef}
      className="gantt-chart-scroll-area relative w-full h-full overflow-x-auto overflow-y-auto custom-scrollbar"
      onWheel={handleWheel}
      onScroll={handleContainerScroll}
    >
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        style={{ display: 'block' }}
      />
    </div>
  );
};

export default GanttChart;
