import { useMemo } from 'react';
import { StickyNote, CalendarDays, Plus, FileText, Sparkles } from 'lucide-react';

export type MobileTab = 'memos' | 'diary' | 'new' | 'files' | 'ai';

interface MobileBottomTabBarProps {
  activeTab: MobileTab;
  onTabChange: (tab: MobileTab) => void;
}

const tabs: { id: MobileTab; icon: typeof StickyNote }[] = [
  { id: 'memos',  icon: StickyNote },
  { id: 'diary',  icon: CalendarDays },
  { id: 'new',    icon: Plus },
  { id: 'files',  icon: FileText },
  { id: 'ai',     icon: Sparkles },
];

const INDICATOR_WIDTH = 54;

export default function MobileBottomTabBar({ activeTab, onTabChange }: MobileBottomTabBarProps) {

  const activeIndex = useMemo(() => tabs.findIndex(t => t.id === activeTab), [activeTab]);
  const tabCount = tabs.length;

  return (
    <>
      <div
        className="fixed left-0 right-0 z-30 flex items-center justify-center"
        style={{ bottom: `calc(16px + env(safe-area-inset-bottom, 0px))` }}
      >
        <nav className="relative flex items-center h-[46px] w-[80%] max-w-[380px]
                        bg-white/75 dark:bg-gray-800/75
                        backdrop-blur-2xl
                        rounded-full
                        shadow-[0_2px_20px_-6px_rgba(0,0,0,0.12),0_0_0_0.5px_rgba(0,0,0,0.06)]
                        dark:shadow-[0_2px_20px_-6px_rgba(0,0,0,0.4),0_0_0_0.5px_rgba(255,255,255,0.08)]"
        >
          {/* 扁胶囊指示器 */}
          <div
            className="absolute top-[4px] h-[38px] rounded-full
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

          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            const isNew = tab.id === 'new';

            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className="relative flex items-center justify-center flex-1 h-full
                           min-w-0 transition-[transform,color] duration-200 z-10
                           active:scale-90"
              >
                {isNew ? (
                  <div className={`flex items-center justify-center w-[34px] h-[34px] rounded-full
                                   shadow-[0_2px_8px_-2px_rgba(0,0,0,0.15)]
                                   transition-all duration-300
                                   ${isActive
                                     ? 'bg-blue-500 text-white shadow-[0_4px_14px_-2px_rgba(59,130,246,0.4)] scale-110'
                                     : 'bg-gray-600 dark:bg-gray-400 text-white'
                                   }`}>
                    <Icon className="w-[16px] h-[16px]" strokeWidth={2} />
                  </div>
                ) : (
                  <Icon
                    className={`w-[18px] h-[18px] transition-all duration-300
                               ${isActive
                                 ? 'text-blue-600 dark:text-blue-400 scale-110'
                                 : 'text-gray-400 dark:text-gray-500'
                               }`}
                    strokeWidth={isActive ? 2.5 : 1.8}
                  />
                )}
              </button>
            );
          })}
        </nav>
      </div>

      <div
        className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-900 z-20 pointer-events-none"
        style={{ height: 'env(safe-area-inset-bottom, 0px)' }}
      />
    </>
  );
}
