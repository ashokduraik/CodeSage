"""Resolve run grouping and trigger context from job rows."""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

from config.logging import IndexingContext
from config.service_users import WEBHOOK_HANDLER_USER_ID

if TYPE_CHECKING:
    from services.indexing.progress_recorder import IndexingProgressRecorder

VALID_TRIGGERS = frozenset({"initial_attach", "manual_sync", "webhook_push"})


@dataclass
class JobExecutionContext:
    """Mutable execution context passed through job dispatch."""

    job_id: uuid.UUID
    job_type: str
    run_id: uuid.UUID
    trigger: str | None
    project_id: uuid.UUID | None
    repo_id: uuid.UUID | None
    indexing_ctx: IndexingContext | None
    job_created_by: uuid.UUID | None = None
    step_completed: bool = field(default=False)
    progress_recorder: IndexingProgressRecorder | None = field(default=None, repr=False)


def resolve_run_id(job_type: str, payload: dict[str, Any], job_id: uuid.UUID) -> uuid.UUID:
    """Resolve the indexing run id that groups sync → parse → embed events.

    @param job_type - Queue job discriminator.
    @param payload - Job JSON payload.
    @param job_id - Claimed job UUID.
    @returns Run id (sync job id for sync jobs; propagated runId otherwise).
    """
    if job_type == "sync":
        return job_id
    raw = payload.get("runId")
    if raw:
        try:
            return uuid.UUID(str(raw))
        except ValueError:
            pass
    return job_id


def resolve_trigger(
    job_type: str,
    payload: dict[str, Any],
    job_created_by: uuid.UUID | None,
) -> str | None:
    """Resolve why this indexing run started.

    @param job_type - Queue job discriminator.
    @param payload - Job JSON payload.
    @param job_created_by - User UUID that enqueued the job.
    @returns Trigger string or ``None`` for legacy jobs.
    """
    raw = payload.get("trigger")
    if isinstance(raw, str) and raw in VALID_TRIGGERS:
        return raw

    if job_type != "sync":
        return None

    # Older jobs omit an explicit trigger field. Infer from who enqueued the job and
    # whether the payload carries a sinceSha hint from a webhook push event.
    if job_created_by == WEBHOOK_HANDLER_USER_ID:
        return "webhook_push"
    if payload.get("sinceSha"):
        return "webhook_push"
    return "manual_sync"


def payload_trigger(payload: dict[str, Any]) -> str | None:
    """Read an explicit trigger from a payload when present.

    @param payload - Job JSON payload.
    @returns Trigger string or ``None``.
    """
    raw = payload.get("trigger")
    if isinstance(raw, str) and raw in VALID_TRIGGERS:
        return raw
    return None
