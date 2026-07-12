"""Phase 2 exit-criteria verification using E2E fixture sources.

Validates the frontend/backend fixture pair produces matching API signals and
cross-repo links without requiring a live indexed project.
"""

from __future__ import annotations

import uuid
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from services.graph.api_signals import extract_api_signals
from services.xrepo.link_resolver import resolve_cross_repo_links

_FIXTURES_ROOT = (
    Path(__file__).resolve().parents[4] / "tests" / "e2e" / "fixtures"
)
_FRONTEND_API = _FIXTURES_ROOT / "frontend" / "src" / "api.ts"
_BACKEND_ROUTES = _FIXTURES_ROOT / "backend" / "src" / "routes.ts"


def test_e2e_fixtures_produce_matching_api_signals() -> None:
    """Fixture repos expose GET /api/login on client and server."""
    frontend_source = _FRONTEND_API.read_text(encoding="utf-8")
    backend_source = _BACKEND_ROUTES.read_text(encoding="utf-8")

    frontend_signals = extract_api_signals(frontend_source, "src/api.ts")
    backend_signals = extract_api_signals(backend_source, "src/routes.ts")

    frontend_keys = {signal.key for signal in frontend_signals if signal.kind == "http_call"}
    backend_keys = {signal.key for signal in backend_signals if signal.kind == "route"}

    assert "GET /api/login" in frontend_keys
    assert "GET /api/login" in backend_keys


def test_e2e_fixtures_resolve_cross_repo_link(monkeypatch: pytest.MonkeyPatch) -> None:
    """Fixture pair links frontend http_call to backend route across repos."""
    project_id = uuid.uuid4()
    frontend_repo = uuid.uuid4()
    backend_repo = uuid.uuid4()

    frontend_source = _FRONTEND_API.read_text(encoding="utf-8")
    backend_source = _BACKEND_ROUTES.read_text(encoding="utf-8")
    call_signal = next(
        signal
        for signal in extract_api_signals(frontend_source, "src/api.ts")
        if signal.kind == "http_call"
    )
    route_signal = next(
        signal
        for signal in extract_api_signals(backend_source, "src/routes.ts")
        if signal.kind == "route"
    )

    call_node = SimpleNamespace(
        id=uuid.uuid4(),
        repo_id=frontend_repo,
        name=call_signal.key,
    )
    route_node = SimpleNamespace(
        id=uuid.uuid4(),
        repo_id=backend_repo,
        name=route_signal.key,
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

    assert result.links_created == 1
    edges_repo.add.assert_called_once()
