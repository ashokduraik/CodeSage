"""QA investigation playbooks — promote, hint, invalidate, and optional warm-start.

Implements ADR 0027 milestones P2–P4: promote successful traces, retrieve planner
hints, soft-delete stale playbooks on re-index, validate anchors before use, and
(optionally) warm-start iteration 1 when ``QA_PLAYBOOK_WARM_START_ENABLED`` is on.
"""

from __future__ import annotations

import logging
import re
import uuid
from dataclasses import dataclass
from typing import Any

from sqlalchemy.orm import Session

from config import Settings
from config import constants
from config.logging import get_indexing_logger, log_event, sanitize_log_message
from models.enums import RowStatus
from models.qa_playbook import QaPlaybook
from repositories.indexing import CodeChunkRepository, GraphNodeRepository
from repositories.qa_playbooks import QaPlaybookRepository
from services.embedding.tei_client import EmbeddingClient
from services.qa.tools import QaToolHit, QaToolResult, execute_tool

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

# Placeholder forms stored in playbook steps (ADR 0027): {term:…} / {anchor:…}.
_PLACEHOLDER_RE = re.compile(r"^\{(term|anchor):([^}]+)\}$")


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


@dataclass
class WarmStartStepResult:
    """One warm-start tool execution for SSE / investigation-trace recording.

    @param tool - Tool name executed.
    @param args - Resolved concrete arguments (placeholders substituted).
    @param result - Tool result when execution succeeded; None on failure.
    @param error - Sanitized error message when execution failed.
    """

    tool: str
    args: dict[str, Any]
    result: QaToolResult | None = None
    error: str | None = None


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
    ``{anchor:…}`` so warm-start can resolve them against the new question.

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
    validate_anchors: bool = True,
) -> list[PlaybookHint]:
    """Retrieve active playbooks similar to a new question for planner hints.

    Embeds the question and runs pgvector cosine search at
    ``QA_PLAYBOOK_MIN_SIMILARITY``. Returns an empty list when learning is disabled
    or embedding fails (caller should continue without hints). When
    ``validate_anchors`` is True (default), playbooks whose anchors no longer exist
    in the active index are skipped silently.

    @param session - Open SQLAlchemy session.
    @param settings - Application settings.
    @param project_id - Project scope.
    @param question - New user question.
    @param limit - Maximum hints (ADR default K=3).
    @param validate_anchors - When True, drop playbooks that fail anchor checks.
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

    # Over-fetch slightly so anchor validation can drop stale rows without undershooting K.
    fetch_limit = limit * 3 if validate_anchors else limit
    rows = QaPlaybookRepository(session).similarity_search(
        project_id=project_id,
        query_embedding=embedding,
        limit=fetch_limit,
        min_similarity=settings.qa_playbook_min_similarity,
    )
    hints: list[PlaybookHint] = []
    for playbook, similarity in rows:
        if validate_anchors and not validate_playbook_anchors(
            session, project_id=project_id, playbook=playbook
        ):
            continue
        hints.append(
            PlaybookHint(
                playbook_id=playbook.id,
                canonical_question=playbook.canonical_question,
                similarity=similarity,
                success_count=playbook.success_count,
                steps=list(playbook.steps or []),
                evidence_anchors=list(playbook.evidence_anchors or []),
                intent_profile=playbook.intent_profile,
            )
        )
        if len(hints) >= limit:
            break
    return hints


def _hint_arg_display(value: object) -> str:
    """Format one playbook argsTemplate value for the planner prompt.

    Replaces ``{term:X}`` / ``{anchor:Y}`` braces with ``term:X`` / ``anchor:Y`` so
    local tool-call parsers (Ollama / llama.cpp) do not treat curly braces inside the
    system prompt as incomplete JSON objects.

    @param value - Raw template value from a playbook step.
    @returns Safe display string without bare ``{`` / ``}`` delimiters.
    """
    text = str(value).strip()
    matched = _PLACEHOLDER_RE.fullmatch(text)
    if matched:
        return f"{matched.group(1)}:{matched.group(2)}"
    return text.replace("{", "(").replace("}", ")")


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
            if not isinstance(step, dict):
                continue
            tool = step.get("tool", "?")
            args = step.get("argsTemplate") or {}
            if isinstance(args, dict) and args:
                # Compact one-arg display for the planner; strip `{term:…}` braces so
                # Ollama/llama.cpp tool parsers do not treat them as JSON object delimiters.
                first_key = next(iter(args))
                display = _hint_arg_display(args[first_key])
                step_parts.append(f"{tool}({first_key}={display})")
            else:
                step_parts.append(str(tool))
        steps_text = " → ".join(step_parts) if step_parts else "(no steps)"
        anchors = []
        for anchor in hint.evidence_anchors:
            if isinstance(anchor, dict) and anchor.get("filePath"):
                anchors.append(str(anchor["filePath"]))
        anchors_text = ", ".join(anchors) if anchors else "(none)"
        lines.append(
            f"{index}. (similarity {hint.similarity:.2f}, used {hint.success_count} times) "
            f"question={hint.canonical_question}\n"
            f"   Steps: {steps_text}\n"
            f"   Anchors: {anchors_text}"
        )
    lines.append(
        "Use these as hints only. You must still call tools and cite fresh evidence."
    )
    return "\n".join(lines)


def _file_paths_from_playbook(playbook: QaPlaybook | PlaybookHint) -> set[str]:
    """Collect file paths referenced by a playbook's anchors and step templates.

    Invalidation (v1) uses fetch-and-filter in Python rather than a JSONB containment
    SQL query: active playbooks are capped at ``QA_PLAYBOOK_MAX_PER_PROJECT`` (500),
    so scanning anchors/steps in process is simpler and easy to unit-test.

    @param playbook - ORM row or hint with ``evidence_anchors`` / ``steps``.
    @returns Set of repo-relative file paths found on the playbook.
    """
    paths: set[str] = set()
    anchors = (
        playbook.evidence_anchors
        if isinstance(playbook, QaPlaybook)
        else playbook.evidence_anchors
    )
    for anchor in anchors or []:
        if not isinstance(anchor, dict):
            continue
        path = anchor.get("filePath") or anchor.get("file_path")
        if isinstance(path, str) and path.strip():
            paths.add(path.strip())

    steps = playbook.steps if isinstance(playbook, QaPlaybook) else playbook.steps
    for step in steps or []:
        if not isinstance(step, dict):
            continue
        args = step.get("argsTemplate") or {}
        if not isinstance(args, dict):
            continue
        for value in args.values():
            if not isinstance(value, str) or value.startswith("{"):
                continue
            # ``path::symbol`` qualified names and bare file paths in templates.
            if "::" in value:
                paths.add(value.split("::", 1)[0])
            elif "/" in value or value.endswith((".ts", ".tsx", ".js", ".jsx", ".py")):
                paths.add(value)
    return paths


def invalidate_playbooks_for_files(
    session: Session,
    *,
    project_id: uuid.UUID,
    file_paths: list[str],
) -> int:
    """Soft-delete active playbooks that reference any of the given file paths.

    Called from the embed job after chunks for changed files are re-vectorized so
    planner hints do not point at renamed or removed paths. Uses fetch-and-filter
    over active playbooks (see ``_file_paths_from_playbook``) and commits when at
    least one row is soft-deleted.

    @param session - Open SQLAlchemy session (embed job session).
    @param project_id - Project that owns the re-indexed repo.
    @param file_paths - Repo-relative paths whose chunks were just embedded.
    @returns Number of playbooks soft-deleted.
    """
    unique_paths = {p.strip() for p in file_paths if isinstance(p, str) and p.strip()}
    if not unique_paths:
        return 0

    repo = QaPlaybookRepository(session)
    # Cap equals the hard project limit so we never miss an active row at max capacity.
    active = repo.list_active(project_id, limit=constants.QA_PLAYBOOK_MAX_PER_PROJECT)
    invalidated = 0
    for playbook in active:
        referenced = _file_paths_from_playbook(playbook)
        if referenced & unique_paths:
            if repo.soft_delete(playbook.id):
                invalidated += 1

    if invalidated:
        session.commit()
    return invalidated


def validate_playbook_anchors(
    session: Session,
    *,
    project_id: uuid.UUID,
    playbook: QaPlaybook | PlaybookHint,
) -> bool:
    """Return whether a playbook's evidence anchors still exist in the active index.

    Every ``filePath`` in anchors must have at least one active ``code_chunks`` row
    for the project. When a ``graphNodeId`` / ``graph_node_id`` is present it must
    resolve to an active ``graph_nodes`` row in the same project. Callers skip
    invalid playbooks silently (hints and warm-start).

    @param session - Open SQLAlchemy session.
    @param project_id - Project scope for chunk / node lookups.
    @param playbook - ORM row or hint whose anchors to check.
    @returns True when all present anchors are still valid.
    """
    anchors = (
        playbook.evidence_anchors
        if isinstance(playbook, QaPlaybook)
        else playbook.evidence_anchors
    )
    if not anchors:
        # A playbook with no anchors cannot be validated against the index — treat
        # as invalid so we never warm-start or hint from an empty-anchor path.
        return False

    chunks = CodeChunkRepository(session)
    nodes = GraphNodeRepository(session)
    for anchor in anchors:
        if not isinstance(anchor, dict):
            return False
        path = anchor.get("filePath") or anchor.get("file_path")
        if isinstance(path, str) and path.strip():
            if not chunks.has_active_path(project_id, path.strip()):
                return False
        node_raw = anchor.get("graphNodeId") or anchor.get("graph_node_id")
        if node_raw is not None:
            try:
                node_id = uuid.UUID(str(node_raw))
            except (TypeError, ValueError):
                return False
            node = nodes.get_by_id(node_id)
            if (
                node is None
                or node.project_id != project_id
                or node.status != RowStatus.ACTIVE
            ):
                return False
    return True


def resolve_args_template(
    args_template: dict[str, Any],
    *,
    terms: list[str],
    anchors: list[dict[str, Any]],
) -> dict[str, Any]:
    """Resolve ``{term:…}`` / ``{anchor:…}`` placeholders for warm-start tool args.

    Term placeholders prefer an exact match in the new question's extracted terms,
    then the first new term, then the stored exemplar term. Anchor placeholders
    read from the playbook's evidence anchors plus any anchors collected from
    earlier warm-start tool hits in the same run.

    @param args_template - Step ``argsTemplate`` from the playbook.
    @param terms - Search terms from the new question.
    @param anchors - Combined playbook + runtime anchors (dicts with filePath/symbol/…).
    @returns Concrete args dict safe to pass to ``execute_tool``.
    """
    term_set = {t for t in terms if t}
    resolved: dict[str, Any] = {}
    for key, value in args_template.items():
        if not isinstance(value, str):
            resolved[key] = value
            continue
        match = _PLACEHOLDER_RE.match(value.strip())
        if match is None:
            resolved[key] = value
            continue
        kind, name = match.group(1), match.group(2)
        if kind == "term":
            if name in term_set:
                resolved[key] = name
            elif terms:
                resolved[key] = terms[0]
            else:
                resolved[key] = name
        else:
            # anchor — map common keys from evidence / hit provenance.
            resolved[key] = _resolve_anchor_value(name, anchors) or value
    return resolved


def _resolve_anchor_value(name: str, anchors: list[dict[str, Any]]) -> str | None:
    """Pick a concrete value for an ``{anchor:name}`` placeholder.

    @param name - Anchor key (``graphNodeId``, ``symbol``, ``filePath``, …).
    @param anchors - Ordered anchor dicts; first non-empty match wins.
    @returns String value or None when no anchor provides the key.
    """
    key_aliases = {
        "graphNodeId": ("graphNodeId", "graph_node_id"),
        "graph_node_id": ("graphNodeId", "graph_node_id"),
        "symbol": ("symbol",),
        "filePath": ("filePath", "file_path"),
        "file_path": ("filePath", "file_path"),
    }
    keys = key_aliases.get(name, (name,))
    for anchor in anchors:
        for key in keys:
            raw = anchor.get(key)
            if raw is not None and str(raw).strip():
                return str(raw).strip()
    return None


def _anchors_from_hits(hits: list[QaToolHit]) -> list[dict[str, Any]]:
    """Build runtime anchors from tool hits for subsequent placeholder resolution.

    @param hits - Hits from the previous warm-start tool call.
    @returns Anchor dicts with filePath / symbol / graphNodeId when present.
    """
    out: list[dict[str, Any]] = []
    for hit in hits:
        anchor: dict[str, Any] = {"filePath": hit.file_path}
        if hit.graph_node_id is not None:
            anchor["graphNodeId"] = str(hit.graph_node_id)
        out.append(anchor)
    return out


def select_warm_start_playbook(
    settings: Settings,
    hints: list[PlaybookHint],
) -> PlaybookHint | None:
    """Return the best hint eligible for warm-start, or None.

    Requires ``QA_PLAYBOOK_WARM_START_ENABLED``, similarity ≥
    ``QA_PLAYBOOK_WARM_START_SIMILARITY``, and a non-empty step list. Anchor
    validation is the caller's responsibility (hints from ``find_similar_playbooks``
    are already validated by default).

    @param settings - Application settings including warm-start knobs.
    @param hints - Similarity-ordered playbook hints (best first).
    @returns The first eligible hint, or None when warm-start must not run.
    """
    if not settings.qa_playbook_warm_start_enabled:
        return None
    for hint in hints:
        if hint.similarity < settings.qa_playbook_warm_start_similarity:
            continue
        if not hint.steps:
            continue
        return hint
    return None


def execute_warm_start_steps(
    session: Session,
    settings: Settings,
    *,
    project_id: uuid.UUID,
    playbook: PlaybookHint,
    terms: list[str],
    repo_ids: list[uuid.UUID] | None,
) -> list[WarmStartStepResult]:
    """Execute playbook steps deterministically for warm-start iteration 1.

    Resolves placeholders against the new question's terms and the playbook's
    evidence anchors, then calls ``execute_tool`` for each step. Runtime anchors
    from earlier hits feed later ``{anchor:…}`` placeholders (e.g. graph expand).

    @param session - Open SQLAlchemy session.
    @param settings - Application settings (tool limits).
    @param project_id - Project scope.
    @param playbook - Hint / playbook whose ``steps`` to replay.
    @param terms - Extracted terms from the new question.
    @param repo_ids - Optional repo filter for tools.
    @returns Ordered step results (including failed tools).
    """
    runtime_anchors: list[dict[str, Any]] = [
        a for a in playbook.evidence_anchors if isinstance(a, dict)
    ]
    ordered = sorted(
        (s for s in playbook.steps if isinstance(s, dict)),
        key=lambda s: int(s.get("order") or 0),
    )
    results: list[WarmStartStepResult] = []
    for step in ordered:
        tool = step.get("tool")
        if not tool or tool not in _RETRIEVAL_TOOLS:
            continue
        raw_template = step.get("argsTemplate") or {}
        if not isinstance(raw_template, dict):
            raw_template = {}
        args = resolve_args_template(
            raw_template, terms=terms, anchors=runtime_anchors
        )
        try:
            result = execute_tool(
                session,
                settings,
                project_id=project_id,
                tool_name=str(tool),
                args=args,
                repo_ids=repo_ids,
            )
        except ValueError as exc:
            results.append(
                WarmStartStepResult(
                    tool=str(tool),
                    args=args,
                    error=sanitize_log_message(str(exc)),
                )
            )
            continue
        runtime_anchors = _anchors_from_hits(result.hits) + runtime_anchors
        results.append(WarmStartStepResult(tool=str(tool), args=args, result=result))
    return results
