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
    document.documentElement.dataset.markdownStyle = saved.markdownStyle || 'default';

    // 只保留默认设计体系；dark 表示强制夜间，其他历史主题值归一为 system。
    if (saved.theme === 'dark') {
      const dark = true;
      document.documentElement.dataset.theme = 'dark';
      document.documentElement.classList.toggle('dark', dark);
      syncThemeChrome(dark);
      return;
    }

    // 没有明确选择或选择"跟随系统"→ 跟随系统
    const dark = mq.matches;
    document.documentElement.dataset.theme = dark ? 'system-dark' : 'system-light';
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
    document.documentElement.dataset.markdownStyle = saved.markdownStyle || 'default';
    if (saved.theme === 'dark') {
      const dark = true;
      document.documentElement.dataset.theme = 'dark';
      document.documentElement.classList.toggle('dark', dark);
      syncThemeChrome(dark);
      return;
    }
    const dark = mq.matches;
    document.documentElement.dataset.theme = dark ? 'system-dark' : 'system-light';
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

const DEV_SW_RESET_KEY = 'beaver-dev-sw-reset';

async function clearDevelopmentServiceWorker(): Promise<boolean> {
  if (!import.meta.env.DEV || !('serviceWorker' in navigator)) return true;

  try {
    const controlled = navigator.serviceWorker.controller !== null;
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map(registration => registration.unregister()));

    if ('caches' in window) {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map(cacheName => caches.delete(cacheName)));
    }

    // 已被旧开发 SW 控制的页面需要刷新一次，刷新后才会真正脱离控制。
    if (controlled && sessionStorage.getItem(DEV_SW_RESET_KEY) !== 'done') {
      sessionStorage.setItem(DEV_SW_RESET_KEY, 'done');
      window.location.reload();
      return false;
    }
    sessionStorage.removeItem(DEV_SW_RESET_KEY);
  } catch (error) {
    console.warn('清理开发 Service Worker 失败，继续启动应用', error);
  }

  return true;
}

// 图标按钮不显示悬浮提示；文字按钮保留主题化的提示。
{
  const SHOW_DELAY = 400;
  let tooltipEl: HTMLDivElement | null = null;
  let activeTarget: HTMLElement | null = null;
  let showTimer = 0;

  function ensureTooltip(): HTMLDivElement {
    if (!tooltipEl) {
      tooltipEl = document.createElement('div');
      tooltipEl.className = 'beaver-tooltip';
      document.body.appendChild(tooltipEl);
    }
    return tooltipEl;
  }

  function isIconOnly(el: HTMLElement): boolean {
    return Boolean(el.querySelector('svg, [data-icon]')) && !el.textContent?.trim();
  }

  function hideTooltip(): void {
    window.clearTimeout(showTimer);
    activeTarget = null;
    tooltipEl?.classList.remove('visible');
  }

  document.addEventListener('mouseover', (e) => {
    const el = (e.target as HTMLElement).closest('[title]') as HTMLElement | null;
    if (!el) return;
    const title = el.getAttribute('title') ?? '';
    if (!el.getAttribute('aria-label') && title) el.setAttribute('aria-label', title);
    el.removeAttribute('title');

    if (isIconOnly(el)) return;
    activeTarget = el;
    window.clearTimeout(showTimer);
    showTimer = window.setTimeout(() => {
      if (activeTarget !== el) return;
      const tip = ensureTooltip();
      tip.textContent = title;
      tip.style.left = `${e.clientX + 12}px`;
      tip.style.top = `${e.clientY + 12}px`;
      tip.classList.add('visible');
    }, SHOW_DELAY);
  });

  document.addEventListener('mousemove', (e) => {
    if (!activeTarget || !tooltipEl?.classList.contains('visible')) return;
    tooltipEl.style.left = `${e.clientX + 12}px`;
    tooltipEl.style.top = `${e.clientY + 12}px`;
  });

  document.addEventListener('mouseout', (e) => {
    const el = (e.target as HTMLElement).closest('[aria-label]') as HTMLElement | null;
    if (el && el === activeTarget && !el.matches(':hover')) hideTooltip();
  });
}

void clearDevelopmentServiceWorker().then(shouldRender => {
  if (!shouldRender) return;
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
