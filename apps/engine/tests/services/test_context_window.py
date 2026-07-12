"""Tests for LLM context window detection."""

import httpx
import pytest

from config import Settings
from services.llm import context_window
from services.llm.context_window import resolve_model_context_window


@pytest.fixture(autouse=True)
def _clear_cache() -> None:
    context_window.reset_context_cache()


def _settings(**kwargs: object) -> Settings:
    base = {
        "vllm_base_url": "http://llm/v1",
        "vllm_model": "test-model",
        "llm_max_context_tokens": 8192,
    }
    base.update(kwargs)
    return Settings(**base)


def test_returns_fallback_when_detection_disabled() -> None:
    settings = _settings(llm_context_detect_enabled=False)
    assert resolve_model_context_window(settings) == 8192


def test_returns_fallback_when_no_backend_configured() -> None:
    settings = _settings(vllm_base_url="", vllm_model="")
    assert resolve_model_context_window(settings) == 8192


def test_detects_from_vllm_max_model_len(monkeypatch) -> None:
    def fake_get(url: str, timeout: float):
        return httpx.Response(
            200, json={"data": [{"id": "test-model", "max_model_len": 32768}]}
        )

    monkeypatch.setattr(httpx, "get", fake_get)
    assert resolve_model_context_window(_settings()) == 32768


def test_detects_from_ollama_show_when_models_missing(monkeypatch) -> None:
    def fake_get(url: str, timeout: float):
        return httpx.Response(200, json={"data": []})

    def fake_post(url: str, json: dict, timeout: float):
        assert url == "http://llm/api/show"
        return httpx.Response(200, json={"model_info": {"qwen2.context_length": 16384}})

    monkeypatch.setattr(httpx, "get", fake_get)
    monkeypatch.setattr(httpx, "post", fake_post)
    assert resolve_model_context_window(_settings()) == 16384


def test_falls_back_when_all_detection_fails(monkeypatch) -> None:
    def raise_error(*args: object, **kwargs: object):
        raise httpx.HTTPError("down")

    monkeypatch.setattr(httpx, "get", raise_error)
    monkeypatch.setattr(httpx, "post", raise_error)
    assert resolve_model_context_window(_settings()) == 8192


def test_result_is_cached(monkeypatch) -> None:
    calls = {"n": 0}

    def fake_get(url: str, timeout: float):
        calls["n"] += 1
        return httpx.Response(200, json={"data": [{"id": "test-model", "max_model_len": 4096}]})

    monkeypatch.setattr(httpx, "get", fake_get)
    settings = _settings()
    assert resolve_model_context_window(settings) == 4096
    assert resolve_model_context_window(settings) == 4096
    assert calls["n"] == 1
