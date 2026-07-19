"""Follow-up QA context: rewrite vague questions and seed evidence from prior turns.

ADR 0028 — multi-turn follow-ups must not treat prior answer prose as evidence.
Instead we (1) rewrite the question into a standalone form using history, then
(2) re-fetch prior citations/anchors via tools into the evidence pool, then
(3) fall back to the normal agent planner when local seed confidence is too low.
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from typing import Any

from sqlalchemy.orm import Session

from config import Settings
from config.logging import get_indexing_logger, log_event, sanitize_log_message
from services.llm.prompts import build_followup_rewrite_messages
from services.llm.vllm_client import LlmToolCallingError, complete_text
from services.qa.tools import QaToolResult, execute_tool

_logger = get_indexing_logger()


@dataclass(frozen=True)
class FollowupSeedStep:
    """One deterministic tool invocation used to seed the evidence pool.

    @param tool - Tool name (``read_chunks_for_path`` or ``graph_expand``).
    @param args - Arguments passed to ``execute_tool``.
    @param result - Tool result when the call succeeded.
    @param error - Sanitized error message when the call failed (skipped).
    """

    tool: str
    args: dict[str, Any]
    result: QaToolResult | None = None
    error: str | None = None


def prior_evidence_nonempty(prior: dict[str, Any] | None) -> bool:
    """Return True when priorEvidence has at least one citation or evidence anchor.

    @param prior - Optional prior-evidence dict from the engine request.
    @returns Whether local seed should run.
    """
    if not prior:
        return False
    citations = prior.get("citations") or []
    anchors = prior.get("evidenceAnchors") or prior.get("evidence_anchors") or []
    return bool(citations) or bool(anchors)


def should_apply_followup_context(
    settings: Settings,
    history: list[dict[str, str]] | None,
) -> bool:
    """Return True when follow-up rewrite (and optional seed) should run.

    Requires the feature toggle and at least one prior conversation turn.

    @param settings - Application settings (``qa_followup_context_enabled``).
    @param history - Prior turns oldest-first, or None.
    @returns Whether to apply ADR 0028 follow-up context.
    """
    if not settings.qa_followup_context_enabled:
        return False
    return bool(history)


def rewrite_followup_question(
    settings: Settings,
    question: str,
    history: list[dict[str, str]],
) -> str:
    """Rewrite a follow-up into a standalone question using conversation history.

    On LLM failure or empty output, returns the original ``question`` unchanged so
    the agent loop can still proceed.

    @param settings - Application settings including LLM endpoints.
    @param question - Current user question (may be vague).
    @param history - Prior turns oldest-first.
    @returns Standalone question text for retrieval and final answer.
    """
    if not history:
        return question
    messages = build_followup_rewrite_messages(question, history)
    try:
        rewritten = complete_text(settings, messages, max_tokens=256, temperature=0.0)
    except LlmToolCallingError as exc:
        log_event(
            _logger,
            logging.WARNING,
            f"Follow-up rewrite failed; using original question: "
            f"{sanitize_log_message(str(exc))}",
        )
        return question
    cleaned = rewritten.strip().strip('"').strip("'").strip()
    if not cleaned:
        return question
    # Models sometimes prefix with "Rewritten:" — strip a short label line.
    if "\n" in cleaned:
        cleaned = cleaned.splitlines()[0].strip()
    return cleaned or question


def _around_line_from_span(span: object) -> int | None:
    """Extract a 1-based line anchor from a citation span object.

    @param span - Citation ``span`` (dict with startLine/endLine or similar).
    @returns Line number for ``read_chunks_for_path``, or None.
    """
    if not isinstance(span, dict):
        return None
    for key in ("startLine", "start_line", "aroundLine", "around_line"):
        value = span.get(key)
        if isinstance(value, int) and value > 0:
            return value
        if isinstance(value, float) and value > 0:
            return int(value)
        if isinstance(value, str) and value.isdigit():
            parsed = int(value)
            if parsed > 0:
                return parsed
    return None


def seed_pool_from_prior_evidence(
    session: Session,
    settings: Settings,
    *,
    project_id: uuid.UUID,
    prior: dict[str, Any],
    repo_ids: list[uuid.UUID] | None,
) -> list[FollowupSeedStep]:
    """Re-fetch prior-turn citations and graph anchors into tool results.

    Does not mutate the evidence pool — the caller adds hits and emits SSE.
    Soft-deleted or missing paths raise ``ValueError`` from tools and are skipped.

    @param session - Active SQLAlchemy session.
    @param settings - Seed caps and tool limits.
    @param project_id - Project scope for tools.
    @param prior - ``priorEvidence`` dict (citations + evidenceAnchors).
    @param repo_ids - Optional repo filter.
    @returns Ordered seed steps (successful and failed).
    """
    steps: list[FollowupSeedStep] = []
    citations = list(prior.get("citations") or [])[: settings.qa_followup_max_seed_citations]
    seen_paths: set[str] = set()

    for citation in citations:
        if not isinstance(citation, dict):
            continue
        path = citation.get("filePath") or citation.get("file_path")
        if not isinstance(path, str) or not path.strip():
            continue
        path = path.strip()
        # Deduplicate identical path+line seeds from overlapping citations.
        around = _around_line_from_span(citation.get("span"))
        dedupe_key = f"{path}:{around or 0}"
        if dedupe_key in seen_paths:
            continue
        seen_paths.add(dedupe_key)
        args: dict[str, Any] = {"path": path}
        if around is not None:
            args["around_line"] = around
        steps.append(_run_seed_tool(
            session,
            settings,
            project_id=project_id,
            tool_name="read_chunks_for_path",
            args=args,
            repo_ids=repo_ids,
        ))

    anchors = list(prior.get("evidenceAnchors") or prior.get("evidence_anchors") or [])
    graph_count = 0
    seen_nodes: set[str] = set()
    for anchor in anchors:
        if graph_count >= settings.qa_followup_max_graph_expands:
            break
        if not isinstance(anchor, dict):
            continue
        node_id = anchor.get("graphNodeId") or anchor.get("graph_node_id")
        if not isinstance(node_id, str) or not node_id.strip():
            continue
        node_id = node_id.strip()
        if node_id in seen_nodes:
            continue
        seen_nodes.add(node_id)
        graph_count += 1
        steps.append(_run_seed_tool(
            session,
            settings,
            project_id=project_id,
            tool_name="graph_expand",
            args={"node_id": node_id},
            repo_ids=repo_ids,
        ))

    return steps


def _run_seed_tool(
    session: Session,
    settings: Settings,
    *,
    project_id: uuid.UUID,
    tool_name: str,
    args: dict[str, Any],
    repo_ids: list[uuid.UUID] | None,
) -> FollowupSeedStep:
    """Execute one seed tool call, catching ValueError into a failed step.

    @param session - Active SQLAlchemy session.
    @param settings - Application settings.
    @param project_id - Project scope.
    @param tool_name - Tool to invoke.
    @param args - Tool arguments.
    @param repo_ids - Optional repo filter.
    @returns Seed step with result or error.
    """
    try:
        result = execute_tool(
            session,
            settings,
            project_id=project_id,
            tool_name=tool_name,
            args=args,
            repo_ids=repo_ids,
        )
        return FollowupSeedStep(tool=tool_name, args=args, result=result)
    except ValueError as exc:
        return FollowupSeedStep(
            tool=tool_name,
            args=args,
            error=sanitize_log_message(str(exc)),
        )
