"""Tests for the Postgres job consumer loop."""

from __future__ import annotations

import threading
import uuid
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from config import Settings
from workers.consumer import process_next_job, run_job_consumer
from workers.handlers.dispatch import UnsupportedJobError


def test_process_next_job_returns_false_when_empty() -> None:
    session = MagicMock()
    factory = MagicMock(return_value=session)
    jobs = MagicMock()
    jobs.claim_next.return_value = None
    with patch("workers.consumer.JobRepository", lambda s: jobs):
        with patch("workers.consumer.build_job_handlers", lambda *a, **k: {}):
            assert process_next_job(factory, Settings()) is False


def test_process_next_job_runs_handler() -> None:
    job = SimpleNamespace(id=uuid.uuid4(), type="sync", payload={"repoId": "x"})
    claim_session = MagicMock()
    work_session = MagicMock()
    factory = MagicMock(side_effect=[claim_session, work_session])
    jobs_claim = MagicMock()
    jobs_claim.claim_next.return_value = job
    jobs_work = MagicMock()

    def job_repo(session: MagicMock) -> MagicMock:
        return jobs_claim if session is claim_session else jobs_work

    seen: list[dict] = []
    with patch("workers.consumer.JobRepository", job_repo):
        with patch(
            "workers.consumer.build_job_handlers",
            lambda *a, **k: {"sync": seen.append},
        ):
            assert process_next_job(factory, Settings()) is True
    jobs_work.mark_done.assert_called_once_with(job.id)


def test_process_next_job_marks_failed_on_error() -> None:
    job = SimpleNamespace(id=uuid.uuid4(), type="sync", payload={})
    claim_session = MagicMock()
    work_session = MagicMock()
    factory = MagicMock(side_effect=[claim_session, work_session])
    jobs_claim = MagicMock()
    jobs_claim.claim_next.return_value = job
    jobs_work = MagicMock()

    def job_repo(session: MagicMock) -> MagicMock:
        return jobs_claim if session is claim_session else jobs_work

    def boom(_payload: dict) -> None:
        raise RuntimeError("fail")

    with patch("workers.consumer.JobRepository", job_repo):
        with patch("workers.consumer.build_job_handlers", lambda *a, **k: {"sync": boom}):
            assert process_next_job(factory, Settings()) is True
    jobs_work.mark_failed.assert_called_once_with(job.id)


def test_process_next_job_marks_failed_for_unsupported_type() -> None:
    job = SimpleNamespace(id=uuid.uuid4(), type="distill", payload={})
    claim_session = MagicMock()
    work_session = MagicMock()
    factory = MagicMock(side_effect=[claim_session, work_session])
    jobs_claim = MagicMock()
    jobs_claim.claim_next.return_value = job
    jobs_work = MagicMock()

    def job_repo(session: MagicMock) -> MagicMock:
        return jobs_claim if session is claim_session else jobs_work

    with patch("workers.consumer.JobRepository", job_repo):
        with patch("workers.consumer.build_job_handlers", lambda *a, **k: {}):
            with patch(
                "workers.consumer.dispatch_job",
                MagicMock(side_effect=UnsupportedJobError("nope")),
            ):
                assert process_next_job(factory, Settings()) is True
    jobs_work.mark_failed.assert_called_once_with(job.id)


def test_run_job_consumer_stops_on_event() -> None:
    stop = threading.Event()
    stop.set()
    engine = MagicMock()
    with patch("workers.consumer.create_engine_from_settings", lambda s: engine):
        with patch("workers.consumer.create_session_factory", lambda e: MagicMock()):
            run_job_consumer(Settings(worker_idle_seconds=0.01), stop)
    engine.dispose.assert_called_once()
