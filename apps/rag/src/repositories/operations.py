"""Repositories for jobs and audit log tables."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from models.enums import JobStatus
from models import AuditLog, Job


class JobRepository:
    """Data access for the Postgres-backed job queue."""

    def __init__(self, session: Session) -> None:
        """Bind the repository to an open SQLAlchemy session.

        @param session - Active ORM session.
        """
        self._session = session

    def enqueue(self, job_type: str, payload: dict[str, Any]) -> Job:
        """Insert a pending job row.

        @param job_type - Job discriminator (sync, parse, embed, …).
        @param payload - JSON-serializable payload matching `contracts/jobs.schema.json`.
        @returns The persisted job (flushed, not committed).
        """
        job = Job(type=job_type, payload=payload, status=JobStatus.PENDING)
        self._session.add(job)
        self._session.flush()
        return job

    def claim_next(self) -> Job | None:
        """Atomically claim the oldest pending job using `FOR UPDATE SKIP LOCKED`.

        @returns The claimed job marked `running`, or `None` when the queue is empty.
        """
        stmt = text(
            """
            UPDATE jobs
            SET status = 'running',
                locked_at = now(),
                attempts = attempts + 1
            WHERE id = (
                SELECT id
                FROM jobs
                WHERE status = 'pending'
                ORDER BY created_at
                FOR UPDATE SKIP LOCKED
                LIMIT 1
            )
            RETURNING id
            """,
        )
        row = self._session.execute(stmt).first()
        if row is None:
            return None
        job_id = row[0]
        return self._session.get(Job, job_id)

    def mark_done(self, job_id: uuid.UUID) -> Job | None:
        """Mark a job as successfully completed.

        @param job_id - Job UUID.
        @returns Updated job or `None` if not found.
        """
        job = self._session.get(Job, job_id)
        if job is None:
            return None
        job.status = JobStatus.DONE
        job.locked_at = None
        self._session.flush()
        return job

    def mark_failed(self, job_id: uuid.UUID) -> Job | None:
        """Mark a job as failed.

        @param job_id - Job UUID.
        @returns Updated job or `None` if not found.
        """
        job = self._session.get(Job, job_id)
        if job is None:
            return None
        job.status = JobStatus.FAILED
        job.locked_at = None
        self._session.flush()
        return job


class AuditLogRepository:
    """Data access for security audit events."""

    def __init__(self, session: Session) -> None:
        """Bind the repository to an open SQLAlchemy session.

        @param session - Active ORM session.
        """
        self._session = session

    def append(
        self,
        *,
        action: str,
        actor_id: uuid.UUID | None = None,
        target: str | None = None,
    ) -> AuditLog:
        """Record a sensitive action in the audit trail.

        @param action - Action identifier (e.g. `repo.attach`).
        @param actor_id - Optional acting user UUID.
        @param target - Optional target descriptor.
        @returns The persisted audit row (flushed, not committed).
        """
        entry = AuditLog(actor_id=actor_id, action=action, target=target)
        self._session.add(entry)
        self._session.flush()
        return entry

    def list_by_actor(self, actor_id: uuid.UUID, limit: int = 50) -> list[AuditLog]:
        """Return recent audit entries for a user.

        @param actor_id - User UUID.
        @param limit - Maximum rows to return.
        @returns Audit log rows newest first.
        """
        stmt = (
            select(AuditLog)
            .where(AuditLog.actor_id == actor_id)
            .order_by(AuditLog.ts.desc())
            .limit(limit)
        )
        return list(self._session.scalars(stmt))
