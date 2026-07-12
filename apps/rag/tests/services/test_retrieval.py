"""Tests for retrieval confidence calibration."""

from unittest.mock import MagicMock

from config import Settings
from services.retrieval.calibration import (
    BORDERLINE_WEAK_MATCH_DISTANCE,
    CALIBRATED_MAX_DISTANCE,
    GENERIC_GREETING_MATCH_DISTANCE,
    STRONG_CODE_MATCH_DISTANCE,
)
from services.retrieval.search import is_confident_match
from services.retrieval.types import RetrievalMatch


def _vector_match(distance: float, *, fused_score: float = 0.1) -> RetrievalMatch:
    chunk = MagicMock()
    chunk.file_path = "src/a.ts"
    chunk.symbol_refs = []
    return RetrievalMatch(
        chunk=chunk,
        fused_score=fused_score,
        sources=("vector",),
        vector_distance=distance,
    )

def test_is_confident_match_empty() -> None:
    assert is_confident_match(Settings(), [], question="q") is False


def test_is_confident_match_strong_vector_hit() -> None:
    settings = Settings(retrieval_max_distance=0.5, retrieval_min_confidence=0.3)
    assert is_confident_match(
        settings,
        [_vector_match(0.4)],
        question="explain auth",
    ) is True


def test_is_confident_match_rejects_weak_vector_only() -> None:
    settings = Settings(retrieval_max_distance=0.5, retrieval_min_confidence=0.45)
    assert is_confident_match(
        settings,
        [_vector_match(0.9)],
        question="explain auth",
    ) is False


def test_calibrated_threshold_passes_strong_matches() -> None:
    settings = Settings(
        retrieval_max_distance=CALIBRATED_MAX_DISTANCE,
        retrieval_min_confidence=0.3,
    )
    assert is_confident_match(
        settings,
        [_vector_match(STRONG_CODE_MATCH_DISTANCE)],
        question="explain",
    ) is True


def test_calibrated_threshold_rejects_borderline_and_greeting_matches() -> None:
    settings = Settings(retrieval_max_distance=CALIBRATED_MAX_DISTANCE)
    assert is_confident_match(
        settings,
        [_vector_match(BORDERLINE_WEAK_MATCH_DISTANCE)],
        question="explain",
    ) is False
    assert is_confident_match(
        settings,
        [_vector_match(GENERIC_GREETING_MATCH_DISTANCE)],
        question="hi",
    ) is False


def test_default_settings_use_calibrated_threshold() -> None:
    assert Settings().retrieval_max_distance == CALIBRATED_MAX_DISTANCE
