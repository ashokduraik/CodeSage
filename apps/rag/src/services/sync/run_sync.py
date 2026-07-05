"""Sync job orchestration — clone repo and enqueue parse."""

from __future__ import annotations

import logging
import uuid
from typing import Any

from sqlalchemy.orm import Session, sessionmaker

from config import Settings
from config.logging import (
    format_indexing_context,
    get_indexing_logger,
    log_event,
    sanitize_log_message,
    short_commit,
)
from models.enums import ProjectStatus, RepoConnectionStatus
from repositories import JobRepository, ProjectRepository, RepoRepository
from repositories.projects import sanitize_sync_error
from services.encryption import decrypt_token, parse_encryption_key, token_bytes_to_ciphertext
from services.indexing.context import resolve_indexing_context
from services.indexing.job_context import JobExecutionContext, payload_trigger
from services.indexing.progress_messages import (
    finished_sync_message,
    skipped_up_to_date_message,
)
from services.indexing.progress_recorder import IndexingProgressRecorder
from services.sync.git_ops import sync_repository
from services.sync.paths import is_existing_clone, repo_worktree_path, scan_indexable_files

logger = get_indexing_logger()


def handle_sync_job(
    session: Session,
    settings: Settings,
    payload: dict[str, Any],
    exec_ctx: JobExecutionContext,
) -> None:
    """Run Step 1/3 of the indexing pipeline: download or update the Git repository.

    Clones on first attach or fetches on subsequent syncs, determines which source files
    changed since the last index, and enqueues a parse job when there is work to do.
    Updates repo connection status and project lifecycle so the UI reflects progress.

    @param session - Open SQLAlchemy session; the worker commits after the handler returns.
    @param settings - Application settings including clone directory and encryption key.
    @param payload - SyncPayload matching ``contracts/jobs.schema.json``.
    @param exec_ctx - Run grouping and progress recorder shared with parse/embed steps.
    @raises ValueError when the payload is invalid or the repo row is missing.
    @raises RuntimeError when a git command fails.
    """
    repo_id_raw = payload.get("repoId")
    if not repo_id_raw:
        raise ValueError("sync payload requires repoId.")
    repo_id = uuid.UUID(str(repo_id_raw))
    since_sha = payload.get("sinceSha")
    trigger = payload_trigger(payload) or exec_ctx.trigger
    if trigger:
        exec_ctx.trigger = trigger

    repos = RepoRepository(session)
    projects = ProjectRepository(session)
    jobs = JobRepository(session)
    recorder = exec_ctx.progress_recorder or IndexingProgressRecorder(session, exec_ctx)

    repo = repos.get_by_id(repo_id)
    if repo is None:
        raise ValueError(f"Repo not found: {repo_id}")

    ctx = resolve_indexing_context(session, repo_id)
    context_label = format_indexing_context(ctx) if ctx is not None else f"repo {repo_id}"
    fallback = f"repo {repo_id}"

    project = projects.get_by_id(repo.project_id)
    if project is not None:
        projects.update_status(project.id, ProjectStatus.INDEXING)
        if project.name:
            log_event(
                logger,
                logging.INFO,
                f'Project "{project.name}" status → indexing',
            )

    worktree = repo_worktree_path(settings.repo_clone_dir, repo_id)
    is_update = is_existing_clone(worktree)
    sync_action = "fetching latest changes" if is_update else "cloning repository"
    log_event(
        logger,
        logging.INFO,
        f"Step 1/3 started — {sync_action} for {context_label}",
    )

    token: str | None = None
    ciphertext = token_bytes_to_ciphertext(repo.token_enc)
    if ciphertext:
        key = parse_encryption_key(settings.token_enc_key)
        token = decrypt_token(ciphertext, key)
        log_event(logger, logging.INFO, "Using stored credentials for private repository")

    def list_files() -> list[str]:
        """List indexable source files in the on-disk worktree after git sync completes.

        Called by ``sync_repository`` after clone/fetch so incremental diffs can be
        intersected with files we actually parse. Respects the configured max file size.

        @returns Relative paths of source files eligible for the parse step.
        """
        scan = scan_indexable_files(worktree, settings.sync_max_file_bytes)
        if scan.skipped_large_count > 0:
            log_event(
                logger,
                logging.DEBUG,
                f"Skipped {scan.skipped_large_count} files (over size limit)",
            )
        log_event(
            logger,
            logging.INFO,
            f"Found {len(scan.paths)} indexable source files",
        )
        return scan.paths

    try:
        result = sync_repository(
            repo_url=repo.repo_url,
            branch=repo.branch,
            worktree=worktree,
            token=token,
            since_sha=since_sha or repo.last_indexed_sha,
            list_files=list_files,
        )
    except Exception as exc:
        repos.update_connection_status(
            repo_id,
            RepoConnectionStatus.ERROR,
            sanitize_sync_error(str(exc)),
        )
        reason = sanitize_log_message(str(exc))
        fail_action = "fetch latest changes" if is_update else "clone repository"
        log_event(
            logger,
            logging.ERROR,
            f"Step 1/3 failed — could not {fail_action} for {context_label}: {reason}",
        )
        log_event(logger, logging.INFO, f"Repository connection status → error for {context_label}")
        raise

    repos.update_head_sha(repo_id, result.head_sha)
    repos.update_connection_status(repo_id, RepoConnectionStatus.CONNECTED)
    log_event(logger, logging.INFO, f"Repository connection status → connected for {context_label}")

    finish_action = "repository updated" if is_update else "repository download complete"
    log_event(
        logger,
        logging.INFO,
        f"Step 1/3 finished — {finish_action} for {context_label} "
        f"(commit {short_commit(result.head_sha)})",
    )

    incremental = bool(since_sha or repo.last_indexed_sha)
    downstream = {
        "repoId": str(repo_id),
        "runId": str(exec_ctx.run_id),
    }
    if trigger:
        downstream["trigger"] = trigger

    if result.changed_files:
        file_count = len(result.changed_files)
        log_event(
            logger,
            logging.INFO,
            f"Queued Step 2/3 — reading {file_count} files for {context_label}",
        )
        recorder.record_finished(
            finished_sync_message(
                ctx,
                fallback=fallback,
                commit_sha=result.head_sha,
                file_count=file_count,
                is_update=is_update,
            ),
            details={
                "commit_sha": short_commit(result.head_sha),
                "file_count": file_count,
                "incremental": incremental,
                "sync_mode": "fetch" if is_update else "clone",
            },
        )
        if jobs.is_job_active(exec_ctx.job_id):
            jobs.enqueue(
                "parse",
                {
                    **downstream,
                    "files": result.changed_files,
                    "sha": result.head_sha,
                },
            )
        else:
            # A newer sync superseded this job while we were cloning. Do not enqueue parse
            # for stale file lists — the newer job will drive the next pipeline step.
            log_event(
                logger,
                logging.INFO,
                f"Sync job superseded — skipping parse enqueue for {context_label}",
            )
    else:
        log_event(
            logger,
            logging.INFO,
            f"Step 1/3 finished — repository is up to date for {context_label}, no files to read",
        )
        recorder.record_skipped(
            skipped_up_to_date_message(ctx, fallback=fallback),
            details={
                "commit_sha": short_commit(result.head_sha),
                "incremental": incremental,
                "sync_mode": "fetch" if is_update else "clone",
            },
        )


def create_sync_handler(
    settings: Settings,
    session_factory: sessionmaker[Session],
):
    """Build a sync handler bound to settings and a session factory.

    @param settings - Application settings.
    @param session_factory - SQLAlchemy session factory (unused; kept for handler signature parity).
    @returns Callable accepting a sync payload dict and execution context.
    """

    def _handler(payload: dict[str, Any], exec_ctx: JobExecutionContext, session: Session) -> None:
        """Thin adapter invoked by the job dispatcher for ``sync`` jobs.

        Binds application settings into ``handle_sync_job`` so the dispatcher can treat
        all job types with the same ``(payload, exec_ctx, session)`` signature.

        @param payload - SyncPayload matching ``contracts/jobs.schema.json``.
        @param exec_ctx - Job execution context for progress recording and run grouping.
        @param session - Open SQLAlchemy session; the worker commits after return.
        """
        handle_sync_job(session, settings, payload, exec_ctx)

    return _handler
