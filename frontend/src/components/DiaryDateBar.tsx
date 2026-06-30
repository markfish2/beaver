import { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

interface DiaryDateBarProps {
  docYear: number;
  docMonth: number;
  diaryDays: Set<number>;
  onDayClick: (day: number) => void;
  onMonthNavigate: (year: number, month: number) => void;
}

export default function DiaryDateBar({ docYear, docMonth, diaryDays, onDayClick, onMonthNavigate }: DiaryDateBarProps) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(docYear);
  const [viewMonth, setViewMonth] = useState(docMonth);
  const scrollRef = useRef<HTMLDivElement>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  // Sync view month with document month when document changes
  useEffect(() => {
    setViewYear(docYear);
    setViewMonth(docMonth);
  }, [docYear, docMonth]);

  // Scroll to today element with retry (ensures DOM is ready)
  const scrollToToday = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const el = scrollRef.current?.querySelector('[data-today="true"]');
    if (el) {
      el.scrollIntoView({ behavior, inline: 'center', block: 'nearest' });
      return true;
    }
    return false;
  }, []);

  // Auto-scroll to today when viewing current month
  useEffect(() => {
    const isCurrentMonth = viewYear === today.getFullYear() && viewMonth === today.getMonth() + 1;
    if (!isCurrentMonth) return;

    // Try immediately, then retry with delays to handle DOM timing
    if (!scrollToToday()) {
      const t1 = setTimeout(() => {
        if (!scrollToToday()) {
          const t2 = setTimeout(() => scrollToToday('auto'), 200);
          return () => clearTimeout(t2);
        }
      }, 50);
      return () => clearTimeout(t1);
    }
  }, [viewYear, viewMonth, scrollToToday]);

  const isViewingDocMonth = viewYear === docYear && viewMonth === docMonth;
  const isCurrentMonth = viewYear === today.getFullYear() && viewMonth === today.getMonth() + 1;
  const daysInMonth = getDaysInMonth(viewYear, viewMonth);

  // Scroll by one day (44px = w-10 + gap-1)
  const scrollByDay = useCallback((direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const amount = direction === 'left' ? -44 : 44;
      scrollRef.current.scrollBy({ left: amount, behavior: 'smooth' });
    }
  }, []);

  const goToToday = useCallback(() => {
    const ty = today.getFullYear();
    const tm = today.getMonth() + 1;
    setViewYear(ty);
    setViewMonth(tm);
    if (ty !== docYear || tm !== docMonth) {
      onMonthNavigate(ty, tm);
    } else {
      // Already on current month, scroll to today with retry
      setTimeout(() => {
        if (!scrollToToday()) {
          setTimeout(() => scrollToToday('auto'), 200);
        }
      }, 50);
    }
  }, [docYear, docMonth, onMonthNavigate, scrollToToday]);

  // Touch swipe handling — swipe to change month
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const dx = e.changedTouches[0].clientX - touchStartRef.current.x;
    const dy = e.changedTouches[0].clientY - touchStartRef.current.y;
    touchStartRef.current = null;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 80) {
      if (dx > 0) {
        // Swipe right → prev month
        const newY = viewMonth === 1 ? viewYear - 1 : viewYear;
        const newM = viewMonth === 1 ? 12 : viewMonth - 1;
        onMonthNavigate(newY, newM);
      } else {
        // Swipe left → next month
        const newY = viewMonth === 12 ? viewYear + 1 : viewYear;
        const newM = viewMonth === 12 ? 1 : viewMonth + 1;
        onMonthNavigate(newY, newM);
      }
    }
  }, [viewYear, viewMonth, onMonthNavigate]);

  const handleDayClick = useCallback((day: number) => {
    if (!isViewingDocMonth) {
      onMonthNavigate(viewYear, viewMonth);
    } else {
      onDayClick(day);
    }
  }, [isViewingDocMonth, viewYear, viewMonth, onDayClick, onMonthNavigate]);

  const getWeekday = (day: number) => {
    const dt = new Date(viewYear, viewMonth - 1, day);
    const idx = dt.getDay();
    return WEEKDAYS[idx === 0 ? 6 : idx - 1];
  };

  return (
    <div
      className="mb-6 select-none"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Month header */}
      <div className="flex items-center justify-center gap-2 mb-2 px-1">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
          {viewYear}年{viewMonth}月
        </span>
        <button
          onClick={goToToday}
          className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
            isCurrentMonth
              ? 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
              : 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50'
          }`}
        >
          今天
        </button>
      </div>

      {/* Single-row horizontal day list with arrows */}
      <div className="flex items-center gap-0.5 px-1">
        <button
          onClick={() => scrollByDay('left')}
          className="flex-shrink-0 p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
        >
          <ChevronLeft className="w-4 h-4 text-gray-500 dark:text-gray-400" />
        </button>
        <div
          ref={scrollRef}
          className="flex gap-1 overflow-x-auto pb-1 scrollbar-none flex-1 min-w-0"
        >
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
          const isToday = isCurrentMonth && day === today.getDate();
          const hasContent = isViewingDocMonth && diaryDays.has(day);
          const weekday = getWeekday(day);
          return (
            <button
              key={day}
              data-today={isToday ? 'true' : undefined}
              onClick={() => handleDayClick(day)}
              className={`relative flex-shrink-0 flex flex-col items-center justify-center w-10 h-14 rounded-lg text-xs transition-colors ${
                isToday
                  ? 'bg-[#3f587f] dark:bg-[#3f587f] text-white dark:text-white font-bold'
                  : hasContent
                    ? 'text-gray-800 dark:text-gray-200 font-medium hover:bg-gray-100 dark:hover:bg-gray-800'
                    : 'text-gray-400 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800/50'
              }`}
            >
              <span className="text-[11px] leading-tight">{day}</span>
              <span className="text-[9px] leading-tight opacity-60">{weekday}</span>
              {hasContent && (
                <span className={`absolute bottom-1 w-1 h-1 rounded-full ${isToday ? 'bg-white' : 'bg-gray-400'}`} />
              )}
            </button>
          );
        })}
        </div>
        <button
          onClick={() => scrollByDay('right')}
          className="flex-shrink-0 p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
        >
          <ChevronRight className="w-4 h-4 text-gray-500 dark:text-gray-400" />
        </button>
      </div>
    </div>
  );
}
