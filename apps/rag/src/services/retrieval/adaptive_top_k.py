"""Adaptive per-retriever top-k based on indexed project size."""

from __future__ import annotations

import enum

from config import Settings


class ProjectSizeTier(str, enum.Enum):
    """Indexed corpus scale tier for retrieval breadth."""

    SMALL = "small"
    MEDIUM = "medium"
    LARGE = "large"


_TIER_TOP_K: dict[ProjectSizeTier, dict[str, int]] = {
    ProjectSizeTier.SMALL: {"symbol": 5, "keyword": 8, "vector": 8},
    ProjectSizeTier.MEDIUM: {"symbol": 5, "keyword": 10, "vector": 12},
    ProjectSizeTier.LARGE: {"symbol": 5, "keyword": 12, "vector": 20},
}


def resolve_project_tier(chunk_count: int, settings: Settings) -> ProjectSizeTier:
    """Map active chunk count to a project size tier.

    @param chunk_count - Active ``code_chunks`` rows for the project scope.
    @param settings - Tier boundary settings.
    @returns Size tier used to pick per-leg top-k.
    """
    if chunk_count < settings.retrieval_adaptive_medium_min_chunks:
        return ProjectSizeTier.SMALL
    if chunk_count < settings.retrieval_adaptive_large_min_chunks:
        return ProjectSizeTier.MEDIUM
    return ProjectSizeTier.LARGE


def resolve_top_k(tier: ProjectSizeTier, settings: Settings) -> dict[str, int]:
    """Return per-leg top-k capped by env-configured ceilings.

    @param tier - Project size tier.
    @param settings - Application settings with optional top-k ceilings.
    @returns Dict with ``symbol``, ``keyword``, and ``vector`` limits.
    """
    base = _TIER_TOP_K[tier]
    return {
        "symbol": min(base["symbol"], settings.retrieval_symbol_top_k),
        "keyword": min(base["keyword"], settings.retrieval_keyword_top_k),
        "vector": min(
            base["vector"],
            settings.retrieval_vector_top_k or settings.retrieval_top_k,
        ),
    }
