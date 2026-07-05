"""Tests for sync job orchestration."""

from __future__ import annotations

import logging
import uuid
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from config import Settings
from config.logging import INDEXING_LOGGER_NAME, configure_logging
from services.sync.git_ops import GitSyncResult
from services.sync.run_sync import create_sync_handler, handle_sync_job
from tests.helpers import make_exec_ctx


@pytest.fixture(autouse=True)
def _indexing_logs(caplog: pytest.LogCaptureFixture) -> None:
    configure_logging(Settings(log_level="info"))
    caplog.set_level(logging.INFO, logger=INDEXING_LOGGER_NAME)


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
        handle_sync_job(session, Settings(), {}, make_exec_ctx())


def test_handle_sync_job_missing_repo() -> None:
    session = MagicMock()
    session.get.return_value = None
    with patch("services.sync.run_sync.RepoRepository") as repo_cls:
        repo_cls.return_value.get_by_id.return_value = None
        with pytest.raises(ValueError, match="Repo not found"):
            handle_sync_job(
                session,
                Settings(),
                {"repoId": str(uuid.uuid4())},
                make_exec_ctx(repo_id=uuid.uuid4()),
            )


def test_handle_sync_job_enqueues_parse(monkeypatch, caplog: pytest.LogCaptureFixture) -> None:
    session = MagicMock()
    repo_id = uuid.uuid4()
    project_id = uuid.uuid4()
    repo = _repo(repo_id, project_id)

    mock_repos = MagicMock()
    mock_repos.get_by_id.return_value = repo
    mock_projects = MagicMock()
    mock_projects.get_by_id.return_value = SimpleNamespace(id=project_id, name="My App")
    mock_jobs = MagicMock()
    mock_jobs.is_job_active.return_value = True

    monkeypatch.setattr("services.sync.run_sync.RepoRepository", lambda s: mock_repos)
    monkeypatch.setattr("services.sync.run_sync.ProjectRepository", lambda s: mock_projects)
    monkeypatch.setattr("services.sync.run_sync.JobRepository", lambda s: mock_jobs)
    monkeypatch.setattr(
        "services.sync.run_sync.sync_repository",
        lambda **kwargs: GitSyncResult(head_sha="abc", changed_files=["src/a.ts"]),
    )
    from services.sync.paths import FileScanResult

    monkeypatch.setattr(
        "services.sync.run_sync.scan_indexable_files",
        lambda worktree, max_bytes: FileScanResult(paths=["src/a.ts"], skipped_large_count=0),
    )
    monkeypatch.setattr(
        "services.sync.run_sync.resolve_indexing_context",
        lambda session, rid: __import__(
            "config.logging",
            fromlist=["IndexingContext"],
        ).IndexingContext(
            project_name="My App",
            repo_label="github.com/org/r",
            branch="main",
        ),
    )

    handle_sync_job(
        session,
        Settings(repo_clone_dir="/tmp"),
        {"repoId": str(repo_id)},
        make_exec_ctx(job_type="sync", repo_id=repo_id, project_id=project_id),
    )
    mock_repos.update_head_sha.assert_not_called()
    mock_repos.update_connection_status.assert_called_once()
    mock_jobs.enqueue.assert_called_once()
    assert mock_jobs.enqueue.call_args[0][0] == "parse"
    assert "Step 1/3 started" in caplog.text
    assert "Queued Step 2/3" in caplog.text
    assert "github.com/org/r" in caplog.text


def test_handle_sync_job_skips_parse_enqueue_when_superseded(monkeypatch) -> None:
    session = MagicMock()
    repo_id = uuid.uuid4()
    repo = _repo(repo_id, uuid.uuid4())
    mock_repos = MagicMock()
    mock_repos.get_by_id.return_value = repo
    mock_jobs = MagicMock()
    mock_jobs.is_job_active.return_value = False

    monkeypatch.setattr("services.sync.run_sync.RepoRepository", lambda s: mock_repos)
    monkeypatch.setattr("services.sync.run_sync.ProjectRepository", lambda s: MagicMock())
    monkeypatch.setattr("services.sync.run_sync.JobRepository", lambda s: mock_jobs)
    monkeypatch.setattr(
        "services.sync.run_sync.sync_repository",
        lambda **kwargs: GitSyncResult(head_sha="abc", changed_files=["src/a.ts"]),
    )
    from services.sync.paths import FileScanResult

    monkeypatch.setattr(
        "services.sync.run_sync.scan_indexable_files",
        lambda worktree, max_bytes: FileScanResult(paths=["src/a.ts"], skipped_large_count=0),
    )
    monkeypatch.setattr("services.sync.run_sync.resolve_indexing_context", lambda session, rid: None)

    handle_sync_job(
        session,
        Settings(repo_clone_dir="/tmp"),
        {"repoId": str(repo_id)},
        make_exec_ctx(job_type="sync", repo_id=repo_id, project_id=repo.project_id),
    )
    mock_jobs.enqueue.assert_not_called()


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

    handle_sync_job(
        session,
        Settings(),
        {"repoId": str(repo_id)},
        make_exec_ctx(repo_id=repo_id, project_id=repo.project_id),
    )
    mock_jobs.enqueue.assert_not_called()


def test_handle_sync_job_sets_error_status_on_failure(monkeypatch, caplog: pytest.LogCaptureFixture) -> None:
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
        lambda **kwargs: (_ for _ in ()).throw(
            RuntimeError("auth failed https://ghp_badtoken@github.com/private/org"),
        ),
    )

    with pytest.raises(RuntimeError):
        handle_sync_job(
        session,
        Settings(),
        {"repoId": str(repo_id)},
        make_exec_ctx(repo_id=repo_id, project_id=repo.project_id),
    )
    mock_repos.update_connection_status.assert_called_once()
    assert "Step 1/3 failed" in caplog.text
    assert "ghp_" not in caplog.text


def test_create_sync_handler_delegates_to_handle_sync_job(monkeypatch) -> None:
    session = MagicMock()
    factory = MagicMock(return_value=session)
    called: list[tuple] = []

    def _capture(*args: object, **kwargs: object) -> None:
        called.append((args, kwargs))

    monkeypatch.setattr("services.sync.run_sync.handle_sync_job", _capture)
    handler = create_sync_handler(Settings(), factory)
    payload = {"repoId": str(uuid.uuid4())}
    ctx = make_exec_ctx()
    handler(payload, ctx, session)
    assert called
    assert called[0][0][2] == payload
