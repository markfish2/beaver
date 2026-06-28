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
  { id: 'new',    label: '',    icon: Plus },
  { id: 'files',  label: '文件', icon: FileText },
  { id: 'ai',     label: 'AI',   icon: Sparkles },
];

const INDICATOR_WIDTH = 64;  // 选中指示器宽度 (px)

export default function MobileBottomTabBar({ activeTab, onTabChange }: MobileBottomTabBarProps) {

  const activeIndex = useMemo(() => tabs.findIndex(t => t.id === activeTab), [activeTab]);
  const tabCount = tabs.length;

  return (
    <>
      {/* 胶囊容器 - 80% 宽度居中 */}
      <div
        className="fixed left-0 right-0 z-30 flex items-center justify-center"
        style={{
          bottom: `calc(16px + env(safe-area-inset-bottom, 0px))`,
        }}
      >
        <nav className="relative flex items-center h-[58px] w-[80%] max-w-[420px]
                        bg-white/75 dark:bg-gray-800/75
                        backdrop-blur-2xl
                        rounded-full
                        shadow-[0_2px_20px_-6px_rgba(0,0,0,0.12),0_0_0_0.5px_rgba(0,0,0,0.06)]
                        dark:shadow-[0_2px_20px_-6px_rgba(0,0,0,0.4),0_0_0_0.5px_rgba(255,255,255,0.08)]
                        transition-shadow duration-300"
        >
          {/* 选中背景胶囊 (Liquid Glass indicator) - 半圆 */}
          <div
            className="absolute top-[5px] h-[48px] rounded-full
                        bg-blue-500/15 dark:bg-blue-400/25
                        backdrop-blur-sm
                        border border-blue-500/20 dark:border-blue-400/25
                        shadow-[0_0_12px_-2px_rgba(59,130,246,0.3)]
                        transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
            style={{
              width: `${INDICATOR_WIDTH}px`,
              left: `calc(${activeIndex} * (100% / ${tabCount}) + (100% / ${tabCount} - ${INDICATOR_WIDTH}px) / 2)`,
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
                           min-w-0 transition-[transform,color] duration-200 z-10
                           active:scale-90"
              >
                {isNew ? (
                  /* 新建按钮 - 圆形凸起 */
                  <div className={`flex items-center justify-center w-[38px] h-[38px] rounded-full
                                   shadow-[0_2px_8px_-2px_rgba(0,0,0,0.15)]
                                   transition-all duration-300
                                   ${isActive
                                     ? 'bg-blue-500 text-white shadow-[0_4px_14px_-2px_rgba(59,130,246,0.4)] scale-110'
                                     : 'bg-gray-500/80 dark:bg-gray-400/80 text-white'
                                   }`}>
                    <Icon className="w-[18px] h-[18px]" strokeWidth={2} />
                  </div>
                ) : (
                  <>
                    <Icon
                      className={`w-[22px] h-[22px] transition-all duration-300
                                 ${isActive
                                   ? 'text-blue-600 dark:text-blue-400'
                                   : 'text-gray-400 dark:text-gray-500'
                                 }`}
                      strokeWidth={isActive ? 2.5 : 1.8}
                    />
                    {/* 只有选中的 tab 显示标签 */}
                    {isActive && tab.label && (
                      <span className="text-[9px] text-blue-600 dark:text-blue-400 font-medium mt-[2px] leading-none">
                        {tab.label}
                      </span>
                    )}
                  </>
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
