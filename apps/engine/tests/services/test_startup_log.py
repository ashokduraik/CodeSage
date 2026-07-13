"""Tests for startup queue logging."""

from __future__ import annotations

import re
from unittest.mock import MagicMock, patch

from config import Settings
from services.indexing.startup_log import log_startup_queue_state

_FAILED_STARTUP_RE = re.compile(r"Job queue: \d+ failed|Job queue failure")


def _log_messages(mock_log_event: MagicMock) -> list[str]:
    return [call.args[2] for call in mock_log_event.call_args_list]


def _has_failed_startup_warning(messages: list[str]) -> bool:
    return any(_FAILED_STARTUP_RE.search(message) for message in messages)


def test_log_startup_queue_state_empty() -> None:
    session = MagicMock()
    factory = MagicMock(return_value=session)
    jobs = MagicMock()
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
    jobs.reclaim_stale_running_jobs.assert_called_once_with(600, 3)


def test_startup_log_reclaims_stale_before_pending_summary() -> None:
    session = MagicMock()
    factory = MagicMock(return_value=session)
    jobs = MagicMock()
    jobs.reclaim_stale_running_jobs.return_value = 2
    jobs.summarize_pending.return_value = []
    jobs.count_by_status.return_value = 0

    with (
        patch("services.indexing.startup_log.JobRepository", return_value=jobs),
        patch("services.indexing.startup_log.log_event") as mock_log_event,
    ):
        log_startup_queue_state(Settings(), factory)

    jobs.reclaim_stale_running_jobs.assert_called_once()
    session.commit.assert_called_once()
    messages = _log_messages(mock_log_event)
    assert any("Reclaimed 2 stale running job(s)" in message for message in messages)


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


def test_log_startup_queue_state_warns_on_running() -> None:
    session = MagicMock()
    factory = MagicMock(return_value=session)
    jobs = MagicMock()
    jobs.reclaim_stale_running_jobs.return_value = 0
    jobs.summarize_pending.return_value = []
    jobs.count_by_status.side_effect = lambda status: 2 if status == "running" else 0

    with (
        patch("services.indexing.startup_log.JobRepository", return_value=jobs),
        patch("services.indexing.startup_log.log_event") as mock_log_event,
    ):
        log_startup_queue_state(Settings(), factory)

    messages = _log_messages(mock_log_event)
    assert any("2 running" in message for message in messages)
    assert not _has_failed_startup_warning(messages)


def test_log_startup_queue_state_does_not_warn_on_failed_jobs() -> None:
    """Failed jobs are not surfaced at startup — they already failed in the worker."""
    session = MagicMock()
    factory = MagicMock(return_value=session)
    jobs = MagicMock()
    jobs.reclaim_stale_running_jobs.return_value = 0
    jobs.summarize_pending.return_value = []
    jobs.count_by_status.return_value = 0

    with (
        patch("services.indexing.startup_log.JobRepository", return_value=jobs),
        patch("services.indexing.startup_log.log_event") as mock_log_event,
    ):
        log_startup_queue_state(Settings(), factory)

    messages = _log_messages(mock_log_event)
    assert not _has_failed_startup_warning(messages)
