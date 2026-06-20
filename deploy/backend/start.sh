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
sqlite3 /app/data/app.db "ALTER TABLE users ADD COLUMN nickname VARCHAR(50);" 2>/dev/null && echo "Added nickname column" || echo "nickname column already exists"
sqlite3 /app/data/app.db "ALTER TABLE users ADD COLUMN email VARCHAR(100);" 2>/dev/null && echo "Added email column" || echo "email column already exists"
sqlite3 /app/data/app.db "ALTER TABLE users ADD COLUMN phone VARCHAR(20);" 2>/dev/null && echo "Added phone column" || echo "phone column already exists"
sqlite3 /app/data/app.db "ALTER TABLE users ADD COLUMN bio VARCHAR(200);" 2>/dev/null && echo "Added bio column" || echo "bio column already exists"
sqlite3 /app/data/app.db "ALTER TABLE users ADD COLUMN avatar_path VARCHAR(500);" 2>/dev/null && echo "Added avatar_path column" || echo "avatar_path column already exists"

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

# 文档公开字段
sqlite3 /app/data/app.db "ALTER TABLE documents ADD COLUMN is_public BOOLEAN DEFAULT 0;" 2>/dev/null && echo "Added documents.is_public column" || echo "documents.is_public column already exists"
sqlite3 /app/data/app.db "CREATE INDEX IF NOT EXISTS ix_documents_is_public ON documents(is_public);" 2>/dev/null

# AI 排除字段
sqlite3 /app/data/app.db "ALTER TABLE documents ADD COLUMN ai_excluded BOOLEAN DEFAULT 0;" 2>/dev/null && echo "Added documents.ai_excluded column" || echo "documents.ai_excluded column already exists"
sqlite3 /app/data/app.db "ALTER TABLE memos ADD COLUMN ai_excluded BOOLEAN DEFAULT 0;" 2>/dev/null && echo "Added memos.ai_excluded column" || echo "memos.ai_excluded column already exists"

# 笔记向量嵌入表
sqlite3 /app/data/app.db "CREATE TABLE IF NOT EXISTS note_embeddings (
    id TEXT PRIMARY KEY,
    source_type TEXT NOT NULL,
    source_id TEXT NOT NULL,
    chunk_text TEXT NOT NULL,
    embedding BLOB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);" && echo "Created note_embeddings table" || echo "note_embeddings table already exists"
sqlite3 /app/data/app.db "CREATE INDEX IF NOT EXISTS ix_embeddings_source ON note_embeddings(source_type, source_id);" 2>/dev/null

# AI 对话历史表
sqlite3 /app/data/app.db "CREATE TABLE IF NOT EXISTS ai_conversations (
    id TEXT PRIMARY KEY,
    title VARCHAR(200),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);" && echo "Created ai_conversations table" || echo "ai_conversations table already exists"

sqlite3 /app/data/app.db "CREATE TABLE IF NOT EXISTS ai_messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL,
    content TEXT NOT NULL,
    sources TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);" && echo "Created ai_messages table" || echo "ai_messages table already exists"
sqlite3 /app/data/app.db "CREATE INDEX IF NOT EXISTS ix_ai_messages_conversation ON ai_messages(conversation_id);" 2>/dev/null

echo "Database migrations complete."

# AI 配置表
sqlite3 /app/data/app.db "CREATE TABLE IF NOT EXISTS ai_configs (
    id TEXT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    provider VARCHAR(50) NOT NULL DEFAULT 'custom',
    api_url VARCHAR(500) NOT NULL,
    api_key VARCHAR(500) NOT NULL,
    model VARCHAR(100) NOT NULL,
    is_default BOOLEAN DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);" && echo "Created ai_configs table" || echo "ai_configs table already exists"

# 语音记录表
sqlite3 /app/data/app.db "CREATE TABLE IF NOT EXISTS voice_records (
    id TEXT PRIMARY KEY,
    memo_id TEXT REFERENCES memos(id) ON DELETE SET NULL,
    document_id TEXT REFERENCES documents(id) ON DELETE SET NULL,
    audio_path VARCHAR(500) NOT NULL,
    duration_seconds INTEGER,
    transcribed_text TEXT,
    ai_messages TEXT,
    ai_config_id TEXT REFERENCES ai_configs(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);" && echo "Created voice_records table" || echo "voice_records table already exists"
sqlite3 /app/data/app.db "CREATE INDEX IF NOT EXISTS ix_voice_records_memo_id ON voice_records(memo_id);" 2>/dev/null
sqlite3 /app/data/app.db "CREATE INDEX IF NOT EXISTS ix_voice_records_document_id ON voice_records(document_id);" 2>/dev/null

# 画布数据迁移：将 SQLite scene_data 列中的数据迁移到文件系统
echo "Running excalidraw data migration..."
python3 /app/migrate_excalidraw.py

echo "Starting uvicorn server..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
