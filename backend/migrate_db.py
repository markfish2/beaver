#!/usr/bin/env python3
"""
数据库迁移脚本
用于升级现有数据库，添加新字段和表
"""

import sqlite3
import os
import sys

DB_PATH = os.path.join(os.path.dirname(__file__), "data", "app.db")

def get_existing_columns(cursor, table_name):
    """获取表的现有列"""
    cursor.execute(f"PRAGMA table_info({table_name})")
    return [row[1] for row in cursor.fetchall()]

def get_existing_tables(cursor):
    """获取现有表"""
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
    return [row[0] for row in cursor.fetchall()]

def migrate_database():
    """执行数据库迁移"""
    print(f"开始迁移数据库: {DB_PATH}")
    
    if not os.path.exists(DB_PATH):
        print("数据库文件不存在，将由应用自动创建")
        return
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    try:
        existing_tables = get_existing_tables(cursor)
        print(f"现有表: {existing_tables}")
        
        # 迁移 nodes 表
        if "nodes" in existing_tables:
            existing_columns = get_existing_columns(cursor, "nodes")
            print(f"nodes 表现有列: {existing_columns}")
            
            # 添加 content_type 字段
            if "content_type" not in existing_columns:
                print("添加 nodes.content_type 字段...")
                cursor.execute("ALTER TABLE nodes ADD COLUMN content_type VARCHAR(20) DEFAULT 'text'")
            
            # 添加 file_path 字段
            if "file_path" not in existing_columns:
                print("添加 nodes.file_path 字段...")
                cursor.execute("ALTER TABLE nodes ADD COLUMN file_path VARCHAR(500)")
            
            # 添加 file_name 字段
            if "file_name" not in existing_columns:
                print("添加 nodes.file_name 字段...")
                cursor.execute("ALTER TABLE nodes ADD COLUMN file_name VARCHAR(255)")
        
        # 创建 attachments 表
        if "attachments" not in existing_tables:
            print("创建 attachments 表...")
            cursor.execute("""
                CREATE TABLE attachments (
                    id TEXT PRIMARY KEY,
                    file_path VARCHAR(500) NOT NULL,
                    file_name VARCHAR(255) NOT NULL,
                    file_type VARCHAR(100) NOT NULL,
                    file_size INTEGER NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
        
        # 迁移 users 表
        if "users" in existing_tables:
            existing_columns = get_existing_columns(cursor, "users")
            print(f"users 表现有列: {existing_columns}")

            if "memo_columns" not in existing_columns:
                print("添加 users.memo_columns 字段...")
                cursor.execute("ALTER TABLE users ADD COLUMN memo_columns INTEGER DEFAULT 1")

        conn.commit()
        print("数据库迁移完成！")
        
    except Exception as e:
        print(f"迁移失败: {e}")
        conn.rollback()
        sys.exit(1)
    finally:
        conn.close()

if __name__ == "__main__":
    migrate_database()
