"""Tests for LLM conversation title generation."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from config import Settings
from services.llm.title import _truncate_title, generate_session_title


def test_truncate_title_short_question() -> None:
    assert _truncate_title("Where is auth?") == "Where is auth?"


def test_truncate_title_long_question() -> None:
    long_q = "x" * 100
    title = _truncate_title(long_q)
    assert len(title) <= 60
    assert title.endswith("…")


def test_truncate_title_empty() -> None:
    assert _truncate_title("   ") == "New Chat"


def test_generate_session_title_fallback_without_vllm() -> None:
    settings = Settings(vllm_base_url="", vllm_model="")
    assert generate_session_title(settings, "Where is login?") == "Where is login?"


def test_generate_session_title_uses_vllm_response() -> None:
    settings = Settings(vllm_base_url="http://vllm:8000/v1", vllm_model="test-model")
    response = MagicMock()
    response.status_code = 200
    response.json.return_value = {
        "choices": [{"message": {"content": "Login handler location"}}],
    }
    with patch("services.llm.title.httpx.post", return_value=response):
        title = generate_session_title(settings, "Where is the login handler?")
    assert title == "Login handler location"


def test_generate_session_title_falls_back_on_http_error() -> None:
    settings = Settings(vllm_base_url="http://vllm:8000/v1", vllm_model="test-model")
    response = SimpleNamespace(status_code=503)
    with patch("services.llm.title.httpx.post", return_value=response):
        title = generate_session_title(settings, "Where is auth?")
    assert title == "Where is auth?"
