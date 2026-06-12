import { useState, useEffect } from 'react';
import { Settings2, Palette } from 'lucide-react';

type FontSize = 'small' | 'medium' | 'large';
type FontFamily = 'system' | 'yahei' | 'pingfang' | 'kaiti' | 'fangsong' | 'syst';
type Theme = 'minimal' | 'warm' | 'dark' | 'geek';

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
  small: '小',
  medium: '中',
  large: '大'
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
    name: '温润护眼',
    bg: '#FBFBF9',
    text: '#433F38',
    secondaryText: '#9CA3AF',
    accent: '#10B981',
    guideColor: '#e5e7eb',
    headingColor: '#1F1D1A',
    preview: 'bg-[#FBFBF9]',
    isDark: false
  },
  dark: {
    name: '沉浸深色',
    bg: '#1A1B1E',
    text: '#D1D3D6',
    secondaryText: '#8B919D',
    accent: '#7D56F4',
    guideColor: 'rgba(255,255,255,0.06)',
    headingColor: '#F0F1F3',
    preview: 'bg-[#1A1B1E]',
    isDark: true
  },
  geek: {
    name: '现代极客',
    bg: '#F6F8FA',
    text: '#24292F',
    secondaryText: '#57606A',
    accent: '#0969DA',
    guideColor: '#e1e4e8',
    headingColor: '#0D1117',
    preview: 'bg-[#F6F8FA]',
    isDark: false
  }
};

const STORAGE_KEY = 'outline-font-settings';

const RESTORED_THEME_KEY = 'outline-restored-theme';

export const useFontSettings = () => {
  const [settings, setSettings] = useState<FontSettings>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        let theme: Theme = parsed.theme || 'minimal';
        if (systemDark) {
          // 系统暗色时强制 dark，但保存用户的非 dark 偏好（用于切回亮色时恢复）
          if (theme !== 'dark') {
            localStorage.setItem(RESTORED_THEME_KEY, theme);
          }
          theme = 'dark';
        }
        return { fontSize: parsed.fontSize || 'medium', fontFamily: parsed.fontFamily || 'system', theme };
      } catch {
        // fallback to default
      }
    }
    // 无保存设置时，检测系统暗色模式
    return { fontSize: 'medium', fontFamily: 'system', theme: systemDark ? 'dark' : 'minimal' };
  });

  const [isOpen, setIsOpen] = useState(false);

  // 应用主题 CSS 变量和样式
  const applyTheme = (theme: typeof THEMES[Theme]) => {
    const root = document.documentElement;
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

    // 更新所有 theme-color meta 标签（包括 media query 的亮/暗版本和鸿蒙版本）
    const color = theme.isDark ? '#111827' : '#ffffff';
    document.querySelectorAll('meta[name="theme-color"], meta[name="hw-theme-color"]').forEach(meta => {
      meta.setAttribute('content', color);
    });

    window.dispatchEvent(new CustomEvent('theme-change'));
  };

  // 系统主题变化时，实时更新并保存设置
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      if (e.matches) {
        // 系统切到暗色 → 保存当前非 dark 偏好，强制暗色主题
        setSettings(prev => {
          if (prev.theme !== 'dark') {
            localStorage.setItem(RESTORED_THEME_KEY, prev.theme);
          }
          return { ...prev, theme: 'dark' };
        });
      } else {
        // 系统切到亮色 → 恢复之前保存的非 dark 主题
        const restored = localStorage.getItem(RESTORED_THEME_KEY) as Theme | null;
        setSettings(prev => ({
          ...prev,
          theme: restored && restored !== 'dark' ? restored : (prev.theme === 'dark' ? 'minimal' : prev.theme),
        }));
        localStorage.removeItem(RESTORED_THEME_KEY);
      }
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

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
    applyTheme(THEMES[settings.theme]);
  }, [settings]);

  const setFontSize = (fontSize: FontSize) => {
    setSettings(prev => ({ ...prev, fontSize }));
  };

  const setFontFamily = (fontFamily: FontFamily) => {
    setSettings(prev => ({ ...prev, fontFamily }));
  };

  const setTheme = (theme: Theme) => {
    setSettings(prev => ({ ...prev, theme }));
  };

  return {
    settings,
    setFontSize,
    setFontFamily,
    setTheme,
    isOpen,
    setIsOpen
  };
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
            {(Object.keys(THEMES) as Theme[]).map((theme) => (
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
                    {theme === 'minimal' && 'Workflowy 风格'}
                    {theme === 'warm' && 'Logseq 风格'}
                    {theme === 'dark' && 'Obsidian 风格'}
                    {theme === 'geek' && 'GitHub 风格'}
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
                {(Object.keys(THEMES) as Theme[]).map((theme) => (
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
                        {theme === 'minimal' && 'Workflowy 风格'}
                        {theme === 'warm' && 'Logseq 风格'}
                        {theme === 'dark' && 'Obsidian 风格'}
                        {theme === 'geek' && 'GitHub 风格'}
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
