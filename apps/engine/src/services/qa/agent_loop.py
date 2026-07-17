"""Agent-orchestrated developer QA loop (ADR 0026).

Replaces the fixed retrieve-then-answer pipeline: the planner LLM calls retrieval
tools, evidence accumulates in a pool, and a deterministic confidence gate decides
when to stream a grounded final answer or abstain.
"""

from __future__ import annotations

import json
import logging
import re
import uuid
from collections.abc import Iterator
from dataclasses import dataclass, field
from types import SimpleNamespace
from typing import Any

from sqlalchemy.orm import Session, sessionmaker

from config import Settings
from config.logging import get_indexing_logger, log_event, sanitize_log_message
from services.llm.context_window import resolve_model_context_window
from services.llm.prompts import AGENT_PLANNER_SYSTEM_PROMPT, CODE_QA_SYSTEM_PROMPT
from services.llm.tokens import count_tokens, truncate_to_tokens
from services.llm.vllm_client import (
    LlmStreamStats,
    LlmToolCallingError,
    ParsedToolCall,
    PlannerTurnResult,
    complete_with_tools,
    stream_final_answer,
)
from services.qa.playbooks import (
    find_similar_playbooks,
    format_playbook_hints_for_planner,
    promote_trace_to_playbook,
)
from services.qa.tools import (
    QaToolHit,
    execute_tool,
    tool_definitions_for_planner,
)
from services.retrieval.hybrid_confidence import (
    compute_hybrid_confidence,
    has_hard_vector_fail,
)
from services.retrieval.query_intent import QueryIntentProfile, classify_query_intent
from services.retrieval.query_terms import extract_search_terms
from services.retrieval.types import RetrievalMatch

_logger = get_indexing_logger()

_STRUCT_OVERHEAD_TOKENS = 16
_SEPARATOR_TOKENS = 8
_HISTORY_TURN_OVERHEAD_TOKENS = 4

# Exact normalized phrases for social turns (ADR 0026 §Social). Kept inline so we
# never reintroduce a separate social-bypass module.
_SOCIAL_PHRASES: frozenset[str] = frozenset(
    {
        "hi",
        "hello",
        "hey",
        "thanks",
        "thank you",
        "good morning",
        "good afternoon",
        "good evening",
        "how are you",
        "howdy",
        "yo",
    }
)
_PUNCTUATION_RE = re.compile(r"[^\w\s']+")

_DEFAULT_SOCIAL_REPLY = (
    "Hi. Ask me about the indexed codebase and I'll answer with citations."
)


@dataclass
class EvidencePoolEntry:
    """One deduplicated evidence chunk with provenance for the investigation trace.

    @param hit - Latest tool hit for this chunk id (excerpt + scores).
    @param tool - Tool name that first introduced the chunk.
    @param iteration - 1-based iteration when the chunk entered the pool.
    """

    hit: QaToolHit
    tool: str
    iteration: int


@dataclass
class EvidencePool:
    """Deduplicated evidence set keyed by chunk id, capped at ``max_chunks``.

    @param max_chunks - Hard cap from ``QA_AGENT_MAX_POOL_CHUNKS``.
    @param entries - Insertion-ordered map of chunk id → pool entry.
    """

    max_chunks: int
    entries: dict[uuid.UUID, EvidencePoolEntry] = field(default_factory=dict)

    def add(
        self,
        hit: QaToolHit,
        *,
        tool: str,
        iteration: int,
    ) -> bool:
        """Merge a hit into the pool.

        Existing chunk ids keep their first provenance but refresh scores/excerpt
        from newer hits. New ids beyond the cap are dropped.

        @param hit - Tool hit to merge.
        @param tool - Tool that produced the hit.
        @param iteration - Current agent iteration (1-based).
        @returns True when this is a newly added chunk (caller should emit citation).
        """
        existing = self.entries.get(hit.chunk_id)
        if existing is not None:
            existing.hit = hit
            return False
        if len(self.entries) >= self.max_chunks:
            return False
        self.entries[hit.chunk_id] = EvidencePoolEntry(
            hit=hit, tool=tool, iteration=iteration
        )
        return True

    def hits(self) -> list[QaToolHit]:
        """Return pool hits in insertion order.

        @returns Hit list for packing and confidence conversion.
        """
        return [entry.hit for entry in self.entries.values()]


def _chunk_event(event_type: str, **fields: Any) -> str:
    """Format one SSE data line from an EngineAnswerChunk-shaped dict.

    @param event_type - Chunk discriminator.
    @param fields - Additional JSON fields.
    @returns SSE-framed payload.
    """
    payload = {"type": event_type, **fields}
    return f"data: {json.dumps(payload, separators=(',', ':'))}\n\n"


def _normalize_social(text: str) -> str:
    """Lowercase and strip punctuation for social-phrase matching.

    @param text - Raw user message.
    @returns Normalized phrase.
    """
    collapsed = " ".join(text.strip().lower().split())
    return _PUNCTUATION_RE.sub("", collapsed).strip()


def is_social_question(question: str) -> bool:
    """Return True when the question is a short greeting/thanks, not a code query.

    Used only when the planner emits no tool calls on iteration 1 — never as a
    pre-loop bypass.

    @param question - User message text.
    @returns Whether the social-turn exception applies.
    """
    normalized = _normalize_social(question)
    if not normalized:
        return False
    return normalized in _SOCIAL_PHRASES


def hits_to_retrieval_matches(hits: list[QaToolHit]) -> list[RetrievalMatch]:
    """Convert evidence-pool hits into ``RetrievalMatch`` rows for confidence scoring.

    Synthetic fused scores fill in when a tool only populated one leg so the hybrid
    formula still has a ranking signal.

    @param hits - Deduplicated pool hits (best-first preferred; order preserved).
    @returns Retrieval matches suitable for ``compute_hybrid_confidence``.
    """
    matches: list[RetrievalMatch] = []
    for hit in hits:
        scores = hit.scores
        symbol = scores.get("symbol")
        keyword = scores.get("keyword")
        vector_distance = scores.get("vector_distance")
        fused = scores.get("fused")
        if fused is None:
            # Synthetic rank signal when only one leg fired (ADR 0026).
            leg = max(
                float(symbol or 0.0),
                float(keyword or 0.0),
                (1.0 - float(vector_distance)) if vector_distance is not None else 0.0,
            )
            fused = max(leg, 0.01)

        sources: list[str] = []
        if symbol is not None:
            sources.append("symbol")
        if keyword is not None:
            sources.append("keyword")
        if vector_distance is not None:
            sources.append("vector")

        graph_depth = scores.get("graph_depth")
        is_expanded = bool(scores.get("is_graph_expanded")) or (
            graph_depth is not None and float(graph_depth) > 0
        )

        chunk = SimpleNamespace(
            id=hit.chunk_id,
            repo_id=hit.repo_id,
            file_path=hit.file_path,
            span=hit.span,
            content=hit.excerpt,
            symbol_refs=[],
        )
        matches.append(
            RetrievalMatch(
                chunk=chunk,  # type: ignore[arg-type]
                fused_score=float(fused),
                sources=tuple(sources),
                vector_distance=float(vector_distance)
                if vector_distance is not None
                else None,
                keyword_score=float(keyword) if keyword is not None else None,
                symbol_score=float(symbol) if symbol is not None else None,
                graph_depth=int(graph_depth) if graph_depth is not None else None,
                is_graph_expanded=is_expanded,
            )
        )
    matches.sort(key=lambda m: m.fused_score, reverse=True)
    return matches


def evaluate_evidence_confidence(
    pool: EvidencePool,
    settings: Settings,
    *,
    intent: QueryIntentProfile,
    terms: list[str],
) -> tuple[float, bool]:
    """Score the evidence pool and decide whether the final-answer gate passes.

    Applies ``compute_hybrid_confidence`` on the top-N pool hits, then the
    ``has_hard_vector_fail`` guard (extended to the whole top-N set per ADR 0026).

    @param pool - Accumulated evidence.
    @param settings - Thresholds and confidence weights.
    @param intent - Query intent profile from ``classify_query_intent``.
    @param terms - Search terms from ``extract_search_terms``.
    @returns ``(confidence, passes_gate)``.
    """
    hits = pool.hits()
    if not hits:
        return 0.0, False

    matches = hits_to_retrieval_matches(hits)[: settings.qa_agent_confidence_top_n]
    confidence = compute_hybrid_confidence(
        matches, settings, intent=intent, terms=terms
    )

    # Hard vector fail on the scored set: if no symbol/keyword leg anywhere in
    # top-N clears the min similarity, refuse the gate even when composite is high.
    if has_hard_vector_fail(matches, settings):
        has_strong_leg = any(
            (m.symbol_score or 0.0) >= settings.retrieval_symbol_min_similarity
            or (m.keyword_score or 0.0) >= settings.retrieval_keyword_min_similarity
            for m in matches
        )
        if not has_strong_leg:
            return confidence, False

    return confidence, confidence >= settings.qa_agent_min_confidence


def _citation_from_hit(hit: QaToolHit) -> dict[str, Any]:
    """Build a CodeCitation dict from a pool hit.

    @param hit - Evidence hit.
    @returns Citation payload for SSE.
    """
    excerpt = hit.excerpt[:240].replace("\n", " ")
    return {
        "kind": "code",
        "repoId": str(hit.repo_id),
        "filePath": hit.file_path,
        "span": hit.span,
        "excerpt": excerpt,
    }


def _context_block_from_hit(hit: QaToolHit) -> str:
    """Format one pool hit as LLM context text.

    @param hit - Evidence hit with excerpt.
    @returns File-labeled code fence block.
    """
    return f"File: {hit.file_path}\n```\n{hit.excerpt.strip()}\n```"


def _trim_history_for_budget(
    settings: Settings,
    history: list[dict[str, str]],
    *,
    max_context: int,
    question: str,
) -> list[dict[str, str]]:
    """Drop oldest history turns until the remaining turns fit the context budget.

    @param settings - Application settings.
    @param history - Prior turns oldest-first.
    @param max_context - Detected model context window.
    @param question - Current user question.
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
        max_context
        - settings.llm_completion_reserve_tokens
        - fixed
        - settings.llm_min_retrieval_context_tokens
    )

    selected: list[dict[str, str]] = []
    used = 0
    for turn in capped:
        cost = count_tokens(turn.get("content", "")) + _HISTORY_TURN_OVERHEAD_TOKENS
        if used + cost > history_budget and selected:
            break
        if used + cost > history_budget:
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


def _pack_pool_excerpts(
    settings: Settings,
    question: str,
    hits: list[QaToolHit],
    history: list[dict[str, str]] | None,
) -> tuple[list[QaToolHit], list[str], int, int, list[dict[str, str]]]:
    """Pack evidence-pool excerpts into the model context window for the final answer.

    Only pool excerpts are included — never arbitrary retrieval outside the agent
    loop (NFR-7 / ADR 0026 mandatory evidence).

    @param settings - Context window and reserve settings.
    @param question - User question.
    @param hits - Pool hits (ranked by fused/synthetic score).
    @param history - Optional prior conversation turns.
    @returns Selected hits, context blocks, tokens used, max window, trimmed history.
    """
    ranked = hits_to_retrieval_matches(hits)
    by_id = {h.chunk_id: h for h in hits}
    ordered_hits = [
        by_id[m.chunk.id]  # type: ignore[attr-defined]
        for m in ranked
        if m.chunk.id in by_id  # type: ignore[attr-defined]
    ]

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

    selected: list[QaToolHit] = []
    blocks: list[str] = []
    used = 0
    for hit in ordered_hits:
        block = _context_block_from_hit(hit)
        cost = count_tokens(block) + _SEPARATOR_TOKENS
        if not selected:
            if cost > budget:
                block = truncate_to_tokens(block, max(budget - _SEPARATOR_TOKENS, 0))
                cost = count_tokens(block) + _SEPARATOR_TOKENS
            selected.append(hit)
            blocks.append(block)
            used += cost
            continue
        if used + cost > budget:
            break
        selected.append(hit)
        blocks.append(block)
        used += cost
    return selected, blocks, used, max_context, trimmed_history


def _metrics_payload(
    *,
    context_chunks: int,
    context_tokens: int,
    max_context_tokens: int,
    model: str,
    stats: LlmStreamStats,
    agent_iterations: int,
    evidence_confidence: float,
    tool_call_count: int,
    investigation_trace: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Build AnswerMetrics including agent-loop fields and optional investigation trace.

    @param context_chunks - Excerpts packed into the final prompt.
    @param context_tokens - Estimated context tokens.
    @param max_context_tokens - Model window.
    @param model - Model id.
    @param stats - Stream usage/timing.
    @param agent_iterations - Planner loops executed.
    @param evidence_confidence - Final confidence score.
    @param tool_call_count - Total tools invoked.
    @param investigation_trace - Optional InvestigationTrace for Node persistence.
    @returns Metrics dict for the SSE ``metrics`` chunk.
    """
    metrics: dict[str, Any] = {
        "contextChunks": context_chunks,
        "contextTokens": context_tokens,
        "maxContextTokens": max_context_tokens,
        "agentIterations": agent_iterations,
        "evidenceConfidence": round(evidence_confidence, 4),
        "toolCallCount": tool_call_count,
    }
    if investigation_trace is not None:
        metrics["investigationTrace"] = investigation_trace
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


def _tool_result_content(tool_name: str, hits: list[QaToolHit], truncated: bool) -> str:
    """Serialize a compact tool result for the next planner turn.

    @param tool_name - Tool that ran.
    @param hits - Hits returned.
    @param truncated - Whether the tool capped results.
    @returns JSON string for the ``tool`` role message.
    """
    payload = {
        "tool": tool_name,
        "truncated": truncated,
        "hitCount": len(hits),
        "hits": [
            {
                "chunkId": str(h.chunk_id),
                "filePath": h.file_path,
                "span": h.span,
                "excerpt": h.excerpt[:400],
                "scores": h.scores,
                "graphNodeId": str(h.graph_node_id) if h.graph_node_id else None,
            }
            for h in hits
        ],
    }
    return json.dumps(payload, separators=(",", ":"))


def _assistant_tool_call_message(calls: list[ParsedToolCall]) -> dict[str, Any]:
    """Build an OpenAI-style assistant message carrying tool_calls.

    @param calls - Parsed tool calls from the planner turn.
    @returns Message dict for the conversation history.
    """
    return {
        "role": "assistant",
        "content": None,
        "tool_calls": [
            {
                "id": call.id or f"call_{idx}",
                "type": "function",
                "function": {
                    "name": call.name,
                    "arguments": json.dumps(call.arguments),
                },
            }
            for idx, call in enumerate(calls)
        ],
    }


def _build_investigation_trace(
    *,
    agent_iterations: int,
    final_confidence: float,
    intent: QueryIntentProfile,
    terms: list[str],
    iterations: list[dict[str, Any]],
    pool: EvidencePool,
) -> dict[str, Any]:
    """Build an InvestigationTrace dict embedded in AnswerMetrics for Node persistence.

    @param agent_iterations - Loops executed.
    @param final_confidence - Last confidence score.
    @param intent - Intent profile enum.
    @param terms - Extracted search terms.
    @param iterations - Per-iteration records (each uses ``index``, not ``iteration``).
    @param pool - Final evidence pool.
    @returns Trace dict matching the OpenAPI ``InvestigationTrace`` schema shape.
    """
    return {
        "version": 1,
        "agentIterations": agent_iterations,
        "finalConfidence": round(final_confidence, 4),
        "intentProfile": intent.value,
        "terms": list(terms),
        "iterations": iterations,
        "evidenceAnchors": [
            {
                "filePath": entry.hit.file_path,
                **(
                    {"graphNodeId": str(entry.hit.graph_node_id)}
                    if entry.hit.graph_node_id
                    else {}
                ),
            }
            for entry in pool.entries.values()
        ],
    }


def stream_agent_answer(
    settings: Settings,
    session_factory: sessionmaker[Session],
    *,
    question: str,
    project_id: uuid.UUID,
    repo_ids: list[uuid.UUID] | None = None,
    history: list[dict[str, str]] | None = None,
) -> Iterator[str]:
    """Run the agent evidence loop and stream SSE chunks for one developer question.

    Iterates planner → tools → pool → confidence until the gate passes or
    ``QA_AGENT_MAX_ITERATIONS`` is exhausted. Social turns (iteration 1, no tools,
    social question) stream a short reply without the confidence gate.

    @param settings - Application settings (agent + LLM knobs).
    @param session_factory - SQLAlchemy session factory for tool DB access.
    @param question - User question.
    @param project_id - Project scope.
    @param repo_ids - Optional repo filter for tools.
    @param history - Optional prior conversation turns oldest-first.
    @yields SSE event strings (tool_*, citation, token, metrics, abstain, done, error).
    """
    terms = extract_search_terms(question)
    intent = classify_query_intent(question, terms)
    pool = EvidencePool(max_chunks=settings.qa_agent_max_pool_chunks)
    tools = tool_definitions_for_planner()

    tool_call_count = 0
    last_confidence = 0.0
    iteration_records: list[dict[str, Any]] = []

    session = session_factory()
    try:
        # Inject past playbooks before iteration 1 so the planner can reuse known paths.
        system_prompt = AGENT_PLANNER_SYSTEM_PROMPT
        try:
            hints = find_similar_playbooks(
                session,
                settings,
                project_id=project_id,
                question=question,
            )
            hint_block = format_playbook_hints_for_planner(hints)
            if hint_block:
                system_prompt = f"{system_prompt}\n\n{hint_block}"
                log_event(
                    _logger,
                    logging.DEBUG,
                    f"Injected {len(hints)} playbook hint(s) for planner",
                )
        except Exception as exc:
            log_event(
                _logger,
                logging.WARNING,
                f"Playbook hint lookup failed: {sanitize_log_message(str(exc))}",
            )

        planner_messages: list[dict[str, Any]] = [
            {"role": "system", "content": system_prompt},
        ]
        if history:
            planner_messages.extend(history[-settings.llm_max_history_turns :])
        planner_messages.append({"role": "user", "content": question})

        for iteration in range(1, settings.qa_agent_max_iterations + 1):
            try:
                turn: PlannerTurnResult = complete_with_tools(
                    settings,
                    planner_messages,
                    tools,
                )
            except LlmToolCallingError as exc:
                log_event(
                    _logger,
                    logging.WARNING,
                    f"Agent planner failed: {sanitize_log_message(str(exc))}",
                )
                yield _chunk_event(
                    "error",
                    content=(
                        "The retrieval planner could not run. "
                        "Check LLM tool-calling support."
                    ),
                )
                return

            # Social exception: iteration 1, no tools, greeting/thanks pattern.
            if (
                iteration == 1
                and not turn.tool_calls
                and is_social_question(question)
            ):
                reply = (turn.assistant_content or "").strip() or _DEFAULT_SOCIAL_REPLY
                yield _chunk_event("token", content=reply)
                yield _chunk_event("done")
                return

            if not turn.tool_calls:
                iteration_records.append(
                    {
                        "index": iteration,
                        "confidenceAfter": last_confidence,
                        "toolCalls": [],
                    }
                )
                if turn.assistant_content:
                    planner_messages.append(
                        {"role": "assistant", "content": turn.assistant_content}
                    )
                continue

            normalized_calls = [
                ParsedToolCall(
                    name=call.name,
                    arguments=call.arguments,
                    id=call.id or f"call_{tool_call_count + index}",
                )
                for index, call in enumerate(turn.tool_calls, start=1)
            ]
            planner_messages.append(_assistant_tool_call_message(normalized_calls))
            iter_tool_records: list[dict[str, Any]] = []

            for call in normalized_calls:
                tool_call_count += 1
                assert call.id is not None
                call_id = call.id
                yield _chunk_event(
                    "tool_start",
                    tool={
                        "name": call.name,
                        "iteration": iteration,
                        "args": call.arguments,
                    },
                )

                try:
                    result = execute_tool(
                        session,
                        settings,
                        project_id=project_id,
                        tool_name=call.name,
                        args=call.arguments,
                        repo_ids=repo_ids,
                    )
                except ValueError as exc:
                    err_text = sanitize_log_message(str(exc))
                    yield _chunk_event(
                        "tool_result",
                        tool={
                            "name": call.name,
                            "iteration": iteration,
                            "args": call.arguments,
                            "hitCount": 0,
                            "truncated": False,
                            "durationMs": 0,
                        },
                    )
                    planner_messages.append(
                        {
                            "role": "tool",
                            "tool_call_id": call_id,
                            "content": json.dumps({"error": err_text}),
                        }
                    )
                    iter_tool_records.append(
                        {
                            "tool": call.name,
                            "args": call.arguments,
                            "hitCount": 0,
                            "topAnchors": [],
                        }
                    )
                    continue

                yield _chunk_event(
                    "tool_result",
                    tool={
                        "name": result.tool_name,
                        "iteration": iteration,
                        "args": result.args,
                        "hitCount": len(result.hits),
                        "truncated": result.truncated,
                        "durationMs": int(result.duration_ms),
                    },
                )

                for hit in result.hits:
                    is_new = pool.add(hit, tool=result.tool_name, iteration=iteration)
                    if is_new:
                        yield _chunk_event(
                            "citation", citation=_citation_from_hit(hit)
                        )

                planner_messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": call_id,
                        "content": _tool_result_content(
                            result.tool_name, result.hits, result.truncated
                        ),
                    }
                )
                iter_tool_records.append(
                    {
                        "tool": result.tool_name,
                        "args": result.args,
                        "hitCount": len(result.hits),
                        "topAnchors": [
                            {"filePath": h.file_path} for h in result.hits[:3]
                        ],
                    }
                )

            last_confidence, passes = evaluate_evidence_confidence(
                pool, settings, intent=intent, terms=terms
            )
            iteration_records.append(
                {
                    "index": iteration,
                    "confidenceAfter": round(last_confidence, 4),
                    "toolCalls": iter_tool_records,
                }
            )

            if passes:
                selected, blocks, ctx_tokens, max_ctx, trimmed = _pack_pool_excerpts(
                    settings, question, pool.hits(), history
                )
                investigation_trace = _build_investigation_trace(
                    agent_iterations=iteration,
                    final_confidence=last_confidence,
                    intent=intent,
                    terms=terms,
                    iterations=iteration_records,
                    pool=pool,
                )
                stats = LlmStreamStats()
                for token in stream_final_answer(
                    settings,
                    question=question,
                    context_blocks=blocks,
                    history=trimmed,
                    stats=stats,
                ):
                    yield _chunk_event("token", content=token)

                metrics = _metrics_payload(
                    context_chunks=len(selected),
                    context_tokens=ctx_tokens,
                    max_context_tokens=max_ctx,
                    model=settings.vllm_model,
                    stats=stats,
                    agent_iterations=iteration,
                    evidence_confidence=last_confidence,
                    tool_call_count=tool_call_count,
                    investigation_trace=investigation_trace,
                )
                yield _chunk_event("metrics", metrics=metrics)

                # Learn after the answer streams; failure must not break the SSE done path.
                try:
                    promote_trace_to_playbook(
                        session,
                        settings,
                        project_id=project_id,
                        question=question,
                        trace=investigation_trace,
                        message_id=None,
                        user_id=None,
                        message_meta={
                            "abstained": False,
                            "citation_count": len(pool.entries),
                        },
                    )
                except Exception as exc:
                    log_event(
                        _logger,
                        logging.WARNING,
                        f"Playbook promote failed: {sanitize_log_message(str(exc))}",
                    )

                yield _chunk_event("done")
                return

        log_event(
            _logger,
            logging.INFO,
            f"Agent abstain after {settings.qa_agent_max_iterations} iterations "
            f"(confidence={last_confidence:.4f}, tools={tool_call_count})",
        )
        yield _chunk_event(
            "abstain",
            content=(
                "I couldn't find enough evidence in the indexed repository "
                "to answer confidently."
            ),
        )
        yield _chunk_event("done")
    finally:
        session.close()
