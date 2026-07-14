"""Tests for LLM vLLM client."""

import json
from collections.abc import Iterator

import httpx

from config import Settings
from services.llm.prompts import build_code_qa_messages
from services.llm.vllm_client import LlmStreamStats, stream_vllm_answer


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


def test_stream_vllm_answer_falls_back_on_empty_stream(monkeypatch) -> None:
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
    joined = "".join(tokens)
    assert "Based on the indexed code" in joined
    assert "ctx" in joined


def test_stream_vllm_answer_captures_usage_and_tps(monkeypatch) -> None:
    settings = Settings(vllm_base_url="http://llm", vllm_model="test-model")

    class FakeResponse:
        status_code = 200

        def iter_lines(self) -> Iterator[str]:
            yield 'data: {"choices":[{"delta":{"content":"Hi"}}]}'
            yield 'data: {"choices":[],"usage":{"prompt_tokens":100,"completion_tokens":20,"total_tokens":120}}'
            yield "data: [DONE]"

        def __enter__(self) -> "FakeResponse":
            return self

        def __exit__(self, *args: object) -> None:
            return None

    monkeypatch.setattr(httpx, "stream", lambda *a, **k: FakeResponse())
    stats = LlmStreamStats()
    tokens = list(
        stream_vllm_answer(settings, question="q", context_blocks=["ctx"], stats=stats)
    )
    assert tokens == ["Hi"]
    assert stats.prompt_tokens == 100
    assert stats.completion_tokens == 20
    assert stats.total_tokens == 120
    assert stats.elapsed_seconds is not None
    assert stats.tokens_per_second is not None


def test_stream_vllm_answer_omits_stream_options_by_default(monkeypatch) -> None:
    settings = Settings(
        vllm_base_url="http://llm", vllm_model="test-model", llm_completion_reserve_tokens=256
    )
    captured: dict[str, object] = {}

    class FakeResponse:
        status_code = 200

        def iter_lines(self) -> Iterator[str]:
            yield 'data: {"choices":[{"delta":{"content":"x"}}]}'
            yield "data: [DONE]"

        def __enter__(self) -> "FakeResponse":
            return self

        def __exit__(self, *args: object) -> None:
            return None

    def fake_stream(method: str, url: str, *, json: dict[str, object], **kwargs: object):
        captured.update(json)
        return FakeResponse()

    monkeypatch.setattr(httpx, "stream", fake_stream)
    list(stream_vllm_answer(settings, question="q", context_blocks=["ctx"]))
    assert captured["max_tokens"] == 256
    assert "stream_options" not in captured


def test_stream_vllm_answer_sends_stream_options_when_enabled(monkeypatch) -> None:
    settings = Settings(
        vllm_base_url="http://llm",
        vllm_model="test-model",
        llm_stream_include_usage=True,
    )
    captured: dict[str, object] = {}

    class FakeResponse:
        status_code = 200

        def iter_lines(self) -> Iterator[str]:
            yield 'data: {"choices":[{"delta":{"content":"x"}}]}'
            yield "data: [DONE]"

        def __enter__(self) -> "FakeResponse":
            return self

        def __exit__(self, *args: object) -> None:
            return None

    def fake_stream(method: str, url: str, *, json: dict[str, object], **kwargs: object):
        captured.update(json)
        return FakeResponse()

    monkeypatch.setattr(httpx, "stream", fake_stream)
    list(stream_vllm_answer(settings, question="q", context_blocks=["ctx"]))
    assert captured["stream_options"] == {"include_usage": True}


def test_stream_vllm_answer_disables_think_for_qwen3_non_ollama(monkeypatch) -> None:
    settings = Settings(vllm_base_url="http://llm/v1", vllm_model="qwen3.5:9b")
    captured: dict[str, object] = {}

    class FakeResponse:
        status_code = 200

        def iter_lines(self) -> Iterator[str]:
            yield 'data: {"choices":[{"delta":{"content":"Hi"}}]}'
            yield "data: [DONE]"

        def __enter__(self) -> "FakeResponse":
            return self

        def __exit__(self, *args: object) -> None:
            return None

    def fake_stream(method: str, url: str, *, json: dict[str, object], **kwargs: object):
        captured["url"] = url
        captured.update(json)
        return FakeResponse()

    monkeypatch.setattr(httpx, "stream", fake_stream)
    tokens = list(stream_vllm_answer(settings, question="q", context_blocks=["ctx"]))
    assert tokens == ["Hi"]
    assert captured["url"] == "http://llm/v1/chat/completions"
    assert captured.get("think") is False
    assert captured.get("chat_template_kwargs") == {"enable_thinking": False}


def test_stream_vllm_answer_uses_ollama_native_for_qwen3(monkeypatch) -> None:
    settings = Settings(vllm_base_url="http://192.168.1.121:11434/v1", vllm_model="qwen3.5:9b")
    captured: dict[str, object] = {}

    class FakeResponse:
        status_code = 200

        def iter_lines(self) -> Iterator[str]:
            yield json.dumps({"message": {"role": "assistant", "content": "Hel"}, "done": False})
            yield json.dumps({"message": {"role": "assistant", "content": "lo"}, "done": False})
            yield json.dumps(
                {
                    "message": {"role": "assistant", "content": ""},
                    "done": True,
                    "prompt_eval_count": 10,
                    "eval_count": 2,
                }
            )

        def __enter__(self) -> "FakeResponse":
            return self

        def __exit__(self, *args: object) -> None:
            return None

    def fake_stream(method: str, url: str, *, json: dict[str, object], **kwargs: object):
        captured["url"] = url
        captured.update(json)
        return FakeResponse()

    monkeypatch.setattr(httpx, "stream", fake_stream)
    stats = LlmStreamStats()
    tokens = list(
        stream_vllm_answer(settings, question="q", context_blocks=["ctx"], stats=stats)
    )
    assert tokens == ["Hel", "lo"]
    assert captured["url"] == "http://192.168.1.121:11434/api/chat"
    assert captured.get("think") is False
    assert stats.prompt_tokens == 10
    assert stats.completion_tokens == 2
