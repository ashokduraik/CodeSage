"""pgvector similarity search query builder."""

from __future__ import annotations

import uuid
from collections.abc import Sequence

from sqlalchemy import Select, select
from sqlalchemy.orm import Session

from models import CodeChunk


def build_similarity_query(
    *,
    project_id: uuid.UUID,
    query_embedding: Sequence[float],
    limit: int,
    repo_ids: Sequence[uuid.UUID] | None = None,
) -> Select[tuple[CodeChunk, float]]:
    """Build a cosine-distance similarity query over embedded code chunks.

    Rows without an embedding are excluded. Lower distance means higher similarity.

    @param project_id - Scope search to this project.
    @param query_embedding - Query vector (same dimension as stored embeddings).
    @param limit - Maximum chunks to return.
    @param repo_ids - Optional repo filter; when omitted, all project repos are searched.
    @returns SQLAlchemy select returning `(CodeChunk, distance)` tuples.
    """
    distance = CodeChunk.embedding.cosine_distance(query_embedding).label("distance")
    stmt = (
        select(CodeChunk, distance)
        .where(
            CodeChunk.project_id == project_id,
            CodeChunk.embedding.is_not(None),
        )
        .order_by(distance)
        .limit(limit)
    )
    if repo_ids is not None:
        stmt = stmt.where(CodeChunk.repo_id.in_(repo_ids))
    return stmt


def similarity_search(
    session: Session,
    *,
    project_id: uuid.UUID,
    query_embedding: Sequence[float],
    limit: int,
    repo_ids: Sequence[uuid.UUID] | None = None,
) -> list[tuple[CodeChunk, float]]:
    """Run vector similarity search and return chunks with cosine distance scores.

    @param session - Active SQLAlchemy session.
    @param project_id - Scope search to this project.
    @param query_embedding - Query vector.
    @param limit - Maximum chunks to return.
    @param repo_ids - Optional repo filter.
    @returns List of `(chunk, distance)` ordered by ascending distance.
    """
    stmt = build_similarity_query(
        project_id=project_id,
        query_embedding=query_embedding,
        limit=limit,
        repo_ids=repo_ids,
    )
    return [(row[0], float(row[1])) for row in session.execute(stmt).all()]
