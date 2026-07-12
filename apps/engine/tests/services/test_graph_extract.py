"""Tests for graph extraction during parse."""

from __future__ import annotations

import uuid
from unittest.mock import MagicMock

import pytest

from services.graph.extract import persist_file_graph


def test_persist_file_graph_creates_file_and_symbol_nodes(monkeypatch: pytest.MonkeyPatch) -> None:
    project_id = uuid.uuid4()
    repo_id = uuid.uuid4()
    file_node = MagicMock(id=uuid.uuid4())
    symbol_node = MagicMock(id=uuid.uuid4())

    nodes_repo = MagicMock()
    nodes_repo.add.side_effect = [file_node, symbol_node]
    edges_repo = MagicMock()

    monkeypatch.setattr("services.graph.extract.GraphNodeRepository", lambda _s: nodes_repo)
    monkeypatch.setattr("services.graph.extract.GraphEdgeRepository", lambda _s: edges_repo)

    source = "export function login() { return 1; }\n"
    result = persist_file_graph(
        MagicMock(),
        project_id=project_id,
        repo_id=repo_id,
        file_path="src/auth.ts",
        content=source,
    )

    assert result.node_count >= 2
    assert result.edge_count >= 1
    nodes_repo.delete_by_repo_file.assert_called_once_with(repo_id, "src/auth.ts")
    edges_repo.add.assert_called_once()
