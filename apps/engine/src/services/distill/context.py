"""Pack graph nodes and code chunks into LLM context for distillation."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from config import Settings
from models import CodeChunk, GraphNode
from models.enums import RowStatus


def file_ref(node: GraphNode) -> dict[str, str]:
    """Build a source citation pointing at a node's file path.

    @param node - Graph node with optional ``file_path``.
    @returns Source ref dict for ``source_refs`` JSONB.
    """
    path = node.file_path or node.name
    return {"kind": "file", "path": path}


def node_ref(node: GraphNode) -> dict[str, str]:
    """Build a source citation pointing at a graph node id.

    @param node - Graph node row.
    @returns Source ref dict for ``source_refs`` JSONB.
    """
    return {"kind": "graph_node", "id": str(node.id)}


def pack_distill_context(
    session: Session,
    project_id: uuid.UUID,
    nodes: list[GraphNode],
    settings: Settings,
) -> list[str]:
    """Load code excerpts for graph nodes and pack them for distillation prompts.

    Respects the LLM context budget by truncating excerpts when the combined text
    would exceed roughly half of the configured context window.

    @param session - Active SQLAlchemy session.
    @param project_id - Owning project UUID.
    @param nodes - Graph nodes to include in context.
    @param settings - Application settings with context-window tunables.
    @returns Text blocks describing nodes and matching code chunks.
    """
    if not nodes:
        return []
    file_paths = {node.file_path for node in nodes if node.file_path}
    chunks_by_file: dict[str, list[CodeChunk]] = {}
    if file_paths:
        stmt = select(CodeChunk).where(
            CodeChunk.project_id == project_id,
            CodeChunk.status == RowStatus.ACTIVE,
            CodeChunk.file_path.in_(file_paths),
        )
        for chunk in session.scalars(stmt):
            chunks_by_file.setdefault(chunk.file_path, []).append(chunk)

    max_chars = max(
        2000,
        (settings.llm_max_context_tokens - settings.llm_completion_reserve_tokens) * 3,
    )
    blocks: list[str] = []
    used = 0
    for node in nodes:
        header = f"[{node.kind}] {node.name} ({node.file_path or 'unknown'})"
        body_parts = [header]
        if node.file_path and node.file_path in chunks_by_file:
            for chunk in chunks_by_file[node.file_path][:3]:
                body_parts.append(chunk.content[:800])
        block = "\n".join(body_parts)
        if used + len(block) > max_chars:
            break
        blocks.append(block)
        used += len(block)
    return blocks


def merge_source_refs(*ref_lists: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Deduplicate source citation dicts by JSON-serialized key.

    @param ref_lists - Variable number of citation lists to merge.
    @returns Deduplicated citation list preserving first-seen order.
    """
    seen: set[str] = set()
    merged: list[dict[str, Any]] = []
    for refs in ref_lists:
        for ref in refs:
            key = str(sorted(ref.items()))
            if key in seen:
                continue
            seen.add(key)
            merged.append(ref)
    return merged
