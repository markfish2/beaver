import asyncio
import json
import unittest

import httpx
from fastapi import FastAPI
from mcp.server.fastmcp.exceptions import ToolError
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import crud, models, schemas
from app.database import Base
from app.mcp_server import create_mcp_service


class McpServerTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.factory = sessionmaker(bind=self.engine)
        db = self.factory()
        user = models.User(username="mcp-test", password_hash="hash")
        hidden_folder = models.Document(title="不参与 AI", type="folder", ai_excluded=True)
        self.hidden_note = models.Document(title="不能泄露", type="note", parent=hidden_folder)
        self.visible_note = models.Document(title="可以读取", type="note")
        self.visible_folder = models.Document(title="可移动目标", type="folder")
        self.visible_outline = models.Document(title="大纲笔记", type="document")
        self.visible_canvas = models.Document(title="画布", type="excalidraw")
        hidden_memo = models.Memo(content="绝密 Memo", ai_excluded=True)
        visible_memo = models.Memo(content="公开 Memo")
        db.add_all([
            user, hidden_folder, self.hidden_note, self.visible_note,
            self.visible_folder, self.visible_outline, self.visible_canvas,
            hidden_memo, visible_memo,
        ])
        db.flush()
        self.hidden_note_id = str(self.hidden_note.id)
        self.visible_note_id = str(self.visible_note.id)
        self.hidden_folder_id = str(hidden_folder.id)
        self.visible_folder_id = str(self.visible_folder.id)
        self.visible_outline_id = str(self.visible_outline.id)
        self.visible_canvas_id = str(self.visible_canvas.id)
        self.visible_memo_id = str(visible_memo.id)
        db.add_all([
            models.Node(document_id=self.hidden_note.id, content="隐藏关键词", sort_order=0),
            models.Node(document_id=self.visible_note.id, content="隐藏关键词", sort_order=0),
        ])
        db.commit()
        _, self.token = crud.create_api_token(db, user.id, "MCP test")
        project = crud.create_project(db, "MCP 项目")
        task = crud.create_task(db, project.id, schemas.TaskCreate(
            title="MCP 任务", start_date="2026-09-01", end_date="2026-09-01",
        ))
        self.project_id = str(project.id)
        self.task_id = str(task.id)
        db.close()
        self.service = create_mcp_service(self.factory)

    async def asyncTearDown(self):
        Base.metadata.drop_all(self.engine)
        self.engine.dispose()

    async def _tool_json(self, name: str, arguments: dict):
        result = await self.service.server.call_tool(name, arguments)
        return json.loads(result[0].text)

    async def test_tools_hide_inherited_exclusions_and_reject_writes(self):
        documents = await self._tool_json("list_documents", {})
        titles = {item["title"] for item in documents["documents"]}
        self.assertIn("可以读取", titles)
        self.assertNotIn("不参与 AI", titles)
        self.assertNotIn("不能泄露", titles)

        search = await self._tool_json("search_notes", {"query": "隐藏关键词"})
        self.assertEqual([item["id"] for item in search["results"]], [self.visible_note_id])

        memos = await self._tool_json("list_memos", {})
        self.assertEqual([item["snippet"] for item in memos["memos"]], ["公开 Memo"])

        with self.assertRaisesRegex(ToolError, "资源不存在或不允许参与 AI"):
            await self.service.server.call_tool("get_document", {"document_id": self.hidden_note_id})
        with self.assertRaisesRegex(ToolError, "资源不存在或不允许参与 AI"):
            await self.service.server.call_tool("create_note", {
                "title": "不应创建", "parent_id": self.hidden_folder_id,
            })

    async def test_move_note_outline_and_canvas_to_folder_and_back(self):
        for document_id in (self.visible_note_id, self.visible_outline_id, self.visible_canvas_id):
            moved = await self._tool_json("move_document", {
                "document_id": document_id,
                "parent_id": self.visible_folder_id,
                "expected_version": 1,
            })
            self.assertTrue(moved["moved"])
            self.assertEqual(moved["parent_id"], self.visible_folder_id)
            self.assertEqual(moved["version"], 2)

            moved_to_root = await self._tool_json("move_document", {
                "document_id": document_id,
                "parent_id": None,
                "expected_version": 2,
            })
            self.assertTrue(moved_to_root["moved"])
            self.assertIsNone(moved_to_root["parent_id"])
            self.assertEqual(moved_to_root["version"], 3)

    async def test_move_rejects_restricted_target_and_stale_version(self):
        with self.assertRaisesRegex(ToolError, "资源不存在或不允许参与 AI"):
            await self.service.server.call_tool("move_document", {
                "document_id": self.visible_note_id,
                "parent_id": self.hidden_folder_id,
            })

        with self.assertRaisesRegex(ToolError, "其他设备修改"):
            await self.service.server.call_tool("move_document", {
                "document_id": self.visible_note_id,
                "parent_id": self.visible_folder_id,
                "expected_version": 999,
            })

    async def test_move_rejects_non_folder_target_and_descendant_target(self):
        with self.assertRaisesRegex(ToolError, "目标位置必须是"):
            await self.service.server.call_tool("move_document", {
                "document_id": self.visible_note_id,
                "parent_id": self.visible_outline_id,
            })

        child_folder = models.Document(title="笔记下级目录", type="folder", parent=self.visible_note)
        db = self.factory()
        db.add(child_folder)
        db.commit()
        child_folder_id = str(child_folder.id)
        db.close()
        with self.assertRaisesRegex(ToolError, "自己的下级"):
            await self.service.server.call_tool("move_document", {
                "document_id": self.visible_note_id,
                "parent_id": child_folder_id,
            })

    async def test_http_requires_token_and_serves_streamable_mcp_at_canonical_path(self):
        app = FastAPI()
        app.mount("/", self.service.asgi_app)
        async with self.service.server.session_manager.run():
            async with httpx.AsyncClient(
                transport=httpx.ASGITransport(app=app), base_url="http://test"
            ) as client:
                denied = await client.get("/mcp")
                self.assertEqual(denied.status_code, 401)

                initialized = await client.post(
                    "/mcp",
                    headers={
                        "Authorization": f"Bearer {self.token}",
                        "Accept": "application/json, text/event-stream",
                        "Content-Type": "application/json",
                    },
                    json={
                        "jsonrpc": "2.0",
                        "id": 1,
                        "method": "initialize",
                        "params": {
                            "protocolVersion": "2025-03-26",
                            "capabilities": {},
                            "clientInfo": {"name": "test", "version": "1"},
                        },
                    },
                )
                session_id = initialized.headers.get("mcp-session-id")
                request_headers = {
                    "Authorization": f"Bearer {self.token}",
                    "Accept": "application/json, text/event-stream",
                    "Content-Type": "application/json",
                    "mcp-session-id": session_id or "",
                }
                initialized_notification = await client.post(
                    "/mcp",
                    headers=request_headers,
                    json={"jsonrpc": "2.0", "method": "notifications/initialized", "params": {}},
                )
                tool_call = await client.post(
                    "/mcp",
                    headers=request_headers,
                    json={
                        "jsonrpc": "2.0",
                        "id": 2,
                        "method": "tools/call",
                        "params": {"name": "list_documents", "arguments": {}},
                    },
                )
                closed = await client.delete(
                    "/mcp",
                    headers=request_headers,
                )

        self.assertEqual(initialized.status_code, 200)
        self.assertTrue(session_id)
        self.assertEqual(initialized_notification.status_code, 202)
        self.assertEqual(tool_call.status_code, 200)
        self.assertIn("可以读取", tool_call.text)
        self.assertNotIn("不能泄露", tool_call.text)
        self.assertEqual(closed.status_code, 200)
        self.assertIn("Beaver Knowledge Base", initialized.text)

    async def test_todo_and_project_tools_round_trip(self):
        created = await self._tool_json("create_todo", {"content": "通过 MCP 创建待办"})
        self.assertFalse(created["is_completed"])
        completed = await self._tool_json("complete_todo", {"todo_id": created["id"]})
        self.assertTrue(completed["is_completed"])

        projects = await self._tool_json("list_projects", {})
        self.assertEqual(projects["projects"][0]["id"], self.project_id)
        tasks = await self._tool_json("list_tasks", {"project_id": self.project_id})
        self.assertEqual(tasks["tasks"][0]["id"], self.task_id)


if __name__ == "__main__":
    unittest.main()
