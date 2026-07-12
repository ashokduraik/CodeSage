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
