/**
 * 轻量全局 Toast 提示
 * 用法：showToast('发布成功')  showToast('删除失败', 'error')
 */

type ToastType = 'success' | 'error';

let container: HTMLDivElement | null = null;

function ensureContainer(): HTMLDivElement {
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.style.cssText =
      'position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:99999;display:flex;flex-direction:column;align-items:center;gap:8px;pointer-events:none;';
    document.body.appendChild(container);
  }
  return container;
}

export function showToast(message: string, type: ToastType = 'success') {
  const wrap = ensureContainer();
  const el = document.createElement('div');

  const bg =
    type === 'success'
      ? 'bg-gray-900 dark:bg-gray-100'
      : 'bg-red-500';

  const text =
    type === 'success'
      ? 'text-white dark:text-gray-900'
      : 'text-white';

  el.className = `${bg} ${text} px-4 py-2 rounded-lg text-sm font-medium shadow-lg transition-all duration-300`;
  el.style.opacity = '0';
  el.style.transform = 'translateY(-8px)';
  el.textContent = message;

  wrap.appendChild(el);

  // 触发动画
  requestAnimationFrame(() => {
    el.style.opacity = '1';
    el.style.transform = 'translateY(0)';
  });

  // 2 秒后消失
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(-8px)';
    setTimeout(() => el.remove(), 300);
  }, 2000);
}
