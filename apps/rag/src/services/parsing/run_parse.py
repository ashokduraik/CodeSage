"""Parse job orchestration — chunk changed files and enqueue embed."""

from __future__ import annotations

import logging
import uuid
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session, sessionmaker

from config import Settings
from config.logging import (
    format_indexing_context,
    get_indexing_logger,
    log_event,
    parse_progress_message,
    should_log_parse_milestone,
)
from repositories import CodeChunkRepository, JobRepository, RepoRepository
from services.graph.extract import persist_file_graph
from services.indexing.context import resolve_indexing_context
from services.indexing.job_context import JobExecutionContext, payload_trigger
from services.indexing.progress_messages import (
    finished_parse_message,
    skipped_no_sections_message,
)
from services.indexing.progress_recorder import IndexingProgressRecorder
from services.parsing.chunker import chunk_source
from services.sync.paths import repo_worktree_path

logger = get_indexing_logger()


def handle_parse_job(
    session: Session,
    settings: Settings,
    payload: dict[str, Any],
    exec_ctx: JobExecutionContext,
) -> None:
    """Parse listed files into code_chunks and enqueue embedding.

    @param session - Open SQLAlchemy session (caller commits).
    @param settings - Application settings.
    @param payload - ParsePayload matching `contracts/jobs.schema.json`.
    @param exec_ctx - Job execution context for progress recording.
    @raises ValueError when payload is invalid or repo is missing.
    """
    repo_id_raw = payload.get("repoId")
    files = payload.get("files")
    if not repo_id_raw or not isinstance(files, list):
        raise ValueError("parse payload requires repoId and files.")
    repo_id = uuid.UUID(str(repo_id_raw))
    trigger = payload_trigger(payload) or exec_ctx.trigger
    if trigger:
        exec_ctx.trigger = trigger

    repos = RepoRepository(session)
    chunks_repo = CodeChunkRepository(session)
    jobs = JobRepository(session)
    recorder = exec_ctx.progress_recorder or IndexingProgressRecorder(session, exec_ctx)

    repo = repos.get_by_id(repo_id)
    if repo is None:
        raise ValueError(f"Repo not found: {repo_id}")

    ctx = resolve_indexing_context(session, repo_id)
    context_label = format_indexing_context(ctx) if ctx is not None else f"repo {repo_id}"
    fallback = f"repo {repo_id}"

    valid_files = [path for path in files if isinstance(path, str)]
    log_event(
        logger,
        logging.INFO,
        f"Step 2/3 started — reading {len(valid_files)} source files for {context_label}",
    )

    worktree = repo_worktree_path(settings.repo_clone_dir, repo_id)
    new_chunk_ids: list[str] = []
    files_read = 0
    files_skipped = 0
    total_sections = 0

    for rel_path in valid_files:
        file_path = worktree / rel_path
        if not file_path.is_file():
            files_skipped += 1
            continue
        log_event(logger, logging.DEBUG, f"Reading file: {rel_path}")
        chunks_repo.delete_by_repo_file(repo_id, rel_path)
        text = file_path.read_text(encoding="utf-8", errors="replace")
        graph_result = persist_file_graph(
            session,
            project_id=repo.project_id,
            repo_id=repo_id,
            file_path=rel_path,
            content=text,
        )
        file_sections = 0
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
            file_sections += 1
        symbol_count = max(graph_result.edge_count, 0)
        log_event(
            logger,
            logging.DEBUG,
            f"File done: {rel_path} — {file_sections} code sections, {symbol_count} symbols",
        )
        files_read += 1
        total_sections += file_sections
        if should_log_parse_milestone(files_read, len(valid_files)):
            log_event(
                logger,
                logging.INFO,
                parse_progress_message(files_read, len(valid_files)),
            )

    if files_skipped > 0:
        log_event(
            logger,
            logging.INFO,
            f"Skipped {files_skipped} files (not found on disk) for {context_label}",
        )

    log_event(
        logger,
        logging.INFO,
        f"Step 2/3 finished — read {files_read} files, created {total_sections} code sections "
        f"for {context_label}",
    )

    downstream: dict[str, Any] = {
        "repoId": str(repo_id),
        "runId": str(exec_ctx.run_id),
    }
    if trigger:
        downstream["trigger"] = trigger

    if new_chunk_ids:
        log_event(
            logger,
            logging.INFO,
            f"Queued Step 3/3 — indexing {len(new_chunk_ids)} code sections for {context_label}",
        )
        recorder.record_finished(
            finished_parse_message(
                ctx,
                fallback=fallback,
                files_read=files_read,
                sections_created=total_sections,
            ),
            details={
                "files_read": files_read,
                "files_skipped": files_skipped,
                "sections_created": total_sections,
            },
        )
        if jobs.is_job_active(exec_ctx.job_id):
            jobs.enqueue(
                "embed",
                {**downstream, "chunkIds": new_chunk_ids},
            )
        else:
            log_event(
                logger,
                logging.INFO,
                f"Parse job superseded — skipping embed enqueue for {context_label}",
            )
    else:
        log_event(
            logger,
            logging.INFO,
            f"No code sections created — skipping Step 3 for {context_label}",
        )
        recorder.record_skipped(skipped_no_sections_message(ctx, fallback=fallback))


def create_parse_handler(
    settings: Settings,
    session_factory: sessionmaker[Session],
):
    """Build a parse handler bound to settings and a session factory."""

    def _handler(payload: dict[str, Any], exec_ctx: JobExecutionContext, session: Session) -> None:
        handle_parse_job(session, settings, payload, exec_ctx)

    return _handler
