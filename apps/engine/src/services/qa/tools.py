"""Agent QA retrieval tools — thin wrappers over existing search and graph repositories.

The planner receives ``TOOL_DEFINITIONS`` (OpenAI function schemas) and calls
``execute_tool`` for each tool invocation. Results are ``QaToolHit`` lists suitable
for building an evidence pool and later ``RetrievalMatch`` confidence scoring.
No SQL is exposed to callers; project and active-row guards stay inside this module.
"""

from __future__ import annotations

import time
import uuid
from dataclasses import dataclass
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from config import Settings
from models import CodeChunk, GraphNode, Repo
from models.enums import RowStatus
from repositories import (
    CodeChunkRepository,
    GraphNodeRepository,
    expand_graph_neighbors,
    keyword_search,
    similarity_search,
    symbol_search,
)
from services.embedding.tei_client import EmbeddingClient
from services.llm.tokens import truncate_to_tokens
from services.retrieval.adaptive_top_k import resolve_project_tier, resolve_top_k
from services.retrieval.fusion import reciprocal_rank_fusion
from services.retrieval.query_intent import classify_query_intent, resolve_rrf_weights
from services.retrieval.query_terms import extract_search_terms

_SYMBOL_KINDS: tuple[str, ...] = ("function", "class", "method")
_GRAPH_EDGE_KINDS: tuple[str, ...] = ("http_call",)


@dataclass(frozen=True)
class QaToolHit:
    """One retrieval hit returned by a QA tool for the evidence pool.

    Fields mirror what the agent loop needs to emit citations and to build
    ``RetrievalMatch`` rows for hybrid confidence scoring.

    @param chunk_id - Active ``code_chunks`` primary key.
    @param repo_id - Repository that owns the chunk.
    @param file_path - Repo-relative path for citations.
    @param span - Line span dict (``startLine`` / ``endLine``) from the chunk.
    @param excerpt - Token-truncated chunk content for the planner / final prompt.
    @param scores - Per-retriever signals (symbol, keyword, vector_distance, fused, …).
    @param graph_node_id - Optional graph node that produced this hit.
    """

    chunk_id: uuid.UUID
    repo_id: uuid.UUID
    file_path: str
    span: dict[str, Any]
    excerpt: str
    scores: dict[str, float | None]
    graph_node_id: uuid.UUID | None = None


@dataclass(frozen=True)
class QaToolResult:
    """Timed, capped result of one ``execute_tool`` call.

    @param tool_name - Tool id that ran (e.g. ``search_symbols``).
    @param args - Sanitized arguments passed to the tool.
    @param hits - Ranked hits, already capped to ``QA_AGENT_MAX_TOOL_HITS``.
    @param truncated - True when more hits were available than returned.
    @param duration_ms - Wall-clock execution time in milliseconds.
    """

    tool_name: str
    args: dict[str, Any]
    hits: list[QaToolHit]
    truncated: bool
    duration_ms: float


TOOL_DEFINITIONS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "search_symbols",
            "description": (
                "Look up code symbols by name (functions, classes, methods) and return "
                "overlapping indexed chunks."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Symbol name or fragment to search for.",
                    },
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_code",
            "description": (
                "Keyword / identifier search over indexed chunk text using trigram similarity."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Natural-language or identifier query.",
                    },
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_vectors",
            "description": (
                "Semantic similarity search: embed the query and rank chunks by cosine distance."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Natural-language query to embed.",
                    },
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_hybrid",
            "description": (
                "Run symbol, keyword, and vector search in one pass, fuse with weighted RRF, "
                "and return the top fused chunks. Prefer this when unsure which leg to use."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Developer question or search query.",
                    },
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "graph_expand",
            "description": (
                "Walk outgoing graph edges (including cross-repo http_call) from a node and "
                "return chunks for reached files."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "node_id": {
                        "type": "string",
                        "description": "UUID of the seed graph_nodes row.",
                    },
                },
                "required": ["node_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "read_symbol",
            "description": (
                "Resolve an exact symbol to its best overlapping chunk. "
                "qualified_name is `symbol` or `file_path::symbol`."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "qualified_name": {
                        "type": "string",
                        "description": "Bare symbol or `path/to/file.ts::symbolName`.",
                    },
                },
                "required": ["qualified_name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "read_chunk",
            "description": "Fetch one active indexed code chunk by id (drill-down after search).",
            "parameters": {
                "type": "object",
                "properties": {
                    "chunk_id": {
                        "type": "string",
                        "description": "UUID of the code_chunks row.",
                    },
                },
                "required": ["chunk_id"],
            },
        },
    },
]


def tool_definitions_for_planner() -> list[dict[str, Any]]:
    """Return OpenAI-compatible tool schemas for the agent planner.

    Call this when building the planner chat request so the LLM can emit
    ``tool_calls``. The list is a shallow copy so callers cannot mutate the
    module-level ``TOOL_DEFINITIONS`` in place.

    @returns List of function-tool definition dicts.
    """
    return list(TOOL_DEFINITIONS)


def execute_tool(
    session: Session,
    settings: Settings,
    *,
    project_id: uuid.UUID,
    tool_name: str,
    args: dict[str, Any],
    repo_ids: list[uuid.UUID] | None,
) -> QaToolResult:
    """Dispatch one retrieval tool and return capped, timed hits.

    Every tool filters to ``project_id`` and active rows. Hit lists are capped at
    ``settings.qa_agent_max_tool_hits``; excerpts are truncated to
    ``settings.qa_agent_max_excerpt_tokens``.

    @param session - Active SQLAlchemy session.
    @param settings - Application settings (limits, retrieval tunables).
    @param project_id - Project scope for all queries.
    @param tool_name - One of the names in ``TOOL_DEFINITIONS``.
    @param args - Tool arguments from the planner (validated lightly per tool).
    @param repo_ids - Optional repo filter applied to search tools.
    @returns Timed ``QaToolResult`` with hits and a truncation flag.
    @raises ValueError when ``tool_name`` is unknown or required args are missing/invalid.
    """
    started = time.perf_counter()
    handlers = {
        "search_symbols": _search_symbols,
        "search_code": _search_code,
        "search_vectors": _search_vectors,
        "search_hybrid": _search_hybrid,
        "graph_expand": _graph_expand,
        "read_symbol": _read_symbol,
        "read_chunk": _read_chunk,
    }
    handler = handlers.get(tool_name)
    if handler is None:
        raise ValueError(f"Unknown QA tool: {tool_name}")

    hits, truncated = handler(
        session,
        settings,
        project_id=project_id,
        args=args,
        repo_ids=repo_ids,
    )
    duration_ms = (time.perf_counter() - started) * 1000.0
    return QaToolResult(
        tool_name=tool_name,
        args=dict(args),
        hits=hits,
        truncated=truncated,
        duration_ms=duration_ms,
    )


def parse_qualified_name(qualified_name: str) -> tuple[str | None, str]:
    """Split ``file_path::symbol`` or return a bare symbol name.

    Contract pattern (plan 01): ``symbol_name | file_path "::" symbol_name``.
    The first ``::`` separates path from symbol so dotted symbol names stay intact.

    @param qualified_name - Planner-supplied qualified name string.
    @returns ``(file_path_or_none, symbol_name)``.
    @raises ValueError when the symbol part is empty after parsing.
    """
    raw = qualified_name.strip()
    if "::" in raw:
        file_path, _, symbol = raw.partition("::")
        symbol = symbol.strip()
        path = file_path.strip() or None
        if not symbol:
            raise ValueError("qualified_name symbol part must not be empty")
        return path, symbol
    if not raw:
        raise ValueError("qualified_name must not be empty")
    return None, raw


def _cap_hits(
    hits: list[QaToolHit],
    max_hits: int,
) -> tuple[list[QaToolHit], bool]:
    """Apply the per-tool hit ceiling and report whether results were truncated.

    @param hits - Full hit list before capping.
    @param max_hits - Maximum hits to return (``QA_AGENT_MAX_TOOL_HITS``).
    @returns Capped hits and whether more were available.
    """
    if len(hits) <= max_hits:
        return hits, False
    return hits[:max_hits], True


def _excerpt_for_chunk(chunk: CodeChunk, settings: Settings) -> str:
    """Build a token-capped excerpt from chunk content for tool JSON.

    @param chunk - Source code chunk row.
    @param settings - Settings with ``qa_agent_max_excerpt_tokens``.
    @returns Truncated content string.
    """
    return truncate_to_tokens(chunk.content, settings.qa_agent_max_excerpt_tokens)


def _hit_from_chunk(
    chunk: CodeChunk,
    settings: Settings,
    *,
    scores: dict[str, float | None],
    graph_node_id: uuid.UUID | None = None,
) -> QaToolHit:
    """Convert an active code chunk into a ``QaToolHit``.

    @param chunk - Active chunk row.
    @param settings - Settings for excerpt truncation.
    @param scores - Retriever score map for this hit.
    @param graph_node_id - Optional related graph node id.
    @returns Populated tool hit.
    """
    span = chunk.span if isinstance(chunk.span, dict) else {}
    return QaToolHit(
        chunk_id=chunk.id,
        repo_id=chunk.repo_id,
        file_path=chunk.file_path,
        span=dict(span),
        excerpt=_excerpt_for_chunk(chunk, settings),
        scores=scores,
        graph_node_id=graph_node_id,
    )


def _require_string_arg(args: dict[str, Any], key: str) -> str:
    """Read a required non-empty string argument from tool args.

    @param args - Planner argument dict.
    @param key - Argument name.
    @returns Stripped string value.
    @raises ValueError when the key is missing or not a non-empty string.
    """
    value = args.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"Tool argument '{key}' must be a non-empty string")
    return value.strip()


def _parse_uuid_arg(args: dict[str, Any], key: str) -> uuid.UUID:
    """Parse a required UUID string argument.

    @param args - Planner argument dict.
    @param key - Argument name.
    @returns Parsed UUID.
    @raises ValueError when the value is missing or not a valid UUID.
    """
    raw = _require_string_arg(args, key)
    try:
        return uuid.UUID(raw)
    except ValueError as exc:
        raise ValueError(f"Tool argument '{key}' must be a valid UUID") from exc


def _span_start(chunk: CodeChunk) -> int:
    """Return the start line for a chunk span, or a large sentinel when absent.

    @param chunk - Chunk whose span is inspected.
    @returns Start line integer used for stable fallback ordering.
    """
    span = chunk.span if isinstance(chunk.span, dict) else {}
    return int(span.get("startLine") or span.get("start_line") or 10**9)


def _select_chunk_for_node(node: GraphNode, file_chunks: list[CodeChunk]) -> CodeChunk:
    """Pick the active chunk that best overlaps a graph node span.

    Prefers the largest line-span overlap with the node; falls back to the
    earliest chunk in the file when spans are missing. Mirrors
    ``graph_expand._select_chunk_for_node`` so tool and pipeline picks agree.

    @param node - Graph node whose definition span should be covered.
    @param file_chunks - Candidate active chunks for the node's file.
    @returns The most relevant chunk row.
    """
    node_span = node.span if isinstance(node.span, dict) else None
    if node_span is not None:
        node_start = int(node_span.get("startLine") or node_span.get("start_line") or 0)
        node_end = int(node_span.get("endLine") or node_span.get("end_line") or node_start)
        best: CodeChunk | None = None
        best_overlap = -1
        for chunk in file_chunks:
            span = chunk.span if isinstance(chunk.span, dict) else {}
            start = int(span.get("startLine") or span.get("start_line") or 0)
            end = int(span.get("endLine") or span.get("end_line") or start)
            overlap = min(end, node_end) - max(start, node_start)
            if overlap > best_overlap:
                best_overlap = overlap
                best = chunk
        if best is not None:
            return best
    return sorted(file_chunks, key=lambda chunk: (_span_start(chunk), str(chunk.id)))[0]


def _active_chunks_for_file(
    chunks_repo: CodeChunkRepository,
    *,
    project_id: uuid.UUID,
    repo_id: uuid.UUID,
    file_path: str,
) -> list[CodeChunk]:
    """List active chunks for a file, scoped to the project.

    ``list_by_repo_file`` does not filter status/project; this wrapper enforces
    the soft-delete and project guards required for QA tools.

    @param chunks_repo - Chunk repository bound to the session.
    @param project_id - Project scope.
    @param repo_id - Repository id.
    @param file_path - Repo-relative path.
    @returns Active chunks for that file in the project.
    """
    return [
        chunk
        for chunk in chunks_repo.list_by_repo_file(repo_id, file_path)
        if chunk.project_id == project_id and chunk.status == RowStatus.ACTIVE
    ]


def _search_symbols(
    session: Session,
    settings: Settings,
    *,
    project_id: uuid.UUID,
    args: dict[str, Any],
    repo_ids: list[uuid.UUID] | None,
) -> tuple[list[QaToolHit], bool]:
    """Run symbol name search and map chunks to tool hits.

    @param session - Active SQLAlchemy session.
    @param settings - Application settings.
    @param project_id - Project scope.
    @param args - Must include ``query``.
    @param repo_ids - Optional repo filter.
    @returns Capped hits and truncation flag.
    """
    query = _require_string_arg(args, "query")
    max_hits = settings.qa_agent_max_tool_hits
    pairs = symbol_search(
        session,
        project_id=project_id,
        terms=[query],
        limit=max_hits + 1,
        repo_ids=repo_ids,
        min_similarity=settings.retrieval_symbol_min_similarity,
    )
    hits = [
        _hit_from_chunk(chunk, settings, scores={"symbol": float(score)})
        for chunk, score in pairs[:max_hits]
    ]
    return hits, len(pairs) > max_hits


def _search_code(
    session: Session,
    settings: Settings,
    *,
    project_id: uuid.UUID,
    args: dict[str, Any],
    repo_ids: list[uuid.UUID] | None,
) -> tuple[list[QaToolHit], bool]:
    """Run keyword search with terms extracted from the query string.

    @param session - Active SQLAlchemy session.
    @param settings - Application settings.
    @param project_id - Project scope.
    @param args - Must include ``query``.
    @param repo_ids - Optional repo filter.
    @returns Capped hits and truncation flag.
    """
    query = _require_string_arg(args, "query")
    terms = extract_search_terms(query)
    max_hits = settings.qa_agent_max_tool_hits
    if not terms:
        return [], False
    pairs = keyword_search(
        session,
        project_id=project_id,
        terms=terms,
        limit=max_hits + 1,
        repo_ids=repo_ids,
        min_similarity=settings.retrieval_keyword_min_similarity,
    )
    hits = [
        _hit_from_chunk(chunk, settings, scores={"keyword": float(score)})
        for chunk, score in pairs[:max_hits]
    ]
    return hits, len(pairs) > max_hits


def _search_vectors(
    session: Session,
    settings: Settings,
    *,
    project_id: uuid.UUID,
    args: dict[str, Any],
    repo_ids: list[uuid.UUID] | None,
) -> tuple[list[QaToolHit], bool]:
    """Embed the query and run pgvector similarity search.

    @param session - Active SQLAlchemy session.
    @param settings - Application settings including embedding client config.
    @param project_id - Project scope.
    @param args - Must include ``query``.
    @param repo_ids - Optional repo filter.
    @returns Capped hits and truncation flag.
    """
    query = _require_string_arg(args, "query")
    max_hits = settings.qa_agent_max_tool_hits
    client = EmbeddingClient(settings)
    query_vector = client.embed_texts([query])[0]
    pairs = similarity_search(
        session,
        project_id=project_id,
        query_embedding=query_vector,
        limit=max_hits + 1,
        repo_ids=repo_ids,
    )
    hits = [
        _hit_from_chunk(chunk, settings, scores={"vector_distance": float(distance)})
        for chunk, distance in pairs[:max_hits]
    ]
    return hits, len(pairs) > max_hits


def _search_hybrid(
    session: Session,
    settings: Settings,
    *,
    project_id: uuid.UUID,
    args: dict[str, Any],
    repo_ids: list[uuid.UUID] | None,
) -> tuple[list[QaToolHit], bool]:
    """Fuse symbol, keyword, and vector legs with intent-aware RRF.

    Copies the fusion path from ``retrieve_code_chunks`` (intent, adaptive top-k,
    three legs, weighted RRF) but deliberately skips graph augment, rerank, and
    prune — those belong to other tools or the agent loop.

    @param session - Active SQLAlchemy session.
    @param settings - Application settings.
    @param project_id - Project scope.
    @param args - Must include ``query``.
    @param repo_ids - Optional repo filter.
    @returns Capped fused hits and truncation flag.
    """
    query = _require_string_arg(args, "query")
    max_hits = settings.qa_agent_max_tool_hits
    terms = extract_search_terms(query)
    intent = classify_query_intent(query, terms)
    chunk_count = CodeChunkRepository(session).count_active_by_project(
        project_id,
        repo_ids=repo_ids,
    )
    tier = resolve_project_tier(chunk_count, settings)
    top_k = resolve_top_k(tier, settings)
    symbol_weight, keyword_weight, vector_weight = resolve_rrf_weights(intent, settings)

    client = EmbeddingClient(settings)
    query_vector = client.embed_texts([query])[0]
    vector_hits = similarity_search(
        session,
        project_id=project_id,
        query_embedding=query_vector,
        limit=top_k["vector"],
        repo_ids=repo_ids,
    )
    keyword_hits = keyword_search(
        session,
        project_id=project_id,
        terms=terms,
        limit=top_k["keyword"],
        repo_ids=repo_ids,
        min_similarity=settings.retrieval_keyword_min_similarity,
    )
    symbol_hits = symbol_search(
        session,
        project_id=project_id,
        terms=terms if terms else [query],
        limit=top_k["symbol"],
        repo_ids=repo_ids,
        min_similarity=settings.retrieval_symbol_min_similarity,
    )

    fused = reciprocal_rank_fusion(
        vector_hits=vector_hits,
        keyword_hits=keyword_hits,
        symbol_hits=symbol_hits,
        rrf_k=settings.retrieval_rrf_k,
        vector_weight=vector_weight,
        keyword_weight=keyword_weight,
        symbol_weight=symbol_weight,
        limit=max_hits + 1,
    )
    hits = [
        _hit_from_chunk(
            match.chunk,
            settings,
            scores={
                "fused": match.fused_score,
                "vector_distance": match.vector_distance,
                "keyword": match.keyword_score,
                "symbol": match.symbol_score,
            },
        )
        for match in fused[:max_hits]
    ]
    return hits, len(fused) > max_hits


def _graph_expand(
    session: Session,
    settings: Settings,
    *,
    project_id: uuid.UUID,
    args: dict[str, Any],
    repo_ids: list[uuid.UUID] | None,
) -> tuple[list[QaToolHit], bool]:
    """Expand graph neighbors from a seed node and map them to chunks.

    Always available (no feature toggle). Caps walks with
    ``retrieval_graph_max_depth`` / ``retrieval_graph_max_extra_chunks`` and the
    global ``qa_agent_max_tool_hits`` ceiling.

    @param session - Active SQLAlchemy session.
    @param settings - Application settings with graph walk caps.
    @param project_id - Project scope for the seed node and chunks.
    @param args - Must include ``node_id`` (UUID string).
    @param repo_ids - Unused for expansion; reserved for future filtering.
    @returns Capped neighbor hits and truncation flag.
    """
    _ = repo_ids
    node_id = _parse_uuid_arg(args, "node_id")
    nodes_repo = GraphNodeRepository(session)
    chunks_repo = CodeChunkRepository(session)
    seed = nodes_repo.get_by_id(node_id)
    # Reject soft-deleted or cross-project seeds so the tool cannot leak other tenants.
    if (
        seed is None
        or seed.project_id != project_id
        or seed.status != RowStatus.ACTIVE
    ):
        return [], False

    neighbors = expand_graph_neighbors(
        session,
        seed_node_ids=[node_id],
        max_depth=settings.retrieval_graph_max_depth,
        edge_kinds=_GRAPH_EDGE_KINDS,
    )
    max_hits = settings.qa_agent_max_tool_hits
    extra_budget = min(settings.retrieval_graph_max_extra_chunks, max_hits)
    hits: list[QaToolHit] = []
    seen_chunk_ids: set[uuid.UUID] = set()
    truncated = False

    for neighbor_id, depth in neighbors:
        if depth == 0:
            continue
        if len(hits) >= extra_budget:
            truncated = True
            break
        node = nodes_repo.get_by_id(neighbor_id)
        if (
            node is None
            or node.project_id != project_id
            or node.status != RowStatus.ACTIVE
            or node.file_path is None
        ):
            continue
        file_chunks = _active_chunks_for_file(
            chunks_repo,
            project_id=project_id,
            repo_id=node.repo_id,
            file_path=node.file_path,
        )
        if not file_chunks:
            continue
        candidate = _select_chunk_for_node(node, file_chunks)
        if candidate.id in seen_chunk_ids:
            continue
        seen_chunk_ids.add(candidate.id)
        hits.append(
            _hit_from_chunk(
                candidate,
                settings,
                scores={"graph_depth": float(depth)},
                graph_node_id=node.id,
            ),
        )

    if len(hits) > max_hits:
        return hits[:max_hits], True
    return hits, truncated


def _find_symbol_nodes(
    session: Session,
    *,
    project_id: uuid.UUID,
    symbol_name: str,
    file_path: str | None,
    repo_ids: list[uuid.UUID] | None,
) -> list[GraphNode]:
    """Locate active symbol graph nodes matching a qualified name.

    Case-insensitive name match; optional exact ``file_path`` when the planner
    supplied ``path::symbol``.

    @param session - Active SQLAlchemy session.
    @param project_id - Project scope.
    @param symbol_name - Symbol identifier to match.
    @param file_path - Optional repo-relative file path filter.
    @param repo_ids - Optional repo filter.
    @returns Matching active graph nodes with a non-null file path.
    """
    stmt = (
        select(GraphNode)
        .join(Repo, GraphNode.repo_id == Repo.id)
        .where(
            GraphNode.project_id == project_id,
            GraphNode.kind.in_(_SYMBOL_KINDS),
            GraphNode.status == RowStatus.ACTIVE,
            Repo.status == RowStatus.ACTIVE,
            GraphNode.file_path.is_not(None),
            func.lower(GraphNode.name) == symbol_name.lower(),
        )
        .order_by(GraphNode.file_path, GraphNode.name)
    )
    if file_path is not None:
        stmt = stmt.where(GraphNode.file_path == file_path)
    if repo_ids is not None:
        stmt = stmt.where(GraphNode.repo_id.in_(repo_ids))
    return list(session.scalars(stmt).all())


def _read_symbol(
    session: Session,
    settings: Settings,
    *,
    project_id: uuid.UUID,
    args: dict[str, Any],
    repo_ids: list[uuid.UUID] | None,
) -> tuple[list[QaToolHit], bool]:
    """Resolve ``qualified_name`` to the best overlapping chunk per matching node.

    @param session - Active SQLAlchemy session.
    @param settings - Application settings.
    @param project_id - Project scope.
    @param args - Must include ``qualified_name``.
    @param repo_ids - Optional repo filter.
    @returns Capped hits (one preferred chunk per matched symbol node).
    """
    qualified_name = _require_string_arg(args, "qualified_name")
    file_path, symbol_name = parse_qualified_name(qualified_name)
    nodes = _find_symbol_nodes(
        session,
        project_id=project_id,
        symbol_name=symbol_name,
        file_path=file_path,
        repo_ids=repo_ids,
    )
    chunks_repo = CodeChunkRepository(session)
    max_hits = settings.qa_agent_max_tool_hits
    hits: list[QaToolHit] = []
    seen_chunk_ids: set[uuid.UUID] = set()

    for node in nodes:
        if node.file_path is None:
            continue
        file_chunks = _active_chunks_for_file(
            chunks_repo,
            project_id=project_id,
            repo_id=node.repo_id,
            file_path=node.file_path,
        )
        if not file_chunks:
            continue
        candidate = _select_chunk_for_node(node, file_chunks)
        if candidate.id in seen_chunk_ids:
            continue
        seen_chunk_ids.add(candidate.id)
        hits.append(
            _hit_from_chunk(
                candidate,
                settings,
                scores={"symbol": 1.0},
                graph_node_id=node.id,
            ),
        )
        if len(hits) > max_hits:
            break

    return _cap_hits(hits, max_hits)


def _read_chunk(
    session: Session,
    settings: Settings,
    *,
    project_id: uuid.UUID,
    args: dict[str, Any],
    repo_ids: list[uuid.UUID] | None,
) -> tuple[list[QaToolHit], bool]:
    """Fetch one active chunk by id, rejecting other projects and soft-deletes.

    @param session - Active SQLAlchemy session.
    @param settings - Application settings.
    @param project_id - Project scope the chunk must belong to.
    @param args - Must include ``chunk_id``.
    @param repo_ids - Optional repo allow-list; mismatched repo yields no hit.
    @returns Single-hit list or empty when the chunk is out of scope.
    """
    chunk_id = _parse_uuid_arg(args, "chunk_id")
    chunk = CodeChunkRepository(session).get_by_id(chunk_id)
    # Soft-deleted or foreign-project rows must not appear in tool results (tenant guard).
    if (
        chunk is None
        or chunk.project_id != project_id
        or chunk.status != RowStatus.ACTIVE
    ):
        return [], False
    if repo_ids is not None and chunk.repo_id not in repo_ids:
        return [], False
    return [_hit_from_chunk(chunk, settings, scores={})], False
