"""Parse job orchestration — chunk changed files and enqueue embed."""

from __future__ import annotations

import uuid
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session, sessionmaker

from config import Settings
from repositories import CodeChunkRepository, JobRepository, RepoRepository
from services.graph.extract import persist_file_graph
from services.parsing.chunker import chunk_source
from services.sync.paths import repo_worktree_path


def handle_parse_job(session: Session, settings: Settings, payload: dict[str, Any]) -> None:
    """Parse listed files into code_chunks and enqueue embedding.

    @param session - Open SQLAlchemy session (caller commits).
    @param settings - Application settings.
    @param payload - ParsePayload matching `contracts/jobs.schema.json`.
    @raises ValueError when payload is invalid or repo is missing.
    """
    repo_id_raw = payload.get("repoId")
    files = payload.get("files")
    if not repo_id_raw or not isinstance(files, list):
        raise ValueError("parse payload requires repoId and files.")
    repo_id = uuid.UUID(str(repo_id_raw))

    repos = RepoRepository(session)
    chunks_repo = CodeChunkRepository(session)
    jobs = JobRepository(session)

    repo = repos.get_by_id(repo_id)
    if repo is None:
        raise ValueError(f"Repo not found: {repo_id}")

    worktree = repo_worktree_path(settings.repo_clone_dir, repo_id)
    new_chunk_ids: list[str] = []

    for rel_path in files:
        if not isinstance(rel_path, str):
            continue
        file_path = worktree / rel_path
        if not file_path.is_file():
            continue
        chunks_repo.delete_by_repo_file(repo_id, rel_path)
        text = file_path.read_text(encoding="utf-8", errors="replace")
        persist_file_graph(
            session,
            project_id=repo.project_id,
            repo_id=repo_id,
            file_path=rel_path,
            content=text,
        )
        for part in chunk_source(text, file_path=rel_path):
            row = chunks_repo.add(
                project_id=repo.project_id,
                repo_id=repo_id,
                file_path=rel_path,
                span=part.span,
                content=part.content,
                symbol_refs=part.symbol_refs,
            )
            new_chunk_ids.append(str(row.id))

    if new_chunk_ids:
        jobs.enqueue(
            "embed",
            {"repoId": str(repo_id), "chunkIds": new_chunk_ids},
        )


def create_parse_handler(
    settings: Settings,
    session_factory: sessionmaker[Session],
):
    """Build a parse handler bound to settings and a session factory."""

    def _handler(payload: dict[str, Any]) -> None:
        session = session_factory()
        try:
            handle_parse_job(session, settings, payload)
            session.commit()
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

    return _handler
