import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// 系统暗色模式检测 + 监听系统主题变化
// iOS PWA standalone 模式下首次加载 prefers-color-scheme 可能返回错误值
// 通过延迟重新检测来修复
(function initDarkMode() {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  let lastDark = mq.matches;

  function applyTheme() {
    const saved = (() => { try { return JSON.parse(localStorage.getItem('outline-font-settings') || '{}'); } catch { return {}; } })();

    // 如果用户明确选择了主题（非 system/跟随系统），尊重用户选择
    if (saved.theme === 'dark' || saved.theme === 'light') {
      const dark = saved.theme === 'dark';
      document.documentElement.classList.toggle('dark', dark);
      document.querySelectorAll('meta[name="theme-color"]').forEach(meta => {
        meta.setAttribute('content', dark ? '#111827' : '#ffffff');
      });
      return;
    }

    // 没有明确选择或选择"跟随系统"→ 跟随系统
    const dark = mq.matches;
    if (dark !== lastDark) {
      lastDark = dark;
      document.documentElement.classList.toggle('dark', dark);
      document.querySelectorAll('meta[name="theme-color"]').forEach(meta => {
        meta.setAttribute('content', dark ? '#111827' : '#ffffff');
      });
      window.dispatchEvent(new Event('theme-change'));
    }
  }

  // 初始应用
  function initialApply() {
    const saved = (() => { try { return JSON.parse(localStorage.getItem('outline-font-settings') || '{}'); } catch { return {}; } })();
    if (saved.theme === 'dark' || saved.theme === 'light') {
      const dark = saved.theme === 'dark';
      document.documentElement.classList.toggle('dark', dark);
      document.querySelectorAll('meta[name="theme-color"]').forEach(meta => {
        meta.setAttribute('content', dark ? '#111827' : '#ffffff');
      });
      return;
    }
    const dark = mq.matches;
    lastDark = dark;
    document.documentElement.classList.toggle('dark', dark);
    document.querySelectorAll('meta[name="theme-color"]').forEach(meta => {
      meta.setAttribute('content', dark ? '#111827' : '#ffffff');
    });
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
