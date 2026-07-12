"""Reciprocal Rank Fusion for hybrid retrieval."""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field

from models import CodeChunk
from services.retrieval.types import RetrievalMatch


@dataclass
class _CandidateAccumulator:
    """Mutable accumulator for one chunk id during RRF."""

    chunk: CodeChunk
    fused_score: float = 0.0
    sources: set[str] = field(default_factory=set)
    vector_distance: float | None = None
    keyword_score: float | None = None
    symbol_score: float | None = None
    best_rank: int = 10_000


def reciprocal_rank_fusion(
    *,
    vector_hits: list[tuple[CodeChunk, float]],
    keyword_hits: list[tuple[CodeChunk, float]],
    symbol_hits: list[tuple[CodeChunk, float]],
    rrf_k: int = 60,
    vector_weight: float = 1.0,
    keyword_weight: float = 1.0,
    symbol_weight: float = 1.0,
    limit: int | None = None,
) -> list[RetrievalMatch]:
    """Fuse ranked retriever lists with weighted Reciprocal Rank Fusion.

    Each retriever contributes ``weight / (rrf_k + rank)`` to a chunk's fused
    score. Duplicate chunk ids are merged and their source legs are unioned.

    @param vector_hits - ``(chunk, cosine_distance)`` best-first (lower distance).
    @param keyword_hits - ``(chunk, similarity)`` best-first (higher score).
    @param symbol_hits - ``(chunk, similarity)`` best-first (higher score).
    @param rrf_k - RRF smoothing constant (default 60).
    @param vector_weight - Weight for the vector leg.
    @param keyword_weight - Weight for the keyword leg.
    @param symbol_weight - Weight for the symbol leg.
    @param limit - Optional cap on fused results returned.
    @returns Fused matches sorted by fused score descending.
    """
    accumulators: dict[uuid.UUID, _CandidateAccumulator] = {}

    def _touch(
        chunk: CodeChunk,
        *,
        source: str,
        rank: int,
        weight: float,
        vector_distance: float | None = None,
        keyword_score: float | None = None,
        symbol_score: float | None = None,
    ) -> None:
        entry = accumulators.get(chunk.id)
        if entry is None:
            entry = _CandidateAccumulator(chunk=chunk, best_rank=rank)
            accumulators[chunk.id] = entry
        entry.fused_score += weight / (rrf_k + rank)
        entry.sources.add(source)
        entry.best_rank = min(entry.best_rank, rank)
        if vector_distance is not None:
            entry.vector_distance = (
                vector_distance
                if entry.vector_distance is None
                else min(entry.vector_distance, vector_distance)
            )
        if keyword_score is not None:
            entry.keyword_score = max(entry.keyword_score or 0.0, keyword_score)
        if symbol_score is not None:
            entry.symbol_score = max(entry.symbol_score or 0.0, symbol_score)

    for rank, (chunk, distance) in enumerate(vector_hits, start=1):
        _touch(
            chunk,
            source="vector",
            rank=rank,
            weight=vector_weight,
            vector_distance=distance,
        )

    for rank, (chunk, score) in enumerate(keyword_hits, start=1):
        _touch(
            chunk,
            source="keyword",
            rank=rank,
            weight=keyword_weight,
            keyword_score=score,
        )

    for rank, (chunk, score) in enumerate(symbol_hits, start=1):
        _touch(
            chunk,
            source="symbol",
            rank=rank,
            weight=symbol_weight,
            symbol_score=score,
        )

    fused = [
        RetrievalMatch(
            chunk=entry.chunk,
            fused_score=entry.fused_score,
            sources=tuple(sorted(entry.sources)),
            vector_distance=entry.vector_distance,
            keyword_score=entry.keyword_score,
            symbol_score=entry.symbol_score,
        )
        for entry in accumulators.values()
    ]
    fused.sort(
        key=lambda match: (
            -match.fused_score,
            match.vector_distance if match.vector_distance is not None else 999.0,
            match.chunk.file_path,
        ),
    )
    if limit is not None:
        return fused[:limit]
    return fused
