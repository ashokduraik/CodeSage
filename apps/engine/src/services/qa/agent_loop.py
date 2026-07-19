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
from services.qa.followup import (
    prior_evidence_nonempty,
    rewrite_followup_question,
    seed_pool_from_prior_evidence,
    should_apply_followup_context,
)
from services.qa.playbooks import (
    PlaybookHint,
    execute_warm_start_steps,
    find_similar_playbooks,
    format_playbook_hints_for_planner,
    promote_trace_to_playbook,
    select_warm_start_playbook,
)
from services.qa.tools import (
    QaToolHit,
    execute_tool,
    tool_definitions_for_planner,
)
from services.retrieval.hybrid_confidence import (
    compute_hybrid_confidence,
    excerpt_term_overlap,
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


def hits_to_retrieval_matches(
    hits: list[QaToolHit],
    *,
    terms: list[str] | None = None,
    overlap_fused_scale: float = 0.05,
) -> list[RetrievalMatch]:
    """Convert evidence-pool hits into ``RetrievalMatch`` rows for confidence scoring.

    Synthetic fused scores fill in when a tool only populated one leg so the hybrid
    formula still has a ranking signal. Path / unscored hits (no symbol, keyword, or
    vector leg) get a keyword-like signal from excerpt–term overlap and a scaled
    fused floor — never a fake ``path: 1.0`` leg.

    @param hits - Deduplicated pool hits (best-first preferred; order preserved).
    @param terms - Optional query tokens from ``extract_search_terms`` for overlap scoring.
    @param overlap_fused_scale - Multiplier that turns overlap into a synthetic fused floor.
    @returns Retrieval matches suitable for ``compute_hybrid_confidence``.
    """
    query_terms = terms or []
    matches: list[RetrievalMatch] = []
    for hit in hits:
        scores = dict(hit.scores)
        symbol = scores.get("symbol")
        keyword = scores.get("keyword")
        vector_distance = scores.get("vector_distance")
        fused = scores.get("fused")

        # Only inject overlap for true path/unscored hits so weak vector-only pools
        # still hit has_hard_vector_fail instead of clearing the gate via acronym noise.
        is_unscored = (
            symbol is None and keyword is None and vector_distance is None
        )
        overlap = 0.0
        if is_unscored and query_terms:
            overlap = excerpt_term_overlap(hit.excerpt, query_terms)
            if overlap > 0.0:
                keyword = max(float(keyword or 0.0), overlap)

        if fused is None:
            # Synthetic rank signal when only one leg fired (ADR 0026).
            leg = max(
                float(symbol or 0.0),
                float(keyword or 0.0),
                (1.0 - float(vector_distance)) if vector_distance is not None else 0.0,
            )
            if is_unscored and overlap > 0.0:
                fused = max(leg, overlap * overlap_fused_scale, 0.01)
            else:
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
            symbol_refs=list(hit.symbol_refs or []),
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

    matches = hits_to_retrieval_matches(
        hits,
        terms=terms,
        overlap_fused_scale=settings.qa_agent_excerpt_overlap_fused_scale,
    )[: settings.qa_agent_confidence_top_n]
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
    ranked = hits_to_retrieval_matches(
        hits,
        terms=extract_search_terms(question),
        overlap_fused_scale=settings.qa_agent_excerpt_overlap_fused_scale,
    )
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


def _tool_result_content(
    tool_name: str,
    hits: list[QaToolHit],
    truncated: bool,
    meta: dict[str, Any] | None = None,
) -> str:
    """Serialize a compact tool result for the next planner turn.

    @param tool_name - Tool that ran.
    @param hits - Hits returned.
    @param truncated - Whether the tool capped results.
    @param meta - Optional planner hints (e.g. ``pathHint`` for truncated path reads).
    @returns JSON string for the ``tool`` role message.
    """
    payload: dict[str, Any] = {
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
    if meta:
        payload.update(meta)
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


def _planner_evidence_nudge(
    pool: EvidencePool,
    confidence: float,
    min_confidence: float,
) -> str:
    """Build a deterministic planner message that pushes for one more tool call.

    Used when the planner emits no tool_calls while evidence already exists in the
    pool but the confidence gate has not passed (ADR 0026 promise: iterate below
    threshold, never silently stop). The copy is code-authored — never LLM text —
    so the planner is anchored to concrete chunks it can drill into instead of
    answering prematurely.

    @param pool - Accumulated evidence with at least one hit.
    @param confidence - Latest evidence-confidence score.
    @param min_confidence - Gate threshold from ``QA_AGENT_MIN_CONFIDENCE``.
    @returns A user-role instruction string listing the top pool anchors and
        directing the planner to call another retrieval tool.
    """
    anchors: list[str] = []
    for hit in pool.hits()[:3]:
        span = json.dumps(hit.span, separators=(",", ":"))
        anchors.append(
            f"- {hit.file_path} span={span} chunk_id={hit.chunk_id}"
        )
    anchor_block = "\n".join(anchors)
    return (
        f"Evidence confidence is {confidence:.2f}, below the {min_confidence:.2f} "
        f"gate, but {len(pool.entries)} evidence chunk(s) are already gathered:\n"
        f"{anchor_block}\n"
        "Call another tool to strengthen the evidence — for example read_chunk "
        "with chunk_id, read_symbol, or read_chunks_for_path with around_line / "
        "chunk_id from one of the anchors above, or a more specific search. "
        "Do not answer in text; call a tool."
    )


def _abstain_content(
    *,
    pool_size: int,
    last_confidence: float,
    min_confidence: float,
) -> str:
    """Return the honest abstain message for the current pool state.

    Citations are streamed as they are found, so telling the user "no evidence"
    when related code was already cited is misleading. Distinguish the empty-pool
    case (truly nothing found) from the below-threshold case (related code found,
    confidence too low) per plan 15.

    @param pool_size - Number of deduplicated chunks in the evidence pool.
    @param last_confidence - Final confidence score (kept for future copy that may
        surface the score; the v1 strings are fixed for test stability).
    @param min_confidence - Gate threshold (reserved alongside ``last_confidence``).
    @returns The abstain body string matching the pool state.
    """
    if pool_size == 0:
        return (
            "I couldn't find enough evidence in the indexed repository "
            "to answer confidently."
        )
    return (
        "I found related code in the index, but the evidence was not strong "
        "enough to answer confidently."
    )


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
    prior_evidence: dict[str, Any] | None = None,
) -> Iterator[str]:
    """Run the agent evidence loop and stream SSE chunks for one developer question.

    Iterates planner → tools → pool → confidence until the gate passes or
    ``QA_AGENT_MAX_ITERATIONS`` is exhausted. Social turns (iteration 1, no tools,
    social question) stream a short reply without the confidence gate.

    When follow-up context is enabled (ADR 0028), vague multi-turn questions are
    rewritten using history and the pool may be seeded from prior citations before
    the planner runs. Playbook warm-start runs only when that seed left the pool empty.

    @param settings - Application settings (agent + LLM knobs).
    @param session_factory - SQLAlchemy session factory for tool DB access.
    @param question - User question.
    @param project_id - Project scope.
    @param repo_ids - Optional repo filter for tools.
    @param history - Optional prior conversation turns oldest-first.
    @param prior_evidence - Optional prior-turn citations/anchors for local seed.
    @yields SSE event strings (tool_*, citation, token, metrics, abstain, done, error).
    """
    # Social greetings skip rewrite/seed so "thanks" still short-circuits in the planner.
    effective_question = question
    if (
        should_apply_followup_context(settings, history)
        and not is_social_question(question)
    ):
        effective_question = rewrite_followup_question(
            settings, question, history or []
        )
        if effective_question != question:
            log_event(
                _logger,
                logging.INFO,
                "Follow-up rewrite applied for multi-turn question",
            )

    terms = extract_search_terms(effective_question)
    intent = classify_query_intent(effective_question, terms)
    pool = EvidencePool(max_chunks=settings.qa_agent_max_pool_chunks)
    tools = tool_definitions_for_planner()

    tool_call_count = 0
    last_confidence = 0.0
    iteration_records: list[dict[str, Any]] = []
    start_iteration = 1

    session = session_factory()
    try:
        # ADR 0028: seed from prior turn before playbook warm-start (precedence).
        followup_seeded = False
        if (
            should_apply_followup_context(settings, history)
            and not is_social_question(question)
            and prior_evidence_nonempty(prior_evidence)
        ):
            assert prior_evidence is not None
            seed_steps = seed_pool_from_prior_evidence(
                session,
                settings,
                project_id=project_id,
                prior=prior_evidence,
                repo_ids=repo_ids,
            )
            iter_tool_records: list[dict[str, Any]] = []
            for step in seed_steps:
                followup_seeded = True
                tool_call_count += 1
                yield _chunk_event(
                    "tool_start",
                    tool={
                        "name": step.tool,
                        "iteration": 1,
                        "args": step.args,
                    },
                )
                if step.error or step.result is None:
                    yield _chunk_event(
                        "tool_result",
                        tool={
                            "name": step.tool,
                            "iteration": 1,
                            "hitCount": 0,
                            "error": step.error or "seed failed",
                        },
                    )
                    iter_tool_records.append(
                        {
                            "tool": step.tool,
                            "args": step.args,
                            "hitCount": 0,
                            "topAnchors": [],
                        }
                    )
                    continue
                result = step.result
                new_hits = 0
                for hit in result.hits:
                    if pool.add(hit, tool=step.tool, iteration=1):
                        new_hits += 1
                        yield _chunk_event(
                            "citation", citation=_citation_from_hit(hit)
                        )
                yield _chunk_event(
                    "tool_result",
                    tool={
                        "name": step.tool,
                        "iteration": 1,
                        "hitCount": len(result.hits),
                        "newHits": new_hits,
                        "durationMs": round(result.duration_ms, 2),
                    },
                )
                iter_tool_records.append(
                    {
                        "tool": step.tool,
                        "args": step.args,
                        "hitCount": len(result.hits),
                        "topAnchors": [
                            {"filePath": h.file_path} for h in result.hits[:3]
                        ],
                    }
                )

            if followup_seeded:
                last_confidence, passes = evaluate_evidence_confidence(
                    pool, settings, intent=intent, terms=terms
                )
                iteration_records.append(
                    {
                        "index": 1,
                        "confidenceAfter": round(last_confidence, 4),
                        "toolCalls": iter_tool_records,
                        "followupSeed": True,
                    }
                )
                log_event(
                    _logger,
                    logging.INFO,
                    f"Follow-up priorEvidence seed "
                    f"(confidence={last_confidence:.4f}, passes={passes})",
                )
                if passes:
                    selected, blocks, ctx_tokens, max_ctx, trimmed = (
                        _pack_pool_excerpts(
                            settings, effective_question, pool.hits(), history
                        )
                    )
                    investigation_trace = _build_investigation_trace(
                        agent_iterations=1,
                        final_confidence=last_confidence,
                        intent=intent,
                        terms=terms,
                        iterations=iteration_records,
                        pool=pool,
                    )
                    stats = LlmStreamStats()
                    for token in stream_final_answer(
                        settings,
                        question=effective_question,
                        context_blocks=blocks,
                        history=trimmed,
                        stats=stats,
                    ):
                        yield _chunk_event("token", content=token)

                    metrics = _metrics_payload(
                        context_chunks=len(selected),
                        context_tokens=ctx_tokens,
                        max_context_tokens=max_ctx,
                        model=settings.vllm_model or "",
                        stats=stats,
                        agent_iterations=1,
                        tool_call_count=tool_call_count,
                        evidence_confidence=last_confidence,
                        investigation_trace=investigation_trace,
                    )
                    yield _chunk_event("metrics", metrics=metrics)
                    try:
                        promote_trace_to_playbook(
                            session,
                            settings,
                            project_id=project_id,
                            question=effective_question,
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
                            f"Playbook promote failed: "
                            f"{sanitize_log_message(str(exc))}",
                        )
                    yield _chunk_event("done")
                    return
                # Seed gathered evidence but stayed below the gate — planner from 2.
                start_iteration = 2

        # Inject past playbooks before iteration 1 so the planner can reuse known paths.
        # Hints are validated against active anchors; warm-start (default off) may
        # deterministically replay the best match as iteration 1 without a planner call.
        # Skip warm-start when follow-up seed already filled the pool (ADR 0028 precedence).
        system_prompt = AGENT_PLANNER_SYSTEM_PROMPT
        hints: list[PlaybookHint] = []
        try:
            hints = find_similar_playbooks(
                session,
                settings,
                project_id=project_id,
                question=effective_question,
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

        warm_hint = (
            select_warm_start_playbook(settings, hints)
            if not pool.entries
            else None
        )
        if warm_hint is not None:
            warm_steps = execute_warm_start_steps(
                session,
                settings,
                project_id=project_id,
                playbook=warm_hint,
                terms=terms,
                repo_ids=repo_ids,
            )
            iter_tool_records: list[dict[str, Any]] = []
            for step in warm_steps:
                tool_call_count += 1
                yield _chunk_event(
                    "tool_start",
                    tool={
                        "name": step.tool,
                        "iteration": 1,
                        "args": step.args,
                    },
                )
                if step.result is None:
                    yield _chunk_event(
                        "tool_result",
                        tool={
                            "name": step.tool,
                            "iteration": 1,
                            "args": step.args,
                            "hitCount": 0,
                            "truncated": False,
                            "durationMs": 0,
                        },
                    )
                    iter_tool_records.append(
                        {
                            "tool": step.tool,
                            "args": step.args,
                            "hitCount": 0,
                            "topAnchors": [],
                        }
                    )
                    continue
                result = step.result
                yield _chunk_event(
                    "tool_result",
                    tool={
                        "name": result.tool_name,
                        "iteration": 1,
                        "args": result.args,
                        "hitCount": len(result.hits),
                        "truncated": result.truncated,
                        "durationMs": int(result.duration_ms),
                    },
                )
                for hit in result.hits:
                    is_new = pool.add(hit, tool=result.tool_name, iteration=1)
                    if is_new:
                        yield _chunk_event(
                            "citation", citation=_citation_from_hit(hit)
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
                    "index": 1,
                    "confidenceAfter": round(last_confidence, 4),
                    "toolCalls": iter_tool_records,
                }
            )
            log_event(
                _logger,
                logging.INFO,
                f"Playbook warm-start used playbook {warm_hint.playbook_id} "
                f"(confidence={last_confidence:.4f}, passes={passes})",
            )
            if passes:
                selected, blocks, ctx_tokens, max_ctx, trimmed = _pack_pool_excerpts(
                    settings, effective_question, pool.hits(), history
                )
                investigation_trace = _build_investigation_trace(
                    agent_iterations=1,
                    final_confidence=last_confidence,
                    intent=intent,
                    terms=terms,
                    iterations=iteration_records,
                    pool=pool,
                )
                stats = LlmStreamStats()
                for token in stream_final_answer(
                    settings,
                    question=effective_question,
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
                    agent_iterations=1,
                    evidence_confidence=last_confidence,
                    tool_call_count=tool_call_count,
                    investigation_trace=investigation_trace,
                )
                yield _chunk_event("metrics", metrics=metrics)
                try:
                    promote_trace_to_playbook(
                        session,
                        settings,
                        project_id=project_id,
                        question=effective_question,
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
            # Warm-start gathered evidence but stayed below the gate — planner from 2.
            start_iteration = 2

        planner_messages: list[dict[str, Any]] = [
            {"role": "system", "content": system_prompt},
        ]
        if history:
            planner_messages.extend(history[-settings.llm_max_history_turns :])
        planner_messages.append({"role": "user", "content": effective_question})

        # Tracks idle turns with no evidence at all so we can abstain early instead
        # of burning every iteration on empty planner turns (plan 15 §2). Reset
        # whenever a tool actually runs.
        consecutive_empty_pool = 0
        last_iteration = start_iteration - 1

        for iteration in range(start_iteration, settings.qa_agent_max_iterations + 1):
            last_iteration = iteration
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

            # Empty tool_calls never bypass the confidence gate (ADR 0026). When the
            # pool already holds evidence but the gate has not passed, nudge the
            # planner with concrete anchors and re-prompt once in this same
            # iteration; do not accept an idle "done gathering" turn (plan 15 §1).
            nudged_this_iteration = False
            if not turn.tool_calls and pool.entries:
                if turn.assistant_content:
                    planner_messages.append(
                        {"role": "assistant", "content": turn.assistant_content}
                    )
                planner_messages.append(
                    {
                        "role": "user",
                        "content": _planner_evidence_nudge(
                            pool, last_confidence, settings.qa_agent_min_confidence
                        ),
                    }
                )
                nudged_this_iteration = True
                # Hard cap: exactly one re-call per iteration so a stubborn planner
                # cannot spin complete_with_tools forever inside one loop step.
                try:
                    turn = complete_with_tools(settings, planner_messages, tools)
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

            if not turn.tool_calls:
                # Either the pool is still empty, or the nudge failed to elicit a
                # tool call. Record the idle turn (auditable ``nudged`` flag) and
                # count it toward the empty-pool early-abstain guard.
                if turn.assistant_content and not nudged_this_iteration:
                    planner_messages.append(
                        {"role": "assistant", "content": turn.assistant_content}
                    )
                record: dict[str, Any] = {
                    "index": iteration,
                    "confidenceAfter": round(last_confidence, 4),
                    "toolCalls": [],
                }
                if nudged_this_iteration:
                    record["nudged"] = True
                iteration_records.append(record)
                consecutive_empty_pool += 1
                # Early exit: two idle turns with zero evidence gathered will never
                # reach the gate, so abstain now rather than idling to max.
                if not pool.entries and consecutive_empty_pool >= 2:
                    break
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
            iter_tool_records = []

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
                            result.tool_name,
                            result.hits,
                            result.truncated,
                            result.meta,
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
            # A tool ran this iteration, so this is active gathering — reset the
            # idle-turn counter used by the empty-pool early-abstain guard.
            consecutive_empty_pool = 0
            tool_record: dict[str, Any] = {
                "index": iteration,
                "confidenceAfter": round(last_confidence, 4),
                "toolCalls": iter_tool_records,
            }
            if nudged_this_iteration:
                tool_record["nudged"] = True
            iteration_records.append(tool_record)

            if passes:
                selected, blocks, ctx_tokens, max_ctx, trimmed = _pack_pool_excerpts(
                    settings, effective_question, pool.hits(), history
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
                    question=effective_question,
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
                        question=effective_question,
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

        pool_size = len(pool.entries)
        log_event(
            _logger,
            logging.INFO,
            f"Agent abstain after {last_iteration} iterations "
            f"(confidence={last_confidence:.4f}, tools={tool_call_count}, "
            f"pool={pool_size})",
        )
        yield _chunk_event(
            "abstain",
            content=_abstain_content(
                pool_size=pool_size,
                last_confidence=last_confidence,
                min_confidence=settings.qa_agent_min_confidence,
            ),
        )
        yield _chunk_event("done")
    finally:
        session.close()
