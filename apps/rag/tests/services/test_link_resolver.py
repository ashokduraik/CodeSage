"""Tests for cross-repo link resolution."""

from __future__ import annotations

import uuid
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from services.xrepo.link_resolver import resolve_cross_repo_links


def test_resolve_cross_repo_links_matches_calls_to_routes(monkeypatch: pytest.MonkeyPatch) -> None:
    project_id = uuid.uuid4()
    frontend_repo = uuid.uuid4()
    backend_repo = uuid.uuid4()
    call_node = SimpleNamespace(
        id=uuid.uuid4(),
        repo_id=frontend_repo,
        name="GET /api/login",
    )
    route_node = SimpleNamespace(
        id=uuid.uuid4(),
        repo_id=backend_repo,
        name="GET /api/login",
    )

    nodes_repo = MagicMock()
    nodes_repo.list_by_project_and_kinds.side_effect = [
        [call_node],
        [route_node],
    ]
    edges_repo = MagicMock()

    monkeypatch.setattr(
        "services.xrepo.link_resolver.GraphNodeRepository",
        lambda _s: nodes_repo,
    )
    monkeypatch.setattr(
        "services.xrepo.link_resolver.GraphEdgeRepository",
        lambda _s: edges_repo,
    )

    result = resolve_cross_repo_links(MagicMock(), project_id)

    edges_repo.delete_cross_repo_by_kind.assert_called_once_with(project_id, kind="http_call")
    edges_repo.add.assert_called_once()
    assert result.links_created == 1


def test_resolve_cross_repo_links_skips_same_repo_matches(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    project_id = uuid.uuid4()
    repo_id = uuid.uuid4()
    call_node = SimpleNamespace(id=uuid.uuid4(), repo_id=repo_id, name="GET /api/x")
    route_node = SimpleNamespace(id=uuid.uuid4(), repo_id=repo_id, name="GET /api/x")

    nodes_repo = MagicMock()
    nodes_repo.list_by_project_and_kinds.side_effect = [[call_node], [route_node]]
    edges_repo = MagicMock()

    monkeypatch.setattr(
        "services.xrepo.link_resolver.GraphNodeRepository",
        lambda _s: nodes_repo,
    )
    monkeypatch.setattr(
        "services.xrepo.link_resolver.GraphEdgeRepository",
        lambda _s: edges_repo,
    )

    result = resolve_cross_repo_links(MagicMock(), project_id)

    edges_repo.add.assert_not_called()
    assert result.links_created == 0
