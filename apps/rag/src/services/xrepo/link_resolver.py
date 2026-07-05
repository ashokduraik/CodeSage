"""Cross-repo HTTP call ↔ route matching for multi-repo projects."""

from __future__ import annotations

import uuid
from collections import defaultdict
from dataclasses import dataclass

from sqlalchemy.orm import Session

from models import GraphEdge, GraphNode
from repositories import GraphEdgeRepository, GraphNodeRepository


@dataclass(frozen=True)
class CrossRepoLinkResult:
    """Summary of edges written by the resolver."""

    links_created: int
    call_nodes: int
    route_nodes: int


def resolve_cross_repo_links(session: Session, project_id: uuid.UUID) -> CrossRepoLinkResult:
    """Match frontend HTTP calls to backend routes and persist cross-repo edges.

    Deletes prior cross-repo ``http_call`` edges for the project, then links every
    ``http_call`` node to matching ``route`` nodes in a different repository when method
    and normalized path agree.

    @param session - Active SQLAlchemy session; caller commits.
    @param project_id - Project whose repos should be linked.
    @returns Counts of nodes scanned and edges created.
    """
    nodes_repo = GraphNodeRepository(session)
    edges_repo = GraphEdgeRepository(session)

    edges_repo.delete_cross_repo_by_kind(project_id, kind="http_call")

    call_nodes = nodes_repo.list_by_project_and_kinds(project_id, kinds=("http_call",))
    route_nodes = nodes_repo.list_by_project_and_kinds(project_id, kinds=("route",))

    routes_by_key: dict[str, list[GraphNode]] = defaultdict(list)
    for route in route_nodes:
        routes_by_key[route.name].append(route)

    links_created = 0
    for call in call_nodes:
        for route in routes_by_key.get(call.name, []):
            if call.repo_id == route.repo_id:
                continue
            edges_repo.add(
                GraphEdge(
                    project_id=project_id,
                    src_id=call.id,
                    dst_id=route.id,
                    kind="http_call",
                ),
            )
            links_created += 1

    return CrossRepoLinkResult(
        links_created=links_created,
        call_nodes=len(call_nodes),
        route_nodes=len(route_nodes),
    )
