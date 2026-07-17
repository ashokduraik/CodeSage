"""QA investigation playbook learning — promote successful traces and retrieve hints.

Implements ADR 0027 milestones P2–P3 (promotion + planner hint injection). Warm-start
(deterministic iteration-1 tool replay) is plan 12 and is not handled here.
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from typing import Any

from sqlalchemy.orm import Session

from config import Settings
from config import constants
from config.logging import get_indexing_logger, log_event, sanitize_log_message
from repositories.qa_playbooks import QaPlaybookRepository
from services.embedding.tei_client import EmbeddingClient

_logger = get_indexing_logger()

# Tools that count as retrieval for L3 (must have at least one to promote).
_RETRIEVAL_TOOLS = frozenset(
    {
        "search_symbols",
        "search_code",
        "search_vectors",
        "search_hybrid",
        "graph_expand",
        "read_symbol",
        "read_chunk",
        "read_chunks_for_path",
    }
)


@dataclass(frozen=True)
class PlaybookHint:
    """One similar playbook summary for the planner system prompt.

    @param playbook_id - Persisted playbook UUID.
    @param canonical_question - Exemplar question text stored on the row.
    @param similarity - Cosine similarity to the new question (0–1).
    @param success_count - How often this path reinforced a successful answer.
    @param steps - Ordered tool-step templates from the playbook.
    @param evidence_anchors - Stable file/symbol anchors from the successful run.
    @param intent_profile - ``symbol_lookup``, ``conceptual``, or ``balanced``.
    """

    playbook_id: uuid.UUID
    canonical_question: str
    similarity: float
    success_count: int
    steps: list[Any]
    evidence_anchors: list[Any]
    intent_profile: str


def is_trace_promotable(trace: dict[str, Any], message_meta: dict[str, Any]) -> bool:
    """Return whether an investigation trace may become or reinforce a playbook.

    Enforces ADR 0027 rules L1–L3 (success gate, grounded answer, tool usage).
    L4 (project scope) and L5 (active rows) are enforced by callers and the repository.

    @param trace - InvestigationTrace-shaped dict from the agent loop.
    @param message_meta - Local metadata: ``abstained`` (bool) and ``citation_count`` (int).
    @returns True when the trace is eligible for promotion.
    """
    confidence = float(trace.get("finalConfidence") or 0.0)
    if confidence < constants.QA_AGENT_MIN_CONFIDENCE:
        return False

    if message_meta.get("abstained", False):
        return False
    if int(message_meta.get("citation_count") or 0) < 1:
        return False

    return _trace_has_retrieval_tool(trace)


def _trace_has_retrieval_tool(trace: dict[str, Any]) -> bool:
    """Return True when the trace recorded at least one retrieval tool call.

    @param trace - InvestigationTrace-shaped dict.
    @returns Whether L3 (tool usage) is satisfied.
    """
    for iteration in trace.get("iterations") or []:
        for call in iteration.get("toolCalls") or []:
            tool = call.get("tool")
            if tool in _RETRIEVAL_TOOLS:
                return True
    return False


def _normalize_question(question: str) -> str:
    """Collapse whitespace for canonical_question storage and display.

    @param question - Raw user question.
    @returns Stripped question with internal whitespace normalized.
    """
    return " ".join(question.split())


def _template_args(args: dict[str, Any], terms: set[str]) -> dict[str, Any]:
    """Convert concrete tool args into replay placeholders where possible.

    Query strings become ``{term:…}``; node ids and qualified names become
    ``{anchor:…}`` so warm-start (plan 12) can resolve them against the new question.

    @param args - Concrete args from a tool call in the trace.
    @param terms - Extracted search terms from the successful run.
    @returns argsTemplate dict for the playbook step.
    """
    out: dict[str, Any] = {}
    for key, value in args.items():
        if key == "query" and isinstance(value, str) and value.strip():
            # Always template queries so paraphrase replay substitutes the new term.
            term = value if value in terms else value.strip()
            out[key] = f"{{term:{term}}}"
        elif key in ("nodeId", "node_id"):
            out["nodeId"] = "{anchor:graphNodeId}"
        elif key in ("qualified_name", "qualifiedName"):
            out["qualified_name"] = "{anchor:symbol}"
        else:
            out[key] = value
    return out


def steps_from_trace(trace: dict[str, Any]) -> list[dict[str, Any]]:
    """Flatten ordered tool calls from a trace into playbook ``steps`` JSON.

    @param trace - InvestigationTrace-shaped dict.
    @returns Ordered step templates ``{order, tool, argsTemplate}``.
    """
    terms = {str(t) for t in (trace.get("terms") or []) if t}
    steps: list[dict[str, Any]] = []
    order = 1
    for iteration in trace.get("iterations") or []:
        for call in iteration.get("toolCalls") or []:
            tool = call.get("tool")
            if not tool or tool not in _RETRIEVAL_TOOLS:
                continue
            raw_args = call.get("args") or {}
            if not isinstance(raw_args, dict):
                raw_args = {}
            steps.append(
                {
                    "order": order,
                    "tool": tool,
                    "argsTemplate": _template_args(raw_args, terms),
                }
            )
            order += 1
    return steps


def _intent_profile(trace: dict[str, Any]) -> str:
    """Pick a valid intent_profile for insert, defaulting to balanced.

    @param trace - InvestigationTrace-shaped dict.
    @returns One of ``symbol_lookup``, ``conceptual``, ``balanced``.
    """
    raw = str(trace.get("intentProfile") or "balanced")
    if raw in ("symbol_lookup", "conceptual", "balanced"):
        return raw
    return "balanced"


def promote_trace_to_playbook(
    session: Session,
    settings: Settings,
    *,
    project_id: uuid.UUID,
    question: str,
    trace: dict[str, Any],
    message_id: uuid.UUID | None,
    user_id: uuid.UUID | None,
    message_meta: dict[str, Any] | None = None,
) -> uuid.UUID | None:
    """Promote a successful investigation into ``qa_playbooks`` (insert or merge).

    Embeds the question, merges when similarity ≥ ``QA_PLAYBOOK_MERGE_SIMILARITY``,
    otherwise inserts (evicting the lowest-value playbook when at the per-project cap).
    Commits on success. ``user_id`` is accepted for a future contract pass; audit columns
    still use the RAG service actor. ``message_id`` becomes ``source_message_id`` when set.

    @param session - Open SQLAlchemy session shared with the agent loop.
    @param settings - Application settings (playbook + embedding knobs).
    @param project_id - Project scope (L4).
    @param question - User question used as canonical text and embedding input.
    @param trace - InvestigationTrace from a successful (non-abstain) answer.
    @param message_id - Optional assistant message UUID for provenance.
    @param user_id - Optional end-user UUID (unused for audit until Node passes it).
    @param message_meta - Promotion guards; defaults to grounded non-abstain with citations
        inferred from ``evidenceAnchors`` when omitted.
    @returns Playbook UUID when promoted or merged, or None when skipped / disabled.
    """
    _ = user_id  # Reserved until EngineQueryRequest carries the chat user id.
    if not settings.qa_playbook_learning_enabled:
        return None

    meta = message_meta
    if meta is None:
        # Agent success path: gate already passed and citations were streamed from the pool.
        meta = {
            "abstained": False,
            "citation_count": len(trace.get("evidenceAnchors") or []),
        }
    if not is_trace_promotable(trace, meta):
        return None

    canonical = _normalize_question(question)
    if not canonical:
        return None

    steps = steps_from_trace(trace)
    if not steps:
        return None

    anchors = list(trace.get("evidenceAnchors") or [])
    repo = QaPlaybookRepository(session)

    try:
        embedding = EmbeddingClient(settings).embed_texts([canonical])[0]
    except Exception as exc:
        log_event(
            _logger,
            logging.WARNING,
            f"Playbook promote embed failed: {sanitize_log_message(str(exc))}",
        )
        return None

    merge_hits = repo.similarity_search(
        project_id=project_id,
        query_embedding=embedding,
        limit=1,
        min_similarity=settings.qa_playbook_merge_similarity,
    )
    if merge_hits:
        existing, _sim = merge_hits[0]
        # Why merge instead of insert: near-identical questions should reinforce one path
        # so storage stays sublinear (ADR 0027 cap / dedup posture).
        if repo.mark_success(existing.id):
            session.commit()
            return existing.id
        return None

    if repo.count_active(project_id) >= settings.qa_playbook_max_per_project:
        victim = repo.find_eviction_candidate(project_id)
        if victim is not None:
            repo.soft_delete(victim.id)

    row = repo.insert(
        project_id=project_id,
        canonical_question=canonical,
        intent_profile=_intent_profile(trace),
        steps=steps,
        evidence_anchors=anchors,
        question_embedding=embedding,
        source_message_id=message_id,
    )
    session.commit()
    return row.id


def find_similar_playbooks(
    session: Session,
    settings: Settings,
    *,
    project_id: uuid.UUID,
    question: str,
    limit: int = 3,
) -> list[PlaybookHint]:
    """Retrieve active playbooks similar to a new question for planner hints.

    Embeds the question and runs pgvector cosine search at
    ``QA_PLAYBOOK_MIN_SIMILARITY``. Returns an empty list when learning is disabled
    or embedding fails (caller should continue without hints).

    @param session - Open SQLAlchemy session.
    @param settings - Application settings.
    @param project_id - Project scope.
    @param question - New user question.
    @param limit - Maximum hints (ADR default K=3).
    @returns Playbook hints ordered by descending similarity.
    """
    if not settings.qa_playbook_learning_enabled:
        return []

    canonical = _normalize_question(question)
    if not canonical:
        return []

    try:
        embedding = EmbeddingClient(settings).embed_texts([canonical])[0]
    except Exception as exc:
        log_event(
            _logger,
            logging.WARNING,
            f"Playbook hint embed failed: {sanitize_log_message(str(exc))}",
        )
        return []

    rows = QaPlaybookRepository(session).similarity_search(
        project_id=project_id,
        query_embedding=embedding,
        limit=limit,
        min_similarity=settings.qa_playbook_min_similarity,
    )
    return [
        PlaybookHint(
            playbook_id=playbook.id,
            canonical_question=playbook.canonical_question,
            similarity=similarity,
            success_count=playbook.success_count,
            steps=list(playbook.steps or []),
            evidence_anchors=list(playbook.evidence_anchors or []),
            intent_profile=playbook.intent_profile,
        )
        for playbook, similarity in rows
    ]


def format_playbook_hints_for_planner(hints: list[PlaybookHint]) -> str:
    """Format similar playbooks as a planner system-prompt section.

    Hints are non-authoritative: the planner must still call tools and cite fresh
    evidence (NFR-7). Returns an empty string when there are no hints.

    @param hints - Similar playbooks from ``find_similar_playbooks``.
    @returns Prompt text, or ``""`` when ``hints`` is empty.
    """
    if not hints:
        return ""

    lines = [
        "Past successful investigations for similar questions in this project:",
    ]
    for index, hint in enumerate(hints, start=1):
        step_parts: list[str] = []
        for step in hint.steps:
            tool = step.get("tool", "?")
            args = step.get("argsTemplate") or {}
            if isinstance(args, dict) and args:
                # Compact one-arg display for the planner; full JSON remains in steps.
                first_key = next(iter(args))
                step_parts.append(f'{tool}("{args[first_key]}")')
            else:
                step_parts.append(str(tool))
        steps_text = " → ".join(step_parts) if step_parts else "(no steps)"
        anchors = []
        for anchor in hint.evidence_anchors:
            if isinstance(anchor, dict) and anchor.get("filePath"):
                anchors.append(str(anchor["filePath"]))
        anchors_text = ", ".join(anchors) if anchors else "(none)"
        lines.append(
            f'{index}. (similarity {hint.similarity:.2f}, used {hint.success_count} times) '
            f'"{hint.canonical_question}"\n'
            f"   Steps: {steps_text}\n"
            f"   Anchors: {anchors_text}"
        )
    lines.append(
        "Use these as hints only. You must still call tools and cite fresh evidence."
    )
    return "\n".join(lines)
