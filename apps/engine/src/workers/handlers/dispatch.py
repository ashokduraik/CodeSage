"""Dispatch Postgres job rows to Phase 1 service handlers."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from sqlalchemy.orm import Session, sessionmaker

from config import Settings
from models import Job
from services.embedding.run_embed import create_embed_handler
from services.indexing.job_context import JobExecutionContext
from services.parsing.run_parse import create_parse_handler
from services.sync.run_sync import create_sync_handler
from services.xrepo.run_xrepo import create_xrepo_handler
from workers.jobs import is_known_job


class UnsupportedJobError(ValueError):
    """Raised when a job type has no handler in the current phase."""


HandlerFn = Callable[[dict[str, Any], JobExecutionContext, Session], None]


def build_job_handlers(
    settings: Settings,
    session_factory: sessionmaker[Session],
) -> dict[str, HandlerFn]:
    """Create the Phase 1–2 handler map keyed by job type.

    @param settings - Application settings.
    @param session_factory - SQLAlchemy session factory.
    @returns Mapping of job type string to handler callable.
    """
    return {
        "sync": create_sync_handler(settings, session_factory),
        "parse": create_parse_handler(settings, session_factory),
        "embed": create_embed_handler(settings, session_factory),
        "xrepo": create_xrepo_handler(settings, session_factory),
    }


def dispatch_job(
    job: Job,
    handlers: dict[str, HandlerFn],
    ctx: JobExecutionContext,
    session: Session,
) -> None:
    """Invoke the handler for a claimed job row.

    @param job - Claimed job ORM instance.
    @param handlers - Handler map from {@link build_job_handlers}.
    @param ctx - Execution context for progress recording.
    @param session - Shared SQLAlchemy session for the job transaction.
    @raises UnsupportedJobError when the job type is unknown or not implemented.
    """
    if not is_known_job(job.type):
        raise UnsupportedJobError(f"Unknown job type: {job.type}")
    handler = handlers.get(job.type)
    if handler is None:
        raise UnsupportedJobError(f"No handler registered for job type: {job.type}")
    handler(job.payload, ctx, session)
