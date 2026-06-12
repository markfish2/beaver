#!/bin/bash

echo "Starting Flowy Backend..."

mkdir -p /app/data
mkdir -p /app/data/uploads

# 检查是否存在旧数据库文件并执行迁移
if [ -f "/app/data/appback.db" ] && [ ! -f "/app/data/.migrated" ]; then
    echo "=========================================="
    echo "发现旧数据库文件，开始迁移..."
    echo "=========================================="
    
    # 执行迁移脚本
    chmod +x /app/migrate_from_old.sh
    /app/migrate_from_old.sh
fi

echo "Checking database migrations..."

# Node 表字段迁移
sqlite3 /app/data/app.db "ALTER TABLE nodes ADD COLUMN note TEXT DEFAULT '';" 2>/dev/null && echo "Added note column" || echo "note column already exists"
sqlite3 /app/data/app.db "ALTER TABLE nodes ADD COLUMN heading VARCHAR(10);" 2>/dev/null && echo "Added heading column" || echo "heading column already exists"
sqlite3 /app/data/app.db "ALTER TABLE nodes ADD COLUMN is_bold BOOLEAN DEFAULT 0;" 2>/dev/null && echo "Added is_bold column" || echo "is_bold column already exists"
sqlite3 /app/data/app.db "ALTER TABLE nodes ADD COLUMN is_italic BOOLEAN DEFAULT 0;" 2>/dev/null && echo "Added is_italic column" || echo "is_italic column already exists"
sqlite3 /app/data/app.db "ALTER TABLE nodes ADD COLUMN color VARCHAR(20);" 2>/dev/null && echo "Added color column" || echo "color column already exists"
sqlite3 /app/data/app.db "ALTER TABLE nodes ADD COLUMN highlight VARCHAR(20);" 2>/dev/null && echo "Added highlight column" || echo "highlight column already exists"
sqlite3 /app/data/app.db "ALTER TABLE nodes ADD COLUMN is_todo BOOLEAN DEFAULT 0;" 2>/dev/null && echo "Added is_todo column" || echo "is_todo column already exists"
sqlite3 /app/data/app.db "ALTER TABLE nodes ADD COLUMN is_in_progress BOOLEAN DEFAULT 0;" 2>/dev/null && echo "Added is_in_progress column" || echo "is_in_progress column already exists"
sqlite3 /app/data/app.db "ALTER TABLE nodes ADD COLUMN content_type VARCHAR(20) DEFAULT 'text';" 2>/dev/null && echo "Added content_type column" || echo "content_type column already exists"
sqlite3 /app/data/app.db "ALTER TABLE nodes ADD COLUMN file_path VARCHAR(500);" 2>/dev/null && echo "Added file_path column" || echo "file_path column already exists"
sqlite3 /app/data/app.db "ALTER TABLE nodes ADD COLUMN file_name VARCHAR(255);" 2>/dev/null && echo "Added file_name column" || echo "file_name column already exists"

# Document 表字段迁移
sqlite3 /app/data/app.db "ALTER TABLE documents ADD COLUMN is_pinned BOOLEAN DEFAULT 0;" 2>/dev/null && echo "Added is_pinned column" || echo "is_pinned column already exists"

# User 表字段迁移
sqlite3 /app/data/app.db "ALTER TABLE users ADD COLUMN theme VARCHAR(50) DEFAULT 'system';" 2>/dev/null && echo "Added theme column" || echo "theme column already exists"
sqlite3 /app/data/app.db "ALTER TABLE users ADD COLUMN font_family VARCHAR(50) DEFAULT 'system';" 2>/dev/null && echo "Added font_family column" || echo "font_family column already exists"
sqlite3 /app/data/app.db "ALTER TABLE users ADD COLUMN font_size VARCHAR(20) DEFAULT 'medium';" 2>/dev/null && echo "Added font_size column" || echo "font_size column already exists"
sqlite3 /app/data/app.db "ALTER TABLE users ADD COLUMN memo_columns INTEGER DEFAULT 1;" 2>/dev/null && echo "Added memo_columns column" || echo "memo_columns column already exists"

# 创建 attachments 表
sqlite3 /app/data/app.db "CREATE TABLE IF NOT EXISTS attachments (
    id TEXT PRIMARY KEY,
    file_path VARCHAR(500) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_type VARCHAR(100) NOT NULL,
    file_size INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);" && echo "Created attachments table" || echo "attachments table already exists"

# Share 表迁移
sqlite3 /app/data/app.db "CREATE TABLE IF NOT EXISTS shares (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    token VARCHAR(32) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);" && echo "Created shares table" || echo "shares table already exists"
sqlite3 /app/data/app.db "CREATE INDEX IF NOT EXISTS ix_shares_document_id ON shares(document_id);" 2>/dev/null
sqlite3 /app/data/app.db "CREATE INDEX IF NOT EXISTS ix_shares_token ON shares(token);" 2>/dev/null

# Diary: documents 表加 diary_date 字段
sqlite3 /app/data/app.db "ALTER TABLE documents ADD COLUMN diary_date VARCHAR(10);" 2>/dev/null && echo "Added diary_date column" || echo "diary_date column already exists"
sqlite3 /app/data/app.db "CREATE INDEX IF NOT EXISTS ix_documents_diary_date ON documents(diary_date);" 2>/dev/null

# Memos 表
sqlite3 /app/data/app.db "CREATE TABLE IF NOT EXISTS memos (
    id TEXT PRIMARY KEY,
    content TEXT DEFAULT '',
    is_pinned BOOLEAN DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);" && echo "Created memos table" || echo "memos table already exists"
sqlite3 /app/data/app.db "CREATE INDEX IF NOT EXISTS ix_memos_created_at ON memos(created_at);" 2>/dev/null
sqlite3 /app/data/app.db "ALTER TABLE memos ADD COLUMN is_pinned BOOLEAN DEFAULT 0;" 2>/dev/null && echo "Added is_pinned column" || echo "is_pinned column already exists"
sqlite3 /app/data/app.db "ALTER TABLE memos ADD COLUMN is_archived BOOLEAN DEFAULT 0;" 2>/dev/null && echo "Added is_archived column" || echo "is_archived column already exists"
sqlite3 /app/data/app.db "ALTER TABLE memos ADD COLUMN color VARCHAR(20);" 2>/dev/null && echo "Added color column" || echo "color column already exists"
sqlite3 /app/data/app.db "ALTER TABLE memos ADD COLUMN is_public BOOLEAN DEFAULT 0;" 2>/dev/null && echo "Added is_public column" || echo "is_public column already exists"

# 回收站字段迁移
sqlite3 /app/data/app.db "ALTER TABLE documents ADD COLUMN deleted_at TIMESTAMP;" 2>/dev/null && echo "Added documents.deleted_at column" || echo "documents.deleted_at column already exists"
sqlite3 /app/data/app.db "CREATE INDEX IF NOT EXISTS ix_documents_deleted_at ON documents(deleted_at);" 2>/dev/null
sqlite3 /app/data/app.db "ALTER TABLE documents ADD COLUMN original_parent_id VARCHAR;" 2>/dev/null && echo "Added documents.original_parent_id column" || echo "documents.original_parent_id column already exists"
sqlite3 /app/data/app.db "ALTER TABLE memos ADD COLUMN deleted_at TIMESTAMP;" 2>/dev/null && echo "Added memos.deleted_at column" || echo "memos.deleted_at column already exists"
sqlite3 /app/data/app.db "CREATE INDEX IF NOT EXISTS ix_memos_deleted_at ON memos(deleted_at);" 2>/dev/null

echo "Database migrations complete."

# 画布数据迁移：将 SQLite scene_data 列中的数据迁移到文件系统
echo "Running excalidraw data migration..."
python3 /app/migrate_excalidraw.py

echo "Starting uvicorn server..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
