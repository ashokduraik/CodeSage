"""Tests for indexing progress recorder fan-out."""

from __future__ import annotations

import uuid
from unittest.mock import MagicMock, patch

from services.indexing.progress_recorder import IndexingProgressRecorder
from tests.helpers import make_exec_ctx


def test_distill_record_started_fans_out_to_active_repos() -> None:
    project_id = uuid.uuid4()
    repo_a = MagicMock(id=uuid.uuid4())
    repo_b = MagicMock(id=uuid.uuid4())
    session = MagicMock()
    ctx = make_exec_ctx(job_type="distill", project_id=project_id)
    recorder = IndexingProgressRecorder(session, ctx)

    with patch("repositories.RepoRepository") as repo_cls:
        repo_cls.return_value.list_by_project.return_value = [repo_a, repo_b]
        with patch.object(recorder._repo, "insert") as insert:
            recorder.record_started()

    assert insert.call_count == 2
    written_repo_ids = {call.args[0].repo_id for call in insert.call_args_list}
    assert written_repo_ids == {repo_a.id, repo_b.id}
    assert all(call.args[0].step == "distill" for call in insert.call_args_list)
    assert all(call.args[0].phase == "started" for call in insert.call_args_list)


def test_distill_record_finished_fans_out_and_marks_complete() -> None:
    project_id = uuid.uuid4()
    repo = MagicMock(id=uuid.uuid4())
    session = MagicMock()
    ctx = make_exec_ctx(job_type="distill", project_id=project_id)
    recorder = IndexingProgressRecorder(session, ctx)

    with patch("repositories.RepoRepository") as repo_cls:
        repo_cls.return_value.list_by_project.return_value = [repo]
        with patch.object(recorder._repo, "insert") as insert:
            recorder.record_finished("Built project knowledge — 0 workflows")

    assert insert.call_count == 1
    assert insert.call_args.args[0].phase == "finished"
    assert ctx.step_completed is True


def test_distill_record_failed_fans_out_to_active_repos() -> None:
    project_id = uuid.uuid4()
    repo = MagicMock(id=uuid.uuid4())
    session = MagicMock()
    ctx = make_exec_ctx(job_type="distill", project_id=project_id)
    recorder = IndexingProgressRecorder(session, ctx)

    with patch("repositories.RepoRepository") as repo_cls:
        repo_cls.return_value.list_by_project.return_value = [repo]
        with patch.object(recorder._repo, "insert") as insert:
            recorder.record_failed(
                "Building project knowledge from indexed code — failed",
                failure_reason="boom",
            )

    assert insert.call_count == 1
    row = insert.call_args.args[0]
    assert row.phase == "failed"
    assert row.failure_reason == "boom"

    session = MagicMock()
    ctx = make_exec_ctx(job_type="distill", project_id=uuid.uuid4())
    recorder = IndexingProgressRecorder(session, ctx)

    with patch("repositories.RepoRepository") as repo_cls:
        repo_cls.return_value.list_by_project.return_value = []
        with patch.object(recorder._repo, "insert") as insert:
            recorder.record_started()
            recorder.record_failed("failed", failure_reason="boom")

    insert.assert_not_called()


def test_repo_scoped_record_started_writes_single_repo() -> None:
    project_id = uuid.uuid4()
    repo_id = uuid.uuid4()
    session = MagicMock()
    ctx = make_exec_ctx(job_type="parse", project_id=project_id, repo_id=repo_id)
    recorder = IndexingProgressRecorder(session, ctx)

    with patch.object(recorder._repo, "insert") as insert:
        recorder.record_started(file_count=3)

    assert insert.call_count == 1
    row = insert.call_args.args[0]
    assert row.repo_id == repo_id
    assert row.step == "parse"
    assert "3 source files" in row.message
