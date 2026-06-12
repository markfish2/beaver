import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// 系统暗色模式检测：仅做初始检测，后续由 FontSettings 接管
(function initDarkMode() {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const saved = (() => { try { return JSON.parse(localStorage.getItem('outline-font-settings') || '{}'); } catch { return {}; } })();

  // 如果用户之前明确选择了非 dark 主题，且系统当前是亮色，尊重用户选择
  const dark = saved.theme === 'dark' ? mq.matches : (saved.theme && !mq.matches ? false : mq.matches);
  document.documentElement.classList.toggle('dark', dark);

  // 同步两个 theme-color meta 标签
  document.querySelectorAll('meta[name="theme-color"]').forEach(meta => {
    meta.setAttribute('content', dark ? '#111827' : '#ffffff');
  });
})();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
