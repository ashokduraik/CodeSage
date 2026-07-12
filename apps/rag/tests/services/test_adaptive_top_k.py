"""Tests for adaptive retrieval top-k by project size."""

from config import Settings
from services.retrieval.adaptive_top_k import (
    ProjectSizeTier,
    resolve_project_tier,
    resolve_top_k,
)


def test_resolve_project_tier_small() -> None:
    settings = Settings(
        retrieval_adaptive_medium_min_chunks=5000,
        retrieval_adaptive_large_min_chunks=50000,
    )
    assert resolve_project_tier(100, settings) == ProjectSizeTier.SMALL


def test_resolve_project_tier_medium() -> None:
    settings = Settings(
        retrieval_adaptive_medium_min_chunks=5000,
        retrieval_adaptive_large_min_chunks=50000,
    )
    assert resolve_project_tier(10000, settings) == ProjectSizeTier.MEDIUM


def test_resolve_project_tier_large() -> None:
    settings = Settings(
        retrieval_adaptive_medium_min_chunks=5000,
        retrieval_adaptive_large_min_chunks=50000,
    )
    assert resolve_project_tier(100000, settings) == ProjectSizeTier.LARGE


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
