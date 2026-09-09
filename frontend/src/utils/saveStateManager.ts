import type { Node } from '../api/data';
import { clientId, startLocalWrite, finishLocalWrite } from './liveUpdates';

type OperationStatus = 'pending' | 'saving' | 'saved' | 'error';

type NodeBooleanProperty = 'is_completed' | 'is_in_progress' | 'is_collapsed' | 'is_todo';

interface OfflineMove {
  id: string;
  oldParent: string | null;
  oldOrder: number;
  newParent: string | null;
  newOrder: number;
}

interface OfflineCommandPayload {
  type?: string;
  id: string;
  nodeId: string;
  oldContent: string;
  newContent: string;
  oldNote: string;
  newNote: string;
  property: NodeBooleanProperty;
  newValue: boolean;
  oldParent?: string | null;
  oldOrder?: number;
  newParent?: string | null;
  newOrder?: number;
  ids: string[];
  updates: OfflineMove[];
  nodeData: {
    document_id: string;
    content: string;
    parent_node_id: string | null;
    sort_order: number;
    note?: string;
    is_completed?: boolean;
    is_collapsed?: boolean;
    is_todo?: boolean;
  };
  allDeletedNodes?: Node[];
  allNodes?: Node[];
}

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

interface BatchSaveOperation {
  id: string;
  type: string;
  data: Record<string, unknown>;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function getCoalesceKey(operation: PendingOperation): string | null {
  const data = asRecord(operation.data);
  const type = typeof data.type === 'string' ? data.type : operation.operationType;
  const id = typeof data.id === 'string' ? data.id : null;
  if (!type || !id) return null;
  if (type === 'updateContent' || type === 'undoUpdateContent') return `content:${id}`;
  if (type === 'updateNote' || type === 'undoUpdateNote') return `note:${id}`;
  if (type === 'moveNode' || type === 'undoMoveNode') return `move:${id}`;
  if ((type === 'toggleProperty' || type === 'undoToggleProperty') && typeof data.property === 'string') {
    return `property:${id}:${data.property}`;
  }
  return null;
}

export function sendBatchSaveRequest(operations: BatchSaveOperation[]): void {
  if (operations.length === 0) return;
  const token = localStorage.getItem('token');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  headers['X-Client-ID'] = clientId;
  if (token) headers.Authorization = `Bearer ${token}`;

  startLocalWrite();
  void fetch('/api/nodes/batch/save', {
    method: 'POST',
    headers,
    body: JSON.stringify({ operations }),
    keepalive: true,
  }).catch((error) => {
    console.error('Failed to send final batch save:', error);
  }).finally(finishLocalWrite);
}

class SaveStateManager {
  private operations: Map<string, PendingOperation> = new Map();
  private offlineQueue: PendingOperation[] = [];
  private listeners: Set<() => void> = new Set();
  private online: boolean;
  private syncInProgress: boolean = false;
  private retryTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  constructor() {
    this.online = navigator.onLine;
    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);
    this.loadFromLocal();
    this.loadOfflineQueue();
    this.restoreFailedOperations();
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
      const coalesceKey = getCoalesceKey(operation);
      if (coalesceKey) {
        const replaced = this.offlineQueue.find(item => getCoalesceKey(item) === coalesceKey);
        if (replaced) this.operations.delete(replaced.id);
        this.offlineQueue = this.offlineQueue.filter(item => getCoalesceKey(item) !== coalesceKey);
      }
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
      if (!navigator.onLine) {
        this.online = false;
      }
      this.enqueueForRetry(operation);
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

  private restoreFailedOperations(): void {
    for (const operation of this.operations.values()) {
      if (operation.status !== 'error') continue;
      this.enqueueForRetry(operation);
    }
    if (this.online && this.offlineQueue.length > 0) {
      this.scheduleRetry();
    }
  }

  private enqueueForRetry(operation: PendingOperation): void {
    if (!this.offlineQueue.some(item => item.id === operation.id)) {
      this.offlineQueue.push(operation);
      this.saveOfflineQueue();
    }
    if (this.online) this.scheduleRetry(operation.id);
  }

  private scheduleRetry(operationId?: string): void {
    if (!this.online) return;
    const id = operationId || '__queue__';
    if (this.retryTimers.has(id)) return;

    const operation = operationId ? this.operations.get(operationId) : undefined;
    const retryCount = operation?.retryCount ?? 0;
    const delay = Math.min(60_000, 2_000 * Math.pow(2, Math.min(retryCount, 5)));
    if (operation) {
      operation.retryCount = retryCount + 1;
      this.saveToLocal();
    }

    const timer = setTimeout(() => {
      this.retryTimers.delete(id);
      if (this.syncInProgress) {
        this.scheduleRetry(operationId);
        return;
      }
      void this.syncOfflineOperations();
    }, delay);
    this.retryTimers.set(id, timer);
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
        const existingOp = this.operations.get(op.id);
        if (existingOp) {
          existingOp.status = 'saving';
          this.notifyListeners();
        }
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
        this.scheduleRetry(op.id);
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
      const payload = op.data as OfflineCommandPayload;
      const commandType = payload.type;

      // Command-mode operations store their operation type inside the payload.
      if (commandType === 'updateContent') {
        await data.updateNode(payload.id, { content: payload.newContent });
        return;
      } else if (commandType === 'undoUpdateContent') {
        await data.updateNode(payload.id, { content: payload.oldContent });
        return;
      } else if (commandType === 'updateNote') {
        await data.updateNode(payload.id, { note: payload.newNote });
        return;
      } else if (commandType === 'undoUpdateNote') {
        await data.updateNode(payload.id, { note: payload.oldNote });
        return;
      } else if (commandType === 'toggleProperty') {
        await data.updateNode(payload.id, { [payload.property]: payload.newValue });
        return;
      } else if (commandType === 'undoToggleProperty') {
        await data.updateNode(payload.id, { [payload.property]: !payload.newValue });
        return;
      } else if (commandType === 'batchToggleProperty' || commandType === 'undoBatchToggleProperty') {
        const value = commandType === 'batchToggleProperty' ? payload.newValue : !payload.newValue;
        await data.batchUpdateNodes(payload.ids.map((id: string) => ({ id, [payload.property]: value })));
        return;
      } else if (commandType === 'moveNode') {
        if (payload.newOrder !== undefined) {
          await data.moveNode(payload.id, payload.newParent ?? null, payload.newOrder);
        }
        return;
      } else if (commandType === 'undoMoveNode') {
        if (payload.oldOrder !== undefined) {
          await data.moveNode(payload.id, payload.oldParent ?? null, payload.oldOrder);
        }
        return;
      } else if (commandType === 'batchMove' || commandType === 'undoBatchMove') {
        const undo = commandType === 'undoBatchMove';
        await data.batchMoveNodes(payload.updates.map((item) => ({
          id: item.id,
          parent_node_id: undo ? item.oldParent : item.newParent,
          sort_order: undo ? item.oldOrder : item.newOrder,
        })));
        return;
      } else if (commandType === 'deleteNode' || commandType === 'undoCreateNode') {
        await data.deleteNode(payload.nodeId);
        return;
      } else if (commandType === 'batchDelete') {
        await data.batchDeleteNodes(payload.ids);
        return;
      } else if (commandType === 'createNode') {
        await data.createNode(payload.nodeData.document_id, payload.nodeData.content, payload.nodeData.parent_node_id, {
          ...payload.nodeData,
          id: payload.nodeId,
        });
        return;
      } else if (commandType === 'undoDeleteNode' || commandType === 'undoBatchDelete') {
        const nodes = payload.allDeletedNodes || payload.allNodes || [];
        await data.createNodesBatch(nodes);
        return;
      } else if (commandType === 'composite' || commandType === 'undoComposite') {
        // Child commands are queued independently; the wrapper has no server mutation.
        return;
      }

      // Node operations（旧版离线队列格式仍需兼容，但数据来自 JSON，必须先校验形状。）
      const legacyData = asRecord(op.data);
      const legacyNodeId = typeof legacyData.nodeId === 'string' ? legacyData.nodeId : null;
      const legacyDocumentId = typeof legacyData.documentId === 'string' ? legacyData.documentId : null;
      const legacyMemoId = typeof legacyData.memoId === 'string' ? legacyData.memoId : null;
      const legacyContent = typeof legacyData.content === 'string' ? legacyData.content : null;
      const legacyParentId = typeof legacyData.parent_node_id === 'string' || legacyData.parent_node_id === null ? legacyData.parent_node_id : null;
      const legacySortOrder = typeof legacyData.sort_order === 'number' ? legacyData.sort_order : null;
      const legacyIds = Array.isArray(legacyData.ids) && legacyData.ids.every((id): id is string => typeof id === 'string') ? legacyData.ids : null;
      const legacyUpdates = Array.isArray(legacyData.updates) ? legacyData.updates : null;
      const legacyMoves = Array.isArray(legacyData.moves) ? legacyData.moves : null;
      const legacyNodes = Array.isArray(legacyData.nodes) ? legacyData.nodes : null;
      const legacyNodeData = asRecord(legacyData.nodeData);
      if (op.operationType === 'update' && legacyNodeId && legacyUpdates && legacyUpdates.length === 1) {
        await data.updateNode(legacyNodeId, legacyUpdates[0] as Partial<import('../api/data').Node>);
      } else if (op.operationType === 'create' && legacyNodeData.document_id && typeof legacyNodeData.content === 'string') {
        await data.createNode(legacyNodeData.document_id as string, legacyNodeData.content, legacyNodeData.parent_node_id as string | null, legacyNodeData as Parameters<typeof data.createNode>[3]);
      } else if (op.operationType === 'delete' && legacyNodeId) {
        await data.deleteNode(legacyNodeId);
      } else if (op.operationType === 'move' && legacyNodeId && legacySortOrder !== null) {
        await data.moveNode(legacyNodeId, legacyParentId, legacySortOrder);
      } else if (op.operationType === 'batchUpdate' && legacyUpdates) {
        await data.batchUpdateNodes(legacyUpdates as Array<{ id: string } & Partial<import('../api/data').Node>>);
      } else if (op.operationType === 'batchMove' && legacyMoves) {
        await data.batchMoveNodes(legacyMoves as Array<{ id: string; parent_node_id: string | null; sort_order: number }>);
      } else if (op.operationType === 'batchDelete' && legacyIds) {
        await data.batchDeleteNodes(legacyIds);
      } else if (op.operationType === 'batchCreate' && legacyNodes) {
        await data.createNodesBatch(legacyNodes as Parameters<typeof data.createNodesBatch>[0]);
      // Document operations
      } else if (op.operationType === 'createDocument' && typeof legacyData.title === 'string' && typeof legacyData.type === 'string') {
        const legacyTitle = legacyData.title;
        const legacyType = legacyData.type;
        await data.createDocument(legacyTitle, legacyType, legacyData.parent_id as string | null, legacySortOrder ?? undefined);
      } else if (op.operationType === 'updateDocument' && legacyDocumentId) {
        await data.updateDocument(legacyDocumentId, asRecord(legacyData.changes));
      } else if (op.operationType === 'deleteDocument' && legacyDocumentId) {
        await data.deleteDocument(legacyDocumentId);
      // Memo operations
      } else if (op.operationType === 'createMemo' && legacyContent) {
        await data.createMemo(legacyContent);
      } else if (op.operationType === 'updateMemo' && legacyMemoId && legacyContent) {
        await data.updateMemo(legacyMemoId, legacyContent);
      } else if (op.operationType === 'deleteMemo' && legacyMemoId) {
        await data.deleteMemo(legacyMemoId);
      } else if (op.operationType === 'toggleMemoPinned' && legacyMemoId && typeof legacyData.is_pinned === 'boolean') {
        await data.toggleMemoPinned(legacyMemoId, legacyData.is_pinned);
      } else if (op.operationType === 'toggleMemoArchived' && legacyMemoId && typeof legacyData.is_archived === 'boolean') {
        await data.toggleMemoArchived(legacyMemoId, legacyData.is_archived);
      } else if (op.operationType === 'updateMemoColor' && legacyMemoId && (typeof legacyData.color === 'string' || legacyData.color === null)) {
        await data.updateMemoColor(legacyMemoId, legacyData.color);
      } else if (op.operationType === 'toggleMemoPublic' && legacyMemoId && typeof legacyData.is_public === 'boolean') {
        await data.toggleMemoPublic(legacyMemoId, legacyData.is_public);
      } else {
        throw new Error(`Unknown offline operation: ${op.operationType || commandType || 'missing type'}`);
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
    
    sendBatchSaveRequest(pendingOps.map(op => {
      const operationData = asRecord(op.data);
      const operationType = typeof operationData.type === 'string' ? operationData.type : 'unknown';
      return {
      id: op.id,
      type: operationType,
      data: op.data as Record<string, unknown>,
      };
    }));
    
    this.saveToLocal();
  }

  destroy(): void {
    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);
    this.retryTimers.forEach(timer => clearTimeout(timer));
    this.retryTimers.clear();
    this.listeners.clear();
  }
}

export const saveStateManager = new SaveStateManager();
export type { OperationStatus, PendingOperation };
