"""知识图谱 API：基于向量相似度生成笔记关联图"""
import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from .. import models
from ..database import get_db
from ..dependencies import get_current_user

router = APIRouter()


@router.get("/")
async def get_knowledge_graph(
    threshold: float = 0.55,
    max_edges: int = 100,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """生成知识图谱数据（节点 + 边）"""
    # 1. 获取所有有 embedding 的笔记
    embeddings = db.execute(text(
        "SELECT source_type, source_id, chunk_text, embedding FROM note_embeddings WHERE embedding IS NOT NULL"
    )).fetchall()

    if not embeddings:
        return {"nodes": [], "edges": []}

    import struct

    def blob_to_list(blob):
        count = len(blob) // 4
        return list(struct.unpack(f'{count}f', blob))

    # 2. 构建节点列表（去重，每个 source 只保留一个）
    nodes_map = {}
    for row in embeddings:
        source_type, source_id, chunk_text, emb_blob = row
        if source_id in nodes_map:
            continue
        # 获取标题（source_id 是字符串，需要转为 UUID 查询）
        try:
            source_uuid = uuid.UUID(source_id)
        except ValueError:
            continue
        if source_type == "memo":
            memo = db.query(models.Memo).filter(models.Memo.id == source_uuid).first()
            title = (memo.content.split('\n')[0].strip().lstrip('#').lstrip('*').strip()[:30] if memo and memo.content else "无标题")
            doc_type = "memo"
        else:
            doc = db.query(models.Document).filter(models.Document.id == source_uuid).first()
            if not doc or doc.type == "folder":
                continue
            title = doc.title[:30] if doc.title else "无标题"
            doc_type = doc.type
        nodes_map[source_id] = {
            "id": source_id,
            "title": title,
            "type": doc_type,
            "source_type": source_type,
        }

    # 3. 计算两两相似度，生成边
    import numpy as np

    items = list(embeddings)
    # 去重：每个 source 只取第一个 embedding
    seen = set()
    unique_items = []
    for row in items:
        if row[1] not in seen:
            seen.add(row[1])
            unique_items.append(row)

    n = len(unique_items)
    if n < 2:
        return {"nodes": list(nodes_map.values()), "edges": []}

    # 构建向量矩阵
    vectors = []
    for row in unique_items:
        vectors.append(blob_to_list(row[3]))
    vectors = np.array(vectors, dtype=np.float32)

    # 归一化
    norms = np.linalg.norm(vectors, axis=1, keepdims=True)
    norms = np.where(norms == 0, 1, norms)
    vectors = vectors / norms

    # 计算余弦相似度矩阵
    similarity = np.dot(vectors, vectors.T)

    # 4. 生成边（只取上三角，避免重复）
    edges = []
    for i in range(n):
        for j in range(i + 1, n):
            sim = float(similarity[i][j])
            if sim >= threshold:
                edges.append({
                    "source": unique_items[i][1],
                    "target": unique_items[j][1],
                    "weight": round(sim, 3),
                })

    # 限制边数
    edges.sort(key=lambda e: -e["weight"])
    edges = edges[:max_edges]

    return {
        "nodes": list(nodes_map.values()),
        "edges": edges,
    }
