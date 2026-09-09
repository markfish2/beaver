"""Central AI/MCP visibility policy.

``ai_excluded`` is a hard boundary for every AI-facing feature.  Documents
inherit the restriction from every parent folder; a missing or cyclic parent
chain is denied deliberately so a malformed tree cannot expose content.
"""

from __future__ import annotations

from collections.abc import Iterable
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy.orm import Session

from . import models

if TYPE_CHECKING:
    from .models import Document, Memo


class AiAccessPolicy:
    """Evaluate effective AI visibility within the current workspace."""

    def __init__(self, db: Session):
        self.db = db
        self._documents: dict[UUID, models.Document] | None = None
        self._document_allowed_cache: dict[UUID, bool] = {}

    def _all_documents(self) -> dict[UUID, models.Document]:
        if self._documents is None:
            documents = self.db.query(models.Document).all()
            self._documents = {document.id: document for document in documents}
        return self._documents

    def is_document_allowed(self, document: Document | UUID | None) -> bool:
        """Return whether a document is visible to AI/MCP.

        The result includes the document itself, all parent folders and soft
        deletion.  Unknown parents and cycles fail closed.
        """
        if document is None:
            return False
        document_id = document if isinstance(document, UUID) else document.id
        cached = self._document_allowed_cache.get(document_id)
        if cached is not None:
            return cached

        documents = self._all_documents()
        current_id: UUID | None = document_id
        visited: set[UUID] = set()
        allowed = True
        chain: list[UUID] = []

        while current_id is not None:
            if current_id in visited:
                allowed = False
                break
            visited.add(current_id)
            chain.append(current_id)
            current = documents.get(current_id)
            if current is None or current.deleted_at is not None or current.ai_excluded:
                allowed = False
                break
            current_id = current.parent_id

        for chain_id in chain:
            self._document_allowed_cache[chain_id] = allowed
        return allowed

    def is_memo_allowed(self, memo: Memo | UUID | None) -> bool:
        """Return whether a memo is visible to AI/MCP."""
        if memo is None:
            return False
        if isinstance(memo, UUID):
            memo = self.db.query(models.Memo).filter(models.Memo.id == memo).first()
        return bool(memo and memo.deleted_at is None and not memo.ai_excluded)

    def filter_documents(self, documents: Iterable[Document]) -> list[Document]:
        return [document for document in documents if self.is_document_allowed(document)]

    def filter_memos(self, memos: Iterable[Memo]) -> list[Memo]:
        return [memo for memo in memos if self.is_memo_allowed(memo)]

    def is_source_allowed(self, source_type: str, source_id: str | UUID) -> bool:
        """Validate an embedding/RAG source before returning any derived text."""
        try:
            source_uuid = source_id if isinstance(source_id, UUID) else UUID(str(source_id))
        except (TypeError, ValueError):
            return False
        if source_type == "memo":
            return self.is_memo_allowed(source_uuid)
        if source_type in {"document", "node"}:
            return self.is_document_allowed(source_uuid)
        return False

    def descendants_of(self, document_id: UUID) -> list[Document]:
        """Return a document and all of its descendants without trusting cycles."""
        documents = self._all_documents()
        descendants: list[models.Document] = []
        for candidate in documents.values():
            current_id: UUID | None = candidate.id
            visited: set[UUID] = set()
            while current_id is not None and current_id not in visited:
                if current_id == document_id:
                    descendants.append(candidate)
                    break
                visited.add(current_id)
                current = documents.get(current_id)
                current_id = current.parent_id if current else None
        return descendants


def ai_access_policy(db: Session) -> AiAccessPolicy:
    """Small factory to keep request-level policy construction explicit."""
    return AiAccessPolicy(db)
