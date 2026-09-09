"""Authenticated MCP gateway for Beaver's AI-visible workspace content."""

import hashlib
import json
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import urlparse
from uuid import UUID

from mcp.server.fastmcp import FastMCP
from sqlalchemy.orm import Session
from starlette.datastructures import Headers
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

from . import crud, models, schemas
from .ai_access import AiAccessPolicy
from .database import SessionLocal

MAX_CONTENT_CHARS = 12_000
MAX_NOTE_WRITE_CHARS = 50_000
MAX_LIST_ITEMS = 100
RESOURCE_UNAVAILABLE = "资源不存在或不允许参与 AI"

SessionFactory = Callable[[], Session]


def _parse_uuid(value: str) -> UUID:
    try:
        return UUID(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(RESOURCE_UNAVAILABLE) from exc


def _clamp_limit(value: int, default: int = 30) -> int:
    if value <= 0:
        return default
    return min(value, MAX_LIST_ITEMS)


def _excerpt(content: str, query: str, max_chars: int = 240) -> str:
    content = content or ""
    index = content.lower().find(query.lower())
    if index < 0:
        return content[:max_chars]
    start = max(0, index - max_chars // 3)
    end = min(len(content), start + max_chars)
    prefix = "…" if start else ""
    suffix = "…" if end < len(content) else ""
    return f"{prefix}{content[start:end]}{suffix}"


def _document_metadata(document: models.Document) -> dict[str, Any]:
    return {
        "id": str(document.id),
        "title": document.title,
        "type": document.type,
        "parent_id": str(document.parent_id) if document.parent_id else None,
        "version": document.version,
        "updated_at": document.updated_at.isoformat() if document.updated_at else None,
    }


def _memo_metadata(memo: models.Memo) -> dict[str, Any]:
    return {
        "id": str(memo.id),
        "created_at": memo.created_at.isoformat(),
        "updated_at": memo.updated_at.isoformat(),
        "is_pinned": memo.is_pinned,
    }


def _todo_metadata(todo: models.Todo) -> dict[str, Any]:
    return {
        "id": str(todo.id),
        "content": todo.content,
        "is_completed": todo.is_completed,
        "sort_order": todo.sort_order,
        "updated_at": todo.updated_at.isoformat(),
    }


def _project_metadata(project: models.Project) -> dict[str, Any]:
    return {
        "id": str(project.id),
        "name": project.name,
        "sort_order": project.sort_order,
        "updated_at": project.updated_at.isoformat(),
    }


def _task_metadata(task: models.Task) -> dict[str, Any]:
    return {
        "id": str(task.id),
        "project_id": str(task.project_id),
        "parent_id": str(task.parent_id) if task.parent_id else None,
        "title": task.title,
        "start_date": task.start_date,
        "end_date": task.end_date,
        "is_done": task.is_done,
        "sort_order": task.sort_order,
    }


class BeaverMcpAuthentication:
    """Require an existing Beaver API Token for every MCP HTTP request."""

    def __init__(self, app: ASGIApp, session_factory: SessionFactory):
        self.app = app
        self.session_factory = session_factory

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        headers = Headers(scope=scope)
        origin = headers.get("origin")
        host = headers.get("host")
        if origin and (not host or urlparse(origin).netloc != host):
            await JSONResponse({"detail": "MCP origin is not allowed"}, status_code=403)(scope, receive, send)
            return

        authorization = headers.get("authorization", "")
        if not authorization.lower().startswith("bearer "):
            await JSONResponse({"detail": "Unauthorized"}, status_code=401)(scope, receive, send)
            return

        token = authorization[7:].strip()
        if not token:
            await JSONResponse({"detail": "Unauthorized"}, status_code=401)(scope, receive, send)
            return

        db = self.session_factory()
        try:
            user = crud.verify_api_token(db, token)
        finally:
            db.close()
        if user is None:
            await JSONResponse({"detail": "Unauthorized"}, status_code=401)(scope, receive, send)
            return

        scope.setdefault("state", {})["beaver_mcp_user_id"] = str(user.id)
        await self.app(scope, receive, send)


class McpPathAdapter:
    """Accept the canonical /mcp endpoint without Starlette's slash redirect."""

    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http" and scope["path"] == "/mcp":
            scope = {**scope, "path": "/mcp/", "raw_path": b"/mcp/"}
        await self.app(scope, receive, send)


@dataclass
class BeaverMcpService:
    server: FastMCP
    asgi_app: ASGIApp
    _lifespan: Any = field(init=False, default=None, repr=False)

    async def startup(self) -> None:
        self._lifespan = self.server.session_manager.run()
        await self._lifespan.__aenter__()

    async def shutdown(self) -> None:
        if self._lifespan is not None:
            await self._lifespan.__aexit__(None, None, None)
            self._lifespan = None


def create_mcp_service(session_factory: SessionFactory = SessionLocal) -> BeaverMcpService:
    """Create the mounted MCP service; injectable sessions keep tests isolated."""
    server = FastMCP(
        name="Beaver Knowledge Base",
        instructions=(
            "Use Beaver only for notes that are returned by its tools. "
            "Content marked as not participating in AI is intentionally invisible. "
            "Read before editing and preserve returned versions."
        ),
        streamable_http_path="/mcp",
        stateless_http=False,
    )

    def with_db(callback: Callable[[Session, AiAccessPolicy], Any]) -> Any:
        db = session_factory()
        try:
            return callback(db, AiAccessPolicy(db))
        finally:
            db.close()

    def require_document(db: Session, policy: AiAccessPolicy, document_id: str) -> models.Document:
        document = db.query(models.Document).filter(models.Document.id == _parse_uuid(document_id)).first()
        if not policy.is_document_allowed(document):
            raise ValueError(RESOURCE_UNAVAILABLE)
        return document

    def require_memo(db: Session, policy: AiAccessPolicy, memo_id: str) -> models.Memo:
        memo = db.query(models.Memo).filter(models.Memo.id == _parse_uuid(memo_id)).first()
        if not policy.is_memo_allowed(memo):
            raise ValueError(RESOURCE_UNAVAILABLE)
        return memo

    @server.tool(description="列出一个文件夹下允许 AI 访问的文档和文件夹；不返回被排除内容。")
    def list_documents(parent_id: str | None = None, limit: int = 100) -> dict[str, Any]:
        def operation(db: Session, policy: AiAccessPolicy) -> dict[str, Any]:
            parent_uuid = None
            if parent_id:
                parent = require_document(db, policy, parent_id)
                if parent.type != "folder":
                    raise ValueError(RESOURCE_UNAVAILABLE)
                parent_uuid = parent.id
            documents = db.query(models.Document).filter(
                models.Document.deleted_at.is_(None),
                models.Document.diary_date.is_(None),
                models.Document.parent_id == parent_uuid,
            ).order_by(models.Document.sort_order).all()
            visible = policy.filter_documents(documents)[:_clamp_limit(limit)]
            return {"documents": [_document_metadata(document) for document in visible]}

        return with_db(operation)

    @server.tool(description="将普通笔记、大纲笔记或画布移动到允许 AI 访问的文件夹；parent_id 为空表示移动到根目录。")
    def move_document(
        document_id: str,
        parent_id: str | None = None,
        expected_version: int | None = None,
    ) -> dict[str, Any]:
        def operation(db: Session, policy: AiAccessPolicy) -> dict[str, Any]:
            document = require_document(db, policy, document_id)
            if document.type not in ("document", "note", "excalidraw"):
                raise ValueError("MCP 只支持移动普通笔记、大纲笔记和画布")

            target_parent = None
            if parent_id:
                target_parent = require_document(db, policy, parent_id)
                if target_parent.type != "folder":
                    raise ValueError("目标位置必须是允许 AI 访问的文件夹")
                if any(item.id == target_parent.id for item in policy.descendants_of(document.id)):
                    raise ValueError("不能将笔记移动到自己的下级位置")

            if expected_version is not None and expected_version != document.version:
                raise ValueError("笔记已被其他设备修改，请重新读取后再移动")

            previous_parent_id = document.parent_id
            if previous_parent_id == (target_parent.id if target_parent else None):
                return {
                    **_document_metadata(document),
                    "moved": False,
                    "previous_parent_id": str(previous_parent_id) if previous_parent_id else None,
                }

            updated, status = crud.update_document(
                db,
                document.id,
                schemas.DocumentUpdate(
                    parent_id=target_parent.id if target_parent else None,
                    expected_version=expected_version,
                ),
            )
            if status == "conflict":
                raise ValueError("笔记已被其他设备修改，请重新读取后再移动")
            if status != "ok" or updated is None:
                raise ValueError(RESOURCE_UNAVAILABLE)
            return {
                **_document_metadata(updated),
                "moved": True,
                "previous_parent_id": str(previous_parent_id) if previous_parent_id else None,
            }

        return with_db(operation)

    @server.tool(description="分段读取一篇允许 AI 访问的普通笔记或大纲笔记，适合长文档。")
    def get_document(document_id: str, node_offset: int = 0, node_limit: int = 40) -> dict[str, Any]:
        def operation(db: Session, policy: AiAccessPolicy) -> dict[str, Any]:
            document = require_document(db, policy, document_id)
            if document.type == "folder":
                return {**_document_metadata(document), "children": list_documents(document_id, node_limit)["documents"]}
            nodes = db.query(models.Node).filter(
                models.Node.document_id == document.id,
            ).order_by(models.Node.sort_order, models.Node.id).all()
            offset = max(node_offset, 0)
            selected: list[dict[str, Any]] = []
            content_length = 0
            for node in nodes[offset:offset + _clamp_limit(node_limit, 40)]:
                node_text = f"{node.content or ''}\n{node.note or ''}"
                if selected and content_length + len(node_text) > MAX_CONTENT_CHARS:
                    break
                content_length += len(node_text)
                selected.append({
                    "id": str(node.id),
                    "content": node.content,
                    "note": node.note,
                    "heading": node.heading,
                    "sort_order": node.sort_order,
                    "version": node.version,
                })
            full_text = "\n".join(f"{node.content or ''}\n{node.note or ''}" for node in nodes)
            return {
                **_document_metadata(document),
                "nodes": selected,
                "node_offset": offset,
                "has_more": offset + len(selected) < len(nodes),
                "content_hash": hashlib.sha256(full_text.encode("utf-8")).hexdigest(),
            }

        return with_db(operation)

    @server.tool(description="按关键词搜索允许 AI 访问的普通笔记、大纲笔记和 Memo。")
    def search_notes(query: str, limit: int = 20) -> dict[str, Any]:
        if not query or len(query) > 200:
            raise ValueError("搜索词长度必须在 1 到 200 个字符之间")

        def operation(db: Session, policy: AiAccessPolicy) -> dict[str, Any]:
            capped_limit = _clamp_limit(limit, 20)
            visible_documents = policy.filter_documents(db.query(models.Document).filter(
                models.Document.deleted_at.is_(None),
                models.Document.type.in_(("document", "note")),
                models.Document.diary_date.is_(None),
            ).all())
            document_ids = [document.id for document in visible_documents]
            results: list[dict[str, Any]] = []
            for document in visible_documents:
                if query.lower() in document.title.lower():
                    results.append({**_document_metadata(document), "kind": "document", "snippet": _excerpt(document.title, query)})
            if document_ids:
                nodes = db.query(models.Node).filter(
                    models.Node.document_id.in_(document_ids),
                    (models.Node.content.ilike(f"%{query}%")) | (models.Node.note.ilike(f"%{query}%")),
                ).order_by(models.Node.sort_order).all()
                documents_by_id = {document.id: document for document in visible_documents}
                found_document_ids = {result["id"] for result in results}
                for node in nodes:
                    document = documents_by_id[node.document_id]
                    if str(document.id) in found_document_ids:
                        continue
                    results.append({
                        **_document_metadata(document),
                        "kind": "document",
                        "snippet": _excerpt(node.content or node.note or "", query),
                    })
                    found_document_ids.add(str(document.id))
                    if len(results) >= capped_limit:
                        break
            if len(results) < capped_limit:
                memos = policy.filter_memos(db.query(models.Memo).filter(
                    models.Memo.deleted_at.is_(None),
                    models.Memo.is_archived == False,
                    models.Memo.content.ilike(f"%{query}%"),
                ).order_by(models.Memo.created_at.desc()).all())
                for memo in memos:
                    results.append({
                        **_memo_metadata(memo),
                        "kind": "memo",
                        "snippet": _excerpt(memo.content, query),
                    })
                    if len(results) >= capped_limit:
                        break
            return {"query": query, "results": results[:capped_limit]}

        return with_db(operation)

    @server.tool(description="列出允许 AI 访问的最新 Memo，不包含归档或排除内容。")
    def list_memos(limit: int = 30) -> dict[str, Any]:
        def operation(db: Session, policy: AiAccessPolicy) -> dict[str, Any]:
            memos = policy.filter_memos(db.query(models.Memo).filter(
                models.Memo.deleted_at.is_(None),
                models.Memo.is_archived == False,
            ).order_by(models.Memo.is_pinned.desc(), models.Memo.created_at.desc()).all())
            return {
                "memos": [
                    {**_memo_metadata(memo), "snippet": memo.content[:500]}
                    for memo in memos[:_clamp_limit(limit, 30)]
                ]
            }

        return with_db(operation)

    @server.tool(description="读取一条允许 AI 访问的 Memo。")
    def get_memo(memo_id: str) -> dict[str, Any]:
        def operation(db: Session, policy: AiAccessPolicy) -> dict[str, Any]:
            memo = require_memo(db, policy, memo_id)
            return {**_memo_metadata(memo), "content": memo.content[:MAX_CONTENT_CHARS], "truncated": len(memo.content) > MAX_CONTENT_CHARS}

        return with_db(operation)

    @server.tool(description="读取一篇普通笔记的划线；受限笔记不会返回划线。")
    def list_highlights(document_id: str, limit: int = 100) -> dict[str, Any]:
        def operation(db: Session, policy: AiAccessPolicy) -> dict[str, Any]:
            document = require_document(db, policy, document_id)
            if document.type != "note":
                raise ValueError(RESOURCE_UNAVAILABLE)
            highlights = db.query(models.NoteHighlight).filter(
                models.NoteHighlight.document_id == document.id,
            ).order_by(models.NoteHighlight.block_line, models.NoteHighlight.created_at).limit(_clamp_limit(limit)).all()
            return {"highlights": [{
                "id": str(item.id), "quote": item.quote, "prefix": item.prefix,
                "suffix": item.suffix, "block_line": item.block_line,
            } for item in highlights]}

        return with_db(operation)

    @server.tool(description="列出待办事项。")
    def list_todos(include_completed: bool = False, limit: int = 100) -> dict[str, Any]:
        def operation(db: Session, policy: AiAccessPolicy) -> dict[str, Any]:
            todos = db.query(models.Todo).filter(
                models.Todo.is_completed == include_completed,
            ).order_by(models.Todo.sort_order, models.Todo.created_at.desc()).limit(_clamp_limit(limit)).all()
            return {"todos": [_todo_metadata(todo) for todo in todos]}

        return with_db(operation)

    @server.tool(description="创建待办事项。")
    def create_todo(content: str) -> dict[str, Any]:
        if not content.strip() or len(content) > 2_000:
            raise ValueError("待办内容长度不符合限制")

        def operation(db: Session, policy: AiAccessPolicy) -> dict[str, Any]:
            todo = crud.create_todo(db, schemas.TodoCreate(content=content.strip(), sort_order=time.time()))
            return _todo_metadata(todo)

        return with_db(operation)

    @server.tool(description="完成或重新打开一个待办事项。")
    def complete_todo(todo_id: str, completed: bool = True) -> dict[str, Any]:
        def operation(db: Session, policy: AiAccessPolicy) -> dict[str, Any]:
            todo = crud.update_todo(db, _parse_uuid(todo_id), schemas.TodoUpdate(is_completed=completed))
            if todo is None:
                raise ValueError(RESOURCE_UNAVAILABLE)
            return _todo_metadata(todo)

        return with_db(operation)

    @server.tool(description="列出当前项目。")
    def list_projects(limit: int = 100) -> dict[str, Any]:
        def operation(db: Session, policy: AiAccessPolicy) -> dict[str, Any]:
            projects = crud.get_projects(db)[:_clamp_limit(limit)]
            return {"projects": [_project_metadata(project) for project in projects]}

        return with_db(operation)

    @server.tool(description="列出一个项目的任务。")
    def list_tasks(project_id: str, limit: int = 100) -> dict[str, Any]:
        def operation(db: Session, policy: AiAccessPolicy) -> dict[str, Any]:
            project = db.query(models.Project).filter(
                models.Project.id == _parse_uuid(project_id),
                models.Project.is_deleted == False,
            ).first()
            if project is None:
                raise ValueError(RESOURCE_UNAVAILABLE)
            tasks = crud.get_tasks_flat(db, project.id)[:_clamp_limit(limit)]
            return {"project": _project_metadata(project), "tasks": [_task_metadata(task) for task in tasks]}

        return with_db(operation)

    @server.tool(description="在允许 AI 访问的位置创建普通笔记。不能创建到被排除的文件夹。")
    def create_note(title: str, content: str = "", parent_id: str | None = None) -> dict[str, Any]:
        if not title.strip() or len(title) > 200 or len(content) > MAX_NOTE_WRITE_CHARS:
            raise ValueError("标题或正文长度不符合限制")

        def operation(db: Session, policy: AiAccessPolicy) -> dict[str, Any]:
            parent_uuid = None
            if parent_id:
                parent = require_document(db, policy, parent_id)
                if parent.type != "folder":
                    raise ValueError(RESOURCE_UNAVAILABLE)
                parent_uuid = parent.id
            document = crud.create_document(db, schemas.DocumentCreate(
                title=title.strip(), type="note", parent_id=parent_uuid, sort_order=time.time(),
            ))
            if content:
                crud.create_node(db, schemas.NodeCreate(
                    document_id=document.id, content=content, sort_order=0,
                ))
            return _document_metadata(document)

        return with_db(operation)

    @server.tool(description="更新允许 AI 访问的普通笔记正文。调用前必须先读取并提供根节点版本。")
    def update_note_content(document_id: str, content: str, expected_node_version: int) -> dict[str, Any]:
        if len(content) > MAX_NOTE_WRITE_CHARS:
            raise ValueError("正文长度超过限制")

        def operation(db: Session, policy: AiAccessPolicy) -> dict[str, Any]:
            document = require_document(db, policy, document_id)
            if document.type != "note":
                raise ValueError(RESOURCE_UNAVAILABLE)
            root_node = db.query(models.Node).filter(
                models.Node.document_id == document.id,
                models.Node.parent_node_id.is_(None),
            ).order_by(models.Node.sort_order, models.Node.id).first()
            if root_node is None:
                if expected_node_version != 0:
                    raise ValueError("内容已被其他设备修改，请重新读取后再试")
                root_node = crud.create_node(db, schemas.NodeCreate(
                    document_id=document.id, content=content, sort_order=0,
                ))
            else:
                updated, status = crud.update_node(db, root_node.id, schemas.NodeUpdate(
                    content=content, expected_version=expected_node_version,
                ))
                if status != "ok" or updated is None:
                    raise ValueError("内容已被其他设备修改，请重新读取后再试")
                root_node = updated
            return {"document_id": str(document.id), "node_id": str(root_node.id), "node_version": root_node.version}

        return with_db(operation)

    @server.tool(description="创建一条新的、允许 AI 访问的 Memo。")
    def create_memo(content: str) -> dict[str, Any]:
        if not content.strip() or len(content) > MAX_NOTE_WRITE_CHARS:
            raise ValueError("Memo 正文长度不符合限制")

        def operation(db: Session, policy: AiAccessPolicy) -> dict[str, Any]:
            memo = crud.create_memo(db, schemas.MemoCreate(content=content))
            return _memo_metadata(memo)

        return with_db(operation)

    @server.tool(description="向允许 AI 访问的 Memo 追加内容。调用前必须提供读取时返回的更新时间。")
    def append_memo(memo_id: str, content: str, expected_updated_at: str) -> dict[str, Any]:
        if not content.strip() or len(content) > MAX_NOTE_WRITE_CHARS:
            raise ValueError("追加内容长度不符合限制")

        def operation(db: Session, policy: AiAccessPolicy) -> dict[str, Any]:
            memo = require_memo(db, policy, memo_id)
            if memo.updated_at.isoformat() != expected_updated_at:
                raise ValueError("内容已被其他设备修改，请重新读取后再试")
            # 保持现有 CRUD 的索引和缓存处理，不直接修改模型字段。
            updated = crud.update_memo(db, memo.id, schemas.MemoUpdate(
                content=f"{memo.content.rstrip()}\n\n{content.strip()}",
            ))
            if updated is None:
                raise ValueError(RESOURCE_UNAVAILABLE)
            return _memo_metadata(updated)

        return with_db(operation)

    @server.resource(
        "beaver://document/{document_id}",
        name="Beaver 文档",
        description="允许 AI 访问的文档资源；读取时自动执行权限校验。",
        mime_type="application/json",
    )
    def document_resource(document_id: str) -> str:
        return json.dumps(get_document(document_id), ensure_ascii=False)

    @server.resource(
        "beaver://memo/{memo_id}",
        name="Beaver Memo",
        description="允许 AI 访问的 Memo 资源；读取时自动执行权限校验。",
        mime_type="application/json",
    )
    def memo_resource(memo_id: str) -> str:
        return json.dumps(get_memo(memo_id), ensure_ascii=False)

    # Calling streamable_http_app initializes the SDK session manager. The main
    # FastAPI application's startup/shutdown hooks own that manager's lifespan.
    mcp_asgi = server.streamable_http_app()
    protected_app = BeaverMcpAuthentication(mcp_asgi, session_factory)
    return BeaverMcpService(server=server, asgi_app=McpPathAdapter(protected_app))
