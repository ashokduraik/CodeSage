"""Sync job orchestration — clone repo and enqueue parse."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy.orm import Session, sessionmaker

from config import Settings
from models.enums import ProjectStatus
from repositories import JobRepository, ProjectRepository, RepoRepository
from services.encryption import decrypt_token, parse_encryption_key, token_bytes_to_ciphertext
from services.sync.git_ops import sync_repository
from services.sync.paths import list_indexable_files, repo_worktree_path


def handle_sync_job(session: Session, settings: Settings, payload: dict[str, Any]) -> None:
    """Run the sync job: git clone/fetch, detect changed files, enqueue parse.

    @param session - Open SQLAlchemy session (caller commits).
    @param settings - Application settings.
    @param payload - SyncPayload matching `contracts/jobs.schema.json`.
    @raises ValueError when payload is invalid or repo is missing.
    @raises RuntimeError when git sync fails.
    """
    repo_id_raw = payload.get("repoId")
    if not repo_id_raw:
        raise ValueError("sync payload requires repoId.")
    repo_id = uuid.UUID(str(repo_id_raw))
    since_sha = payload.get("sinceSha")

    repos = RepoRepository(session)
    projects = ProjectRepository(session)
    jobs = JobRepository(session)

    repo = repos.get_by_id(repo_id)
    if repo is None:
        raise ValueError(f"Repo not found: {repo_id}")

    project = projects.get_by_id(repo.project_id)
    if project is not None:
        projects.update_status(project.id, ProjectStatus.INDEXING)

    worktree = repo_worktree_path(settings.repo_clone_dir, repo_id)
    token: str | None = None
    ciphertext = token_bytes_to_ciphertext(repo.token_enc)
    if ciphertext:
        key = parse_encryption_key(settings.token_enc_key)
        token = decrypt_token(ciphertext, key)

    def list_files() -> list[str]:
        return list_indexable_files(worktree, settings.sync_max_file_bytes)

    result = sync_repository(
        repo_url=repo.repo_url,
        branch=repo.branch,
        worktree=worktree,
        token=token,
        since_sha=since_sha or repo.last_indexed_sha,
        list_files=list_files,
    )
    repos.update_last_indexed_sha(repo_id, result.head_sha)

    if result.changed_files:
        jobs.enqueue(
            "parse",
            {
                "repoId": str(repo_id),
                "files": result.changed_files,
                "sha": result.head_sha,
            },
        )


def create_sync_handler(
    settings: Settings,
    session_factory: sessionmaker[Session],
):
    """Build a sync handler bound to settings and a session factory.

    @param settings - Application settings.
    @param session_factory - SQLAlchemy session factory.
    @returns Callable accepting a sync payload dict.
    """

    def _handler(payload: dict[str, Any]) -> None:
        session = session_factory()
        try:
            handle_sync_job(session, settings, payload)
            session.commit()
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

    return _handler
