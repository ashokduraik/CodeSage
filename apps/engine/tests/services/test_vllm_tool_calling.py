"""Tests for OpenAI-compatible LLM tool calling (planner path)."""

from __future__ import annotations

from unittest.mock import MagicMock

import httpx
import pytest

from config import Settings
from services.llm.vllm_client import (
    LlmStreamStats,
    LlmToolCallingError,
    ParsedToolCall,
    complete_with_tools,
    parse_openai_tool_calls_from_response,
    stream_final_answer,
)


def test_parse_openai_tool_calls_from_response() -> None:
    payload = {
        "choices": [
            {
                "message": {
                    "role": "assistant",
                    "content": None,
                    "tool_calls": [
                        {
                            "id": "call_1",
                            "type": "function",
                            "function": {
                                "name": "search_symbols",
                                "arguments": '{"query": "AuthService"}',
                            },
                        },
                        {
                            "id": "call_2",
                            "type": "function",
                            "function": {
                                "name": "search_code",
                                "arguments": {"query": "login"},
                            },
                        },
                    ],
                }
            }
        ],
        "usage": {
            "prompt_tokens": 10,
            "completion_tokens": 5,
            "total_tokens": 15,
        },
    }
    result = parse_openai_tool_calls_from_response(payload)
    assert len(result.tool_calls) == 2
    assert result.tool_calls[0].name == "search_symbols"
    assert result.tool_calls[0].arguments == {"query": "AuthService"}
    assert result.tool_calls[0].id == "call_1"
    assert result.tool_calls[1].arguments == {"query": "login"}
    assert result.assistant_content is None
    assert result.usage == {
        "prompt_tokens": 10,
        "completion_tokens": 5,
        "total_tokens": 15,
    }


def test_parse_openai_tool_calls_text_only() -> None:
    payload = {
        "choices": [
            {
                "message": {
                    "role": "assistant",
                    "content": "Hello!",
                    "tool_calls": [],
                }
            }
        ]
    }
    result = parse_openai_tool_calls_from_response(payload)
    assert result.tool_calls == []
    assert result.assistant_content == "Hello!"


def test_parse_openai_tool_calls_invalid_arguments_json() -> None:
    payload = {
        "choices": [
            {
                "message": {
                    "tool_calls": [
                        {
                            "id": "c",
                            "function": {"name": "search_code", "arguments": "{not-json"},
                        }
                    ]
                }
            }
        ]
    }
    result = parse_openai_tool_calls_from_response(payload)
    assert len(result.tool_calls) == 1
    assert result.tool_calls[0].arguments == {}


def test_parse_tool_arguments_edge_cases() -> None:
    """Cover empty string, non-object JSON, and non-string/non-dict arguments."""
    assert (
        parse_openai_tool_calls_from_response(
            {
                "choices": [
                    {
                        "message": {
                            "tool_calls": [
                                {"function": {"name": "a", "arguments": "   "}},
                                {"function": {"name": "b", "arguments": "[1]"}},
                                {"function": {"name": "c", "arguments": 42}},
                                "not-a-dict",
                                {"function": {"name": ""}},
                                {"name": "flat", "arguments": "{}"},
                            ]
                        }
                    }
                ]
            }
        ).tool_calls
        == [
            ParsedToolCall(name="a", arguments={}, id=None),
            ParsedToolCall(name="b", arguments={}, id=None),
            ParsedToolCall(name="c", arguments={}, id=None),
            ParsedToolCall(name="flat", arguments={}, id=None),
        ]
    )


def test_parse_skips_non_dict_choice_and_empty_usage() -> None:
    result = parse_openai_tool_calls_from_response(
        {"choices": ["bad"], "usage": {"prompt_tokens": "x"}}
    )
    assert result.tool_calls == []
    assert result.usage is None


def test_parse_ollama_usage_partial() -> None:
    result = parse_openai_tool_calls_from_response(
        {"message": {"content": "x"}, "prompt_eval_count": 7}
    )
    assert result.assistant_content == "x"
    assert result.usage == {"prompt_tokens": 7}


def test_parse_ollama_native_message_shape() -> None:
    payload = {
        "message": {
            "role": "assistant",
            "content": "",
            "tool_calls": [
                {"function": {"name": "search_hybrid", "arguments": {"query": "x"}}}
            ],
        },
        "prompt_eval_count": 3,
        "eval_count": 2,
    }
    result = parse_openai_tool_calls_from_response(payload)
    assert result.tool_calls[0].name == "search_hybrid"
    assert result.usage == {
        "prompt_tokens": 3,
        "completion_tokens": 2,
        "total_tokens": 5,
    }


def test_complete_with_tools_empty_when_no_base_url() -> None:
    settings = Settings(vllm_base_url="", vllm_model="")
    with pytest.raises(LlmToolCallingError, match="VLLM_BASE_URL"):
        complete_with_tools(settings, [{"role": "user", "content": "hi"}], tools=[])


def test_complete_with_tools_raises_on_http_error(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = Settings(vllm_base_url="http://llm/v1", vllm_model="m")

    def _raise(*_a: object, **_k: object) -> None:
        raise httpx.ConnectError("refused")

    monkeypatch.setattr(httpx, "post", _raise)
    with pytest.raises(LlmToolCallingError, match="failed"):
        complete_with_tools(
            settings,
            [{"role": "user", "content": "q"}],
            tools=[{"type": "function", "function": {"name": "ping"}}],
        )


def test_complete_with_tools_raises_on_bad_status(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = Settings(vllm_base_url="http://llm/v1", vllm_model="m")
    response = MagicMock()
    response.status_code = 500
    response.text = "boom"
    monkeypatch.setattr(httpx, "post", lambda *a, **k: response)
    with pytest.raises(LlmToolCallingError, match="HTTP 500"):
        complete_with_tools(settings, [{"role": "user", "content": "q"}], tools=[])


def test_complete_with_tools_parses_success(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = Settings(vllm_base_url="http://llm/v1", vllm_model="m")
    response = MagicMock()
    response.status_code = 200
    response.json.return_value = {
        "choices": [
            {
                "message": {
                    "tool_calls": [
                        {
                            "id": "call_x",
                            "function": {
                                "name": "search_symbols",
                                "arguments": '{"query": "Foo"}',
                            },
                        }
                    ]
                }
            }
        ],
        "usage": {"prompt_tokens": 1, "completion_tokens": 2, "total_tokens": 3},
    }
    captured: dict[str, object] = {}

    def fake_post(url: str, json: dict[str, object], timeout: object) -> MagicMock:
        captured["url"] = url
        captured["body"] = json
        return response

    monkeypatch.setattr(httpx, "post", fake_post)
    stats = LlmStreamStats()
    result = complete_with_tools(
        settings,
        [{"role": "user", "content": "where is Foo?"}],
        tools=[{"type": "function", "function": {"name": "search_symbols"}}],
        stats=stats,
    )
    assert captured["url"] == "http://llm/v1/chat/completions"
    body = captured["body"]
    assert isinstance(body, dict)
    assert body["stream"] is False
    assert body["tool_choice"] == "auto"
    assert result.tool_calls[0].name == "search_symbols"
    assert result.tool_calls[0].arguments == {"query": "Foo"}
    assert stats.prompt_tokens == 1
    assert stats.completion_tokens == 2


def test_complete_with_tools_thinking_model_uses_ollama_native(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = Settings(vllm_base_url="http://localhost:11434/v1", vllm_model="qwen3:8b")
    response = MagicMock()
    response.status_code = 200
    response.json.return_value = {
        "message": {"role": "assistant", "content": "hi", "tool_calls": []}
    }
    captured: dict[str, object] = {}

    def fake_post(url: str, json: dict[str, object], timeout: object) -> MagicMock:
        captured["url"] = url
        captured["body"] = json
        return response

    monkeypatch.setattr(httpx, "post", fake_post)
    result = complete_with_tools(
        settings, [{"role": "user", "content": "hi"}], tools=[]
    )
    assert captured["url"] == "http://localhost:11434/api/chat"
    body = captured["body"]
    assert isinstance(body, dict)
    assert body.get("think") is False
    assert result.assistant_content == "hi"


def test_complete_with_tools_thinking_model_on_vllm_shim(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = Settings(vllm_base_url="http://vllm:8000/v1", vllm_model="qwen3-8b")
    response = MagicMock()
    response.status_code = 200
    response.json.return_value = {
        "choices": [{"message": {"role": "assistant", "content": "ok"}}]
    }
    captured: dict[str, object] = {}

    def fake_post(url: str, json: dict[str, object], timeout: object) -> MagicMock:
        captured["url"] = url
        captured["body"] = json
        return response

    monkeypatch.setattr(httpx, "post", fake_post)
    complete_with_tools(settings, [{"role": "user", "content": "q"}], tools=[])
    assert captured["url"] == "http://vllm:8000/v1/chat/completions"
    body = captured["body"]
    assert isinstance(body, dict)
    assert body.get("think") is False
    assert body.get("chat_template_kwargs") == {"enable_thinking": False}


def test_complete_with_tools_raises_on_invalid_json(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = Settings(vllm_base_url="http://llm/v1", vllm_model="m")
    response = MagicMock()
    response.status_code = 200
    response.json.side_effect = ValueError("bad")
    monkeypatch.setattr(httpx, "post", lambda *a, **k: response)
    with pytest.raises(LlmToolCallingError, match="not valid JSON"):
        complete_with_tools(settings, [{"role": "user", "content": "q"}], tools=[])


def test_complete_with_tools_raises_on_non_object_json(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = Settings(vllm_base_url="http://llm/v1", vllm_model="m")
    response = MagicMock()
    response.status_code = 200
    response.json.return_value = ["not", "an", "object"]
    monkeypatch.setattr(httpx, "post", lambda *a, **k: response)
    with pytest.raises(LlmToolCallingError, match="not a JSON object"):
        complete_with_tools(settings, [{"role": "user", "content": "q"}], tools=[])


def test_stream_final_answer_delegates_to_fallback() -> None:
    settings = Settings(vllm_base_url="", vllm_model="")
    tokens = list(
        stream_final_answer(settings, question="q", context_blocks=["block-a"])
    )
    assert "block-a" in "".join(tokens)

