const NAVIGATION_DEBUG_KEY = 'beaver-navigation-debug';

type NavigationDetails = Record<string, unknown>;

export function isNavigationDebugEnabled(): boolean {
  try {
    // 生产环境默认关闭高频导航日志；需要排查问题时设置为 1 临时开启。
    const configured = localStorage.getItem(NAVIGATION_DEBUG_KEY);
    return configured === '1' || (configured === null && import.meta.env.DEV);
  } catch {
    return false;
  }
}

export function logNavigation(event: string, details: NavigationDetails = {}): void {
  if (!isNavigationDebugEnabled()) return;
  console.info(`[navigation-debug] ${event}`, {
    time: new Date().toISOString(),
    path: `${window.location.pathname}${window.location.search}`,
    ...details,
  });
}
