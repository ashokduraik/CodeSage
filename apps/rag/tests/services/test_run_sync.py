"""Tests for sync job orchestration."""

from __future__ import annotations

import uuid
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from config import Settings
from services.sync.git_ops import GitSyncResult
from services.sync.run_sync import create_sync_handler, handle_sync_job


def _repo(repo_id: uuid.UUID, project_id: uuid.UUID) -> SimpleNamespace:
    return SimpleNamespace(
        id=repo_id,
        project_id=project_id,
        repo_url="https://github.com/org/r.git",
        branch="main",
        last_indexed_sha=None,
        token_enc=None,
    )


def test_handle_sync_job_requires_repo_id() -> None:
    session = MagicMock()
    with pytest.raises(ValueError, match="repoId"):
        handle_sync_job(session, Settings(), {})


def test_handle_sync_job_missing_repo() -> None:
    session = MagicMock()
    session.get.return_value = None
    with patch("services.sync.run_sync.RepoRepository") as repo_cls:
        repo_cls.return_value.get_by_id.return_value = None
        with pytest.raises(ValueError, match="Repo not found"):
            handle_sync_job(session, Settings(), {"repoId": str(uuid.uuid4())})


def test_handle_sync_job_enqueues_parse(monkeypatch) -> None:
    session = MagicMock()
    repo_id = uuid.uuid4()
    project_id = uuid.uuid4()
    repo = _repo(repo_id, project_id)

    mock_repos = MagicMock()
    mock_repos.get_by_id.return_value = repo
    mock_projects = MagicMock()
    mock_projects.get_by_id.return_value = SimpleNamespace(id=project_id)
    mock_jobs = MagicMock()

    monkeypatch.setattr("services.sync.run_sync.RepoRepository", lambda s: mock_repos)
    monkeypatch.setattr("services.sync.run_sync.ProjectRepository", lambda s: mock_projects)
    monkeypatch.setattr("services.sync.run_sync.JobRepository", lambda s: mock_jobs)
    monkeypatch.setattr(
        "services.sync.run_sync.sync_repository",
        lambda **kwargs: GitSyncResult(head_sha="abc", changed_files=["src/a.ts"]),
    )
    monkeypatch.setattr(
        "services.sync.run_sync.list_indexable_files",
        lambda worktree, max_bytes: ["src/a.ts"],
    )

    handle_sync_job(session, Settings(repo_clone_dir="/tmp"), {"repoId": str(repo_id)})
    mock_repos.update_head_sha.assert_called_once_with(repo_id, "abc")
    mock_repos.update_connection_status.assert_called_once()
    mock_jobs.enqueue.assert_called_once()
    assert mock_jobs.enqueue.call_args[0][0] == "parse"


def test_handle_sync_job_skips_parse_when_no_changes(monkeypatch) -> None:
    session = MagicMock()
    repo_id = uuid.uuid4()
    repo = _repo(repo_id, uuid.uuid4())
    mock_repos = MagicMock()
    mock_repos.get_by_id.return_value = repo
    mock_jobs = MagicMock()

    monkeypatch.setattr("services.sync.run_sync.RepoRepository", lambda s: mock_repos)
    monkeypatch.setattr("services.sync.run_sync.ProjectRepository", lambda s: MagicMock())
    monkeypatch.setattr("services.sync.run_sync.JobRepository", lambda s: mock_jobs)
    monkeypatch.setattr(
        "services.sync.run_sync.sync_repository",
        lambda **kwargs: GitSyncResult(head_sha="abc", changed_files=[]),
    )

    handle_sync_job(session, Settings(), {"repoId": str(repo_id)})
    mock_jobs.enqueue.assert_not_called()


def test_handle_sync_job_sets_error_status_on_failure(monkeypatch) -> None:
    session = MagicMock()
    repo_id = uuid.uuid4()
    repo = _repo(repo_id, uuid.uuid4())
    mock_repos = MagicMock()
    mock_repos.get_by_id.return_value = repo

    monkeypatch.setattr("services.sync.run_sync.RepoRepository", lambda s: mock_repos)
    monkeypatch.setattr("services.sync.run_sync.ProjectRepository", lambda s: MagicMock())
    monkeypatch.setattr("services.sync.run_sync.JobRepository", lambda s: MagicMock())
    monkeypatch.setattr(
        "services.sync.run_sync.sync_repository",
        lambda **kwargs: (_ for _ in ()).throw(RuntimeError("git failed")),
    )

    with pytest.raises(RuntimeError, match="git failed"):
        handle_sync_job(session, Settings(), {"repoId": str(repo_id)})
    mock_repos.update_connection_status.assert_called_once()


def test_create_sync_handler_commits_and_rolls_back(monkeypatch) -> None:
    session = MagicMock()
    factory = MagicMock(return_value=session)
    monkeypatch.setattr(
        "services.sync.run_sync.handle_sync_job",
        lambda *a, **k: (_ for _ in ()).throw(RuntimeError("fail")),
    )
    handler = create_sync_handler(Settings(), factory)
    with pytest.raises(RuntimeError):
        handler({"repoId": str(uuid.uuid4())})
    session.rollback.assert_called_once()
    session.close.assert_called_once()
