"""Symbol name search over graph_nodes joined to code_chunks."""

from __future__ import annotations

import uuid
from collections.abc import Sequence

from sqlalchemy import Select, func, or_, select
from sqlalchemy.orm import Session

from models import CodeChunk, GraphNode, Repo
from models.enums import RowStatus

_SYMBOL_KINDS: tuple[str, ...] = ("function", "class", "method")


def _chunk_matches_symbol(chunk: CodeChunk, symbol_name: str) -> bool:
    """Return True when a chunk's symbol_refs or content references the symbol.

    @param chunk - Candidate code chunk row.
    @param symbol_name - Graph node symbol name.
    """
    lowered = symbol_name.lower()
    for ref in chunk.symbol_refs or []:
        if not isinstance(ref, dict):
            continue
        ref_name = ref.get("name")
        if isinstance(ref_name, str) and ref_name.lower() == lowered:
            return True
    return lowered in chunk.content.lower()


def build_symbol_query(
    *,
    project_id: uuid.UUID,
    terms: Sequence[str],
    limit: int,
    repo_ids: Sequence[uuid.UUID] | None = None,
    min_similarity: float = 0.25,
) -> Select[tuple[GraphNode, float]]:
    """Build a trigram similarity query over symbol graph node names.

    @param project_id - Scope search to this project.
    @param terms - Identifier tokens from the user question.
    @param limit - Maximum symbol nodes to return.
    @param repo_ids - Optional repo filter.
    @param min_similarity - Minimum ``similarity()`` on node name.
    @returns Select yielding ``(GraphNode, score)`` ordered by score descending.
    """
    if not terms:
        return select(GraphNode).where(False)  # type: ignore[return-value]

    similarity_exprs = [func.similarity(GraphNode.name, term) for term in terms]
    best_score = func.greatest(*similarity_exprs).label("score")
    stmt = (
        select(GraphNode, best_score)
        .join(Repo, GraphNode.repo_id == Repo.id)
        .where(
            GraphNode.project_id == project_id,
            GraphNode.kind.in_(_SYMBOL_KINDS),
            GraphNode.status == RowStatus.ACTIVE,
            Repo.status == RowStatus.ACTIVE,
            GraphNode.file_path.is_not(None),
            or_(*[expr >= min_similarity for expr in similarity_exprs]),
        )
        .order_by(best_score.desc())
        .limit(limit)
    )
    if repo_ids is not None:
        stmt = stmt.where(GraphNode.repo_id.in_(repo_ids))
    return stmt


def symbol_search(
    session: Session,
    *,
    project_id: uuid.UUID,
    terms: Sequence[str],
    limit: int,
    repo_ids: Sequence[uuid.UUID] | None = None,
    min_similarity: float = 0.25,
) -> list[tuple[CodeChunk, float]]:
    """Find code chunks that define symbols matching the query terms.

    Resolves graph symbol hits back to ``code_chunks`` in the same file, preferring
    chunks whose ``symbol_refs`` name the symbol.

    @param session - Active SQLAlchemy session.
    @param project_id - Project scope.
    @param terms - Search terms from the user question.
    @param limit - Maximum chunk results to return.
    @param repo_ids - Optional repo filter.
    @param min_similarity - Minimum symbol name similarity.
    @returns ``(chunk, score)`` pairs ordered by descending symbol score.
    """
    if not terms:
        return []

    node_stmt = build_symbol_query(
        project_id=project_id,
        terms=terms,
        limit=limit * 3,
        repo_ids=repo_ids,
        min_similarity=min_similarity,
    )
    node_hits = session.execute(node_stmt).all()
    if not node_hits:
        return []

    results: list[tuple[CodeChunk, float]] = []
    seen_chunk_ids: set[uuid.UUID] = set()
    file_cache: dict[tuple[uuid.UUID, str], list[CodeChunk]] = {}

    for node_row in node_hits:
        node: GraphNode = node_row[0]
        score = float(node_row[1])
        if node.file_path is None:
            continue
        cache_key = (node.repo_id, node.file_path)
        if cache_key not in file_cache:
            chunk_stmt = (
                select(CodeChunk)
                .join(Repo, CodeChunk.repo_id == Repo.id)
                .where(
                    CodeChunk.project_id == project_id,
                    CodeChunk.repo_id == node.repo_id,
                    CodeChunk.file_path == node.file_path,
                    CodeChunk.status == RowStatus.ACTIVE,
                    Repo.status == RowStatus.ACTIVE,
                )
            )
            file_cache[cache_key] = list(session.scalars(chunk_stmt).all())

        file_chunks = file_cache[cache_key]
        if not file_chunks:
            continue

        matched = [c for c in file_chunks if _chunk_matches_symbol(c, node.name)]
        candidates: list[CodeChunk] = matched or file_chunks[:1]

        for chunk in candidates:
            if chunk.id in seen_chunk_ids:
                continue
            seen_chunk_ids.add(chunk.id)
            results.append((chunk, score))
            if len(results) >= limit:
                return sorted(results, key=lambda item: item[1], reverse=True)

    return sorted(results, key=lambda item: item[1], reverse=True)
