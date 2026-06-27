/**
 * 本地 SQLite 数据提供者
 *
 * 使用 Capacitor SQLite 插件在设备本地存储数据
 * 支持离线使用，无需服务器
 */

import { Capacitor } from '@capacitor/core';
import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite';
import type { DataProvider } from './provider';
import type { Document, Node, Memo, Todo } from '../api/data';
import { v4 as uuidv4 } from 'uuid';

const DB_NAME = 'beaver_local';

export class LocalProvider implements DataProvider {
  readonly mode = 'local';
  private sqlite: SQLiteConnection | null = null;
  private db: SQLiteDBConnection | null = null;
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    const platform = Capacitor.getPlatform();
    if (platform === 'web') {
      // Web 平台使用 jeep-sqlite
      const jeepSqlite = document.querySelector('jeep-sqlite');
      if (!jeepSqlite) {
        const script = document.createElement('script');
        script.src = 'https://unpkg.com/jeep-sqlite@2.7.1/dist/jeep-sqlite.js';
        document.head.appendChild(script);
        await new Promise(resolve => script.onload = resolve);
      }
      await customElements.whenDefined('jeep-sqlite');
      await CapacitorSQLite.initWebStore();
    }

    this.sqlite = new SQLiteConnection(CapacitorSQLite);
    await this.sqlite.checkConnectionsConsistency();

    const isConn = (await this.sqlite.isConnection(DB_NAME, false)).result;
    if (isConn) {
      this.db = await this.sqlite.retrieveConnection(DB_NAME, false);
    } else {
      this.db = await this.sqlite.createConnection(DB_NAME, false, 'no-encryption', 1, false);
    }

    await this.db.open();
    await this.createTables();
    this.initialized = true;
  }

  private async createTables(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL DEFAULT '',
        type TEXT NOT NULL DEFAULT 'document',
        parent_id TEXT,
        sort_order REAL DEFAULT 0,
        is_starred INTEGER DEFAULT 0,
        icon TEXT,
        diary_date TEXT,
        version INTEGER DEFAULT 1,
        updated_at TEXT,
        deleted_at TEXT,
        original_parent_id TEXT,
        is_public INTEGER DEFAULT 0,
        ai_excluded INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS nodes (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        parent_node_id TEXT,
        content TEXT DEFAULT '',
        note TEXT DEFAULT '',
        is_completed INTEGER DEFAULT 0,
        is_in_progress INTEGER DEFAULT 0,
        is_collapsed INTEGER DEFAULT 0,
        sort_order REAL DEFAULT 0,
        heading TEXT,
        is_bold INTEGER DEFAULT 0,
        is_italic INTEGER DEFAULT 0,
        color TEXT,
        highlight TEXT,
        is_todo INTEGER DEFAULT 0,
        content_type TEXT DEFAULT 'text',
        file_path TEXT,
        file_name TEXT,
        version INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS memos (
        id TEXT PRIMARY KEY,
        content TEXT DEFAULT '',
        is_pinned INTEGER DEFAULT 0,
        is_archived INTEGER DEFAULT 0,
        is_public INTEGER DEFAULT 0,
        color TEXT,
        ai_excluded INTEGER DEFAULT 0,
        deleted_at TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS todos (
        id TEXT PRIMARY KEY,
        content TEXT DEFAULT '',
        is_completed INTEGER DEFAULT 0,
        sort_order REAL DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS attachments (
        id TEXT PRIMARY KEY,
        file_path TEXT NOT NULL,
        file_name TEXT NOT NULL,
        file_type TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS sync_meta (
        key TEXT PRIMARY KEY,
        value TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_nodes_doc ON nodes(document_id);
      CREATE INDEX IF NOT EXISTS idx_nodes_parent ON nodes(parent_node_id);
      CREATE INDEX IF NOT EXISTS idx_memos_created ON memos(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_documents_parent ON documents(parent_id);
      CREATE INDEX IF NOT EXISTS idx_documents_sort ON documents(sort_order);
    `);
  }

  // ─── 文档 ───────────────────────────────────────────────

  async getDocuments(search?: string): Promise<Document[]> {
    if (!this.db) throw new Error('Database not initialized');

    let query = `SELECT * FROM documents WHERE deleted_at IS NULL`;
    const params: any[] = [];

    if (search) {
      query += ` AND title LIKE ?`;
      params.push(`%${search}%`);
    }

    query += ` ORDER BY sort_order ASC`;

    const result = await this.db.query(query, params);
    return (result.values || []).map(this.mapDocument);
  }

  async getDocument(id: string): Promise<Document | null> {
    if (!this.db) throw new Error('Database not initialized');
    const result = await this.db.query(`SELECT * FROM documents WHERE id = ?`, [id]);
    return result.values?.[0] ? this.mapDocument(result.values[0]) : null;
  }

  async createDocument(doc: Partial<Document>): Promise<Document> {
    if (!this.db) throw new Error('Database not initialized');

    const id = doc.id || uuidv4().replace(/-/g, '');
    const now = new Date().toISOString();

    await this.db.run(
      `INSERT INTO documents (id, title, type, parent_id, sort_order, is_starred, icon, diary_date, version, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      [id, doc.title || '新笔记', doc.type || 'document', doc.parent_id || null,
       doc.sort_order || Date.now() / 1000, doc.is_starred ? 1 : 0, doc.icon || null,
       doc.diary_date || null, now]
    );

    return this.getDocument(id) as Promise<Document>;
  }

  async updateDocument(id: string, changes: Partial<Document>): Promise<Document> {
    if (!this.db) throw new Error('Database not initialized');

    const sets: string[] = [];
    const params: any[] = [];

    if (changes.title !== undefined) { sets.push('title = ?'); params.push(changes.title); }
    if (changes.parent_id !== undefined) { sets.push('parent_id = ?'); params.push(changes.parent_id); }
    if (changes.sort_order !== undefined) { sets.push('sort_order = ?'); params.push(changes.sort_order); }
    if (changes.is_starred !== undefined) { sets.push('is_starred = ?'); params.push(changes.is_starred ? 1 : 0); }
    if (changes.icon !== undefined) { sets.push('icon = ?'); params.push(changes.icon); }
    if (changes.version !== undefined) { sets.push('version = ?'); params.push(changes.version); }

    sets.push('updated_at = ?');
    params.push(new Date().toISOString());
    params.push(id);

    await this.db.run(`UPDATE documents SET ${sets.join(', ')} WHERE id = ?`, params);
    return this.getDocument(id) as Promise<Document>;
  }

  async deleteDocument(id: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    // 软删除
    await this.db.run(`UPDATE documents SET deleted_at = ? WHERE id = ?`, [new Date().toISOString(), id]);
  }

  async copyDocument(id: string): Promise<Document> {
    const doc = await this.getDocument(id);
    if (!doc) throw new Error('Document not found');

    const newDoc = await this.createDocument({
      title: `${doc.title}副本`,
      type: doc.type,
      parent_id: doc.parent_id,
      sort_order: doc.sort_order + 0.1,
    });

    // 复制节点
    const nodes = await this.getNodes(id);
    const idMap = new Map<string, string>();

    for (const node of nodes) {
      const newId = uuidv4().replace(/-/g, '');
      idMap.set(node.id, newId);

      await this.db!.run(
        `INSERT INTO nodes (id, document_id, parent_node_id, content, note, is_completed, is_collapsed, sort_order, heading, is_bold, is_italic, color, highlight, is_todo, content_type)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [newId, newDoc.id, null, node.content, node.note, node.is_completed ? 1 : 0,
         node.is_collapsed ? 1 : 0, node.sort_order, node.heading, node.is_bold ? 1 : 0,
         node.is_italic ? 1 : 0, node.color, node.highlight, node.is_todo ? 1 : 0, node.content_type]
      );
    }

    // 修复 parent_node_id
    for (const node of nodes) {
      if (node.parent_node_id && idMap.has(node.parent_node_id)) {
        const newId = idMap.get(node.id)!;
        const newParentId = idMap.get(node.parent_node_id)!;
        await this.db!.run(`UPDATE nodes SET parent_node_id = ? WHERE id = ?`, [newParentId, newId]);
      }
    }

    return newDoc;
  }

  // ─── 节点 ───────────────────────────────────────────────

  async getNodes(documentId: string): Promise<Node[]> {
    if (!this.db) throw new Error('Database not initialized');
    const result = await this.db.query(
      `SELECT * FROM nodes WHERE document_id = ? ORDER BY sort_order ASC`,
      [documentId]
    );
    return (result.values || []).map(this.mapNode);
  }

  async getNode(id: string): Promise<Node | null> {
    if (!this.db) throw new Error('Database not initialized');
    const result = await this.db.query(`SELECT * FROM nodes WHERE id = ?`, [id]);
    return result.values?.[0] ? this.mapNode(result.values[0]) : null;
  }

  async createNode(node: Partial<Node>): Promise<Node> {
    if (!this.db) throw new Error('Database not initialized');

    const id = node.id || uuidv4().replace(/-/g, '');
    await this.db.run(
      `INSERT INTO nodes (id, document_id, parent_node_id, content, note, is_completed, is_collapsed, sort_order, heading, is_bold, is_italic, color, highlight, is_todo, content_type, file_path, file_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, node.document_id, node.parent_node_id || null, node.content || '', node.note || '',
       node.is_completed ? 1 : 0, node.is_collapsed ? 1 : 0, node.sort_order || 0,
       node.heading || null, node.is_bold ? 1 : 0, node.is_italic ? 1 : 0,
       node.color || null, node.highlight || null, node.is_todo ? 1 : 0,
       node.content_type || 'text', node.file_path || null, node.file_name || null]
    );

    // 更新文档 updated_at
    if (node.document_id) {
      await this.db.run(`UPDATE documents SET updated_at = ? WHERE id = ?`,
        [new Date().toISOString(), node.document_id]);
    }

    return this.getNode(id) as Promise<Node>;
  }

  async updateNode(id: string, changes: Partial<Node>): Promise<Node> {
    if (!this.db) throw new Error('Database not initialized');

    const sets: string[] = [];
    const params: any[] = [];

    if (changes.content !== undefined) { sets.push('content = ?'); params.push(changes.content); }
    if (changes.note !== undefined) { sets.push('note = ?'); params.push(changes.note); }
    if (changes.is_completed !== undefined) { sets.push('is_completed = ?'); params.push(changes.is_completed ? 1 : 0); }
    if (changes.is_collapsed !== undefined) { sets.push('is_collapsed = ?'); params.push(changes.is_collapsed ? 1 : 0); }
    if (changes.sort_order !== undefined) { sets.push('sort_order = ?'); params.push(changes.sort_order); }
    if (changes.heading !== undefined) { sets.push('heading = ?'); params.push(changes.heading); }
    if (changes.is_bold !== undefined) { sets.push('is_bold = ?'); params.push(changes.is_bold ? 1 : 0); }
    if (changes.is_italic !== undefined) { sets.push('is_italic = ?'); params.push(changes.is_italic ? 1 : 0); }
    if (changes.color !== undefined) { sets.push('color = ?'); params.push(changes.color); }
    if (changes.highlight !== undefined) { sets.push('highlight = ?'); params.push(changes.highlight); }
    if (changes.parent_node_id !== undefined) { sets.push('parent_node_id = ?'); params.push(changes.parent_node_id); }

    if (sets.length === 0) return this.getNode(id) as Promise<Node>;

    sets.push('version = version + 1');
    params.push(id);

    await this.db.run(`UPDATE nodes SET ${sets.join(', ')} WHERE id = ?`, params);

    // 更新文档 updated_at
    const node = await this.getNode(id);
    if (node?.document_id) {
      await this.db.run(`UPDATE documents SET updated_at = ? WHERE id = ?`,
        [new Date().toISOString(), node.document_id]);
    }

    return node as Node;
  }

  async deleteNode(id: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    // 递归删除子孙节点
    await this.db.run(`
      WITH RECURSIVE descendants(id) AS (
        SELECT ?
        UNION ALL
        SELECT n.id FROM nodes n INNER JOIN descendants d ON n.parent_node_id = d.id
      )
      DELETE FROM nodes WHERE id IN (SELECT id FROM descendants)
    `, [id]);
  }

  async moveNode(id: string, parentId: string | null, sortOrder: number): Promise<Node> {
    return this.updateNode(id, { parent_node_id: parentId, sort_order: sortOrder });
  }

  // ─── 批量操作 ───────────────────────────────────────────

  async batchCreateNodes(nodes: Partial<Node>[]): Promise<Node[]> {
    const results: Node[] = [];
    for (const node of nodes) {
      results.push(await this.createNode(node));
    }
    return results;
  }

  async batchUpdateNodes(updates: { id: string; changes: Partial<Node> }[]): Promise<Node[]> {
    const results: Node[] = [];
    for (const { id, changes } of updates) {
      results.push(await this.updateNode(id, changes));
    }
    return results;
  }

  async batchDeleteNodes(ids: string[]): Promise<void> {
    for (const id of ids) {
      await this.deleteNode(id);
    }
  }

  // ─── Memo ───────────────────────────────────────────────

  async getMemos(page = 1, pageSize = 20, archived = false): Promise<{ memos: Memo[]; total: number }> {
    if (!this.db) throw new Error('Database not initialized');

    const countResult = await this.db.query(
      `SELECT COUNT(*) as total FROM memos WHERE is_archived = ? AND deleted_at IS NULL`,
      [archived ? 1 : 0]
    );
    const total = countResult.values?.[0]?.total || 0;

    const offset = (page - 1) * pageSize;
    const result = await this.db.query(
      `SELECT * FROM memos WHERE is_archived = ? AND deleted_at IS NULL ORDER BY is_pinned DESC, created_at DESC LIMIT ? OFFSET ?`,
      [archived ? 1 : 0, pageSize, offset]
    );

    return {
      memos: (result.values || []).map(this.mapMemo),
      total
    };
  }

  async getMemo(id: string): Promise<Memo | null> {
    if (!this.db) throw new Error('Database not initialized');
    const result = await this.db.query(`SELECT * FROM memos WHERE id = ?`, [id]);
    return result.values?.[0] ? this.mapMemo(result.values[0]) : null;
  }

  async createMemo(memo: Partial<Memo>): Promise<Memo> {
    if (!this.db) throw new Error('Database not initialized');

    const id = memo.id || uuidv4().replace(/-/g, '');
    const now = new Date().toISOString();

    await this.db.run(
      `INSERT INTO memos (id, content, is_pinned, is_archived, is_public, color, ai_excluded, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, memo.content || '', memo.is_pinned ? 1 : 0, memo.is_archived ? 1 : 0,
       memo.is_public ? 1 : 0, memo.color || null, memo.ai_excluded ? 1 : 0, now, now]
    );

    return this.getMemo(id) as Promise<Memo>;
  }

  async updateMemo(id: string, changes: Partial<Memo>): Promise<Memo> {
    if (!this.db) throw new Error('Database not initialized');

    const sets: string[] = [];
    const params: any[] = [];

    if (changes.content !== undefined) { sets.push('content = ?'); params.push(changes.content); }
    if (changes.is_pinned !== undefined) { sets.push('is_pinned = ?'); params.push(changes.is_pinned ? 1 : 0); }
    if (changes.is_archived !== undefined) { sets.push('is_archived = ?'); params.push(changes.is_archived ? 1 : 0); }
    if (changes.is_public !== undefined) { sets.push('is_public = ?'); params.push(changes.is_public ? 1 : 0); }
    if (changes.color !== undefined) { sets.push('color = ?'); params.push(changes.color); }
    if (changes.ai_excluded !== undefined) { sets.push('ai_excluded = ?'); params.push(changes.ai_excluded ? 1 : 0); }

    sets.push('updated_at = ?');
    params.push(new Date().toISOString());
    params.push(id);

    await this.db.run(`UPDATE memos SET ${sets.join(', ')} WHERE id = ?`, params);
    return this.getMemo(id) as Promise<Memo>;
  }

  async deleteMemo(id: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    await this.db.run(`UPDATE memos SET deleted_at = ? WHERE id = ?`, [new Date().toISOString(), id]);
  }

  // ─── Todo ───────────────────────────────────────────────

  async getTodos(completed?: boolean): Promise<Todo[]> {
    if (!this.db) throw new Error('Database not initialized');

    let query = `SELECT * FROM todos`;
    const params: any[] = [];

    if (completed !== undefined) {
      query += ` WHERE is_completed = ?`;
      params.push(completed ? 1 : 0);
    }

    query += ` ORDER BY sort_order ASC, created_at DESC`;

    const result = await this.db.query(query, params);
    return (result.values || []).map(this.mapTodo);
  }

  async createTodo(todo: Partial<Todo>): Promise<Todo> {
    if (!this.db) throw new Error('Database not initialized');

    const id = todo.id || uuidv4().replace(/-/g, '');
    const now = new Date().toISOString();

    await this.db.run(
      `INSERT INTO todos (id, content, is_completed, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, todo.content || '', todo.is_completed ? 1 : 0, todo.sort_order || 0, now, now]
    );

    return { id, content: todo.content || '', is_completed: todo.is_completed || false, sort_order: todo.sort_order || 0, created_at: now, updated_at: now } as Todo;
  }

  async updateTodo(id: string, changes: Partial<Todo>): Promise<Todo> {
    if (!this.db) throw new Error('Database not initialized');

    const sets: string[] = [];
    const params: any[] = [];

    if (changes.content !== undefined) { sets.push('content = ?'); params.push(changes.content); }
    if (changes.is_completed !== undefined) { sets.push('is_completed = ?'); params.push(changes.is_completed ? 1 : 0); }
    if (changes.sort_order !== undefined) { sets.push('sort_order = ?'); params.push(changes.sort_order); }

    sets.push('updated_at = ?');
    params.push(new Date().toISOString());
    params.push(id);

    await this.db.run(`UPDATE todos SET ${sets.join(', ')} WHERE id = ?`, params);

    const result = await this.db.query(`SELECT * FROM todos WHERE id = ?`, [id]);
    return this.mapTodo(result.values![0]);
  }

  async deleteTodo(id: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    await this.db.run(`DELETE FROM todos WHERE id = ?`, [id]);
  }

  // ─── 搜索 ───────────────────────────────────────────────

  async search(query: string): Promise<any[]> {
    if (!this.db) throw new Error('Database not initialized');

    const pattern = `%${query}%`;
    const results: any[] = [];

    // 搜索文档标题
    const docs = await this.db.query(
      `SELECT id, title, 'document' as type FROM documents WHERE title LIKE ? AND deleted_at IS NULL LIMIT 20`,
      [pattern]
    );
    results.push(...(docs.values || []));

    // 搜索节点内容
    const nodes = await this.db.query(
      `SELECT n.id, n.content as title, 'node' as type, n.document_id FROM nodes n
       JOIN documents d ON n.document_id = d.id
       WHERE n.content LIKE ? AND d.deleted_at IS NULL LIMIT 20`,
      [pattern]
    );
    results.push(...(nodes.values || []));

    // 搜索 Memo
    const memos = await this.db.query(
      `SELECT id, substr(content, 1, 50) as title, 'memo' as type FROM memos WHERE content LIKE ? AND deleted_at IS NULL LIMIT 20`,
      [pattern]
    );
    results.push(...(memos.values || []));

    return results;
  }

  // ─── 附件 ───────────────────────────────────────────────

  async uploadFile(file: File): Promise<any> {
    // 本地模式下的文件上传由 data-adapter 处理
    throw new Error('Use data-adapter uploadFile instead');
  }

  async deleteAttachment(id: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    await this.db.run(`DELETE FROM attachments WHERE id = ?`, [id]);
  }

  // ─── 数据映射 ───────────────────────────────────────────

  private mapDocument(row: any): Document {
    return {
      id: row.id,
      title: row.title,
      type: row.type,
      parent_id: row.parent_id,
      sort_order: row.sort_order,
      is_starred: Boolean(row.is_starred),
      icon: row.icon,
      diary_date: row.diary_date,
      version: row.version,
      updated_at: row.updated_at,
      deleted_at: row.deleted_at,
      original_parent_id: row.original_parent_id,
      is_public: Boolean(row.is_public),
      ai_excluded: Boolean(row.ai_excluded),
    };
  }

  private mapNode(row: any): Node {
    return {
      id: row.id,
      document_id: row.document_id,
      parent_node_id: row.parent_node_id,
      content: row.content,
      note: row.note,
      is_completed: Boolean(row.is_completed),
      is_in_progress: Boolean(row.is_in_progress),
      is_collapsed: Boolean(row.is_collapsed),
      sort_order: row.sort_order,
      heading: row.heading ? Number(row.heading) : undefined,
      is_bold: Boolean(row.is_bold),
      is_italic: Boolean(row.is_italic),
      color: row.color,
      highlight: row.highlight,
      is_todo: Boolean(row.is_todo),
      content_type: row.content_type,
      file_path: row.file_path,
      file_name: row.file_name,
      version: row.version,
    };
  }

  private mapMemo(row: any): Memo {
    return {
      id: row.id,
      content: row.content,
      is_pinned: Boolean(row.is_pinned),
      is_archived: Boolean(row.is_archived),
      is_public: Boolean(row.is_public),
      color: row.color,
      ai_excluded: Boolean(row.ai_excluded),
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  private mapTodo(row: any): Todo {
    return {
      id: row.id,
      content: row.content,
      is_completed: Boolean(row.is_completed),
      sort_order: row.sort_order,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
}
