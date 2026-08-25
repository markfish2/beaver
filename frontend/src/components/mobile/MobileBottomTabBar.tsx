import { useMemo } from 'react';
import NavigationIcon, { type NavigationIconType } from '../NavigationIcon';

export type MobileTab = 'memos' | 'diary' | 'new' | 'files' | 'ai';

interface MobileBottomTabBarProps {
  activeTab: MobileTab;
  onTabChange: (tab: MobileTab) => void;
  chromeHidden?: boolean;
}

const tabs: { id: MobileTab; icon: NavigationIconType }[] = [
  { id: 'memos',  icon: 'memo' },
  { id: 'diary',  icon: 'diary' },
  { id: 'new',    icon: 'add' },
  { id: 'files',  icon: 'files' },
  { id: 'ai',     icon: 'ai' },
];

const INDICATOR_WIDTH = 54;

export default function MobileBottomTabBar({ activeTab, onTabChange, chromeHidden = false }: MobileBottomTabBarProps) {

  const activeIndex = useMemo(() => tabs.findIndex(t => t.id === activeTab), [activeTab]);
  const tabCount = tabs.length;

  return (
    <>
      <div
        className="fixed left-0 right-0 z-30 flex items-center justify-center"
        style={{
          bottom: `calc(16px + env(safe-area-inset-bottom, 0px))`,
          transform: chromeHidden ? 'translateY(150%)' : 'translateY(0)',
          opacity: chromeHidden ? 0 : 1,
          pointerEvents: chromeHidden ? 'none' : 'auto',
          transition: 'transform 400ms linear, opacity 400ms linear',
        }}
      >
        <nav className="relative flex items-center h-[46px] w-[80%] max-w-[380px]
                        border border-white/35 bg-white/30 dark:border-white/10 dark:bg-gray-800/35
                        backdrop-blur-2xl backdrop-saturate-200
                        rounded-full
                        shadow-[0_2px_16px_-6px_rgba(15,23,42,0.18)]
                        dark:shadow-[0_2px_16px_-6px_rgba(0,0,0,0.2)]"
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
            const isActive = activeTab === tab.id;
            const isNew = tab.id === 'new';

            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className="relative flex items-center justify-center flex-1 h-full min-h-[44px]
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
                    <NavigationIcon type={tab.icon} className="w-[18px] h-[18px] text-white" strokeWidth={2} />
                  </div>
                ) : (
                  <NavigationIcon
                    type={tab.icon}
                    className={`w-[22px] h-[22px] transition-all duration-300
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
        style={{
          height: 'env(safe-area-inset-bottom, 0px)',
          opacity: chromeHidden ? 0 : 1,
          transition: 'opacity 400ms linear',
        }}
      />
    </>
  );
}
