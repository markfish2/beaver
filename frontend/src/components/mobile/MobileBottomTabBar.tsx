import { useMemo } from 'react';
import { StickyNote, CalendarDays, Plus, FileText, Sparkles } from 'lucide-react';

export type MobileTab = 'memos' | 'diary' | 'new' | 'files' | 'ai';

interface MobileBottomTabBarProps {
  activeTab: MobileTab;
  onTabChange: (tab: MobileTab) => void;
}

const tabs: { id: MobileTab; label: string; icon: typeof StickyNote }[] = [
  { id: 'memos',  label: '随想', icon: StickyNote },
  { id: 'diary',  label: '日记', icon: CalendarDays },
  { id: 'new',    label: '新建', icon: Plus },
  { id: 'files',  label: '文件', icon: FileText },
  { id: 'ai',     label: 'AI',   icon: Sparkles },
];

export default function MobileBottomTabBar({ activeTab, onTabChange }: MobileBottomTabBarProps) {

  // 计算选中指示器的位置
  const activeIndex = useMemo(() => tabs.findIndex(t => t.id === activeTab), [activeTab]);

  return (
    <>
      {/* 胶囊容器 */}
      <div
        className="fixed left-4 right-4 z-30 flex items-center justify-center"
        style={{
          bottom: `calc(20px + env(safe-area-inset-bottom, 0px))`,
        }}
      >
        <nav className="relative flex items-center h-[60px] px-1
                        bg-white/70 dark:bg-gray-800/70
                        backdrop-blur-2xl
                        rounded-[22px]
                        shadow-[0_2px_16px_-6px_rgba(0,0,0,0.12),0_0_0_0.5px_rgba(0,0,0,0.06)]
                        dark:shadow-[0_2px_16px_-6px_rgba(0,0,0,0.4),0_0_0_0.5px_rgba(255,255,255,0.08)]
                        transition-shadow duration-300"
        >
          {/* 选中背景胶囊 (Liquid Glass indicator) */}
          <div
            className="absolute top-[7px] h-[46px] w-[52px] rounded-[16px]
                        bg-blue-500/10 dark:bg-blue-400/20
                        backdrop-blur-sm
                        border border-blue-500/15 dark:border-blue-400/20
                        shadow-[0_0_12px_-2px_rgba(59,130,246,0.25)]
                        transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
            style={{
              left: `calc(${activeIndex} * (100% / ${tabs.length}) + (100% / ${tabs.length} - 52px) / 2)`,
            }}
          />

          {/* Tab 按钮 */}
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            const isNew = tab.id === 'new';

            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className="relative flex flex-col items-center justify-center flex-1 h-full
                           min-w-0 transition-colors duration-200 z-10
                           active:scale-90"
              >
                {isNew ? (
                  /* 新建按钮 - 凸起设计 */
                  <div className={`flex items-center justify-center w-10 h-10 -mt-1 rounded-full
                                   shadow-[0_2px_8px_-2px_rgba(0,0,0,0.15)]
                                   transition-all duration-300
                                   ${isActive
                                     ? 'bg-blue-500 text-white shadow-[0_4px_12px_-2px_rgba(59,130,246,0.4)] scale-110'
                                     : 'bg-[#8B8B80] dark:bg-gray-400 text-white'
                                   }`}>
                    <Icon className="w-5 h-5" strokeWidth={2} />
                  </div>
                ) : (
                  /* 普通按钮 */
                  <Icon
                    className={`w-5 h-5 transition-all duration-300
                               ${isActive
                                 ? 'text-blue-600 dark:text-blue-400 scale-110'
                                 : 'text-[#8B8B80] dark:text-gray-400'
                               }`}
                    strokeWidth={isActive ? 2.5 : 1.8}
                  />
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* 底部安全区域填充 */}
      <div
        className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-900 z-20 pointer-events-none"
        style={{ height: 'env(safe-area-inset-bottom, 0px)' }}
      />
    </>
  );
}
