"""Performance-smoke tests for agent QA adaptive xlarge retrieval config."""

from __future__ import annotations

import uuid
from unittest.mock import MagicMock

import pytest

from config import Settings
from services.qa.tools import execute_tool


def test_hybrid_tool_uses_xlarge_top_k_at_100k_chunks(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A 100k-chunk project sends the bounded xlarge limits to all search legs."""
    settings = Settings()
    project_id = uuid.uuid4()
    chunks_repo = MagicMock()
    chunks_repo.count_active_by_project.return_value = 100_000
    observed_limits: dict[str, int] = {}

    monkeypatch.setattr(
        "services.qa.tools.CodeChunkRepository",
        lambda _session: chunks_repo,
    )
    monkeypatch.setattr(
        "services.qa.tools.EmbeddingClient",
        lambda _settings: MagicMock(embed_texts=lambda _texts: [[0.1] * 8]),
    )

    def _vectors(*_args: object, **kwargs: object) -> list[object]:
        """Capture the semantic-search limit.

        @param _args - Positional repository arguments.
        @param kwargs - Search options containing ``limit``.
        @returns No matches; only config routing is under test.
        """
        observed_limits["vector"] = int(kwargs["limit"])
        return []

    def _keywords(*_args: object, **kwargs: object) -> list[object]:
        """Capture the keyword-search limit.

        @param _args - Positional repository arguments.
        @param kwargs - Search options containing ``limit``.
        @returns No matches; only config routing is under test.
        """
        observed_limits["keyword"] = int(kwargs["limit"])
        return []

    def _symbols(*_args: object, **kwargs: object) -> list[object]:
        """Capture the symbol-search limit.

        @param _args - Positional repository arguments.
        @param kwargs - Search options containing ``limit``.
        @returns No matches; only config routing is under test.
        """
        observed_limits["symbol"] = int(kwargs["limit"])
        return []

    monkeypatch.setattr("services.qa.tools.similarity_search", _vectors)
    monkeypatch.setattr("services.qa.tools.keyword_search", _keywords)
    monkeypatch.setattr("services.qa.tools.symbol_search", _symbols)
    monkeypatch.setattr(
        "services.qa.tools.reciprocal_rank_fusion",
        lambda **_kwargs: [],
    )

    result = execute_tool(
        MagicMock(),
        settings,
        project_id=project_id,
        tool_name="search_hybrid",
        args={"query": "how is EMI calculated?"},
        repo_ids=None,
    )

    chunks_repo.count_active_by_project.assert_called_once_with(
        project_id,
        repo_ids=None,
    )
    assert observed_limits == {
        "symbol": settings.retrieval_symbol_top_k_xlarge,
        "keyword": settings.retrieval_keyword_top_k_xlarge,
        "vector": settings.retrieval_vector_top_k_xlarge,
    }
    assert observed_limits == {"symbol": 5, "keyword": 12, "vector": 20}
    assert result.hits == []
