import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMonthlyDiary, getOrCreateDayNode, getDiaryDayDates } from '../../api/data';
import DiaryDateBar from '../DiaryDateBar';
import MobileTodos from './MobileTodos';

export default function MobileDiaryView() {
  const navigate = useNavigate();
  const now = new Date();
  const [diaryDocId, setDiaryDocId] = useState<string | null>(null);
  const [docYear, setDocYear] = useState(now.getFullYear());
  const [docMonth, setDocMonth] = useState(now.getMonth() + 1);
  const [diaryDays, setDiaryDays] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);

  // On mount: load diary, create today's node if needed, then navigate to it
  useEffect(() => {
    let cancelled = false;
    const today = new Date();
    const curYear = today.getFullYear();
    const curMonth = today.getMonth() + 1;
    const curDay = today.getDate();

    const load = async () => {
      setLoading(true);
      try {
        // Get or create this month's diary document
        const data = await getMonthlyDiary(curYear, curMonth);
        if (cancelled) return;
        setDiaryDocId(data.document.id);
        setDocYear(curYear);
        setDocMonth(curMonth);

        // Get which days have content
        const days = await getDiaryDayDates(curYear, curMonth);
        if (cancelled) return;
        setDiaryDays(new Set(days));

        // Auto-create today's day node if it doesn't exist
        await getOrCreateDayNode(curYear, curMonth, curDay);
        if (cancelled) return;

        // Navigate directly to today's diary
        navigate(`/d/${data.document.id}?day=${curDay}`, { replace: true });
      } catch (err) {
        console.error('Failed to load diary:', err);
        setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [navigate]);

  const handleDayClick = async (day: number) => {
    try {
      await getOrCreateDayNode(docYear, docMonth, day);
      const days = await getDiaryDayDates(docYear, docMonth);
      setDiaryDays(new Set(days));
      if (diaryDocId) {
        navigate(`/d/${diaryDocId}?day=${day}`);
      }
    } catch (err) {
      console.error('Failed to open diary day:', err);
    }
  };

  const handleMonthNavigate = async (year: number, month: number) => {
    setLoading(true);
    try {
      const data = await getMonthlyDiary(year, month);
      setDiaryDocId(data.document.id);
      setDocYear(year);
      setDocMonth(month);
      const days = await getDiaryDayDates(year, month);
      setDiaryDays(new Set(days));
    } catch (err) {
      console.error('Failed to load diary:', err);
    } finally {
      setLoading(false);
    }
  };

  // This component auto-navigates to today's diary, but if that fails
  // show the date bar and todos as fallback
  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
        加载中...
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar">
      <MobileTodos />
      <div className="border-b border-gray-200 dark:border-gray-700">
        <DiaryDateBar
          docYear={docYear}
          docMonth={docMonth}
          diaryDays={diaryDays}
          onDayClick={handleDayClick}
          onMonthNavigate={handleMonthNavigate}
        />
      </div>
      <div className="px-4 py-6">
        {diaryDocId && (
          <button
            onClick={() => navigate(`/d/${diaryDocId}`)}
            className="w-full text-left px-4 py-4 bg-gray-50 dark:bg-gray-800 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <div className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-1">
              {docYear}年{docMonth}月 日记
            </div>
            <div className="text-xs text-gray-400 dark:text-gray-500">
              点击进入编辑
            </div>
          </button>
        )}
      </div>
    </div>
  );
}
