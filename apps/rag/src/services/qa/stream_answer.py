"""Grounded answer streaming for developer code QA (Phase 1)."""

from __future__ import annotations

import json
import logging
import uuid
from collections.abc import Iterator
from typing import Any

from sqlalchemy.orm import Session, sessionmaker

from config import Settings
from config.logging import get_indexing_logger, log_event
from models import CodeChunk
from services.llm.context_window import resolve_model_context_window
from services.llm.prompts import CODE_QA_SYSTEM_PROMPT
from services.llm.tokens import count_tokens, truncate_to_tokens
from services.llm.vllm_client import LlmStreamStats, stream_vllm_answer
from services.llm.title import generate_session_title
from services.retrieval.search import RetrievalContext, is_confident_match, retrieve_code_chunks
from services.retrieval.hybrid_confidence import compute_hybrid_confidence
from services.retrieval.types import RetrievalMatch
from services.router.classify import is_code_audience
from services.router.small_talk import is_small_talk_message, small_talk_reply

# Approximate token cost of the user-message scaffolding around the context and of the
# separator between excerpts; small constants keep packing safely under the real budget.
_STRUCT_OVERHEAD_TOKENS = 16
_SEPARATOR_TOKENS = 8

_logger = get_indexing_logger()


def _log_retrieval(
    question: str,
    matches: list[RetrievalMatch],
    *,
    confident: bool,
    context: RetrievalContext | None = None,
    hybrid_confidence: float | None = None,
) -> None:
    """Emit a DEBUG line describing what retrieval returned for a question.

    Helps diagnose irrelevant answers by exposing fused ranks, retriever sources,
    intent profile, and hybrid confidence. Runs only when log level is DEBUG.

    @param question - The user question that was embedded.
    @param matches - Pruned retrieval hits, best first.
    @param confident - Whether the fused hits passed the abstain threshold.
    @param context - Optional retrieval metadata (intent, tier).
    @param hybrid_confidence - Composite confidence score when computed.
    """
    if not _logger.isEnabledFor(logging.DEBUG):
        return
    preview = question.replace("\n", " ")[:120]
    meta_parts: list[str] = []
    if context is not None:
        meta_parts.append(f"intent={context.intent.value}")
        meta_parts.append(f"tier={context.tier.value}")
    if hybrid_confidence is not None:
        meta_parts.append(f"hybrid_conf={hybrid_confidence:.4f}")
    meta_parts.append(f"pruned={len(matches)}")
    meta = ", ".join(meta_parts)
    log_event(
        _logger,
        logging.DEBUG,
        f"QA retrieval for '{preview}' — {len(matches)} matches, confident={confident}"
        + (f" ({meta})" if meta else ""),
    )
    for rank, match in enumerate(matches[:10], start=1):
        parts = [f"rrf={match.fused_score:.4f}"]
        if match.vector_distance is not None:
            parts.append(f"vec={match.vector_distance:.4f}")
        if match.keyword_score is not None:
            parts.append(f"kw={match.keyword_score:.4f}")
        if match.symbol_score is not None:
            parts.append(f"sym={match.symbol_score:.4f}")
        if match.sources:
            parts.append(f"src={','.join(match.sources)}")
        log_event(
            _logger,
            logging.DEBUG,
            f"  #{rank} {' '.join(parts)} {match.chunk.file_path} [{match.chunk.span}]",
        )


def _log_packed_context(
    *,
    chunks: list[CodeChunk],
    context_tokens: int,
    max_context: int,
    history_turns: int,
) -> None:
    """Emit a DEBUG line describing the prompt actually sent to the LLM.

    Surfaces how much context was packed so over-retrieval (a large, loosely
    relevant excerpt pile that pushes the model toward generic overviews) is
    visible during debugging.

    @param chunks - Excerpts packed into the prompt, in ranked order.
    @param context_tokens - Estimated tokens the excerpts consume.
    @param max_context - Detected model context window.
    @param history_turns - Prior turns retained after budget trimming.
    """
    if not _logger.isEnabledFor(logging.DEBUG):
        return
    files = ", ".join(chunk.file_path for chunk in chunks[:10])
    log_event(
        _logger,
        logging.DEBUG,
        f"QA prompt — {len(chunks)} excerpts, {context_tokens}/{max_context} ctx tokens, "
        f"{history_turns} history turns; files: {files}",
    )


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


# Approximate token cost of one history turn's role/framing overhead.
_HISTORY_TURN_OVERHEAD_TOKENS = 4


def _trim_history_for_budget(
    settings: Settings,
    history: list[dict[str, str]],
    *,
    max_context: int,
    question: str,
) -> list[dict[str, str]]:
    """Drop oldest history turns until the remaining turns fit the context budget.

    The system prompt and current question are never trimmed; only prior turns are
    removed from the front of the list when the combined token cost exceeds what is
    left after reserving space for completion output.

    @param settings - Application settings (completion reserve + history cap).
    @param history - Prior turns oldest-first.
    @param max_context - Detected model context window.
    @param question - Current user question counted against the budget.
    @returns History turns that fit, still oldest-first.
    """
    if not history:
        return []

    capped = history[-settings.llm_max_history_turns :]
    fixed = (
        count_tokens(CODE_QA_SYSTEM_PROMPT)
        + count_tokens(question)
        + _STRUCT_OVERHEAD_TOKENS
    )
    history_budget = (
        max_context - settings.llm_completion_reserve_tokens - fixed
    )

    selected: list[dict[str, str]] = []
    used = 0
    for turn in capped:
        cost = count_tokens(turn.get("content", "")) + _HISTORY_TURN_OVERHEAD_TOKENS
        if used + cost > history_budget and selected:
            break
        if used + cost > history_budget:
            # Keep at least the most recent turn by truncating when alone over budget.
            content = truncate_to_tokens(
                turn.get("content", ""),
                max(history_budget - _HISTORY_TURN_OVERHEAD_TOKENS, 0),
            )
            if content:
                selected.append({"role": turn["role"], "content": content})
            break
        selected.append(turn)
        used += cost

    return selected


def _pack_context(
    settings: Settings,
    question: str,
    matches: list[RetrievalMatch],
    history: list[dict[str, str]] | None = None,
) -> tuple[list[CodeChunk], list[str], int, int, list[dict[str, str]]]:
    """Select the highest-ranked chunks that fit the model's context window.

    Replaces a fixed chunk count with tokenizer-based packing: as many retrieved
    excerpts as fit the detected context window (minus the completion reserve,
    trimmed history, and prompt scaffolding) are included in ranking order. The top
    match is always included, truncated when a single excerpt exceeds the whole
    budget, so a strong hit is never dropped.

    @param settings - Application settings (context detection + reserve).
    @param question - User question, counted against the budget.
    @param matches - Fused retrieval results ordered by descending fused score.
    @param history - Optional prior conversation turns oldest-first.
    @returns Tuple of (selected chunks, their context blocks, context tokens used,
        detected max context window, trimmed history turns).
    """
    max_context = resolve_model_context_window(settings)
    trimmed_history = _trim_history_for_budget(
        settings,
        history or [],
        max_context=max_context,
        question=question,
    )
    history_tokens = sum(
        count_tokens(turn.get("content", "")) + _HISTORY_TURN_OVERHEAD_TOKENS
        for turn in trimmed_history
    )
    fixed = (
        count_tokens(CODE_QA_SYSTEM_PROMPT)
        + count_tokens(question)
        + history_tokens
        + _STRUCT_OVERHEAD_TOKENS
    )
    budget = max_context - settings.llm_completion_reserve_tokens - fixed

    selected_chunks: list[CodeChunk] = []
    blocks: list[str] = []
    used = 0
    for match in matches:
        chunk = match.chunk
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
    return selected_chunks, blocks, used, max_context, trimmed_history


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
    matches: list[RetrievalMatch],
    history: list[dict[str, str]] | None = None,
) -> Iterator[str]:
    """Yield SSE chunks with citations, a synthesized answer, and answer metrics.

    @param settings - Application settings.
    @param question - Original user question.
    @param matches - Retrieval results.
    @param history - Optional prior conversation turns oldest-first.
    @yields SSE event strings.
    """
    chunks, context_blocks, context_tokens, max_context, trimmed_history = _pack_context(
        settings, question, matches, history
    )
    _log_packed_context(
        chunks=chunks,
        context_tokens=context_tokens,
        max_context=max_context,
        history_turns=len(trimmed_history),
    )
    for chunk in chunks:
        yield _chunk_event("citation", citation=_citation_from_chunk(chunk))

    stats = LlmStreamStats()
    for token in stream_vllm_answer(
        settings,
        question=question,
        context_blocks=context_blocks,
        history=trimmed_history,
        stats=stats,
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
    history: list[dict[str, str]] | None = None,
) -> Iterator[str]:
    """Run retrieval + grounded streaming for a RAG query request.

    @param settings - Application settings.
    @param session_factory - SQLAlchemy session factory.
    @param question - User question.
    @param project_id - Project scope.
    @param audience - `developer` or `end_user` (Phase 1 product path abstains).
    @param repo_ids - Optional repo filter.
    @param generate_title - When true, emit a title chunk before the answer.
    @param history - Optional prior conversation turns oldest-first.
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
        matches, retrieval_context = retrieve_code_chunks(
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

    hybrid_confidence = compute_hybrid_confidence(
        matches,
        settings,
        intent=retrieval_context.intent,
        terms=retrieval_context.terms,
    )
    confident = is_confident_match(
        settings,
        matches,
        question=question,
        context=retrieval_context,
    )
    _log_retrieval(
        question,
        matches,
        confident=confident,
        context=retrieval_context,
        hybrid_confidence=hybrid_confidence,
    )
    if not confident:
        yield _chunk_event(
            "abstain",
            content="I couldn't find enough evidence in the indexed repository.",
        )
        return

    yield from _stream_grounded_answer(settings, question, matches, history)
