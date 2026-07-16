"""Shared retrieval result types for hybrid search."""

from __future__ import annotations

from dataclasses import dataclass

from models import CodeChunk


@dataclass(frozen=True)
class RetrievalMatch:
    """One fused retrieval hit with per-retriever evidence.

    ``fused_score`` is higher-is-better (RRF output). Optional per-leg scores
    preserve the raw signal used by the confidence gate and debug logging.

    @param chunk - Retrieved code chunk row.
    @param fused_score - Combined RRF score (higher = better match).
    @param sources - Retriever legs that contributed (``vector``, ``keyword``, ``symbol``).
    @param vector_distance - Cosine distance when the vector leg matched (lower = better).
    @param keyword_score - pg_trgm similarity when the keyword leg matched.
    @param symbol_score - Symbol name similarity when the symbol leg matched.
    @param graph_depth - Hop depth when added via graph expansion (``None``/0 = fused seed).
    @param is_graph_expanded - True when the match was appended by graph expansion.
    """

    chunk: CodeChunk
    fused_score: float
    sources: tuple[str, ...] = ()
    vector_distance: float | None = None
    keyword_score: float | None = None
    symbol_score: float | None = None
    graph_depth: int | None = None
    is_graph_expanded: bool = False
