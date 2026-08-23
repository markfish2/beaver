"""Idempotent SQLite schema upgrades shared by every startup path."""

import argparse
import logging
import os
import sqlite3

logger = logging.getLogger(__name__)

COLUMNS: dict[str, dict[str, str]] = {
    "nodes": {
        "note": "TEXT DEFAULT ''", "heading": "VARCHAR(10)", "is_bold": "BOOLEAN DEFAULT 0",
        "is_italic": "BOOLEAN DEFAULT 0", "color": "VARCHAR(20)", "highlight": "VARCHAR(20)",
        "is_todo": "BOOLEAN DEFAULT 0", "is_in_progress": "BOOLEAN DEFAULT 0",
        "content_type": "VARCHAR(20) DEFAULT 'text'", "file_path": "VARCHAR(500)",
        "file_name": "VARCHAR(255)", "is_collapsed": "BOOLEAN DEFAULT 0", "version": "INTEGER DEFAULT 1",
    },
    "documents": {
        "is_pinned": "BOOLEAN DEFAULT 0", "diary_date": "VARCHAR(10)", "deleted_at": "TIMESTAMP",
        "original_parent_id": "VARCHAR", "is_public": "BOOLEAN DEFAULT 0", "ai_excluded": "BOOLEAN DEFAULT 0",
        "version": "INTEGER DEFAULT 1", "updated_at": "TIMESTAMP",
    },
    "users": {
        "theme": "VARCHAR(50) DEFAULT 'system'", "theme_color": "VARCHAR(20) DEFAULT 'green'",
        "font_family": "VARCHAR(50) DEFAULT 'system'",
        "font_size": "VARCHAR(20) DEFAULT 'medium'", "markdown_style": "VARCHAR(50) DEFAULT 'default'",
        "memo_columns": "INTEGER DEFAULT 1",
        "nickname": "VARCHAR(50)", "email": "VARCHAR(100)", "phone": "VARCHAR(20)",
        "bio": "VARCHAR(200)", "avatar_path": "VARCHAR(500)",
    },
    "memos": {
        "is_pinned": "BOOLEAN DEFAULT 0", "is_archived": "BOOLEAN DEFAULT 0", "color": "VARCHAR(20)",
        "is_public": "BOOLEAN DEFAULT 0", "deleted_at": "TIMESTAMP", "ai_excluded": "BOOLEAN DEFAULT 0",
    },
    "ai_configs": {"purpose": "VARCHAR(20) NOT NULL DEFAULT 'chat'"},
}

INDEXES = (
    "CREATE INDEX IF NOT EXISTS ix_documents_diary_date ON documents(diary_date)",
    "CREATE INDEX IF NOT EXISTS ix_documents_deleted_at ON documents(deleted_at)",
    "CREATE INDEX IF NOT EXISTS ix_documents_is_public ON documents(is_public)",
    "CREATE INDEX IF NOT EXISTS ix_documents_sort_order ON documents(sort_order)",
    "CREATE INDEX IF NOT EXISTS ix_nodes_document_sort ON nodes(document_id, sort_order)",
    "CREATE INDEX IF NOT EXISTS ix_memos_deleted_at ON memos(deleted_at)",
    "CREATE INDEX IF NOT EXISTS ix_memos_created_at_desc ON memos(created_at DESC)",
    "CREATE INDEX IF NOT EXISTS ix_ai_messages_conversation ON ai_messages(conversation_id)",
    "CREATE INDEX IF NOT EXISTS ix_tasks_project_id ON tasks(project_id)",
    "CREATE INDEX IF NOT EXISTS ix_tasks_parent_id ON tasks(parent_id)",
    "CREATE INDEX IF NOT EXISTS ix_projects_archived ON projects(is_archived)",
    "CREATE INDEX IF NOT EXISTS ix_projects_deleted ON projects(is_deleted)",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_habit_records_unique ON habit_records(habit_id, record_date)",
)


def _table_exists(connection: sqlite3.Connection, table: str) -> bool:
    return connection.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (table,)).fetchone() is not None


def migrate_database(db_path: str) -> list[str]:
    if not os.path.exists(db_path):
        return []
    applied: list[str] = []
    with sqlite3.connect(db_path) as connection:
        connection.execute("PRAGMA foreign_keys=ON")
        for table, definitions in COLUMNS.items():
            if not _table_exists(connection, table):
                continue
            existing = {row[1] for row in connection.execute(f'PRAGMA table_info("{table}")')}
            for column, definition in definitions.items():
                if column in existing:
                    continue
                connection.execute(f'ALTER TABLE "{table}" ADD COLUMN "{column}" {definition}')
                applied.append(f"{table}.{column}")
        if _table_exists(connection, "documents") and "documents.updated_at" in applied:
            connection.execute("UPDATE documents SET updated_at = datetime('now') WHERE updated_at IS NULL")
        for statement in INDEXES:
            table = statement.split(" ON ", 1)[1].split("(", 1)[0]
            if _table_exists(connection, table):
                connection.execute(statement)
        connection.execute("PRAGMA user_version=1")
    if applied:
        logger.info("数据库迁移已应用: %s", ", ".join(applied))
    return applied


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("db_path")
    args = parser.parse_args()
    migrate_database(args.db_path)
