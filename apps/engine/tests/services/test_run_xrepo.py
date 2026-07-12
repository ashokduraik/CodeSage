"""Tests for xrepo job orchestration."""

from __future__ import annotations

import uuid
from unittest.mock import MagicMock, patch

import pytest

from config import Settings
from services.xrepo.run_xrepo import create_xrepo_handler, handle_xrepo_job
from tests.helpers import make_exec_ctx


def test_handle_xrepo_job_requires_project_id() -> None:
    with pytest.raises(ValueError, match="projectId"):
        handle_xrepo_job(MagicMock(), Settings(), {}, make_exec_ctx(job_type="xrepo"))


def test_handle_xrepo_job_missing_project() -> None:
    with patch("services.xrepo.run_xrepo.ProjectRepository") as project_cls:
        project_cls.return_value.get_by_id.return_value = None
        with pytest.raises(ValueError, match="Project not found"):
            handle_xrepo_job(
                MagicMock(),
                Settings(),
                {"projectId": str(uuid.uuid4())},
                make_exec_ctx(job_type="xrepo"),
            )


def test_handle_xrepo_job_resolves_links(monkeypatch: pytest.MonkeyPatch) -> None:
    project_id = uuid.uuid4()
    project = MagicMock(id=project_id)
    project_repo = MagicMock()
    project_repo.get_by_id.return_value = project
    resolver = MagicMock(links_created=2, call_nodes=1, route_nodes=1)

    monkeypatch.setattr("services.xrepo.run_xrepo.ProjectRepository", lambda _s: project_repo)
    monkeypatch.setattr(
        "services.xrepo.run_xrepo.resolve_cross_repo_links",
        lambda session, pid: resolver,
    )

    handle_xrepo_job(
        MagicMock(),
        Settings(),
        {"projectId": str(project_id)},
        make_exec_ctx(job_type="xrepo"),
    )


def test_create_xrepo_handler_delegates() -> None:
    session = MagicMock()
    called: list[tuple] = []

    with patch(
        "services.xrepo.run_xrepo.handle_xrepo_job",
        lambda *a, **k: called.append((a, k)),
    ):
        handler = create_xrepo_handler(Settings(), MagicMock(return_value=session))
        payload = {"projectId": str(uuid.uuid4())}
        ctx = make_exec_ctx(job_type="xrepo")
        handler(payload, ctx, session)

    assert called
