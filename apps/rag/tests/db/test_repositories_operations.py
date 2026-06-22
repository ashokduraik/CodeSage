"""Tests for job and audit repositories."""

from __future__ import annotations

import uuid
from unittest.mock import MagicMock

from models.enums import JobStatus
from models import AuditLog, Job
from repositories.operations import AuditLogRepository, JobRepository


def test_job_enqueue() -> None:
    session = MagicMock()
    repo = JobRepository(session)
    job = repo.enqueue("sync", {"repoId": "x"})
    assert job.type == "sync"
    assert job.payload == {"repoId": "x"}
    assert job.status == JobStatus.PENDING
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
    assert job.status == JobStatus.DONE
    assert job.locked_at is None

    job.status = JobStatus.RUNNING
    assert repo.mark_failed(job.id) is job
    assert job.status == JobStatus.FAILED


def test_job_mark_missing() -> None:
    session = MagicMock()
    session.get.return_value = None
    repo = JobRepository(session)
    job_id = uuid.uuid4()
    assert repo.mark_done(job_id) is None
    assert repo.mark_failed(job_id) is None


def test_audit_log_append_and_list() -> None:
    session = MagicMock()
    actor_id = uuid.uuid4()
    entry = AuditLog(actor_id=actor_id, action="repo.attach")
    session.scalars.return_value = iter([entry])

    repo = AuditLogRepository(session)
    created = repo.append(action="repo.attach", actor_id=actor_id, target="repo:1")
    assert created.action == "repo.attach"
    assert repo.list_by_actor(actor_id) == [entry]
