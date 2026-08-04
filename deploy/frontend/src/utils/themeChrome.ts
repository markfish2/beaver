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
