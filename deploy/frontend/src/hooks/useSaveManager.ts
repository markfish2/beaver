import { useState, useEffect, useCallback } from 'react';
import { saveStateManager } from '../utils/saveStateManager';

type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error' | 'offline';

export function useSaveManager() {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>(() => saveStateManager.getStatus());
  const [pendingCount, setPendingCount] = useState<number>(() => saveStateManager.getPendingCount());
  const [isOnline, setIsOnline] = useState<boolean>(() => saveStateManager.isOnline);
  const [offlineQueueCount, setOfflineQueueCount] = useState<number>(() => saveStateManager.getOfflineQueueCount());

  useEffect(() => {
    const updateState = () => {
      setSaveStatus(saveStateManager.getStatus());
      setPendingCount(saveStateManager.getPendingCount());
      setIsOnline(saveStateManager.isOnline);
      setOfflineQueueCount(saveStateManager.getOfflineQueueCount());
    };

    saveStateManager.subscribe(updateState);

    const handleOnline = () => {
      setIsOnline(true);
      saveStateManager.syncOfflineOperations();
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      saveStateManager.unsubscribe(updateState);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const markPending = useCallback((id: string, data: unknown, operationType?: string) => {
    saveStateManager.markPending(id, data, operationType);
  }, []);

  const markSaving = useCallback((id: string) => {
    saveStateManager.markSaving(id);
  }, []);

  const markSaved = useCallback((id: string) => {
    saveStateManager.markSaved(id);
  }, []);

  const markError = useCallback((id: string, error: string) => {
    saveStateManager.markError(id, error);
  }, []);

  const hasUnsavedChanges = useCallback(() => {
    return saveStateManager.hasUnsavedChanges();
  }, []);

  const syncOfflineOperations = useCallback(() => {
    return saveStateManager.syncOfflineOperations();
  }, []);

  return {
    saveStatus,
    pendingCount,
    markPending,
    markSaving,
    markSaved,
    markError,
    hasUnsavedChanges,
    isOnline,
    offlineQueueCount,
    syncOfflineOperations
  };
}

export type { SaveStatus };
