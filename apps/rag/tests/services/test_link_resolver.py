"""Tests for cross-repo link resolution."""

from __future__ import annotations

import uuid
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from services.xrepo.link_resolver import paths_compatible, resolve_cross_repo_links


def test_paths_compatible_matches_parameterized_route() -> None:
    assert paths_compatible("/users/123", "/users/:id")
    assert paths_compatible("/users/123", "/users/{id}")
    assert not paths_compatible("/users/123/extra", "/users/:id")


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


def test_resolve_cross_repo_links_matches_parameterized_route(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    project_id = uuid.uuid4()
    frontend_repo = uuid.uuid4()
    backend_repo = uuid.uuid4()
    call_node = SimpleNamespace(
        id=uuid.uuid4(),
        repo_id=frontend_repo,
        name="GET /users/42",
    )
    route_node = SimpleNamespace(
        id=uuid.uuid4(),
        repo_id=backend_repo,
        name="GET /users/:id",
    )

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


def test_resolve_cross_repo_links_creates_edge_per_ambiguous_route_match(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """One frontend call matching two backend routes creates multiple edges (known limitation)."""
    project_id = uuid.uuid4()
    frontend_repo = uuid.uuid4()
    backend_a = uuid.uuid4()
    backend_b = uuid.uuid4()
    call_node = SimpleNamespace(
        id=uuid.uuid4(),
        repo_id=frontend_repo,
        name="GET /api/users",
    )
    route_a = SimpleNamespace(id=uuid.uuid4(), repo_id=backend_a, name="GET /api/users")
    route_b = SimpleNamespace(id=uuid.uuid4(), repo_id=backend_b, name="GET /api/users")

    nodes_repo = MagicMock()
    nodes_repo.list_by_project_and_kinds.side_effect = [
        [call_node],
        [route_a, route_b],
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

    assert result.links_created == 2
    assert edges_repo.add.call_count == 2
