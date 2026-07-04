"""Shared helpers for RAG unit tests."""

from __future__ import annotations

import uuid

from services.indexing.job_context import JobExecutionContext


def make_exec_ctx(
    *,
    job_type: str = "sync",
    job_id: uuid.UUID | None = None,
    run_id: uuid.UUID | None = None,
    project_id: uuid.UUID | None = None,
    repo_id: uuid.UUID | None = None,
    trigger: str | None = None,
) -> JobExecutionContext:
    """Build a minimal ``JobExecutionContext`` for handler tests.

    @param job_type - Queue job discriminator.
    @param job_id - Job UUID; generated when omitted.
    @param run_id - Run grouping UUID; defaults to ``job_id``.
    @param project_id - Owning project UUID.
    @param repo_id - Target repo UUID.
    @param trigger - Indexing trigger string.
    @returns Populated execution context.
    """
    resolved_job_id = job_id or uuid.uuid4()
    return JobExecutionContext(
        job_id=resolved_job_id,
        job_type=job_type,
        run_id=run_id or resolved_job_id,
        trigger=trigger,
        project_id=project_id,
        repo_id=repo_id,
        indexing_ctx=None,
    )
