"""Tests for xrepo job enqueue helper."""

from __future__ import annotations

import uuid
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from services.indexing.xrepo_enqueue import maybe_enqueue_xrepo


def test_maybe_enqueue_xrepo_requires_multiple_repos() -> None:
    session = MagicMock()
    repos = MagicMock()
    repos.list_by_project.return_value = [SimpleNamespace(last_indexed_at=object())]
    with pytest.MonkeyPatch.context() as monkeypatch:
        monkeypatch.setattr("services.indexing.xrepo_enqueue.RepoRepository", lambda _s: repos)
        assert maybe_enqueue_xrepo(session, uuid.uuid4()) is False


def test_maybe_enqueue_xrepo_waits_for_all_repos_indexed() -> None:
    session = MagicMock()
    repos = MagicMock()
    repos.list_by_project.return_value = [
        SimpleNamespace(last_indexed_at=object()),
        SimpleNamespace(last_indexed_at=None),
    ]
    with pytest.MonkeyPatch.context() as monkeypatch:
        monkeypatch.setattr("services.indexing.xrepo_enqueue.RepoRepository", lambda _s: repos)
        assert maybe_enqueue_xrepo(session, uuid.uuid4()) is False


def test_maybe_enqueue_xrepo_enqueues_when_ready(monkeypatch: pytest.MonkeyPatch) -> None:
    project_id = uuid.uuid4()
    session = MagicMock()
    repos = MagicMock()
    repos.list_by_project.return_value = [
        SimpleNamespace(last_indexed_at=object()),
        SimpleNamespace(last_indexed_at=object()),
    ]
    jobs = MagicMock()
    jobs.has_active_job.return_value = False

    monkeypatch.setattr("services.indexing.xrepo_enqueue.RepoRepository", lambda _s: repos)
    monkeypatch.setattr("services.indexing.xrepo_enqueue.JobRepository", lambda _s: jobs)

    assert maybe_enqueue_xrepo(session, project_id) is True
    jobs.enqueue.assert_called_once_with("xrepo", {"projectId": str(project_id)})
