"""Scheduled freshness poll — detect remote drift and enqueue incremental sync."""

from __future__ import annotations

import logging

from sqlalchemy.orm import Session, sessionmaker

from config import Settings
from config.logging import get_indexing_logger, log_event, sanitize_log_message, short_commit
from models.enums import ProjectStatus
from repositories import JobRepository, ProjectRepository, RepoRepository
from services.encryption import decrypt_token, parse_encryption_key, token_bytes_to_ciphertext
from services.sync.git_ops import resolve_remote_head

logger = get_indexing_logger()


def _resolve_repo_token(repo, settings: Settings) -> str | None:
    """Decrypt a repository deploy token when ciphertext and key are available.

    @param repo - Repo ORM row with optional ``token_enc``.
    @param settings - Application settings including ``token_enc_key``.
    @returns Plaintext token or ``None`` when polling can proceed without one.
    @raises ValueError when ciphertext or key material is invalid.
    """
    ciphertext = token_bytes_to_ciphertext(repo.token_enc)
    if not ciphertext or not settings.token_enc_key:
        return None
    key = parse_encryption_key(settings.token_enc_key)
    return decrypt_token(ciphertext, key)


def _poll_one_repo(session: Session, settings: Settings, repo) -> bool:
    """Poll one indexed repo and enqueue sync when remote HEAD advanced.

    @param session - Active SQLAlchemy session for this repo only.
    @param settings - Application settings.
    @param repo - Active indexed repo ORM row.
    @returns True when a new sync job was enqueued.
    """
    jobs = JobRepository(session)
    projects = ProjectRepository(session)

    if jobs.has_active_indexing_job_for_repo(repo.id):
        return False

    try:
        token = _resolve_repo_token(repo, settings)
    except ValueError as exc:
        log_event(
            logger,
            logging.WARNING,
            f"Freshness poll skipped repo {repo.id} (token decrypt): "
            f"{sanitize_log_message(str(exc))}",
        )
        return False

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
        return False

    if not repo.last_indexed_sha or remote_sha == repo.last_indexed_sha:
        return False

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
    log_event(
        logger,
        logging.INFO,
        f"Freshness poll queued sync for repo {repo.id} "
        f"(remote {short_commit(remote_sha)} vs indexed {short_commit(repo.last_indexed_sha)})",
    )
    return True


def poll_stale_repos(session_factory: sessionmaker[Session], settings: Settings) -> int:
    """Enqueue sync jobs for indexed repos whose remote HEAD advanced since last index.

    Each repository is polled in its own transaction so one failure does not roll back
    earlier successful enqueues in the same pass.

    @param session_factory - SQLAlchemy session factory.
    @param settings - Application settings including encryption key for private repos.
    @returns Number of new sync jobs enqueued.
    """
    list_session = session_factory()
    try:
        repos = list(RepoRepository(list_session).list_indexed_active())
    finally:
        list_session.close()

    enqueued = 0
    for repo in repos:
        session = session_factory()
        try:
            if _poll_one_repo(session, settings, repo):
                session.commit()
                enqueued += 1
            else:
                session.rollback()
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

    return enqueued
