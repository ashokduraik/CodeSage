"""Repositories for jobs and audit log tables."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Any

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from models.enums import JobStatus, RowStatus
from models import AuditLog, Job
from repositories.audit import RAG_ACTOR_ID, stamp_created, stamp_updated


@dataclass(frozen=True)
class FailedJobSummary:
    """Sanitized summary of a failed job for startup warnings."""

    job_type: str
    error_message: str | None
    repo_id: uuid.UUID | None


STALE_JOB_ERROR_MESSAGE = "Job exceeded maximum runtime and was not completed"
SUPERSEDED_JOB_MESSAGE = "Superseded by newer indexing run"


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
        job = stamp_created(Job(type=job_type, payload=payload, job_status=JobStatus.PENDING))
        self._session.add(job)
        self._session.flush()
        return job

    def claim_next(self) -> Job | None:
        """Atomically claim the oldest pending job using `FOR UPDATE SKIP LOCKED`.

        @returns The claimed job marked `running`, or `None` when the queue is empty.
        """
        rag_actor = str(RAG_ACTOR_ID)
        stmt = text(
            """
            UPDATE jobs
            SET job_status = 'running',
                locked_at = now(),
                attempts = attempts + 1,
                updated_by = :updated_by
            WHERE id = (
                SELECT id
                FROM jobs
                WHERE job_status = 'pending'
                  AND status = 'A'
                ORDER BY created_at
                FOR UPDATE SKIP LOCKED
                LIMIT 1
            )
            RETURNING id
            """,
        )
        row = self._session.execute(stmt, {"updated_by": rag_actor}).first()
        if row is None:
            return None
        job_id = row[0]
        return self._session.get(Job, job_id)

    def reclaim_stale_running_jobs(self, stale_seconds: int, max_attempts: int) -> int:
        """Re-queue or fail jobs stuck in ``running`` longer than ``stale_seconds``.

        Jobs at or above ``max_attempts`` are marked ``failed``; others return to
        ``pending`` for retry.

        @param stale_seconds - Age in seconds after which a running job is stale.
        @param max_attempts - Attempts threshold; at or above marks job failed.
        @returns Number of rows updated.
        """
        rag_actor = str(RAG_ACTOR_ID)
        stmt = text(
            """
            UPDATE jobs
            SET job_status = CASE
                    WHEN attempts >= :max_attempts THEN 'failed'::job_status
                    ELSE 'pending'::job_status
                END,
                locked_at = NULL,
                error_message = CASE
                    WHEN attempts >= :max_attempts THEN :stale_error
                    ELSE error_message
                END,
                updated_by = :updated_by
            WHERE job_status = 'running'
              AND status = 'A'
              AND locked_at IS NOT NULL
              AND locked_at < now() - make_interval(secs => :stale_seconds)
            RETURNING id
            """,
        )
        rows = self._session.execute(
            stmt,
            {
                "stale_seconds": stale_seconds,
                "max_attempts": max_attempts,
                "stale_error": STALE_JOB_ERROR_MESSAGE,
                "updated_by": rag_actor,
            },
        ).fetchall()
        return len(rows)

    def reclaim_orphaned_running_jobs(self) -> int:
        """Reset all active ``running`` jobs to ``pending`` after worker restart.

        MVP runs a single worker process; any ``running`` row at reclaim time is
        orphaned because the previous process no longer holds the lock.

        @returns Number of rows updated.
        """
        rag_actor = str(RAG_ACTOR_ID)
        stmt = text(
            """
            UPDATE jobs
            SET job_status = 'pending'::job_status,
                locked_at = NULL,
                updated_by = :updated_by
            WHERE job_status = 'running'
              AND status = 'A'
            RETURNING id
            """,
        )
        rows = self._session.execute(stmt, {"updated_by": rag_actor}).fetchall()
        return len(rows)

    def is_job_active(self, job_id: uuid.UUID) -> bool:
        """Return True when a job row is still claimable/active.

        @param job_id - Job UUID.
        @returns True when the row exists and ``status = 'A'``.
        """
        job = self._session.get(Job, job_id)
        return job is not None and job.status == RowStatus.ACTIVE

    def count_pending(self) -> int:
        """Count active jobs waiting to be claimed.

        @returns Number of rows with ``job_status = pending``.
        """
        return self.count_by_status(JobStatus.PENDING.value)

    def count_by_status(self, job_status: str) -> int:
        """Count active jobs in a given queue state.

        @param job_status - ``pending``, ``running``, ``done``, or ``failed``.
        @returns Matching row count.
        """
        stmt = (
            select(func.count())
            .select_from(Job)
            .where(Job.job_status == job_status, Job.status == RowStatus.ACTIVE)
        )
        return int(self._session.scalar(stmt) or 0)

    def summarize_pending(self) -> list[tuple[str, int]]:
        """Return pending job counts grouped by type.

        @returns ``[(job_type, count), ...]`` ordered by job type name.
        """
        stmt = (
            select(Job.type, func.count())
            .where(Job.job_status == JobStatus.PENDING, Job.status == RowStatus.ACTIVE)
            .group_by(Job.type)
            .order_by(Job.type)
        )
        return [(row[0], int(row[1])) for row in self._session.execute(stmt)]

    def summarize_failed(self) -> list[tuple[str, int]]:
        """Return failed job counts grouped by type.

        @returns ``[(job_type, count), ...]`` ordered by job type name.
        """
        stmt = (
            select(Job.type, func.count())
            .where(Job.job_status == JobStatus.FAILED, Job.status == RowStatus.ACTIVE)
            .group_by(Job.type)
            .order_by(Job.type)
        )
        return [(row[0], int(row[1])) for row in self._session.execute(stmt)]

    def has_active_job(self, job_type: str, *, project_id: uuid.UUID) -> bool:
        """Return True when a pending or running job already exists for a project.

        Used to deduplicate project-scoped jobs such as ``xrepo`` and ``distill``.

        @param job_type - Job discriminator string.
        @param project_id - Project UUID stored in ``payload.projectId``.
        @returns Whether an active queue row already targets the project.
        """
        stmt = select(Job).where(
            Job.type == job_type,
            Job.status == RowStatus.ACTIVE,
            Job.job_status.in_((JobStatus.PENDING, JobStatus.RUNNING)),
        )
        project_key = str(project_id)
        for job in self._session.scalars(stmt):
            payload = job.payload
            if isinstance(payload, dict) and str(payload.get("projectId")) == project_key:
                return True
        return False

    def has_active_job_for_repo(self, job_type: str, repo_id: uuid.UUID) -> bool:
        """Return True when a pending or running job exists for a repository.

        @param job_type - Job discriminator string (e.g. ``sync``).
        @param repo_id - Repository UUID stored in ``payload.repoId``.
        @returns Whether an active queue row already targets the repo.
        """
        stmt = select(Job).where(
            Job.type == job_type,
            Job.status == RowStatus.ACTIVE,
            Job.job_status.in_((JobStatus.PENDING, JobStatus.RUNNING)),
        )
        repo_key = str(repo_id)
        for job in self._session.scalars(stmt):
            payload = job.payload
            if isinstance(payload, dict) and str(payload.get("repoId")) == repo_key:
                return True
        return False

    def cancel_pending_jobs_for_repo(self, repo_id: uuid.UUID) -> int:
        """Soft-delete pending jobs for a repository so a newer sync can take over.

        Matches Node ``cancelPendingJobsForRepo`` supersession semantics.

        @param repo_id - Repository UUID from job payloads.
        @returns Number of rows cancelled.
        """
        stmt = select(Job).where(
            Job.status == RowStatus.ACTIVE,
            Job.job_status == JobStatus.PENDING,
        )
        repo_key = str(repo_id)
        cancelled = 0
        for job in self._session.scalars(stmt):
            payload = job.payload
            if isinstance(payload, dict) and str(payload.get("repoId")) == repo_key:
                job.status = RowStatus.DELETED
                job.error_message = SUPERSEDED_JOB_MESSAGE
                stamp_updated(job)
                cancelled += 1
        if cancelled:
            self._session.flush()
        return cancelled

    def latest_failed_summary(self, limit: int = 3) -> list[FailedJobSummary]:
        """Return the most recent failed jobs for startup diagnostics.

        @param limit - Maximum rows to return.
        @returns Failed job summaries newest first.
        """
        stmt = (
            select(Job)
            .where(Job.job_status == JobStatus.FAILED, Job.status == RowStatus.ACTIVE)
            .order_by(Job.updated_at.desc())
            .limit(limit)
        )
        rows = list(self._session.scalars(stmt))
        summaries: list[FailedJobSummary] = []
        for job in rows:
            repo_id_raw = job.payload.get("repoId") if isinstance(job.payload, dict) else None
            repo_id: uuid.UUID | None = None
            if repo_id_raw:
                try:
                    repo_id = uuid.UUID(str(repo_id_raw))
                except ValueError:
                    repo_id = None
            summaries.append(
                FailedJobSummary(
                    job_type=job.type,
                    error_message=job.error_message,
                    repo_id=repo_id,
                ),
            )
        return summaries

    def mark_done(self, job_id: uuid.UUID) -> Job | None:
        """Mark a job as successfully completed.

        @param job_id - Job UUID.
        @returns Updated job or `None` if not found.
        """
        job = self._session.get(Job, job_id)
        if job is None:
            return None
        job.job_status = JobStatus.DONE
        job.locked_at = None
        stamp_updated(job)
        self._session.flush()
        return job

    def mark_failed(self, job_id: uuid.UUID, error_message: str | None = None) -> Job | None:
        """Mark a job as failed.

        @param job_id - Job UUID.
        @param error_message - Optional failure reason for debugging/UI.
        @returns Updated job or `None` if not found.
        """
        job = self._session.get(Job, job_id)
        if job is None:
            return None
        job.job_status = JobStatus.FAILED
        job.locked_at = None
        if error_message is not None:
            job.error_message = error_message[:2000]
        stamp_updated(job)
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
