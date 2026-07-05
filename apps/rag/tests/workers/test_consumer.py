"""Tests for the Postgres job consumer loop."""

from __future__ import annotations

import logging
import threading
import uuid
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from config import Settings
from config.logging import INDEXING_LOGGER_NAME, IndexingContext, configure_logging
from workers.consumer import process_next_job, run_job_consumer
from workers.handlers.dispatch import UnsupportedJobError


@pytest.fixture(autouse=True)
def _indexing_logs(caplog: pytest.LogCaptureFixture) -> None:
    configure_logging(Settings(log_level="info"))
    caplog.set_level(logging.INFO, logger=INDEXING_LOGGER_NAME)


def test_process_next_job_returns_false_when_empty() -> None:
    session = MagicMock()
    factory = MagicMock(return_value=session)
    jobs = MagicMock()
    jobs.reclaim_orphaned_running_jobs.return_value = 0
    jobs.reclaim_stale_running_jobs.return_value = 0
    jobs.claim_next.return_value = None
    with patch("workers.consumer.JobRepository", lambda s: jobs):
        with patch("workers.consumer.build_job_handlers", lambda *a, **k: {}):
            assert process_next_job(factory, Settings()) is False


def test_process_next_job_runs_handler(caplog: pytest.LogCaptureFixture) -> None:
    job = SimpleNamespace(
        id=uuid.uuid4(),
        type="sync",
        payload={"repoId": str(uuid.uuid4())},
        created_by=uuid.uuid4(),
    )
    claim_session = MagicMock()
    work_session = MagicMock()
    factory = MagicMock(side_effect=[claim_session, work_session])
    jobs_claim = MagicMock()
    jobs_claim.reclaim_orphaned_running_jobs.return_value = 0
    jobs_claim.reclaim_stale_running_jobs.return_value = 0
    jobs_claim.claim_next.return_value = job
    jobs_work = MagicMock()
    jobs_work.is_job_active.return_value = True
    ctx = IndexingContext(
        project_name="My App",
        repo_label="github.com/org/repo",
        branch="main",
    )

    def job_repo(session: MagicMock) -> MagicMock:
        return jobs_claim if session is claim_session else jobs_work

    def handler(payload: dict, exec_ctx: object, session: MagicMock) -> None:
        exec_ctx.step_completed = True

    with patch("workers.consumer.JobRepository", job_repo):
        with patch(
            "workers.consumer.build_job_handlers",
            lambda *a, **k: {"sync": handler},
        ):
            with patch("workers.consumer.resolve_indexing_context", return_value=ctx):
                with patch(
                    "workers.consumer._project_id_for_repo",
                    return_value=uuid.uuid4(),
                ):
                    assert process_next_job(factory, Settings()) is True
    jobs_work.mark_done.assert_called_once_with(job.id)
    assert "Job claimed" in caplog.text
    assert "Job finished" in caplog.text
    assert "github.com/org/repo" in caplog.text


def test_process_next_job_marks_failed_on_error(caplog: pytest.LogCaptureFixture) -> None:
    job = SimpleNamespace(
        id=uuid.uuid4(),
        type="embed",
        payload={"repoId": str(uuid.uuid4())},
        created_by=uuid.uuid4(),
    )
    claim_session = MagicMock()
    work_session = MagicMock()
    factory = MagicMock(side_effect=[claim_session, work_session])
    jobs_claim = MagicMock()
    jobs_claim.reclaim_orphaned_running_jobs.return_value = 0
    jobs_claim.reclaim_stale_running_jobs.return_value = 0
    jobs_claim.claim_next.return_value = job
    jobs_work = MagicMock()
    jobs_work.is_job_active.return_value = True

    def job_repo(session: MagicMock) -> MagicMock:
        return jobs_claim if session is claim_session else jobs_work

    def boom(_payload: dict, _ctx: object, _session: MagicMock) -> None:
        raise RuntimeError("getaddrinfo failed")

    with patch("workers.consumer.JobRepository", job_repo):
        with patch("workers.consumer.build_job_handlers", lambda *a, **k: {"embed": boom}):
            with patch("workers.consumer.resolve_indexing_context", return_value=None):
                with patch(
                    "workers.consumer._project_id_for_repo",
                    return_value=uuid.uuid4(),
                ):
                    with patch("workers.consumer.mark_repo_indexing_failed") as mark_failed:
                        assert process_next_job(
                            factory,
                            Settings(tei_base_url="http://tei:8080"),
                        ) is True
    work_session.rollback.assert_called()
    mark_failed.assert_called_once()
    assert "Job failed" in caplog.text
    assert "embed" in caplog.text


def test_process_next_job_marks_failed_for_unsupported_type() -> None:
    job = SimpleNamespace(
        id=uuid.uuid4(),
        type="distill",
        payload={},
        created_by=uuid.uuid4(),
    )
    claim_session = MagicMock()
    work_session = MagicMock()
    factory = MagicMock(side_effect=[claim_session, work_session])
    jobs_claim = MagicMock()
    jobs_claim.reclaim_orphaned_running_jobs.return_value = 0
    jobs_claim.reclaim_stale_running_jobs.return_value = 0
    jobs_claim.claim_next.return_value = job
    jobs_work = MagicMock()
    jobs_work.is_job_active.return_value = True

    def job_repo(session: MagicMock) -> MagicMock:
        return jobs_claim if session is claim_session else jobs_work

    with patch("workers.consumer.JobRepository", job_repo):
        with patch("workers.consumer.build_job_handlers", lambda *a, **k: {}):
            with patch(
                "workers.consumer.dispatch_job",
                MagicMock(side_effect=UnsupportedJobError("nope")),
            ):
                assert process_next_job(factory, Settings()) is True
    jobs_work.mark_failed.assert_called_once_with(job.id, error_message="Unsupported job type")


def test_run_job_consumer_stops_on_event() -> None:
    stop = threading.Event()
    stop.set()
    engine = MagicMock()
    with patch("workers.consumer.create_engine_from_settings", lambda s: engine):
        with patch("workers.consumer.create_session_factory", lambda e: MagicMock()):
            run_job_consumer(Settings(worker_idle_seconds=0.01), stop)
    engine.dispose.assert_called_once()


def test_process_next_job_reclaims_orphaned_before_claim(caplog: pytest.LogCaptureFixture) -> None:
    session = MagicMock()
    factory = MagicMock(return_value=session)
    jobs = MagicMock()
    jobs.reclaim_orphaned_running_jobs.return_value = 1
    jobs.reclaim_stale_running_jobs.return_value = 0
    jobs.claim_next.return_value = None

    with patch("workers.consumer.JobRepository", lambda s: jobs):
        with patch("workers.consumer.build_job_handlers", lambda *a, **k: {}):
            assert process_next_job(factory, Settings()) is False

    jobs.reclaim_orphaned_running_jobs.assert_called_once()
    jobs.reclaim_stale_running_jobs.assert_called_once_with(600, 3)
    session.commit.assert_called()
    assert "orphaned running job(s)" in caplog.text


def test_process_next_job_reclaims_stale_before_claim(caplog: pytest.LogCaptureFixture) -> None:
    session = MagicMock()
    factory = MagicMock(return_value=session)
    jobs = MagicMock()
    jobs.reclaim_orphaned_running_jobs.return_value = 0
    jobs.reclaim_stale_running_jobs.return_value = 2
    jobs.claim_next.return_value = None

    with patch("workers.consumer.JobRepository", lambda s: jobs):
        with patch("workers.consumer.build_job_handlers", lambda *a, **k: {}):
            assert process_next_job(factory, Settings(worker_stale_job_seconds=600)) is False

    jobs.reclaim_stale_running_jobs.assert_called_once_with(600, 3)
    session.commit.assert_called()
    assert "Reclaimed 2 stale running job(s)" in caplog.text


def test_process_next_job_skips_mark_done_when_job_superseded(
    caplog: pytest.LogCaptureFixture,
) -> None:
    job = SimpleNamespace(
        id=uuid.uuid4(),
        type="sync",
        payload={"repoId": str(uuid.uuid4())},
        created_by=uuid.uuid4(),
    )
    claim_session = MagicMock()
    work_session = MagicMock()
    factory = MagicMock(side_effect=[claim_session, work_session])
    jobs_claim = MagicMock()
    jobs_claim.reclaim_orphaned_running_jobs.return_value = 0
    jobs_claim.reclaim_orphaned_running_jobs.return_value = 0
    jobs_claim.reclaim_stale_running_jobs.return_value = 0
    jobs_claim.claim_next.return_value = job
    jobs_work = MagicMock()
    jobs_work.is_job_active.return_value = True
    jobs_work.is_job_active.return_value = False

    def job_repo(session: MagicMock) -> MagicMock:
        return jobs_claim if session is claim_session else jobs_work

    def handler(_payload: dict, exec_ctx: object, _session: MagicMock) -> None:
        exec_ctx.step_completed = True

    with patch("workers.consumer.JobRepository", job_repo):
        with patch(
            "workers.consumer.build_job_handlers",
            lambda *a, **k: {"sync": handler},
        ):
            with patch("workers.consumer.resolve_indexing_context", return_value=None):
                with patch(
                    "workers.consumer._project_id_for_repo",
                    return_value=uuid.uuid4(),
                ):
                    assert process_next_job(factory, Settings()) is True

    jobs_work.mark_done.assert_called_once_with(job.id)
    assert "superseded" in caplog.text


def test_process_next_job_claims_second_repo_after_first_fails() -> None:
    repo1 = uuid.uuid4()
    repo2 = uuid.uuid4()
    job1 = SimpleNamespace(
        id=uuid.uuid4(),
        type="embed",
        payload={"repoId": str(repo1)},
        created_by=uuid.uuid4(),
    )
    job2 = SimpleNamespace(
        id=uuid.uuid4(),
        type="sync",
        payload={"repoId": str(repo2)},
        created_by=uuid.uuid4(),
    )

    def run_once(job: SimpleNamespace, *, fail: bool) -> None:
        claim_session = MagicMock()
        work_session = MagicMock()
        factory = MagicMock(side_effect=[claim_session, work_session])
        jobs_claim = MagicMock()
        jobs_claim.reclaim_orphaned_running_jobs.return_value = 0
        jobs_claim.reclaim_stale_running_jobs.return_value = 0
        jobs_claim.claim_next.return_value = job
        jobs_work = MagicMock()

        def job_repo(session: MagicMock) -> MagicMock:
            return jobs_claim if session is claim_session else jobs_work

        if fail:

            def boom(_payload: dict, _ctx: object, _session: MagicMock) -> None:
                raise RuntimeError("embed failed")

            handlers = {"embed": boom}
        else:

            def ok(_payload: dict, exec_ctx: object, _session: MagicMock) -> None:
                exec_ctx.step_completed = True

            handlers = {"sync": ok}

        with patch("workers.consumer.JobRepository", job_repo):
            with patch("workers.consumer.build_job_handlers", lambda *a, **k: handlers):
                with patch("workers.consumer.resolve_indexing_context", return_value=None):
                    with patch(
                        "workers.consumer._project_id_for_repo",
                        return_value=uuid.uuid4(),
                    ):
                        with patch("workers.consumer.mark_repo_indexing_failed"):
                            assert process_next_job(factory, Settings()) is True

        if fail:
            jobs_work.mark_failed.assert_called_once()
        else:
            jobs_work.is_job_active.return_value = True
            jobs_work.mark_done.assert_called_once_with(job.id)

    run_once(job1, fail=True)
    run_once(job2, fail=False)


def test_handle_job_failure_commits_even_when_record_failed_raises() -> None:
    job = SimpleNamespace(
        id=uuid.uuid4(),
        type="embed",
        payload={"repoId": str(uuid.uuid4())},
        created_by=uuid.uuid4(),
    )
    claim_session = MagicMock()
    work_session = MagicMock()
    factory = MagicMock(side_effect=[claim_session, work_session])
    jobs_claim = MagicMock()
    jobs_claim.reclaim_orphaned_running_jobs.return_value = 0
    jobs_claim.reclaim_stale_running_jobs.return_value = 0
    jobs_claim.claim_next.return_value = job
    jobs_work = MagicMock()
    jobs_work.is_job_active.return_value = True
    recorder = MagicMock()
    recorder.record_failed.side_effect = RuntimeError("db write failed")

    def job_repo(session: MagicMock) -> MagicMock:
        return jobs_claim if session is claim_session else jobs_work

    def boom(_payload: dict, _ctx: object, _session: MagicMock) -> None:
        raise RuntimeError("handler failed")

    with patch("workers.consumer.JobRepository", job_repo):
        with patch("workers.consumer.build_job_handlers", lambda *a, **k: {"embed": boom}):
            with patch("workers.consumer.resolve_indexing_context", return_value=None):
                with patch(
                    "workers.consumer._project_id_for_repo",
                    return_value=uuid.uuid4(),
                ):
                    with patch("workers.consumer.mark_repo_indexing_failed"):
                        with patch(
                            "workers.consumer.IndexingProgressRecorder",
                            return_value=recorder,
                        ):
                            assert process_next_job(factory, Settings()) is True

    jobs_work.mark_failed.assert_called_once()
    assert work_session.commit.call_count >= 1
