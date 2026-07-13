"""Startup logging for the background job queue."""

from __future__ import annotations

import logging

from sqlalchemy.orm import sessionmaker

from config import Settings
from config.logging import (
    format_pending_queue_message,
    format_reclaimed_jobs_message,
    format_running_queue_message,
    format_worker_ready_message,
    get_indexing_logger,
    log_event,
)
from repositories import JobRepository

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
