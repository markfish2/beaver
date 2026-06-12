#!/bin/bash
# 数据库迁移脚本
# 用于从旧版本数据库迁移数据到新版本

set -e

# 检测运行环境
if [ -d "/app/data" ]; then
    # Docker 环境
    DB_DIR="/app/data"
else
    # 本地环境
    SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
    DB_DIR="$SCRIPT_DIR/data"
fi

DB_PATH="$DB_DIR/app.db"
BACKUP_DB="$DB_DIR/appback.db"
OLD_DB_MARKER="$DB_DIR/.migrated"

echo "=========================================="
echo "Flowy 数据库迁移脚本"
echo "数据库目录: $DB_DIR"
echo "=========================================="

# 确保数据目录存在
mkdir -p "$DB_DIR"
mkdir -p "$DB_DIR/uploads"

# 检查是否已经迁移过
if [ -f "$OLD_DB_MARKER" ]; then
    echo "数据库已经迁移过，跳过迁移步骤"
    exit 0
fi

# 检查是否存在旧数据库文件
if [ ! -f "$BACKUP_DB" ]; then
    echo "未发现旧数据库文件，跳过迁移步骤"
    touch "$OLD_DB_MARKER"
    exit 0
fi

echo "发现旧数据库文件: $BACKUP_DB"

# 备份当前数据库（如果存在）
if [ -f "$DB_PATH" ]; then
    BACKUP_TIME=$(date +%Y%m%d_%H%M%S)
    cp "$DB_PATH" "$DB_DIR/app_backup_$BACKUP_TIME.db"
    echo "已备份当前数据库到: app_backup_$BACKUP_TIME.db"
fi

# 检查旧数据库是否有数据
USER_COUNT=$(sqlite3 "$BACKUP_DB" "SELECT COUNT(*) FROM users;" 2>/dev/null || echo "0")
if [ "$USER_COUNT" = "0" ]; then
    echo "旧数据库中没有用户数据，跳过迁移"
    touch "$OLD_DB_MARKER"
    exit 0
fi

echo "开始迁移数据..."

# 创建新数据库结构
sqlite3 "$DB_PATH" "
-- 创建 users 表
CREATE TABLE IF NOT EXISTS users (
    id CHAR(32) NOT NULL PRIMARY KEY,
    username VARCHAR NOT NULL UNIQUE,
    password_hash VARCHAR NOT NULL,
    theme VARCHAR NOT NULL DEFAULT 'system',
    font_family VARCHAR NOT NULL DEFAULT 'system',
    font_size VARCHAR NOT NULL DEFAULT 'medium'
);

-- 创建 documents 表
CREATE TABLE IF NOT EXISTS documents (
    id CHAR(32) NOT NULL PRIMARY KEY,
    title VARCHAR NOT NULL,
    type VARCHAR NOT NULL DEFAULT 'document',
    parent_id CHAR(32),
    sort_order FLOAT NOT NULL DEFAULT 0,
    is_pinned BOOLEAN DEFAULT 0,
    FOREIGN KEY(parent_id) REFERENCES documents (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ix_documents_title ON documents (title);

-- 创建 nodes 表（包含新字段）
CREATE TABLE IF NOT EXISTS nodes (
    id CHAR(32) NOT NULL PRIMARY KEY,
    document_id CHAR(32) NOT NULL,
    parent_node_id CHAR(32),
    content TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    is_completed BOOLEAN NOT NULL DEFAULT 0,
    is_collapsed BOOLEAN NOT NULL DEFAULT 0,
    sort_order FLOAT NOT NULL DEFAULT 0,
    heading VARCHAR(10),
    is_bold BOOLEAN DEFAULT 0,
    is_italic BOOLEAN DEFAULT 0,
    color VARCHAR(20),
    highlight VARCHAR(20),
    is_todo BOOLEAN DEFAULT 0,
    content_type VARCHAR(20) DEFAULT 'text',
    file_path VARCHAR(500),
    file_name VARCHAR(255),
    FOREIGN KEY(document_id) REFERENCES documents (id) ON DELETE CASCADE,
    FOREIGN KEY(parent_node_id) REFERENCES nodes (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ix_nodes_document_id ON nodes (document_id);

-- 创建 attachments 表
CREATE TABLE IF NOT EXISTS attachments (
    id CHAR(32) NOT NULL PRIMARY KEY,
    file_path VARCHAR(500) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_type VARCHAR(100) NOT NULL,
    file_size INTEGER NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
"

# 迁移用户数据
echo "迁移用户数据..."
sqlite3 "$BACKUP_DB" "SELECT id, username, password_hash, COALESCE(theme, 'system'), COALESCE(font_family, 'system'), COALESCE(font_size, 'medium') FROM users;" | while IFS='|' read -r id username password_hash theme font_family font_size; do
    sqlite3 "$DB_PATH" "INSERT OR IGNORE INTO users (id, username, password_hash, theme, font_family, font_size) VALUES ('$id', '$username', '$password_hash', '$theme', '$font_family', '$font_size');"
done

# 迁移文档数据
echo "迁移文档数据..."
sqlite3 "$BACKUP_DB" "SELECT id, title, COALESCE(type, 'document'), parent_id, COALESCE(sort_order, 0), COALESCE(is_pinned, 0) FROM documents;" | while IFS='|' read -r id title type parent_id sort_order is_pinned; do
    parent_id_val="NULL"
    if [ -n "$parent_id" ] && [ "$parent_id" != "" ]; then
        parent_id_val="'$parent_id'"
    fi
    sqlite3 "$DB_PATH" "INSERT OR IGNORE INTO documents (id, title, type, parent_id, sort_order, is_pinned) VALUES ('$id', '$title', '$type', $parent_id_val, $sort_order, $is_pinned);"
done

# 迁移节点数据
echo "迁移节点数据..."
sqlite3 "$BACKUP_DB" "SELECT id, document_id, parent_node_id, COALESCE(content, ''), COALESCE(note, ''), COALESCE(is_completed, 0), COALESCE(is_collapsed, 0), COALESCE(sort_order, 0), COALESCE(heading, 'NULL'), COALESCE(is_bold, 0), COALESCE(is_italic, 0), COALESCE(color, 'NULL'), COALESCE(highlight, 'NULL'), COALESCE(is_todo, 0) FROM nodes;" | while IFS='|' read -r id document_id parent_node_id content note is_completed is_collapsed sort_order heading is_bold is_italic color highlight is_todo; do
    parent_node_id_val="NULL"
    if [ -n "$parent_node_id" ] && [ "$parent_node_id" != "" ]; then
        parent_node_id_val="'$parent_node_id'"
    fi
    
    heading_val="NULL"
    if [ -n "$heading" ] && [ "$heading" != "NULL" ] && [ "$heading" != "" ]; then
        heading_val="'$heading'"
    fi
    
    color_val="NULL"
    if [ -n "$color" ] && [ "$color" != "NULL" ] && [ "$color" != "" ]; then
        color_val="'$color'"
    fi
    
    highlight_val="NULL"
    if [ -n "$highlight" ] && [ "$highlight" != "NULL" ] && [ "$highlight" != "" ]; then
        highlight_val="'$highlight'"
    fi
    
    # 转义单引号
    content=$(echo "$content" | sed "s/'/''/g")
    note=$(echo "$note" | sed "s/'/''/g")
    
    sqlite3 "$DB_PATH" "INSERT OR IGNORE INTO nodes (id, document_id, parent_node_id, content, note, is_completed, is_collapsed, sort_order, heading, is_bold, is_italic, color, highlight, is_todo, content_type, file_path, file_name) VALUES ('$id', '$document_id', $parent_node_id_val, '$content', '$note', $is_completed, $is_collapsed, $sort_order, $heading_val, $is_bold, $is_italic, $color_val, $highlight_val, $is_todo, 'text', NULL, NULL);"
done

# 验证迁移结果
NEW_USER_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM users;")
NEW_DOC_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM documents;")
NEW_NODE_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM nodes;")

echo "=========================================="
echo "迁移完成!"
echo "用户数: $NEW_USER_COUNT"
echo "文档数: $NEW_DOC_COUNT"
echo "节点数: $NEW_NODE_COUNT"
echo "=========================================="

# 标记已迁移
touch "$OLD_DB_MARKER"

# 重命名旧数据库文件，避免重复迁移
mv "$BACKUP_DB" "$DB_DIR/appback_migrated_$(date +%Y%m%d_%H%M%S).db"

echo "旧数据库文件已重命名，迁移完成！"
