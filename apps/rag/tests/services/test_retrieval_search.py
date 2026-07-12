"""Tests for hybrid retrieval orchestration."""

from __future__ import annotations

import uuid
from unittest.mock import MagicMock

import pytest

from config import Settings
from services.retrieval.adaptive_top_k import ProjectSizeTier
from services.retrieval.query_intent import QueryIntentProfile
from services.retrieval.search import RetrievalContext, is_confident_match, retrieve_code_chunks
from services.retrieval.types import RetrievalMatch


def _match(
    *,
    vector_distance: float | None = None,
    keyword_score: float | None = None,
    symbol_score: float | None = None,
    sources: tuple[str, ...] = ("vector",),
    fused_score: float = 0.1,
) -> RetrievalMatch:
    chunk = MagicMock()
    chunk.id = uuid.uuid4()
    chunk.file_path = "src/a.ts"
    chunk.span = {"startLine": 1}
    chunk.symbol_refs = []
    return RetrievalMatch(
        chunk=chunk,
        fused_score=fused_score,
        sources=sources,
        vector_distance=vector_distance,
        keyword_score=keyword_score,
        symbol_score=symbol_score,
    )


def test_is_confident_match_empty() -> None:
    assert is_confident_match(Settings(), [], question="q") is False


def test_is_confident_match_strong_symbol_hit() -> None:
    settings = Settings(retrieval_min_confidence=0.3)
    assert is_confident_match(
        settings,
        [_match(symbol_score=0.5, sources=("symbol",))],
        question="what does getMinEmi do?",
    ) is True


def test_is_confident_match_rejects_weak_vector_only() -> None:
    settings = Settings(retrieval_max_distance=0.45, retrieval_min_confidence=0.45)
    assert is_confident_match(
        settings,
        [_match(vector_distance=0.9)],
        question="explain lifecycle",
    ) is False


def test_retrieve_code_chunks_missing_project(monkeypatch: pytest.MonkeyPatch) -> None:
    repo = MagicMock()
    repo.get_by_id.return_value = None
    monkeypatch.setattr(
        "services.retrieval.search.ProjectRepository",
        lambda session: repo,
    )
    with pytest.raises(ValueError, match="Project not found"):
        retrieve_code_chunks(
            MagicMock(),
            Settings(),
            project_id=uuid.uuid4(),
            question="q",
        )


def test_retrieve_code_chunks_hybrid_fusion(monkeypatch: pytest.MonkeyPatch) -> None:
    project = MagicMock()
    project_repo = MagicMock()
    project_repo.get_by_id.return_value = project
    chunk = MagicMock()
    chunk.id = uuid.uuid4()
    chunk.file_path = "emi.ts"
    fused = RetrievalMatch(chunk=chunk, fused_score=0.03, sources=("vector", "symbol"))

    chunks_repo = MagicMock()
    chunks_repo.count_active_by_project.return_value = 100

    monkeypatch.setattr(
        "services.retrieval.search.ProjectRepository",
        lambda session: project_repo,
    )
    monkeypatch.setattr(
        "services.retrieval.search.CodeChunkRepository",
        lambda session: chunks_repo,
    )
    monkeypatch.setattr(
        "services.retrieval.search.EmbeddingClient",
        lambda settings: MagicMock(embed_texts=lambda texts: [[0.1]]),
    )
    monkeypatch.setattr(
        "services.retrieval.search.similarity_search",
        lambda *a, **k: [(chunk, 0.2)],
    )
    monkeypatch.setattr(
        "services.retrieval.search.keyword_search",
        lambda *a, **k: [],
    )
    monkeypatch.setattr(
        "services.retrieval.search.symbol_search",
        lambda *a, **k: [(chunk, 0.8)],
    )
    monkeypatch.setattr(
        "services.retrieval.search.reciprocal_rank_fusion",
        lambda **kwargs: [fused],
    )
    monkeypatch.setattr(
        "services.retrieval.search.augment_matches_with_graph",
        lambda session, settings, *, project_id, matches: matches,
    )

    matches, context = retrieve_code_chunks(
        MagicMock(),
        Settings(retrieval_context_top_k=10),
        project_id=uuid.uuid4(),
        question="what does getMinEmi do?",
    )
    assert len(matches) == 1
    assert matches[0] == fused
    assert context.intent == QueryIntentProfile.SYMBOL_LOOKUP
    assert context.tier == ProjectSizeTier.SMALL
    assert context.reranker_applied is False


def test_retrieve_code_chunks_uses_reranker_when_enabled(monkeypatch: pytest.MonkeyPatch) -> None:
    from services.retrieval.rerank import RerankOutcome

    project = MagicMock()
    project_repo = MagicMock()
    project_repo.get_by_id.return_value = project
    chunk_a = MagicMock()
    chunk_a.id = uuid.uuid4()
    chunk_a.file_path = "a.ts"
    chunk_b = MagicMock()
    chunk_b.id = uuid.uuid4()
    chunk_b.file_path = "b.ts"
    fused = [
        RetrievalMatch(chunk=chunk_a, fused_score=0.03, sources=("vector",)),
        RetrievalMatch(chunk=chunk_b, fused_score=0.02, sources=("vector",)),
    ]
    reranked = RetrievalMatch(
        chunk=chunk_b,
        fused_score=0.02,
        sources=("vector",),
        rerank_score=0.99,
    )

    chunks_repo = MagicMock()
    chunks_repo.count_active_by_project.return_value = 100

    monkeypatch.setattr(
        "services.retrieval.search.ProjectRepository",
        lambda session: project_repo,
    )
    monkeypatch.setattr(
        "services.retrieval.search.CodeChunkRepository",
        lambda session: chunks_repo,
    )
    monkeypatch.setattr(
        "services.retrieval.search.EmbeddingClient",
        lambda settings: MagicMock(embed_texts=lambda texts: [[0.1]]),
    )
    monkeypatch.setattr(
        "services.retrieval.search.similarity_search",
        lambda *a, **k: [],
    )
    monkeypatch.setattr(
        "services.retrieval.search.keyword_search",
        lambda *a, **k: [],
    )
    monkeypatch.setattr(
        "services.retrieval.search.symbol_search",
        lambda *a, **k: [],
    )
    monkeypatch.setattr(
        "services.retrieval.search.reciprocal_rank_fusion",
        lambda **kwargs: fused,
    )
    monkeypatch.setattr(
        "services.retrieval.search.augment_matches_with_graph",
        lambda session, settings, *, project_id, matches: matches,
    )
    monkeypatch.setattr(
        "services.retrieval.search.rerank_matches",
        lambda question, candidates, settings: RerankOutcome([reranked], applied=True),
    )

    matches, context = retrieve_code_chunks(
        MagicMock(),
        Settings(
            retrieval_reranker_enabled=True,
            retrieval_reranker_base_url="http://localhost:8081",
            retrieval_reranker_output_k=1,
        ),
        project_id=uuid.uuid4(),
        question="what does getMinEmi do?",
    )
    assert len(matches) == 1
    assert matches[0].rerank_score == 0.99
    assert context.reranker_applied is True


def test_is_confident_match_uses_fused_scores_when_reranker_reorders() -> None:
    from services.retrieval.hybrid_confidence import has_hard_vector_fail
    from services.retrieval.search import RetrievalContext, _matches_for_confidence

    chunk_strong = MagicMock()
    chunk_strong.id = uuid.uuid4()
    chunk_strong.file_path = "strong.ts"
    chunk_strong.symbol_refs = [{"name": "getMinEmi"}]
    chunk_weak = MagicMock()
    chunk_weak.id = uuid.uuid4()
    chunk_weak.file_path = "weak.ts"
    chunk_weak.symbol_refs = []
    matches = [
        RetrievalMatch(
            chunk=chunk_weak,
            fused_score=0.01,
            sources=("vector",),
            vector_distance=0.9,
            rerank_score=0.99,
        ),
        RetrievalMatch(
            chunk=chunk_strong,
            fused_score=0.08,
            sources=("symbol",),
            symbol_score=0.95,
            rerank_score=0.10,
        ),
    ]
    context = RetrievalContext(
        intent=QueryIntentProfile.SYMBOL_LOOKUP,
        tier=ProjectSizeTier.SMALL,
        terms=["getMinEmi"],
        reranker_applied=True,
    )
    settings = Settings(
        retrieval_max_distance=0.45,
        retrieval_symbol_min_similarity=0.35,
        retrieval_keyword_min_similarity=0.15,
    )
    assert has_hard_vector_fail(matches, settings)
    assert not has_hard_vector_fail(_matches_for_confidence(matches, context), settings)
    assert _matches_for_confidence(matches, context)[0].chunk is chunk_strong
