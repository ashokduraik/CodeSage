"""Background freshness poll loop."""

from __future__ import annotations

import logging
import threading

from sqlalchemy.orm import Session, sessionmaker

from config import Settings
from config.logging import get_indexing_logger, log_event, sanitize_log_message
from services.freshness.poll_repos import poll_stale_repos

logger = get_indexing_logger()


def run_freshness_poll_pass(
    settings: Settings,
    session_factory: sessionmaker[Session],
) -> int:
    """Execute one freshness poll pass and commit any enqueued sync jobs.

    Extracted for unit testing and shared by the background poll loop.

    @param settings - Application settings including encryption key for private repos.
    @param session_factory - SQLAlchemy session factory for DB access.
    @returns Number of new sync jobs enqueued.
    @raises Exception when the poll pass fails before commit (caller may rollback).
    """
    return poll_stale_repos(session_factory, settings)


def run_freshness_poll_loop(
    settings: Settings,
    stop_event: threading.Event,
    session_factory: sessionmaker[Session],
) -> None:
    """Periodically poll indexed repos for remote drift and enqueue sync jobs.

    Runs in a daemon thread alongside the main job consumer. Executes one poll pass
    immediately on startup, then sleeps ``freshness_poll_interval_seconds`` between
    subsequent passes when enabled.

    @param settings - Application settings including poll interval and enable flag.
    @param stop_event - Event signalled on application shutdown.
    @param session_factory - SQLAlchemy session factory for DB access.
    """
    if not settings.freshness_poll_enabled:
        log_event(logger, logging.INFO, "Freshness poll disabled — background poller not started")
        return

    log_event(
        logger,
        logging.INFO,
        f"Freshness poll started — interval {settings.freshness_poll_interval_seconds}s",
    )

    while not stop_event.is_set():
        try:
            enqueued = run_freshness_poll_pass(settings, session_factory)
            if enqueued > 0:
                log_event(
                    logger,
                    logging.INFO,
                    f"Freshness poll enqueued {enqueued} sync job(s)",
                )
        except Exception as exc:
            log_event(
                logger,
                logging.ERROR,
                f"Freshness poll pass failed: {sanitize_log_message(str(exc))}",
            )

        if stop_event.wait(timeout=settings.freshness_poll_interval_seconds):
            break
