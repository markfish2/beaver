type OperationStatus = 'pending' | 'saving' | 'saved' | 'error';

interface PendingOperation {
  id: string;
  status: OperationStatus;
  data: unknown;
  timestamp: number;
  error?: string;
  retryCount?: number;
  operationType?: string;
}

const STORAGE_KEY = 'miniflowy_pending_operations';
const OFFLINE_QUEUE_KEY = 'miniflowy_offline_queue';

class SaveStateManager {
  private operations: Map<string, PendingOperation> = new Map();
  private offlineQueue: PendingOperation[] = [];
  private listeners: Set<() => void> = new Set();
  private online: boolean;
  private syncInProgress: boolean = false;

  constructor() {
    this.online = navigator.onLine;
    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);
    this.loadFromLocal();
    this.loadOfflineQueue();
  }

  private handleOnline = () => {
    this.online = true;
    this.notifyListeners();
    
    if (this.offlineQueue.length > 0 && !this.syncInProgress) {
      this.syncOfflineOperations();
    }
  };

  private handleOffline = () => {
    this.online = false;
    this.notifyListeners();
  };

  markPending(id: string, data: unknown, operationType?: string): void {
    const operation: PendingOperation = {
      id,
      status: 'pending',
      data,
      timestamp: Date.now(),
      retryCount: 0,
      operationType
    };
    
    this.operations.set(id, operation);
    
    if (!this.online) {
      this.offlineQueue.push(operation);
      this.saveOfflineQueue();
    }
    
    this.saveToLocal();
    this.notifyListeners();
  }

  markSaving(id: string): void {
    const operation = this.operations.get(id);
    if (operation) {
      operation.status = 'saving';
      this.notifyListeners();
    }
  }

  markSaved(id: string): void {
    this.operations.delete(id);
    this.clearLocal(id);
    this.notifyListeners();
  }

  markError(id: string, error: string): void {
    const operation = this.operations.get(id);
    if (operation) {
      operation.status = 'error';
      operation.error = error;
      this.saveToLocal();
      this.notifyListeners();
    }
  }

  getStatus(): 'idle' | 'pending' | 'saving' | 'saved' | 'error' | 'offline' {
    if (!this.online) {
      return 'offline';
    }

    if (this.operations.size === 0) {
      return 'idle';
    }

    const statuses = Array.from(this.operations.values()).map(op => op.status);
    
    if (statuses.some(s => s === 'error')) {
      return 'error';
    }
    
    if (statuses.some(s => s === 'saving')) {
      return 'saving';
    }
    
    if (statuses.some(s => s === 'pending')) {
      return 'pending';
    }

    return 'saved';
  }

  getPendingCount(): number {
    return Array.from(this.operations.values()).filter(
      op => op.status === 'pending' || op.status === 'saving'
    ).length;
  }

  hasUnsavedChanges(): boolean {
    return this.operations.size > 0;
  }

  getPendingOperations(): PendingOperation[] {
    return Array.from(this.operations.values());
  }

  saveToLocal(): void {
    try {
      const data = Array.from(this.operations.entries());
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      console.error('Failed to save operations to localStorage:', error);
    }
  }

  loadFromLocal(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const data = JSON.parse(stored) as [string, PendingOperation][];
        this.operations = new Map(data);
      }
    } catch (error) {
      console.error('Failed to load operations from localStorage:', error);
      this.operations = new Map();
    }
  }

  clearLocal(id?: string): void {
    try {
      if (id) {
        this.operations.delete(id);
        if (this.operations.size > 0) {
          this.saveToLocal();
        } else {
          localStorage.removeItem(STORAGE_KEY);
        }
      } else {
        this.operations.clear();
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch (error) {
      console.error('Failed to clear operations from localStorage:', error);
    }
  }

  subscribe(listener: () => void): void {
    this.listeners.add(listener);
  }

  unsubscribe(listener: () => void): void {
    this.listeners.delete(listener);
  }

  notifyListeners(): void {
    this.listeners.forEach(listener => {
      try {
        listener();
      } catch (error) {
        console.error('Error in save state listener:', error);
      }
    });
  }

  get isOnline(): boolean {
    return this.online;
  }

  getOfflineQueueCount(): number {
    return this.offlineQueue.length;
  }

  getOfflineQueue(): PendingOperation[] {
    return [...this.offlineQueue];
  }

  private saveOfflineQueue(): void {
    try {
      localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(this.offlineQueue));
    } catch (error) {
      console.error('Failed to save offline queue to localStorage:', error);
    }
  }

  private loadOfflineQueue(): void {
    try {
      const stored = localStorage.getItem(OFFLINE_QUEUE_KEY);
      if (stored) {
        this.offlineQueue = JSON.parse(stored);
      }
    } catch (error) {
      console.error('Failed to load offline queue from localStorage:', error);
      this.offlineQueue = [];
    }
  }

  private clearOfflineQueue(): void {
    this.offlineQueue = [];
    try {
      localStorage.removeItem(OFFLINE_QUEUE_KEY);
    } catch (error) {
      console.error('Failed to clear offline queue from localStorage:', error);
    }
  }

  syncOfflineOperations = async (): Promise<void> => {
    if (this.syncInProgress || this.offlineQueue.length === 0) {
      return;
    }

    this.syncInProgress = true;
    const operations = [...this.offlineQueue];
    this.offlineQueue = [];
    this.saveOfflineQueue();

    for (const op of operations) {
      try {
        await this.retryOperation(op);
        this.operations.delete(op.id);
        this.saveToLocal();
      } catch (error) {
        console.error('Failed to sync offline operation:', error);
        const existingOp = this.operations.get(op.id);
        if (existingOp) {
          existingOp.status = 'error';
          existingOp.error = error instanceof Error ? error.message : 'Unknown error';
          this.operations.set(op.id, existingOp);
          this.saveToLocal();
        }
        this.offlineQueue.push(op);
        this.saveOfflineQueue();
      }
    }

    this.syncInProgress = false;
    this.notifyListeners();
  };

  private retryOperation = async (op: PendingOperation, retryCount: number = 0): Promise<void> => {
    const maxRetries = 5;
    const baseDelay = 1000;

    try {
      const data = await import('../api/data');

      // Node operations
      if (op.operationType === 'update' && op.data.nodeId && op.data.updates) {
        await data.updateNode(op.data.nodeId, op.data.updates);
      } else if (op.operationType === 'create' && op.data.nodeData) {
        await data.createNode(op.data.nodeData.document_id, op.data.nodeData.content, op.data.nodeData.parent_node_id, op.data.nodeData);
      } else if (op.operationType === 'delete' && op.data.nodeId) {
        await data.deleteNode(op.data.nodeId);
      } else if (op.operationType === 'move' && op.data.nodeId) {
        await data.moveNode(op.data.nodeId, op.data.parent_node_id, op.data.sort_order);
      } else if (op.operationType === 'batchUpdate' && op.data.updates) {
        await data.batchUpdateNodes(op.data.updates);
      } else if (op.operationType === 'batchMove' && op.data.moves) {
        await data.batchMoveNodes(op.data.moves);
      } else if (op.operationType === 'batchDelete' && op.data.ids) {
        await data.batchDeleteNodes(op.data.ids);
      } else if (op.operationType === 'batchCreate' && op.data.nodes) {
        await data.createNodesBatch(op.data.nodes);
      // Document operations
      } else if (op.operationType === 'createDocument' && op.data.title && op.data.type) {
        await data.createDocument(op.data.title, op.data.type, op.data.parent_id, op.data.sort_order);
      } else if (op.operationType === 'updateDocument' && op.data.documentId) {
        await data.updateDocument(op.data.documentId, op.data.changes);
      } else if (op.operationType === 'deleteDocument' && op.data.documentId) {
        await data.deleteDocument(op.data.documentId);
      // Memo operations
      } else if (op.operationType === 'createMemo' && op.data.content) {
        await data.createMemo(op.data.content);
      } else if (op.operationType === 'updateMemo' && op.data.memoId) {
        await data.updateMemo(op.data.memoId, op.data.content);
      } else if (op.operationType === 'deleteMemo' && op.data.memoId) {
        await data.deleteMemo(op.data.memoId);
      } else if (op.operationType === 'toggleMemoPinned' && op.data.memoId) {
        await data.toggleMemoPinned(op.data.memoId, op.data.is_pinned);
      } else if (op.operationType === 'toggleMemoArchived' && op.data.memoId) {
        await data.toggleMemoArchived(op.data.memoId, op.data.is_archived);
      } else if (op.operationType === 'updateMemoColor' && op.data.memoId) {
        await data.updateMemoColor(op.data.memoId, op.data.color);
      } else if (op.operationType === 'toggleMemoPublic' && op.data.memoId) {
        await data.toggleMemoPublic(op.data.memoId, op.data.is_public);
      } else {
        console.warn('Unknown operation type or missing data:', op.operationType, op.data);
      }
    } catch (error) {
      if (retryCount < maxRetries) {
        const delay = baseDelay * Math.pow(2, retryCount);
        await new Promise(resolve => setTimeout(resolve, delay));
        await this.retryOperation(op, retryCount + 1);
      } else {
        throw error;
      }
    }
  };

  forceSaveAll(): void {
    const pendingOps = Array.from(this.operations.values());
    if (pendingOps.length === 0) return;
    
    const payload = {
      operations: pendingOps.map(op => ({
        id: op.id,
        type: op.data?.type || 'unknown',
        data: op.data
      }))
    };
    
    const url = '/api/nodes/batch/save';
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    
    if (navigator.sendBeacon) {
      navigator.sendBeacon(url, blob);
    } else {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', url, false);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.send(JSON.stringify(payload));
    }
    
    this.saveToLocal();
  }

  destroy(): void {
    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);
    this.listeners.clear();
  }
}

export const saveStateManager = new SaveStateManager();
export type { OperationStatus, PendingOperation };
