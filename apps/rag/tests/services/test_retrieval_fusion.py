"""Tests for hybrid retrieval fusion."""

from __future__ import annotations

import uuid
from unittest.mock import MagicMock

from services.retrieval.fusion import reciprocal_rank_fusion
from services.retrieval.types import RetrievalMatch


def _chunk(name: str) -> MagicMock:
    chunk = MagicMock()
    chunk.id = uuid.uuid4()
    chunk.file_path = name
    chunk.span = {"startLine": 1}
    return chunk


def test_rrf_merges_duplicate_chunks_by_id() -> None:
    shared = _chunk("shared.ts")
    vector_hits = [(shared, 0.2)]
    keyword_hits = [(shared, 0.8)]
    symbol_hits: list[tuple[MagicMock, float]] = []

    fused = reciprocal_rank_fusion(
        vector_hits=vector_hits,
        keyword_hits=keyword_hits,
        symbol_hits=symbol_hits,
        rrf_k=60,
    )
    assert len(fused) == 1
    assert fused[0].chunk is shared
    assert set(fused[0].sources) == {"keyword", "vector"}
    assert fused[0].vector_distance == 0.2
    assert fused[0].keyword_score == 0.8


def test_rrf_symbol_hit_can_outrank_weak_vector_only_chunk() -> None:
    weak = _chunk("weak.ts")
    strong = _chunk("emi.ts")
    vector_hits = [(weak, 0.34)]
    keyword_hits: list[tuple[MagicMock, float]] = []
    symbol_hits = [(strong, 0.9)]

    fused = reciprocal_rank_fusion(
        vector_hits=vector_hits,
        keyword_hits=keyword_hits,
        symbol_hits=symbol_hits,
        rrf_k=60,
        symbol_weight=2.0,
    )
    assert fused[0].chunk is strong
    assert fused[0].symbol_score == 0.9


def test_rrf_sort_is_deterministic_on_ties() -> None:
    a = _chunk("a.ts")
    b = _chunk("b.ts")
    fused = reciprocal_rank_fusion(
        vector_hits=[(a, 0.3), (b, 0.31)],
        keyword_hits=[],
        symbol_hits=[],
        rrf_k=60,
    )
    assert fused[0].chunk.file_path == "a.ts"
    assert fused[1].chunk.file_path == "b.ts"
