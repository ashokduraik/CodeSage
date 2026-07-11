"""Grounded answer streaming for developer code QA (Phase 1)."""

from __future__ import annotations

import json
import uuid
from collections.abc import Iterator
from typing import Any

from sqlalchemy.orm import Session, sessionmaker

from config import Settings
from models import CodeChunk
from services.llm.context_window import resolve_model_context_window
from services.llm.prompts import CODE_QA_SYSTEM_PROMPT
from services.llm.tokens import count_tokens, truncate_to_tokens
from services.llm.vllm_client import LlmStreamStats, stream_vllm_answer
from services.llm.title import generate_session_title
from services.retrieval.search import is_confident_match, retrieve_code_chunks
from services.router.classify import is_code_audience
from services.router.small_talk import is_small_talk_message, small_talk_reply

# Approximate token cost of the user-message scaffolding around the context and of the
# separator between excerpts; small constants keep packing safely under the real budget.
_STRUCT_OVERHEAD_TOKENS = 16
_SEPARATOR_TOKENS = 8


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


def _stream_small_talk_answer() -> Iterator[str]:
    """Yield a friendly reply for greetings without retrieval or citations.

    Social turns are not code questions; answering without RAG avoids irrelevant
    citations and awkward grounded-abstain wording from the LLM.

    @yields SSE event strings (`token` then `done`).
    """
    yield _chunk_event("token", content=small_talk_reply())
    yield _chunk_event("done")


def _pack_context(
    settings: Settings,
    question: str,
    matches: list[tuple[CodeChunk, float]],
) -> tuple[list[CodeChunk], list[str], int, int]:
    """Select the highest-ranked chunks that fit the model's context window.

    Replaces a fixed chunk count with tokenizer-based packing: as many retrieved
    excerpts as fit the detected context window (minus the completion reserve and
    prompt scaffolding) are included in ranking order. The top match is always
    included, truncated when a single excerpt exceeds the whole budget, so a strong
    hit is never dropped.

    @param settings - Application settings (context detection + reserve).
    @param question - User question, counted against the budget.
    @param matches - Retrieval results ordered by ascending distance.
    @returns Tuple of (selected chunks, their context blocks, context tokens used,
        detected max context window).
    """
    max_context = resolve_model_context_window(settings)
    fixed = (
        count_tokens(CODE_QA_SYSTEM_PROMPT)
        + count_tokens(question)
        + _STRUCT_OVERHEAD_TOKENS
    )
    budget = max_context - settings.llm_completion_reserve_tokens - fixed

    selected_chunks: list[CodeChunk] = []
    blocks: list[str] = []
    used = 0
    for chunk, _distance in matches:
        block = _context_block(chunk)
        cost = count_tokens(block) + _SEPARATOR_TOKENS
        if not selected_chunks:
            # Guarantee the top match survives even on a tiny window by truncating it
            # to whatever budget remains rather than emitting an empty context.
            if cost > budget:
                block = truncate_to_tokens(block, max(budget - _SEPARATOR_TOKENS, 0))
                cost = count_tokens(block) + _SEPARATOR_TOKENS
            selected_chunks.append(chunk)
            blocks.append(block)
            used += cost
            continue
        if used + cost > budget:
            break
        selected_chunks.append(chunk)
        blocks.append(block)
        used += cost
    return selected_chunks, blocks, used, max_context


def _metrics_payload(
    *,
    context_chunks: int,
    context_tokens: int,
    max_context_tokens: int,
    model: str,
    stats: LlmStreamStats,
) -> dict[str, Any]:
    """Build the AnswerMetrics dict, omitting values the backend did not report.

    @param context_chunks - Number of excerpts packed into the prompt.
    @param context_tokens - Estimated context tokens sent.
    @param max_context_tokens - Detected model context window.
    @param model - Configured model name.
    @param stats - Usage/timing captured during the stream.
    @returns AnswerMetrics-shaped dict with only known fields.
    """
    metrics: dict[str, Any] = {
        "contextChunks": context_chunks,
        "contextTokens": context_tokens,
        "maxContextTokens": max_context_tokens,
    }
    if model:
        metrics["model"] = model
    if stats.prompt_tokens is not None:
        metrics["promptTokens"] = stats.prompt_tokens
    if stats.completion_tokens is not None:
        metrics["completionTokens"] = stats.completion_tokens
    if stats.total_tokens is not None:
        metrics["totalTokens"] = stats.total_tokens
    if stats.tokens_per_second is not None:
        metrics["tokensPerSecond"] = stats.tokens_per_second
    if stats.elapsed_seconds is not None:
        metrics["elapsedMs"] = round(stats.elapsed_seconds * 1000)
    return metrics


def _stream_grounded_answer(
    settings: Settings,
    question: str,
    matches: list[tuple[CodeChunk, float]],
) -> Iterator[str]:
    """Yield SSE chunks with citations, a synthesized answer, and answer metrics.

    @param settings - Application settings.
    @param question - Original user question.
    @param matches - Retrieval results.
    @yields SSE event strings.
    """
    chunks, context_blocks, context_tokens, max_context = _pack_context(
        settings, question, matches
    )
    for chunk in chunks:
        yield _chunk_event("citation", citation=_citation_from_chunk(chunk))

    stats = LlmStreamStats()
    for token in stream_vllm_answer(
        settings, question=question, context_blocks=context_blocks, stats=stats
    ):
        yield _chunk_event("token", content=token)

    yield _chunk_event(
        "metrics",
        metrics=_metrics_payload(
            context_chunks=len(chunks),
            context_tokens=context_tokens,
            max_context_tokens=max_context,
            model=settings.vllm_model,
            stats=stats,
        ),
    )
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

    if is_small_talk_message(question):
        yield from _stream_small_talk_answer()
        return

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
    except ValueError as exc:
        yield _chunk_event("abstain", content=str(exc))
        return
    finally:
        session.close()

    if not is_confident_match(settings, matches):
        yield _chunk_event(
            "abstain",
            content="Not certain — no sufficiently relevant code was retrieved.",
        )
        return

    yield from _stream_grounded_answer(settings, question, matches)
