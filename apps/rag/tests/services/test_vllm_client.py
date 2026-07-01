"""Tests for LLM vLLM client."""

from collections.abc import Iterator
from unittest.mock import MagicMock

import httpx

from config import Settings
from services.llm.prompts import build_code_qa_messages
from services.llm.vllm_client import stream_vllm_answer


def test_build_code_qa_messages_includes_context() -> None:
    messages = build_code_qa_messages("where?", ["File: a.ts\n```\ncode\n```"])
    assert messages[0]["role"] == "system"
    assert "where?" in messages[1]["content"]
    assert "a.ts" in messages[1]["content"]


def test_stream_vllm_answer_fallback_without_config() -> None:
    settings = Settings(vllm_base_url="", vllm_model="")
    tokens = list(stream_vllm_answer(settings, question="q", context_blocks=["block"]))
    joined = "".join(tokens)
    assert "Based on the indexed code" in joined
    assert "block" in joined


def test_stream_vllm_answer_streams_from_api(monkeypatch) -> None:
    settings = Settings(vllm_base_url="http://llm", vllm_model="test-model")

    class FakeResponse:
        status_code = 200

        def iter_lines(self) -> Iterator[str]:
            yield 'data: {"choices":[{"delta":{"content":"Hello"}}]}'
            yield "data: [DONE]"

        def __enter__(self) -> "FakeResponse":
            return self

        def __exit__(self, *args: object) -> None:
            return None

    monkeypatch.setattr(httpx, "stream", lambda *a, **k: FakeResponse())
    tokens = list(stream_vllm_answer(settings, question="q", context_blocks=["ctx"]))
    assert tokens == ["Hello"]


def test_stream_vllm_answer_falls_back_on_http_error(monkeypatch) -> None:
    settings = Settings(vllm_base_url="http://llm", vllm_model="test-model")

    def raise_error(*args: object, **kwargs: object) -> None:
        raise httpx.HTTPError("down")

    monkeypatch.setattr(httpx, "stream", raise_error)
    tokens = list(stream_vllm_answer(settings, question="q", context_blocks=["ctx"]))
    assert any("Based on the indexed code" in t for t in tokens)


def test_stream_vllm_answer_falls_back_on_bad_status(monkeypatch) -> None:
    settings = Settings(vllm_base_url="http://llm", vllm_model="test-model")

    class FakeResponse:
        status_code = 500

        def __enter__(self) -> "FakeResponse":
            return self

        def __exit__(self, *args: object) -> None:
            return None

    monkeypatch.setattr(httpx, "stream", lambda *a, **k: FakeResponse())
    tokens = list(stream_vllm_answer(settings, question="q", context_blocks=["ctx"]))
    assert any("Based on the indexed code" in t for t in tokens)


def test_stream_vllm_answer_skips_malformed_sse(monkeypatch) -> None:
    settings = Settings(vllm_base_url="http://llm", vllm_model="test-model")

    class FakeResponse:
        status_code = 200

        def iter_lines(self) -> Iterator[str]:
            yield "not-data"
            yield "data: not-json"
            yield 'data: {"choices":[]}'
            yield "data: [DONE]"

        def __enter__(self) -> "FakeResponse":
            return self

        def __exit__(self, *args: object) -> None:
            return None

    monkeypatch.setattr(httpx, "stream", lambda *a, **k: FakeResponse())
    tokens = list(stream_vllm_answer(settings, question="q", context_blocks=["ctx"]))
    assert tokens == []
