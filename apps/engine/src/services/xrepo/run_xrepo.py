"""Cross-repo link job orchestration (Phase 2)."""

from __future__ import annotations

import logging
import uuid
from typing import Any

from sqlalchemy.orm import Session, sessionmaker

from config import Settings
from config.logging import get_indexing_logger, log_event
from repositories import ProjectRepository
from services.indexing.distill_enqueue import maybe_enqueue_distill
from services.indexing.job_context import JobExecutionContext
from services.xrepo.link_resolver import resolve_cross_repo_links

logger = get_indexing_logger()


def handle_xrepo_job(
    session: Session,
    settings: Settings,
    payload: dict[str, Any],
    exec_ctx: JobExecutionContext,
) -> None:
    """Run cross-repo link resolution after every repo in a project is indexed.

    Matches frontend HTTP client calls to backend route declarations and writes
    cross-repo ``graph_edges`` so developer QA can traverse frontend → backend → IAM.

    @param session - Open SQLAlchemy session; the worker commits after return.
    @param settings - Application settings (reserved for future tunables).
    @param payload - XrepoPayload matching ``contracts/jobs.schema.json``.
    @param exec_ctx - Job execution context for progress recording.
    @raises ValueError when the payload is invalid or the project row is missing.
    """
    _ = settings
    _ = exec_ctx
    project_id_raw = payload.get("projectId")
    if not project_id_raw:
        raise ValueError("xrepo payload requires projectId.")
    project_id = uuid.UUID(str(project_id_raw))

    projects = ProjectRepository(session)
    project = projects.get_by_id(project_id)
    if project is None:
        raise ValueError(f"Project not found: {project_id}")

    log_event(
        logger,
        logging.INFO,
        f"Cross-repo linking started — project {project_id}",
    )
    result = resolve_cross_repo_links(session, project_id)
    log_event(
        logger,
        logging.INFO,
        (
            f"Cross-repo linking finished — project {project_id}: "
            f"{result.links_created} links from {result.call_nodes} calls and "
            f"{result.route_nodes} routes"
        ),
    )
    if maybe_enqueue_distill(session, project_id):
        log_event(
            logger,
            logging.INFO,
            f"Queued distillation for project {project_id}",
        )


def create_xrepo_handler(
    settings: Settings,
    session_factory: sessionmaker[Session],
):
    """Build an xrepo handler bound to settings and a session factory.

    @param settings - Application settings.
    @param session_factory - SQLAlchemy session factory (unused; kept for handler signature parity).
    @returns Callable accepting an xrepo payload dict and execution context.
    """

    def _handler(payload: dict[str, Any], exec_ctx: JobExecutionContext, session: Session) -> None:
        """Thin adapter invoked by the job dispatcher for ``xrepo`` jobs."""
        handle_xrepo_job(session, settings, payload, exec_ctx)

    return _handler
