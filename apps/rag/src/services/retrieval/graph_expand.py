"""Graph neighbor expansion for cross-repo retrieval."""

from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from config import Settings
from models import CodeChunk
from repositories import CodeChunkRepository, GraphNodeRepository, expand_graph_neighbors
from services.retrieval.types import RetrievalMatch


def augment_matches_with_graph(
    session: Session,
    settings: Settings,
    *,
    project_id: uuid.UUID,
    matches: list[RetrievalMatch],
) -> list[RetrievalMatch]:
    """Add chunks from cross-repo graph neighbors to fused retrieval results.

    Seeds expansion from graph nodes in the same files as the top fused hits, walks
    outgoing ``http_call`` edges, and appends one chunk per newly reached file in another
    repository so answers can cite frontend and backend code together.

    @param session - Active SQLAlchemy session.
    @param settings - Application settings with graph expansion tunables.
    @param project_id - Project scope (unused today; reserved for future filters).
    @param matches - Ranked fused hits ordered by descending fused score.
    @returns Original matches plus graph-expanded chunks (deduplicated by chunk id).
    """
    _ = project_id
    if not settings.retrieval_graph_enabled or not matches:
        return matches

    nodes_repo = GraphNodeRepository(session)
    chunks_repo = CodeChunkRepository(session)

    seed_ids: list[uuid.UUID] = []
    seen_seeds: set[uuid.UUID] = set()
    for match in matches[:3]:
        for node in nodes_repo.list_by_repo_file(match.chunk.repo_id, match.chunk.file_path):
            if node.id in seen_seeds:
                continue
            seen_seeds.add(node.id)
            seed_ids.append(node.id)

    if not seed_ids:
        return matches

    neighbors = expand_graph_neighbors(
        session,
        seed_node_ids=seed_ids,
        max_depth=settings.retrieval_graph_max_depth,
        edge_kinds=("http_call",),
    )
    if not neighbors:
        return matches

    seed_repo_ids = {match.chunk.repo_id for match in matches[:3]}
    merged: list[RetrievalMatch] = list(matches)
    seen_chunk_ids = {match.chunk.id for match in merged}
    extra_budget = settings.retrieval_graph_max_extra_chunks

    for node_id, depth in neighbors:
        if extra_budget <= 0:
            break
        node = nodes_repo.get_by_id(node_id)
        if node is None or node.file_path is None:
            continue
        if node.repo_id in seed_repo_ids and depth == 0:
            continue
        file_chunks = chunks_repo.list_by_repo_file(node.repo_id, node.file_path)
        if not file_chunks:
            continue
        candidate = file_chunks[0]
        if candidate.id in seen_chunk_ids:
            continue
        # Graph-expanded chunks sit after fused hits; encode hop depth in a low fused score.
        merged.append(
            RetrievalMatch(
                chunk=candidate,
                fused_score=max(matches[0].fused_score * 0.5, 0.01) - depth * 0.001,
                sources=("graph",),
                graph_depth=depth,
                is_graph_expanded=True,
            ),
        )
        seen_chunk_ids.add(candidate.id)
        extra_budget -= 1

    return merged
