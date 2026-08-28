import { useMemo } from 'react';
import NavigationIcon, { type NavigationIconType } from '../NavigationIcon';
import { X } from 'lucide-react';

export type MobileTab = 'memos' | 'diary' | 'new' | 'files' | 'starred' | 'ai';

interface MobileBottomTabBarProps {
  activeTab: MobileTab;
  onTabChange: (tab: MobileTab) => void;
  chromeHidden?: boolean;
  newMenuOpen?: boolean;
}

const tabs: { id: MobileTab; icon: NavigationIconType }[] = [
  { id: 'memos',  icon: 'memo' },
  { id: 'diary',  icon: 'diary' },
  { id: 'new',    icon: 'add' },
  { id: 'files',  icon: 'files' },
  { id: 'starred', icon: 'starred' },
  { id: 'ai',     icon: 'ai' },
];

const INDICATOR_WIDTH = 54;
const contentTabs = tabs.filter((tab) => tab.id !== 'new');

export default function MobileBottomTabBar({ activeTab, onTabChange, chromeHidden = false, newMenuOpen = false }: MobileBottomTabBarProps) {

  const activeIndex = useMemo(() => contentTabs.findIndex(t => t.id === activeTab), [activeTab]);
  const tabCount = contentTabs.length;

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
        <div className="flex w-[92%] max-w-[430px] items-center gap-2">
          {/* 新建按钮独立于主导航胶囊，固定在底部左侧。 */}
          <button
            onClick={() => onTabChange('new')}
            aria-label="新建"
            className="flex h-[56px] w-[56px] shrink-0 items-center justify-center rounded-full
                       border border-white/55 bg-white/35 text-white
                       shadow-[0_2px_10px_-2px_rgba(15,23,42,0.22)]
                       backdrop-blur-2xl backdrop-saturate-200 transition-transform duration-200 active:scale-90"
          >
            <span className="flex h-[44px] w-[44px] items-center justify-center rounded-full bg-[var(--app-link)] text-white">
              {newMenuOpen
                ? <X className="h-[24px] w-[24px]" strokeWidth={2} />
                : <NavigationIcon type="add" className="h-[24px] w-[24px]" strokeWidth={2} />}
            </span>
          </button>

        <nav className="relative flex h-[56px] min-w-0 flex-1 items-center
                        border border-white/35 bg-white/30 dark:border-white/10 dark:bg-gray-800/35
                        backdrop-blur-2xl backdrop-saturate-200
                        rounded-full
                        shadow-[0_2px_16px_-6px_rgba(15,23,42,0.18)]
                        dark:shadow-[0_2px_16px_-6px_rgba(0,0,0,0.2)]"
        >
          {/* 扁胶囊指示器 */}
          <div
            className="absolute top-[4px] h-[48px] rounded-full
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

          {contentTabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className="relative flex items-center justify-center flex-1 h-full min-h-[54px]
                           min-w-0 transition-[transform,color] duration-200 z-10
                           active:scale-90"
              >
                <NavigationIcon
                  type={tab.icon}
                  className={`w-[27.5px] h-[27.5px] transition-all duration-300
                             ${isActive
                               ? 'text-blue-600 dark:text-blue-400 scale-110'
                               : 'text-gray-400 dark:text-gray-500'
                             }`}
                  strokeWidth={isActive ? 2.5 : 1.8}
                />
              </button>
            );
          })}
        </nav>
        </div>
      </div>

      <div
        className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-900 z-20 pointer-events-none"
        style={{
          height: 'env(safe-area-inset-bottom, 0px)',
        }}
      />
    </>
  );
}
