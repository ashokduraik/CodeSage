"""Distillation job orchestration (Phase 4)."""

from __future__ import annotations

import logging
import uuid
from typing import Any

from sqlalchemy.orm import Session, sessionmaker

from config import Settings
from config.logging import get_indexing_logger, log_event
from repositories import ProjectRepository
from services.distill.pipeline import run_distillation
from services.indexing.job_context import JobExecutionContext
from services.indexing.progress_messages import finished_distill_message

logger = get_indexing_logger()


def handle_distill_job(
    session: Session,
    settings: Settings,
    payload: dict[str, Any],
    exec_ctx: JobExecutionContext,
) -> None:
    """Run LLM distillation for a project (full or incremental).

    Consumes the code graph and writes workflows, page_map, permission_rules,
    and data_flows with confidence and source citations (ADR 0025). Writes
    user-facing finished progress events for each active project repo when a
    progress recorder is attached.

    @param session - Open SQLAlchemy session; the worker commits after return.
    @param settings - Application settings including distillation tunables.
    @param payload - DistillPayload matching ``contracts/jobs.schema.json``.
    @param exec_ctx - Job execution context for progress recording.
    @raises ValueError when the payload is invalid or the project row is missing.
    """
    project_id_raw = payload.get("projectId")
    if not project_id_raw:
        raise ValueError("distill payload requires projectId.")
    project_id = uuid.UUID(str(project_id_raw))
    if exec_ctx.project_id is None:
        exec_ctx.project_id = project_id

    projects = ProjectRepository(session)
    project = projects.get_by_id(project_id)
    if project is None:
        raise ValueError(f"Project not found: {project_id}")

    stale_raw = payload.get("staleArtifactIds")
    stale_ids: list[uuid.UUID] | None = None
    if isinstance(stale_raw, list) and stale_raw:
        stale_ids = [uuid.UUID(str(item)) for item in stale_raw]

    mode = "incremental" if stale_ids else "full"
    log_event(
        logger,
        logging.INFO,
        f"Distillation started ({mode}) — project {project_id}",
    )
    result = run_distillation(
        session,
        project_id,
        settings,
        stale_artifact_ids=stale_ids,
    )
    log_event(
        logger,
        logging.INFO,
        (
            f"Distillation finished — project {project_id}: "
            f"{result.workflows} workflows, {result.page_map} pages, "
            f"{result.permission_rules} permissions, {result.data_flows} data flows"
        ),
    )
    if exec_ctx.progress_recorder is not None:
        exec_ctx.progress_recorder.record_finished(
            finished_distill_message(
                workflows=result.workflows,
                page_map=result.page_map,
                permission_rules=result.permission_rules,
                data_flows=result.data_flows,
            ),
            details={
                "workflows": result.workflows,
                "page_map": result.page_map,
                "permission_rules": result.permission_rules,
                "data_flows": result.data_flows,
            },
        )


def create_distill_handler(
    settings: Settings,
    session_factory: sessionmaker[Session],
):
    """Build a distill handler bound to settings and a session factory.

    @param settings - Application settings.
    @param session_factory - SQLAlchemy session factory (unused; kept for handler signature parity).
    @returns Callable accepting a distill payload dict and execution context.
    """

    def _handler(payload: dict[str, Any], exec_ctx: JobExecutionContext, session: Session) -> None:
        """Thin adapter invoked by the job dispatcher for ``distill`` jobs."""
        handle_distill_job(session, settings, payload, exec_ctx)

    return _handler
