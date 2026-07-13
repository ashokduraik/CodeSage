"""Entrypoint discovery for distillation graph walks."""

from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from config import Settings
from models import GraphNode
from repositories import GraphNodeRepository
from repositories.graph_queries import expand_graph_neighbors

ENTRYPOINT_KINDS: tuple[str, ...] = ("route", "http_call")


def discover_entrypoints(
    session: Session,
    project_id: uuid.UUID,
    settings: Settings,
) -> list[GraphNode]:
    """Find route and HTTP client nodes to seed distillation graph walks.

    Caps seeds at ``settings.distill_max_entrypoints`` so large projects do not
    exhaust GPU time in a single job.

    @param session - Active SQLAlchemy session.
    @param project_id - Owning project UUID.
    @param settings - Application settings with distillation tunables.
    @returns Entrypoint graph nodes ordered by file path and name.
    """
    nodes_repo = GraphNodeRepository(session)
    seeds = nodes_repo.list_by_project_and_kinds(project_id, kinds=ENTRYPOINT_KINDS)
    return seeds[: settings.distill_max_entrypoints]


def expand_entrypoint_context(
    session: Session,
    seed_nodes: list[GraphNode],
    settings: Settings,
) -> list[GraphNode]:
    """Walk outgoing graph edges from entrypoints and return reachable nodes.

    Includes cross-repo ``http_call`` hops (ADR 0023) up to
    ``settings.distill_graph_max_depth``.

    @param session - Active SQLAlchemy session.
    @param seed_nodes - Entrypoint nodes from {@link discover_entrypoints}.
    @param settings - Application settings with distillation tunables.
    @returns Unique nodes including seeds and expanded neighbors.
    """
    if not seed_nodes:
        return []
    seed_ids = [node.id for node in seed_nodes]
    neighbors = expand_graph_neighbors(
        session,
        seed_node_ids=seed_ids,
        max_depth=settings.distill_graph_max_depth,
    )
    nodes_repo = GraphNodeRepository(session)
    seen: dict[uuid.UUID, GraphNode] = {node.id: node for node in seed_nodes}
    for node_id, _depth in neighbors:
        if node_id in seen:
            continue
        loaded = nodes_repo.get_by_id(node_id)
        if loaded is not None:
            seen[node_id] = loaded
    return list(seen.values())
