/**
 * 数据 API 适配层
 *
 * 根据当前模式（本地/远程）自动选择正确的数据提供者
 * 让现有代码无需大幅修改即可支持本地模式
 */

import { Capacitor } from '@capacitor/core';
import type { DataProvider } from '../data/provider';
import { LocalProvider } from '../data/local-provider';
import { RemoteProvider } from '../data/remote-provider';

// 全局数据提供者实例
let provider: DataProvider | null = null;

// 获取当前模式
function getMode(): string {
  return localStorage.getItem('dataMode') || 'local';
}

// 获取或初始化提供者
async function getProvider(): Promise<DataProvider> {
  if (provider) return provider;

  const mode = getMode();
  if (mode === 'local') {
    provider = new LocalProvider();
  } else {
    provider = new RemoteProvider();
  }

  await provider.initialize();
  return provider;
}

// 初始化适配器（应用启动时调用）
export async function initDataAdapter(): Promise<void> {
  await getProvider();
}

// 切换提供者（模式切换时调用）
export async function switchDataProvider(mode: 'local' | 'remote', serverUrl?: string): Promise<void> {
  if (mode === 'local') {
    provider = new LocalProvider();
  } else {
    provider = new RemoteProvider(serverUrl);
  }
  await provider.initialize();
}

// ─── 以下函数是对原有 API 的兼容封装 ─────────────────────

// 重新导出类型
export type { Document, Node, Memo, Todo } from '../data/provider';

// 文档相关
export const getDocuments = async (search?: string) => {
  const p = await getProvider();
  return p.getDocuments(search);
};

export const getDocument = async (id: string) => {
  const p = await getProvider();
  const doc = await p.getDocument(id);
  if (!doc) throw new Error('Document not found');
  return doc;
};

export const createDocument = async (
  title: string,
  type: string = 'document',
  parent_id: string | null = null,
  sort_order: number = Date.now() / 1000,
  aiExcluded: boolean = false
) => {
  const p = await getProvider();
  return p.createDocument({ title, type, parent_id, sort_order, ai_excluded: aiExcluded });
};

export const updateDocument = async (id: string, data: any) => {
  const p = await getProvider();
  return p.updateDocument(id, data);
};

export const deleteDocument = async (id: string) => {
  const p = await getProvider();
  return p.deleteDocument(id);
};

export const copyDocument = async (id: string) => {
  const p = await getProvider();
  return p.copyDocument(id);
};

// 节点相关
export const getNodes = async (documentId: string) => {
  const p = await getProvider();
  return p.getNodes(documentId);
};

export const createNode = async (
  document_id: string,
  content: string = '',
  parent_node_id: string | null = null,
  options: any = {}
) => {
  const p = await getProvider();
  return p.createNode({
    document_id,
    content,
    parent_node_id,
    sort_order: options.sort_order || 0,
    ...options,
  });
};

export const updateNode = async (id: string, data: any) => {
  const p = await getProvider();
  return p.updateNode(id, data);
};

export const deleteNode = async (id: string) => {
  const p = await getProvider();
  return p.deleteNode(id);
};

export const moveNode = async (id: string, parent_node_id: string | null, sort_order: number) => {
  const p = await getProvider();
  return p.moveNode(id, parent_node_id, sort_order);
};

// 批量操作
export const createNodesBatch = async (nodesData: any[]) => {
  const p = await getProvider();
  return p.batchCreateNodes(nodesData);
};

export const batchUpdateNodes = async (updates: any[]) => {
  const p = await getProvider();
  return p.batchUpdateNodes(updates.map(u => ({ id: u.id, changes: u })));
};

export const batchMoveNodes = async (updates: any[]) => {
  const p = await getProvider();
  // 批量移动实际上是批量更新 parent_node_id 和 sort_order
  return p.batchUpdateNodes(updates.map(u => ({
    id: u.id,
    changes: { parent_node_id: u.parent_node_id, sort_order: u.sort_order }
  })));
};

export const batchDeleteNodes = async (ids: string[]) => {
  const p = await getProvider();
  return p.batchDeleteNodes(ids);
};

// 文件上传（本地模式下存储在本地文件系统）
export const uploadFile = async (file: File): Promise<any> => {
  const p = await getProvider();
  const mode = getMode();

  if (mode === 'local') {
    // 本地模式：将文件转换为 base64 存储
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result as string;
        const id = Date.now().toString(36) + Math.random().toString(36).substr(2);
        resolve({
          file_path: `local://${id}`,
          file_name: file.name,
          file_type: file.type,
          file_size: file.size,
          data: base64, // 包含 base64 数据
        });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // 远程模式：调用原有 API
  const { uploadFile: remoteUpload } = await import('./data');
  return remoteUpload(file);
};

export const getFileUrl = (filePath: string): string => {
  if (filePath.startsWith('local://')) {
    // 本地模式：返回 base64 数据（需要从存储中获取）
    return filePath;
  }
  // 远程模式：返回服务器 URL
  return `/uploads/${filePath}`;
};

export const getThumbnailUrl = (filePath: string): string => {
  if (filePath.startsWith('local://')) {
    return filePath;
  }
  const base = filePath.replace(/\.[^.]+$/, '');
  return `/uploads/thumbs/${base}.jpg`;
};

// Memo 相关
export const getMemos = async (page = 1, pageSize = 20, archived = false) => {
  const p = await getProvider();
  return p.getMemos(page, pageSize, archived);
};

export const getMemo = async (id: string) => {
  const p = await getProvider();
  const memo = await p.getMemo(id);
  if (!memo) throw new Error('Memo not found');
  return memo;
};

export const createMemo = async (data: any) => {
  const p = await getProvider();
  return p.createMemo(data);
};

export const updateMemo = async (id: string, data: any) => {
  const p = await getProvider();
  return p.updateMemo(id, data);
};

export const deleteMemo = async (id: string) => {
  const p = await getProvider();
  return p.deleteMemo(id);
};

// Todo 相关
export const getTodos = async (completed?: boolean) => {
  const p = await getProvider();
  return p.getTodos(completed);
};

export const createTodo = async (data: any) => {
  const p = await getProvider();
  return p.createTodo(data);
};

export const updateTodo = async (id: string, data: any) => {
  const p = await getProvider();
  return p.updateTodo(id, data);
};

export const deleteTodo = async (id: string) => {
  const p = await getProvider();
  return p.deleteTodo(id);
};

// 搜索
export const search = async (query: string) => {
  const p = await getProvider();
  return p.search(query);
};

// 以下函数在本地模式下需要特殊处理或返回空值

export const getMemoTags = async (): Promise<string[]> => {
  const mode = getMode();
  if (mode === 'local') {
    // 本地模式：返回空标签列表（后续可以实现本地标签提取）
    return [];
  }
  const { getMemoTags: remoteGetTags } = await import('./data');
  return remoteGetTags();
};

export const getRecentDocuments = async (limit: number = 20) => {
  const p = await getProvider();
  const docs = await p.getDocuments();
  // 按 updated_at 排序，返回最近的
  return docs
    .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''))
    .slice(0, limit);
};

// 日记相关（本地模式下简化实现）
export const getDiaryMonths = async () => {
  const mode = getMode();
  if (mode === 'local') {
    // 本地模式：返回空月份列表
    return [];
  }
  const { getDiaryMonths: remoteGet } = await import('./data');
  return remoteGet();
};

export const getMonthlyDiary = async (year: number, month: number) => {
  const mode = getMode();
  if (mode === 'local') {
    // 本地模式：创建或获取日记文档
    const p = await getProvider();
    const docs = await p.getDocuments();
    const title = `${year}年${month}月`;
    let doc = docs.find(d => d.title === title && d.type === 'document');
    if (!doc) {
      doc = await p.createDocument({ title, type: 'document' });
    }
    const nodes = await p.getNodes(doc.id);
    return { document: doc, nodes, is_new: nodes.length === 0 };
  }
  const { getMonthlyDiary: remoteGet } = await import('./data');
  return remoteGet(year, month);
};

export const getOrCreateDayNode = async (year: number, month: number, day: number) => {
  const mode = getMode();
  if (mode === 'local') {
    // 本地模式简化实现
    return { node_id: '', is_new: false, child_node: null };
  }
  const { getOrCreateDayNode: remoteGet } = await import('./data');
  return remoteGet(year, month, day);
};

export const getDiaryDayDates = async (year: number, month: number) => {
  const mode = getMode();
  if (mode === 'local') {
    return [];
  }
  const { getDiaryDayDates: remoteGet } = await import('./data');
  return remoteGet(year, month);
};

export const getDiarySummary = async () => {
  const mode = getMode();
  if (mode === 'local') {
    return { tasks: [], tags: [] };
  }
  const { getDiarySummary: remoteGet } = await import('./data');
  return remoteGet();
};

// 分享相关（本地模式下不支持）
export const createShare = async (documentId: string) => {
  const mode = getMode();
  if (mode === 'local') {
    throw new Error('本地模式不支持分享功能');
  }
  const { createShare: remoteCreate } = await import('./data');
  return remoteCreate(documentId);
};

export const getShare = async (documentId: string) => {
  const mode = getMode();
  if (mode === 'local') {
    return null;
  }
  const { getShare: remoteGet } = await import('./data');
  return remoteGet(documentId);
};

export const deleteShare = async (token: string) => {
  const mode = getMode();
  if (mode === 'local') {
    return;
  }
  const { deleteShare: remoteDelete } = await import('./data');
  return remoteDelete(token);
};

export const getSharedDocument = async (token: string) => {
  throw new Error('本地模式不支持查看分享');
};

// 链接预览（本地模式下不支持）
export const fetchLinkPreview = async (url: string) => {
  const mode = getMode();
  if (mode === 'local') {
    return null;
  }
  const { fetchLinkPreview: remoteFetch } = await import('./data');
  return remoteFetch(url);
};

export const retryLinkPreview = async (id: string) => {
  const mode = getMode();
  if (mode === 'local') {
    return null;
  }
  const { retryLinkPreview: remoteRetry } = await import('./data');
  return remoteRetry(id);
};

// AI 相关（本地模式下不支持）
export const getAIConfigs = async () => {
  const mode = getMode();
  if (mode === 'local') {
    return [];
  }
  const { getAIConfigs: remoteGet } = await import('./data');
  return remoteGet();
};

export const getHabits = async () => {
  const mode = getMode();
  if (mode === 'local') {
    return [];
  }
  const { getHabits: remoteGet } = await import('./data');
  return remoteGet();
};

export const createHabit = async (data: any) => {
  const mode = getMode();
  if (mode === 'local') {
    throw new Error('本地模式暂不支持习惯打卡');
  }
  const { createHabit: remoteCreate } = await import('./data');
  return remoteCreate(data);
};

export const deleteHabit = async (id: string) => {
  const mode = getMode();
  if (mode === 'local') {
    return;
  }
  const { deleteHabit: remoteDelete } = await import('./data');
  return remoteDelete(id);
};

export const toggleHabitRecord = async (habitId: string, date: string) => {
  const mode = getMode();
  if (mode === 'local') {
    throw new Error('本地模式暂不支持习惯打卡');
  }
  const { toggleHabitRecord: remoteToggle } = await import('./data');
  return remoteToggle(habitId, date);
};

export const getHabitRecords = async (habitId: string, startDate: string, endDate: string) => {
  const mode = getMode();
  if (mode === 'local') {
    return [];
  }
  const { getHabitRecords: remoteGet } = await import('./data');
  return remoteGet(habitId, startDate, endDate);
};

// API Token（本地模式下不支持）
export interface ApiTokenInfo {
  id: string;
  name: string;
  created_at: string;
  last_used_at: string | null;
}

export interface ApiTokenCreated extends ApiTokenInfo {
  token: string;
}

export const getApiTokens = async (): Promise<ApiTokenInfo[]> => {
  const mode = getMode();
  if (mode === 'local') {
    return [];
  }
  const { getApiTokens: remoteGet } = await import('./data');
  return remoteGet();
};

export const createApiToken = async (name: string): Promise<ApiTokenCreated> => {
  const mode = getMode();
  if (mode === 'local') {
    throw new Error('本地模式不支持 API Token');
  }
  const { createApiToken: remoteCreate } = await import('./data');
  return remoteCreate(name);
};

export const deleteApiToken = async (id: string): Promise<void> => {
  const mode = getMode();
  if (mode === 'local') {
    return;
  }
  const { deleteApiToken: remoteDelete } = await import('./data');
  return remoteDelete(id);
};

export const getTokens = getApiTokens;
export const createToken = createApiToken;
export const deleteToken = deleteApiToken;

// 回收站（本地模式下简化实现）
export const getTrashedDocuments = async () => {
  const mode = getMode();
  if (mode === 'local') {
    return [];
  }
  const { getTrashedDocuments: remoteGet } = await import('./data');
  return remoteGet();
};

export const restoreDocument = async (id: string) => {
  const mode = getMode();
  if (mode === 'local') {
    return;
  }
  const { restoreDocument: remoteRestore } = await import('./data');
  return remoteRestore(id);
};

export const permanentlyDeleteDocument = async (id: string) => {
  const mode = getMode();
  if (mode === 'local') {
    return;
  }
  const { permanentlyDeleteDocument: remoteDelete } = await import('./data');
  return remoteDelete(id);
};

export const getTrashedMemos = async () => {
  const mode = getMode();
  if (mode === 'local') {
    return [];
  }
  const { getTrashedMemos: remoteGet } = await import('./data');
  return remoteGet();
};

export const restoreMemo = async (id: string) => {
  const mode = getMode();
  if (mode === 'local') {
    return;
  }
  const { restoreMemo: remoteRestore } = await import('./data');
  return remoteRestore(id);
};

export const permanentlyDeleteMemo = async (id: string) => {
  const mode = getMode();
  if (mode === 'local') {
    return;
  }
  const { permanentlyDeleteMemo: remoteDelete } = await import('./data');
  return remoteDelete(id);
};

// 附件删除
export const deleteAttachment = async (id: string) => {
  const p = await getProvider();
  return p.deleteAttachment(id);
};

// 用户设置（本地模式下存储在 localStorage）
export const updateSettings = async (settings: any) => {
  const mode = getMode();
  if (mode === 'local') {
    localStorage.setItem('userSettings', JSON.stringify(settings));
    return;
  }
  const { updateSettings: remoteUpdate } = await import('./data');
  return remoteUpdate(settings);
};

export const updatePassword = async (oldPassword: string, newPassword: string) => {
  const mode = getMode();
  if (mode === 'local') {
    throw new Error('本地模式不支持修改密码');
  }
  const { updatePassword: remoteUpdate } = await import('./data');
  return remoteUpdate(oldPassword, newPassword);
};

// ─── 回收站相关 ──────────────────────────────────────────

export interface TrashItem {
  id: string;
  type: 'document' | 'memo';
  title: string;
  content?: string;
  deleted_at: string;
}

export interface TrashResponse {
  documents: TrashItem[];
  memos: TrashItem[];
}

export const getTrash = async (): Promise<TrashResponse> => {
  const mode = getMode();
  if (mode === 'local') {
    return { documents: [], memos: [] };
  }
  const { getTrash: remoteGet } = await import('./data');
  return remoteGet();
};

export const restoreFromTrash = async (itemType: 'document' | 'memo', itemId: string): Promise<void> => {
  const mode = getMode();
  if (mode === 'local') {
    // 本地模式：恢复软删除
    return;
  }
  const { restoreFromTrash: remoteRestore } = await import('./data');
  return remoteRestore(itemType, itemId);
};

export const permanentDelete = async (itemType: 'document' | 'memo', itemId: string): Promise<void> => {
  const mode = getMode();
  if (mode === 'local') {
    return;
  }
  const { permanentDelete: remoteDelete } = await import('./data');
  return remoteDelete(itemType, itemId);
};

export const emptyTrash = async (): Promise<void> => {
  const mode = getMode();
  if (mode === 'local') {
    return;
  }
  const { emptyTrash: remoteEmpty } = await import('./data');
  return remoteEmpty();
};

// ─── 分享内容相关 ────────────────────────────────────────

export interface ShareResponse {
  id: string;
  token: string;
  url: string;
}

export const shareContent = async (data: { url?: string; title?: string; text?: string; extracted_content?: string }): Promise<ShareResponse> => {
  const mode = getMode();
  if (mode === 'local') {
    throw new Error('本地模式不支持分享功能');
  }
  const { shareContent: remoteShare } = await import('./data');
  return remoteShare(data);
};

// ─── 习惯打卡相关 ────────────────────────────────────────

export interface Habit {
  id: string;
  name: string;
  icon: string;
  sort_order: number;
  is_archived: boolean;
  created_at: string;
  records?: { date: string; checked: boolean }[];
}

export const updateHabit = async (id: string, data: { name?: string; icon?: string }): Promise<Habit> => {
  const mode = getMode();
  if (mode === 'local') {
    throw new Error('本地模式暂不支持习惯打卡');
  }
  const { updateHabit: remoteUpdate } = await import('./data');
  return remoteUpdate(id, data);
};

// ─── AI 配置相关 ─────────────────────────────────────────

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

export const createAIConfig = async (config: AIConfigCreate): Promise<AIConfig> => {
  const mode = getMode();
  if (mode === 'local') {
    throw new Error('本地模式不支持 AI 配置');
  }
  const { createAIConfig: remoteCreate } = await import('./data');
  return remoteCreate(config);
};

export const updateAIConfig = async (id: string, data: AIConfigUpdate): Promise<AIConfig> => {
  const mode = getMode();
  if (mode === 'local') {
    throw new Error('本地模式不支持 AI 配置');
  }
  const { updateAIConfig: remoteUpdate } = await import('./data');
  return remoteUpdate(id, data);
};

export const deleteAIConfig = async (id: string): Promise<void> => {
  const mode = getMode();
  if (mode === 'local') {
    return;
  }
  const { deleteAIConfig: remoteDelete } = await import('./data');
  return remoteDelete(id);
};

export const testAIConfig = async (id: string): Promise<{ ok: boolean; message: string }> => {
  const mode = getMode();
  if (mode === 'local') {
    throw new Error('本地模式不支持 AI 配置');
  }
  const { testAIConfig: remoteTest } = await import('./data');
  return remoteTest(id);
};

export const reindexEmbeddings = async (): Promise<{ success: boolean; message: string; total_memos?: number; total_docs?: number }> => {
  const mode = getMode();
  if (mode === 'local') {
    throw new Error('本地模式不支持向量索引');
  }
  const { reindexEmbeddings: remoteReindex } = await import('./data');
  return remoteReindex();
};

export interface ReindexStatus {
  is_running: boolean;
  progress: number;
  total: number;
  message: string;
}

export const getReindexStatus = async (): Promise<ReindexStatus> => {
  const mode = getMode();
  if (mode === 'local') {
    return { is_running: false, progress: 0, total: 0, message: '' };
  }
  const { getReindexStatus: remoteGet } = await import('./data');
  return remoteGet();
};

// ─── AI 对话相关 ─────────────────────────────────────────

export const aiChat = async function* (message: string, context?: string, conversationId?: string): AsyncGenerator<string> {
  const mode = getMode();
  if (mode === 'local') {
    throw new Error('本地模式不支持 AI 对话');
  }
  const { aiChat: remoteChat } = await import('./data');
  yield* remoteChat(message, context, conversationId);
};

export const askAI = async function* (question: string, context?: string): AsyncGenerator<string> {
  const mode = getMode();
  if (mode === 'local') {
    throw new Error('本地模式不支持 AI 对话');
  }
  const { askAI: remoteAsk } = await import('./data');
  yield* remoteAsk(question, context);
};

export interface AIConversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface AIMessage {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  sources?: string;
  created_at: string;
}

export interface AIConversationDetail extends AIConversation {
  messages: AIMessage[];
}

export const getAIConversations = async (): Promise<AIConversation[]> => {
  const mode = getMode();
  if (mode === 'local') {
    return [];
  }
  const { getAIConversations: remoteGet } = await import('./data');
  return remoteGet();
};

export const getAIConversation = async (id: string): Promise<AIConversationDetail> => {
  const mode = getMode();
  if (mode === 'local') {
    throw new Error('本地模式不支持 AI 对话');
  }
  const { getAIConversation: remoteGet } = await import('./data');
  return remoteGet(id);
};

export const deleteAIConversation = async (id: string): Promise<void> => {
  const mode = getMode();
  if (mode === 'local') {
    return;
  }
  const { deleteAIConversation: remoteDelete } = await import('./data');
  return remoteDelete(id);
};

// ─── Skills 相关 ─────────────────────────────────────────

export interface Skill {
  id: string;
  name: string;
  description: string;
  content: string;
  is_builtin: boolean;
  created_at: string;
}

export const getSkills = async (): Promise<Skill[]> => {
  const mode = getMode();
  if (mode === 'local') {
    return [];
  }
  const { getSkills: remoteGet } = await import('./data');
  return remoteGet();
};

// ─── 其他缺失的导出 ─────────────────────────────────────

export const uploadAudio = async (file: File): Promise<any> => {
  const mode = getMode();
  if (mode === 'local') {
    return uploadFile(file);
  }
  const { uploadAudio: remoteUpload } = await import('./data');
  return remoteUpload(file);
};

export const uploadFromUrl = async (url: string): Promise<any> => {
  const mode = getMode();
  if (mode === 'local') {
    throw new Error('本地模式不支持 URL 上传');
  }
  const { uploadFromUrl: remoteUpload } = await import('./data');
  return remoteUpload(url);
};

export const toggleMemoPinned = async (id: string, is_pinned: boolean): Promise<any> => {
  const mode = getMode();
  if (mode === 'local') {
    const p = await getProvider();
    return p.updateMemo(id, { is_pinned });
  }
  const { toggleMemoPinned: remoteToggle } = await import('./data');
  return remoteToggle(id, is_pinned);
};

export const toggleMemoArchived = async (id: string, is_archived: boolean): Promise<any> => {
  const mode = getMode();
  if (mode === 'local') {
    const p = await getProvider();
    return p.updateMemo(id, { is_archived });
  }
  const { toggleMemoArchived: remoteToggle } = await import('./data');
  return remoteToggle(id, is_archived);
};

export const updateMemoColor = async (id: string, color: string | null): Promise<any> => {
  const mode = getMode();
  if (mode === 'local') {
    const p = await getProvider();
    return p.updateMemo(id, { color });
  }
  const { updateMemoColor: remoteUpdate } = await import('./data');
  return remoteUpdate(id, color);
};

export const toggleMemoPublic = async (id: string, is_public: boolean): Promise<any> => {
  const mode = getMode();
  if (mode === 'local') {
    const p = await getProvider();
    return p.updateMemo(id, { is_public });
  }
  const { toggleMemoPublic: remoteToggle } = await import('./data');
  return remoteToggle(id, is_public);
};

export const toggleMemoAI = async (id: string, ai_excluded: boolean): Promise<any> => {
  const mode = getMode();
  if (mode === 'local') {
    const p = await getProvider();
    return p.updateMemo(id, { ai_excluded });
  }
  const { toggleMemoAI: remoteToggle } = await import('./data');
  return remoteToggle(id, ai_excluded);
};

export const getMemoHeatmap = async (year: number, month: number): Promise<any> => {
  const mode = getMode();
  if (mode === 'local') {
    return { days: {} };
  }
  const { getMemoHeatmap: remoteGet } = await import('./data');
  return remoteGet(year, month);
};

export type SearchResultType = 'document' | 'diary' | 'memo' | 'document_title';

export interface SearchResultItem {
  id: string;
  type: SearchResultType;
  title: string;
  content?: string;
  document_id?: string;
  diary_date?: string;
  highlight?: string;
}

export interface SearchResponse {
  results: SearchResultItem[];
  total: number;
}

export interface MemoHeatmapResponse {
  days: { [date: string]: number };
}

export interface UploadResponse {
  file_path: string;
  file_name: string;
  file_type: string;
  file_size: number;
}

export interface DiaryMonthItem {
  year: number;
  month: number;
  count: number;
}

export interface LinkPreview {
  id?: string;
  url: string;
  title?: string;
  description?: string;
  image?: string;
  favicon?: string;
  site_name?: string;
  status?: 'loading' | 'loaded' | 'error';
  error?: string;
}

export function getCachedPreviewUrls(): string[] {
  return [];
}

export function getCachedPreview(url: string): LinkPreview | null {
  return null;
}

export function getFailedPreviewUrls(): string[] {
  return [];
}
