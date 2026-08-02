import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Settings2, Palette } from 'lucide-react';
import { updateSettings } from '../api/auth';
import { useAuth } from '../context/AuthContext';
import { showToast } from '../utils/toast';
import { syncThemeChrome } from '../utils/themeChrome';

type FontSize = 'small' | 'medium' | 'large';
type FontFamily = 'system' | 'sans' | 'serif' | 'mono';
type Theme = 'system' | 'dark';
type MarkdownStyle = 'default' | 'pie' | 'markamd' | 'lapis';

interface FontSettings {
  fontSize: FontSize;
  fontFamily: FontFamily;
  theme: Theme;
  markdownStyle: MarkdownStyle;
}

const FONT_SIZE_MAP: Record<FontSize, string> = {
  small: '12px',
  medium: '14px',
  large: '16px'
};

const FONT_FAMILY_MAP: Record<FontFamily, string> = {
  system: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei UI", "Microsoft YaHei", "Noto Sans CJK SC", "Noto Sans CJK", "WenQuanYi Micro Hei", "Ubuntu", Arial, sans-serif',
  sans: '"Noto Sans CJK SC", "Noto Sans CJK", "Source Han Sans SC", "Source Han Sans CN", "WenQuanYi Micro Hei", "Microsoft YaHei UI", "Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", "Heiti SC", "Droid Sans Fallback", Arial, sans-serif',
  serif: '"Noto Serif CJK SC", "Noto Serif CJK", "Source Han Serif SC", "Source Han Serif CN", "Songti SC", "STSong", "SimSun", "FangSong", "AR PL UMing CN", "AR PL SungtiL GB", "WenQuanYi Bitmap Song", serif',
  mono: '"Sarasa Mono SC", "Sarasa Gothic SC", "Noto Sans Mono CJK SC", "Noto Sans Mono CJK", "Source Han Mono SC", "Source Han Mono CN", "Microsoft YaHei Mono", "Cascadia Mono", "SFMono-Regular", Consolas, "Liberation Mono", "DejaVu Sans Mono", monospace'
};

const FONT_SIZE_LABELS: Record<FontSize, string> = {
  small: '紧凑',
  medium: '标准',
  large: '舒展'
};

const FONT_FAMILY_LABELS: Record<FontFamily, string> = {
  system: '系统默认',
  sans: '现代黑体',
  serif: '传统宋体',
  mono: '等宽代码'
};

const FONT_FAMILY_DESCRIPTIONS: Record<FontFamily, string> = {
  system: '跟随当前设备的默认界面字体',
  sans: '优先使用 Noto/思源/雅黑/苹方等清晰黑体',
  serif: '优先使用 Noto/思源/宋体等阅读衬线字体',
  mono: '优先使用等宽字体，适合代码和结构化内容'
};

const FONT_FAMILY_PREVIEW_TEXT: Record<FontFamily, string> = {
  system: '系统 Aa 123',
  sans: '黑体 Aa 123',
  serif: '宋体 Aa 123',
  mono: 'Mono Aa 123'
};

const MARKDOWN_STYLE_LABELS: Record<MarkdownStyle, { name: string; description: string; preview: string }> = {
  default: {
    name: '默认',
    description: '适合日常记录，和当前 Memo 风格一致',
    preview: 'Aa',
  },
  pie: {
    name: 'Pie 学术',
    description: '参考 academic：衬线正文、红棕链接、论文式表格与引用',
    preview: 'π',
  },
  markamd: {
    name: 'Marka.md',
    description: '参考 marka.md：清爽标题线、橙色强调、轻量代码与引用',
    preview: 'Md',
  },
  lapis: {
    name: 'Lapis',
    description: '参考 Typora Lapis：蓝灰衬线标题、浅色代码块与论文式排版',
    preview: 'La',
  },
};

const normalizeTheme = (theme: unknown): Theme => theme === 'dark' ? 'dark' : 'system';
const normalizeFontFamily = (fontFamily: unknown): FontFamily => {
  switch (fontFamily) {
    case 'sans':
    case 'system':
      return fontFamily;
    case 'serif':
    case 'syst':
    case 'fangsong':
    case 'kaiti':
      return 'serif';
    case 'mono':
      return 'mono';
    case 'yahei':
    case 'pingfang':
      return 'sans';
    default:
      return 'system';
  }
};

// 全局主题只保留默认设计体系；theme 仅表示跟随系统或强制夜间模式。
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
    name: '系统默认',
    bg: '#FAF9F5',
    text: '#111827',
    secondaryText: '#6B7280',
    accent: '#3F587F',
    guideColor: '#e5e7eb',
    headingColor: '#111111',
    preview: 'bg-gradient-to-r from-white to-[#111827]',
    isDark: false
  },
  dark: {
    name: '系统默认 · 夜间',
    bg: '#111827',
    text: '#F3F4F6',
    secondaryText: '#9CA3AF',
    accent: '#8EA4BB',
    guideColor: '#374151',
    headingColor: '#FFFFFF',
    preview: 'bg-[#111827]',
    isDark: true
  }
};

const STORAGE_KEY = 'outline-font-settings';

interface AppearanceContextValue {
  settings: FontSettings;
  setFontSize: (fontSize: FontSize) => void;
  setFontFamily: (fontFamily: FontFamily) => void;
  setTheme: (theme: Theme) => void;
  setMarkdownStyle: (style: MarkdownStyle) => void;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

const AppearanceStateProvider = ({
  children,
  accountSettings,
  onSettingsPersisted,
}: {
  children: ReactNode;
  accountSettings?: FontSettings;
  onSettingsPersisted?: (user: Awaited<ReturnType<typeof updateSettings>>) => void;
}) => {
  const [settings, setSettings] = useState<FontSettings>(() => {
    if (accountSettings) return accountSettings;
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const theme = normalizeTheme(parsed.theme);
        return {
          fontSize: parsed.fontSize || 'medium',
          fontFamily: normalizeFontFamily(parsed.fontFamily),
          theme,
          markdownStyle: parsed.markdownStyle || 'default',
        };
      } catch {
        // fallback to default
      }
    }
    // 无保存设置时，检测系统暗色模式
    return { fontSize: 'medium', fontFamily: 'system', theme: 'system', markdownStyle: 'default' };
  });

  const [isOpen, setIsOpen] = useState(false);

  // 应用主题 CSS 变量和样式
  const applyTheme = useCallback((themeKey: Theme) => {
    const systemDark = themeKey === 'system'
      && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const resolvedKey = themeKey === 'system'
      ? (systemDark ? 'system-dark' : 'system-light')
      : themeKey;
    const theme = systemDark
      ? {
          ...THEMES.system,
          bg: '#111827',
          text: '#F3F4F6',
          secondaryText: '#9CA3AF',
          accent: '#8EA4BB',
          guideColor: '#374151',
          headingColor: '#FFFFFF',
          isDark: true,
        }
      : THEMES[themeKey];
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

    syncThemeChrome(theme.isDark);

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
    root.style.setProperty('--prose-font-family', FONT_FAMILY_MAP[settings.fontFamily]);
    root.dataset.markdownStyle = settings.markdownStyle;

    // 应用字体到 body
    document.body.style.fontSize = FONT_SIZE_MAP[settings.fontSize];
    document.body.style.fontFamily = FONT_FAMILY_MAP[settings.fontFamily];
    document.body.style.lineHeight = '1.6';
    document.body.style.fontWeight = '400';

    // 应用主题颜色
    applyTheme(settings.theme);
  }, [applyTheme, settings]);

  const persist = useCallback(async (next: Partial<{ theme: Theme; font_family: FontFamily; font_size: FontSize; markdown_style: MarkdownStyle }>) => {
    try {
      const updatedUser = await updateSettings(next);
      onSettingsPersisted?.(updatedUser);
    } catch {
      showToast('外观设置同步失败，已保存在当前设备', 'error');
    }
  }, [onSettingsPersisted]);

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

  const setMarkdownStyle = useCallback((markdownStyle: MarkdownStyle) => {
    setSettings(prev => ({ ...prev, markdownStyle }));
    void persist({ markdown_style: markdownStyle });
  }, [persist]);

  const value = useMemo(() => ({
    settings,
    setFontSize,
    setFontFamily,
    setTheme,
    setMarkdownStyle,
    isOpen,
    setIsOpen
  }), [isOpen, setFontFamily, setFontSize, setMarkdownStyle, setTheme, settings]);

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
};

export const AppearanceProvider = ({ children }: { children: ReactNode }) => {
  const { user, applyUser } = useAuth();
  useEffect(() => {
    if (!user?.theme || user.theme === 'system' || user.theme === 'dark') return;
    void updateSettings({ theme: 'system' })
      .then(applyUser)
      .catch(() => {
        // 保留前端归一化结果；下次用户修改外观时会再次同步。
      });
  }, [applyUser, user?.theme]);

  useEffect(() => {
    if (!user?.font_family) return;
    const normalized = normalizeFontFamily(user.font_family);
    if (normalized === user.font_family) return;
    void updateSettings({ font_family: normalized })
      .then(applyUser)
      .catch(() => {
        // 本地会先按归一化字体渲染；账号同步失败时保留当前设备效果。
      });
  }, [applyUser, user?.font_family]);

  const accountSettings = user ? {
    theme: normalizeTheme(user.theme),
    fontFamily: normalizeFontFamily(user.font_family),
    fontSize: (user.font_size as FontSize) || 'medium',
    markdownStyle: (user.markdown_style as MarkdownStyle) || 'default',
  } : undefined;
  const accountKey = user
    ? `${user.id}:${user.theme}:${user.font_family}:${user.font_size}:${user.markdown_style}`
    : 'local';

  return (
    <AppearanceStateProvider key={accountKey} accountSettings={accountSettings} onSettingsPersisted={applyUser}>
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
  setMarkdownStyle: (style: MarkdownStyle) => void;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  hideButton?: boolean;
}

const GlobalThemeInfo = () => (
  <div className="mb-5">
    <div className="flex items-center gap-2 mb-3">
      <Palette className="w-4 h-4 text-gray-500" />
      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
        全局主题
      </label>
    </div>
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-300">
      系统默认主题。日间/夜间模式由系统或顶部切换按钮控制；Markdown 解析风格可单独选择。
    </div>
  </div>
);

const MarkdownStyleSection = ({
  value,
  onChange,
}: {
  value: MarkdownStyle;
  onChange: (style: MarkdownStyle) => void;
}) => (
  <div className="mb-4">
    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
      Markdown 解析风格
    </label>
    <div className="grid grid-cols-2 gap-2">
      {(Object.keys(MARKDOWN_STYLE_LABELS) as MarkdownStyle[]).map((style) => {
        const item = MARKDOWN_STYLE_LABELS[style];
        return (
          <button
            key={style}
            onClick={() => onChange(style)}
            className={`flex items-center gap-3 rounded-lg border-2 p-3 text-left transition-all ${
              value === style
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                : 'border-transparent bg-gray-50 dark:bg-gray-800/60 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md border text-lg ${
              style === 'pie'
                ? 'border-[#6f2d22]/30 bg-[#fbfaf6] font-serif text-[#9a1f12]'
                : style === 'markamd'
                  ? 'border-[#fe640b]/30 bg-[#eff1f5] font-mono text-[#fe640b] dark:border-[#fab387]/30 dark:bg-[#1e1e2e] dark:text-[#fab387]'
                  : style === 'lapis'
                    ? 'border-[#a2b6d4]/50 bg-[#f6f8fa] font-serif text-[#4870ac] dark:border-[#47556d] dark:bg-[#1e222a] dark:text-[#abbad4]'
                    : 'border-gray-200 bg-white text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200'
            }`}>
              {item.preview}
            </span>
            <span className="min-w-0">
              <span className="block text-xs font-medium text-gray-800 dark:text-gray-200">{item.name}</span>
              <span className="mt-0.5 block text-[10px] leading-snug text-gray-500 dark:text-gray-400">{item.description}</span>
            </span>
          </button>
        );
      })}
    </div>
  </div>
);

export const FontSettingsPanel = ({
  settings,
  setFontSize,
  setFontFamily,
  setMarkdownStyle,
  isOpen,
  setIsOpen,
  hideButton = false,
}: FontSettingsPanelProps) => {
  if (hideButton) {
    // Render content only (for use inside other menus)
    return (
      <div>
        <GlobalThemeInfo />

        <MarkdownStyleSection value={settings.markdownStyle} onChange={setMarkdownStyle} />

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
                <span className="flex items-center justify-between gap-3">
                  <span>
                    <span className="block">{FONT_FAMILY_LABELS[family]}</span>
                    <span className="block text-[11px] opacity-70 mt-0.5">{FONT_FAMILY_DESCRIPTIONS[family]}</span>
                  </span>
                  <span className="shrink-0 text-xs opacity-80">{FONT_FAMILY_PREVIEW_TEXT[family]}</span>
                </span>
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
            <GlobalThemeInfo />

            <div className="border-t border-gray-200 dark:border-gray-700 my-4" />

            <MarkdownStyleSection value={settings.markdownStyle} onChange={setMarkdownStyle} />

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
                    <span className="flex items-center justify-between gap-3">
                      <span>
                        <span className="block">{FONT_FAMILY_LABELS[family]}</span>
                        <span className="block text-[11px] opacity-70 mt-0.5">{FONT_FAMILY_DESCRIPTIONS[family]}</span>
                      </span>
                      <span className="shrink-0 text-xs opacity-80">{FONT_FAMILY_PREVIEW_TEXT[family]}</span>
                    </span>
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
