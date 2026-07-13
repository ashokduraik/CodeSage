"""Graph-heuristic distillation when LLM is unavailable or for fast dev paths."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from decimal import Decimal

from sqlalchemy.orm import Session

from config import Settings
from models import GraphNode
from repositories import (
    DataFlowRepository,
    PageMapRepository,
    PermissionRuleRepository,
    WorkflowRepository,
)
from services.distill.context import file_ref, merge_source_refs, node_ref


@dataclass(frozen=True)
class DistillResult:
    """Counts of derived artifacts written by a distillation run."""

    workflows: int
    page_map: int
    permission_rules: int
    data_flows: int


def _route_path(node: GraphNode) -> str:
    """Extract the URL path from a route or http_call node name."""
    name = node.name.strip()
    parts = name.split(" ", 1)
    if len(parts) == 2 and parts[1].startswith("/"):
        return parts[1]
    if name.startswith("/"):
        return name
    return f"/{name}"


def _workflow_name(route_path: str) -> str:
    """Derive a workflow label from the first URL segment."""
    segments = [segment for segment in route_path.strip("/").split("/") if segment]
    if not segments:
        return "root"
    return segments[0]


def run_heuristic_distillation(
    session: Session,
    project_id: uuid.UUID,
    nodes: list[GraphNode],
    settings: Settings,
) -> DistillResult:
    """Derive product knowledge from graph structure without calling the LLM.

    Used when ``VLLM_BASE_URL`` is unset and as a deterministic test path. Produces
    lower-confidence rows that still carry file and graph-node citations.

    @param session - Active SQLAlchemy session.
    @param project_id - Owning project UUID.
    @param nodes - Expanded entrypoint graph context.
    @param settings - Application settings with confidence tunables.
    @returns Counts of rows upserted per derived table.
    """
    confidence = Decimal(str(settings.distill_heuristic_confidence))
    routes = [node for node in nodes if node.kind == "route"]
    calls = [node for node in nodes if node.kind == "http_call"]

    workflows_repo = WorkflowRepository(session)
    pages_repo = PageMapRepository(session)
    perms_repo = PermissionRuleRepository(session)
    flows_repo = DataFlowRepository(session)

    workflow_counts: dict[str, list[GraphNode]] = {}
    for route in routes:
        path = _route_path(route)
        workflow_counts.setdefault(_workflow_name(path), []).append(route)

    workflow_written = 0
    for name, route_nodes in workflow_counts.items():
        steps = [
            {"order": index + 1, "label": _route_path(node), "refs": [node_ref(node)]}
            for index, node in enumerate(route_nodes)
        ]
        refs = merge_source_refs(*[[node_ref(n), file_ref(n)] for n in route_nodes])
        workflows_repo.upsert(
            project_id=project_id,
            name=name,
            steps=steps,
            confidence=confidence,
            source_refs=refs,
        )
        workflow_written += 1

    page_written = 0
    for route in routes:
        path = _route_path(route)
        related_calls = [call for call in calls if _route_path(call) == path]
        pages_repo.upsert(
            project_id=project_id,
            route=path,
            components=[{"name": route.name, "file": route.file_path}],
            data_sources=[{"method_path": call.name} for call in related_calls],
            confidence=confidence,
            source_refs=merge_source_refs([node_ref(route), file_ref(route)]),
        )
        page_written += 1

    perm_written = 0
    for route in routes:
        path = _route_path(route)
        if "admin" in path.lower() or "auth" in path.lower():
            perms_repo.upsert(
                project_id=project_id,
                target=path,
                required_permission="authenticated",
                confidence=confidence,
                source_refs=merge_source_refs([node_ref(route), file_ref(route)]),
            )
            perm_written += 1

    flow_written = 0
    for call in calls:
        path = _route_path(call)
        flows_repo.upsert(
            project_id=project_id,
            page_ref=path,
            source_chain=[{"hop": call.name, "kind": "http_call"}],
            freshness_type="async",
            confidence=confidence,
            source_refs=merge_source_refs([node_ref(call), file_ref(call)]),
        )
        flow_written += 1

    return DistillResult(
        workflows=workflow_written,
        page_map=page_written,
        permission_rules=perm_written,
        data_flows=flow_written,
    )


def run_incremental_heuristic(
    session: Session,
    project_id: uuid.UUID,
    stale_artifact_ids: list[uuid.UUID],
    settings: Settings,
) -> DistillResult:
    """Re-derive only stale artifacts by id using heuristic refresh.

    Loads each stale row's citations and rebuilds from current graph nodes when
    possible; falls back to full heuristic pass when no stale ids match.

    @param session - Active SQLAlchemy session.
    @param project_id - Owning project UUID.
    @param stale_artifact_ids - Artifact UUIDs from incremental re-index.
    @param settings - Application settings.
    @returns Counts of rows refreshed.
    """
    from models.derived_knowledge import DataFlow, PageMap, PermissionRule, Workflow

    confidence = Decimal(str(settings.distill_heuristic_confidence))
    refreshed = DistillResult(0, 0, 0, 0)
    for artifact_id in stale_artifact_ids:
        for model, repo_cls, field in (
            (Workflow, WorkflowRepository, "workflows"),
            (PageMap, PageMapRepository, "page_map"),
            (PermissionRule, PermissionRuleRepository, "permission_rules"),
            (DataFlow, DataFlowRepository, "data_flows"),
        ):
            row = session.get(model, artifact_id)
            if row is None or row.project_id != project_id or not row.is_stale:
                continue
            if row.is_expert_override:
                continue
            repo = repo_cls(session)
            if isinstance(row, Workflow):
                repo.upsert(
                    project_id=project_id,
                    name=row.name,
                    steps=row.steps,
                    confidence=confidence,
                    source_refs=row.source_refs,
                    row_id=row.id,
                )
                refreshed = DistillResult(
                    refreshed.workflows + 1,
                    refreshed.page_map,
                    refreshed.permission_rules,
                    refreshed.data_flows,
                )
            elif isinstance(row, PageMap):
                repo.upsert(
                    project_id=project_id,
                    route=row.route,
                    components=row.components,
                    data_sources=row.data_sources,
                    confidence=confidence,
                    source_refs=row.source_refs,
                    row_id=row.id,
                )
                refreshed = DistillResult(
                    refreshed.workflows,
                    refreshed.page_map + 1,
                    refreshed.permission_rules,
                    refreshed.data_flows,
                )
            elif isinstance(row, PermissionRule):
                repo.upsert(
                    project_id=project_id,
                    target=row.target,
                    required_permission=row.required_permission,
                    confidence=confidence,
                    source_refs=row.source_refs,
                    row_id=row.id,
                )
                refreshed = DistillResult(
                    refreshed.workflows,
                    refreshed.page_map,
                    refreshed.permission_rules + 1,
                    refreshed.data_flows,
                )
            elif isinstance(row, DataFlow):
                repo.upsert(
                    project_id=project_id,
                    page_ref=row.page_ref,
                    source_chain=row.source_chain,
                    freshness_type=row.freshness_type,
                    confidence=confidence,
                    source_refs=row.source_refs,
                    row_id=row.id,
                )
                refreshed = DistillResult(
                    refreshed.workflows,
                    refreshed.page_map,
                    refreshed.permission_rules,
                    refreshed.data_flows + 1,
                )
    return refreshed
