"""Grounded answer streaming for developer code QA (Phase 1)."""

from __future__ import annotations

import json
import uuid
from collections.abc import Iterator
from typing import Any

from sqlalchemy.orm import Session, sessionmaker

from config import Settings
from models import CodeChunk
from services.llm.vllm_client import stream_vllm_answer
from services.llm.title import generate_session_title
from services.retrieval.search import is_confident_match, retrieve_code_chunks
from services.router.classify import is_code_audience


def _chunk_event(event_type: str, **fields: Any) -> str:
    """Format one SSE data line from a RagAnswerChunk-shaped dict.

    @param event_type - Chunk discriminator.
    @param fields - Additional JSON fields.
    @returns SSE-framed payload (`data: …\\n\\n`).
    """
    payload = {"type": event_type, **fields}
    return f"data: {json.dumps(payload, separators=(',', ':'))}\n\n"


def _citation_from_chunk(chunk: CodeChunk) -> dict[str, Any]:
    """Build a CodeCitation dict from a stored chunk row.

    @param chunk - Retrieved code chunk.
    """
    excerpt = chunk.content[:240].replace("\n", " ")
    return {
        "kind": "code",
        "repoId": str(chunk.repo_id),
        "filePath": chunk.file_path,
        "span": chunk.span,
        "excerpt": excerpt,
    }


def _context_block(chunk: CodeChunk) -> str:
    """Format one chunk as LLM context text.

    @param chunk - Retrieved code chunk.
    """
    return f"File: {chunk.file_path}\n```\n{chunk.content.strip()}\n```"


def _stream_grounded_answer(
    settings: Settings,
    question: str,
    matches: list[tuple[CodeChunk, float]],
) -> Iterator[str]:
    """Yield SSE chunks with citations followed by a synthesized answer.

    @param settings - Application settings.
    @param question - Original user question.
    @param matches - Retrieval results.
    @yields SSE event strings.
    """
    top = matches[:3]
    for chunk, _distance in top:
        yield _chunk_event("citation", citation=_citation_from_chunk(chunk))

    context_blocks = [_context_block(chunk) for chunk, _ in top]
    for token in stream_vllm_answer(settings, question=question, context_blocks=context_blocks):
        yield _chunk_event("token", content=token)
    yield _chunk_event("done")


def stream_rag_answer(
    settings: Settings,
    session_factory: sessionmaker[Session],
    *,
    question: str,
    project_id: uuid.UUID,
    audience: str,
    repo_ids: list[uuid.UUID] | None = None,
    generate_title: bool = False,
) -> Iterator[str]:
    """Run retrieval + grounded streaming for a RAG query request.

    @param settings - Application settings.
    @param session_factory - SQLAlchemy session factory.
    @param question - User question.
    @param project_id - Project scope.
    @param audience - `developer` or `end_user` (Phase 1 product path abstains).
    @param repo_ids - Optional repo filter.
    @param generate_title - When true, emit a title chunk before the answer.
    @yields SSE event strings.
    """
    if generate_title:
        title = generate_session_title(settings, question)
        yield _chunk_event("title", content=title)

    if not is_code_audience(audience):
        yield _chunk_event(
            "abstain",
            content="End-user product QA is not available in Phase 1.",
        )
        return

    session = session_factory()
    try:
        matches = retrieve_code_chunks(
            session,
            settings,
            project_id=project_id,
            question=question,
            repo_ids=repo_ids,
        )
    finally:
        session.close()

    if not is_confident_match(settings, matches):
        yield _chunk_event(
            "abstain",
            content="Not certain — no sufficiently relevant code was retrieved.",
        )
        return

    yield from _stream_grounded_answer(settings, question, matches)
