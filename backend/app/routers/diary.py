import re
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from .. import crud, schemas, models
from ..database import get_db
from ..dependencies import get_current_user

router = APIRouter()

@router.get("/tag/{tag}")
def get_diary_tag_nodes(
    tag: str,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    """Return every matching diary node across all months and its date parent."""
    pattern = re.compile(re.escape(tag) + r'(?=[^a-zA-Z0-9_\u4e00-\u9fa5]|$)')
    documents = db.query(models.Document).filter(
        models.Document.diary_date.isnot(None),
        models.Document.deleted_at.is_(None),
    ).order_by(models.Document.diary_date.asc()).all()
    result = []
    for document in documents:
        nodes = crud.get_nodes(db, document.id)
        matched = [node for node in nodes if pattern.search(node.content or '') or pattern.search(node.note or '')]
        if not matched:
            continue
        node_map = {str(node.id): node for node in nodes}
        date_nodes = []
        visible_ids = set()
        for node in matched:
            visible_ids.add(str(node.id))
            parent = node_map.get(str(node.parent_node_id)) if node.parent_node_id else None
            # Diary nodes can be nested several levels below the date heading.
            # Walk to the root so every result is grouped under its real date.
            while parent:
                visible_ids.add(str(parent.id))
                if not parent.parent_node_id:
                    break
                parent = node_map.get(str(parent.parent_node_id))
            if parent and parent not in date_nodes:
                date_nodes.append(parent)
        visible_nodes = [node for node in nodes if str(node.id) in visible_ids and node not in date_nodes]
        result.append({
            'document_id': str(document.id),
            'diary_date': document.diary_date,
            'date_nodes': [schemas.Node.model_validate(node).model_dump(mode='json') for node in date_nodes],
            'nodes': [schemas.Node.model_validate(node).model_dump(mode='json') for node in visible_nodes],
        })
    return {'tag': tag, 'items': result}

@router.get("/months", response_model=schemas.DiaryMonthsResponse)
def get_diary_months(
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    items = crud.get_diary_months(db)
    return schemas.DiaryMonthsResponse(items=items)

@router.get("/{year}/{month}", response_model=schemas.DiaryDocumentResponse)
def get_monthly_diary(
    year: int,
    month: int,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    if month < 1 or month > 12:
        raise HTTPException(status_code=400, detail="Invalid month")
    doc, nodes, is_new = crud.get_or_create_monthly_diary(db, year, month)
    return schemas.DiaryDocumentResponse(document=doc, nodes=nodes, is_new=is_new)

@router.post("/{year}/{month}/days/{day}", response_model=schemas.DiaryDayNodeResponse)
def get_or_create_day_node(
    year: int,
    month: int,
    day: int,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    doc, _ = crud.get_or_create_monthly_diary_doc(db, year, month)
    node, is_new, child_node = crud.get_or_create_day_node(db, doc.id, year, month, day)
    return schemas.DiaryDayNodeResponse(node_id=str(node.id), is_new=is_new, child_node=child_node)

@router.get("/{year}/{month}/days")
def get_diary_day_dates(
    year: int,
    month: int,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    date_str = f"{year:04d}-{month:02d}"
    doc = db.query(models.Document).filter(models.Document.diary_date == date_str).first()
    if not doc:
        return {"days": []}
    days = crud.get_diary_day_dates(db, doc.id)
    return {"days": days}

@router.get("/summary", response_model=schemas.DiarySummaryResponse)
def get_diary_summary(
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    tasks, tags = crud.get_diary_summary(db)
    return {"tasks": tasks, "tags": tags}
