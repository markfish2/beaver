#!/usr/bin/env python3
"""
画布数据迁移脚本：将 SQLite excalidraw_data.scene_data 列中的数据迁移到文件系统。
启动时自动运行，幂等（已迁移的不会重复处理）。
"""

import os
import sys
import json
import sqlite3

DB_PATH = os.environ.get("DATABASE_URL", "sqlite:///./data/app.db").replace("sqlite:///", "")
EXCALIDRAW_DIR = os.path.join(os.path.dirname(DB_PATH), "excalidraw")


def migrate():
    if not os.path.exists(DB_PATH):
        print("数据库不存在，跳过画布迁移")
        return

    os.makedirs(EXCALIDRAW_DIR, exist_ok=True)

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # 检查表是否存在
    cursor.execute("SELECT count(*) FROM sqlite_master WHERE type='table' AND name='excalidraw_data'")
    if cursor.fetchone()[0] == 0:
        print("excalidraw_data 表不存在，跳过画布迁移")
        conn.close()
        return

    # 查找需要迁移的记录（scene_data 不为空且不是空画布）
    cursor.execute("""
        SELECT document_id, scene_data
        FROM excalidraw_data
        WHERE scene_data IS NOT NULL
          AND scene_data != ''
          AND scene_data != '{"elements":[]}'
    """)
    rows = cursor.fetchall()

    if not rows:
        print("画布数据无需迁移（已迁移或为空）")
        conn.close()
        return

    print(f"发现 {len(rows)} 个画布数据需要迁移到文件系统...")
    migrated = 0

    for doc_id, scene_data_str in rows:
        scene_file = os.path.join(EXCALIDRAW_DIR, f"{doc_id}.json")
        files_file = os.path.join(EXCALIDRAW_DIR, f"{doc_id}_files.json")

        # 跳过已存在的文件
        if os.path.exists(scene_file):
            print(f"  跳过: {doc_id} (文件已存在)")
            continue

        try:
            scene_obj = json.loads(scene_data_str)
            files = scene_obj.pop("files", None)

            # 写入场景文件
            with open(scene_file, "w", encoding="utf-8") as f:
                json.dump(scene_obj, f, ensure_ascii=False)

            # 写入图片文件
            if files:
                with open(files_file, "w", encoding="utf-8") as f:
                    json.dump(files, f, ensure_ascii=False)

            print(f"  迁移: {doc_id} -> {scene_file}")
            migrated += 1
        except (json.JSONDecodeError, IOError) as e:
            print(f"  跳过: {doc_id} (错误: {e})")

    # 清空已迁移记录的 scene_data 列
    if migrated > 0:
        cursor.execute("""
            UPDATE excalidraw_data SET scene_data = NULL
            WHERE scene_data IS NOT NULL AND scene_data != '' AND scene_data != '{"elements":[]}'
        """)
        conn.commit()
        print(f"画布数据迁移完成: {migrated} 个，已清空 SQLite scene_data 列")
    else:
        print("所有画布数据已迁移，无需操作")

    conn.close()


if __name__ == "__main__":
    migrate()
