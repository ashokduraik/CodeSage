"""Tests for distillation context packing helpers."""

from __future__ import annotations

import uuid
from unittest.mock import MagicMock

from config import Settings
from models import CodeChunk, GraphNode
from models.enums import RowStatus
from services.distill.context import (
    file_ref,
    merge_source_refs,
    node_ref,
    pack_distill_context,
)


def test_file_ref_uses_file_path() -> None:
    node = GraphNode(
        project_id=uuid.uuid4(),
        repo_id=uuid.uuid4(),
        kind="route",
        name="GET /x",
        file_path="src/routes/x.ts",
    )
    assert file_ref(node) == {"kind": "file", "path": "src/routes/x.ts"}


def test_node_ref_includes_graph_node_id() -> None:
    node_id = uuid.uuid4()
    node = GraphNode(
        id=node_id,
        project_id=uuid.uuid4(),
        repo_id=uuid.uuid4(),
        kind="route",
        name="GET /x",
    )
    assert node_ref(node) == {"kind": "graph_node", "id": str(node_id)}


def test_merge_source_refs_deduplicates() -> None:
    ref = {"kind": "file", "path": "a.ts"}
    merged = merge_source_refs([ref], [ref, {"kind": "file", "path": "b.ts"}])
    assert merged == [ref, {"kind": "file", "path": "b.ts"}]


def test_pack_distill_context_returns_empty_for_no_nodes() -> None:
    session = MagicMock()
    assert pack_distill_context(session, uuid.uuid4(), [], Settings()) == []


def test_pack_distill_context_includes_chunk_excerpts() -> None:
    session = MagicMock()
    project_id = uuid.uuid4()
    node = GraphNode(
        project_id=project_id,
        repo_id=uuid.uuid4(),
        kind="route",
        name="GET /checkout",
        file_path="src/checkout.ts",
    )
    chunk = CodeChunk(
        project_id=project_id,
        repo_id=node.repo_id,
        file_path="src/checkout.ts",
        span={"start": 1, "end": 10},
        content="export function checkout() {}",
        status=RowStatus.ACTIVE,
    )
    session.scalars.return_value = iter([chunk])
    blocks = pack_distill_context(session, project_id, [node], Settings())
    assert len(blocks) == 1
    assert "GET /checkout" in blocks[0]
    assert "checkout()" in blocks[0]
