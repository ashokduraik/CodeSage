"""Scheduled freshness poll — detect remote drift and enqueue incremental sync."""

from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from config import Settings
from config.logging import get_indexing_logger, log_event, sanitize_log_message, short_commit
from models.enums import ProjectStatus
from repositories import JobRepository, ProjectRepository, RepoRepository
from services.encryption import decrypt_token, parse_encryption_key, token_bytes_to_ciphertext
from services.sync.git_ops import resolve_remote_head

logger = get_indexing_logger()


def poll_stale_repos(session: Session, settings: Settings) -> int:
    """Enqueue sync jobs for indexed repos whose remote HEAD advanced since last index.

    Polls every active repo with ``last_indexed_at`` set, compares ``git ls-remote`` to
    ``last_indexed_sha``, and enqueues an incremental sync when they differ. Skips repos
    that already have a pending or running sync job.

    @param session - Active SQLAlchemy session; caller commits.
    @param settings - Application settings including encryption key for private repos.
    @returns Number of new sync jobs enqueued.
    """
    repos = RepoRepository(session)
    jobs = JobRepository(session)
    projects = ProjectRepository(session)
    enqueued = 0

    for repo in repos.list_indexed_active():
        if jobs.has_active_job_for_repo("sync", repo.id):
            continue

        token: str | None = None
        ciphertext = token_bytes_to_ciphertext(repo.token_enc)
        if ciphertext and settings.token_enc_key:
            key = parse_encryption_key(settings.token_enc_key)
            token = decrypt_token(ciphertext, key)

        try:
            remote_sha = resolve_remote_head(
                repo_url=repo.repo_url,
                branch=repo.branch,
                token=token,
            )
        except RuntimeError as exc:
            log_event(
                logger,
                logging.WARNING,
                f"Freshness poll skipped repo {repo.id}: {sanitize_log_message(str(exc))}",
            )
            continue

        if not repo.last_indexed_sha or remote_sha == repo.last_indexed_sha:
            continue

        projects.update_status(repo.project_id, ProjectStatus.STALE)
        jobs.cancel_pending_jobs_for_repo(repo.id)
        jobs.enqueue(
            "sync",
            {
                "repoId": str(repo.id),
                "trigger": "cron_poll",
                "sinceSha": repo.last_indexed_sha,
            },
        )
        enqueued += 1
        log_event(
            logger,
            logging.INFO,
            f"Freshness poll queued sync for repo {repo.id} "
            f"(remote {short_commit(remote_sha)} vs indexed {short_commit(repo.last_indexed_sha)})",
        )

    return enqueued
