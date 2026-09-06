from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List
from uuid import UUID
import re
from .. import crud, models, schemas
from ..database import get_db
from ..dependencies import get_current_user_flexible as get_current_user
from ..vector_search import search_similar_from_stored_embedding

router = APIRouter()


def _keyword_related_notes(db: Session, document_id: UUID, query: str, existing_ids: set[str], limit: int) -> list[dict]:
    """向量服务不可用或索引不完整时，提供轻量本地回退。"""
    terms: list[str] = []
    stopwords = {"这是", "一个", "目前", "可以", "如果", "以及", "我们", "他们", "没有", "需要", "什么", "如何", "关于", "进行"}
    for run in re.findall(r"[一-鿿]{3,}", query):
        for size in (4, 3):
            terms.extend(run[index:index + size].lower() for index in range(0, len(run) - size + 1))
    terms.extend(word.lower() for word in re.findall(r"[a-zA-Z][a-zA-Z0-9_-]{2,}", query))
    terms = [term for term in dict.fromkeys(terms) if term not in stopwords][:80]
    if not terms:
        return []

    candidates: list[tuple[int, int, dict]] = []
    for memo in db.query(models.Memo).filter(models.Memo.is_archived == False).all():
        source_id = str(memo.id)
        if source_id in existing_ids:
            continue
        text_value = (memo.content or "").lower()
        matched_terms = [term for term in terms if term in text_value]
        score = sum(min(text_value.count(term), 3) for term in matched_terms)
        if len(matched_terms) >= 2:
            candidates.append((len(matched_terms), score, {
                "id": source_id,
                "title": (memo.content or "").split("\n", 1)[0].lstrip("#*- ").strip()[:50] or "无标题",
                "type": "memo",
                "snippet": (memo.content or "")[:180],
                "distance": None,
            }))

    documents = db.query(models.Document).filter(
        models.Document.deleted_at.is_(None),
        models.Document.ai_excluded == False,
        models.Document.type.in_(["document", "note"]),
    ).all()
    document_ids = [candidate.id for candidate in documents]
    nodes_by_document: dict[UUID, list[models.Node]] = {candidate_id: [] for candidate_id in document_ids}
    if document_ids:
        for node in db.query(models.Node).filter(models.Node.document_id.in_(document_ids)).all():
            nodes_by_document.setdefault(node.document_id, []).append(node)
    for candidate_document in documents:
        source_id = str(candidate_document.id)
        if source_id in existing_ids or candidate_document.id == document_id:
            continue
        node_text = "\n".join(
            f"{node.content or ''}\n{node.note or ''}"
            for node in nodes_by_document.get(candidate_document.id, [])
        )
        text_value = f"{candidate_document.title}\n{node_text}".lower()
        matched_terms = [term for term in terms if term in text_value]
        score = sum(min(text_value.count(term), 3) for term in matched_terms)
        if len(matched_terms) >= 2:
            candidates.append((len(matched_terms), score, {
                "id": source_id,
                "title": candidate_document.title,
                "type": candidate_document.type,
                "snippet": node_text[:180],
                "distance": None,
            }))

    candidates.sort(key=lambda item: (item[0], item[1]), reverse=True)
    return [item[2] for item in candidates[:limit]]

@router.get("/", response_model=List[schemas.Document])
def read_documents(search: str = None, db: Session = Depends(get_db), current_user: schemas.User = Depends(get_current_user)):
    return crud.get_documents(db, search=search)

@router.get("/recent", response_model=List[schemas.Document])
def read_recent_documents(limit: int = 20, db: Session = Depends(get_db), current_user: schemas.User = Depends(get_current_user)):
    return crud.get_recent_documents(db, limit=limit)

@router.get("/{document_id}", response_model=schemas.Document)
def read_document(document_id: UUID, db: Session = Depends(get_db), current_user: schemas.User = Depends(get_current_user)):
    doc = crud.get_document(db, document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc

@router.post("/", response_model=schemas.Document)
def create_document(document: schemas.DocumentCreate, db: Session = Depends(get_db), current_user: schemas.User = Depends(get_current_user)):
    return crud.create_document(db, document)

@router.post("/{document_id}/copy", response_model=schemas.Document)
def copy_document(document_id: UUID, db: Session = Depends(get_db), current_user: schemas.User = Depends(get_current_user)):
    new_doc = crud.copy_document(db, document_id)
    if not new_doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return new_doc

@router.get("/{document_id}/nodes", response_model=List[schemas.Node])
def read_document_nodes(document_id: UUID, db: Session = Depends(get_db), current_user: schemas.User = Depends(get_current_user)):
    # Verify document exists
    doc = crud.get_document(db, document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return crud.get_nodes(db, document_id)

def _require_note_document(db: Session, document_id: UUID):
    document = crud.get_document(db, document_id)
    if not document or document.deleted_at is not None or document.type != "note":
        raise HTTPException(status_code=404, detail="Ordinary note not found")
    return document

@router.get("/{document_id}/highlights", response_model=List[schemas.NoteHighlight])
def read_note_highlights(document_id: UUID, db: Session = Depends(get_db), current_user: schemas.User = Depends(get_current_user)):
    _require_note_document(db, document_id)
    return crud.get_note_highlights(db, document_id, current_user.id)

@router.post("/{document_id}/highlights", response_model=schemas.NoteHighlight)
def create_note_highlight(document_id: UUID, highlight: schemas.NoteHighlightCreate, db: Session = Depends(get_db), current_user: schemas.User = Depends(get_current_user)):
    _require_note_document(db, document_id)
    return crud.create_note_highlight(db, document_id, current_user.id, highlight)

@router.put("/{document_id}/highlights/{highlight_id}", response_model=schemas.NoteHighlight)
def update_note_highlight(document_id: UUID, highlight_id: UUID, highlight: schemas.NoteHighlightUpdate, db: Session = Depends(get_db), current_user: schemas.User = Depends(get_current_user)):
    _require_note_document(db, document_id)
    updated = crud.update_note_highlight(db, highlight_id, document_id, current_user.id, highlight)
    if not updated:
        raise HTTPException(status_code=404, detail="Highlight not found")
    return updated

@router.delete("/{document_id}/highlights/{highlight_id}")
def delete_note_highlight(document_id: UUID, highlight_id: UUID, db: Session = Depends(get_db), current_user: schemas.User = Depends(get_current_user)):
    _require_note_document(db, document_id)
    if not crud.delete_note_highlight(db, highlight_id, document_id, current_user.id):
        raise HTTPException(status_code=404, detail="Highlight not found")
    return {"ok": True}

@router.get("/{document_id}/related", response_model=List[schemas.RelatedNote])
async def read_related_documents(
    document_id: UUID,
    limit: int = Query(default=3, ge=1, le=3),
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user),
):
    """根据当前普通/大纲笔记内容返回最多三篇语义相关笔记。"""
    document = crud.get_document(db, document_id)
    if not document or document.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Document not found")
    if document.type not in ("document", "note") or document.ai_excluded:
        return []

    nodes = (
        db.query(models.Node)
        .filter(models.Node.document_id == document_id)
        .order_by(models.Node.sort_order.asc())
        .all()
    )
    content_parts = [document.title]
    for node in nodes:
        if node.content:
            content_parts.append(node.content)
        if node.note:
            content_parts.append(node.note)
    query = "\n".join(content_parts).strip()[:6000]
    if len(query) < 30:
        return []

    # 相关笔记展示优先复用当前笔记已经建立的向量，避免每次打开预览
    # 都把整篇笔记发送到云端 embedding API。
    results = search_similar_from_stored_embedding(db, str(document_id), limit=limit + 6)
    related: list[dict] = []
    seen_ids = {str(document_id)}
    for result in results:
        # search_similar 会在向量结果不足时混入关键词回退结果；相关笔记宁可少返回，
        # 也不能把没有语义距离的弱匹配展示成推荐。0.32 约等于相似度至少 0.68。
        distance = result.get("distance")
        if distance is None or float(distance) > 0.32:
            continue
        source_id = str(result.get("id", ""))
        if not source_id or source_id in seen_ids:
            continue
        source_type = result.get("type")
        try:
            source_uuid = UUID(source_id)
        except ValueError:
            continue
        if source_type == "memo":
            memo = db.query(models.Memo).filter(
                models.Memo.id == source_uuid,
                models.Memo.is_archived == False,
            ).first()
            if not memo:
                continue
            result_type = "memo"
        else:
            related_document = crud.get_document(db, source_uuid)
            if not related_document or related_document.deleted_at is not None:
                continue
            if related_document.type not in ("document", "note") or related_document.ai_excluded:
                continue
            result_type = related_document.type
        seen_ids.add(source_id)
        related.append({**result, "id": source_id, "type": result_type, "snippet": str(result.get("snippet", ""))[:180]})
        if len(related) >= limit:
            break
    # 仅在没有足够的高置信度向量结果时使用严格的本地关键词回退；回退本身也
    # 要求命中至少两个有区分度的词组，因此允许最终返回 0、1、2 或 3 条。
    if not related:
        related.extend(_keyword_related_notes(
            db,
            document_id,
            query,
            {str(item["id"]) for item in related} | {str(document_id)},
            limit,
        ))
    return related

@router.put("/{document_id}", response_model=schemas.Document)
def update_document(document_id: UUID, document: schemas.DocumentUpdate, db: Session = Depends(get_db), current_user: schemas.User = Depends(get_current_user)):
    updated_doc, status = crud.update_document(db, document_id, document)
    if status == "not_found":
        raise HTTPException(status_code=404, detail="Document not found")
    if status == "conflict":
        raise HTTPException(status_code=409, detail={"message": "版本冲突", "current_version": updated_doc.version, "current_title": updated_doc.title})
    return updated_doc

@router.delete("/{document_id}")
def delete_document(document_id: UUID, delete_children: bool = False, db: Session = Depends(get_db), current_user: schemas.User = Depends(get_current_user)):
    if not crud.delete_document(db, document_id, delete_children=delete_children):
        raise HTTPException(status_code=404, detail="Document not found")
    return {"ok": True}
