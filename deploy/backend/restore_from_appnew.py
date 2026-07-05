#!/usr/bin/env python3
"""
从 appnew.db 恢复大纲笔记到 app.db
"""
import sqlite3
import os

# 数据库路径
DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
OLD_DB = os.path.join(DATA_DIR, "appnew.db")
NEW_DB = os.path.join(DATA_DIR, "app.db")

def restore_documents():
    """恢复文档数据"""
    old_conn = sqlite3.connect(OLD_DB)
    new_conn = sqlite3.connect(NEW_DB)

    try:
        # 获取旧数据库中的文档（appnew.db 没有 diary_date 和 version 列）
        old_docs = old_conn.execute("""
            SELECT id, title, type, parent_id, sort_order, is_starred, icon
            FROM documents
        """).fetchall()

        print(f"从 appnew.db 找到 {len(old_docs)} 个文档")

        # 获取新数据库中已存在的文档 ID
        existing_ids = set(row[0] for row in new_conn.execute("SELECT id FROM documents").fetchall())
        print(f"当前数据库已有 {len(existing_ids)} 个文档")

        # 插入不存在的文档
        inserted = 0
        for doc in old_docs:
            doc_id = doc[0]
            if doc_id in existing_ids:
                print(f"跳过已存在: {doc[1]}")
                continue

            # 补充 diary_date 和 version 字段
            new_conn.execute("""
                INSERT INTO documents (id, title, type, parent_id, sort_order, is_starred, icon, diary_date, version)
                VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 1)
            """, doc)
            inserted += 1
            print(f"恢复文档: {doc[1]} ({doc[2]})")

        # 恢复节点数据（appnew.db 没有 is_in_progress 和 version 列）
        old_nodes = old_conn.execute("""
            SELECT id, document_id, parent_node_id, content, note, is_completed,
                   is_collapsed, sort_order, heading, is_bold, is_italic, color,
                   highlight, is_todo, content_type, file_path, file_name
            FROM nodes
        """).fetchall()

        print(f"\n从 appnew.db 找到 {len(old_nodes)} 个节点")

        # 获取新数据库中已存在的节点 ID
        existing_node_ids = set(row[0] for row in new_conn.execute("SELECT id FROM nodes").fetchall())

        # 只恢复属于已恢复文档的节点
        restored_doc_ids = set(doc[0] for doc in old_docs if doc[0] not in existing_ids)
        inserted_nodes = 0

        for node in old_nodes:
            node_id = node[0]
            doc_id = node[1]

            if node_id in existing_node_ids:
                continue
            if doc_id not in restored_doc_ids:
                continue

            # 补充 is_in_progress 和 version 字段
            new_conn.execute("""
                INSERT INTO nodes (id, document_id, parent_node_id, content, note, is_completed, is_in_progress,
                                   is_collapsed, sort_order, heading, is_bold, is_italic, color, highlight, is_todo,
                                   content_type, file_path, file_name, version)
                VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
            """, node)
            inserted_nodes += 1

        print(f"恢复了 {inserted_nodes} 个节点")

        new_conn.commit()
        print(f"\n完成！恢复了 {inserted} 个文档和 {inserted_nodes} 个节点")

    except Exception as e:
        print(f"错误: {e}")
        new_conn.rollback()
        raise
    finally:
        old_conn.close()
        new_conn.close()

if __name__ == "__main__":
    restore_documents()
