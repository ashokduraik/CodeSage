"""Startup logging for the background job queue."""

from __future__ import annotations

import logging
import uuid

from sqlalchemy.orm import sessionmaker

from config import Settings
from config.errors import explain_failure
from config.logging import (
    format_failed_job_line,
    format_failed_queue_header,
    format_indexing_context,
    format_job_fallback_context,
    format_orphaned_reclaimed_jobs_message,
    format_pending_queue_message,
    format_reclaimed_jobs_message,
    format_running_queue_message,
    format_worker_ready_message,
    get_indexing_logger,
    job_step,
    log_event,
    sanitize_log_message,
)
from repositories import JobRepository
from services.indexing.context import resolve_indexing_context

logger = get_indexing_logger()


def log_startup_queue_state(
    settings: Settings,
    session_factory: sessionmaker,
) -> None:
    """Emit worker configuration and a one-time job-queue summary at startup.

    @param settings - Application settings.
    @param session_factory - SQLAlchemy session factory.
    """
    log_event(
        logger,
        logging.INFO,
        format_worker_ready_message(settings.repo_clone_dir, settings.worker_idle_seconds),
    )
    session = session_factory()
    try:
        jobs = JobRepository(session)
        # If the previous process crashed mid-job, rows stay ``running`` forever. Reclaim
        # them at startup using the same logic as the worker loop before we log queue state.
        orphaned = jobs.reclaim_orphaned_running_jobs()
        if orphaned > 0:
            session.commit()
            log_event(
                logger,
                logging.WARNING,
                format_orphaned_reclaimed_jobs_message(orphaned),
            )

        reclaimed = jobs.reclaim_stale_running_jobs(
            settings.worker_stale_job_seconds,
            settings.worker_max_job_attempts,
        )
        if reclaimed > 0:
            session.commit()
            log_event(
                logger,
                logging.WARNING,
                format_reclaimed_jobs_message(reclaimed),
            )

        pending = jobs.summarize_pending()
        log_event(logger, logging.INFO, format_pending_queue_message(pending))

        failed_count = jobs.count_by_status("failed")
        if failed_count > 0:
            by_type = jobs.summarize_failed()
            log_event(
                logger,
                logging.WARNING,
                format_failed_queue_header(failed_count, by_type),
            )
            for entry in jobs.latest_failed_summary(limit=5):
                reason_raw = entry.error_message or "unknown error"
                reason = explain_failure(
                    RuntimeError(reason_raw),
                    job_type=entry.job_type,
                    settings=settings,
                )
                step_num, step_name = job_step(entry.job_type)
                if entry.repo_id is not None:
                    ctx = resolve_indexing_context(session, entry.repo_id)
                    label = (
                        format_indexing_context(ctx)
                        if ctx is not None
                        else format_job_fallback_context(entry.job_type)
                    )
                else:
                    label = format_job_fallback_context(entry.job_type)
                log_event(
                    logger,
                    logging.WARNING,
                    format_failed_job_line(
                        entry.job_type,
                        step_num,
                        step_name,
                        label,
                        sanitize_log_message(reason),
                    ),
                )
            if jobs.count_pending() == 0:
                log_event(
                    logger,
                    logging.INFO,
                    "Job queue: no pending work — attach a repo or retry sync from the UI",
                )

        running_count = jobs.count_by_status("running")
        if running_count > 0:
            log_event(
                logger,
                logging.WARNING,
                format_running_queue_message(
                    running_count,
                    settings.worker_stale_job_seconds,
                ),
            )
    finally:
        session.close()
