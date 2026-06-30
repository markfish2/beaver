import api from './client';
import { dataCache } from './cache';
import { emitConflict } from '../utils/conflictResolver';

export interface Document {
  id: string;
  title: string;
  type: 'document' | 'folder' | 'note' | 'excalidraw';
  parent_id: string | null;
  sort_order: number;
  is_starred: boolean;
  ai_excluded?: boolean;
  icon?: string;
  diary_date?: string | null;
  version?: number;
  deleted_at?: string | null;
  original_parent_id?: string | null;
  updated_at?: string | null;
}

export interface Node {
  id: string;
  document_id: string;
  parent_node_id: string | null;
  content: string;
  note: string;
  is_completed: boolean;
  is_in_progress?: boolean;
  is_collapsed: boolean;
  sort_order: number;
  heading?: 'h1' | 'h2' | 'h3' | 'h4' | null;
  is_bold?: boolean;
  is_italic?: boolean;
  color?: 'red' | 'blue' | 'green' | 'purple' | null;
  highlight?: 'red' | 'yellow' | 'green' | 'purple' | 'mint' | null;
  is_todo?: boolean;
  content_type?: 'text' | 'image' | 'attachment';
  file_path?: string;
  file_name?: string;
  version?: number;
  parent_content?: string | null;
}

export interface UploadResponse {
  file_path: string;
  file_name: string;
  file_type: string;
  file_size: number;
  thumbnail_path?: string | null;
}

const pendingRequests = new Map<string, AbortController>();

const abortPendingRequest = (nodeId: string) => {
  const controller = pendingRequests.get(nodeId);
  if (controller) {
    controller.abort();
    pendingRequests.delete(nodeId);
  }
};

// Documents
export const getDocuments = async (search?: string) => {
  const cacheKey = `documents:${search || 'all'}`;
  const cached = dataCache.get<Document[]>(cacheKey);
  if (cached) return cached;

  const params = search ? { search } : {};
  const response = await api.get<Document[]>('/documents/', { params });
  dataCache.set(cacheKey, response.data);
  return response.data;
};

export const getRecentDocuments = async (limit: number = 20): Promise<Document[]> => {
  const response = await api.get<Document[]>('/documents/recent', { params: { limit } });
  return response.data;
};

export const getDocument = async (id: string): Promise<Document> => {
  const response = await api.get<Document>(`/documents/${id}`);
  return response.data;
};

export const createDocument = async (title: string, type: string = 'document', parent_id: string | null = null, sort_order: number = Date.now(), aiExcluded: boolean = false) => {
  const response = await api.post<Document>('/documents/', { title, type, parent_id, sort_order, ai_excluded: aiExcluded });
  dataCache.invalidate('documents:');
  return response.data;
};

export const copyDocument = async (id: string) => {
  const response = await api.post<Document>(`/documents/${id}/copy`);
  dataCache.invalidate('documents:');
  return response.data;
};

export const updateDocument = async (id: string, data: Partial<Document> & { expected_version?: number }) => {
  try {
    const response = await api.put<Document>(`/documents/${id}`, data);
    dataCache.invalidate('documents:');
    return response.data;
  } catch (error: any) {
    if (error?.response?.status === 409) {
      const detail = error.response.data?.detail;
      emitConflict({
        entityType: 'document',
        entityId: id,
        localData: data as Record<string, unknown>,
        serverVersion: detail?.current_version || 0,
        serverData: detail,
      });
    }
    throw error;
  }
};

export const deleteDocument = async (id: string, deleteChildren: boolean = false) => {
  await api.delete(`/documents/${id}`, { params: { delete_children: deleteChildren } });
  dataCache.invalidate('documents:');
};

// Nodes
export const getNodes = async (documentId: string) => {
  const cacheKey = `nodes:${documentId}`;
  const cached = dataCache.get<Node[]>(cacheKey);
  if (cached) return cached;
  
  const response = await api.get<Node[]>(`/documents/${documentId}/nodes`);
  dataCache.set(cacheKey, response.data, 2 * 60 * 1000); // 2分钟TTL
  return response.data;
};

export const createNode = async (
  documentId: string,
  content: string = '',
  parent_node_id: string | null = null,
  options: {
    id?: string;
    sort_order?: number;
    note?: string;
    is_completed?: boolean;
    is_collapsed?: boolean;
    is_todo?: boolean;
    content_type?: 'text' | 'image' | 'attachment';
    file_path?: string;
    file_name?: string;
  } = {}
) => {
  const payload = {
    document_id: documentId,
    content,
    parent_node_id,
    sort_order: options.sort_order ?? Date.now(),
    ...options
  };
  const response = await api.post<Node>('/nodes/', payload);
  dataCache.invalidate(`nodes:${documentId}`);
  dataCache.invalidate('diary:');
  return response.data;
};

export const updateNode = async (id: string, data: Partial<Node> & { expected_version?: number }) => {
  abortPendingRequest(id);
  const controller = new AbortController();
  pendingRequests.set(id, controller);
  try {
    const response = await api.put<Node>(`/nodes/${id}`, data, { signal: controller.signal });
    dataCache.invalidate(`nodes:${response.data.document_id}`);
    dataCache.invalidate('diary:');
    return response.data;
  } catch (error: any) {
    if (error?.response?.status === 409) {
      const detail = error.response.data?.detail;
      emitConflict({
        entityType: 'node',
        entityId: id,
        localData: data as Record<string, unknown>,
        serverVersion: detail?.current_version || 0,
        serverData: detail,
      });
    }
    throw error;
  } finally {
    pendingRequests.delete(id);
  }
};

export const batchUpdateNodes = async (updates: Array<{ id: string } & Partial<Node>>) => {
  const response = await api.post<Node[]>('/nodes/batch/properties', updates);
  const docIds = [...new Set(response.data.map(n => n.document_id))];
  docIds.forEach(id => dataCache.invalidate(`nodes:${id}`));
  dataCache.invalidate('diary:');
  return response.data;
};

export const moveNode = async (id: string, parent_node_id: string | null, sort_order: number) => {
  const response = await api.put<Node>(`/nodes/${id}/move`, { parent_node_id, sort_order });
  dataCache.invalidate(`nodes:${response.data.document_id}`);
  dataCache.invalidate('diary:');
  return response.data;
};

export const batchMoveNodes = async (updates: { id: string, parent_node_id: string | null, sort_order: number }[]) => {
  const response = await api.put<Node[]>('/nodes/batch/move', updates);
  const docIds = [...new Set(response.data.map(n => n.document_id))];
  docIds.forEach(id => dataCache.invalidate(`nodes:${id}`));
  dataCache.invalidate('diary:');
  return response.data;
};

export const deleteNode = async (id: string) => {
  await api.delete(`/nodes/${id}`);
  dataCache.invalidate('nodes:');
  dataCache.invalidate('diary:');
};

export const batchDeleteNodes = async (ids: string[]) => {
  await api.post('/nodes/batch/delete', ids);
  dataCache.invalidate('nodes:');
  dataCache.invalidate('diary:');
};

export const createNodesBatch = async (nodesData: Array<{
  id?: string;
  document_id: string;
  content: string;
  parent_node_id: string | null;
  sort_order: number;
  note?: string;
  is_completed?: boolean;
  is_collapsed?: boolean;
  is_todo?: boolean;
  content_type?: 'text' | 'image' | 'attachment';
  file_path?: string;
  file_name?: string;
}>): Promise<void> => {
  await api.post('/nodes/batch/create', nodesData);
  const docIds = [...new Set(nodesData.map(n => n.document_id))];
  docIds.forEach(id => dataCache.invalidate(`nodes:${id}`));
  dataCache.invalidate('diary:');
};

// File upload
export const uploadFile = async (file: File): Promise<UploadResponse> => {
  const formData = new FormData();
  formData.append('file', file);

  const response = await api.post<UploadResponse>('/attachments/upload', formData);
  return response.data;
};

export const uploadAudio = async (file: File): Promise<UploadResponse> => {
  const formData = new FormData();
  formData.append('file', file);
  const response = await api.post<UploadResponse>('/attachments/upload-audio', formData);
  return response.data;
};

export const uploadFromUrl = async (url: string): Promise<UploadResponse> => {
  const response = await api.post<UploadResponse>('/attachments/upload-from-url', { url });
  return response.data;
};

export const getFileUrl = (filePath: string): string => {
  // Remove /api prefix if present since static files are served at /uploads
  return filePath.replace(/^\/api/, '');
};

/**
 * Derive thumbnail URL from original image URL.
 * /uploads/abc-123.png → /uploads/thumbs/abc-123.jpg
 */
export const getThumbnailUrl = (filePath: string): string => {
  const cleanPath = filePath.replace(/^\/api/, '');
  const name = cleanPath.split('/').pop()!;
  const base = name.replace(/\.[^.]+$/, '');
  return `/uploads/thumbs/${base}.jpg`;
};

// Share
export const createShare = async (documentId: string): Promise<{ id: string; document_id: string; token: string; created_at: string }> => {
  const response = await api.post(`/shares/${documentId}`);
  return response.data;
};

export const getShare = async (documentId: string): Promise<{ id: string; document_id: string; token: string; created_at: string } | null> => {
  const response = await api.get(`/shares/${documentId}`);
  return response.data;
};

export const deleteShare = async (token: string): Promise<void> => {
  await api.delete(`/shares/${token}`);
};

export const getSharedDocument = async (token: string): Promise<{ title: string; nodes: Node[] }> => {
  const response = await api.get(`/public/share/${token}`);
  return response.data;
};

// Diary
export interface DiaryMonthItem {
  year: number;
  months: number[];
}

export const getDiaryMonths = async (): Promise<DiaryMonthItem[]> => {
  const cacheKey = 'diary:months';
  const cached = dataCache.get<DiaryMonthItem[]>(cacheKey);
  if (cached) return cached;

  const response = await api.get<{ items: DiaryMonthItem[] }>('/diary/months');
  dataCache.set(cacheKey, response.data.items, 5 * 60 * 1000);
  return response.data.items;
};

export const getMonthlyDiary = async (year: number, month: number): Promise<{ document: Document; nodes: Node[]; is_new: boolean }> => {
  const cacheKey = `diary:${year}:${month}`;
  const cached = dataCache.get<{ document: Document; nodes: Node[]; is_new: boolean }>(cacheKey);
  if (cached) return cached;

  const response = await api.get(`/diary/${year}/${month}`);
  dataCache.set(cacheKey, response.data, 2 * 60 * 1000);
  return response.data;
};

export const getOrCreateDayNode = async (year: number, month: number, day: number): Promise<{ node_id: string; is_new: boolean; child_node: Node | null }> => {
  const response = await api.post(`/diary/${year}/${month}/days/${day}`);
  dataCache.invalidate(`diary:${year}:${month}`);
  dataCache.invalidate(`diary:days:${year}:${month}`);
  return response.data;
};

export const getDiaryDayDates = async (year: number, month: number): Promise<number[]> => {
  const cacheKey = `diary:days:${year}:${month}`;
  const cached = dataCache.get<number[]>(cacheKey);
  if (cached) return cached;

  const response = await api.get<{ days: number[] }>(`/diary/${year}/${month}/days`);
  dataCache.set(cacheKey, response.data.days, 2 * 60 * 1000);
  return response.data.days;
};

export const getDiarySummary = async (): Promise<{ tasks: Node[]; tags: string[] }> => {
  const cacheKey = 'diary:summary';
  const cached = dataCache.get<{ tasks: Node[]; tags: string[] }>(cacheKey);
  if (cached) return cached;

  const response = await api.get<{ tasks: Node[]; tags: string[] }>('/diary/summary');
  dataCache.set(cacheKey, response.data, 2 * 60 * 1000);
  return response.data;
};

// Memos
export interface Memo {
  id: string;
  content: string;
  is_pinned: boolean;
  is_archived: boolean;
  is_public: boolean;
  color: string | null;
  ai_excluded: boolean;
  created_at: string;
  updated_at: string;
}

export interface MemoListResponse {
  memos: Memo[];
  total: number;
  page: number;
  page_size: number;
}

export interface MemoHeatmapResponse {
  year: number;
  month: number;
  days: Record<string, number>;
}

export const createMemo = async (content: string, aiExcluded: boolean = false): Promise<Memo> => {
  const response = await api.post<Memo>('/memos/', { content, ai_excluded: aiExcluded });
  dataCache.invalidate('memos:');
  return response.data;
};

export const getMemos = async (page: number = 1, pageSize: number = 20, archived: boolean = false, tag?: string, search?: string, publicOnly?: boolean): Promise<MemoListResponse> => {
  const viewKey = publicOnly ? 'public' : (archived ? 'archived' : 'active');
  const cacheKey = `memos:list:${viewKey}:${page}:${pageSize}${tag ? ':' + tag : ''}${search ? ':s=' + search : ''}`;
  const cached = dataCache.get<MemoListResponse>(cacheKey);
  if (cached) return cached;

  const params: Record<string, any> = { page, page_size: pageSize, archived };
  if (publicOnly) params.public = true;
  if (tag) params.tag = tag;
  if (search) params.search = search;
  const response = await api.get<MemoListResponse>('/memos/', { params });
  dataCache.set(cacheKey, response.data, 2 * 60 * 1000);
  return response.data;
};

export const updateMemo = async (id: string, content: string): Promise<Memo> => {
  const response = await api.put<Memo>(`/memos/${id}`, { content });
  dataCache.invalidate('memos:');
  return response.data;
};

export const deleteMemo = async (id: string): Promise<void> => {
  await api.delete(`/memos/${id}`);
  dataCache.invalidate('memos:');
};

export const toggleMemoPinned = async (id: string, is_pinned: boolean): Promise<Memo> => {
  const response = await api.put<Memo>(`/memos/${id}`, { is_pinned });
  dataCache.invalidate('memos:');
  return response.data;
};

export const toggleMemoArchived = async (id: string, is_archived: boolean): Promise<Memo> => {
  const response = await api.put<Memo>(`/memos/${id}`, { is_archived });
  dataCache.invalidate('memos:');
  return response.data;
};

export const updateMemoColor = async (id: string, color: string | null): Promise<Memo> => {
  const response = await api.put<Memo>(`/memos/${id}`, { color });
  dataCache.invalidate('memos:');
  return response.data;
};

export const toggleMemoPublic = async (id: string, is_public: boolean): Promise<Memo> => {
  const response = await api.put<Memo>(`/memos/${id}`, { is_public });
  dataCache.invalidate('memos:');
  return response.data;
};

export const toggleMemoAI = async (id: string, ai_excluded: boolean): Promise<Memo> => {
  const response = await api.put<Memo>(`/memos/${id}`, { ai_excluded });
  dataCache.invalidate('memos:');
  return response.data;
};

export const getMemoHeatmap = async (year: number, month: number): Promise<MemoHeatmapResponse> => {
  const cacheKey = `memos:heatmap:${year}:${month}`;
  const cached = dataCache.get<MemoHeatmapResponse>(cacheKey);
  if (cached) return cached;

  const response = await api.get<MemoHeatmapResponse>(`/memos/heatmap/${year}/${month}`);
  dataCache.set(cacheKey, response.data, 5 * 60 * 1000);
  return response.data;
};

export const getMemoTags = async (): Promise<string[]> => {
  const cacheKey = 'memos:tags';
  const cached = dataCache.get<string[]>(cacheKey);
  if (cached) return cached;

  const response = await api.get<{ tags: string[] }>('/memos/tags');
  dataCache.set(cacheKey, response.data.tags, 5 * 60 * 1000);
  return response.data.tags;
};

// Search
export type SearchResultType = 'document' | 'diary' | 'memo' | 'document_title';

export interface SearchResultItem {
  result_type: SearchResultType;
  entity_id: string;
  title: string;
  snippet: string;
  node_id?: string | null;
  diary_date?: string | null;
  parent_id?: string | null;
  created_at?: string | null;
}

export interface SearchResponse {
  query: string;
  results: SearchResultItem[];
  total: number;
}

export const search = async (query: string, limit: number = 50): Promise<SearchResponse> => {
  const response = await api.get<SearchResponse>('/search/', { params: { q: query, limit } });
  return response.data;
};

// Link Preview
export interface LinkPreview {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  favicon: string | null;
  site_name: string | null;
}

const LP_STORAGE_KEY = 'link-preview-cache';
const LP_FAILED_KEY = 'link-preview-failed';
const LP_TTL = 24 * 60 * 60 * 1000; // 24h
const LP_FAILED_TTL = 60 * 60 * 1000; // 1h for failed entries

function lpCacheGet(url: string): LinkPreview | null {
  try {
    const raw = localStorage.getItem(LP_STORAGE_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw);
    const entry = map[url];
    if (!entry) return null;
    if (Date.now() - entry.t > LP_TTL) {
      delete map[url];
      localStorage.setItem(LP_STORAGE_KEY, JSON.stringify(map));
      return null;
    }
    return entry.d;
  } catch {
    return null;
  }
}

function lpCacheSet(url: string, data: LinkPreview): void {
  try {
    const raw = localStorage.getItem(LP_STORAGE_KEY);
    const map = raw ? JSON.parse(raw) : {};
    map[url] = { d: data, t: Date.now() };
    // Keep at most 200 entries
    const keys = Object.keys(map);
    if (keys.length > 200) {
      const sorted = keys.sort((a, b) => map[a].t - map[b].t);
      for (let i = 0; i < sorted.length - 200; i++) delete map[sorted[i]];
    }
    localStorage.setItem(LP_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // localStorage full or unavailable, ignore
  }
}

// Track failed URLs with shorter TTL so they can be retried
function lpMarkFailed(url: string): void {
  try {
    const raw = localStorage.getItem(LP_FAILED_KEY);
    const map = raw ? JSON.parse(raw) : {};
    map[url] = Date.now();
    const keys = Object.keys(map);
    if (keys.length > 200) {
      const sorted = keys.sort((a, b) => map[a] - map[b]);
      for (let i = 0; i < sorted.length - 200; i++) delete map[sorted[i]];
    }
    localStorage.setItem(LP_FAILED_KEY, JSON.stringify(map));
  } catch {}
}

function lpIsFailed(url: string): boolean {
  try {
    const raw = localStorage.getItem(LP_FAILED_KEY);
    if (!raw) return false;
    const map = JSON.parse(raw);
    if (!map[url]) return false;
    if (Date.now() - map[url] > LP_FAILED_TTL) {
      delete map[url];
      localStorage.setItem(LP_FAILED_KEY, JSON.stringify(map));
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function lpClearFailed(url: string): void {
  try {
    const raw = localStorage.getItem(LP_FAILED_KEY);
    if (!raw) return;
    const map = JSON.parse(raw);
    delete map[url];
    localStorage.setItem(LP_FAILED_KEY, JSON.stringify(map));
  } catch {}
}

/** Get all URLs currently in the success cache */
export function getCachedPreviewUrls(): string[] {
  try {
    const raw = localStorage.getItem(LP_STORAGE_KEY);
    if (!raw) return [];
    return Object.keys(JSON.parse(raw));
  } catch {
    return [];
  }
}

/** Get a cached preview by URL (returns null if not cached or expired) */
export function getCachedPreview(url: string): LinkPreview | null {
  return lpCacheGet(url);
}

/** Get URLs that failed within the retry window */
export function getFailedPreviewUrls(): string[] {
  try {
    const raw = localStorage.getItem(LP_FAILED_KEY);
    if (!raw) return [];
    const map = JSON.parse(raw);
    const now = Date.now();
    return Object.keys(map).filter(url => now - map[url] <= LP_FAILED_TTL);
  } catch {
    return [];
  }
}

/** Retry a single failed preview, returns result if successful */
export async function retryLinkPreview(url: string): Promise<LinkPreview | null> {
  try {
    const res = await api.get<LinkPreview>('/link-preview/', { params: { url } });
    lpCacheSet(url, res.data);
    lpClearFailed(url);
    return res.data;
  } catch {
    return null;
  }
}

// Deduplicate in-flight requests within same page load
const _inflight = new Map<string, Promise<LinkPreview>>();

export const fetchLinkPreview = async (url: string): Promise<LinkPreview | null> => {
  // 1. Check localStorage (instant)
  const cached = lpCacheGet(url);
  if (cached) return cached;

  // 2. If recently failed, skip (will be retried on next startup after TTL)
  if (lpIsFailed(url)) return null;

  // 3. Deduplicate concurrent requests for same URL
  if (_inflight.has(url)) return _inflight.get(url)!;

  // 4. Fetch from backend, store in localStorage
  const promise = api.get<LinkPreview>('/link-preview/', { params: { url } })
    .then(res => {
      lpCacheSet(url, res.data);
      lpClearFailed(url);
      return res.data;
    })
    .catch(() => {
      lpMarkFailed(url);
      return null;
    })
    .finally(() => { _inflight.delete(url); });

  _inflight.set(url, promise);
  return promise;
};

// Todos
export interface Todo {
  id: string;
  content: string;
  is_completed: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export const createTodo = async (content: string): Promise<Todo> => {
  const response = await api.post<Todo>('/todos/', { content });
  return response.data;
};

export const getTodos = async (completed: boolean = false): Promise<Todo[]> => {
  const response = await api.get<Todo[]>('/todos/', { params: { completed } });
  return response.data;
};

export const updateTodo = async (id: string, data: { content?: string; is_completed?: boolean; sort_order?: number }): Promise<Todo> => {
  const response = await api.put<Todo>(`/todos/${id}`, data);
  return response.data;
};

export const deleteTodo = async (id: string): Promise<void> => {
  await api.delete(`/todos/${id}`);
};

// ── API Token ──

export interface ApiTokenInfo {
  id: string;
  name: string;
  created_at: string;
  last_used_at: string | null;
}

export interface ApiTokenCreated extends ApiTokenInfo {
  token: string;
}

export const createApiToken = async (name: string): Promise<ApiTokenCreated> => {
  const response = await api.post<ApiTokenCreated>('/tokens/', { name });
  return response.data;
};

export const getApiTokens = async (): Promise<ApiTokenInfo[]> => {
  const response = await api.get<ApiTokenInfo[]>('/tokens/');
  return response.data;
};

export const deleteApiToken = async (id: string): Promise<void> => {
  await api.delete(`/tokens/${id}`);
};

// Trash
export interface TrashItem {
  id: string;
  title?: string;
  content?: string;
  type?: string;
  deleted_at: string;
  original_parent_id?: string | null;
}

export interface TrashResponse {
  documents: TrashItem[];
  memos: TrashItem[];
}

export const getTrash = async (): Promise<TrashResponse> => {
  const response = await api.get<TrashResponse>('/trash/');
  return response.data;
};

export const restoreFromTrash = async (itemType: 'document' | 'memo', itemId: string): Promise<void> => {
  await api.post(`/trash/restore/${itemType}/${itemId}`);
  dataCache.invalidate('documents:');
};

export const permanentDelete = async (itemType: 'document' | 'memo', itemId: string): Promise<void> => {
  await api.delete(`/trash/${itemType}/${itemId}`);
};

export const emptyTrash = async (): Promise<void> => {
  await api.post('/trash/empty');
};

// Share - URL 内容抓取 + 创建 memo
export interface ShareResponse {
  memo_id: string;
  content: string;
  images_count: number;
}

export const shareContent = async (data: { url?: string; title?: string; text?: string; extracted_content?: string }): Promise<ShareResponse> => {
  const response = await api.post<ShareResponse>('/share/', data);
  dataCache.invalidate('memos:');
  return response.data;
};

// ── Habit ──

export interface Habit {
  id: string;
  name: string;
  icon: string;
  sort_order: number;
  is_archived: boolean;
  created_at: string;
  week_records: string[]; // 本周已打卡日期 ["2026-06-02", ...]
}

export const getHabits = async (weekOffset: number = 0): Promise<Habit[]> => {
  const response = await api.get<Habit[]>('/habits/', { params: { week_offset: weekOffset } });
  return response.data;
};

export const createHabit = async (name: string, icon: string = '📌'): Promise<Habit> => {
  const response = await api.post<Habit>('/habits/', { name, icon });
  return response.data;
};

export const updateHabit = async (id: string, data: { name?: string; icon?: string }): Promise<Habit> => {
  const response = await api.put<Habit>(`/habits/${id}`, data);
  return response.data;
};

export const deleteHabit = async (id: string): Promise<void> => {
  await api.delete(`/habits/${id}`);
};

export const toggleHabitRecord = async (id: string, date: string): Promise<{ checked: boolean; date: string }> => {
  const response = await api.post<{ checked: boolean; date: string }>(`/habits/${id}/toggle`, { date });
  return response.data;
};

export const updatePassword = async (oldPassword: string, newPassword: string): Promise<void> => {
  await api.put('/users/password', { old_password: oldPassword, new_password: newPassword });
};

// ── AI ──

export interface AIConfig {
  id: string;
  name: string;
  provider: string;
  api_url: string;
  api_key: string;
  model: string;
  purpose: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface AIConfigCreate {
  name: string;
  provider: string;
  api_url: string;
  api_key: string;
  model: string;
  purpose?: string;
  is_default?: boolean;
}

export interface AIConfigUpdate {
  name?: string;
  provider?: string;
  api_url?: string;
  api_key?: string;
  model?: string;
  purpose?: string;
  is_default?: boolean;
}

export const getAIConfigs = async (): Promise<AIConfig[]> => {
  const response = await api.get<AIConfig[]>('/ai/configs');
  return response.data;
};

export const createAIConfig = async (config: AIConfigCreate): Promise<AIConfig> => {
  const response = await api.post<AIConfig>('/ai/configs', config);
  return response.data;
};

export const updateAIConfig = async (id: string, data: AIConfigUpdate): Promise<AIConfig> => {
  const response = await api.put<AIConfig>(`/ai/configs/${id}`, data);
  return response.data;
};

export const deleteAIConfig = async (id: string): Promise<void> => {
  await api.delete(`/ai/configs/${id}`);
};

export const testAIConfig = async (id: string): Promise<{ ok: boolean; message: string }> => {
  const response = await api.post<{ ok: boolean; message: string }>(`/ai/configs/${id}/test`);
  return response.data;
};

export const reindexEmbeddings = async (): Promise<{ success: boolean; message: string; total_memos?: number; total_docs?: number }> => {
  const response = await api.post('/ai/reindex');
  return response.data;
};

export interface ReindexStatus {
  running: boolean;
  memos_indexed: number;
  docs_indexed: number;
  memos_skipped: number;
  docs_skipped: number;
  errors: number;
  total_memos: number;
  total_docs: number;
  current: string;
  done: boolean;
  message: string;
}

export const getReindexStatus = async (): Promise<ReindexStatus> => {
  const response = await api.get('/ai/reindex-status');
  return response.data;
};

// AI 流式对话（不走 axios，直接 fetch 处理流）
export const aiChat = async function* (
  messages: { role: string; content: string }[],
  context: string,
  aiConfigId?: string
): AsyncGenerator<string> {
  const token = localStorage.getItem('token');
  const resp = await fetch('/api/ai/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ messages, context, ai_config_id: aiConfigId })
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(errText || `HTTP ${resp.status}`);
  }

  const reader = resp.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    yield decoder.decode(value);
  }
};

// AI 问答（流式返回，按行分割 JSON）
export const askAI = async function* (
  messages: { role: string; content: string }[],
  conversationId?: string,
  mode: 'data' | 'web' = 'data'
): AsyncGenerator<string> {
  const token = localStorage.getItem('token');
  const resp = await fetch('/api/ai/ask', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ messages, conversation_id: conversationId, mode })
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(errText || `HTTP ${resp.status}`);
  }

  const reader = resp.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (line.trim()) yield line;
    }
  }
  if (buffer.trim()) yield buffer;
};

// AI 对话历史
export interface AIConversation {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

export interface AIMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: Array<{ id: string; title: string; type: string; snippet: string }>;
  created_at: string;
}

export interface AIConversationDetail extends AIConversation {
  messages: AIMessage[];
}

export const getAIConversations = async (): Promise<AIConversation[]> => {
  const response = await api.get<AIConversation[]>('/ai/conversations/');
  return response.data;
};

export const getAIConversation = async (id: string): Promise<AIConversationDetail> => {
  const response = await api.get<AIConversationDetail>(`/ai/conversations/${id}`);
  return response.data;
};

export const deleteAIConversation = async (id: string): Promise<void> => {
  await api.delete(`/ai/conversations/${id}`);
};

// AI Skills
export interface Skill {
  id: string;
  name: string;
  icon: string;
  description: string;
  prompt: string;
}

export const getSkills = async (): Promise<Skill[]> => {
  const response = await api.get<Skill[]>('/skills/');
  return response.data;
};
