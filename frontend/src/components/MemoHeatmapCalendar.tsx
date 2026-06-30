import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getMemoHeatmap } from '../api/data';

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number) {
  const day = new Date(year, month - 1, 1).getDay();
  return day === 0 ? 6 : day - 1;
}

function getIntensity(count: number): string {
  if (count === 0) return '';
  if (count === 1) return 'bg-[#a3bdd6] dark:bg-[#2a3a50]';
  if (count <= 3) return 'bg-[#6b8ab5] dark:bg-[#3f587f]';
  return 'bg-[#3f587f] dark:bg-[#6b8ab5]';
}

export default function MemoHeatmapCalendar({ embedded = false }: { embedded?: boolean } = {}) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [dayCounts, setDayCounts] = useState<Record<string, number>>({});

  const fetchHeatmap = useCallback(async (y: number, m: number) => {
    try {
      const data = await getMemoHeatmap(y, m);
      setDayCounts(data.days);
    } catch (e) {
      console.error('Failed to fetch heatmap', e);
      setDayCounts({});
    }
  }, []);

  useEffect(() => {
    fetchHeatmap(year, month);
  }, [year, month, fetchHeatmap]);

  const prevMonth = () => {
    if (month === 1) { setYear(year - 1); setMonth(12); }
    else { setMonth(month - 1); }
  };

  const nextMonth = () => {
    if (month === 12) { setYear(year + 1); setMonth(1); }
    else { setMonth(month + 1); }
  };

  const daysInMonth = getDaysInMonth(year, month);
  const firstDayOfWeek = getFirstDayOfWeek(year, month);

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDayOfWeek; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className={embedded ? 'px-1' : 'bg-white dark:bg-gray-800/50 rounded-xl p-4 border border-[#e7e7e5] dark:border-gray-700/40'}>
      <div className="flex items-center justify-between mb-3">
        <button onClick={prevMonth} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors">
          <ChevronLeft className="w-4 h-4 text-gray-500 dark:text-gray-400" />
        </button>
        <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
          {year}年{month}月
        </span>
        <button onClick={nextMonth} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors">
          <ChevronRight className="w-4 h-4 text-gray-500 dark:text-gray-400" />
        </button>
      </div>

      <div className="grid grid-cols-7 mb-1">
        {WEEKDAYS.map(d => (
          <div key={d} className="text-center text-[10px] text-gray-400 dark:text-gray-500 py-0.5">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (day === null) return <div key={`empty-${i}`} className="aspect-square" />;
          const count = dayCounts[String(day)] || 0;
          const intensity = getIntensity(count);
          return (
            <div
              key={day}
              className="aspect-square flex items-center justify-center"
              title={`${day}日: ${count}条`}
            >
              <span className={`w-[80%] aspect-square rounded-[5px] flex items-center justify-center text-[10px] ${
                intensity || 'bg-[#f4f2ec] dark:bg-gray-800'
              } ${count > 0 ? 'text-white dark:text-gray-900 font-medium' : 'text-gray-400 dark:text-gray-500'}`}>
                {day}
              </span>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-end gap-1 mt-2">
        <span className="text-[9px] text-gray-400">少</span>
        <div className="w-3 h-3 rounded-[5px] bg-[#f4f2ec] dark:bg-gray-800" />
        <div className="w-3 h-3 rounded-[5px] bg-[#a3bdd6] dark:bg-[#2a3a50]" />
        <div className="w-3 h-3 rounded-[5px] bg-[#6b8ab5] dark:bg-[#3f587f]" />
        <div className="w-3 h-3 rounded-[5px] bg-[#3f587f] dark:bg-[#6b8ab5]" />
        <span className="text-[9px] text-gray-400">多</span>
      </div>
    </div>
  );
}
