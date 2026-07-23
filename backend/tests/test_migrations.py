import os
import sqlite3
import tempfile
import unittest

from app.migrations import migrate_database


class MigrationTest(unittest.TestCase):
    def setUp(self):
        handle, self.db_path = tempfile.mkstemp(suffix=".db")
        os.close(handle)
        with sqlite3.connect(self.db_path) as connection:
            connection.executescript("""
                CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT, password_hash TEXT);
                CREATE TABLE documents (id TEXT PRIMARY KEY, title TEXT, sort_order REAL);
                CREATE TABLE nodes (id TEXT PRIMARY KEY, document_id TEXT, content TEXT, sort_order REAL);
                CREATE TABLE memos (id TEXT PRIMARY KEY, content TEXT, created_at TIMESTAMP);
                INSERT INTO documents (id, title, sort_order) VALUES ('doc-1', '旧文档', 0);
            """)

    def tearDown(self):
        os.unlink(self.db_path)

    def test_upgrades_legacy_schema_and_is_idempotent(self):
        first = migrate_database(self.db_path)
        second = migrate_database(self.db_path)

        self.assertIn("nodes.version", first)
        self.assertIn("documents.updated_at", first)
        self.assertEqual(second, [])
        with sqlite3.connect(self.db_path) as connection:
            node_columns = {row[1] for row in connection.execute("PRAGMA table_info(nodes)")}
            document = connection.execute("SELECT version, updated_at FROM documents WHERE id='doc-1'").fetchone()
            indexes = {row[1] for row in connection.execute("PRAGMA index_list(documents)")}
        self.assertTrue({"note", "is_todo", "is_in_progress", "version"}.issubset(node_columns))
        self.assertEqual(document[0], 1)
        self.assertIsNotNone(document[1])
        self.assertIn("ix_documents_sort_order", indexes)


if __name__ == "__main__":
    unittest.main()
