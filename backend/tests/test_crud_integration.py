import unittest

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import crud, schemas
from app.database import Base


class CrudIntegrationTest(unittest.TestCase):
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

    def test_document_and_node_round_trip(self):
        document = crud.create_document(self.db, schemas.DocumentCreate(title="测试文档"))
        node = crud.create_node(self.db, schemas.NodeCreate(
            document_id=document.id,
            content="第一条",
            sort_order=10000,
        ))

        self.assertEqual(crud.get_document(self.db, document.id).title, "测试文档")
        self.assertEqual(node.document_id, document.id)
        self.assertEqual(node.version, 1)

    def test_document_optimistic_lock_rejects_stale_version(self):
        document = crud.create_document(self.db, schemas.DocumentCreate(title="初始标题"))
        updated, status = crud.update_document(
            self.db,
            document.id,
            schemas.DocumentUpdate(title="新标题", expected_version=1),
        )
        self.assertEqual(status, "ok")
        self.assertEqual(updated.version, 2)

        current, status = crud.update_document(
            self.db,
            document.id,
            schemas.DocumentUpdate(title="过期写入", expected_version=1),
        )
        self.assertEqual(status, "conflict")
        self.assertEqual(current.title, "新标题")


if __name__ == "__main__":
    unittest.main()
