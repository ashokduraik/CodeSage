"""Graph neighbor expansion for cross-repo retrieval."""

from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from config import Settings
from models import CodeChunk
from repositories import CodeChunkRepository, GraphNodeRepository, expand_graph_neighbors


def augment_matches_with_graph(
    session: Session,
    settings: Settings,
    *,
    project_id: uuid.UUID,
    matches: list[tuple[CodeChunk, float]],
) -> list[tuple[CodeChunk, float]]:
    """Add chunks from cross-repo graph neighbors to vector retrieval results.

    Seeds expansion from graph nodes in the same files as the top vector hits, walks
    outgoing ``http_call`` edges, and appends one chunk per newly reached file in another
    repository so answers can cite frontend and backend code together.

    @param session - Active SQLAlchemy session.
    @param settings - Application settings with graph expansion tunables.
    @param project_id - Project scope (unused today; reserved for future filters).
    @param matches - Ranked vector hits ordered by ascending distance.
    @returns Original matches plus graph-expanded chunks (deduplicated by chunk id).
    """
    _ = project_id
    if not settings.retrieval_graph_enabled or not matches:
        return matches

    nodes_repo = GraphNodeRepository(session)
    chunks_repo = CodeChunkRepository(session)

    seed_ids: list[uuid.UUID] = []
    seen_seeds: set[uuid.UUID] = set()
    for chunk, _distance in matches[:3]:
        for node in nodes_repo.list_by_repo_file(chunk.repo_id, chunk.file_path):
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

    seed_repo_ids = {chunk.repo_id for chunk, _ in matches[:3]}
    merged: list[tuple[CodeChunk, float]] = list(matches)
    seen_chunk_ids = {chunk.id for chunk, _ in merged}
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
        # Graph-expanded chunks sit after vector hits; distance encodes hop depth for ordering.
        merged.append((candidate, 0.5 + depth * 0.05))
        seen_chunk_ids.add(candidate.id)
        extra_budget -= 1

    return merged
