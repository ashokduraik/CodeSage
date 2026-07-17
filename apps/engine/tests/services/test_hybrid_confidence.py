"""Tests for hybrid retrieval confidence scoring."""

import uuid
from unittest.mock import MagicMock

from config import Settings
from services.retrieval.hybrid_confidence import (
    compute_hybrid_confidence,
    excerpt_term_overlap,
    has_hard_vector_fail,
)
from services.retrieval.query_intent import QueryIntentProfile
from services.retrieval.types import RetrievalMatch


def _make_match(
    *,
    fused_score: float = 0.1,
    vector_distance: float | None = None,
    symbol_score: float | None = None,
    keyword_score: float | None = None,
    file_path: str = "a.ts",
    symbol_refs: list | None = None,
    content: str = "",
    is_graph_expanded: bool = False,
    graph_depth: int | None = None,
) -> RetrievalMatch:
    chunk = MagicMock()
    chunk.id = uuid.uuid4()
    chunk.file_path = file_path
    chunk.symbol_refs = symbol_refs or []
    chunk.content = content
    return RetrievalMatch(
        chunk=chunk,
        fused_score=fused_score,
        sources=("vector",),
        vector_distance=vector_distance,
        symbol_score=symbol_score,
        keyword_score=keyword_score,
        is_graph_expanded=is_graph_expanded,
        graph_depth=graph_depth,
    )


def test_compute_hybrid_confidence_empty() -> None:
    score = compute_hybrid_confidence(
        [],
        Settings(),
        intent=QueryIntentProfile.BALANCED,
        terms=[],
    )
    assert score == 0.0


def test_compute_hybrid_confidence_strong_symbol_hit() -> None:
    match = _make_match(
        fused_score=0.1,
        symbol_score=0.8,
        symbol_refs=[{"name": "getMinEmi"}],
        content="export function getMinEmi() {}",
    )
    score = compute_hybrid_confidence(
        [match],
        Settings(),
        intent=QueryIntentProfile.SYMBOL_LOOKUP,
        terms=["getMinEmi"],
    )
    assert score >= 0.45


def test_excerpt_term_overlap_matches_emi() -> None:
    """EMI / getEMIAmount excerpts score high overlap for EMI query terms."""
    excerpt = (
        "export function getEMIAmount(P, R, N) {\n"
        "  // EMI = P * R * Math.pow(1 + R, N) / (Math.pow(1 + R, N) - 1)\n"
        "}"
    )
    assert excerpt_term_overlap(excerpt, ["EMI"]) == 1.0
    assert excerpt_term_overlap(excerpt, ["EMI", "missing"]) == 0.5


def test_excerpt_term_overlap_empty_terms() -> None:
    assert excerpt_term_overlap("getEMIAmount EMI formula", []) == 0.0


def test_symbol_exactness_boosts_on_symbol_refs() -> None:
    """Exact symbol_ref name match raises the symbol exactness leg (+0.25)."""
    match = _make_match(
        fused_score=0.05,
        symbol_score=0.5,
        keyword_score=0.4,
        symbol_refs=[{"name": "getEMIAmount"}],
        content="export function getEMIAmount() { return 0; }",
    )
    boosted = compute_hybrid_confidence(
        [match],
        Settings(),
        intent=QueryIntentProfile.BALANCED,
        terms=["getEMIAmount"],
    )
    plain = compute_hybrid_confidence(
        [_make_match(fused_score=0.05, symbol_score=0.5, keyword_score=0.4)],
        Settings(),
        intent=QueryIntentProfile.BALANCED,
        terms=["getEMIAmount"],
    )
    assert boosted > plain


def test_hard_vector_fail_still_blocks_weak_vector_only() -> None:
    settings = Settings(retrieval_max_distance=0.45)
    match = _make_match(vector_distance=0.9, content="unrelated widget code")
    assert has_hard_vector_fail([match], settings) is True


def test_has_hard_vector_fail_when_distance_too_high() -> None:
    settings = Settings(retrieval_max_distance=0.45)
    match = _make_match(vector_distance=0.9)
    assert has_hard_vector_fail([match], settings) is True


def test_has_hard_vector_fail_passes_with_symbol_signal() -> None:
    settings = Settings(retrieval_max_distance=0.45, retrieval_symbol_min_similarity=0.35)
    match = _make_match(vector_distance=0.9, symbol_score=0.5)
    assert has_hard_vector_fail([match], settings) is False
