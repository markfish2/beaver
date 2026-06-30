-- 创建 excalidraw_data 表
-- 用于存储 Excalidraw 画布数据

CREATE TABLE IF NOT EXISTS excalidraw_data (
    id TEXT PRIMARY KEY,
    document_id TEXT UNIQUE NOT NULL,
    scene_data TEXT,
    thumbnail TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_excalidraw_data_document_id
ON excalidraw_data(document_id);

-- 创建更新时间触发器
CREATE TRIGGER IF NOT EXISTS update_excalidraw_data_timestamp
AFTER UPDATE ON excalidraw_data
BEGIN
    UPDATE excalidraw_data SET updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.id;
END;
