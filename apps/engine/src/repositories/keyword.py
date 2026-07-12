"""pg_trgm keyword search over code_chunks.content."""

from __future__ import annotations

import uuid
from collections.abc import Sequence

from sqlalchemy import Select, func, or_, select
from sqlalchemy.orm import Session

from models import CodeChunk, Repo
from models.enums import RowStatus


def build_keyword_query(
    *,
    project_id: uuid.UUID,
    terms: Sequence[str],
    limit: int,
    repo_ids: Sequence[uuid.UUID] | None = None,
    min_similarity: float = 0.1,
) -> Select[tuple[CodeChunk, float]]:
    """Build a trigram similarity query over chunk content.

    Uses the best similarity score across all query terms. Higher score means
    a better match.

    @param project_id - Scope search to this project.
    @param terms - Identifier tokens extracted from the user question.
    @param limit - Maximum chunks to return.
    @param repo_ids - Optional repo filter.
    @param min_similarity - Minimum ``similarity()`` score to include a row.
    @returns SQLAlchemy select returning ``(CodeChunk, score)`` tuples.
    """
    if not terms:
        return select(CodeChunk).where(False)  # type: ignore[return-value]

    similarity_exprs = [func.similarity(CodeChunk.content, term) for term in terms]
    best_score = func.greatest(*similarity_exprs).label("score")
    stmt = (
        select(CodeChunk, best_score)
        .join(Repo, CodeChunk.repo_id == Repo.id)
        .where(
            CodeChunk.project_id == project_id,
            CodeChunk.status == RowStatus.ACTIVE,
            Repo.status == RowStatus.ACTIVE,
            or_(*[expr >= min_similarity for expr in similarity_exprs]),
        )
        .order_by(best_score.desc())
        .limit(limit)
    )
    if repo_ids is not None:
        stmt = stmt.where(CodeChunk.repo_id.in_(repo_ids))
    return stmt


def keyword_search(
    session: Session,
    *,
    project_id: uuid.UUID,
    terms: Sequence[str],
    limit: int,
    repo_ids: Sequence[uuid.UUID] | None = None,
    min_similarity: float = 0.1,
) -> list[tuple[CodeChunk, float]]:
    """Run trigram keyword search and return chunks with similarity scores.

    @param session - Active SQLAlchemy session.
    @param project_id - Project scope.
    @param terms - Search terms from the user question.
    @param limit - Maximum chunks to return.
    @param repo_ids - Optional repo filter.
    @param min_similarity - Minimum similarity threshold.
    @returns List of ``(chunk, score)`` ordered by descending score.
    """
    if not terms:
        return []
    stmt = build_keyword_query(
        project_id=project_id,
        terms=terms,
        limit=limit,
        repo_ids=repo_ids,
        min_similarity=min_similarity,
    )
    return [(row[0], float(row[1])) for row in session.execute(stmt).all()]
