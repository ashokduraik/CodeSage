"""Cross-repo HTTP call ↔ route matching for multi-repo projects."""

from __future__ import annotations

import re
import uuid
from collections import defaultdict
from dataclasses import dataclass

from sqlalchemy.orm import Session

from models import GraphEdge, GraphNode
from repositories import GraphEdgeRepository, GraphNodeRepository

_PARAM_SEGMENT = re.compile(r"^:(\w+)$")
_BRACE_SEGMENT = re.compile(r"^\{(\w+)\}$")


@dataclass(frozen=True)
class CrossRepoLinkResult:
    """Summary of edges written by the resolver."""

    links_created: int
    call_nodes: int
    route_nodes: int


def _split_path(path: str) -> list[str]:
    """Split a normalized API path into segments without leading/trailing slashes."""
    normalized = path.strip()
    if normalized != "/" and normalized.endswith("/"):
        normalized = normalized.rstrip("/")
    if normalized == "/":
        return []
    return [segment for segment in normalized.strip("/").split("/") if segment]


def _is_param_segment(segment: str) -> bool:
    """Return True when a route segment is a path parameter placeholder."""
    return bool(_PARAM_SEGMENT.match(segment) or _BRACE_SEGMENT.match(segment))


def paths_compatible(call_path: str, route_path: str) -> bool:
    """Return True when a concrete client path matches a parameterized route template.

    Supports Express-style ``:id`` and OpenAPI-style ``{id}`` placeholders.

    @param call_path - Literal path from an ``http_call`` node.
    @param route_path - Route template from a ``route`` node.
    @returns Whether method+path keys should be considered a cross-repo match.
    """
    call_parts = _split_path(call_path)
    route_parts = _split_path(route_path)
    if len(call_parts) != len(route_parts):
        return False
    for call_segment, route_segment in zip(call_parts, route_parts, strict=True):
        if _is_param_segment(route_segment):
            continue
        if call_segment != route_segment:
            return False
    return True


def _parse_signal_key(name: str) -> tuple[str, str] | None:
    """Split a graph node ``METHOD /path`` key into method and path."""
    if " " not in name:
        return None
    method, path = name.split(" ", 1)
    return method.upper(), path


def resolve_cross_repo_links(session: Session, project_id: uuid.UUID) -> CrossRepoLinkResult:
    """Match frontend HTTP calls to backend routes and persist cross-repo edges.

    Deletes prior cross-repo ``http_call`` edges for the project, then links every
    ``http_call`` node to matching ``route`` nodes in a different repository when method
    and normalized path agree (including parameterized route templates).

    @param session - Active SQLAlchemy session; caller commits.
    @param project_id - Project whose repos should be linked.
    @returns Counts of nodes scanned and edges created.
    """
    nodes_repo = GraphNodeRepository(session)
    edges_repo = GraphEdgeRepository(session)

    edges_repo.delete_cross_repo_by_kind(project_id, kind="http_call")

    call_nodes = nodes_repo.list_by_project_and_kinds(project_id, kinds=("http_call",))
    route_nodes = nodes_repo.list_by_project_and_kinds(project_id, kinds=("route",))

    routes_by_method: dict[str, list[GraphNode]] = defaultdict(list)
    routes_by_exact_key: dict[str, list[GraphNode]] = defaultdict(list)
    for route in route_nodes:
        parsed = _parse_signal_key(route.name)
        if parsed is None:
            continue
        method, path = parsed
        routes_by_method[method].append(route)
        routes_by_exact_key[f"{method} {path}"].append(route)

    links_created = 0
    for call in call_nodes:
        parsed = _parse_signal_key(call.name)
        if parsed is None:
            continue
        method, call_path = parsed
        exact_matches = routes_by_exact_key.get(call.name, [])
        template_matches: list[GraphNode] = []
        for route in routes_by_method.get(method, []):
            route_parsed = _parse_signal_key(route.name)
            if route_parsed is None:
                continue
            _, route_path = route_parsed
            if paths_compatible(call_path, route_path):
                template_matches.append(route)
        seen_route_ids: set[uuid.UUID] = set()
        for route in [*exact_matches, *template_matches]:
            if route.id in seen_route_ids:
                continue
            seen_route_ids.add(route.id)
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
