"""Tests for job and audit repositories."""

from __future__ import annotations

import uuid
from unittest.mock import MagicMock

from models.enums import JobStatus, RowStatus
from models import AuditLog, Job
from repositories.operations import AuditLogRepository, JobRepository, SUPERSEDED_JOB_MESSAGE


def test_job_enqueue() -> None:
    session = MagicMock()
    repo = JobRepository(session)
    job = repo.enqueue("sync", {"repoId": "x"})
    assert job.type == "sync"
    assert job.payload == {"repoId": "x"}
    assert job.job_status == JobStatus.PENDING
    session.add.assert_called_once()
    session.flush.assert_called_once()


def test_job_claim_next_empty() -> None:
    session = MagicMock()
    session.execute.return_value.first.return_value = None

    repo = JobRepository(session)
    assert repo.claim_next() is None


def test_job_claim_next_returns_job() -> None:
    session = MagicMock()
    job_id = uuid.uuid4()
    job = Job(type="sync", payload={})
    session.execute.return_value.first.return_value = (job_id,)
    session.get.return_value = job

    repo = JobRepository(session)
    assert repo.claim_next() is job
    session.get.assert_called_once_with(Job, job_id)


def test_job_mark_done_and_failed() -> None:
    session = MagicMock()
    job = Job(type="sync", payload={})
    session.get.return_value = job

    repo = JobRepository(session)
    assert repo.mark_done(job.id) is job
    assert job.job_status == JobStatus.DONE
    assert job.locked_at is None

    job.job_status = JobStatus.RUNNING
    assert repo.mark_failed(job.id) is job
    assert job.job_status == JobStatus.FAILED


def test_job_mark_missing() -> None:
    session = MagicMock()
    session.get.return_value = None
    repo = JobRepository(session)
    job_id = uuid.uuid4()
    assert repo.mark_done(job_id) is None
    assert repo.mark_failed(job_id) is None


def test_job_count_pending_and_summarize() -> None:
    session = MagicMock()
    session.scalar.return_value = 2
    session.execute.return_value = [("sync", 1), ("parse", 1)]

    repo = JobRepository(session)
    assert repo.count_pending() == 2
    assert repo.summarize_pending() == [("sync", 1), ("parse", 1)]


def test_job_count_by_status() -> None:
    session = MagicMock()
    session.scalar.return_value = 3
    repo = JobRepository(session)
    assert repo.count_by_status("failed") == 3


def test_job_reclaim_stale_running_jobs_returns_count() -> None:
    session = MagicMock()
    session.execute.return_value.fetchall.return_value = [(uuid.uuid4(),), (uuid.uuid4(),)]

    repo = JobRepository(session)
    count = repo.reclaim_stale_running_jobs(600, 3)

    assert count == 2
    session.execute.assert_called_once()
    sql = str(session.execute.call_args[0][0])
    assert "'failed'::job_status" in sql
    assert "'pending'::job_status" in sql
    params = session.execute.call_args[0][1]
    assert params["stale_seconds"] == 600
    assert params["max_attempts"] == 3


def test_job_reclaim_stale_running_jobs_empty() -> None:
    session = MagicMock()
    session.execute.return_value.fetchall.return_value = []

    repo = JobRepository(session)
    assert repo.reclaim_stale_running_jobs(600, 3) == 0


def test_reclaim_orphaned_running_jobs_resets_to_pending() -> None:
    session = MagicMock()
    session.execute.return_value.fetchall.return_value = [(uuid.uuid4(),)]

    repo = JobRepository(session)
    count = repo.reclaim_orphaned_running_jobs(3)

    assert count == 1
    sql = str(session.execute.call_args[0][0])
    assert "'pending'::job_status" in sql
    assert "job_status = 'running'" in sql
    assert session.execute.call_args[0][1]["max_attempts"] == 3


def test_mark_requeue_pending_returns_job_to_pending() -> None:
    session = MagicMock()
    job_id = uuid.uuid4()
    job = Job(id=job_id, type="sync", payload={}, job_status=JobStatus.RUNNING)
    session.get.return_value = job

    repo = JobRepository(session)
    updated = repo.mark_requeue_pending(job_id, error_message="temporary outage")

    assert updated is job
    assert job.job_status == JobStatus.PENDING
    assert job.locked_at is None
    assert job.error_message == "temporary outage"


def test_is_job_active_returns_false_when_superseded() -> None:
    session = MagicMock()
    job = Job(type="sync", payload={}, status=RowStatus.DELETED)
    session.get.return_value = job

    repo = JobRepository(session)
    assert repo.is_job_active(job.id) is False


def test_is_job_active_returns_true_for_active_row() -> None:
    session = MagicMock()
    job = Job(type="sync", payload={}, status=RowStatus.ACTIVE)
    session.get.return_value = job

    repo = JobRepository(session)
    assert repo.is_job_active(job.id) is True


def test_has_active_job_for_repo_matches_payload() -> None:
    repo_id = uuid.uuid4()
    session = MagicMock()
    job = Job(
        type="sync",
        payload={"repoId": str(repo_id)},
        status=RowStatus.ACTIVE,
        job_status=JobStatus.PENDING,
    )
    session.scalars.return_value = iter([job])

    repo = JobRepository(session)
    assert repo.has_active_job_for_repo("sync", repo_id) is True


def test_has_active_indexing_job_for_repo_checks_sync_parse_embed() -> None:
    repo_id = uuid.uuid4()
    session = MagicMock()
    embed_job = Job(
        type="embed",
        payload={"repoId": str(repo_id)},
        status=RowStatus.ACTIVE,
        job_status=JobStatus.RUNNING,
    )
    session.scalars.return_value = iter([embed_job])

    repo = JobRepository(session)
    assert repo.has_active_indexing_job_for_repo(repo_id) is True


def test_cancel_pending_jobs_for_repo_supersedes_rows() -> None:
    repo_id = uuid.uuid4()
    session = MagicMock()
    job = Job(
        type="sync",
        payload={"repoId": str(repo_id)},
        status=RowStatus.ACTIVE,
        job_status=JobStatus.PENDING,
    )
    session.scalars.return_value = iter([job])

    repo = JobRepository(session)
    assert repo.cancel_pending_jobs_for_repo(repo_id) == 1
    assert job.status == RowStatus.DELETED
    assert job.error_message == SUPERSEDED_JOB_MESSAGE


def test_audit_log_append_and_list() -> None:
    session = MagicMock()
    actor_id = uuid.uuid4()
    entry = AuditLog(actor_id=actor_id, action="repo.attach")
    session.scalars.return_value = iter([entry])

    repo = AuditLogRepository(session)
    created = repo.append(action="repo.attach", actor_id=actor_id, target="repo:1")
    assert created.action == "repo.attach"
    assert repo.list_by_actor(actor_id) == [entry]
