import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { syncThemeChrome } from './utils/themeChrome.ts'

// 系统暗色模式检测 + 监听系统主题变化
// iOS PWA standalone 模式下首次加载 prefers-color-scheme 可能返回错误值
// 通过延迟重新检测来修复
(function initDarkMode() {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  let lastDark = mq.matches;

  function applyTheme() {
    const saved = (() => { try { return JSON.parse(localStorage.getItem('outline-font-settings') || '{}'); } catch { return {}; } })();

    // 明确主题优先；system 才跟随设备。
    if (saved.theme && saved.theme !== 'system') {
      const dark = saved.theme === 'dark';
      document.documentElement.dataset.theme = saved.theme;
      document.documentElement.classList.toggle('dark', dark);
      syncThemeChrome(dark);
      return;
    }

    // 没有明确选择或选择"跟随系统"→ 跟随系统
    const dark = mq.matches;
    document.documentElement.dataset.theme = dark ? 'dark' : 'minimal';
    if (dark !== lastDark) {
      lastDark = dark;
      document.documentElement.classList.toggle('dark', dark);
      syncThemeChrome(dark);
      window.dispatchEvent(new Event('theme-change'));
    }
  }

  // 初始应用
  function initialApply() {
    const saved = (() => { try { return JSON.parse(localStorage.getItem('outline-font-settings') || '{}'); } catch { return {}; } })();
    if (saved.theme && saved.theme !== 'system') {
      const dark = saved.theme === 'dark';
      document.documentElement.dataset.theme = saved.theme;
      document.documentElement.classList.toggle('dark', dark);
      syncThemeChrome(dark);
      return;
    }
    const dark = mq.matches;
    document.documentElement.dataset.theme = dark ? 'dark' : 'minimal';
    lastDark = dark;
    document.documentElement.classList.toggle('dark', dark);
    syncThemeChrome(dark);
  }

  initialApply();

  // iOS PWA 修复：延迟重新检测，纠正首次加载时的错误值
  setTimeout(() => {
    applyTheme();
  }, 500);
  setTimeout(() => {
    applyTheme();
  }, 2000);

  // 监听系统主题变化
  mq.addEventListener('change', applyTheme);
})();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
