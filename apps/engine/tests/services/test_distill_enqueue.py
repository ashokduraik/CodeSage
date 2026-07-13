"""Tests for distill job enqueue helpers."""

from __future__ import annotations

import uuid
from unittest.mock import MagicMock, patch

from services.indexing.distill_enqueue import maybe_enqueue_distill


def test_maybe_enqueue_distill_skips_when_repos_not_indexed() -> None:
    session = MagicMock()
    repo = MagicMock(last_indexed_at=None)
    with patch("services.indexing.distill_enqueue.RepoRepository") as repo_cls:
        repo_cls.return_value.list_by_project.return_value = [repo]
        assert maybe_enqueue_distill(session, uuid.uuid4()) is False


def test_maybe_enqueue_distill_enqueues_when_ready() -> None:
    session = MagicMock()
    project_id = uuid.uuid4()
    repo = MagicMock(last_indexed_at=object())
    jobs = MagicMock()
    jobs.has_active_job.return_value = False

    with patch("services.indexing.distill_enqueue.RepoRepository") as repo_cls:
        repo_cls.return_value.list_by_project.return_value = [repo]
        with patch("services.indexing.distill_enqueue.JobRepository", return_value=jobs):
            assert maybe_enqueue_distill(session, project_id) is True
            jobs.enqueue.assert_called_once_with(
                "distill",
                {"projectId": str(project_id)},
            )


def test_maybe_enqueue_distill_dedupes_active_job() -> None:
    session = MagicMock()
    project_id = uuid.uuid4()
    repo = MagicMock(last_indexed_at=object())
    jobs = MagicMock()
    jobs.has_active_job.return_value = True

    with patch("services.indexing.distill_enqueue.RepoRepository") as repo_cls:
        repo_cls.return_value.list_by_project.return_value = [repo]
        with patch("services.indexing.distill_enqueue.JobRepository", return_value=jobs):
            assert maybe_enqueue_distill(session, project_id) is False
            jobs.enqueue.assert_not_called()


def test_maybe_enqueue_distill_after_file_changes_enqueues_stale_ids() -> None:
    from services.indexing.distill_enqueue import maybe_enqueue_distill_after_file_changes

    session = MagicMock()
    project_id = uuid.uuid4()
    stale_id = uuid.uuid4()
    derived = MagicMock()
    derived.mark_stale_by_files.return_value = 1
    derived.get_stale_ids.return_value = [stale_id]
    repo = MagicMock(last_indexed_at=object())
    jobs = MagicMock()
    jobs.has_active_job.return_value = False

    with patch("services.indexing.distill_enqueue.DerivedKnowledgeRepository", return_value=derived):
        with patch("services.indexing.distill_enqueue.RepoRepository") as repo_cls:
            repo_cls.return_value.list_by_project.return_value = [repo]
            with patch("services.indexing.distill_enqueue.JobRepository", return_value=jobs):
                assert maybe_enqueue_distill_after_file_changes(
                    session,
                    project_id,
                    ["src/auth.ts"],
                ) is True
                jobs.enqueue.assert_called_once_with(
                    "distill",
                    {
                        "projectId": str(project_id),
                        "staleArtifactIds": [str(stale_id)],
                    },
                )
