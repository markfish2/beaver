// 必须与应用最顶部的画布背景保持一致。状态栏和页面背景存在色差时，
// Chrome PWA 在顶部栏隐藏后会把两者之间渲染成一条分隔线。
const LIGHT_CHROME_COLOR = '#f7f6f2';
const DARK_CHROME_COLOR = '#262624';

export function syncThemeChrome(isDark: boolean): void {
  const color = isDark ? DARK_CHROME_COLOR : LIGHT_CHROME_COLOR;
  const root = document.documentElement;

  root.style.colorScheme = isDark ? 'dark' : 'light';
  root.style.setProperty('--app-status-bar-color', color);

  // 与 Memos 一致：始终保持单一、不透明的 theme-color，不在滚动时切换 transparent。
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach(meta => {
    meta.content = color;
    meta.removeAttribute('media');
  });

}
