import { StickyNote, CalendarDays, Plus, FileText, Star } from 'lucide-react';

export type MobileTab = 'memos' | 'diary' | 'new' | 'files' | 'starred';

interface MobileBottomTabBarProps {
  activeTab: MobileTab;
  onTabChange: (tab: MobileTab) => void;
}

const tabs: { id: MobileTab; label: string; icon: typeof StickyNote }[] = [
  { id: 'memos', label: '随想', icon: StickyNote },
  { id: 'diary', label: '日记', icon: CalendarDays },
  { id: 'new', label: '新建', icon: Plus },
  { id: 'files', label: '文件', icon: FileText },
  { id: 'starred', label: '收藏', icon: Star },
];

export default function MobileBottomTabBar({ activeTab, onTabChange }: MobileBottomTabBarProps) {
  return (
    <>
      {/* 安全区域填充（Home Indicator 上方），实色背景避免半透明空白感 */}
      <div
        className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-900 z-30 pointer-events-none"
        style={{ height: 'env(safe-area-inset-bottom, 0px)' }}
      />
      <div
        className="fixed bottom-0 left-0 right-0 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl border-t border-gray-200/50 dark:border-gray-700/50 flex items-center justify-around z-30"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        const isNew = tab.id === 'new';

        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`flex flex-col items-center justify-center py-1 px-3 min-w-0 flex-1 transition-colors ${
              isNew
                ? 'text-[#8B8B80] dark:text-gray-400'
                : isActive
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-[#8B8B80] dark:text-gray-400'
            }`}
          >
            <Icon className={`w-5 h-5 ${isActive && !isNew ? 'stroke-[2.5]' : ''}`} />
            <span className={`text-[10px] mt-0.5 ${isActive && !isNew ? 'font-semibold' : ''}`}>
              {tab.label}
            </span>
          </button>
        );
      })}
    </div>
    </>
  );
}
