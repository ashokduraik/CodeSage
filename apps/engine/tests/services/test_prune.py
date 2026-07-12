"""Tests for post-graph retrieval pruning."""

import uuid
from unittest.mock import MagicMock

from services.retrieval.prune import prune_matches
from services.retrieval.query_intent import QueryIntentProfile
from services.retrieval.types import RetrievalMatch


def _make_match(
    *,
    fused_score: float,
    file_path: str = "a.ts",
    is_graph_expanded: bool = False,
    graph_depth: int | None = None,
    symbol_score: float | None = None,
    vector_distance: float | None = None,
) -> RetrievalMatch:
    chunk = MagicMock()
    chunk.id = uuid.uuid4()
    chunk.file_path = file_path
    return RetrievalMatch(
        chunk=chunk,
        fused_score=fused_score,
        sources=("vector",),
        symbol_score=symbol_score,
        vector_distance=vector_distance,
        is_graph_expanded=is_graph_expanded,
        graph_depth=graph_depth,
    )


def test_prune_matches_limits_count() -> None:
    matches = [_make_match(fused_score=0.1 - i * 0.01, file_path=f"f{i}.ts") for i in range(15)]
    pruned = prune_matches(matches, limit=10, intent=QueryIntentProfile.BALANCED)
    assert len(pruned) == 10


def test_prune_matches_prefers_fused_seeds_over_graph_chunks() -> None:
    seed = _make_match(fused_score=0.05, file_path="seed.ts")
    graph_chunk = _make_match(
        fused_score=0.05,
        file_path="graph.ts",
        is_graph_expanded=True,
        graph_depth=1,
    )
    pruned = prune_matches([graph_chunk, seed], limit=1, intent=QueryIntentProfile.BALANCED)
    assert pruned[0].chunk.file_path == "seed.ts"


def test_prune_matches_symbol_intent_prefers_symbol_score() -> None:
    low_symbol = _make_match(fused_score=0.04, symbol_score=0.2, file_path="low.ts")
    high_symbol = _make_match(fused_score=0.04, symbol_score=0.9, file_path="high.ts")
    pruned = prune_matches(
        [low_symbol, high_symbol],
        limit=1,
        intent=QueryIntentProfile.SYMBOL_LOOKUP,
    )
    assert pruned[0].chunk.file_path == "high.ts"
