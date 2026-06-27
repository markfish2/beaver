/**
 * 数据提供者抽象接口
 *
 * 支持三种模式：
 * 1. LocalProvider - 纯本地模式（SQLite）
 * 2. RemoteProvider - 纯远程模式（API）
 * 3. HybridProvider - 混合模式（本地优先 + 云端同步）
 */

import type { Document, Node, Memo, Todo } from '../api/data';

export type DataMode = 'local' | 'remote' | 'hybrid';

export interface DataProvider {
  readonly mode: DataMode;

  // ─── 初始化 ─────────────────────────────────────────────
  initialize(): Promise<void>;

  // ─── 文档 ───────────────────────────────────────────────
  getDocuments(search?: string): Promise<Document[]>;
  getDocument(id: string): Promise<Document | null>;
  createDocument(doc: Partial<Document>): Promise<Document>;
  updateDocument(id: string, changes: Partial<Document>): Promise<Document>;
  deleteDocument(id: string): Promise<void>;
  copyDocument(id: string): Promise<Document>;

  // ─── 节点 ───────────────────────────────────────────────
  getNodes(documentId: string): Promise<Node[]>;
  getNode(id: string): Promise<Node | null>;
  createNode(node: Partial<Node>): Promise<Node>;
  updateNode(id: string, changes: Partial<Node>): Promise<Node>;
  deleteNode(id: string): Promise<void>;
  moveNode(id: string, parentId: string | null, sortOrder: number): Promise<Node>;

  // ─── 批量操作 ───────────────────────────────────────────
  batchCreateNodes(nodes: Partial<Node>[]): Promise<Node[]>;
  batchUpdateNodes(updates: { id: string; changes: Partial<Node> }[]): Promise<Node[]>;
  batchDeleteNodes(ids: string[]): Promise<void>;

  // ─── Memo ───────────────────────────────────────────────
  getMemos(page?: number, pageSize?: number, archived?: boolean): Promise<{ memos: Memo[]; total: number }>;
  getMemo(id: string): Promise<Memo | null>;
  createMemo(memo: Partial<Memo>): Promise<Memo>;
  updateMemo(id: string, changes: Partial<Memo>): Promise<Memo>;
  deleteMemo(id: string): Promise<void>;

  // ─── Todo ───────────────────────────────────────────────
  getTodos(completed?: boolean): Promise<Todo[]>;
  createTodo(todo: Partial<Todo>): Promise<Todo>;
  updateTodo(id: string, changes: Partial<Todo>): Promise<Todo>;
  deleteTodo(id: string): Promise<void>;

  // ─── 搜索 ───────────────────────────────────────────────
  search(query: string): Promise<any[]>;

  // ─── 附件 ───────────────────────────────────────────────
  uploadFile(file: File): Promise<any>;
  deleteAttachment(id: string): Promise<void>;

  // ─── 同步（仅 HybridProvider 需要）────────────────────────
  sync?(): Promise<void>;
  getLastSyncTime?(): Promise<Date | null>;
}
