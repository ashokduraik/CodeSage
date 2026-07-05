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
from services.indexing.xrepo_enqueue import maybe_enqueue_xrepo

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
    """Run Step 3/3 of the indexing pipeline: vectorize code chunks for semantic search.

    Calls the embedding service (or a dev placeholder) for the batch of chunk ids in the
    payload. When every chunk for the repo has a vector, marks the project indexed and
    reconciles lifecycle status across all repos in the project.

    @param session - Open SQLAlchemy session; the worker commits after the handler returns.
    @param settings - Application settings including TEI URL and embedding dimension.
    @param payload - EmbedPayload matching ``contracts/jobs.schema.json``.
    @param exec_ctx - Job execution context for progress recording and run grouping.
    @raises ValueError when the payload is invalid or the repo row is missing.
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
    valid_rows = []
    for chunk_id, row in zip(chunk_ids, rows, strict=True):
        if row is None:
            raise ValueError(f"Chunk not found: {chunk_id}")
        if row.repo_id != repo_id:
            raise ValueError(f"Chunk {chunk_id} does not belong to repo {repo_id}")
        valid_rows.append(row)
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
        # Parse may enqueue multiple embed jobs when chunk count exceeds batch size.
        # Do not mark the project INDEXED until every chunk row has a stored vector.
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

    # Every chunk for this repo now has an embedding vector. Promote project status,
    # stamp the repo as index-complete, and reconcile siblings (multi-repo projects).
    commit_sha = payload.get("sha")
    indexed_sha = commit_sha if isinstance(commit_sha, str) and commit_sha else None
    projects.update_status(repo.project_id, ProjectStatus.INDEXED)
    repos.mark_index_complete(repo_id, sha=indexed_sha)
    recompute_project_lifecycle(session, repo.project_id)
    if maybe_enqueue_xrepo(session, repo.project_id):
        log_event(
            logger,
            logging.INFO,
            f"Queued cross-repo linking for project {repo.project_id}",
        )
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
    """Build an embed handler bound to settings and a session factory.

    @param settings - Application settings.
    @param session_factory - SQLAlchemy session factory (unused; kept for handler signature parity).
    @returns Callable accepting an embed payload dict and execution context.
    """

    def _handler(payload: dict[str, Any], exec_ctx: JobExecutionContext, session: Session) -> None:
        """Thin adapter invoked by the job dispatcher for ``embed`` jobs.

        Binds application settings into ``handle_embed_job`` so the dispatcher can treat
        all job types with the same ``(payload, exec_ctx, session)`` signature.

        @param payload - EmbedPayload matching ``contracts/jobs.schema.json``.
        @param exec_ctx - Job execution context for progress recording and run grouping.
        @param session - Open SQLAlchemy session; the worker commits after return.
        """
        handle_embed_job(session, settings, payload, exec_ctx)

    return _handler
