"""Postgres-backed job consumer loop (ADR 0006)."""

from __future__ import annotations

import logging
import time
import uuid

from sqlalchemy.orm import Session, sessionmaker

from config import Settings
from config.errors import explain_failure, format_failure_summary
from config.logging import (
    format_indexing_context,
    format_job_claim_message,
    format_job_finished_message,
    format_job_fallback_context,
    format_orphaned_reclaimed_jobs_message,
    format_reclaimed_jobs_message,
    get_indexing_logger,
    job_step,
    log_event,
    log_failure,
    sync_step_name,
)
from repositories import JobRepository, create_engine_from_settings, create_session_factory
from services.indexing.context import resolve_indexing_context
from services.indexing.failure_status import mark_repo_indexing_failed
from services.indexing.job_context import (
    JobExecutionContext,
    payload_trigger,
    resolve_run_id,
    resolve_trigger,
)
from services.indexing.progress_messages import started_message
from services.indexing.progress_recorder import IndexingProgressRecorder
from services.sync.paths import is_existing_clone, repo_worktree_path
from workers.handlers.dispatch import UnsupportedJobError, build_job_handlers, dispatch_job

logger = get_indexing_logger()


def _repo_id_from_payload(payload: object) -> uuid.UUID | None:
    """Extract repoId from a job payload when present.

    @param payload - Job JSON payload.
    @returns Repo UUID or ``None`` when missing or invalid.
    """
    if not isinstance(payload, dict):
        return None
    raw = payload.get("repoId")
    if not raw:
        return None
    try:
        return uuid.UUID(str(raw))
    except ValueError:
        return None


def _project_id_for_repo(session: Session, repo_id: uuid.UUID) -> uuid.UUID | None:
    """Load the owning project id for an active repo.

    @param session - Active SQLAlchemy session.
    @param repo_id - Repository UUID.
    @returns Project UUID or ``None`` when repo is missing.
    """
    from repositories import RepoRepository

    repo = RepoRepository(session).get_by_id(repo_id)
    return repo.project_id if repo is not None else None


def _build_execution_context(session: Session, job: object) -> JobExecutionContext:
    """Build execution context for a claimed job row.

    @param session - Active SQLAlchemy session.
    @param job - Claimed job ORM instance or namespace with id/type/payload/created_by.
    @returns Populated job execution context.
    """
    payload = job.payload if isinstance(job.payload, dict) else {}
    repo_id = _repo_id_from_payload(payload)
    indexing_ctx = resolve_indexing_context(session, repo_id) if repo_id else None
    project_id = _project_id_for_repo(session, repo_id) if repo_id else None
    created_by = getattr(job, "created_by", None)
    trigger = payload_trigger(payload)
    if trigger is None and job.type == "sync":
        trigger = resolve_trigger(job.type, payload, created_by)
    return JobExecutionContext(
        job_id=job.id,
        job_type=job.type,
        run_id=resolve_run_id(job.type, payload, job.id),
        # Only store triggers we recognize in the UI and audit trail. Unknown legacy
        # strings are dropped to None rather than persisting invalid enum values.
        trigger=trigger if trigger in {"initial_attach", "manual_sync", "webhook_push", "cron_poll"} else None,
        project_id=project_id,
        repo_id=repo_id,
        indexing_ctx=indexing_ctx,
        job_created_by=created_by,
    )


def _job_log_label(session: Session, job_type: str, payload: object) -> str:
    """Resolve a log context label for a claimed job.

    @param session - Active SQLAlchemy session.
    @param job_type - Queue job discriminator.
    @param payload - Job JSON payload.
    @returns Formatted context or a type-only fallback.
    """
    repo_id = _repo_id_from_payload(payload)
    if repo_id is None:
        return format_job_fallback_context(job_type)
    ctx = resolve_indexing_context(session, repo_id)
    if ctx is None:
        return format_job_fallback_context(job_type)
    return format_indexing_context(ctx)


def _sync_is_update(settings: Settings, repo_id: uuid.UUID | None) -> bool:
    """Return True when sync will fetch an existing on-disk clone.

    @param settings - Application settings (clone root path).
    @param repo_id - Repository UUID from the job payload.
    @returns True when a git worktree already exists for the repo.
    """
    if repo_id is None:
        return False
    worktree = repo_worktree_path(settings.repo_clone_dir, repo_id)
    return is_existing_clone(worktree)


def _is_transient_failure(exc: BaseException) -> bool:
    """Return True when a handler error is likely temporary and worth retrying.

    Network, git, and embedding service outages are retried up to
    ``worker_max_job_attempts``. Validation and unsupported job types are not.

    @param exc - Exception raised inside a job handler.
    @returns Whether the worker should requeue the job instead of failing it.
    """
    if isinstance(exc, (ConnectionError, TimeoutError, OSError)):
        return True
    if isinstance(exc, RuntimeError):
        return True
    try:
        import httpx

        if isinstance(exc, httpx.HTTPError):
            return True
    except ImportError:
        pass
    return False


def _handle_job_failure(
    work_session: Session,
    settings: Settings,
    job: object,
    exc: BaseException,
    *,
    unsupported: bool = False,
    recorder: IndexingProgressRecorder | None = None,
) -> None:
    """Record a failed job and update related repo status without losing the primary failure.

    Marks the job row failed, writes a sanitized explanation, updates repo connection
    status when the payload references a repo, and emits a progress event for the UI.
    Secondary persistence errors are isolated so the job failure itself is never lost.

    @param work_session - SQLAlchemy session used for all failure persistence writes.
    @param settings - Application settings passed through to ``explain_failure``.
    @param job - The claimed job instance that raised or represents the failure.
    @param exc - The original exception, or a placeholder for unsupported job types.
    @param unsupported - When ``True``, use a fixed message instead of ``explain_failure``.
    @param recorder - Optional progress recorder for repo indexing timeline events.
    """
    if unsupported:
        explanation = "Unsupported job type"
        failure_exc: BaseException | None = None
    else:
        explanation = explain_failure(exc, job_type=job.type, settings=settings)
        failure_exc = exc

    # Roll back first so a poisoned handler session can still persist failure state.
    work_session.rollback()

    exec_ctx = _build_execution_context(work_session, job)
    step_num, step_name = job_step(job.type)
    label = _job_log_label(work_session, job.type, job.payload)

    attempts = getattr(job, "attempts", settings.worker_max_job_attempts)
    should_retry = (
        not unsupported
        and _is_transient_failure(exc)
        and attempts < settings.worker_max_job_attempts
    )

    short_id = str(job.id)[:8]
    summary = format_failure_summary(
        job.type,
        label,
        step_num,
        step_name,
        explanation,
        job_id=short_id,
    )
    log_failure(logger, summary, failure_exc)

    jobs_repo = JobRepository(work_session)
    if should_retry:
        jobs_repo.mark_requeue_pending(job.id, error_message=explanation)
        work_session.commit()
        log_event(
            logger,
            logging.WARNING,
            f"Job {short_id} requeued for retry ({attempts}/{settings.worker_max_job_attempts})",
        )
        return

    jobs_repo.mark_failed(job.id, error_message=explanation)
    work_session.commit()

    try:
        if exec_ctx.repo_id is not None:
            mark_repo_indexing_failed(work_session, exec_ctx.repo_id, explanation=explanation)
            if recorder is not None:
                sync_is_update = (
                    _sync_is_update(settings, exec_ctx.repo_id) if job.type == "sync" else None
                )
                fail_message = started_message(
                    job.type,
                    exec_ctx.indexing_ctx,
                    fallback=f"repo {exec_ctx.repo_id}",
                    trigger=exec_ctx.trigger if job.type == "sync" else None,
                    sync_is_update=sync_is_update,
                )
                recorder.record_failed(
                    f"{fail_message} — failed",
                    failure_reason=explanation,
                )
            work_session.commit()
    except Exception as secondary:
        # The job row is already marked failed and committed above. If updating repo
        # status or progress events fails, roll back only those secondary writes so
        # the primary failure record is not lost.
        work_session.rollback()
        log_failure(
            logger,
            f"Job {short_id} marked failed but secondary persistence failed — {secondary}",
            secondary,
        )


def process_next_job(session_factory: sessionmaker[Session], settings: Settings) -> bool:
    """Claim and run one job from the Postgres queue, if any work is pending.

    Reclaims orphaned and stale jobs before claiming the next pending row. Uses two
    database sessions: a short one for claim/reclaim, and a longer one for handler
    execution, progress events, and completion or failure persistence.

    @param session_factory - SQLAlchemy session factory shared with the HTTP app.
    @param settings - Application settings (stale thresholds, handler config).
    @returns ``True`` when a job was claimed and processed; ``False`` when the queue was empty.
    """
    handlers = build_job_handlers(settings, session_factory)
    # Use a short-lived session only to reclaim stale jobs and atomically claim the next one.
    # Handler work runs in a separate session so claim/commit boundaries stay clean.
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
        job = jobs.claim_next()
        if job is None:
            session.commit()
            return False
        session.commit()

        step_num, step_name = job_step(job.type)
        started = time.monotonic()

        # Handler session spans the full job: progress events, handler side effects,
        # and final mark_done or rollback if the job was superseded mid-flight.
        work_session = session_factory()
        recorder: IndexingProgressRecorder | None = None
        try:
            exec_ctx = _build_execution_context(work_session, job)
            label = _job_log_label(work_session, job.type, job.payload)
            sync_is_update = (
                _sync_is_update(settings, exec_ctx.repo_id) if job.type == "sync" else None
            )
            if job.type == "sync" and sync_is_update is not None:
                step_name = sync_step_name(sync_is_update)
            log_event(
                logger,
                logging.INFO,
                format_job_claim_message(label, step_num, step_name),
            )

            recorder = IndexingProgressRecorder(work_session, exec_ctx)
            exec_ctx.progress_recorder = recorder
            payload = job.payload if isinstance(job.payload, dict) else {}
            file_count = len(payload.get("files", [])) if job.type == "parse" else None
            chunk_count = len(payload.get("chunkIds", [])) if job.type == "embed" else None
            recorder.record_started(
                file_count=file_count,
                section_count=chunk_count,
                sync_is_update=sync_is_update,
            )

            dispatch_job(job, handlers, exec_ctx, work_session)

            job_repo = JobRepository(work_session)
            if not job_repo.is_job_active(job.id):
                # A newer sync for the same repo soft-deleted this job while we worked.
                # Roll back handler writes, then clear the stale ``running`` queue state.
                work_session.rollback()
                job_repo.mark_done(job.id)
                work_session.commit()
                log_event(
                    logger,
                    logging.INFO,
                    f"Job {str(job.id)[:8]} superseded — skipping completion",
                )
            else:
                if not exec_ctx.step_completed and exec_ctx.repo_id is not None:
                    # Some handlers finish without calling the progress recorder. Emit a
                    # synthetic "finished" event so the UI timeline is never blank.
                    elapsed_ms = max(1, int((time.monotonic() - started) * 1000))
                    recorder.record_finished(
                        f"Step {step_num}/3 {step_name} completed for {label}",
                        details={"elapsed_ms": elapsed_ms},
                    )

                job_repo.mark_done(job.id)
                work_session.commit()
                elapsed_s = max(1, round(time.monotonic() - started))
                log_event(
                    logger,
                    logging.INFO,
                    format_job_finished_message(label, step_num, step_name, elapsed_s),
                )
        except UnsupportedJobError:
            _handle_job_failure(
                work_session,
                settings,
                job,
                UnsupportedJobError("nope"),
                unsupported=True,
                recorder=recorder,
            )
        except Exception as exc:
            _handle_job_failure(work_session, settings, job, exc, recorder=recorder)
        finally:
            work_session.close()
        return True
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def run_job_consumer(settings: Settings, stop_event) -> None:
    """Poll the jobs table until ``stop_event`` is set.

    @param settings - Application settings.
    @param stop_event - Threading event used for graceful shutdown.
    """
    import threading

    engine = create_engine_from_settings(settings)
    session_factory = create_session_factory(engine)

    # Orphan reclaim runs once at startup only. Reclaiming before every claim would
    # reset actively-running jobs if a second worker were ever introduced.
    startup_session = session_factory()
    try:
        jobs = JobRepository(startup_session)
        orphaned = jobs.reclaim_orphaned_running_jobs(settings.worker_max_job_attempts)
        if orphaned > 0:
            startup_session.commit()
            log_event(
                logger,
                logging.WARNING,
                format_orphaned_reclaimed_jobs_message(orphaned),
            )
        else:
            startup_session.commit()
    finally:
        startup_session.close()

    while not stop_event.is_set():
        try:
            processed = process_next_job(session_factory, settings)
        except Exception as exc:
            summary = explain_failure(exc, job_type="worker", settings=settings)
            log_failure(logger, f"Background worker error — {summary}", exc)
            processed = False
        if processed:
            continue
        stop_event.wait(timeout=settings.worker_idle_seconds)
    engine.dispose()
