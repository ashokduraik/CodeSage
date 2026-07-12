"""Hybrid confidence scoring for retrieval abstain decisions."""

from __future__ import annotations

from config import Settings
from services.retrieval.query_intent import QueryIntentProfile, resolve_rrf_weights
from services.retrieval.types import RetrievalMatch


def _retrieval_score(matches: list[RetrievalMatch], settings: Settings, intent: QueryIntentProfile) -> float:
    """Normalize top fused score against the theoretical rank-1 RRF maximum.

    @param matches - Pruned retrieval hits, best first.
    @param settings - Application settings (RRF ``k`` and weights).
    @param intent - Active intent profile for weight resolution.
    """
    if not matches:
        return 0.0
    symbol_w, keyword_w, vector_w = resolve_rrf_weights(intent, settings)
    max_score = (
        symbol_w / (settings.retrieval_rrf_k + 1)
        + keyword_w / (settings.retrieval_rrf_k + 1)
        + vector_w / (settings.retrieval_rrf_k + 1)
    )
    if max_score <= 0.0:
        return 0.0
    return min(matches[0].fused_score / max_score, 1.0)


def _graph_connectivity(matches: list[RetrievalMatch]) -> float:
    """Score how directly the top hits connect to fused seeds (not distant graph hops).

    @param matches - Pruned retrieval hits, best first.
    """
    if not matches:
        return 0.0
    top = matches[:3]
    if all(not match.is_graph_expanded for match in top):
        return 1.0
    best = matches[0]
    depth = best.graph_depth if best.graph_depth is not None else 0
    return max(0.0, 1.0 - min(depth, 2) * 0.25)


def _symbol_exactness(matches: list[RetrievalMatch], terms: list[str]) -> float:
    """Score symbol/keyword strength in the top hits, with exact symbol_ref boost.

    @param matches - Pruned retrieval hits, best first.
    @param terms - Query identifier tokens.
    """
    if not matches:
        return 0.0
    top_scores: list[float] = []
    lowered_terms = {term.lower() for term in terms}
    for match in matches[:3]:
        leg_score = max(match.symbol_score or 0.0, match.keyword_score or 0.0)
        refs = getattr(match.chunk, "symbol_refs", None) or []
        for ref in refs:
            name = ref.get("name", "") if isinstance(ref, dict) else str(ref)
            if name.lower() in lowered_terms:
                leg_score = min(1.0, leg_score + 0.25)
                break
        top_scores.append(min(leg_score, 1.0))
    return max(top_scores) if top_scores else 0.0


def _citation_coverage(matches: list[RetrievalMatch], settings: Settings) -> float:
    """Score diversity of source files in the pruned result set.

    @param matches - Pruned retrieval hits.
    @param settings - Minimum distinct files target.
    """
    if not matches:
        return 0.0
    distinct_files = len({match.chunk.file_path for match in matches})
    target = max(settings.retrieval_min_distinct_files, 1)
    return min(distinct_files / target, 1.0)


def compute_hybrid_confidence(
    matches: list[RetrievalMatch],
    settings: Settings,
    *,
    intent: QueryIntentProfile,
    terms: list[str],
) -> float:
    """Compute a composite confidence score in ``[0, 1]``.

    @param matches - Pruned retrieval hits, best first.
    @param settings - Weighted component settings.
    @param intent - Classified query intent.
    @param terms - Query identifier tokens.
    @returns Hybrid confidence score.
    """
    if not matches:
        return 0.0

    retrieval = _retrieval_score(matches, settings, intent)
    graph = _graph_connectivity(matches)
    symbol = _symbol_exactness(matches, terms)
    coverage = _citation_coverage(matches, settings)

    total_weight = (
        settings.retrieval_confidence_weight_retrieval
        + settings.retrieval_confidence_weight_graph
        + settings.retrieval_confidence_weight_symbol
        + settings.retrieval_confidence_weight_coverage
    )
    if total_weight <= 0.0:
        return 0.0

    score = (
        settings.retrieval_confidence_weight_retrieval * retrieval
        + settings.retrieval_confidence_weight_graph * graph
        + settings.retrieval_confidence_weight_symbol * symbol
        + settings.retrieval_confidence_weight_coverage * coverage
    ) / total_weight
    return min(max(score, 0.0), 1.0)


def has_hard_vector_fail(matches: list[RetrievalMatch], settings: Settings) -> bool:
    """Return True when only weak vector signal exists and distance exceeds the gate.

    Preserves calibrated abstain for generic or borderline vector-only hits.

    @param matches - Pruned retrieval hits, best first.
    @param settings - Vector distance threshold.
    """
    if not matches:
        return True
    top = matches[0]
    has_symbol = (top.symbol_score or 0.0) >= settings.retrieval_symbol_min_similarity
    has_keyword = (top.keyword_score or 0.0) >= settings.retrieval_keyword_min_similarity
    if has_symbol or has_keyword:
        return False
    if top.vector_distance is None:
        return True
    return top.vector_distance > settings.retrieval_max_distance
