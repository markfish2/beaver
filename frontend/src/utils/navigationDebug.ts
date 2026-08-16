const NAVIGATION_DEBUG_KEY = 'beaver-navigation-debug';

type NavigationDetails = Record<string, unknown>;

export function isNavigationDebugEnabled(): boolean {
  try {
    // 默认开启，便于定位生产/本地导航故障；设置为 0 可关闭。
    return localStorage.getItem(NAVIGATION_DEBUG_KEY) !== '0';
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
