import sqlite3
import os

# 获取数据库文件路径
db_path = os.path.join(os.path.dirname(__file__), "data", "app.db")

# 连接数据库
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

try:
    # 检查icon列是否已存在
    cursor.execute("PRAGMA table_info(documents)")
    columns = [column[1] for column in cursor.fetchall()]
    
    if "icon" not in columns:
        print("Adding icon column to documents table...")
        cursor.execute("ALTER TABLE documents ADD COLUMN icon TEXT")
        conn.commit()
        print("Successfully added icon column!")
    else:
        print("icon column already exists.")
        
except Exception as e:
    print(f"Error: {e}")
    conn.rollback()
finally:
    conn.close()
