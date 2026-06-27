/**
 * Widget Sync - 同步数据到 Android 桌面小组件
 */

import { Capacitor } from '@capacitor/core';

interface WidgetDataSync {
  serverUrl: string;
  token: string;
  todos?: string;
  diary?: string;
}

/**
 * 同步数据到原生小组件
 */
export async function syncDataToWidget(data: WidgetDataSync): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    return;
  }

  try {
    const widgetData = Capacitor.Plugins.WidgetData as any;
    if (widgetData && widgetData.syncForWidget) {
      await widgetData.syncForWidget({
        serverUrl: data.serverUrl,
        token: data.token,
        todos: data.todos || '[]',
        diary: data.diary || '',
      });
      console.log('Widget data synced successfully');
    }
  } catch (e) {
    console.warn('Failed to sync widget data:', e);
  }
}

/**
 * 在登录成功后调用，同步服务器地址和 token
 */
export async function syncAuthToWidget(serverUrl: string, token: string): Promise<void> {
  await syncDataToWidget({ serverUrl, token });
}

/**
 * 更新小组件的待办和日记数据
 */
export async function syncTodosAndDiaryToWidget(todos: any[], diary: string): Promise<void> {
  const serverUrl = localStorage.getItem('beaver_server_url') || '';
  const token = localStorage.getItem('token') || '';

  await syncDataToWidget({
    serverUrl,
    token,
    todos: JSON.stringify(todos),
    diary,
  });
}
