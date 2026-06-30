from sqlalchemy.orm import Session
from sqlalchemy import func
from . import models, schemas, auth
import uuid
import re
import time
import json
import logging
from datetime import datetime
from typing import Optional

logger = logging.getLogger(__name__)

# User
def get_user_by_username(db: Session, username: str):
    return db.query(models.User).filter(models.User.username == username).first()

def get_users_count(db: Session):
    return db.query(models.User).count()

def create_user(db: Session, user: schemas.UserCreate):
    hashed_password = auth.get_password_hash(user.password)
    db_user = models.User(username=user.username, password_hash=hashed_password)
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

def update_user_settings(db: Session, user_id: uuid.UUID, settings: schemas.UserSettingsUpdate):
    db_user = db.query(models.User).filter(models.User.id == user_id).first()
    if not db_user:
        return None
    if settings.theme:
        db_user.theme = settings.theme
    if settings.font_family:
        db_user.font_family = settings.font_family
    if settings.font_size:
        db_user.font_size = settings.font_size
    if settings.memo_columns is not None:
        db_user.memo_columns = settings.memo_columns
    db.commit()
    db.refresh(db_user)
    return db_user

def update_user_password(db: Session, user_id: uuid.UUID, password: str):
    hashed_password = auth.get_password_hash(password)
    db_user = db.query(models.User).filter(models.User.id == user_id).first()
    if db_user:
        db_user.password_hash = hashed_password
        db.commit()
    return db_user

def update_user_profile(db: Session, user_id: uuid.UUID, profile: schemas.UserProfileUpdate):
    db_user = db.query(models.User).filter(models.User.id == user_id).first()
    if not db_user:
        return None
    update_data = profile.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_user, key, value)
    db.commit()
    db.refresh(db_user)
    return db_user

# Documents
def get_documents(db: Session, search: str = None):
    query = db.query(models.Document).filter(models.Document.deleted_at.is_(None))
    if search:
        search_pattern = f"%{search}%"
        # Filter documents where title matches OR any child node content/note matches
        query = query.outerjoin(models.Node, models.Node.document_id == models.Document.id).filter(
            (models.Document.title.like(search_pattern)) |
            (models.Node.content.like(search_pattern)) |
            (models.Node.note.like(search_pattern))
        ).distinct()
    else:
        # Exclude diary documents from normal listing
        query = query.filter(models.Document.diary_date.is_(None))
    return query.order_by(models.Document.sort_order).all()

def get_recent_documents(db: Session, limit: int = 20):
    """获取最近编辑的文档（排除文件夹、日记、已删除）"""
    return db.query(models.Document).filter(
        models.Document.deleted_at.is_(None),
        models.Document.diary_date.is_(None),
        models.Document.type.in_(["document", "excalidraw", "note"])
    ).order_by(models.Document.updated_at.desc()).limit(limit).all()

def get_document(db: Session, document_id: uuid.UUID):
    return db.query(models.Document).filter(models.Document.id == document_id).first()

def create_document(db: Session, document: schemas.DocumentCreate):
    db_document = models.Document(**document.model_dump())
    db.add(db_document)
    db.commit()
    db.refresh(db_document)
    return db_document

def update_document(db: Session, document_id: uuid.UUID, document: schemas.DocumentUpdate):
    db_doc = db.query(models.Document).filter(models.Document.id == document_id).first()
    if not db_doc:
        return None, "not_found"
    # Version conflict check
    expected = document.expected_version
    if expected is not None and expected != db_doc.version:
        return db_doc, "conflict"
    update_data = document.model_dump(exclude_unset=True, exclude={'expected_version'})
    # ai_excluded 变化时处理向量索引
    ai_excluded_changed = 'ai_excluded' in update_data and update_data['ai_excluded'] != db_doc.ai_excluded
    for key, value in update_data.items():
        setattr(db_doc, key, value)
    db_doc.version += 1
    db.commit()
    db.refresh(db_doc)
    # ai_excluded 变化时更新向量索引
    if ai_excluded_changed:
        if db_doc.ai_excluded:
            _delete_embeddings("document", str(document_id))
        else:
            _trigger_doc_embedding_index(db, document_id)
    return db_doc, "ok"

def copy_document(db: Session, document_id: uuid.UUID):
    import copy
    db_doc = db.query(models.Document).filter(models.Document.id == document_id).first()
    if not db_doc:
        return None

    # Create new document with "副本" suffix
    new_doc = models.Document(
        title=f"{db_doc.title}副本",
        type=db_doc.type,
        parent_id=db_doc.parent_id,
        sort_order=db_doc.sort_order + 0.1,
        is_starred=False,
        icon=db_doc.icon,
    )
    db.add(new_doc)
    db.flush()  # Get new_doc.id without committing

    # Copy all nodes, maintaining parent-child relationships
    original_nodes = db.query(models.Node).filter(
        models.Node.document_id == document_id
    ).order_by(models.Node.sort_order).all()

    id_map = {}  # original_id -> new_id
    new_nodes = []
    for node in original_nodes:
        new_node = models.Node(
            document_id=new_doc.id,
            parent_node_id=None,  # will fix below
            content=node.content,
            note=node.note,
            is_completed=node.is_completed,
            is_collapsed=node.is_collapsed,
            sort_order=node.sort_order,
            heading=node.heading,
            is_bold=node.is_bold,
            is_italic=node.is_italic,
            color=node.color,
            highlight=node.highlight,
            is_todo=node.is_todo,
            content_type=node.content_type,
            file_path=node.file_path,
            file_name=node.file_name,
        )
        db.add(new_node)
        new_nodes.append((node, new_node))

    # Flush all new nodes to get their IDs
    db.flush()

    # Build id_map
    for orig_node, new_node in new_nodes:
        id_map[orig_node.id] = new_node.id

    # Fix parent_node_id references in batch
    for orig_node, new_node in new_nodes:
        if orig_node.parent_node_id and orig_node.parent_node_id in id_map:
            new_node.parent_node_id = id_map[orig_node.parent_node_id]

    db.commit()
    db.refresh(new_doc)

    # 复制画布数据（excalidraw 类型）
    if db_doc.type == 'excalidraw':
        from . import excalidraw_storage as ex_storage
        src_id = str(document_id)
        dst_id = str(new_doc.id)
        # 读取原始场景数据
        scene = ex_storage.read_scene(src_id)
        if scene is not None:
            # 移除版本号，副本从版本 1 开始
            scene.pop('_version', None)
            ex_storage.write_scene(dst_id, scene)
        # 复制图片文件
        files_meta = ex_storage.read_files_meta(src_id)
        if files_meta:
            new_meta = {}
            for file_id, meta in files_meta.items():
                result = ex_storage.read_image_file(src_id, file_id)
                if result:
                    raw, mime = result
                    ext = meta.get('ext', '.png')
                    filepath = ex_storage.get_file_path(dst_id, file_id, ext)
                    ex_storage._atomic_write_bytes(filepath, raw)
                    new_meta[file_id] = meta
            if new_meta:
                ex_storage.write_files_meta(dst_id, new_meta)
        # 创建 excalidraw_data 记录
        excal_data = models.ExcalidrawData(
            id=str(uuid.uuid4()),
            document_id=dst_id,
            scene_data=None
        )
        db.add(excal_data)
        db.commit()

    # 复制后索引向量
    if new_doc.type not in ('folder', 'excalidraw'):
        _trigger_doc_embedding_index(db, new_doc.id)

    return new_doc

def delete_document(db: Session, document_id: uuid.UUID, delete_children: bool = False):
    """软删除：移到回收站"""
    db_doc = db.query(models.Document).filter(models.Document.id == document_id).first()
    if db_doc:
        now = datetime.utcnow()
        if db_doc.type == "folder":
            if delete_children:
                # 递归软删除文件夹内所有子项
                _soft_delete_folder_recursive(db, document_id, now)
            else:
                # 将直接子项移到根目录
                db.query(models.Document).filter(models.Document.parent_id == document_id).update(
                    {"parent_id": None},
                    synchronize_session=False
                )
                db.commit()
            # 软删除文件夹本身
            db_doc.original_parent_id = str(db_doc.parent_id) if db_doc.parent_id else None
            db_doc.parent_id = None
            db_doc.deleted_at = now
            db.commit()
        else:
            # 软删除文档（保留节点，恢复时自动可见）
            db_doc.original_parent_id = str(db_doc.parent_id) if db_doc.parent_id else None
            db_doc.parent_id = None
            db_doc.deleted_at = now
            db.commit()
        _delete_embeddings("document", str(document_id))
        return True
    return False


def _soft_delete_folder_recursive(db: Session, folder_id: uuid.UUID, deleted_at):
    """递归软删除文件夹内所有子文件夹和文档"""
    children = db.query(models.Document).filter(models.Document.parent_id == folder_id).all()
    for child in children:
        if child.type == "folder":
            _soft_delete_folder_recursive(db, child.id, deleted_at)
        child.original_parent_id = str(child.parent_id) if child.parent_id else None
        child.parent_id = None
        child.deleted_at = deleted_at
    db.commit()


def get_trash_items(db: Session):
    """获取回收站所有内容"""
    deleted_documents = db.query(models.Document).filter(
        models.Document.deleted_at.isnot(None)
    ).order_by(models.Document.deleted_at.desc()).all()
    deleted_memos = db.query(models.Memo).filter(
        models.Memo.deleted_at.isnot(None)
    ).order_by(models.Memo.deleted_at.desc()).all()
    return {"documents": deleted_documents, "memos": deleted_memos}


def restore_document(db: Session, document_id: uuid.UUID):
    """恢复文档到原位置"""
    db_doc = db.query(models.Document).filter(models.Document.id == document_id).first()
    if not db_doc or not db_doc.deleted_at:
        return False
    # 恢复父级
    if db_doc.original_parent_id:
        try:
            parent_uuid = uuid.UUID(db_doc.original_parent_id)
            parent = db.query(models.Document).filter(models.Document.id == parent_uuid).first()
            db_doc.parent_id = parent.id if parent and not parent.deleted_at else None
        except (ValueError, AttributeError):
            db_doc.parent_id = None
    else:
        db_doc.parent_id = None
    db_doc.original_parent_id = None
    db_doc.deleted_at = None
    db.commit()
    # 如果是文件夹，递归恢复子项
    if db_doc.type == "folder":
        _restore_folder_children(db, db_doc.id)
    else:
        # 恢复时重新索引向量
        _trigger_doc_embedding_index(db, document_id)
    return True


def _restore_folder_children(db: Session, folder_id: uuid.UUID):
    """恢复文件夹的子项"""
    folder_id_str = str(folder_id)
    children = db.query(models.Document).filter(
        models.Document.original_parent_id == folder_id_str,
        models.Document.deleted_at.isnot(None)
    ).all()
    for child in children:
        child.parent_id = folder_id
        child.original_parent_id = None
        child.deleted_at = None
        if child.type == "folder":
            _restore_folder_children(db, child.id)
    db.commit()


def restore_memo(db: Session, memo_id: uuid.UUID):
    """恢复随想笔记"""
    db_memo = db.query(models.Memo).filter(models.Memo.id == memo_id).first()
    if not db_memo or not db_memo.deleted_at:
        return False
    db_memo.deleted_at = None
    db.commit()
    invalidate_memo_tags_cache()
    _trigger_embedding_index("memo", db_memo.id, db_memo.content, db_memo.ai_excluded)
    return True


def permanent_delete_document(db: Session, document_id: uuid.UUID):
    """彻底删除文档"""
    db_doc = db.query(models.Document).filter(models.Document.id == document_id).first()
    if not db_doc:
        return False
    # 删除所有节点
    db.query(models.Node).filter(models.Node.document_id == document_id).delete(synchronize_session=False)
    # 如果是文件夹，递归彻底删除子项
    if db_doc.type == "folder":
        children = db.query(models.Document).filter(
            models.Document.original_parent_id == str(document_id)
        ).all()
        for child in children:
            permanent_delete_document(db, child.id)
    db.delete(db_doc)
    db.commit()
    _delete_embeddings("document", str(document_id))
    return True


def permanent_delete_memo(db: Session, memo_id: uuid.UUID):
    """彻底删除随想笔记"""
    db_memo = db.query(models.Memo).filter(models.Memo.id == memo_id).first()
    if not db_memo:
        return False
    db.delete(db_memo)
    db.commit()
    invalidate_memo_tags_cache()
    _delete_embeddings("memo", str(memo_id))
    return True


def empty_trash(db: Session):
    """清空回收站"""
    # 彻底删除所有回收站文档
    deleted_docs = db.query(models.Document).filter(models.Document.deleted_at.isnot(None)).all()
    for doc in deleted_docs:
        permanent_delete_document(db, doc.id)
    # 彻底删除所有回收站随想
    deleted_memos = db.query(models.Memo).filter(models.Memo.deleted_at.isnot(None)).all()
    for memo in deleted_memos:
        permanent_delete_memo(db, memo.id)
    return True

# Nodes
def get_nodes(db: Session, document_id: uuid.UUID):
    return db.query(models.Node).filter(models.Node.document_id == document_id).order_by(models.Node.sort_order).all()

def get_node(db: Session, node_id: uuid.UUID):
    return db.query(models.Node).filter(models.Node.id == node_id).first()

def _touch_document(db: Session, document_id):
    """更新文档的 updated_at 时间戳"""
    from datetime import datetime
    db.query(models.Document).filter(models.Document.id == document_id).update({"updated_at": datetime.utcnow()})

def create_node(db: Session, node: schemas.NodeCreate):
    node_data = node.model_dump(exclude_unset=True)
    if node_data.get("id") is None:
        node_data.pop("id", None)
    db_node = models.Node(**node_data)
    db.add(db_node)
    _touch_document(db, db_node.document_id)
    db.commit()
    db.refresh(db_node)
    # 触发文档级 embedding 索引
    _trigger_doc_embedding_index(db, db_node.document_id)
    return db_node

def update_node(db: Session, node_id: uuid.UUID, node: schemas.NodeUpdate):
    db_node = db.query(models.Node).filter(models.Node.id == node_id).first()
    if not db_node:
        return None, "not_found"
    # Version conflict check
    expected = node.expected_version
    if expected is not None and expected != db_node.version:
        return db_node, "conflict"
    update_data = node.model_dump(exclude_unset=True, exclude={'expected_version'})
    for key, value in update_data.items():
        setattr(db_node, key, value)
    db_node.version += 1
    _touch_document(db, db_node.document_id)
    db.commit()
    db.refresh(db_node)
    # 内容变化时重新索引文档
    if 'content' in update_data or 'note' in update_data:
        _trigger_doc_embedding_index(db, db_node.document_id)
    return db_node, "ok"

def move_node(db: Session, node_id: uuid.UUID, move: schemas.NodeMove):
    db_node = db.query(models.Node).filter(models.Node.id == node_id).first()
    if not db_node:
        return None
    # We assume the move payload always provides the new parent_id (or None for root)
    # and the new sort_order.
    db_node.parent_node_id = move.parent_node_id
    db_node.sort_order = move.sort_order
    db.commit()
    db.refresh(db_node)
    return db_node

def batch_move_nodes(db: Session, updates: list[schemas.NodeBatchUpdateItem]):
    if not updates:
        return []

    # 一次性查询所有需要更新的节点
    node_ids = []
    id_map = {}
    for update in updates:
        node_id = uuid.UUID(update.id) if isinstance(update.id, str) else update.id
        node_ids.append(node_id)
        id_map[str(node_id)] = update

    existing_nodes = {
        n.id: n for n in db.query(models.Node).filter(models.Node.id.in_(node_ids)).all()
    }

    updated_nodes = []
    for node_id_str, update in id_map.items():
        db_node = existing_nodes.get(uuid.UUID(node_id_str))
        if db_node:
            if update.parent_node_id:
                db_node.parent_node_id = uuid.UUID(update.parent_node_id) if isinstance(update.parent_node_id, str) else update.parent_node_id
            else:
                db_node.parent_node_id = None
            db_node.sort_order = update.sort_order
            updated_nodes.append(db_node)

    db.commit()
    return updated_nodes

def delete_node(db: Session, node_id: uuid.UUID):
    # 获取所属文档 ID（用于清理向量）
    node = db.query(models.Node).filter(models.Node.id == node_id).first()
    doc_id = str(node.document_id) if node else None

    # 使用递归 CTE 一次查询收集所有子孙节点
    from sqlalchemy import text
    cte_query = text("""
        WITH RECURSIVE descendants(id) AS (
            SELECT :root_id
            UNION ALL
            SELECT n.id FROM nodes n INNER JOIN descendants d ON n.parent_node_id = d.id
        )
        SELECT id FROM descendants
    """)
    result = db.execute(cte_query, {"root_id": str(node_id)})
    all_ids = [row[0] for row in result.fetchall()]

    if all_ids:
        db.query(models.Node).filter(models.Node.id.in_(all_ids)).delete(
            synchronize_session=False
        )
    db.commit()

    # 清理该文档的向量数据
    if doc_id:
        _delete_embeddings("document", doc_id)
    return True

def batch_delete_nodes(db: Session, node_ids: list[uuid.UUID]):
    if not node_ids:
        return True

    # 收集涉及的文档 ID（用于清理向量）
    doc_ids = set()
    for nid in node_ids:
        node = db.query(models.Node.document_id).filter(models.Node.id == nid).first()
        if node:
            doc_ids.add(str(node.document_id))

    # 收集所有需要删除的节点 ID（包括子孙节点）
    all_ids = set(node_ids)
    to_process = set(node_ids)

    while to_process:
        children = db.query(models.Node.id).filter(
            models.Node.parent_node_id.in_(to_process)
        ).all()
        child_ids = {c[0] for c in children}
        new_ids = child_ids - all_ids
        all_ids.update(new_ids)
        to_process = new_ids

    db.query(models.Node).filter(models.Node.id.in_(all_ids)).delete(
        synchronize_session=False
    )
    db.commit()

    # 清理相关文档的向量数据
    for doc_id in doc_ids:
        _delete_embeddings("document", doc_id)
    return True

def batch_create_nodes(db: Session, nodes_data: list[schemas.NodeBatchCreateItem]):
    temp_id_to_real_id: dict[str, uuid.UUID] = {}
    created_nodes = []
    
    for node_data in nodes_data:
        node_dict = node_data.model_dump()
        node_dict['document_id'] = uuid.UUID(node_dict['document_id'])
        
        if node_dict.get('parent_node_id'):
            if node_dict['parent_node_id'] in temp_id_to_real_id:
                node_dict['parent_node_id'] = temp_id_to_real_id[node_dict['parent_node_id']]
            else:
                node_dict['parent_node_id'] = uuid.UUID(node_dict['parent_node_id'])
        
        temp_id = node_dict.pop('id', None)
        if temp_id:
            try:
                real_id = uuid.UUID(temp_id) if isinstance(temp_id, str) else temp_id
                node_dict['id'] = real_id
            except ValueError:
                # Non-UUID temp ID (e.g. "temp-1") — don't set, let DB generate
                pass
        
        db_node = models.Node(**node_dict)
        db.add(db_node)
        created_nodes.append(db_node)
        
        if temp_id:
            temp_id_to_real_id[temp_id] = db_node.id
    
    db.commit()
    for node in created_nodes:
        db.refresh(node)
    # 批量创建后索引向量
    doc_ids = {str(node.document_id) for node in created_nodes}
    for doc_id in doc_ids:
        _trigger_doc_embedding_index(db, uuid.UUID(doc_id))
    return created_nodes

def batch_update_nodes(db: Session, updates: list[schemas.NodeBatchUpdateItem]):
    if not updates:
        return []

    node_ids = []
    id_map = {}
    for update in updates:
        node_id = uuid.UUID(update.id) if isinstance(update.id, str) else update.id
        node_ids.append(node_id)
        id_map[str(node_id)] = update

    existing_nodes = {
        n.id: n for n in db.query(models.Node).filter(models.Node.id.in_(node_ids)).all()
    }

    updated_nodes = []
    content_changed_docs = set()
    for node_id_str, update in id_map.items():
        db_node = existing_nodes.get(uuid.UUID(node_id_str))
        if db_node:
            update_data = update.model_dump(exclude_unset=True, exclude={'id'})
            # 检测内容是否变化
            if 'content' in update_data or 'note' in update_data:
                content_changed_docs.add(db_node.document_id)
            for key, value in update_data.items():
                setattr(db_node, key, value)
            updated_nodes.append(db_node)

    db.commit()
    for node in updated_nodes:
        db.refresh(node)
    # 内容变化时重新索引
    for doc_id in content_changed_docs:
        _trigger_doc_embedding_index(db, doc_id)
    return updated_nodes

def batch_update_node_properties(db: Session, updates: list[schemas.NodeBatchPropertyUpdateItem]):
    # Pre-fetch all nodes in a single query
    node_ids = [uuid.UUID(u.id) if isinstance(u.id, str) else u.id for u in updates]
    nodes_map = {n.id: n for n in db.query(models.Node).filter(models.Node.id.in_(node_ids)).all()}

    updated_nodes = []
    for update in updates:
        node_id = uuid.UUID(update.id) if isinstance(update.id, str) else update.id
        db_node = nodes_map.get(node_id)
        if db_node:
            update_data = update.model_dump(exclude_unset=True, exclude={'id'})
            for key, value in update_data.items():
                setattr(db_node, key, value)
            updated_nodes.append(db_node)
    db.commit()
    for node in updated_nodes:
        db.refresh(node)
    return updated_nodes

def batch_save_operations(db: Session, operations: list[schemas.BatchSaveOperation]):
    # Pre-fetch all referenced nodes in a single query
    node_id_set = set()
    for operation in operations:
        data = operation.data
        op_type = operation.type
        if op_type in ['updateContent', 'undoUpdateContent', 'updateNote', 'undoUpdateNote',
                        'toggleProperty', 'undoToggleProperty', 'moveNode', 'undoMoveNode']:
            nid = data.get('id')
            if nid:
                node_id_set.add(uuid.UUID(nid) if isinstance(nid, str) else nid)
        elif op_type == 'deleteNode':
            nid = data.get('nodeId')
            if nid:
                node_id_set.add(uuid.UUID(nid) if isinstance(nid, str) else nid)

    nodes_map = {}
    if node_id_set:
        nodes_map = {n.id: n for n in db.query(models.Node).filter(models.Node.id.in_(list(node_id_set))).all()}

    results = []
    touched_doc_ids = set()  # 跟踪受影响的文档 ID
    content_changed_doc_ids = set()  # 跟踪内容变化的文档 ID（用于向量索引）
    for operation in operations:
        try:
            op_type = operation.type
            data = operation.data

            if op_type in ['updateContent', 'undoUpdateContent']:
                node_id = uuid.UUID(data.get('id')) if data.get('id') else None
                if node_id:
                    db_node = nodes_map.get(node_id)
                    if db_node:
                        new_content = data.get('newContent')
                        if new_content is not None:
                            db_node.content = new_content
                            touched_doc_ids.add(db_node.document_id)
                            content_changed_doc_ids.add(db_node.document_id)
                            results.append({'id': operation.id, 'status': 'success'})
                        else:
                            results.append({'id': operation.id, 'status': 'skipped', 'reason': 'no newContent'})
                    else:
                        results.append({'id': operation.id, 'status': 'failed', 'reason': 'node not found'})
                else:
                    results.append({'id': operation.id, 'status': 'failed', 'reason': 'invalid node id'})

            elif op_type in ['updateNote', 'undoUpdateNote']:
                node_id = uuid.UUID(data.get('id')) if data.get('id') else None
                if node_id:
                    db_node = nodes_map.get(node_id)
                    if db_node:
                        new_note = data.get('newNote')
                        if new_note is not None:
                            db_node.note = new_note
                            touched_doc_ids.add(db_node.document_id)
                            content_changed_doc_ids.add(db_node.document_id)
                            results.append({'id': operation.id, 'status': 'success'})
                        else:
                            results.append({'id': operation.id, 'status': 'skipped', 'reason': 'no newNote'})
                    else:
                        results.append({'id': operation.id, 'status': 'failed', 'reason': 'node not found'})
                else:
                    results.append({'id': operation.id, 'status': 'failed', 'reason': 'invalid node id'})

            elif op_type in ['toggleProperty', 'undoToggleProperty']:
                node_id = uuid.UUID(data.get('id')) if data.get('id') else None
                if node_id:
                    db_node = nodes_map.get(node_id)
                    if db_node:
                        property_name = data.get('property')
                        new_value = data.get('newValue')
                        if property_name and new_value is not None:
                            setattr(db_node, property_name, new_value)
                            touched_doc_ids.add(db_node.document_id)
                            results.append({'id': operation.id, 'status': 'success'})
                        else:
                            results.append({'id': operation.id, 'status': 'skipped', 'reason': 'missing property or value'})
                    else:
                        results.append({'id': operation.id, 'status': 'failed', 'reason': 'node not found'})
                else:
                    results.append({'id': operation.id, 'status': 'failed', 'reason': 'invalid node id'})

            elif op_type in ['moveNode', 'undoMoveNode']:
                node_id = uuid.UUID(data.get('id')) if data.get('id') else None
                if node_id:
                    db_node = nodes_map.get(node_id)
                    if db_node:
                        new_parent = data.get('newParent')
                        new_order = data.get('newOrder')
                        if new_order is not None:
                            db_node.parent_node_id = uuid.UUID(new_parent) if new_parent else None
                            db_node.sort_order = new_order
                            touched_doc_ids.add(db_node.document_id)
                            results.append({'id': operation.id, 'status': 'success'})
                        else:
                            results.append({'id': operation.id, 'status': 'skipped', 'reason': 'missing newOrder'})
                    else:
                        results.append({'id': operation.id, 'status': 'failed', 'reason': 'node not found'})
                else:
                    results.append({'id': operation.id, 'status': 'failed', 'reason': 'invalid node id'})

            elif op_type == 'createNode':
                node_data = data.get('nodeData', {})
                document_id = node_data.get('document_id')
                if document_id:
                    node_dict = {
                        'document_id': uuid.UUID(document_id),
                        'content': node_data.get('content', ''),
                        'parent_node_id': uuid.UUID(node_data.get('parent_node_id')) if node_data.get('parent_node_id') else None,
                        'sort_order': node_data.get('sort_order', 0),
                        'note': node_data.get('note', ''),
                        'is_completed': node_data.get('is_completed', False),
                        'is_collapsed': node_data.get('is_collapsed', False),
                        'is_todo': node_data.get('is_todo', False),
                    }
                    node_id = data.get('nodeId')
                    if node_id:
                        node_dict['id'] = uuid.UUID(node_id)

                    db_node = models.Node(**node_dict)
                    db.add(db_node)
                    touched_doc_ids.add(db_node.document_id)
                    results.append({'id': operation.id, 'status': 'success'})
                else:
                    results.append({'id': operation.id, 'status': 'failed', 'reason': 'missing document_id'})

            elif op_type == 'deleteNode':
                node_id = data.get('nodeId')
                if node_id:
                    delete_node(db, uuid.UUID(node_id))
                    results.append({'id': operation.id, 'status': 'success'})
                else:
                    results.append({'id': operation.id, 'status': 'failed', 'reason': 'missing nodeId'})

            else:
                results.append({'id': operation.id, 'status': 'skipped', 'reason': f'unknown operation type: {op_type}'})

        except Exception as e:
            results.append({'id': operation.id, 'status': 'error', 'reason': str(e)})

    # 更新受影响文档的 updated_at
    for doc_id in touched_doc_ids:
        _touch_document(db, doc_id)

    # 内容变化时重新索引向量
    for doc_id in content_changed_doc_ids:
        _trigger_doc_embedding_index(db, doc_id)

    try:
        db.commit()
    except Exception as e:
        db.rollback()
        return {'success': False, 'error': str(e), 'results': results}

    return {'success': True, 'results': results}

# Share
import secrets

def create_share(db: Session, document_id: uuid.UUID):
    existing = db.query(models.Share).filter(models.Share.document_id == document_id).first()
    if existing:
        return existing
    token = secrets.token_urlsafe(24)[:32]
    db_share = models.Share(document_id=document_id, token=token)
    db.add(db_share)
    db.commit()
    db.refresh(db_share)
    return db_share

def get_share_by_doc(db: Session, document_id: uuid.UUID):
    return db.query(models.Share).filter(models.Share.document_id == document_id).first()

def get_share_by_token(db: Session, token: str):
    return db.query(models.Share).filter(models.Share.token == token).first()

def delete_share(db: Session, token: str):
    share = db.query(models.Share).filter(models.Share.token == token).first()
    if share:
        db.delete(share)
        db.commit()
    return share

# Diary
from datetime import datetime, date
from collections import defaultdict

WEEKDAYS = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日']

# Date node content pattern: "2026年5月26日 星期一"
DATE_NODE_PATTERN = re.compile(r"^\d{4}年\d{1,2}月\d{1,2}日\s+星期[一二三四五六日]$")

def get_diary_months(db: Session):
    """Return all diary months grouped by year."""
    docs = db.query(models.Document.diary_date).filter(
        models.Document.diary_date.isnot(None)
    ).all()
    year_months = defaultdict(set)
    for d in docs:
        if d.diary_date and len(d.diary_date) == 7:  # "YYYY-MM"
            try:
                y, m = d.diary_date.split('-')
                year_months[int(y)].add(int(m))
            except (ValueError, IndexError):
                pass
    items = []
    for y in sorted(year_months.keys(), reverse=True):
        items.append({"year": y, "months": sorted(year_months[y])})
    return items

def get_or_create_monthly_diary_doc(db: Session, year: int, month: int):
    """Get or create a monthly diary document without loading nodes."""
    date_str = f"{year:04d}-{month:02d}"
    doc = db.query(models.Document).filter(models.Document.diary_date == date_str).first()
    is_new = False
    if not doc:
        title = f"{year}年{month}月"
        doc = models.Document(title=title, type="document", diary_date=date_str, sort_order=0)
        db.add(doc)
        db.commit()
        db.refresh(doc)
        is_new = True
    return doc, is_new

def get_or_create_monthly_diary(db: Session, year: int, month: int):
    """Get or create a monthly diary document with all nodes."""
    doc, is_new = get_or_create_monthly_diary_doc(db, year, month)
    nodes = db.query(models.Node).filter(models.Node.document_id == doc.id).order_by(models.Node.sort_order).all()
    return doc, nodes, is_new

def get_or_create_day_node(db: Session, doc_id, year: int, month: int, day: int):
    """Find or create a date node (e.g. '2026年5月26日 星期一') in the monthly doc."""
    dt = date(year, month, day)
    weekday = WEEKDAYS[dt.weekday()]
    date_content = f"{year}年{month}月{day}日 {weekday}"

    # Find existing date node
    node = db.query(models.Node).filter(
        models.Node.document_id == doc_id,
        models.Node.parent_node_id.is_(None),  # top-level only
        models.Node.content == date_content
    ).first()

    is_new = False
    child_node = None
    if not node:
        # Use day number as sort_order so nodes are sorted chronologically
        node = models.Node(
            document_id=doc_id,
            content=date_content,
            heading="h1",
            sort_order=float(day)
        )
        db.add(node)
        db.flush()  # flush to get node.id without committing
        is_new = True

        # Create an empty todo child node under the date node
        child_node = models.Node(
            document_id=doc_id,
            content="",
            parent_node_id=node.id,
            sort_order=0,
            is_todo=True
        )
        db.add(child_node)
        db.commit()
        db.refresh(node)
        db.refresh(child_node)

    return node, is_new, child_node

def get_diary_day_dates(db: Session, doc_id):
    """Return list of day numbers that have date nodes in the monthly doc."""
    # Use SQL LIKE to filter at DB level instead of loading all nodes
    nodes = db.query(models.Node.content).filter(
        models.Node.document_id == doc_id,
        models.Node.parent_node_id.is_(None),
        models.Node.content.like('%年%月%日 星期%')
    ).all()
    days = []
    for n in nodes:
        try:
            parts = n.content.split('日')[0]
            day_str = parts.split('月')[1]
            days.append(int(day_str))
        except (IndexError, ValueError):
            pass
    return sorted(days)

def get_diary_summary(db: Session):
    """Return pending tasks (with parent node content and diary_date) and top tags from all diary documents."""
    # Pending tasks: join with Document to get diary_date, with parent node content
    tasks_query = db.query(
        models.Node,
        models.Document.diary_date
    ).join(
        models.Document, models.Node.document_id == models.Document.id
    ).filter(
        models.Document.diary_date.isnot(None),
        models.Node.is_todo == True,
        models.Node.is_completed == False
    ).all()

    if not tasks_query:
        return [], []

    # Get all diary document IDs for tag extraction
    doc_ids = list(set(t.Node.document_id for t in tasks_query))

    # Batch fetch parent nodes to get their content (the day label)
    parent_ids = list(set(t.Node.parent_node_id for t in tasks_query if t.Node.parent_node_id))
    parent_map = {}
    if parent_ids:
        parents = db.query(models.Node.id, models.Node.content).filter(
            models.Node.id.in_(parent_ids)
        ).all()
        parent_map = {p.id: p.content for p in parents}

    # Build result with parent_content and diary_date
    tasks = []
    for t in tasks_query:
        task_dict = schemas.Node.model_validate(t.Node).model_dump()
        task_dict['parent_content'] = parent_map.get(t.Node.parent_node_id)
        task_dict['diary_date'] = t.diary_date
        tasks.append(task_dict)

    # Tags: scan content and note of all nodes
    all_nodes = db.query(models.Node.content, models.Node.note).filter(
        models.Node.document_id.in_(doc_ids)
    ).all()

    import re
    tag_count = {}
    tag_pattern = re.compile(r'#[a-zA-Z0-9_一-龥]+')
    for content, note in all_nodes:
        if content:
            for tag in tag_pattern.findall(content):
                tag_count[tag] = tag_count.get(tag, 0) + 1
        if note:
            for tag in tag_pattern.findall(note):
                tag_count[tag] = tag_count.get(tag, 0) + 1

    sorted_tags = sorted(tag_count.items(), key=lambda x: -x[1])[:20]
    return tasks, [tag for tag, _ in sorted_tags]


def _trigger_embedding_index(source_type: str, source_id: str, content: str, ai_excluded: bool = False):
    """异步触发 embedding 索引（非阻塞）"""
    if ai_excluded:
        # 标记为不参与 AI 时，删除已有的向量数据
        _delete_embeddings(source_type, str(source_id))
        return
    if not content or len(content.strip()) < 50:
        return
    try:
        import asyncio
        from .vector_search import index_note, get_embedding_config
        from .database import SessionLocal

        async def _do_index():
            db = SessionLocal()
            try:
                config = get_embedding_config(db)
                if config:
                    await index_note(db, source_type, str(source_id), content, config)
            finally:
                db.close()

        # 在后台执行，不阻塞当前请求
        loop = asyncio.get_event_loop()
        loop.create_task(_do_index())
    except Exception as e:
        logger.warning(f"触发 embedding 索引失败: {e}")


def _delete_embeddings(source_type: str, source_id: str):
    """删除指定笔记的所有向量数据"""
    try:
        from sqlalchemy import text
        from .database import SessionLocal
        db = SessionLocal()
        try:
            db.execute(
                text("DELETE FROM note_embeddings WHERE source_type = :st AND source_id = :sid"),
                {"st": source_type, "sid": source_id}
            )
            db.commit()
            logger.info(f"已删除 {source_type}/{source_id} 的向量数据")
        finally:
            db.close()
    except Exception as e:
        logger.warning(f"删除向量数据失败: {e}")


# Debounce map: document_id -> last trigger timestamp
_doc_index_debounce: dict[str, float] = {}
DOC_INDEX_DEBOUNCE_SECONDS = 5  # Minimum seconds between re-indexing same document

def _trigger_doc_embedding_index(db: Session, document_id):
    """异步触发文档级 embedding 索引（带防抖）"""
    import time
    doc_id_str = str(document_id)

    # Debounce: skip if indexed recently
    now = time.time()
    last_trigger = _doc_index_debounce.get(doc_id_str, 0)
    if now - last_trigger < DOC_INDEX_DEBOUNCE_SECONDS:
        return

    try:
        doc = db.query(models.Document).filter(models.Document.id == document_id).first()
        if not doc or doc.ai_excluded:
            return
        # 收集文档下所有节点的内容
        nodes = db.query(models.Node).filter(models.Node.document_id == document_id).all()
        content_parts = []
        for node in nodes:
            if node.content:
                content_parts.append(node.content)
            if node.note:
                content_parts.append(node.note)
        full_content = "\n\n".join(content_parts)
        if full_content and len(full_content.strip()) >= 50:
            _doc_index_debounce[doc_id_str] = now
            _trigger_embedding_index("document", document_id, full_content)
    except Exception as e:
        logger.warning(f"触发文档 embedding 索引失败: {e}")


# Memos
def create_memo(db: Session, memo: schemas.MemoCreate):
    db_memo = models.Memo(content=memo.content, ai_excluded=memo.ai_excluded)
    db.add(db_memo)
    db.commit()
    db.refresh(db_memo)
    invalidate_memo_tags_cache()
    _trigger_embedding_index("memo", db_memo.id, db_memo.content, db_memo.ai_excluded)
    return db_memo

def get_memos(db: Session, page: int = 1, page_size: int = 20, archived: bool = False, public: bool = False, tag: str = None, search: str = None):
    offset = (page - 1) * page_size
    if public:
        query = db.query(models.Memo).filter(models.Memo.is_public == True, models.Memo.is_archived == False, models.Memo.deleted_at.is_(None))
    else:
        query = db.query(models.Memo).filter(models.Memo.is_archived == archived, models.Memo.deleted_at.is_(None))
    if tag:
        query = query.filter(models.Memo.content.contains(tag))
    if search:
        query = query.filter(models.Memo.content.like(f"%{search}%"))
    total = query.count()
    memos = query.order_by(models.Memo.is_pinned.desc(), models.Memo.created_at.desc()).offset(offset).limit(page_size).all()
    return memos, total

def get_memo(db: Session, memo_id: uuid.UUID):
    return db.query(models.Memo).filter(models.Memo.id == memo_id).first()

def update_memo(db: Session, memo_id: uuid.UUID, memo: schemas.MemoUpdate):
    db_memo = db.query(models.Memo).filter(models.Memo.id == memo_id).first()
    if not db_memo:
        return None
    update_data = memo.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_memo, key, value)
    db.commit()
    db.refresh(db_memo)
    invalidate_memo_tags_cache()
    # 内容变化或 ai_excluded 变化时重新索引
    if 'content' in update_data or 'ai_excluded' in update_data:
        _trigger_embedding_index("memo", db_memo.id, db_memo.content, db_memo.ai_excluded)
    return db_memo

def delete_memo(db: Session, memo_id: uuid.UUID):
    """软删除：移到回收站"""
    db_memo = db.query(models.Memo).filter(models.Memo.id == memo_id).first()
    if db_memo:
        db_memo.deleted_at = datetime.utcnow()
        db.commit()
        invalidate_memo_tags_cache()
        _delete_embeddings("memo", str(memo_id))
        return True
    return False

def get_memo_heatmap(db: Session, year: int, month: int):
    start = datetime(year, month, 1)
    if month == 12:
        end = datetime(year + 1, 1, 1)
    else:
        end = datetime(year, month + 1, 1)
    rows = db.query(
        func.strftime('%d', models.Memo.created_at).label('day'),
        func.count().label('cnt')
    ).filter(
        models.Memo.created_at >= start,
        models.Memo.created_at < end,
        models.Memo.is_archived == False,
        models.Memo.deleted_at.is_(None)
    ).group_by('day').all()
    return {int(day): count for day, count in rows}

_memo_tags_cache: tuple[float, list[str]] | None = None
_MEMO_TAGS_CACHE_TTL = 60  # 1 minute

def invalidate_memo_tags_cache():
    global _memo_tags_cache
    _memo_tags_cache = None

def get_memo_tags(db: Session):
    global _memo_tags_cache
    now = time.time()
    if _memo_tags_cache and (now - _memo_tags_cache[0]) < _MEMO_TAGS_CACHE_TTL:
        return _memo_tags_cache[1]

    # 使用分页查询避免一次性加载所有内容到内存
    tag_count = {}
    tag_pattern = re.compile(r'#[a-zA-Z0-9_一-龥]+')
    code_block_pattern = re.compile(r'```[\s\S]*?```', re.MULTILINE)
    inline_code_pattern = re.compile(r'`[^`]+`')

    page_size = 500
    offset = 0
    while True:
        batch = db.query(models.Memo.content).filter(
            models.Memo.is_archived == False,
            models.Memo.deleted_at.is_(None)
        ).offset(offset).limit(page_size).all()
        if not batch:
            break
        for (content,) in batch:
            if content:
                cleaned = code_block_pattern.sub('', content)
                cleaned = inline_code_pattern.sub('', cleaned)
                for tag in tag_pattern.findall(cleaned):
                    tag_count[tag] = tag_count.get(tag, 0) + 1
        offset += page_size

    sorted_tags = sorted(tag_count.items(), key=lambda x: -x[1])[:100]
    result = [tag for tag, _ in sorted_tags]
    _memo_tags_cache = (now, result)
    return result

# Search
def _build_word_boundary_pattern(query: str) -> re.Pattern:
    """为搜索词构建正则：英文用词边界匹配，中文用包含匹配"""
    tokens = query.strip().split()
    if not tokens:
        tokens = [query.strip()]
    pattern_parts = []
    for token in tokens:
        if re.search(r'[a-zA-Z0-9]', token):
            # 英文/数字：词边界匹配，忽略大小写
            pattern_parts.append(r'(?<![a-zA-Z0-9])' + re.escape(token) + r'(?![a-zA-Z0-9])')
        else:
            # 中文：直接包含
            pattern_parts.append(re.escape(token))
    combined = '|'.join(pattern_parts) if len(pattern_parts) > 1 else pattern_parts[0]
    return re.compile(combined, re.IGNORECASE)

def _text_matches(text: str, pattern: re.Pattern) -> bool:
    if not text:
        return False
    return bool(pattern.search(text))

def _extract_snippet(text: str, pattern: re.Pattern, context_chars: int = 60) -> str:
    if not text:
        return ""
    m = pattern.search(text)
    if not m:
        return text[:120]
    start = max(0, m.start() - context_chars)
    end = min(len(text), m.end() + context_chars)
    snippet = text[start:end]
    if start > 0:
        snippet = "..." + snippet
    if end < len(text):
        snippet = snippet + "..."
    return snippet

def unified_search(db: Session, query: str, limit: int = 50) -> list:
    pattern = _build_word_boundary_pattern(query)
    # LIKE 粗筛用原始 query
    search_pattern = f"%{query}%"
    results = []

    # 1. Document title matches (non-diary)
    title_matches = db.query(models.Document).filter(
        models.Document.title.like(search_pattern),
        models.Document.diary_date.is_(None),
        (models.Document.type == 'document') | (models.Document.type == 'note')
    ).limit(30).all()
    for doc in title_matches:
        if _text_matches(doc.title, pattern):
            results.append({
                "result_type": "document_title",
                "entity_id": doc.id,
                "title": doc.title,
                "snippet": _extract_snippet(doc.title, pattern),
                "parent_id": doc.parent_id,
            })

    # 2. Node content/note matches in regular documents
    node_matches_doc = (
        db.query(models.Node, models.Document)
        .join(models.Document, models.Node.document_id == models.Document.id)
        .filter(
            models.Document.diary_date.is_(None),
            (models.Document.type == 'document') | (models.Document.type == 'note'),
            (models.Node.content.like(search_pattern) |
             models.Node.note.like(search_pattern))
        )
        .limit(50).all()
    )
    for node, doc in node_matches_doc:
        content_match = _text_matches(node.content, pattern)
        note_match = _text_matches(node.note, pattern)
        if content_match or note_match:
            match_text = node.content if content_match else (node.note or "")
            results.append({
                "result_type": "document",
                "entity_id": doc.id,
                "title": doc.title,
                "snippet": _extract_snippet(match_text, pattern),
                "node_id": node.id,
                "parent_id": doc.parent_id,
            })

    # 3. Node content/note matches in diary documents
    node_matches_diary = (
        db.query(models.Node, models.Document)
        .join(models.Document, models.Node.document_id == models.Document.id)
        .filter(
            models.Document.diary_date.isnot(None),
            (models.Node.content.like(search_pattern) |
             models.Node.note.like(search_pattern))
        )
        .limit(50).all()
    )
    for node, doc in node_matches_diary:
        content_match = _text_matches(node.content, pattern)
        note_match = _text_matches(node.note, pattern)
        if content_match or note_match:
            match_text = node.content if content_match else (node.note or "")
            results.append({
                "result_type": "diary",
                "entity_id": doc.id,
                "title": doc.title,
                "snippet": _extract_snippet(match_text, pattern),
                "node_id": node.id,
                "diary_date": doc.diary_date,
            })

    # 4. Memo content matches
    memo_matches = db.query(models.Memo).filter(
        models.Memo.content.like(search_pattern),
        models.Memo.is_archived == False,
        models.Memo.deleted_at.is_(None)
    ).limit(30).all()
    for memo in memo_matches:
        if _text_matches(memo.content, pattern):
            results.append({
                "result_type": "memo",
                "entity_id": memo.id,
                "title": (memo.content[:50] if memo.content else ""),
                "snippet": _extract_snippet(memo.content, pattern),
                "created_at": memo.created_at,
            })

    return results[:limit]


# ==================== Excalidraw Data ====================

from . import excalidraw_storage as ex_storage


def get_excalidraw_data(db: Session, document_id: uuid.UUID) -> Optional[models.ExcalidrawData]:
    """
    获取画布数据（从文件系统读取场景数据，不含图片二进制）。
    图片通过独立 API 端点按需加载。
    """
    excalidraw = db.query(models.ExcalidrawData).filter(
        models.ExcalidrawData.document_id == str(document_id)
    ).first()
    if not excalidraw:
        return None
    doc_id = str(document_id)
    scene = ex_storage.read_scene(doc_id)
    if scene is not None:
        # 场景文件存在 — 返回不含 files 的数据
        excalidraw.version = scene.pop('_version', 0)
        # 兼容：如果场景中仍有 files 字段（旧数据），提取并迁移
        old_files = scene.pop('files', None)
        if old_files:
            meta = {}
            for file_id, file_info in old_files.items():
                if isinstance(file_info, dict):
                    data_url = file_info.get('dataURL') or file_info.get('dataUrl')
                    if data_url:
                        try:
                            file_meta = ex_storage.write_image_file(doc_id, file_id, data_url)
                            meta[file_id] = file_meta
                        except Exception as e:
                            logger.warning(f"迁移图片失败: {doc_id}/{file_id}, {e}")
            if meta:
                ex_storage.write_files_meta(doc_id, meta)
                ex_storage.write_scene(doc_id, scene)  # 保存不含 files 的场景
        # 兼容：旧的 _files.json 格式
        ex_storage.migrate_files_from_json(doc_id)
        excalidraw.scene_data = json.dumps(scene, ensure_ascii=False)
    else:
        # 场景文件不存在 — 检查 SQLite 中是否有老数据
        if excalidraw.scene_data and excalidraw.scene_data != '{"elements":[]}':
            try:
                old_scene = json.loads(excalidraw.scene_data)
                old_files = old_scene.pop("files", None)
                ex_storage.write_scene(doc_id, old_scene)
                if old_files:
                    meta = {}
                    for file_id, file_info in old_files.items():
                        if isinstance(file_info, dict):
                            data_url = file_info.get('dataURL') or file_info.get('dataUrl')
                            if data_url:
                                try:
                                    file_meta = ex_storage.write_image_file(doc_id, file_id, data_url)
                                    meta[file_id] = file_meta
                                except Exception as e:
                                    logger.warning(f"迁移图片失败: {doc_id}/{file_id}, {e}")
                    if meta:
                        ex_storage.write_files_meta(doc_id, meta)
                excalidraw.version = 0
                excalidraw.scene_data = json.dumps(old_scene, ensure_ascii=False)
            except (json.JSONDecodeError, Exception):
                excalidraw.scene_data = '{"elements":[]}'
                excalidraw.version = 0
        else:
            excalidraw.scene_data = '{"elements":[]}'
            excalidraw.version = 0
    return excalidraw


def create_excalidraw_data(
    db: Session,
    data: schemas.ExcalidrawDataCreate
) -> models.ExcalidrawData:
    """创建画布数据（写入文件系统 + SQLite 元数据）"""
    doc_id = str(data.document_id)
    # 写入文件系统（初始版本 0）
    ex_storage.write_scene(doc_id, {"elements": []})
    # SQLite 只存元数据
    excalidraw = models.ExcalidrawData(
        id=str(uuid.uuid4()),
        document_id=doc_id,
        scene_data=None
    )
    db.add(excalidraw)
    db.commit()
    db.refresh(excalidraw)
    return excalidraw


def update_excalidraw_data(
    db: Session,
    document_id: uuid.UUID,
    data: schemas.ExcalidrawDataUpdate
) -> tuple[Optional[models.ExcalidrawData], Optional[int]]:
    """
    更新画布数据（带版本控制）。

    Returns:
        (excalidraw_data, None) — 成功
        (None, None) — 文档不存在
        (None, current_version) — 版本冲突
    """
    doc_id = str(document_id)
    excalidraw = db.query(models.ExcalidrawData).filter(
        models.ExcalidrawData.document_id == doc_id
    ).first()

    if not excalidraw:
        return None, None

    # 解析前端发来的 JSON，分离 elements/appState 和 files
    try:
        scene_obj = json.loads(data.scene_data)
    except (json.JSONDecodeError, TypeError):
        scene_obj = {"elements": []}

    files = scene_obj.pop("files", None)

    # 写入场景文件（带版本检查）
    success, current_version = ex_storage.write_scene(
        doc_id, scene_obj, expected_version=data.version
    )
    if not success:
        return None, current_version  # 版本冲突

    # 写入图片文件（二进制文件，仅在有新图片时写入）
    if files and isinstance(files, dict):
        existing_meta = ex_storage.read_files_meta(doc_id)
        new_meta = {}
        for file_id, file_info in files.items():
            if not isinstance(file_info, dict):
                continue
            # 兼容大小写：Excalidraw 用 dataURL，旧数据用 dataUrl
            data_url = file_info.get('dataURL') or file_info.get('dataUrl')
            if not data_url:
                continue
            # 跳过已存在的图片
            if file_id in existing_meta:
                new_meta[file_id] = existing_meta[file_id]
                continue
            try:
                file_meta = ex_storage.write_image_file(doc_id, file_id, data_url)
                new_meta[file_id] = file_meta
            except Exception as e:
                logger.warning(f"保存图片失败: {doc_id}/{file_id}, {e}")
        # 合并并更新元数据
        if new_meta:
            merged = {**existing_meta, **new_meta}
            ex_storage.write_files_meta(doc_id, merged)

    # 更新 SQLite 元数据
    excalidraw.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(excalidraw)
    return excalidraw, None


def delete_excalidraw_data(db: Session, document_id: uuid.UUID) -> bool:
    """删除画布数据（先删 SQLite 记录，再删文件系统，避免 commit 失败导致数据丢失）"""
    doc_id = str(document_id)
    excalidraw = db.query(models.ExcalidrawData).filter(
        models.ExcalidrawData.document_id == doc_id
    ).first()

    if not excalidraw:
        return False

    # 先删 SQLite 记录（如果 commit 失败，文件系统数据不受影响）
    db.delete(excalidraw)
    db.commit()
    # 再删文件系统（即使失败，也只是残留孤儿文件，不会丢数据）
    ex_storage.delete_all(doc_id)
    return True

# Todos
def create_todo(db: Session, todo: schemas.TodoCreate):
    db_todo = models.Todo(content=todo.content, sort_order=todo.sort_order)
    db.add(db_todo)
    db.commit()
    db.refresh(db_todo)
    return db_todo

def get_todos(db: Session, completed: bool = False):
    query = db.query(models.Todo).filter(models.Todo.is_completed == completed)
    todos = query.order_by(models.Todo.sort_order, models.Todo.created_at.desc()).all()
    return todos

def update_todo(db: Session, todo_id: uuid.UUID, data: schemas.TodoUpdate):
    todo = db.query(models.Todo).filter(models.Todo.id == todo_id).first()
    if not todo:
        return None
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(todo, key, value)
    db.commit()
    db.refresh(todo)
    return todo

def delete_todo(db: Session, todo_id: uuid.UUID) -> bool:
    todo = db.query(models.Todo).filter(models.Todo.id == todo_id).first()
    if not todo:
        return False
    db.delete(todo)
    db.commit()
    return True

# ── Habit CRUD ──

from datetime import date, timedelta

def get_week_range(offset: int = 0):
    """返回指定偏移周的周一和周日日期 (YYYY-MM-DD)"""
    today = date.today()
    monday = today - timedelta(days=today.weekday()) + timedelta(weeks=offset)
    sunday = monday + timedelta(days=6)
    return monday.isoformat(), sunday.isoformat()

def get_habits(db: Session, week_offset: int = 0):
    """获取所有习惯及其本周打卡记录"""
    habits = db.query(models.Habit).filter(models.Habit.is_archived == False).order_by(models.Habit.sort_order, models.Habit.created_at).all()
    week_start, week_end = get_week_range(week_offset)
    result = []
    for h in habits:
        records = db.query(models.HabitRecord).filter(
            models.HabitRecord.habit_id == h.id,
            models.HabitRecord.record_date >= week_start,
            models.HabitRecord.record_date <= week_end
        ).all()
        result.append({
            "id": h.id,
            "name": h.name,
            "icon": h.icon,
            "sort_order": h.sort_order,
            "is_archived": h.is_archived,
            "created_at": h.created_at,
            "week_records": [r.record_date for r in records]
        })
    return result

def create_habit(db: Session, data: schemas.HabitCreate):
    habit = models.Habit(name=data.name, icon=data.icon, sort_order=data.sort_order)
    db.add(habit)
    db.commit()
    db.refresh(habit)
    return habit

def update_habit(db: Session, habit_id: uuid.UUID, data: schemas.HabitUpdate):
    habit = db.query(models.Habit).filter(models.Habit.id == habit_id).first()
    if not habit:
        return None
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(habit, key, value)
    db.commit()
    db.refresh(habit)
    return habit

def delete_habit(db: Session, habit_id: uuid.UUID) -> bool:
    habit = db.query(models.Habit).filter(models.Habit.id == habit_id).first()
    if not habit:
        return False
    db.delete(habit)
    db.commit()
    return True

def toggle_habit_record(db: Session, habit_id: uuid.UUID, record_date: str):
    """切换某天的打卡状态：已打卡则取消，未打卡则创建"""
    existing = db.query(models.HabitRecord).filter(
        models.HabitRecord.habit_id == habit_id,
        models.HabitRecord.record_date == record_date
    ).first()
    if existing:
        db.delete(existing)
        db.commit()
        return False  # 取消打卡
    else:
        record = models.HabitRecord(habit_id=habit_id, record_date=record_date)
        db.add(record)
        db.commit()
        return True  # 新增打卡

# ── API Token CRUD ──

import hashlib
import secrets

def _hash_token(token_str: str) -> str:
    return hashlib.sha256(token_str.encode()).hexdigest()

def create_api_token(db: Session, user_id: uuid.UUID, name: str = "API Token"):
    raw_token = secrets.token_urlsafe(32)
    token_hash = _hash_token(raw_token)
    db_token = models.ApiToken(
        user_id=user_id,
        name=name,
        token_hash=token_hash,
    )
    db.add(db_token)
    db.commit()
    db.refresh(db_token)
    return db_token, raw_token

def get_api_tokens(db: Session, user_id: uuid.UUID):
    return db.query(models.ApiToken).filter(
        models.ApiToken.user_id == user_id
    ).order_by(models.ApiToken.created_at.desc()).all()


# ==================== AI Conversations ====================

def create_conversation(db: Session, title: str | None = None) -> models.AIConversation:
    conv = models.AIConversation(title=title)
    db.add(conv)
    db.commit()
    db.refresh(conv)
    return conv

def get_conversations(db: Session) -> list[models.AIConversation]:
    return db.query(models.AIConversation).order_by(models.AIConversation.updated_at.desc()).all()

def get_conversation(db: Session, conv_id: uuid.UUID) -> models.AIConversation | None:
    return db.query(models.AIConversation).filter(models.AIConversation.id == conv_id).first()

def update_conversation(db: Session, conv_id: uuid.UUID, title: str) -> models.AIConversation | None:
    conv = db.query(models.AIConversation).filter(models.AIConversation.id == conv_id).first()
    if not conv:
        return None
    conv.title = title
    conv.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(conv)
    return conv

def delete_conversation(db: Session, conv_id: uuid.UUID) -> bool:
    conv = db.query(models.AIConversation).filter(models.AIConversation.id == conv_id).first()
    if not conv:
        return False
    db.delete(conv)
    db.commit()
    return True

def add_message(db: Session, conversation_id: uuid.UUID, role: str, content: str, sources: str | None = None) -> models.AIMessage:
    msg = models.AIMessage(
        conversation_id=conversation_id,
        role=role,
        content=content,
        sources=sources,
    )
    db.add(msg)
    # 更新会话的 updated_at
    conv = db.query(models.AIConversation).filter(models.AIConversation.id == conversation_id).first()
    if conv:
        conv.updated_at = datetime.utcnow()
        # 自动设置标题（取第一条用户消息的前30字）
        if not conv.title and role == 'user':
            conv.title = content[:30] + ('...' if len(content) > 30 else '')
    db.commit()
    db.refresh(msg)
    return msg

def get_messages(db: Session, conversation_id: uuid.UUID) -> list[models.AIMessage]:
    return db.query(models.AIMessage).filter(
        models.AIMessage.conversation_id == conversation_id
    ).order_by(models.AIMessage.created_at.asc()).all()

def delete_api_token(db: Session, token_id: uuid.UUID, user_id: uuid.UUID) -> bool:
    token = db.query(models.ApiToken).filter(
        models.ApiToken.id == token_id,
        models.ApiToken.user_id == user_id,
    ).first()
    if not token:
        return False
    db.delete(token)
    db.commit()
    return True

def verify_api_token(db: Session, token_str: str):
    token_hash = _hash_token(token_str)
    db_token = db.query(models.ApiToken).filter(
        models.ApiToken.token_hash == token_hash
    ).first()
    if not db_token:
        return None
    db_token.last_used_at = datetime.utcnow()
    db.commit()
    user = db.query(models.User).filter(models.User.id == db_token.user_id).first()
    return user


# ==================== AI Config ====================

def create_ai_config(db: Session, config: schemas.AIConfigCreate) -> models.AIConfig:
    # 如果设为默认，先取消其他默认
    if config.is_default:
        db.query(models.AIConfig).filter(models.AIConfig.is_default == True).update({"is_default": False})
    db_config = models.AIConfig(**config.model_dump())
    db.add(db_config)
    db.commit()
    db.refresh(db_config)
    return db_config

def get_ai_configs(db: Session) -> list[models.AIConfig]:
    return db.query(models.AIConfig).order_by(models.AIConfig.is_default.desc(), models.AIConfig.created_at.desc()).all()

def get_ai_config(db: Session, config_id: uuid.UUID) -> models.AIConfig | None:
    return db.query(models.AIConfig).filter(models.AIConfig.id == config_id).first()

def get_default_ai_config(db: Session) -> models.AIConfig | None:
    return db.query(models.AIConfig).filter(models.AIConfig.is_default == True).first()

def update_ai_config(db: Session, config_id: uuid.UUID, update: schemas.AIConfigUpdate) -> models.AIConfig | None:
    db_config = db.query(models.AIConfig).filter(models.AIConfig.id == config_id).first()
    if not db_config:
        return None
    update_data = update.model_dump(exclude_unset=True)
    # 如果设为默认，先取消其他默认
    if update_data.get("is_default"):
        db.query(models.AIConfig).filter(models.AIConfig.id != config_id, models.AIConfig.is_default == True).update({"is_default": False})
    for key, value in update_data.items():
        setattr(db_config, key, value)
    db.commit()
    db.refresh(db_config)
    return db_config

def delete_ai_config(db: Session, config_id: uuid.UUID) -> bool:
    db_config = db.query(models.AIConfig).filter(models.AIConfig.id == config_id).first()
    if not db_config:
        return False
    db.delete(db_config)
    db.commit()
    return True


# ==================== Voice Record ====================

def create_voice_record(db: Session, record: schemas.VoiceRecordCreate) -> models.VoiceRecord:
    db_record = models.VoiceRecord(**record.model_dump())
    db.add(db_record)
    db.commit()
    db.refresh(db_record)
    return db_record

def get_voice_record(db: Session, record_id: uuid.UUID) -> models.VoiceRecord | None:
    return db.query(models.VoiceRecord).filter(models.VoiceRecord.id == record_id).first()

def update_voice_record(db: Session, record_id: uuid.UUID, **kwargs) -> models.VoiceRecord | None:
    db_record = db.query(models.VoiceRecord).filter(models.VoiceRecord.id == record_id).first()
    if not db_record:
        return None
    for key, value in kwargs.items():
        if hasattr(db_record, key):
            setattr(db_record, key, value)
    db.commit()
    db.refresh(db_record)
    return db_record
