/**
 * PWA 状态持久化工具
 * - localStorage: 保存视图状态（路由、筛选条件等轻量数据）
 * - IndexedDB: 保存滚动位置、笔记缓存等较大数据
 *
 * 目的：iOS PWA 切后台回来被终止后，尽可能无感恢复状态
 */

const LS_KEY = 'mf-pwa-state';
const DB_NAME = 'miniflowy-pwa';
const DB_VERSION = 1;
const STORE_APP = 'appState';
const STORE_MEMOS = 'memosCache';

// ========== localStorage 视图状态 ==========

interface PWAViewState {
  lastRoute: string;        // '/' 或 '/doc/xxx'
  memoView: 'active' | 'archived' | 'public' | 'wanderer' | 'media';
  tagFilter: string | null;
  savedAt: number;
}

export function saveViewState(state: Partial<PWAViewState>) {
  try {
    const existing = loadViewState();
    const merged = { ...existing, ...state, savedAt: Date.now() };
    localStorage.setItem(LS_KEY, JSON.stringify(merged));
  } catch {}
}

export function loadViewState(): PWAViewState {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // 24 小时过期
      if (Date.now() - parsed.savedAt < 24 * 60 * 60 * 1000) {
        return parsed;
      }
    }
  } catch {}
  return { lastRoute: '/', memoView: 'active', tagFilter: null, savedAt: 0 };
}

// ========== IndexedDB ==========

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_APP)) db.createObjectStore(STORE_APP);
      if (!db.objectStoreNames.contains(STORE_MEMOS)) db.createObjectStore(STORE_MEMOS);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T>(store: string, key: string): Promise<T | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readonly');
      const req = tx.objectStore(store).get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

async function idbSet(store: string, key: string, value: unknown): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {}
}

async function idbDelete(store: string, key: string): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {}
}

// ========== 滚动位置（sessionStorage，同步读取，页面刷新后仍保留） ==========

const SCROLL_KEY = 'mf-scroll-y';

export function saveScrollPosition(scrollTop: number) {
  try { sessionStorage.setItem(SCROLL_KEY, String(scrollTop)); } catch {}
}

export function loadScrollPosition(): number | null {
  try {
    const v = sessionStorage.getItem(SCROLL_KEY);
    return v ? Number(v) : null;
  } catch { return null; }
}

// ========== 笔记缓存（IndexedDB） ==========

interface MemosCacheEntry {
  memos: unknown[];
  total: number;
  page: number;
  view: string;
  tag: string | null;
  savedAt: number;
}

export async function saveMemosCache(data: { memos: unknown[]; total: number; page: number; view: string; tag: string | null }) {
  await idbSet(STORE_MEMOS, 'current', { ...data, savedAt: Date.now() });
}

export async function loadMemosCache(): Promise<MemosCacheEntry | null> {
  const data = await idbGet<MemosCacheEntry>(STORE_MEMOS, 'current');
  // 5 分钟过期
  if (data && Date.now() - data.savedAt < 5 * 60 * 1000) {
    return data;
  }
  return null;
}

export async function clearMemosCache() {
  await idbDelete(STORE_MEMOS, 'current');
}
