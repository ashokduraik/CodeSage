"""Tests for cross-encoder reranking via TEI."""

from __future__ import annotations

import uuid
from unittest.mock import MagicMock

import httpx
import pytest

from config import Settings
from services.retrieval.query_intent import QueryIntentProfile
from services.retrieval.rerank import RerankClient, select_rerank_candidates
from services.retrieval.types import RetrievalMatch


def _match(
    *,
    fused_score: float = 0.1,
    content: str = "export function foo() {}",
    file_path: str = "a.ts",
) -> RetrievalMatch:
    chunk = MagicMock()
    chunk.id = uuid.uuid4()
    chunk.file_path = file_path
    chunk.content = content
    return RetrievalMatch(chunk=chunk, fused_score=fused_score, sources=("vector",))


def test_select_rerank_candidates_limits_input() -> None:
    matches = [_match(fused_score=0.1 - i * 0.01, file_path=f"f{i}.ts") for i in range(30)]
    settings = Settings(retrieval_reranker_input_k=5)
    selected = select_rerank_candidates(
        matches,
        settings,
        intent=QueryIntentProfile.BALANCED,
    )
    assert len(selected) == 5


def test_rerank_disabled_returns_unchanged() -> None:
    matches = [_match(), _match(fused_score=0.05)]
    outcome = RerankClient(Settings(retrieval_reranker_enabled=False)).rerank_matches(
        "what does foo do?",
        matches,
    )
    assert outcome.applied is False
    assert outcome.matches == matches


def test_rerank_without_base_url_returns_unchanged() -> None:
    settings = Settings(retrieval_reranker_enabled=True, retrieval_reranker_base_url="")
    outcome = RerankClient(settings).rerank_matches("q", [_match()])
    assert outcome.applied is False


def test_rerank_reorders_by_tei_scores(monkeypatch: pytest.MonkeyPatch) -> None:
    matches = [_match(file_path="low.ts"), _match(fused_score=0.05, file_path="high.ts")]

    class FakeResponse:
        status_code = 200

        @staticmethod
        def json() -> list[dict[str, float | int]]:
            return [{"index": 1, "score": 0.95}, {"index": 0, "score": 0.12}]

    monkeypatch.setattr(httpx, "post", lambda *a, **k: FakeResponse())
    settings = Settings(
        retrieval_reranker_enabled=True,
        retrieval_reranker_base_url="http://localhost:8081",
    )
    outcome = RerankClient(settings).rerank_matches("question", matches)
    assert outcome.applied is True
    assert outcome.matches[0].chunk.file_path == "high.ts"
    assert outcome.matches[0].rerank_score == 0.95


def test_rerank_truncates_long_chunk_text(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, object] = {}

    class FakeResponse:
        status_code = 200

        @staticmethod
        def json() -> list[dict[str, float | int]]:
            return [{"index": 0, "score": 0.5}]

    def fake_post(url: str, *, json: dict, timeout: float) -> FakeResponse:
        captured["texts"] = json["texts"]
        return FakeResponse()

    monkeypatch.setattr(httpx, "post", fake_post)
    long_content = "x" * 5000
    settings = Settings(
        retrieval_reranker_enabled=True,
        retrieval_reranker_base_url="http://localhost:8081",
        retrieval_reranker_max_doc_chars=100,
    )
    RerankClient(settings).rerank_matches("q", [_match(content=long_content)])
    texts = captured["texts"]
    assert isinstance(texts, list)
    assert len(texts[0]) == 100


def test_rerank_http_error_falls_back(monkeypatch: pytest.MonkeyPatch) -> None:
    matches = [_match()]

    def fail_post(*a, **k) -> None:
        raise httpx.ConnectError("down", request=MagicMock())

    monkeypatch.setattr(httpx, "post", fail_post)
    settings = Settings(
        retrieval_reranker_enabled=True,
        retrieval_reranker_base_url="http://localhost:8081",
    )
    outcome = RerankClient(settings).rerank_matches("q", matches)
    assert outcome.applied is False
    assert outcome.matches == matches


def test_rerank_bad_status_falls_back(monkeypatch: pytest.MonkeyPatch) -> None:
    class BadResponse:
        status_code = 500
        text = "error"

    monkeypatch.setattr(httpx, "post", lambda *a, **k: BadResponse())
    settings = Settings(
        retrieval_reranker_enabled=True,
        retrieval_reranker_base_url="http://localhost:8081",
    )
    outcome = RerankClient(settings).rerank_matches("q", [_match()])
    assert outcome.applied is False


def test_rerank_skips_invalid_indices(monkeypatch: pytest.MonkeyPatch) -> None:
    class FakeResponse:
        status_code = 200

        @staticmethod
        def json() -> list[dict[str, float | int]]:
            return [{"index": 99, "score": 0.9}]

    monkeypatch.setattr(httpx, "post", lambda *a, **k: FakeResponse())
    settings = Settings(
        retrieval_reranker_enabled=True,
        retrieval_reranker_base_url="http://localhost:8081",
    )
    outcome = RerankClient(settings).rerank_matches("q", [_match()])
    assert outcome.applied is False
