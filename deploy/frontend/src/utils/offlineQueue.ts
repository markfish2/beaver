import { saveStateManager } from './saveStateManager';

/**
 * Wraps an API mutation with offline queueing.
 * If offline, queues the operation and returns the fallback.
 * If online, executes the API call normally.
 */
export async function withOfflineSupport<T>(
  operationType: string,
  operationId: string,
  operationData: Record<string, unknown>,
  apiCall: () => Promise<T>,
  fallback: T
): Promise<T> {
  if (!navigator.onLine) {
    saveStateManager.markPending(operationId, { ...operationData, operationType }, operationType);
    return fallback;
  }
  try {
    saveStateManager.markSaving(operationId);
    const result = await apiCall();
    saveStateManager.markSaved(operationId);
    return result;
  } catch (error) {
    saveStateManager.markError(operationId, error instanceof Error ? error.message : 'Unknown error');
    throw error;
  }
}
