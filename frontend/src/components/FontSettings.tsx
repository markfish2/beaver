import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Settings2, Palette } from 'lucide-react';
import { updateSettings } from '../api/auth';
import { useAuth } from '../context/AuthContext';
import { showToast } from '../utils/toast';

type FontSize = 'small' | 'medium' | 'large';
type FontFamily = 'system' | 'yahei' | 'pingfang' | 'kaiti' | 'fangsong' | 'syst';
type Theme = 'system' | 'minimal' | 'warm' | 'dark' | 'geek';
type SelectableTheme = Exclude<Theme, 'dark'>;

interface FontSettings {
  fontSize: FontSize;
  fontFamily: FontFamily;
  theme: Theme;
}

const FONT_SIZE_MAP: Record<FontSize, string> = {
  small: '12px',
  medium: '14px',
  large: '16px'
};

const FONT_FAMILY_MAP: Record<FontFamily, string> = {
  system: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  yahei: '"Microsoft YaHei", "微软雅黑", sans-serif',
  pingfang: '"PingFang SC", "苹方", -apple-system, sans-serif',
  kaiti: '"KaiTi", "楷体", "STKaiti", serif',
  fangsong: '"FangSong", "仿宋", "STFangsong", serif',
  syst: '"Source Han Serif CN", "思源宋体", "Noto Serif CJK SC", serif'
};

const FONT_SIZE_LABELS: Record<FontSize, string> = {
  small: '紧凑',
  medium: '标准',
  large: '舒展'
};

const FONT_FAMILY_LABELS: Record<FontFamily, string> = {
  system: '系统默认',
  yahei: '微软雅黑',
  pingfang: '苹方',
  kaiti: '楷体',
  fangsong: '仿宋',
  syst: '思源宋体'
};

// 主题配置 - 4个精选主题
const THEMES: Record<Theme, {
  name: string;
  bg: string;
  text: string;
  secondaryText: string;
  accent: string;
  guideColor?: string;
  headingColor?: string;
  preview: string;
  isDark: boolean;
}> = {
  system: {
    name: '跟随系统',
    bg: '#FDFDFC',
    text: '#333333',
    secondaryText: '#888888',
    accent: '#1A73E8',
    guideColor: '#e5e7eb',
    headingColor: '#111111',
    preview: 'bg-gradient-to-r from-[#FDFDFC] to-[#262624]',
    isDark: false
  },
  minimal: {
    name: '极简纯粹',
    bg: '#FDFDFC',
    text: '#333333',
    secondaryText: '#888888',
    accent: '#1A73E8',
    guideColor: '#e5e7eb',
    headingColor: '#111111',
    preview: 'bg-[#FDFDFC]',
    isDark: false
  },
  warm: {
    name: '暖沙',
    bg: '#F4EFE6',
    text: '#3D352D',
    secondaryText: '#817469',
    accent: '#A95F3A',
    guideColor: '#DCCFC0',
    headingColor: '#302820',
    preview: 'bg-[#F4EFE6]',
    isDark: false
  },
  dark: {
    name: '深炭',
    bg: '#262624',
    text: '#E7E4DD',
    secondaryText: '#AAA69E',
    accent: '#E08A68',
    guideColor: 'rgba(255,255,255,0.06)',
    headingColor: '#F0F1F3',
    preview: 'bg-[#1A1B1E]',
    isDark: true
  },
  geek: {
    name: '雾蓝',
    bg: '#F3F5F6',
    text: '#273238',
    secondaryText: '#65747C',
    accent: '#527A8A',
    guideColor: '#D7DEE1',
    headingColor: '#1F292E',
    preview: 'bg-[#F3F5F6]',
    isDark: false
  }
};

const SELECTABLE_THEMES: SelectableTheme[] = ['system', 'minimal', 'warm', 'geek'];

const STORAGE_KEY = 'outline-font-settings';

interface AppearanceContextValue {
  settings: FontSettings;
  setFontSize: (fontSize: FontSize) => void;
  setFontFamily: (fontFamily: FontFamily) => void;
  setTheme: (theme: Theme) => void;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

const AppearanceStateProvider = ({
  children,
  accountSettings,
}: {
  children: ReactNode;
  accountSettings?: FontSettings;
}) => {
  const [settings, setSettings] = useState<FontSettings>(() => {
    if (accountSettings) return accountSettings;
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const theme: Theme = parsed.theme || 'system';
        return { fontSize: parsed.fontSize || 'medium', fontFamily: parsed.fontFamily || 'system', theme };
      } catch {
        // fallback to default
      }
    }
    // 无保存设置时，检测系统暗色模式
    return { fontSize: 'medium', fontFamily: 'system', theme: 'system' };
  });

  const [isOpen, setIsOpen] = useState(false);

  // 应用主题 CSS 变量和样式
  const applyTheme = useCallback((themeKey: Theme) => {
    const resolvedKey = themeKey === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'minimal')
      : themeKey;
    const theme = THEMES[resolvedKey];
    const root = document.documentElement;
    root.dataset.theme = resolvedKey;
    root.style.setProperty('--outline-bg-color', theme.bg);
    root.style.setProperty('--outline-text-color', theme.text);
    root.style.setProperty('--outline-secondary-text', theme.secondaryText);
    root.style.setProperty('--outline-accent-color', theme.accent);
    root.style.setProperty('--outline-guide-color', theme.guideColor || 'transparent');
    root.style.setProperty('--outline-heading-color', theme.headingColor || theme.text);

    const mainContent = document.querySelector('.main-content-area');
    if (mainContent) {
      (mainContent as HTMLElement).style.backgroundColor = theme.bg;
      (mainContent as HTMLElement).style.color = theme.text;
    }

    if (theme.isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }

    // 更新所有 theme-color meta 标签，移除 media 查询让浏览器使用手动设置的颜色
    const color = theme.isDark ? '#111827' : '#ffffff';
    document.querySelectorAll('meta[name="theme-color"], meta[name="hw-theme-color"]').forEach(meta => {
      meta.setAttribute('content', color);
      meta.removeAttribute('media');
    });

    window.dispatchEvent(new CustomEvent('theme-change'));
  }, []);

  // 只有“跟随系统”会响应设备模式变化，不覆盖用户明确选择的主题。
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => settings.theme === 'system' && applyTheme('system');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [applyTheme, settings.theme]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));

    const root = document.documentElement;

    // 应用字体设置
    root.style.setProperty('--outline-font-size', FONT_SIZE_MAP[settings.fontSize]);
    root.style.setProperty('--outline-font-family', FONT_FAMILY_MAP[settings.fontFamily]);

    // 应用字体到 body
    document.body.style.fontSize = FONT_SIZE_MAP[settings.fontSize];
    document.body.style.fontFamily = FONT_FAMILY_MAP[settings.fontFamily];
    document.body.style.lineHeight = '1.6';
    document.body.style.fontWeight = '400';

    // 应用主题颜色
    applyTheme(settings.theme);
  }, [applyTheme, settings]);

  const persist = useCallback(async (next: Partial<{ theme: Theme; font_family: FontFamily; font_size: FontSize }>) => {
    try {
      await updateSettings(next);
    } catch {
      showToast('外观设置同步失败，已保存在当前设备', 'error');
    }
  }, []);

  const setFontSize = useCallback((fontSize: FontSize) => {
    setSettings(prev => ({ ...prev, fontSize }));
    void persist({ font_size: fontSize });
  }, [persist]);

  const setFontFamily = useCallback((fontFamily: FontFamily) => {
    setSettings(prev => ({ ...prev, fontFamily }));
    void persist({ font_family: fontFamily });
  }, [persist]);

  const setTheme = useCallback((theme: Theme) => {
    setSettings(prev => ({ ...prev, theme }));
    void persist({ theme });
  }, [persist]);

  const value = useMemo(() => ({
    settings,
    setFontSize,
    setFontFamily,
    setTheme,
    isOpen,
    setIsOpen
  }), [isOpen, setFontFamily, setFontSize, setTheme, settings]);

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
};

export const AppearanceProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const accountSettings = user ? {
    theme: (user.theme as Theme) || 'system',
    fontFamily: (user.font_family as FontFamily) || 'system',
    fontSize: (user.font_size as FontSize) || 'medium',
  } : undefined;
  const accountKey = user
    ? `${user.id}:${user.theme}:${user.font_family}:${user.font_size}`
    : 'local';

  return (
    <AppearanceStateProvider key={accountKey} accountSettings={accountSettings}>
      {children}
    </AppearanceStateProvider>
  );
};

export const useFontSettings = () => {
  const context = useContext(AppearanceContext);
  if (!context) throw new Error('useFontSettings must be used within AppearanceProvider');
  return context;
};

interface FontSettingsPanelProps {
  settings: FontSettings;
  setFontSize: (size: FontSize) => void;
  setFontFamily: (family: FontFamily) => void;
  setTheme: (theme: Theme) => void;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  hideButton?: boolean;
}

export const FontSettingsPanel = ({
  settings,
  setFontSize,
  setFontFamily,
  setTheme,
  isOpen,
  setIsOpen,
  hideButton = false,
}: FontSettingsPanelProps) => {
  if (hideButton) {
    // Render content only (for use inside other menus)
    return (
      <div>
        {/* Theme Section */}
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-3">
            <Palette className="w-4 h-4 text-gray-500" />
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              主题风格
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {SELECTABLE_THEMES.map((theme) => (
              <button
                key={theme}
                onClick={() => setTheme(theme)}
                className={`flex flex-col items-start gap-2 p-3 rounded-lg border-2 transition-all text-left ${
                  settings.theme === theme
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-transparent hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                <div className={`w-full h-10 rounded-md border border-gray-200 ${THEMES[theme].preview}`} />
                <div>
                  <div className="text-xs font-medium text-gray-800 dark:text-gray-200">{THEMES[theme].name}</div>
                  <div className="text-[10px] text-gray-500 mt-0.5">
                    {theme === 'system' && '随设备自动切换'}
                    {theme === 'minimal' && 'Workflowy 风格'}
                    {theme === 'warm' && '低刺激的暖色阅读'}
                    {theme === 'geek' && '清晰冷静的雾蓝层次'}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="border-t border-gray-200 dark:border-gray-700 my-4" />

        {/* Font Size Section */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            字体大小
          </label>
          <div className="flex gap-2">
            {(Object.keys(FONT_SIZE_LABELS) as FontSize[]).map((size) => (
              <button
                key={size}
                onClick={() => setFontSize(size)}
                className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                  settings.fontSize === size
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                {FONT_SIZE_LABELS[size]}
              </button>
            ))}
          </div>
        </div>

        {/* Font Family Section */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            字体选择
          </label>
          <div className="space-y-1">
            {(Object.keys(FONT_FAMILY_LABELS) as FontFamily[]).map((family) => (
              <button
                key={family}
                onClick={() => setFontFamily(family)}
                className={`w-full text-left py-2 px-3 rounded-lg text-sm transition-all ${
                  settings.fontFamily === family
                    ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
                style={{ fontFamily: FONT_FAMILY_MAP[family] }}
              >
                {FONT_FAMILY_LABELS[family]}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex items-center gap-1"
        title="显示设置"
      >
        <Settings2 className="w-5 h-5 text-gray-600 dark:text-gray-400" />
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 top-full mt-2 w-80 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 z-50 p-4 max-h-[80vh] overflow-y-auto">
            {/* Theme Section */}
            <div className="mb-5">
              <div className="flex items-center gap-2 mb-3">
                <Palette className="w-4 h-4 text-gray-500" />
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  主题风格
                </label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {SELECTABLE_THEMES.map((theme) => (
                  <button
                    key={theme}
                    onClick={() => setTheme(theme)}
                    className={`flex flex-col items-start gap-2 p-3 rounded-lg border-2 transition-all text-left ${
                      settings.theme === theme
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-transparent hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                  >
                    <div className={`w-full h-10 rounded-md border border-gray-200 ${THEMES[theme].preview}`} />
                    <div>
                      <div className="text-xs font-medium text-gray-800 dark:text-gray-200">{THEMES[theme].name}</div>
                      <div className="text-[10px] text-gray-500 mt-0.5">
                        {theme === 'system' && '随设备自动切换'}
                        {theme === 'minimal' && '温和、克制的纸张感'}
                        {theme === 'warm' && '低刺激的暖色阅读'}
                        {theme === 'geek' && '清晰冷静的雾蓝层次'}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="border-t border-gray-200 dark:border-gray-700 my-4" />

            {/* Font Size Section */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                字体大小
              </label>
              <div className="flex gap-2">
                {(Object.keys(FONT_SIZE_LABELS) as FontSize[]).map((size) => (
                  <button
                    key={size}
                    onClick={() => setFontSize(size)}
                    className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                      settings.fontSize === size
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                  >
                    {FONT_SIZE_LABELS[size]}
                  </button>
                ))}
              </div>
            </div>

            {/* Font Family Section */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                字体选择
              </label>
              <div className="space-y-1">
                {(Object.keys(FONT_FAMILY_LABELS) as FontFamily[]).map((family) => (
                  <button
                    key={family}
                    onClick={() => setFontFamily(family)}
                    className={`w-full text-left py-2 px-3 rounded-lg text-sm transition-all ${
                      settings.fontFamily === family
                        ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium'
                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                    style={{ fontFamily: FONT_FAMILY_MAP[family] }}
                  >
                    {FONT_FAMILY_LABELS[family]}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default FontSettingsPanel;
