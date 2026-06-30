-- 数据迁移脚本：从 appback.db 迁移数据到 app.db
-- 主要处理 is_pinned -> is_starred 的字段映射

-- 附加备份数据库
ATTACH DATABASE 'data/appback.db' AS appback;

-- 1. 迁移用户数据（如果目标数据库为空）
INSERT OR IGNORE INTO users (id, username, password_hash, theme, font_family, font_size)
SELECT id, username, password_hash, theme, font_family, font_size
FROM appback.users;

-- 2. 迁移文档数据（将 is_pinned 映射为 is_starred）
INSERT OR IGNORE INTO documents (id, title, type, parent_id, sort_order, is_starred)
SELECT id, title, type, parent_id, sort_order, is_pinned
FROM appback.documents;

-- 3. 迁移节点数据
INSERT OR IGNORE INTO nodes (
    id, document_id, parent_node_id, content, note, 
    is_completed, is_collapsed, sort_order, heading,
    is_bold, is_italic, color, highlight, is_todo,
    content_type, file_path, file_name
)
SELECT 
    id, document_id, parent_node_id, content, note,
    is_completed, is_collapsed, sort_order, heading,
    is_bold, is_italic, color, highlight, is_todo,
    content_type, file_path, file_name
FROM appback.nodes;

-- 4. 迁移附件数据
INSERT OR IGNORE INTO attachments (id, file_path, file_name, file_type, file_size, created_at)
SELECT id, file_path, file_name, file_type, file_size, created_at
FROM appback.attachments;

-- 分离备份数据库
DETACH DATABASE appback;
