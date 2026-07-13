"""Repository clone cleanup job orchestration."""

from __future__ import annotations

import logging
import uuid
from typing import Any

from sqlalchemy.orm import Session, sessionmaker

from config import Settings
from config.logging import get_indexing_logger, log_event
from services.indexing.job_context import JobExecutionContext
from services.sync.cleanup import cleanup_repo_clone

logger = get_indexing_logger()


def handle_repo_cleanup_job(
    session: Session,
    settings: Settings,
    payload: dict[str, Any],
    exec_ctx: JobExecutionContext,
) -> None:
    """Remove a detached repository clone from the engine filesystem.

    Runs asynchronously after Node soft-deletes a repo row so the API request
    stays fast while the worker deletes the on-disk worktree under
    ``settings.repo_clone_dir``.

    @param session - Open SQLAlchemy session; the worker commits after return.
    @param settings - Application settings including the clone root path.
    @param payload - RepoCleanupPayload matching ``contracts/jobs.schema.json``.
    @param exec_ctx - Job execution context for logging context.
    @raises ValueError when the payload is invalid.
    """
    _ = session
    _ = exec_ctx
    repo_id_raw = payload.get("repoId")
    if not repo_id_raw:
        raise ValueError("repo_cleanup payload requires repoId.")
    repo_id = uuid.UUID(str(repo_id_raw))
    reason = payload.get("reason")
    reason_label = reason if isinstance(reason, str) and reason else "unspecified"

    log_event(
        logger,
        logging.INFO,
        f"Clone cleanup started — repo {repo_id} (reason: {reason_label})",
    )
    removed = cleanup_repo_clone(settings.repo_clone_dir, repo_id)
    if removed:
        log_event(
            logger,
            logging.INFO,
            f"Clone cleanup succeeded — repo {repo_id}",
        )
    else:
        log_event(
            logger,
            logging.INFO,
            f"Clone cleanup no-op — repo {repo_id} already absent",
        )


def create_repo_cleanup_handler(
    settings: Settings,
    session_factory: sessionmaker[Session],
):
    """Build a repo cleanup handler bound to settings and a session factory.

    @param settings - Application settings.
    @param session_factory - SQLAlchemy session factory (unused; kept for handler signature parity).
    @returns Callable accepting a repo_cleanup payload dict and execution context.
    """

    def _handler(payload: dict[str, Any], exec_ctx: JobExecutionContext, session: Session) -> None:
        """Thin adapter invoked by the job dispatcher for ``repo_cleanup`` jobs."""
        handle_repo_cleanup_job(session, settings, payload, exec_ctx)

    return _handler
