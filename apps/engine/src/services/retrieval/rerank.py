"""Cross-encoder reranking via TEI ``/rerank`` API."""

from __future__ import annotations

from dataclasses import dataclass, replace
from urllib.parse import urlparse

import httpx

from config import Settings
from config.logging import sanitize_log_message
from services.retrieval.prune import prune_sort_key
from services.retrieval.query_intent import QueryIntentProfile
from services.retrieval.types import RetrievalMatch


@dataclass(frozen=True)
class RerankOutcome:
    """Result of an optional rerank pass over retrieval candidates.

    @param matches - Reordered matches when rerank succeeded; otherwise unchanged input.
    @param applied - True when TEI rerank returned a valid ordering.
    """

    matches: list[RetrievalMatch]
    applied: bool = False


def _truncate_text(text: str, max_chars: int) -> str:
    """Cap document text length for reranker payloads.

    @param text - Full chunk content.
    @param max_chars - Maximum characters to send.
    @returns Truncated text.
    """
    if max_chars <= 0 or len(text) <= max_chars:
        return text
    return text[:max_chars]


def select_rerank_candidates(
    matches: list[RetrievalMatch],
    settings: Settings,
    *,
    intent: QueryIntentProfile,
) -> list[RetrievalMatch]:
    """Pick the top fused/graph hits to send to the reranker.

    Uses the same ordering as heuristic prune so rerank input aligns with M3.2 ranking.

    @param matches - Fused and graph-augmented hits.
    @param settings - Reranker input cap settings.
    @param intent - Classified query intent for tie-break ordering.
    @returns Up to ``retrieval_reranker_input_k`` candidates, best first.
    """
    limit = settings.retrieval_reranker_input_k
    if limit <= 0 or not matches:
        return []
    ranked = sorted(matches, key=lambda match: prune_sort_key(match, intent))
    return ranked[:limit]


class RerankClient:
    """Rerank query-document pairs via a TEI ``/rerank`` endpoint."""

    def __init__(self, settings: Settings) -> None:
        """Store settings for reranker endpoint resolution.

        @param settings - Application settings.
        """
        self._settings = settings

    def rerank_matches(
        self,
        question: str,
        matches: list[RetrievalMatch],
    ) -> RerankOutcome:
        """Reorder matches by cross-encoder relevance scores.

        @param question - User question text.
        @param matches - Candidate retrieval hits to rerank.
        @returns Outcome with reordered matches when TEI succeeds.
        """
        if not matches:
            return RerankOutcome(matches=[], applied=False)
        if not self._settings.retrieval_reranker_enabled:
            return RerankOutcome(matches=matches, applied=False)
        if not self._settings.retrieval_reranker_base_url.strip():
            return RerankOutcome(matches=matches, applied=False)

        texts = [
            _truncate_text(match.chunk.content, self._settings.retrieval_reranker_max_doc_chars)
            for match in matches
        ]
        try:
            scores = self._rerank_via_tei(question, texts)
        except RuntimeError:
            return RerankOutcome(matches=matches, applied=False)

        if not scores:
            return RerankOutcome(matches=matches, applied=False)

        reranked: list[RetrievalMatch] = []
        for index, score in scores:
            if index < 0 or index >= len(matches):
                continue
            reranked.append(replace(matches[index], rerank_score=score))

        if not reranked:
            return RerankOutcome(matches=matches, applied=False)
        return RerankOutcome(matches=reranked, applied=True)

    def _rerank_via_tei(self, question: str, texts: list[str]) -> list[tuple[int, float]]:
        """Call TEI ``POST /rerank`` and return ``(index, score)`` pairs best-first.

        @param question - Query string.
        @param texts - Document strings to score against the query.
        @returns Ranked index/score pairs.
        @raises RuntimeError when the rerank request fails.
        """
        base = self._settings.retrieval_reranker_base_url.rstrip("/")
        url = f"{base}/rerank"
        host = urlparse(base).hostname or base
        body: dict[str, object] = {
            "query": question,
            "texts": texts,
            "truncate": True,
        }
        if self._settings.retrieval_reranker_model:
            body["model"] = self._settings.retrieval_reranker_model
        try:
            response = httpx.post(
                url,
                json=body,
                timeout=self._settings.retrieval_reranker_timeout_seconds,
            )
        except httpx.ConnectError as exc:
            raise RuntimeError(
                f"Cannot connect to reranker at {host}: {exc}",
            ) from exc
        except httpx.HTTPError as exc:
            raise RuntimeError(
                f"Reranker request failed at {host}: {exc}",
            ) from exc
        if response.status_code >= 400:
            detail = sanitize_log_message(response.text)
            raise RuntimeError(f"TEI rerank failed ({response.status_code}): {detail}")

        payload = response.json()
        if not isinstance(payload, list):
            raise RuntimeError("TEI rerank returned unexpected response shape")

        pairs: list[tuple[int, float]] = []
        for item in payload:
            if not isinstance(item, dict):
                continue
            index = item.get("index")
            score = item.get("score")
            if not isinstance(index, int) or not isinstance(score, (int, float)):
                continue
            pairs.append((index, float(score)))

        pairs.sort(key=lambda pair: -pair[1])
        return pairs


def rerank_matches(
    question: str,
    matches: list[RetrievalMatch],
    settings: Settings,
) -> RerankOutcome:
    """Convenience wrapper around ``RerankClient.rerank_matches``.

    @param question - User question text.
    @param matches - Candidate retrieval hits.
    @param settings - Application settings.
    @returns Rerank outcome with optional reordered matches.
    """
    return RerankClient(settings).rerank_matches(question, matches)
