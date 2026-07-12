"""Tests for graph-augmented retrieval."""

from __future__ import annotations

import uuid
from unittest.mock import MagicMock

import pytest

from config import Settings
from services.retrieval.graph_expand import augment_matches_with_graph
from services.retrieval.types import RetrievalMatch


def test_augment_matches_with_graph_disabled() -> None:
    chunk = MagicMock(id=uuid.uuid4(), repo_id=uuid.uuid4(), file_path="a.ts")
    matches = [RetrievalMatch(chunk=chunk, fused_score=0.02, sources=("vector",))]
    settings = Settings(retrieval_graph_enabled=False)
    result = augment_matches_with_graph(
        MagicMock(),
        settings,
        project_id=uuid.uuid4(),
        matches=matches,
    )
    assert result == matches


def test_augment_matches_with_graph_adds_neighbor_chunks(monkeypatch: pytest.MonkeyPatch) -> None:
    project_id = uuid.uuid4()
    frontend_repo = uuid.uuid4()
    backend_repo = uuid.uuid4()
    seed_chunk = MagicMock(id=uuid.uuid4(), repo_id=frontend_repo, file_path="client.ts")
    neighbor_node_id = uuid.uuid4()
    neighbor_node = MagicMock(
        id=neighbor_node_id,
        repo_id=backend_repo,
        file_path="server.ts",
    )
    neighbor_chunk = MagicMock(id=uuid.uuid4(), repo_id=backend_repo, file_path="server.ts")

    nodes_repo = MagicMock()
    nodes_repo.list_by_repo_file.return_value = [MagicMock(id=uuid.uuid4())]
    nodes_repo.get_by_id.return_value = neighbor_node
    chunks_repo = MagicMock()
    chunks_repo.list_by_repo_file.return_value = [neighbor_chunk]

    monkeypatch.setattr(
        "services.retrieval.graph_expand.GraphNodeRepository",
        lambda _s: nodes_repo,
    )
    monkeypatch.setattr(
        "services.retrieval.graph_expand.CodeChunkRepository",
        lambda _s: chunks_repo,
    )
    monkeypatch.setattr(
        "services.retrieval.graph_expand.expand_graph_neighbors",
        lambda *a, **k: [(neighbor_node_id, 1)],
    )

    result = augment_matches_with_graph(
        MagicMock(),
        Settings(retrieval_graph_max_extra_chunks=2),
        project_id=project_id,
        matches=[RetrievalMatch(chunk=seed_chunk, fused_score=0.03, sources=("vector",))],
    )

    assert len(result) == 2
    assert result[1].chunk is neighbor_chunk
    assert result[1].sources == ("graph",)
    assert result[1].is_graph_expanded is True
    assert result[1].graph_depth == 1


def test_augment_matches_with_graph_prefers_chunk_overlapping_node_span(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Graph expansion picks the chunk whose span overlaps the reached node."""
    project_id = uuid.uuid4()
    frontend_repo = uuid.uuid4()
    backend_repo = uuid.uuid4()
    seed_chunk = MagicMock(id=uuid.uuid4(), repo_id=frontend_repo, file_path="client.ts")
    neighbor_node_id = uuid.uuid4()
    neighbor_node = MagicMock(
        id=neighbor_node_id,
        repo_id=backend_repo,
        file_path="server.ts",
        span={"startLine": 20, "endLine": 40},
    )
    first_chunk = MagicMock(
        id=uuid.uuid4(),
        repo_id=backend_repo,
        file_path="server.ts",
        span={"startLine": 1, "endLine": 10},
    )
    second_chunk = MagicMock(
        id=uuid.uuid4(),
        repo_id=backend_repo,
        file_path="server.ts",
        span={"startLine": 22, "endLine": 35},
    )

    nodes_repo = MagicMock()
    nodes_repo.list_by_repo_file.return_value = [MagicMock(id=uuid.uuid4())]
    nodes_repo.get_by_id.return_value = neighbor_node
    chunks_repo = MagicMock()
    chunks_repo.list_by_repo_file.return_value = [first_chunk, second_chunk]

    monkeypatch.setattr(
        "services.retrieval.graph_expand.GraphNodeRepository",
        lambda _s: nodes_repo,
    )
    monkeypatch.setattr(
        "services.retrieval.graph_expand.CodeChunkRepository",
        lambda _s: chunks_repo,
    )
    monkeypatch.setattr(
        "services.retrieval.graph_expand.expand_graph_neighbors",
        lambda *a, **k: [(neighbor_node_id, 1)],
    )

    result = augment_matches_with_graph(
        MagicMock(),
        Settings(retrieval_graph_max_extra_chunks=2),
        project_id=project_id,
        matches=[RetrievalMatch(chunk=seed_chunk, fused_score=0.03, sources=("vector",))],
    )

    assert len(result) == 2
    assert result[1].chunk is second_chunk
