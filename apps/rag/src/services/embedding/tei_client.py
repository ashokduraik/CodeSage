"""Embedding client — TEI when configured, deterministic fallback otherwise."""

from __future__ import annotations

import hashlib

import httpx

from config import Settings


def fake_embedding(text: str, dimension: int) -> list[float]:
    """Build a deterministic pseudo-vector for dev/CI when TEI is unavailable.

    @param text - Input text.
    @param dimension - Target vector length.
    @returns Float vector of the requested dimension.
    """
    digest = hashlib.sha256(text.encode("utf-8")).digest()
    values: list[float] = []
    while len(values) < dimension:
        for byte in digest:
            values.append((byte / 255.0) * 2.0 - 1.0)
            if len(values) >= dimension:
                break
        digest = hashlib.sha256(digest).digest()
    return values


class EmbeddingClient:
    """Embed text via TEI or a deterministic local fallback."""

    def __init__(self, settings: Settings) -> None:
        """Store settings for TEI endpoint resolution.

        @param settings - Application settings.
        """
        self._settings = settings

    def embed_texts(self, texts: list[str]) -> list[list[float]]:
        """Return one embedding vector per input string.

        @param texts - Batch of strings to embed.
        @returns Embedding vectors matching settings.embedding_dimension.
        @raises RuntimeError when TEI returns an error response.
        """
        if not texts:
            return []
        if not self._settings.tei_base_url:
            dim = self._settings.embedding_dimension
            return [fake_embedding(text, dim) for text in texts]
        return self._embed_via_tei(texts)

    def _embed_via_tei(self, texts: list[str]) -> list[list[float]]:
        """Call the TEI OpenAI-compatible embeddings endpoint.

        @param texts - Input strings.
        @returns Parsed embedding vectors.
        """
        url = f"{self._settings.tei_base_url.rstrip('/')}/embeddings"
        body: dict[str, object] = {"input": texts}
        if self._settings.tei_embed_model:
            body["model"] = self._settings.tei_embed_model
        response = httpx.post(url, json=body, timeout=60.0)
        if response.status_code >= 400:
            raise RuntimeError(f"TEI embed failed ({response.status_code}): {response.text}")
        data = response.json()
        items = data.get("data", [])
        return [item["embedding"] for item in items]
