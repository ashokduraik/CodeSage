"""Tests for startup queue logging."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from config import Settings
from repositories.operations import FailedJobSummary
from services.indexing.startup_log import log_startup_queue_state


def _log_messages(mock_log_event: MagicMock) -> list[str]:
    return [call.args[2] for call in mock_log_event.call_args_list]


def test_log_startup_queue_state_empty() -> None:
    session = MagicMock()
    factory = MagicMock(return_value=session)
    jobs = MagicMock()
    jobs.reclaim_orphaned_running_jobs.return_value = 0
    jobs.reclaim_stale_running_jobs.return_value = 0
    jobs.summarize_pending.return_value = []
    jobs.count_by_status.return_value = 0

    with (
        patch("services.indexing.startup_log.JobRepository", return_value=jobs),
        patch("services.indexing.startup_log.log_event") as mock_log_event,
    ):
        log_startup_queue_state(Settings(repo_clone_dir="/tmp/repos", worker_idle_seconds=10), factory)

    messages = _log_messages(mock_log_event)
    assert any("Worker ready" in message for message in messages)
    assert any("clone directory /tmp/repos" in message for message in messages)
    assert any("Job queue: empty" in message for message in messages)
    jobs.reclaim_orphaned_running_jobs.assert_called_once()
    jobs.reclaim_stale_running_jobs.assert_called_once_with(600, 3)


def test_startup_log_reclaims_orphaned_before_pending_summary() -> None:
    session = MagicMock()
    factory = MagicMock(return_value=session)
    jobs = MagicMock()
    jobs.reclaim_orphaned_running_jobs.return_value = 2
    jobs.reclaim_stale_running_jobs.return_value = 0
    jobs.summarize_pending.return_value = []
    jobs.count_by_status.return_value = 0

    with (
        patch("services.indexing.startup_log.JobRepository", return_value=jobs),
        patch("services.indexing.startup_log.log_event") as mock_log_event,
    ):
        log_startup_queue_state(Settings(), factory)

    jobs.reclaim_orphaned_running_jobs.assert_called_once()
    jobs.reclaim_stale_running_jobs.assert_called_once()
    session.commit.assert_called_once()
    messages = _log_messages(mock_log_event)
    assert any("orphaned running job(s)" in message for message in messages)


def test_log_startup_queue_state_reclaims_stale_on_startup() -> None:
    session = MagicMock()
    factory = MagicMock(return_value=session)
    jobs = MagicMock()
    jobs.reclaim_orphaned_running_jobs.return_value = 0
    jobs.reclaim_stale_running_jobs.return_value = 1
    jobs.summarize_pending.return_value = [("sync", 1)]
    jobs.count_by_status.return_value = 0

    with (
        patch("services.indexing.startup_log.JobRepository", return_value=jobs),
        patch("services.indexing.startup_log.log_event") as mock_log_event,
    ):
        log_startup_queue_state(Settings(worker_stale_job_seconds=300), factory)

    jobs.reclaim_stale_running_jobs.assert_called_once_with(300, 3)
    session.commit.assert_called_once()
    messages = _log_messages(mock_log_event)
    assert any("Reclaimed 1 stale running job(s)" in message for message in messages)


def test_log_startup_queue_state_warns_on_failed() -> None:
    session = MagicMock()
    factory = MagicMock(return_value=session)
    jobs = MagicMock()
    jobs.reclaim_orphaned_running_jobs.return_value = 0
    jobs.reclaim_stale_running_jobs.return_value = 0
    jobs.summarize_pending.return_value = []
    jobs.count_by_status.side_effect = lambda status: 1 if status == "failed" else 0
    jobs.count_pending.return_value = 0
    jobs.latest_failed_summary.return_value = [
        FailedJobSummary(job_type="sync", error_message="clone failed", repo_id=None),
    ]

    with (
        patch("services.indexing.startup_log.JobRepository", return_value=jobs),
        patch("services.indexing.startup_log.log_event") as mock_log_event,
    ):
        log_startup_queue_state(Settings(), factory)

    messages = _log_messages(mock_log_event)
    assert any("failed" in message.lower() for message in messages)
