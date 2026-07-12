"""Post-graph pruning of fused retrieval matches."""

from __future__ import annotations

from services.retrieval.query_intent import QueryIntentProfile
from services.retrieval.types import RetrievalMatch


def _intent_tiebreak(match: RetrievalMatch, intent: QueryIntentProfile) -> float:
    """Return a higher-is-better tie-break score for the active intent.

    @param match - Candidate retrieval hit.
    @param intent - Classified query intent profile.
    """
    if intent == QueryIntentProfile.SYMBOL_LOOKUP:
        symbol = match.symbol_score or 0.0
        keyword = match.keyword_score or 0.0
        return max(symbol, keyword)
    if intent == QueryIntentProfile.CONCEPTUAL:
        if match.vector_distance is None:
            return 0.0
        return 1.0 - min(match.vector_distance, 1.0)
    symbol = match.symbol_score or 0.0
    keyword = match.keyword_score or 0.0
    vector = 0.0 if match.vector_distance is None else 1.0 - min(match.vector_distance, 1.0)
    return max(symbol, keyword, vector)


def _prune_sort_key(match: RetrievalMatch, intent: QueryIntentProfile) -> tuple:
    """Build a sort key that prefers fused seeds over graph-expanded chunks.

    @param match - Candidate retrieval hit.
    @param intent - Classified query intent profile.
    """
    depth = match.graph_depth if match.graph_depth is not None else 0
    return (
        -match.fused_score,
        match.is_graph_expanded,
        depth,
        -_intent_tiebreak(match, intent),
        match.chunk.file_path,
    )


def prune_matches(
    matches: list[RetrievalMatch],
    *,
    limit: int,
    intent: QueryIntentProfile,
) -> list[RetrievalMatch]:
    """Re-rank and keep the top matches for LLM context packing.

    Graph-expanded chunks are demoted relative to fused seeds with similar scores.

    @param matches - Fused and graph-augmented hits.
    @param limit - Maximum matches to return.
    @param intent - Classified query intent (tie-break preference).
    @returns Pruned list, best first.
    """
    if limit <= 0 or not matches:
        return []
    ranked = sorted(matches, key=lambda match: _prune_sort_key(match, intent))
    return ranked[:limit]
