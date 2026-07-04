"""Embed job orchestration — vectorize code chunks."""

from __future__ import annotations

import logging
import time
import uuid
from typing import Any

from sqlalchemy.orm import Session, sessionmaker

from config import Settings
from config.logging import format_indexing_context, get_indexing_logger, log_event
from models.enums import ProjectStatus
from repositories import CodeChunkRepository, ProjectRepository, RepoRepository
from services.embedding.tei_client import EmbeddingClient
from services.indexing.context import resolve_indexing_context
from services.indexing.job_context import JobExecutionContext
from services.indexing.progress_messages import (
    finished_embed_message,
    skipped_no_chunks_message,
)
from services.indexing.progress_recorder import IndexingProgressRecorder
from services.indexing.failure_status import recompute_project_lifecycle

logger = get_indexing_logger()


def _embedding_log_line(settings: Settings) -> str:
    """Build the INFO line describing which embedding backend is used.

    @param settings - Application settings.
    @returns Log message for the embedding backend.
    """
    if settings.tei_base_url:
        base = settings.tei_base_url.rstrip("/")
        return f"Calling embedding service at {base}/embeddings"
    return "Using local dev placeholder (no embedding server configured)"


def handle_embed_job(
    session: Session,
    settings: Settings,
    payload: dict[str, Any],
    exec_ctx: JobExecutionContext,
) -> None:
    """Embed the requested code chunks and mark the project indexed when complete.

    @param session - Open SQLAlchemy session (caller commits).
    @param settings - Application settings.
    @param payload - EmbedPayload matching `contracts/jobs.schema.json`.
    @param exec_ctx - Job execution context for progress recording.
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
    recorder = exec_ctx.progress_recorder or IndexingProgressRecorder(session, exec_ctx)

    repo = repos.get_by_id(repo_id)
    if repo is None:
        raise ValueError(f"Repo not found: {repo_id}")

    ctx = resolve_indexing_context(session, repo_id)
    context_label = format_indexing_context(ctx) if ctx is not None else f"repo {repo_id}"
    project_name = ctx.project_name if ctx is not None else None
    fallback = f"repo {repo_id}"

    chunk_ids = [uuid.UUID(str(item)) for item in chunk_ids_raw]
    rows = [chunks_repo.get_by_id(chunk_id) for chunk_id in chunk_ids]
    valid_rows = [row for row in rows if row is not None]
    if not valid_rows:
        log_event(
            logger,
            logging.INFO,
            f"Step 3/3 skipped — no valid code sections to index for {context_label}",
        )
        recorder.record_skipped(skipped_no_chunks_message(ctx, fallback=fallback))
        return

    section_count = len(valid_rows)
    log_event(
        logger,
        logging.INFO,
        f"Step 3/3 started — making {section_count} code sections searchable for {context_label}",
    )
    log_event(logger, logging.INFO, _embedding_log_line(settings))

    started = time.monotonic()
    vectors = client.embed_texts([row.content for row in valid_rows])
    for row, vector in zip(valid_rows, vectors, strict=True):
        chunks_repo.update_embedding(row.id, vector)

    elapsed_s = max(1, round(time.monotonic() - started))
    log_event(
        logger,
        logging.INFO,
        f"Step 3/3 finished — indexed {section_count} code sections for {context_label} "
        f"(took {elapsed_s}s)",
    )

    remaining = chunks_repo.list_unembedded(repo_id, limit=10_000)
    if remaining:
        log_event(
            logger,
            logging.INFO,
            f"Step 3/3 batch done — {len(remaining)} code sections remain for {context_label}",
        )
        recorder.record_finished(
            finished_embed_message(
                ctx,
                fallback=fallback,
                sections_embedded=section_count,
                elapsed_s=elapsed_s,
            ),
            details={"sections_embedded": section_count, "remaining": len(remaining)},
        )
        return

    projects.update_status(repo.project_id, ProjectStatus.INDEXED)
    repos.mark_index_complete(repo_id)
    recompute_project_lifecycle(session, repo.project_id)
    recorder.record_finished(
        finished_embed_message(
            ctx,
            fallback=fallback,
            sections_embedded=section_count,
            elapsed_s=elapsed_s,
        ),
        details={"sections_embedded": section_count, "indexing_complete": True},
    )
    if project_name:
        log_event(
            logger,
            logging.INFO,
            f'Indexing complete — project "{project_name}" is ready for code questions',
        )
    else:
        log_event(
            logger,
            logging.INFO,
            f"Indexing complete — {context_label} is ready for code questions",
        )


def create_embed_handler(
    settings: Settings,
    session_factory: sessionmaker[Session],
):
    """Build an embed handler bound to settings and a session factory."""

    def _handler(payload: dict[str, Any], exec_ctx: JobExecutionContext, session: Session) -> None:
        handle_embed_job(session, settings, payload, exec_ctx)

    return _handler
