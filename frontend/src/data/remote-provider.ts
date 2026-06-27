/**
 * 远程 API 数据提供者
 *
 * 通过 HTTP API 与后端服务器通信
 * 复用现有的 api/client.ts
 */

import type { DataProvider } from './provider';
import type { Document, Node, Memo, Todo } from '../api/data';
import api from '../api/client';
import * as dataApi from '../api/data';

export class RemoteProvider implements DataProvider {
  readonly mode = 'remote';
  private serverUrl: string;

  constructor(serverUrl: string = '') {
    this.serverUrl = serverUrl;
  }

  async initialize(): Promise<void> {
    // 远程模式不需要特殊初始化
    // API client 已经配置好了
  }

  // ─── 文档 ───────────────────────────────────────────────

  async getDocuments(search?: string): Promise<Document[]> {
    return dataApi.getDocuments(search);
  }

  async getDocument(id: string): Promise<Document | null> {
    try {
      return await dataApi.getDocument(id);
    } catch (e: any) {
      if (e.response?.status === 404) return null;
      throw e;
    }
  }

  async createDocument(doc: Partial<Document>): Promise<Document> {
    return dataApi.createDocument(doc);
  }

  async updateDocument(id: string, changes: Partial<Document>): Promise<Document> {
    return dataApi.updateDocument(id, changes);
  }

  async deleteDocument(id: string): Promise<void> {
    await dataApi.deleteDocument(id);
  }

  async copyDocument(id: string): Promise<Document> {
    const response = await api.post(`/documents/${id}/copy`);
    return response.data;
  }

  // ─── 节点 ───────────────────────────────────────────────

  async getNodes(documentId: string): Promise<Node[]> {
    return dataApi.getNodes(documentId);
  }

  async getNode(id: string): Promise<Node | null> {
    // 远程 API 没有单个节点获取接口，从文档节点列表中查找
    return null;
  }

  async createNode(node: Partial<Node>): Promise<Node> {
    return dataApi.createNode(node);
  }

  async updateNode(id: string, changes: Partial<Node>): Promise<Node> {
    return dataApi.updateNode(id, changes);
  }

  async deleteNode(id: string): Promise<void> {
    await dataApi.deleteNode(id);
  }

  async moveNode(id: string, parentId: string | null, sortOrder: number): Promise<Node> {
    return dataApi.moveNode(id, { parent_node_id: parentId, sort_order: sortOrder });
  }

  // ─── 批量操作 ───────────────────────────────────────────

  async batchCreateNodes(nodes: Partial<Node>[]): Promise<Node[]> {
    return dataApi.createNodesBatch(nodes);
  }

  async batchUpdateNodes(updates: { id: string; changes: Partial<Node> }[]): Promise<Node[]> {
    return dataApi.batchUpdateNodes(updates.map(u => ({ id: u.id, ...u.changes })));
  }

  async batchDeleteNodes(ids: string[]): Promise<void> {
    await dataApi.batchDeleteNodes(ids);
  }

  // ─── Memo ───────────────────────────────────────────────

  async getMemos(page = 1, pageSize = 20, archived = false): Promise<{ memos: Memo[]; total: number }> {
    return dataApi.getMemos(page, pageSize, archived);
  }

  async getMemo(id: string): Promise<Memo | null> {
    try {
      return await dataApi.getMemo(id);
    } catch (e: any) {
      if (e.response?.status === 404) return null;
      throw e;
    }
  }

  async createMemo(memo: Partial<Memo>): Promise<Memo> {
    return dataApi.createMemo(memo);
  }

  async updateMemo(id: string, changes: Partial<Memo>): Promise<Memo> {
    return dataApi.updateMemo(id, changes);
  }

  async deleteMemo(id: string): Promise<void> {
    await dataApi.deleteMemo(id);
  }

  // ─── Todo ───────────────────────────────────────────────

  async getTodos(completed?: boolean): Promise<Todo[]> {
    return dataApi.getTodos(completed);
  }

  async createTodo(todo: Partial<Todo>): Promise<Todo> {
    return dataApi.createTodo(todo);
  }

  async updateTodo(id: string, changes: Partial<Todo>): Promise<Todo> {
    return dataApi.updateTodo(id, changes);
  }

  async deleteTodo(id: string): Promise<void> {
    await dataApi.deleteTodo(id);
  }

  // ─── 搜索 ───────────────────────────────────────────────

  async search(query: string): Promise<any[]> {
    return dataApi.search(query);
  }

  // ─── 附件 ───────────────────────────────────────────────

  async uploadFile(file: File): Promise<any> {
    return dataApi.uploadFile(file);
  }

  async deleteAttachment(id: string): Promise<void> {
    await dataApi.deleteAttachment(id);
  }
}
