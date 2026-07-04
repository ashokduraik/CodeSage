"""Persist user-facing repo indexing progress events."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.orm import Session

from models.indexing_progress import RepoIndexingEvent
from repositories.audit import stamp_created
from repositories.indexing_progress import RepoIndexingEventRepository
from services.indexing.job_context import JobExecutionContext
from services.indexing.progress_messages import started_message


class IndexingProgressRecorder:
    """Append-only writer for ``repo_indexing_events`` rows."""

    def __init__(self, session: Session, ctx: JobExecutionContext) -> None:
        """Bind a recorder to a session and job execution context.

        @param session - Active SQLAlchemy session (caller commits).
        @param ctx - Job execution context with run/repo ids.
        """
        self._session = session
        self._ctx = ctx
        self._repo = RepoIndexingEventRepository(session)
        self._step_started_at: datetime | None = None

    def record_started(
        self,
        *,
        file_count: int | None = None,
        section_count: int | None = None,
        sync_is_update: bool | None = None,
    ) -> None:
        """Insert a ``started`` event for the current job step.

        @param file_count - Files to parse (parse step).
        @param section_count - Sections to embed (embed step).
        @param sync_is_update - True when sync fetches an existing clone.
        """
        if self._ctx.project_id is None or self._ctx.repo_id is None:
            return
        now = datetime.now(UTC)
        self._step_started_at = now
        message = started_message(
            self._ctx.job_type,
            self._ctx.indexing_ctx,
            fallback=f"repo {self._ctx.repo_id}",
            trigger=self._ctx.trigger if self._ctx.job_type == "sync" else None,
            file_count=file_count,
            section_count=section_count,
            sync_is_update=sync_is_update,
        )
        details = None
        if self._ctx.job_type == "sync" and sync_is_update is not None:
            details = {"sync_mode": "fetch" if sync_is_update else "clone"}
        self._insert(
            phase="started",
            message=message,
            started_at=now,
            duration_ms=None,
            details=details,
        )

    def record_finished(
        self,
        message: str,
        *,
        details: dict[str, Any] | None = None,
    ) -> None:
        """Insert a ``finished`` event and mark the step complete.

        @param message - User-facing finished message.
        @param details - Optional metrics (commit_sha, file_count, …).
        """
        if self._ctx.project_id is None or self._ctx.repo_id is None:
            return
        self._ctx.step_completed = True
        self._insert(
            phase="finished",
            message=message,
            started_at=datetime.now(UTC),
            duration_ms=self._elapsed_ms(),
            details=details,
        )

    def record_skipped(self, message: str, *, details: dict[str, Any] | None = None) -> None:
        """Insert a ``skipped`` event and mark the step complete.

        @param message - User-facing skipped message.
        @param details - Optional context (e.g. incremental flag).
        """
        if self._ctx.project_id is None or self._ctx.repo_id is None:
            return
        self._ctx.step_completed = True
        self._insert(
            phase="skipped",
            message=message,
            started_at=datetime.now(UTC),
            duration_ms=self._elapsed_ms(),
            details=details,
        )

    def record_failed(self, message: str, *, failure_reason: str) -> None:
        """Insert a ``failed`` event for the current step.

        @param message - User-facing failure summary.
        @param failure_reason - Sanitized explanation for the UI.
        """
        if self._ctx.project_id is None or self._ctx.repo_id is None:
            return
        self._insert(
            phase="failed",
            message=message,
            started_at=datetime.now(UTC),
            duration_ms=self._elapsed_ms(),
            failure_reason=failure_reason,
            details=None,
        )

    def _elapsed_ms(self) -> int | None:
        """Return milliseconds since ``record_started`` when available.

        @returns Elapsed milliseconds or ``None``.
        """
        if self._step_started_at is None:
            return None
        delta = datetime.now(UTC) - self._step_started_at
        return max(0, int(delta.total_seconds() * 1000))

    def _insert(
        self,
        *,
        phase: str,
        message: str,
        started_at: datetime,
        duration_ms: int | None,
        failure_reason: str | None = None,
        details: dict[str, Any] | None = None,
    ) -> None:
        """Insert one progress event row.

        @param phase - Event phase (started, finished, failed, skipped).
        @param message - User-facing message.
        @param started_at - Event timestamp.
        @param duration_ms - Step duration when applicable.
        @param failure_reason - Sanitized failure text for failed phase.
        @param details - Optional JSON metrics.
        """
        assert self._ctx.project_id is not None
        assert self._ctx.repo_id is not None
        row = stamp_created(
            RepoIndexingEvent(
                project_id=self._ctx.project_id,
                repo_id=self._ctx.repo_id,
                run_id=self._ctx.run_id,
                job_id=self._ctx.job_id,
                trigger=self._ctx.trigger,
                step=self._ctx.job_type,
                phase=phase,
                started_at=started_at,
                duration_ms=duration_ms,
                message=message[:2000],
                failure_reason=failure_reason[:2000] if failure_reason else None,
                details=details,
            ),
        )
        self._repo.insert(row)
