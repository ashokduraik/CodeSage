"""Tests for distill job orchestration."""

from __future__ import annotations

import uuid
from unittest.mock import MagicMock, patch

import pytest

from config import Settings
from services.distill.heuristic import DistillResult
from services.distill.run_distill import create_distill_handler, handle_distill_job
from tests.helpers import make_exec_ctx


def test_handle_distill_job_requires_project_id() -> None:
    with pytest.raises(ValueError, match="projectId"):
        handle_distill_job(MagicMock(), Settings(), {}, make_exec_ctx(job_type="distill"))


def test_handle_distill_job_missing_project() -> None:
    with patch("services.distill.run_distill.ProjectRepository") as project_cls:
        project_cls.return_value.get_by_id.return_value = None
        with pytest.raises(ValueError, match="Project not found"):
            handle_distill_job(
                MagicMock(),
                Settings(),
                {"projectId": str(uuid.uuid4())},
                make_exec_ctx(job_type="distill"),
            )


def test_handle_distill_job_runs_pipeline(monkeypatch: pytest.MonkeyPatch) -> None:
    project_id = uuid.uuid4()
    project = MagicMock(id=project_id)
    project_repo = MagicMock()
    project_repo.get_by_id.return_value = project
    result = DistillResult(workflows=1, page_map=2, permission_rules=0, data_flows=3)

    monkeypatch.setattr("services.distill.run_distill.ProjectRepository", lambda _s: project_repo)
    monkeypatch.setattr(
        "services.distill.run_distill.run_distillation",
        lambda *a, **k: result,
    )

    handle_distill_job(
        MagicMock(),
        Settings(),
        {"projectId": str(project_id)},
        make_exec_ctx(job_type="distill"),
    )


def test_create_distill_handler_delegates() -> None:
    session = MagicMock()
    called: list[tuple] = []

    with patch(
        "services.distill.run_distill.handle_distill_job",
        lambda *a, **k: called.append((a, k)),
    ):
        handler = create_distill_handler(Settings(), MagicMock(return_value=session))
        payload = {"projectId": str(uuid.uuid4())}
        ctx = make_exec_ctx(job_type="distill")
        handler(payload, ctx, session)

    assert called
