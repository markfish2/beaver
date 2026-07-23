export type MobileTabTarget = 'memos' | 'diary' | 'files' | 'ai';

export interface MobileNavigationState {
  mobileReturnTo?: string;
  mobileReturnTab?: MobileTabTarget;
}

export type MobileBackTarget =
  | { kind: 'route'; to: string; tab?: MobileTabTarget }
  | { kind: 'history' };

function isInternalPath(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//');
}

export function getMobileTabFromState(state: unknown): MobileTabTarget | undefined {
  if (!state || typeof state !== 'object') return undefined;
  const tab = (state as MobileNavigationState).mobileReturnTab;
  return tab === 'memos' || tab === 'diary' || tab === 'files' || tab === 'ai'
    ? tab
    : undefined;
}

export function createMobileDocumentState(
  returnTo: string,
  returnTab?: MobileTabTarget,
): MobileNavigationState {
  return {
    mobileReturnTo: isInternalPath(returnTo) ? returnTo : '/',
    ...(returnTab ? { mobileReturnTab: returnTab } : {}),
  };
}

export function resolveMobileBackTarget(
  locationKey: string,
  state: unknown,
  historyLength: number,
): MobileBackTarget {
  const navigationState = state && typeof state === 'object'
    ? state as MobileNavigationState
    : null;

  if (navigationState && isInternalPath(navigationState.mobileReturnTo)) {
    return {
      kind: 'route',
      to: navigationState.mobileReturnTo,
      tab: getMobileTabFromState(navigationState),
    };
  }

  // React Router 为直接打开或刷新后的首个条目使用 "default" key。
  // 只有明确存在应用内路由记录时才后退，避免退出 PWA 或跳到外部站点。
  if (locationKey !== 'default' && historyLength > 1) {
    return { kind: 'history' };
  }

  return { kind: 'route', to: '/', tab: 'memos' };
}
