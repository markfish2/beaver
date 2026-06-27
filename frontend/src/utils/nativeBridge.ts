/**
 * Native Bridge - 通过 JavaScript 接口直接保存数据到 Android SharedPreferences
 */

declare global {
  interface Window {
    NativeBridge?: {
      saveData: (key: string, value: string) => void;
      getData: (key: string) => string;
      notifyWidgetUpdate: () => void;
    };
  }
}

/**
 * 保存数据到原生 SharedPreferences
 */
export function saveToNative(key: string, value: string): void {
  if (window.NativeBridge) {
    window.NativeBridge.saveData(key, value);
    console.log(`Saved to native: ${key}`);
  } else {
    console.warn('NativeBridge not available');
  }
}

/**
 * 从原生 SharedPreferences 读取数据
 */
export function getFromNative(key: string): string | null {
  if (window.NativeBridge) {
    const value = window.NativeBridge.getData(key);
    return value || null;
  }
  return null;
}

/**
 * 通知小组件更新
 */
export function notifyWidgetUpdate(): void {
  if (window.NativeBridge) {
    window.NativeBridge.notifyWidgetUpdate();
  }
}

/**
 * 登录成功后同步数据到原生层
 */
export function syncAuthToNative(serverUrl: string, token: string): void {
  saveToNative('serverUrl', serverUrl);
  saveToNative('token', token);
  notifyWidgetUpdate();
}
