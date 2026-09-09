import unittest
from unittest.mock import patch

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.ai_access import AiAccessPolicy
from app import crud, models, schemas
from app.database import Base
from app.routers.ai_chat import _search_notes


class AiAccessPolicyTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine)()

    def tearDown(self):
        self.db.close()
        Base.metadata.drop_all(self.engine)
        self.engine.dispose()

    def test_folder_exclusion_is_inherited_by_every_descendant(self):
        restricted = models.Document(title="私密资料", type="folder", ai_excluded=True)
        child_folder = models.Document(title="子目录", type="folder", parent=restricted)
        note = models.Document(title="笔记", type="note", parent=child_folder)
        allowed = models.Document(title="公开笔记", type="note")
        self.db.add_all([restricted, child_folder, note, allowed])
        self.db.commit()

        policy = AiAccessPolicy(self.db)
        self.assertFalse(policy.is_document_allowed(restricted))
        self.assertFalse(policy.is_document_allowed(child_folder))
        self.assertFalse(policy.is_document_allowed(note))
        self.assertTrue(policy.is_document_allowed(allowed))
        self.assertEqual([item.id for item in policy.descendants_of(restricted.id)], [
            restricted.id, child_folder.id, note.id,
        ])

    def test_child_cannot_override_restricted_parent(self):
        restricted = models.Document(title="私密目录", type="folder", ai_excluded=True)
        child = models.Document(title="子笔记", type="note", parent=restricted, ai_excluded=False)
        self.db.add_all([restricted, child])
        self.db.commit()

        self.assertFalse(AiAccessPolicy(self.db).is_document_allowed(child))

    def test_own_exclusion_and_deleted_memos_are_denied(self):
        own_excluded = models.Document(title="私密笔记", type="note", ai_excluded=True)
        private_memo = models.Memo(content="私密", ai_excluded=True)
        self.db.add_all([own_excluded, private_memo])
        self.db.commit()

        policy = AiAccessPolicy(self.db)
        self.assertFalse(policy.is_document_allowed(own_excluded))
        self.assertFalse(policy.is_memo_allowed(private_memo))

    def test_parent_cycle_fails_closed(self):
        first = models.Document(title="A", type="folder")
        second = models.Document(title="B", type="folder", parent=first)
        self.db.add_all([first, second])
        self.db.commit()
        first.parent_id = second.id
        self.db.commit()

        self.assertFalse(AiAccessPolicy(self.db).is_document_allowed(first))

    def test_ai_keyword_search_hides_notes_inside_restricted_folder(self):
        restricted = models.Document(title="私密目录", type="folder", ai_excluded=True)
        hidden = models.Document(title="隐藏笔记", type="note", parent=restricted)
        visible = models.Document(title="公开笔记", type="note")
        self.db.add_all([restricted, hidden, visible])
        self.db.flush()
        self.db.add_all([
            models.Node(document_id=hidden.id, content="机密关键词", sort_order=0),
            models.Node(document_id=visible.id, content="机密关键词", sort_order=0),
        ])
        self.db.commit()

        results = _search_notes(self.db, "机密关键词")
        result_ids = {item["id"] for item in results}
        self.assertNotIn(str(hidden.id), result_ids)
        self.assertIn(str(visible.id), result_ids)

    def test_folder_exclusion_purges_descendant_embeddings(self):
        folder = models.Document(title="待限制目录", type="folder")
        child = models.Document(title="子笔记", type="note", parent=folder)
        self.db.add_all([folder, child])
        self.db.commit()

        with patch("app.crud._delete_embeddings") as delete_embeddings:
            updated, status = crud.update_document(
                self.db,
                folder.id,
                schemas.DocumentUpdate(ai_excluded=True, expected_version=1),
            )

        self.assertEqual(status, "ok")
        self.assertTrue(updated.ai_excluded)
        delete_embeddings.assert_called_once_with("document", str(child.id))


if __name__ == "__main__":
    unittest.main()
