"""Tests for hybrid retrieval confidence scoring."""

import uuid
from unittest.mock import MagicMock

from config import Settings
from services.retrieval.hybrid_confidence import (
    compute_hybrid_confidence,
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
    is_graph_expanded: bool = False,
    graph_depth: int | None = None,
) -> RetrievalMatch:
    chunk = MagicMock()
    chunk.id = uuid.uuid4()
    chunk.file_path = file_path
    chunk.symbol_refs = symbol_refs or []
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
    )
    score = compute_hybrid_confidence(
        [match],
        Settings(),
        intent=QueryIntentProfile.SYMBOL_LOOKUP,
        terms=["getMinEmi"],
    )
    assert score >= 0.45


def test_has_hard_vector_fail_when_distance_too_high() -> None:
    settings = Settings(retrieval_max_distance=0.45)
    match = _make_match(vector_distance=0.9)
    assert has_hard_vector_fail([match], settings) is True


def test_has_hard_vector_fail_passes_with_symbol_signal() -> None:
    settings = Settings(retrieval_max_distance=0.45, retrieval_symbol_min_similarity=0.35)
    match = _make_match(vector_distance=0.9, symbol_score=0.5)
    assert has_hard_vector_fail([match], settings) is False
