"""Postgres-backed job consumer loop (ADR 0006)."""

from __future__ import annotations

import logging
import threading

from sqlalchemy.orm import Session, sessionmaker

from config import Settings
from repositories import JobRepository, create_engine_from_settings, create_session_factory
from workers.handlers.dispatch import UnsupportedJobError, build_job_handlers, dispatch_job

logger = logging.getLogger(__name__)


def process_next_job(session_factory: sessionmaker[Session], settings: Settings) -> bool:
    """Claim and execute one pending job when available.

    @param session_factory - SQLAlchemy session factory.
    @param settings - Application settings.
    @returns True when a job was processed, False when the queue was empty.
    """
    handlers = build_job_handlers(settings, session_factory)
    session = session_factory()
    try:
        jobs = JobRepository(session)
        job = jobs.claim_next()
        if job is None:
            session.commit()
            return False
        session.commit()

        work_session = session_factory()
        try:
            dispatch_job(job, handlers)
            JobRepository(work_session).mark_done(job.id)
            work_session.commit()
        except UnsupportedJobError:
            JobRepository(work_session).mark_failed(job.id, error_message="Unsupported job type")
            work_session.commit()
            logger.warning("Unsupported job %s type=%s", job.id, job.type)
        except Exception as exc:
            JobRepository(work_session).mark_failed(job.id, error_message=str(exc)[:2000])
            work_session.commit()
            logger.exception("Job %s failed", job.id)
        finally:
            work_session.close()
        return True
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def run_job_consumer(settings: Settings, stop_event: threading.Event) -> None:
    """Poll the jobs table until ``stop_event`` is set.

    @param settings - Application settings.
    @param stop_event - Threading event used for graceful shutdown.
    """
    engine = create_engine_from_settings(settings)
    session_factory = create_session_factory(engine)
    logger.info("codesage rag worker: consuming jobs from Postgres queue")
    while not stop_event.is_set():
        try:
            processed = process_next_job(session_factory, settings)
        except Exception:
            logger.exception("Worker loop error")
            processed = False
        if processed:
            continue
        stop_event.wait(timeout=settings.worker_idle_seconds)
    engine.dispose()
