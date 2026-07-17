"""Hybrid ranking tests for EMI-style implementation questions."""

from __future__ import annotations

import uuid
from unittest.mock import MagicMock

from config import Settings
from services.retrieval.fusion import reciprocal_rank_fusion
from services.retrieval.query_intent import QueryIntentProfile, classify_query_intent, resolve_rrf_weights
from services.retrieval.query_terms import extract_search_terms


def _chunk(file_path: str, content: str) -> MagicMock:
    chunk = MagicMock()
    chunk.id = uuid.uuid4()
    chunk.file_path = file_path
    chunk.content = content
    return chunk


def test_emi_question_classifies_balanced_not_conceptual() -> None:
    question = "how is EMI calculated?"
    terms = extract_search_terms(question)
    assert classify_query_intent(question, terms) == QueryIntentProfile.BALANCED


def test_balanced_rrf_prefers_implementation_over_ui_distractor() -> None:
    """Under BALANCED weights, symbol+keyword legs should beat vector-only UI copy."""
    ui_chunk = _chunk(
        "src/app/pages/play-area/play-area.page.ts",
        "stores EMI amount and interestRate for display",
    )
    formula_chunk = _chunk(
        "src/loan.utils.ts",
        "export function calculateEmi(principal, rate, months) { ... }",
    )

    symbol_weight, keyword_weight, vector_weight = resolve_rrf_weights(
        QueryIntentProfile.BALANCED,
        Settings(),
    )

    fused = reciprocal_rank_fusion(
        vector_hits=[(ui_chunk, 0.12)],
        keyword_hits=[(ui_chunk, 0.78), (formula_chunk, 0.72)],
        symbol_hits=[(formula_chunk, 0.95)],
        vector_weight=vector_weight,
        keyword_weight=keyword_weight,
        symbol_weight=symbol_weight,
        limit=2,
    )

    assert fused[0].chunk.file_path == "src/loan.utils.ts"
    assert "symbol" in fused[0].sources
