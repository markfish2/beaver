import { useState, useEffect, useRef, useCallback, memo } from 'react';
import {
  Plus, Check, Trash2,
  BookOpen, Dumbbell, Moon, Droplets, Heart, Brain, Pen, Music,
  Camera, Bike, Leaf, Code, Timer, Sun, Flame, Star, Footprints,
  Palette, CupSoda, Dog, Smartphone, Pill, Sparkles, Target, Zap,
  type LucideIcon,
} from 'lucide-react';
import { getHabits, createHabit, updateHabit, deleteHabit, toggleHabitRecord, type Habit } from '../api/data';

// 习惯相关图标列表（黑白）
const HABIT_ICONS: { name: string; icon: LucideIcon }[] = [
  { name: '📌', icon: Target },
  { name: '📖', icon: BookOpen },
  { name: '💪', icon: Dumbbell },
  { name: '🌙', icon: Moon },
  { name: '💧', icon: Droplets },
  { name: '❤️', icon: Heart },
  { name: '🧠', icon: Brain },
  { name: '✍️', icon: Pen },
  { name: '🎵', icon: Music },
  { name: '📷', icon: Camera },
  { name: '🚴', icon: Bike },
  { name: '🌿', icon: Leaf },
  { name: '💻', icon: Code },
  { name: '⏱️', icon: Timer },
  { name: '☀️', icon: Sun },
  { name: '🔥', icon: Flame },
  { name: '⭐', icon: Star },
  { name: '🏃', icon: Footprints },
  { name: '🎨', icon: Palette },
  { name: '☕', icon: CupSoda },
  { name: '🐕', icon: Dog },
  { name: '📱', icon: Smartphone },
  { name: '💊', icon: Pill },
  { name: '✨', icon: Sparkles },
  { name: '⚡', icon: Zap },
];

// icon name → lucide 组件的映射表（静态）
const ICON_MAP: Record<string, LucideIcon> = Object.fromEntries(
  HABIT_ICONS.map(({ name, icon }) => [name, icon])
) as Record<string, LucideIcon>;

function HabitIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICON_MAP[name] ?? Target;
  return <Icon className={className} />;
}

// 获取本周周一到周日的日期列表
function getWeekDates(): string[] {
  const today = new Date();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

function isToday(dateStr: string): boolean {
  return dateStr === new Date().toISOString().slice(0, 10);
}

// ── 确认弹窗 ──
function ConfirmDialog({
  message,
  onConfirm,
  onCancel,
}: {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/30" onClick={onCancel}>
      <div
        ref={ref}
        className="bg-white dark:bg-gray-800 rounded-xl shadow-xl p-4 mx-4 max-w-xs w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm text-gray-700 dark:text-gray-300 mb-4">{message}</p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            className="px-3 py-1.5 text-sm text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors"
          >
            删除
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 图标选择弹窗 ──
function IconPicker({
  currentIcon,
  anchorRef,
  onSelect,
  onClose,
}: {
  currentIcon: string;
  anchorRef: React.RefObject<HTMLElement | null>;
  onSelect: (icon: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  useEffect(() => {
    if (anchorRef.current) {
      const rect = anchorRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, left: rect.left });
    }
  }, [anchorRef]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      // 点击弹窗内部不关闭
      if (ref.current && ref.current.contains(e.target as Node)) return;
      // 点击触发按钮本身不关闭（解决打开瞬间被同一事件关闭的问题）
      if (anchorRef.current && anchorRef.current.contains(e.target as Node)) return;
      onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose, anchorRef]);

  return (
    <div
      ref={ref}
      className="fixed z-[9999] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg p-2"
      style={{ top: pos.top, left: pos.left, minWidth: '180px' }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '4px' }}>
        {HABIT_ICONS.map(({ name, icon: Icon }) => (
          <button
            key={name}
            onClick={() => onSelect(name)}
            className={`p-1.5 rounded-md transition-colors ${
              name === currentIcon
                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
            title={name}
          >
            <Icon className="w-4 h-4" />
          </button>
        ))}
      </div>
    </div>
  );
}

// ── 习惯行 ──
const HabitRow = memo(function HabitRow({
  habit,
  weekDates,
  onToggle,
  onUpdate,
  onDelete,
}: {
  habit: Habit;
  weekDates: string[];
  onToggle: (habitId: string, date: string) => void;
  onUpdate: (habitId: string, name: string, icon: string) => void;
  onDelete: (habitId: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(habit.name);
  const [editIcon, setEditIcon] = useState(habit.icon);
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const iconBtnRef = useRef<HTMLButtonElement>(null);
  const iconPickerOpenRef = useRef(false); // 同步跟踪图标选择器状态，避免闭包中读到旧值

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  // 同步更新 ref 和 state（避免闭包中读到旧值）
  const setIconPickerOpen = (open: boolean) => {
    iconPickerOpenRef.current = open;
    setShowIconPicker(open);
  };

  // 保存：支持外部传入最新 icon（解决 React 批量更新导致 editIcon 还是旧值的问题）
  const handleSave = useCallback((forceIcon?: string) => {
    const icon = forceIcon ?? editIcon;
    const trimmed = editName.trim();
    const iconChanged = icon !== habit.icon;
    if (trimmed && (trimmed !== habit.name || iconChanged)) {
      onUpdate(habit.id, trimmed, icon);
    }
    setIsEditing(false);
    setIconPickerOpen(false);
  }, [editName, editIcon, habit.id, habit.name, habit.icon, onUpdate]);

  const handleCancel = () => {
    setEditName(habit.name);
    setEditIcon(habit.icon);
    setIsEditing(false);
    setIconPickerOpen(false);
  };

  // input 失焦：延迟保存，避免点击图标选择器时立即关闭
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (blurTimerRef.current) clearTimeout(blurTimerRef.current); }, []);

  const handleBlur = () => {
    blurTimerRef.current = setTimeout(() => {
      if (!iconPickerOpenRef.current) handleSave();
    }, 200);
  };

  // 图标选择：直接传 icon 给 handleSave，不依赖 state 更新
  const handleIconSelect = (icon: string) => {
    setEditIcon(icon);
    setIconPickerOpen(false);
    if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
    // 延迟保存，让 setEditIcon 生效
    setTimeout(() => handleSave(icon), 0);
  };

  return (
    <>
      <div
        className="group relative"
        onMouseEnter={() => setShowDelete(true)}
        onMouseLeave={() => { setShowDelete(false); }}
      >
        {/* 习惯名称行 */}
        <div className="flex items-center gap-1.5 mb-1.5">
          {isEditing ? (
            <>
              <div className="relative shrink-0">
                <button
                  ref={iconBtnRef}
                  onClick={() => setIconPickerOpen(!showIconPicker)}
                  className="p-0.5 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                  title="点击切换图标"
                >
                  <HabitIcon name={editIcon} className="w-4 h-4" />
                </button>
                {showIconPicker && (
                  <IconPicker
                    currentIcon={editIcon}
                    anchorRef={iconBtnRef}
                    onSelect={handleIconSelect}
                    onClose={() => { setIconPickerOpen(false); }}
                  />
                )}
              </div>
              <input
                ref={inputRef}
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') handleCancel(); }}
                onBlur={handleBlur}
                className="flex-1 min-w-0 text-sm bg-transparent border-b border-gray-300 dark:border-gray-600 outline-none text-gray-800 dark:text-gray-200"
              />
            </>
          ) : (
            <>
              <button
                ref={iconBtnRef}
                className="shrink-0 p-0.5 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                onClick={() => { setEditName(habit.name); setEditIcon(habit.icon); setIsEditing(true); }}
                title="点击编辑"
              >
                <HabitIcon name={habit.icon} className="w-4 h-4" />
              </button>
              <span
                className="text-sm text-gray-700 dark:text-gray-300 truncate cursor-default flex-1 min-w-0"
                onDoubleClick={() => { setEditName(habit.name); setEditIcon(habit.icon); setIsEditing(true); }}
                title="双击编辑名称"
              >
                {habit.name}
              </span>
            </>
          )}
          {/* 删除按钮 */}
          {showDelete && !isEditing && (
            <button
              onClick={() => setShowConfirm(true)}
              className="shrink-0 p-0.5 text-gray-400 hover:text-red-500 transition-colors"
              title="删除习惯"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* 打卡圆圈行 */}
        <div className="grid grid-cols-7 gap-0 justify-items-center">
          {weekDates.map((date) => {
            const checked = habit.week_records.includes(date);
            const today = isToday(date);
            return (
              <button
                key={date}
                onClick={() => onToggle(habit.id, date)}
                className={`w-[18px] h-[18px] rounded-full flex items-center justify-center transition-all ${
                  checked
                    ? 'bg-[#3f587f] dark:bg-[#6b8ab5] scale-110'
                    : today
                      ? 'border-2 border-[#3f587f] dark:border-[#6b8ab5] bg-transparent'
                      : 'border border-gray-300 dark:border-gray-600 bg-transparent hover:border-[#3f587f] dark:hover:border-[#6b8ab5]'
                }`}
                title={`${date}${checked ? ' ✓' : ''}`}
              >
                {checked && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
              </button>
            );
          })}
        </div>
      </div>

      {/* 删除确认弹窗 */}
      {showConfirm && (
        <ConfirmDialog
          message={`确定删除「${habit.name}」？所有打卡记录也会被删除。`}
          onConfirm={() => { onDelete(habit.id); setShowConfirm(false); }}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </>
  );
});

// ── 主组件 ──
export default function HabitTracker({ embedded = false }: { embedded?: boolean } = {}) {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newIcon, setNewIcon] = useState('📌');
  const [showAddIconPicker, setShowAddIconPicker] = useState(false);
  const addInputRef = useRef<HTMLInputElement>(null);
  const addIconBtnRef = useRef<HTMLButtonElement>(null);
  const addFormRef = useRef<HTMLDivElement>(null);
  const weekDates = getWeekDates();

  const fetchHabits = useCallback(async () => {
    try {
      const data = await getHabits();
      setHabits(data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchHabits(); // eslint-disable-line react-hooks/set-state-in-effect
  }, [fetchHabits]);

  useEffect(() => {
    if (isAdding && addInputRef.current) {
      addInputRef.current.focus();
    }
  }, [isAdding]);

  // 点击外部取消新建
  useEffect(() => {
    if (!isAdding) return;
    const handler = (e: MouseEvent) => {
      if (addFormRef.current && !addFormRef.current.contains(e.target as Node)) {
        setIsAdding(false);
        setNewName('');
        setNewIcon('📌');
        setShowAddIconPicker(false);
      }
    };
    // 延迟注册，避免立即触发
    const timer = setTimeout(() => document.addEventListener('mousedown', handler), 0);
    return () => { clearTimeout(timer); document.removeEventListener('mousedown', handler); };
  }, [isAdding]);

  const handleToggle = async (habitId: string, date: string) => {
    try {
      setHabits((prev) =>
        prev.map((h) => {
          if (h.id !== habitId) return h;
          const has = h.week_records.includes(date);
          return { ...h, week_records: has ? h.week_records.filter((d) => d !== date) : [...h.week_records, date] };
        })
      );
      await toggleHabitRecord(habitId, date);
    } catch {
      fetchHabits();
    }
  };

  const handleCreate = async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    try {
      const created = await createHabit(trimmed, newIcon);
      setHabits((prev) => [...prev, created]);
      setNewName('');
      setNewIcon('📌');
      setIsAdding(false);
      setShowAddIconPicker(false);
    } catch { /* ignore */ }
  };

  const handleUpdate = async (habitId: string, name: string, icon: string) => {
    try {
      const updated = await updateHabit(habitId, { name, icon });
      setHabits((prev) => prev.map((h) => (h.id === habitId ? updated : h)));
    } catch { /* ignore */ }
  };

  const handleDelete = async (habitId: string) => {
    try {
      await deleteHabit(habitId);
      setHabits((prev) => prev.filter((h) => h.id !== habitId));
    } catch { /* ignore */ }
  };

  return (
    <div className={embedded ? 'px-1' : 'bg-white dark:bg-gray-800/50 rounded-xl p-4 border border-[#e7e7e5] dark:border-gray-700/40'}>
      {/* 标题栏 */}
      <div className="flex items-center justify-between mb-3">
        <span className="flex items-center gap-1.5 text-base font-medium text-gray-400 dark:text-gray-500">
          <Target className="w-4 h-4" />
          习惯打卡
        </span>
        <button
          onClick={() => setIsAdding(true)}
          className="p-1 text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors"
          title="添加习惯"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* 添加习惯 — 内联表单，点击外部取消 */}
      {isAdding && (
        <div ref={addFormRef} className="flex items-center gap-1.5 mb-3">
          <div className="relative shrink-0">
            <button
              ref={addIconBtnRef}
              onClick={() => setShowAddIconPicker(!showAddIconPicker)}
              className="p-0.5 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
              title="选择图标"
            >
              <HabitIcon name={newIcon} className="w-4 h-4" />
            </button>
            {showAddIconPicker && (
              <IconPicker
                currentIcon={newIcon}
                anchorRef={addIconBtnRef}
                onSelect={(icon) => { setNewIcon(icon); setShowAddIconPicker(false); }}
                onClose={() => setShowAddIconPicker(false)}
              />
            )}
          </div>
          <input
            ref={addInputRef}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') { setNewName(''); setNewIcon('📌'); setIsAdding(false); } }}
            placeholder="习惯名称..."
            className="flex-1 min-w-0 text-sm bg-transparent border-b border-gray-300 dark:border-gray-600 outline-none text-gray-800 dark:text-gray-200 placeholder-gray-400"
          />
          <button
            onClick={handleCreate}
            className="px-2 py-0.5 text-xs text-white bg-blue-500 hover:bg-blue-600 rounded-md transition-colors"
          >
            确认
          </button>
        </div>
      )}

      {/* 习惯列表 */}
      {habits.length === 0 && !isAdding ? (
        <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-2">点击 + 添加第一个习惯</p>
      ) : (
        <div className="space-y-3">
          {habits.map((h) => (
            <HabitRow
              key={h.id}
              habit={h}
              weekDates={weekDates}
              onToggle={handleToggle}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
