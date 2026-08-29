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
            <span
              className="flex h-[44px] w-[44px] items-center justify-center rounded-full
                         bg-[var(--app-link)]/75 text-white
                         shadow-[0_3px_8px_-2px_rgba(15,23,42,0.3)]
                         backdrop-blur-md backdrop-saturate-150"
            >
              {newMenuOpen
                ? <X className="h-[24px] w-[24px]" strokeWidth={2} />
                : (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    className="h-[24px] w-[24px]"
                    aria-hidden="true"
                  >
                    <g fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5">
                      <path d="M2 12C2 16.714 2 19.0711 3.46447 20.5355C4.92893 22 7.28595 22 12 22C16.714 22 19.0711 22 20.5355 20.5355C22 19.0711 22 16.714 22 12V10.5M13.5 2H12C7.28595 2 4.92893 2 3.46447 3.46447C2.49073 4.43821 2.16444 5.80655 2.0551 8" />
                      <path d="M17.5625 10.3304L20.5449 7.34795L21.1938 6.69914C22.2687 5.62415 22.2687 3.88124 21.1938 2.80624C20.1188 1.73125 18.3759 1.73125 17.3009 2.80624L16.652 3.45506M16.652 3.45506C16.652 3.45506 16.7331 4.83379 17.9497 6.05032C19.1662 7.26685 20.5449 7.34795 20.5449 7.34795M16.652 3.45506L10.6872 9.41993C10.2832 9.82394 10.0812 10.0259 9.90743 10.2487C9.70249 10.5114 9.52679 10.7957 9.38344 11.0965C9.26191 11.3515 9.17157 11.6225 8.99089 12.1646L8.41242 13.9M8.41242 13.9L8.03811 15.0229C7.9492 15.2897 8.01862 15.5837 8.21744 15.7826C8.41626 15.9814 8.71035 16.0508 8.97709 15.9619L10.1 15.5876L11.8354 15.0091C12.3775 14.8284 12.6485 14.7381 12.9035 14.6166C13.2043 14.4732 13.4886 14.2975 13.7513 14.0926C13.9741 13.9188 14.1761 13.7168 14.5801 13.3128M10.1 15.5876L8.41242 13.9" />
                    </g>
                  </svg>
                )}
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
