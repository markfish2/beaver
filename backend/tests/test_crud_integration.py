import unittest

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import crud, schemas
from app.database import Base
from app.routers.tasks import _add_to_diary, _remove_from_diary
from datetime import date


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

    def _create_project_and_children(self):
        project = crud.create_project(self.db, "甘特图测试项目")
        parent = crud.create_task(self.db, project.id, schemas.TaskCreate(
            title="父任务",
            start_date="2026-08-01",
            end_date="2026-08-10",
        ))
        child_a = crud.create_task(self.db, project.id, schemas.TaskCreate(
            title="子任务A",
            start_date="2026-08-02",
            end_date="2026-08-04",
            parent_id=parent.id,
        ))
        child_b = crud.create_task(self.db, project.id, schemas.TaskCreate(
            title="子任务B",
            start_date="2026-08-06",
            end_date="2026-08-09",
            parent_id=parent.id,
        ))
        return project, parent, child_a, child_b

    def test_parent_task_period_follows_children_on_create(self):
        _, parent, _, _ = self._create_project_and_children()
        self.db.refresh(parent)
        self.assertEqual(parent.start_date, "2026-08-02")
        self.assertEqual(parent.end_date, "2026-08-09")

    def test_parent_task_period_follows_child_update(self):
        _, parent, child_a, _ = self._create_project_and_children()
        crud.update_task(self.db, child_a.id, schemas.TaskUpdate(
            start_date="2026-08-01",
            end_date="2026-08-12",
        ))
        self.db.refresh(parent)
        self.assertEqual(parent.start_date, "2026-08-01")
        self.assertEqual(parent.end_date, "2026-08-12")

    def test_summary_task_dates_are_derived_not_editable(self):
        _, parent, _, _ = self._create_project_and_children()
        crud.update_task(self.db, parent.id, schemas.TaskUpdate(
            start_date="2020-01-01",
            end_date="2020-02-01",
        ))
        self.db.refresh(parent)
        self.assertEqual(parent.start_date, "2026-08-02")
        self.assertEqual(parent.end_date, "2026-08-09")

    def test_parent_task_period_follows_child_delete(self):
        project, parent, child_a, _ = self._create_project_and_children()
        crud.delete_task(self.db, child_a.id)
        self.db.refresh(parent)
        self.assertEqual(parent.start_date, "2026-08-06")
        self.assertEqual(parent.end_date, "2026-08-09")
        self.assertTrue(crud.delete_task(self.db, parent.id))

    def test_grandparent_period_follows_nested_children(self):
        project = crud.create_project(self.db, "多级项目")
        root = crud.create_task(self.db, project.id, schemas.TaskCreate(
            title="根任务",
            start_date="2026-08-01",
            end_date="2026-08-01",
        ))
        sub = crud.create_task(self.db, project.id, schemas.TaskCreate(
            title="中间任务",
            start_date="2026-08-01",
            end_date="2026-08-01",
            parent_id=root.id,
        ))
        leaf = crud.create_task(self.db, project.id, schemas.TaskCreate(
            title="叶子任务",
            start_date="2026-08-05",
            end_date="2026-08-20",
            parent_id=sub.id,
        ))
        self.db.refresh(root)
        self.db.refresh(sub)
        self.assertEqual(sub.start_date, "2026-08-05")
        self.assertEqual(sub.end_date, "2026-08-20")
        self.assertEqual(root.start_date, "2026-08-05")
        self.assertEqual(root.end_date, "2026-08-20")

        crud.update_task(self.db, leaf.id, schemas.TaskUpdate(end_date="2026-08-30"))
        self.db.refresh(root)
        self.db.refresh(sub)
        self.assertEqual(sub.end_date, "2026-08-30")
        self.assertEqual(root.end_date, "2026-08-30")

    def test_update_task_persists_parent_and_sort_order(self):
        project = crud.create_project(self.db, "移动排序项目")
        parent = crud.create_task(self.db, project.id, schemas.TaskCreate(
            title="父任务",
            start_date="2026-09-01",
            end_date="2026-09-01",
        ))
        child = crud.create_task(self.db, project.id, schemas.TaskCreate(
            title="子任务",
            start_date="2026-09-02",
            end_date="2026-09-03",
        ))
        crud.update_task(self.db, child.id, schemas.TaskUpdate(
            parent_id=parent.id,
            sort_order=500.0,
        ))
        self.db.refresh(child)
        self.db.refresh(parent)
        self.assertEqual(child.parent_id, parent.id)
        self.assertEqual(child.sort_order, 500.0)
        self.assertEqual(parent.start_date, "2026-09-02")
        self.assertEqual(parent.end_date, "2026-09-03")

    def test_update_task_can_move_to_root_and_recompute_old_parent(self):
        project = crud.create_project(self.db, "移动到根级项目")
        parent = crud.create_task(self.db, project.id, schemas.TaskCreate(
            title="父任务",
            start_date="2026-09-01",
            end_date="2026-09-01",
        ))
        child = crud.create_task(self.db, project.id, schemas.TaskCreate(
            title="子任务",
            start_date="2026-09-02",
            end_date="2026-09-03",
            parent_id=parent.id,
        ))

        crud.update_task(self.db, child.id, schemas.TaskUpdate(parent_id=None))
        self.db.refresh(child)
        self.db.refresh(parent)
        self.assertIsNone(child.parent_id)
        # 父任务失去子任务后保留当前周期，之后可以独立调整。
        self.assertEqual(parent.start_date, "2026-09-02")
        self.assertEqual(parent.end_date, "2026-09-03")

    def test_task_cannot_be_moved_into_own_descendant(self):
        project = crud.create_project(self.db, "防环项目")
        root = crud.create_task(self.db, project.id, schemas.TaskCreate(
            title="根任务",
            start_date="2026-08-01",
            end_date="2026-08-10",
        ))
        child = crud.create_task(self.db, project.id, schemas.TaskCreate(
            title="子任务",
            start_date="2026-08-02",
            end_date="2026-08-05",
            parent_id=root.id,
        ))
        grandchild = crud.create_task(self.db, project.id, schemas.TaskCreate(
            title="孙任务",
            start_date="2026-08-03",
            end_date="2026-08-04",
            parent_id=child.id,
        ))

        # 尝试把 root 挂到自己的孙任务下，应被忽略
        crud.update_task(self.db, root.id, schemas.TaskUpdate(parent_id=grandchild.id))
        self.db.refresh(root)
        self.assertIsNone(root.parent_id)

        # reorder 批量移动同样不能成环
        crud.reorder_tasks(self.db, [{
            "id": str(root.id),
            "sort_order": 0.0,
            "parent_id": str(grandchild.id),
        }])
        self.db.refresh(root)
        self.assertIsNone(root.parent_id)

    def test_task_completion_syncs_diary_entry(self):
        project = crud.create_project(self.db, "日记联动项目")
        task = crud.create_task(self.db, project.id, schemas.TaskCreate(
            title="写周报",
            start_date="2026-08-01",
            end_date="2026-08-01",
        ))

        today = date.today()
        doc, _ = crud.get_or_create_monthly_diary_doc(self.db, today.year, today.month)
        day_node, _, _ = crud.get_or_create_day_node(self.db, doc.id, today.year, today.month, today.day)

        # 完成 → 自动加入当天日记
        _add_to_diary(self.db, task)
        expected = "写周报 #日记联动项目"
        added = self.db.query(crud.models.Node).filter(
            crud.models.Node.document_id == doc.id,
            crud.models.Node.parent_node_id == day_node.id,
            crud.models.Node.content == expected,
        ).first()
        self.assertIsNotNone(added)
        self.assertTrue(added.is_completed)

        # 取消完成 → 从当天日记移除
        _remove_from_diary(self.db, task)
        remaining = self.db.query(crud.models.Node).filter(
            crud.models.Node.document_id == doc.id,
            crud.models.Node.parent_node_id == day_node.id,
            crud.models.Node.content == expected,
        ).first()
        self.assertIsNone(remaining)


if __name__ == "__main__":
    unittest.main()
