const LIGHT_CHROME_COLOR = '#ffffff';
const DARK_CHROME_COLOR = '#111827';

export function syncThemeChrome(isDark: boolean): void {
  const color = isDark ? DARK_CHROME_COLOR : LIGHT_CHROME_COLOR;
  const root = document.documentElement;

  root.style.colorScheme = isDark ? 'dark' : 'light';
  root.style.setProperty('--app-status-bar-color', color);

  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"], meta[name="hw-theme-color"]').forEach(meta => {
    meta.content = color;
    meta.removeAttribute('media');
  });

  document.querySelectorAll<HTMLMetaElement>('meta[name="apple-mobile-web-app-status-bar-style"]').forEach(meta => {
    meta.content = isDark ? 'black-translucent' : 'default';
  });
}

/**
 * 在支持动态 theme-color 的移动浏览器/PWA 中，尽量让系统栏与页面背景融合。
 * 不支持的平台会忽略该提示，页面仍保持正常的主题色回退。
 */
export function setMobileStatusBarOverlay(enabled: boolean): void {
  const root = document.documentElement;
  const fallback = root.style.getPropertyValue('--app-status-bar-color') || LIGHT_CHROME_COLOR;
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"], meta[name="hw-theme-color"]').forEach(meta => {
    meta.content = enabled ? 'transparent' : fallback;
  });
}
