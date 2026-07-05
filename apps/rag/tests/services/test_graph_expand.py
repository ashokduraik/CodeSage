"""Tests for graph-augmented retrieval."""

from __future__ import annotations

import uuid
from unittest.mock import MagicMock

import pytest

from config import Settings
from services.retrieval.graph_expand import augment_matches_with_graph


def test_augment_matches_with_graph_disabled() -> None:
    chunk = MagicMock(id=uuid.uuid4(), repo_id=uuid.uuid4(), file_path="a.ts")
    matches = [(chunk, 0.2)]
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
        matches=[(seed_chunk, 0.1)],
    )

    assert len(result) == 2
    assert result[1][0] is neighbor_chunk
