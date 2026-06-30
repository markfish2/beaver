interface CacheItem<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

const DB_NAME = 'miniflowy-data-cache';
const DB_VERSION = 1;
const STORE_NAME = 'cache';

function openDB(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') { resolve(null); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

async function idbGet(key: string): Promise<CacheItem<any> | null> {
  const db = await openDB();
  if (!db) return null;
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => resolve(null);
    tx.oncomplete = () => db.close();
  });
}

async function idbSet(key: string, item: CacheItem<any>): Promise<void> {
  const db = await openDB();
  if (!db) return;
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(item, key);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); resolve(); };
  });
}

async function idbDeletePattern(pattern: string): Promise<void> {
  const db = await openDB();
  if (!db) return;
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        if (cursor.key.toString().startsWith(pattern)) {
          cursor.delete();
        }
        cursor.continue();
      }
    };
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); resolve(); };
  });
}

async function idbClear(): Promise<void> {
  const db = await openDB();
  if (!db) return;
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); resolve(); };
  });
}

class DataCache {
  private cache = new Map<string, CacheItem<any>>();
  private pendingWrites = new Map<string, ReturnType<typeof setTimeout>>();
  // Epoch counter incremented on invalidate/clear to prevent stale idbGet promotions
  private epoch = 0;

  get<T>(key: string): T | null {
    const item = this.cache.get(key);
    if (item) {
      if (Date.now() - item.timestamp > item.ttl) {
        this.cache.delete(key);
        idbDeletePattern(key);
        return null;
      }
      return item.data;
    }
    // Memory miss — try IndexedDB asynchronously, promote to memory
    // Capture epoch to detect if invalidation happens before the async read completes
    const epochAtRead = this.epoch;
    idbGet(key).then((persisted) => {
      if (this.epoch !== epochAtRead) return; // invalidated while reading
      if (persisted && Date.now() - persisted.timestamp <= persisted.ttl) {
        this.cache.set(key, persisted);
      }
    });
    return null;
  }

  set<T>(key: string, data: T, ttl: number = 5 * 60 * 1000): void {
    const item: CacheItem<T> = { data, timestamp: Date.now(), ttl };
    this.cache.set(key, item);
    // Debounce IndexedDB writes to avoid excessive I/O
    const existing = this.pendingWrites.get(key);
    if (existing) clearTimeout(existing);
    this.pendingWrites.set(key, setTimeout(() => {
      this.pendingWrites.delete(key);
      idbSet(key, item);
    }, 300));
  }

  invalidate(pattern: string): void {
    this.epoch++;
    for (const key of this.cache.keys()) {
      if (key.startsWith(pattern)) {
        this.cache.delete(key);
      }
    }
    // Cancel pending debounced writes for matching keys to prevent
    // stale data from being written back to IndexedDB after invalidation
    for (const [key, timeout] of this.pendingWrites) {
      if (key.startsWith(pattern)) {
        clearTimeout(timeout);
        this.pendingWrites.delete(key);
      }
    }
    idbDeletePattern(pattern);
  }

  clear(): void {
    this.epoch++;
    this.cache.clear();
    // Cancel all pending debounced writes
    for (const [, timeout] of this.pendingWrites) {
      clearTimeout(timeout);
    }
    this.pendingWrites.clear();
    idbClear();
  }

  has(key: string): boolean {
    const item = this.cache.get(key);
    if (!item) return false;
    if (Date.now() - item.timestamp > item.ttl) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }
}

export const dataCache = new DataCache();
