"""Background freshness poll loop."""

from __future__ import annotations

import logging
import threading

from sqlalchemy.orm import Session, sessionmaker

from config import Settings
from config.logging import get_indexing_logger, log_event
from services.freshness.poll_repos import poll_stale_repos

logger = get_indexing_logger()


def run_freshness_poll_loop(
    settings: Settings,
    stop_event: threading.Event,
    session_factory: sessionmaker[Session],
) -> None:
    """Periodically poll indexed repos for remote drift and enqueue sync jobs.

    Runs in a daemon thread alongside the main job consumer. Sleeps
    ``freshness_poll_interval_seconds`` between passes when enabled.

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
        if stop_event.wait(timeout=settings.freshness_poll_interval_seconds):
            break

        with session_factory() as session:
            try:
                enqueued = poll_stale_repos(session, settings)
                session.commit()
                if enqueued > 0:
                    log_event(
                        logger,
                        logging.INFO,
                        f"Freshness poll enqueued {enqueued} sync job(s)",
                    )
            except Exception as exc:
                session.rollback()
                log_event(
                    logger,
                    logging.ERROR,
                    f"Freshness poll pass failed: {exc}",
                )
