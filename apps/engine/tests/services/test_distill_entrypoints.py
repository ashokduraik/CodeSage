"""Tests for distillation entrypoint discovery."""

from __future__ import annotations

import uuid
from unittest.mock import MagicMock, patch

from config import Settings
from models import GraphNode
from services.distill.entrypoints import discover_entrypoints, expand_entrypoint_context


def test_discover_entrypoints_caps_seeds() -> None:
    session = MagicMock()
    project_id = uuid.uuid4()
    nodes = [
        GraphNode(
            project_id=project_id,
            repo_id=uuid.uuid4(),
            kind="route",
            name="GET /a",
            file_path="a.ts",
        )
        for _ in range(60)
    ]
    with patch("services.distill.entrypoints.GraphNodeRepository") as repo_cls:
        repo_cls.return_value.list_by_project_and_kinds.return_value = nodes
        result = discover_entrypoints(session, project_id, Settings(distill_max_entrypoints=10))
    assert len(result) == 10


def test_expand_entrypoint_context_returns_seeds_when_no_neighbors() -> None:
    session = MagicMock()
    seed = GraphNode(
        project_id=uuid.uuid4(),
        repo_id=uuid.uuid4(),
        kind="route",
        name="GET /health",
        file_path="health.ts",
    )
    with patch("services.distill.entrypoints.expand_graph_neighbors", return_value=[]):
        result = expand_entrypoint_context(session, [seed], Settings())
    assert result == [seed]


def test_expand_entrypoint_context_loads_neighbor_nodes() -> None:
    session = MagicMock()
    project_id = uuid.uuid4()
    seed = GraphNode(
        project_id=project_id,
        repo_id=uuid.uuid4(),
        kind="route",
        name="GET /api",
        file_path="api.ts",
    )
    neighbor_id = uuid.uuid4()
    neighbor = GraphNode(
        id=neighbor_id,
        project_id=project_id,
        repo_id=uuid.uuid4(),
        kind="http_call",
        name="GET /api/users",
        file_path="client.ts",
    )
    with patch(
        "services.distill.entrypoints.expand_graph_neighbors",
        return_value=[(neighbor_id, 1)],
    ):
        with patch("services.distill.entrypoints.GraphNodeRepository") as repo_cls:
            repo_cls.return_value.get_by_id.return_value = neighbor
            result = expand_entrypoint_context(session, [seed], Settings())
    assert len(result) == 2
    assert neighbor in result
