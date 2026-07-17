"""Data access for ``qa_playbooks`` (ADR 0027).

Promotion and planner-hint orchestration live in ``services/qa/playbooks`` (plan 11+).
This repository only persists and queries playbook rows.
"""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import Select, func, select, update
from sqlalchemy.orm import Session

from models.enums import RowStatus
from models.qa_playbook import QaPlaybook
from repositories.audit import RAG_ACTOR_ID, stamp_created, stamp_updated


class QaPlaybookRepository:
    """CRUD and similarity helpers for project-scoped QA playbooks."""

    def __init__(self, session: Session) -> None:
        """Bind the repository to an open SQLAlchemy session.

        @param session - Active ORM session used for all queries.
        """
        self._session = session

    def insert(
        self,
        *,
        project_id: uuid.UUID,
        canonical_question: str,
        intent_profile: str,
        steps: list[Any],
        evidence_anchors: list[Any],
        question_embedding: Sequence[float] | None = None,
        source_message_id: uuid.UUID | None = None,
        success_count: int = 1,
    ) -> QaPlaybook:
        """Insert an active playbook row and return it.

        @param project_id - Owning project UUID.
        @param canonical_question - Normalized exemplar question text.
        @param intent_profile - ``symbol_lookup``, ``conceptual``, or ``balanced``.
        @param steps - Ordered tool-step templates (JSONB).
        @param evidence_anchors - Stable file/symbol anchors (JSONB).
        @param question_embedding - Optional TEI embedding of the canonical question.
        @param source_message_id - Optional provenance message UUID.
        @param success_count - Initial success counter (default 1).
        @returns The persisted ``QaPlaybook`` instance.
        """
        row = QaPlaybook(
            project_id=project_id,
            canonical_question=canonical_question,
            intent_profile=intent_profile,
            steps=steps,
            evidence_anchors=evidence_anchors,
            question_embedding=list(question_embedding) if question_embedding is not None else None,
            source_message_id=source_message_id,
            success_count=success_count,
            last_success_at=datetime.now(timezone.utc),
        )
        stamp_created(row)
        self._session.add(row)
        self._session.flush()
        return row

    def list_active(
        self,
        project_id: uuid.UUID,
        *,
        limit: int = 100,
    ) -> list[QaPlaybook]:
        """List active playbooks for a project, newest successful use first.

        @param project_id - Owning project UUID.
        @param limit - Maximum rows to return.
        @returns Active playbook rows ordered by ``last_success_at`` descending.
        """
        stmt = (
            select(QaPlaybook)
            .where(
                QaPlaybook.project_id == project_id,
                QaPlaybook.status == RowStatus.ACTIVE,
            )
            .order_by(QaPlaybook.last_success_at.desc())
            .limit(limit)
        )
        return list(self._session.scalars(stmt))

    def count_active(self, project_id: uuid.UUID) -> int:
        """Count active playbooks for a project (cap enforcement).

        @param project_id - Owning project UUID.
        @returns Number of rows with ``status = 'A'``.
        """
        stmt = (
            select(func.count())
            .select_from(QaPlaybook)
            .where(
                QaPlaybook.project_id == project_id,
                QaPlaybook.status == RowStatus.ACTIVE,
            )
        )
        return int(self._session.scalar(stmt) or 0)

    def soft_delete(self, playbook_id: uuid.UUID) -> bool:
        """Soft-delete one playbook (``status = 'D'``).

        @param playbook_id - Target playbook UUID.
        @returns True when an active row was updated.
        """
        row = self._session.get(QaPlaybook, playbook_id)
        if row is None or row.status != RowStatus.ACTIVE:
            return False
        row.status = RowStatus.DELETED
        stamp_updated(row)
        self._session.flush()
        return True

    def find_eviction_candidate(self, project_id: uuid.UUID) -> QaPlaybook | None:
        """Pick the active playbook to soft-delete when the per-project cap is hit.

        Prefers the lowest ``success_count``, then the oldest ``last_success_at``, so
        rarely reinforced and stale paths leave first.

        @param project_id - Owning project UUID.
        @returns The eviction candidate, or None when the project has no active playbooks.
        """
        stmt = (
            select(QaPlaybook)
            .where(
                QaPlaybook.project_id == project_id,
                QaPlaybook.status == RowStatus.ACTIVE,
            )
            .order_by(
                QaPlaybook.success_count.asc(),
                QaPlaybook.last_success_at.asc(),
            )
            .limit(1)
        )
        return self._session.scalars(stmt).first()

    def build_similarity_query(
        self,
        *,
        project_id: uuid.UUID,
        query_embedding: Sequence[float],
        limit: int,
        max_distance: float,
    ) -> Select[tuple[QaPlaybook, float]]:
        """Build a cosine-distance query over active playbooks with embeddings.

        Callers convert distance to similarity with ``1 - distance``. Rows without
        an embedding are excluded. Partial HNSW covers active rows only.

        @param project_id - Scope search to this project.
        @param query_embedding - Query vector (same dimension as stored embeddings).
        @param limit - Maximum playbooks to return.
        @param max_distance - Cosine distance upper bound (``1 - min_similarity``).
        @returns Select returning ``(QaPlaybook, distance)`` ordered by ascending distance.
        """
        distance_expr = QaPlaybook.question_embedding.cosine_distance(query_embedding)
        return (
            select(QaPlaybook, distance_expr.label("distance"))
            .where(
                QaPlaybook.project_id == project_id,
                QaPlaybook.status == RowStatus.ACTIVE,
                QaPlaybook.question_embedding.is_not(None),
                distance_expr <= max_distance,
            )
            .order_by(distance_expr)
            .limit(limit)
        )

    def similarity_search(
        self,
        *,
        project_id: uuid.UUID,
        query_embedding: Sequence[float],
        limit: int = 3,
        min_similarity: float = 0.85,
    ) -> list[tuple[QaPlaybook, float]]:
        """Find active playbooks similar to a question embedding.

        @param project_id - Scope search to this project.
        @param query_embedding - Question embedding from TEI.
        @param limit - Maximum matches (default K=3 per ADR 0027).
        @param min_similarity - Cosine similarity floor (default 0.85).
        @returns List of ``(playbook, similarity)`` ordered by descending similarity.
        """
        max_distance = 1.0 - min_similarity
        stmt = self.build_similarity_query(
            project_id=project_id,
            query_embedding=query_embedding,
            limit=limit,
            max_distance=max_distance,
        )
        rows = self._session.execute(stmt).all()
        return [(row[0], 1.0 - float(row[1])) for row in rows]

    def mark_success(self, playbook_id: uuid.UUID) -> bool:
        """Increment ``success_count`` and refresh ``last_success_at`` for a merge hit.

        @param playbook_id - Target playbook UUID.
        @returns True when an active row was updated.
        """
        now = datetime.now(timezone.utc)
        stmt = (
            update(QaPlaybook)
            .where(
                QaPlaybook.id == playbook_id,
                QaPlaybook.status == RowStatus.ACTIVE,
            )
            .values(
                success_count=QaPlaybook.success_count + 1,
                last_success_at=now,
                updated_by=RAG_ACTOR_ID,
            )
        )
        result = self._session.execute(stmt)
        self._session.flush()
        return (result.rowcount or 0) > 0
