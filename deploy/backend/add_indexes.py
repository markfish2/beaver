#!/usr/bin/env python3
"""Add missing database indexes for performance optimization."""
import sqlite3
import os

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
DB_PATH = os.path.join(DATA_DIR, "app.db")

INDEXES = [
    ("idx_nodes_parent_node_id", "nodes", "parent_node_id"),
    ("idx_documents_parent_id", "documents", "parent_id"),
    ("idx_memos_is_archived", "memos", "is_archived"),
    ("idx_memos_is_public", "memos", "is_public"),
    ("idx_memos_created_at", "memos", "created_at"),
]

def add_indexes():
    conn = sqlite3.connect(DB_PATH)
    try:
        for idx_name, table, column in INDEXES:
            try:
                conn.execute(f"CREATE INDEX IF NOT EXISTS {idx_name} ON {table} ({column})")
                print(f"Added index: {idx_name}")
            except Exception as e:
                print(f"Index {idx_name} already exists or error: {e}")
        conn.commit()
        print("Done!")
    finally:
        conn.close()

if __name__ == "__main__":
    add_indexes()
