"""Tests for adaptive retrieval top-k by project size."""

from config import Settings
from config import constants
from services.retrieval.adaptive_top_k import (
    ProjectSizeTier,
    resolve_project_tier,
    resolve_top_k,
)


def _tier_settings(**overrides: int) -> Settings:
    """Build settings with default adaptive boundaries for tier tests.

    @param overrides - Extra Settings kwargs.
    @returns Settings with medium/large/xlarge boundaries set.
    """
    base = {
        "retrieval_adaptive_medium_min_chunks": 5000,
        "retrieval_adaptive_large_min_chunks": 50000,
        "retrieval_adaptive_xlarge_min_chunks": 100000,
    }
    base.update(overrides)
    return Settings(**base)


def test_resolve_project_tier_small() -> None:
    assert resolve_project_tier(100, _tier_settings()) == ProjectSizeTier.SMALL


def test_resolve_project_tier_medium() -> None:
    assert resolve_project_tier(10000, _tier_settings()) == ProjectSizeTier.MEDIUM


def test_resolve_project_tier_large() -> None:
    assert resolve_project_tier(60000, _tier_settings()) == ProjectSizeTier.LARGE


def test_resolve_project_tier_xlarge_at_boundary() -> None:
    assert resolve_project_tier(100000, _tier_settings()) == ProjectSizeTier.XLARGE


def test_resolve_top_k_respects_env_ceilings() -> None:
    settings = Settings(
        retrieval_symbol_top_k=3,
        retrieval_keyword_top_k=6,
        retrieval_vector_top_k=7,
    )
    top_k = resolve_top_k(ProjectSizeTier.LARGE, settings)
    assert top_k == {"symbol": 3, "keyword": 6, "vector": 7}


def test_resolve_top_k_large_defaults() -> None:
    settings = Settings(
        retrieval_vector_top_k=20,
        retrieval_keyword_top_k=12,
        retrieval_symbol_top_k=5,
    )
    top_k = resolve_top_k(ProjectSizeTier.LARGE, settings)
    assert top_k == {"symbol": 5, "keyword": 12, "vector": 20}


def test_resolve_top_k_xlarge_defaults() -> None:
    settings = Settings()
    top_k = resolve_top_k(ProjectSizeTier.XLARGE, settings)
    assert top_k == {
        "symbol": constants.RETRIEVAL_SYMBOL_TOP_K_XLARGE,
        "keyword": constants.RETRIEVAL_KEYWORD_TOP_K_XLARGE,
        "vector": constants.RETRIEVAL_VECTOR_TOP_K_XLARGE,
    }
    assert top_k == {"symbol": 5, "keyword": 12, "vector": 20}
