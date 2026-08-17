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

// ── 自定义 title tooltip：胶囊形状 + 主题绿色 + 跟随鼠标右下角 ──
// 行为参考原生 tooltip：hover 停留后显示，鼠标移动时保持可见，静止后自动消失，移出立刻消失
{
  const SHOW_DELAY = 400;   // hover 后延迟显示（与原生一致）
  const IDLE_HIDE = 2500;   // 鼠标静止后自动隐藏（与原生一致）

  let tooltipEl: HTMLDivElement | null = null;
  let activeTarget: HTMLElement | null = null;
  let showTimer = 0;
  let idleTimer = 0;
  let mouseX = 0;
  let mouseY = 0;

  function ensureTooltip(): HTMLDivElement {
    if (!tooltipEl) {
      tooltipEl = document.createElement('div');
      tooltipEl.className = 'beaver-tooltip';
      document.body.appendChild(tooltipEl);
    }
    return tooltipEl;
  }

  function show(target: HTMLElement) {
    const tip = ensureTooltip();
    tip.textContent = target.dataset.tooltip ?? '';
    tip.style.left = `${mouseX + 12}px`;
    tip.style.top = `${mouseY + 12}px`;
    tip.classList.add('visible');
    resetIdleTimer();
  }

  function hide() {
    window.clearTimeout(idleTimer);
    if (tooltipEl) tooltipEl.classList.remove('visible');
  }

  function resetIdleTimer() {
    window.clearTimeout(idleTimer);
    idleTimer = window.setTimeout(hide, IDLE_HIDE);
  }

  document.addEventListener('mouseover', (e) => {
    const me = e as MouseEvent;
    const el = (me.target as HTMLElement).closest('[title]') as HTMLElement | null;
    if (!el) return;
    el.dataset.tooltip = el.getAttribute('title') ?? '';
    el.removeAttribute('title');
    activeTarget = el;
    mouseX = me.clientX;
    mouseY = me.clientY;
    window.clearTimeout(showTimer);
    showTimer = window.setTimeout(() => { if (activeTarget === el) show(el); }, SHOW_DELAY);
  });

  document.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
    if (!activeTarget) return;
    // 鼠标在动 → 更新位置 + 重置静止计时
    if (tooltipEl?.classList.contains('visible')) {
      tooltipEl.style.left = `${mouseX + 12}px`;
      tooltipEl.style.top = `${mouseY + 12}px`;
      resetIdleTimer();
    }
  });

  document.addEventListener('mouseout', (e) => {
    const el = (e.target as HTMLElement).closest('[data-tooltip]') as HTMLElement | null;
    if (!el) return;
    el.setAttribute('title', el.dataset.tooltip ?? '');
    delete el.dataset.tooltip;
    if (activeTarget === el) {
      activeTarget = null;
      window.clearTimeout(showTimer);
      hide();
    }
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
