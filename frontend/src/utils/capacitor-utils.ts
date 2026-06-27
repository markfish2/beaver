/**
 * Capacitor 原生工具函数
 *
 * 提供 APP 原生功能的统一接口
 */

import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Keyboard } from '@capacitor/keyboard';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Network } from '@capacitor/network';
import { Share } from '@capacitor/share';
import { Clipboard } from '@capacitor/clipboard';

const isNative = Capacitor.isNativePlatform();

// ─── 状态栏 ──────────────────────────────────────────────

export async function setStatusBarStyle(dark: boolean): Promise<void> {
  if (!isNative) return;
  try {
    await StatusBar.setStyle({
      style: dark ? Style.Dark : Style.Light,
    });
    await StatusBar.setBackgroundColor({
      color: dark ? '#111827' : '#ffffff',
    });
  } catch (e) {
    console.warn('StatusBar not available:', e);
  }
}

// ─── 键盘 ────────────────────────────────────────────────

export function onKeyboardShow(callback: (height: number) => void): () => void {
  if (!isNative) return () => {};
  const listener = Keyboard.addListener('keyboardWillShow', (info) => {
    callback(info.keyboardHeight);
  });
  return () => listener.remove();
}

export function onKeyboardHide(callback: () => void): () => void {
  if (!isNative) return () => {};
  const listener = Keyboard.addListener('keyboardWillHide', () => {
    callback();
  });
  return () => listener.remove();
}

export async function hideKeyboard(): Promise<void> {
  if (!isNative) return;
  await Keyboard.hide();
}

// ─── 触觉反馈 ─────────────────────────────────────────────

export async function hapticImpact(style: 'light' | 'medium' | 'heavy' = 'light'): Promise<void> {
  if (!isNative) return;
  try {
    const impactStyle = style === 'heavy' ? ImpactStyle.Heavy
      : style === 'medium' ? ImpactStyle.Medium
      : ImpactStyle.Light;
    await Haptics.impact({ style: impactStyle });
  } catch (e) {
    // Haptics not available
  }
}

export async function hapticNotification(type: 'success' | 'warning' | 'error'): Promise<void> {
  if (!isNative) return;
  try {
    await Haptics.notification({ type: type as any });
  } catch (e) {
    // Haptics not available
  }
}

export async function hapticSelection(): Promise<void> {
  if (!isNative) return;
  try {
    await Haptics.selectionStart();
  } catch (e) {
    // Haptics not available
  }
}

// ─── 网络状态 ─────────────────────────────────────────────

export async function isOnline(): Promise<boolean> {
  if (!isNative) return navigator.onLine;
  try {
    const status = await Network.getStatus();
    return status.connected;
  } catch (e) {
    return navigator.onLine;
  }
}

export function onNetworkChange(callback: (connected: boolean) => void): () => void {
  if (!isNative) {
    const handler = () => callback(navigator.onLine);
    window.addEventListener('online', handler);
    window.addEventListener('offline', handler);
    return () => {
      window.removeEventListener('online', handler);
      window.removeEventListener('offline', handler);
    };
  }
  const listener = Network.addListener('networkStatusChange', (status) => {
    callback(status.connected);
  });
  return () => listener.remove();
}

// ─── 分享 ─────────────────────────────────────────────────

export async function shareContent(title: string, text?: string, url?: string): Promise<boolean> {
  if (!isNative) {
    // Web Share API
    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
        return true;
      } catch (e) {
        return false;
      }
    }
    return false;
  }
  try {
    await Share.share({ title, text, url });
    return true;
  } catch (e) {
    return false;
  }
}

// ─── 剪贴板 ───────────────────────────────────────────────

export async function copyToClipboard(text: string): Promise<boolean> {
  if (!isNative) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      return false;
    }
  }
  try {
    await Clipboard.write({ string: text });
    return true;
  } catch (e) {
    return false;
  }
}

export async function readFromClipboard(): Promise<string> {
  if (!isNative) {
    try {
      return await navigator.clipboard.readText();
    } catch (e) {
      return '';
    }
  }
  try {
    const result = await Clipboard.read();
    return result.value;
  } catch (e) {
    return '';
  }
}

// ─── 平台检测 ─────────────────────────────────────────────

export function getPlatform(): 'ios' | 'android' | 'web' {
  return Capacitor.getPlatform() as 'ios' | 'android' | 'web';
}

export function isNativePlatform(): boolean {
  return isNative;
}

export function isIOS(): boolean {
  return Capacitor.getPlatform() === 'ios';
}

export function isAndroid(): boolean {
  return Capacitor.getPlatform() === 'android';
}
