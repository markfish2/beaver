import { useState, useEffect } from 'react';

function checkDark() {
  try {
    const saved = localStorage.getItem('outline-font-settings');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.theme === 'dark') return true;
      if (parsed.theme && parsed.theme !== 'dark') return false;
    }
  } catch { /* ignore parse error */ }
  return document.documentElement.classList.contains('dark') || window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function useIsDark() {
  const [isDark, setIsDark] = useState(checkDark);
  useEffect(() => {
    const update = () => setIsDark(checkDark());
    window.addEventListener('theme-change', update);
    const obs = new MutationObserver(update);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', update);
    return () => {
      window.removeEventListener('theme-change', update);
      obs.disconnect();
      mq.removeEventListener('change', update);
    };
  }, []);
  return isDark;
}
