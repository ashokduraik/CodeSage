"""Recursive-CTE helpers for graph expansion."""

from __future__ import annotations

import uuid
from collections.abc import Sequence

from sqlalchemy import Select, literal, select
from sqlalchemy.orm import Session

from models import GraphEdge, GraphNode


def build_neighbor_expansion_query(
    *,
    seed_node_ids: Sequence[uuid.UUID],
    max_depth: int,
    edge_kinds: Sequence[str] | None = None,
) -> Select[tuple[uuid.UUID, int]]:
    """Build a recursive CTE that walks outgoing edges from seed nodes.

    @param seed_node_ids - Starting graph node UUIDs.
    @param max_depth - Maximum hop count (must be >= 1).
    @param edge_kinds - Optional filter on `graph_edges.kind`.
    @returns Select yielding `(node_id, depth)` for every reachable node including seeds.
    @raises ValueError - When `seed_node_ids` is empty or `max_depth` < 1.
    """
    if not seed_node_ids:
        msg = "seed_node_ids must not be empty"
        raise ValueError(msg)
    if max_depth < 1:
        msg = "max_depth must be at least 1"
        raise ValueError(msg)

    anchor = select(
        GraphNode.id.label("node_id"),
        literal(0).label("depth"),
    ).where(GraphNode.id.in_(seed_node_ids))

    reachable = anchor.cte(name="reachable", recursive=True)

    recursive = (
        select(
            GraphEdge.dst_id.label("node_id"),
            (reachable.c.depth + 1).label("depth"),
        )
        .select_from(GraphEdge)
        .join(reachable, GraphEdge.src_id == reachable.c.node_id)
        .where(reachable.c.depth < max_depth)
    )
    if edge_kinds is not None:
        recursive = recursive.where(GraphEdge.kind.in_(edge_kinds))

    expansion = reachable.union_all(recursive)
    return select(expansion.c.node_id, expansion.c.depth)


def expand_graph_neighbors(
    session: Session,
    *,
    seed_node_ids: Sequence[uuid.UUID],
    max_depth: int,
    edge_kinds: Sequence[str] | None = None,
) -> list[tuple[uuid.UUID, int]]:
    """Execute graph neighbor expansion and return node ids with hop depth.

    @param session - Active SQLAlchemy session.
    @param seed_node_ids - Starting graph node UUIDs.
    @param max_depth - Maximum hop count.
    @param edge_kinds - Optional edge kind filter.
    @returns `(node_id, depth)` tuples including seeds at depth 0.
    """
    stmt = build_neighbor_expansion_query(
        seed_node_ids=seed_node_ids,
        max_depth=max_depth,
        edge_kinds=edge_kinds,
    )
    return [(row[0], int(row[1])) for row in session.execute(stmt).all()]
