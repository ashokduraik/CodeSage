"""Tests for embedding client."""

from unittest.mock import MagicMock

import pytest

from config import Settings
from services.embedding.tei_client import EmbeddingClient, fake_embedding


def test_fake_embedding_dimension() -> None:
    vector = fake_embedding("hello", 8)
    assert len(vector) == 8


def test_embed_texts_local_fallback() -> None:
    settings = Settings(tei_base_url="")
    client = EmbeddingClient(settings)
    vectors = client.embed_texts(["a", "b"])
    assert len(vectors) == 2
    assert len(vectors[0]) == settings.embedding_dimension


def test_embed_texts_empty() -> None:
    client = EmbeddingClient(Settings())
    assert client.embed_texts([]) == []


def test_embed_via_tei(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = Settings(tei_base_url="http://tei", embedding_dimension=4)
    client = EmbeddingClient(settings)

    response = MagicMock()
    response.status_code = 200
    response.json.return_value = {"data": [{"embedding": [0.1, 0.2, 0.3, 0.4]}]}
    monkeypatch.setattr("services.embedding.tei_client.httpx.post", lambda *a, **k: response)

    vector = client.embed_texts(["code"])[0]
    assert vector == [0.1, 0.2, 0.3, 0.4]


def test_embed_via_tei_error(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = Settings(tei_base_url="http://tei")
    client = EmbeddingClient(settings)
    response = MagicMock()
    response.status_code = 500
    response.text = "fail"
    monkeypatch.setattr("services.embedding.tei_client.httpx.post", lambda *a, **k: response)
    with pytest.raises(RuntimeError, match="TEI embed failed"):
        client.embed_texts(["x"])
