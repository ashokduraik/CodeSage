"""Embed job orchestration — vectorize code chunks."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy.orm import Session, sessionmaker

from config import Settings
from models.enums import ProjectStatus
from repositories import CodeChunkRepository, ProjectRepository, RepoRepository
from services.embedding.tei_client import EmbeddingClient


def handle_embed_job(session: Session, settings: Settings, payload: dict[str, Any]) -> None:
    """Embed the requested code chunks and mark the project indexed when complete.

    @param session - Open SQLAlchemy session (caller commits).
    @param settings - Application settings.
    @param payload - EmbedPayload matching `contracts/jobs.schema.json`.
    @raises ValueError when payload is invalid or repo is missing.
    """
    repo_id_raw = payload.get("repoId")
    chunk_ids_raw = payload.get("chunkIds")
    if not repo_id_raw or not isinstance(chunk_ids_raw, list):
        raise ValueError("embed payload requires repoId and chunkIds.")
    repo_id = uuid.UUID(str(repo_id_raw))

    repos = RepoRepository(session)
    projects = ProjectRepository(session)
    chunks_repo = CodeChunkRepository(session)
    client = EmbeddingClient(settings)

    repo = repos.get_by_id(repo_id)
    if repo is None:
        raise ValueError(f"Repo not found: {repo_id}")

    chunk_ids = [uuid.UUID(str(item)) for item in chunk_ids_raw]
    rows = [chunks_repo.get_by_id(chunk_id) for chunk_id in chunk_ids]
    valid_rows = [row for row in rows if row is not None]
    if not valid_rows:
        return

    vectors = client.embed_texts([row.content for row in valid_rows])
    for row, vector in zip(valid_rows, vectors, strict=True):
        chunks_repo.update_embedding(row.id, vector)

    remaining = chunks_repo.list_unembedded(repo_id, limit=1)
    if not remaining:
        projects.update_status(repo.project_id, ProjectStatus.INDEXED)


def create_embed_handler(
    settings: Settings,
    session_factory: sessionmaker[Session],
):
    """Build an embed handler bound to settings and a session factory."""

    def _handler(payload: dict[str, Any]) -> None:
        session = session_factory()
        try:
            handle_embed_job(session, settings, payload)
            session.commit()
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

    return _handler
