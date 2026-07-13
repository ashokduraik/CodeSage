"""Tests for repo_cleanup job handler."""

from __future__ import annotations

import uuid
from pathlib import Path
from unittest.mock import MagicMock

import pytest

from config import Settings
from services.indexing.job_context import JobExecutionContext
from services.sync.run_cleanup import handle_repo_cleanup_job


def test_handle_repo_cleanup_job_removes_clone(tmp_path: Path) -> None:
    repo_id = uuid.uuid4()
    worktree = tmp_path / str(repo_id)
    worktree.mkdir()
    (worktree / "README.md").write_text("hello", encoding="utf-8")

    settings = Settings(database_url="postgresql://user:pass@localhost/db", repo_clone_dir=str(tmp_path))
    session = MagicMock()
    exec_ctx = JobExecutionContext(
        job_id=uuid.uuid4(),
        job_type="repo_cleanup",
        run_id=uuid.uuid4(),
        trigger=None,
        project_id=None,
        repo_id=repo_id,
        indexing_ctx=None,
        job_created_by=None,
    )

    handle_repo_cleanup_job(
        session,
        settings,
        {"repoId": str(repo_id), "reason": "repo_detach"},
        exec_ctx,
    )

    assert not worktree.exists()


def test_handle_repo_cleanup_job_requires_repo_id() -> None:
    settings = Settings(database_url="postgresql://user:pass@localhost/db", repo_clone_dir="/tmp")
    with pytest.raises(ValueError, match="repoId"):
        handle_repo_cleanup_job(
            MagicMock(),
            settings,
            {},
            JobExecutionContext(
                job_id=uuid.uuid4(),
                job_type="repo_cleanup",
                run_id=uuid.uuid4(),
                trigger=None,
                project_id=None,
                repo_id=None,
                indexing_ctx=None,
                job_created_by=None,
            ),
        )
