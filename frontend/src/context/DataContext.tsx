/**
 * 数据上下文
 *
 * 管理数据提供者的初始化和切换
 * 支持本地模式和远程模式
 */

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { Capacitor } from '@capacitor/core';
import type { DataProvider, DataMode } from '../data/provider';
import { LocalProvider } from '../data/local-provider';
import { RemoteProvider } from '../data/remote-provider';
import { useAuth } from './AuthContext';
import { setDataProvier } from '../api/data-adapter';

interface DataContextType {
  provider: DataProvider | null;
  mode: DataMode;
  isReady: boolean;
  error: string | null;
  showModeSelect: boolean;
  switchMode: (mode: DataMode, serverUrl?: string) => Promise<void>;
  resetMode: () => void;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export function DataProviderComponent({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [provider, setProvider] = useState<DataProvider | null>(null);
  const [showModeSelect, setShowModeSelect] = useState(() => {
    // 如果没有保存的模式，显示模式选择页面
    return !localStorage.getItem('dataMode');
  });
  const [mode, setMode] = useState<DataMode>(() => {
    // 从 localStorage 读取上次使用的模式
    const saved = localStorage.getItem('dataMode');
    return (saved as DataMode) || 'local';
  });
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 初始化数据提供者
  const initProvider = useCallback(async (targetMode: DataMode, serverUrl?: string) => {
    try {
      setError(null);
      setIsReady(false);

      let newProvider: DataProvider;

      if (targetMode === 'local') {
        newProvider = new LocalProvider();
      } else {
        newProvider = new RemoteProvider(serverUrl);
      }

      await newProvider.initialize();

      // 同步设置到 data-adapter
      setDataProvier(newProvider);

      setProvider(newProvider);
      setMode(targetMode);
      setIsReady(true);

      // 保存模式选择
      localStorage.setItem('dataMode', targetMode);
    } catch (e: any) {
      console.error('Failed to initialize data provider:', e);
      setError(e.message || '初始化失败');
      setIsReady(false);
    }
  }, []);

  // 切换模式
  const switchMode = useCallback(async (newMode: DataMode, serverUrl?: string) => {
    await initProvider(newMode, serverUrl);
    setShowModeSelect(false);
  }, [initProvider]);

  // 重置模式（显示模式选择页面）
  const resetMode = useCallback(() => {
    localStorage.removeItem('dataMode');
    setProvider(null);
    setIsReady(false);
    setShowModeSelect(true);
  }, []);

  // 初始加载
  useEffect(() => {
    if (!showModeSelect) {
      initProvider(mode);
    }
  }, [showModeSelect]);

  return (
    <DataContext.Provider value={{ provider, mode, isReady, error, showModeSelect, switchMode, resetMode }}>
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const context = useContext(DataContext);
  if (context === undefined) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
}

// 便捷 hooks
export function useDocuments() {
  const { provider } = useData();
  return provider;
}

export function useMemos() {
  const { provider } = useData();
  return provider;
}

export function useTodos() {
  const { provider } = useData();
  return provider;
}
