"""Distillation pipeline orchestration — full and incremental derive."""

from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from config import Settings
from services.distill.entrypoints import discover_entrypoints, expand_entrypoint_context
from services.distill.heuristic import (
    DistillResult,
    run_heuristic_distillation,
    run_incremental_heuristic,
)
from services.llm.distill_client import complete_distill_json, resolve_distill_model


def run_distillation(
    session: Session,
    project_id: uuid.UUID,
    settings: Settings,
    *,
    stale_artifact_ids: list[uuid.UUID] | None = None,
) -> DistillResult:
    """Derive product knowledge for a project (full or incremental).

    Walks the code graph from entrypoints, calls the distillation LLM when
    configured, and falls back to graph heuristics otherwise. Every written row
    carries confidence and source citations per ADR 0025.

    @param session - Active SQLAlchemy session.
    @param project_id - Owning project UUID.
    @param settings - Application settings.
    @param stale_artifact_ids - When set, refresh only these artifact rows.
    @returns Counts of artifacts written per derived table.
    """
    if stale_artifact_ids:
        return run_incremental_heuristic(session, project_id, stale_artifact_ids, settings)

    seeds = discover_entrypoints(session, project_id, settings)
    nodes = expand_entrypoint_context(session, seeds, settings)

    if resolve_distill_model(settings) and settings.vllm_base_url:
        llm_result = _try_llm_distillation(session, project_id, settings, nodes)
        if llm_result is not None:
            return llm_result

    return run_heuristic_distillation(session, project_id, nodes, settings)


def _try_llm_distillation(
    session: Session,
    project_id: uuid.UUID,
    settings: Settings,
    nodes: list,
) -> DistillResult | None:
    """Attempt LLM-based extraction; return None to trigger heuristic fallback.

    @param session - Active SQLAlchemy session.
    @param project_id - Owning project UUID.
    @param settings - Application settings.
    @param nodes - Expanded graph context nodes.
    @returns Distill counts when LLM path succeeds, else ``None``.
    """
    from services.distill.context import pack_distill_context

    context_blocks = pack_distill_context(session, project_id, nodes, settings)
    if not context_blocks:
        return None

    system_prompt = (
        "You extract structured product knowledge from code graph context. "
        "Respond with JSON: "
        '{"workflows":[],"page_map":[],"permission_rules":[],"data_flows":[]}. '
        "Each item must include confidence (0-1) and source_refs arrays."
    )
    user_prompt = "Graph context:\n\n" + "\n\n---\n\n".join(context_blocks)
    parsed = complete_distill_json(
        settings,
        system_prompt=system_prompt,
        user_prompt=user_prompt,
    )
    if parsed is None:
        return None

    return _persist_llm_payload(session, project_id, parsed)


def _persist_llm_payload(
    session: Session,
    project_id: uuid.UUID,
    payload: dict,
) -> DistillResult:
    """Write LLM JSON payload into derived-knowledge repositories.

    @param session - Active SQLAlchemy session.
    @param project_id - Owning project UUID.
    @param payload - Parsed LLM JSON with four artifact arrays.
    @returns Counts of rows upserted.
    """
    from decimal import Decimal

    from repositories import (
        DataFlowRepository,
        PageMapRepository,
        PermissionRuleRepository,
        WorkflowRepository,
    )

    workflows_repo = WorkflowRepository(session)
    pages_repo = PageMapRepository(session)
    perms_repo = PermissionRuleRepository(session)
    flows_repo = DataFlowRepository(session)

    wf_count = 0
    for item in payload.get("workflows", []):
        if not isinstance(item, dict) or "name" not in item:
            continue
        workflows_repo.upsert(
            project_id=project_id,
            name=str(item["name"]),
            steps=item.get("steps", []),
            confidence=Decimal(str(item.get("confidence", 0.5))),
            source_refs=item.get("source_refs", []),
        )
        wf_count += 1

    page_count = 0
    for item in payload.get("page_map", []):
        if not isinstance(item, dict) or "route" not in item:
            continue
        pages_repo.upsert(
            project_id=project_id,
            route=str(item["route"]),
            components=item.get("components", []),
            data_sources=item.get("data_sources", []),
            confidence=Decimal(str(item.get("confidence", 0.5))),
            source_refs=item.get("source_refs", []),
        )
        page_count += 1

    perm_count = 0
    for item in payload.get("permission_rules", []):
        if not isinstance(item, dict) or "target" not in item:
            continue
        perms_repo.upsert(
            project_id=project_id,
            target=str(item["target"]),
            required_permission=str(item.get("required_permission", "unknown")),
            confidence=Decimal(str(item.get("confidence", 0.5))),
            source_refs=item.get("source_refs", []),
        )
        perm_count += 1

    flow_count = 0
    for item in payload.get("data_flows", []):
        if not isinstance(item, dict) or "page_ref" not in item:
            continue
        freshness = str(item.get("freshness_type", "async"))
        if freshness not in ("sync", "async", "cached", "polled", "event-driven"):
            freshness = "async"
        flows_repo.upsert(
            project_id=project_id,
            page_ref=str(item["page_ref"]),
            source_chain=item.get("source_chain", []),
            freshness_type=freshness,
            confidence=Decimal(str(item.get("confidence", 0.5))),
            source_refs=item.get("source_refs", []),
        )
        flow_count += 1

    return DistillResult(
        workflows=wf_count,
        page_map=page_count,
        permission_rules=perm_count,
        data_flows=flow_count,
    )
