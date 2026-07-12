"""Tests for freshness poll orchestration."""

from __future__ import annotations

import uuid
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from config import Settings
from services.freshness.poll_repos import poll_stale_repos


def test_poll_stale_repos_skips_when_remote_matches(monkeypatch: pytest.MonkeyPatch) -> None:
    repo_id = uuid.uuid4()
    repo = SimpleNamespace(
        id=repo_id,
        project_id=uuid.uuid4(),
        repo_url="https://github.com/org/r.git",
        branch="main",
        token_enc=None,
        last_indexed_sha="abc123",
        last_indexed_at=object(),
    )
    repos = MagicMock()
    repos.list_indexed_active.return_value = [repo]
    jobs = MagicMock()
    jobs.has_active_indexing_job_for_repo.return_value = False

    list_session = MagicMock()
    repo_session = MagicMock()
    factory = MagicMock(side_effect=[list_session, repo_session])

    monkeypatch.setattr("services.freshness.poll_repos.RepoRepository", lambda _s: repos)
    monkeypatch.setattr("services.freshness.poll_repos.JobRepository", lambda _s: jobs)
    monkeypatch.setattr("services.freshness.poll_repos.ProjectRepository", lambda _s: MagicMock())
    monkeypatch.setattr(
        "services.freshness.poll_repos.resolve_remote_head",
        lambda **kwargs: "abc123",
    )

    assert poll_stale_repos(factory, Settings()) == 0
    jobs.enqueue.assert_not_called()


def test_poll_stale_repos_enqueues_when_remote_advanced(monkeypatch: pytest.MonkeyPatch) -> None:
    repo_id = uuid.uuid4()
    project_id = uuid.uuid4()
    repo = SimpleNamespace(
        id=repo_id,
        project_id=project_id,
        repo_url="https://github.com/org/r.git",
        branch="main",
        token_enc=None,
        last_indexed_sha="abc123",
        last_indexed_at=object(),
    )
    repos = MagicMock()
    repos.list_indexed_active.return_value = [repo]
    jobs = MagicMock()
    jobs.has_active_indexing_job_for_repo.return_value = False
    projects = MagicMock()

    list_session = MagicMock()
    repo_session = MagicMock()
    factory = MagicMock(side_effect=[list_session, repo_session])

    monkeypatch.setattr("services.freshness.poll_repos.RepoRepository", lambda _s: repos)
    monkeypatch.setattr("services.freshness.poll_repos.JobRepository", lambda _s: jobs)
    monkeypatch.setattr("services.freshness.poll_repos.ProjectRepository", lambda _s: projects)
    monkeypatch.setattr(
        "services.freshness.poll_repos.resolve_remote_head",
        lambda **kwargs: "def456",
    )

    assert poll_stale_repos(factory, Settings()) == 1
    repo_session.commit.assert_called_once()
    projects.update_status.assert_called_once()
    jobs.cancel_pending_jobs_for_repo.assert_called_once_with(repo_id)
    jobs.enqueue.assert_called_once_with(
        "sync",
        {
            "repoId": str(repo_id),
            "trigger": "cron_poll",
            "sinceSha": "abc123",
        },
    )


def test_poll_stale_repos_skips_active_indexing_job(monkeypatch: pytest.MonkeyPatch) -> None:
    repo = SimpleNamespace(
        id=uuid.uuid4(),
        project_id=uuid.uuid4(),
        repo_url="https://github.com/org/r.git",
        branch="main",
        token_enc=None,
        last_indexed_sha="abc123",
        last_indexed_at=object(),
    )
    repos = MagicMock()
    repos.list_indexed_active.return_value = [repo]
    jobs = MagicMock()
    jobs.has_active_indexing_job_for_repo.return_value = True

    list_session = MagicMock()
    repo_session = MagicMock()
    factory = MagicMock(side_effect=[list_session, repo_session])

    monkeypatch.setattr("services.freshness.poll_repos.RepoRepository", lambda _s: repos)
    monkeypatch.setattr("services.freshness.poll_repos.JobRepository", lambda _s: jobs)
    monkeypatch.setattr("services.freshness.poll_repos.ProjectRepository", lambda _s: MagicMock())

    assert poll_stale_repos(factory, Settings()) == 0
    jobs.enqueue.assert_not_called()


def test_poll_stale_repos_skips_repo_on_token_decrypt_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A bad token on one repo must not abort polling for other repos."""
    bad_repo_id = uuid.uuid4()
    good_repo_id = uuid.uuid4()
    bad_repo = SimpleNamespace(
        id=bad_repo_id,
        project_id=uuid.uuid4(),
        repo_url="https://github.com/org/bad.git",
        branch="main",
        token_enc=b"bad:cipher:tag",
        last_indexed_sha="abc123",
        last_indexed_at=object(),
    )
    good_repo = SimpleNamespace(
        id=good_repo_id,
        project_id=uuid.uuid4(),
        repo_url="https://github.com/org/good.git",
        branch="main",
        token_enc=None,
        last_indexed_sha="abc123",
        last_indexed_at=object(),
    )
    repos = MagicMock()
    repos.list_indexed_active.return_value = [bad_repo, good_repo]
    jobs = MagicMock()
    jobs.has_active_indexing_job_for_repo.return_value = False

    list_session = MagicMock()
    bad_session = MagicMock()
    good_session = MagicMock()
    factory = MagicMock(side_effect=[list_session, bad_session, good_session])

    monkeypatch.setattr("services.freshness.poll_repos.RepoRepository", lambda _s: repos)
    monkeypatch.setattr("services.freshness.poll_repos.JobRepository", lambda _s: jobs)
    monkeypatch.setattr("services.freshness.poll_repos.ProjectRepository", lambda _s: MagicMock())

    def fake_resolve_token(repo, _settings):
        if repo.id == bad_repo_id:
            raise ValueError("bad token")
        return None

    monkeypatch.setattr("services.freshness.poll_repos._resolve_repo_token", fake_resolve_token)
    monkeypatch.setattr(
        "services.freshness.poll_repos.resolve_remote_head",
        lambda **kwargs: "def456",
    )

    assert poll_stale_repos(factory, Settings()) == 1
    jobs.enqueue.assert_called_once()
    good_session.commit.assert_called_once()
