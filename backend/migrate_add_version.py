import sqlite3
import os

db_path = os.path.join(os.path.dirname(__file__), "data", "app.db")
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

try:
    # Add version column to documents
    cursor.execute("PRAGMA table_info(documents)")
    doc_columns = [c[1] for c in cursor.fetchall()]
    if "version" not in doc_columns:
        print("Adding version column to documents table...")
        cursor.execute("ALTER TABLE documents ADD COLUMN version INTEGER NOT NULL DEFAULT 1")
        print("Done.")
    else:
        print("documents.version already exists.")

    # Add version column to nodes
    cursor.execute("PRAGMA table_info(nodes)")
    node_columns = [c[1] for c in cursor.fetchall()]
    if "version" not in node_columns:
        print("Adding version column to nodes table...")
        cursor.execute("ALTER TABLE nodes ADD COLUMN version INTEGER NOT NULL DEFAULT 1")
        print("Done.")
    else:
        print("nodes.version already exists.")

    conn.commit()
    print("Migration complete.")
except Exception as e:
    print(f"Error: {e}")
    conn.rollback()
finally:
    conn.close()
