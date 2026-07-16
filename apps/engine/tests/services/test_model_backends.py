"""Tests for startup model-backend connectivity probes."""

from __future__ import annotations

import logging
from unittest.mock import MagicMock

import httpx
import pytest

from config import Settings
from services.health import (
    ProbeStatus,
    check_embedding_backend,
    check_llm_backend,
    check_planner_tool_support,
    get_planner_tools_health,
    log_model_backend_status,
    probe_openai_backend,
)

_MODULE = "services.health.model_backends"


def _models_response(ids: list[str], status_code: int = 200) -> MagicMock:
    response = MagicMock()
    response.status_code = status_code
    response.json.return_value = {"data": [{"id": model_id} for model_id in ids]}
    return response


def test_fallback_when_url_unset() -> None:
    probe = probe_openai_backend(base_url="", model="", timeout=1.0)
    assert probe.status is ProbeStatus.FALLBACK


def test_ok_when_model_listed(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        f"{_MODULE}.httpx.get",
        lambda *a, **k: _models_response(["qwen2.5:7b", "mxbai-embed-large"]),
    )
    probe = probe_openai_backend(
        base_url="http://localhost:11434/v1", model="qwen2.5:7b", timeout=1.0
    )
    assert probe.status is ProbeStatus.OK
    assert "qwen2.5:7b" in probe.message


def test_ok_lenient_latest_tag(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        f"{_MODULE}.httpx.get",
        lambda *a, **k: _models_response(["qwen2.5:latest"]),
    )
    probe = probe_openai_backend(
        base_url="http://localhost:11434/v1", model="qwen2.5", timeout=1.0
    )
    assert probe.status is ProbeStatus.OK


def test_ok_without_model_configured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        f"{_MODULE}.httpx.get", lambda *a, **k: _models_response(["anything"])
    )
    probe = probe_openai_backend(
        base_url="http://localhost:11434/v1", model="", timeout=1.0
    )
    assert probe.status is ProbeStatus.OK


def test_model_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        f"{_MODULE}.httpx.get", lambda *a, **k: _models_response(["other-model"])
    )
    probe = probe_openai_backend(
        base_url="http://localhost:11434/v1", model="qwen2.5:7b", timeout=1.0
    )
    assert probe.status is ProbeStatus.MODEL_MISSING


def test_unreachable_on_connect_error(monkeypatch: pytest.MonkeyPatch) -> None:
    def _raise(*_a: object, **_k: object) -> None:
        raise httpx.ConnectError("connection refused")

    monkeypatch.setattr(f"{_MODULE}.httpx.get", _raise)
    probe = probe_openai_backend(
        base_url="http://localhost:11434/v1", model="qwen2.5:7b", timeout=1.0
    )
    assert probe.status is ProbeStatus.UNREACHABLE


def test_unreachable_on_timeout(monkeypatch: pytest.MonkeyPatch) -> None:
    def _raise(*_a: object, **_k: object) -> None:
        raise httpx.ReadTimeout("timed out")

    monkeypatch.setattr(f"{_MODULE}.httpx.get", _raise)
    probe = probe_openai_backend(
        base_url="http://localhost:11434/v1", model="m", timeout=1.0
    )
    assert probe.status is ProbeStatus.UNREACHABLE


def test_unverified_on_non_200(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        f"{_MODULE}.httpx.get", lambda *a, **k: _models_response([], status_code=404)
    )
    probe = probe_openai_backend(
        base_url="http://tei:8080", model="bge", timeout=1.0
    )
    assert probe.status is ProbeStatus.UNVERIFIED


def test_unverified_on_bad_json(monkeypatch: pytest.MonkeyPatch) -> None:
    response = MagicMock()
    response.status_code = 200
    response.json.side_effect = ValueError("not json")
    monkeypatch.setattr(f"{_MODULE}.httpx.get", lambda *a, **k: response)
    probe = probe_openai_backend(
        base_url="http://localhost:11434/v1", model="m", timeout=1.0
    )
    assert probe.status is ProbeStatus.UNVERIFIED


def test_check_helpers_use_settings(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, str] = {}

    def fake_get(url: str, timeout: float) -> MagicMock:
        captured["url"] = url
        return _models_response(["m-embed", "m-llm"])

    monkeypatch.setattr(f"{_MODULE}.httpx.get", fake_get)
    settings = Settings(
        tei_base_url="http://localhost:11434/v1",
        tei_embed_model="m-embed",
        vllm_base_url="http://localhost:11434/v1",
        vllm_model="m-llm",
    )
    assert check_embedding_backend(settings).status is ProbeStatus.OK
    assert check_llm_backend(settings).status is ProbeStatus.OK
    assert captured["url"].endswith("/models")


def test_log_model_backend_status_ok(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    monkeypatch.setattr(
        f"{_MODULE}.httpx.get",
        lambda *a, **k: _models_response(["m-embed", "m-llm"]),
    )
    post_response = MagicMock()
    post_response.status_code = 200
    post_response.json.return_value = {
        "choices": [{"message": {"role": "assistant", "content": "ok"}}]
    }
    monkeypatch.setattr(f"{_MODULE}.httpx.post", lambda *a, **k: post_response)
    settings = Settings(
        tei_base_url="http://localhost:11434/v1",
        tei_embed_model="m-embed",
        vllm_base_url="http://localhost:11434/v1",
        vllm_model="m-llm",
    )
    with caplog.at_level(logging.INFO, logger="codesage.indexing"):
        log_model_backend_status(settings)
    text = caplog.text
    assert "LLM backend ready" in text
    assert "Embedding backend ready" in text
    assert "Planner tool calling ready" in text


def test_log_model_backend_status_warns_when_unreachable(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    def _raise(*_a: object, **_k: object) -> None:
        raise httpx.ConnectError("refused")

    monkeypatch.setattr(f"{_MODULE}.httpx.get", _raise)
    monkeypatch.setattr(f"{_MODULE}.httpx.post", _raise)
    settings = Settings(
        tei_base_url="http://localhost:11434/v1",
        tei_embed_model="m-embed",
        vllm_base_url="http://localhost:11434/v1",
        vllm_model="m-llm",
    )
    with caplog.at_level(logging.WARNING, logger="codesage.indexing"):
        log_model_backend_status(settings)
    warnings = [r for r in caplog.records if r.levelno == logging.WARNING]
    assert any("LLM backend unreachable" in r.message for r in warnings)
    assert any("Embedding backend unreachable" in r.message for r in warnings)
    assert any("Planner tool calling unsupported" in r.message for r in warnings)


def test_log_fallback_when_unset(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    settings = Settings(tei_base_url="", vllm_base_url="")
    with caplog.at_level(logging.INFO, logger="codesage.indexing"):
        log_model_backend_status(settings)
    assert "excerpt fallback" in caplog.text
    assert "deterministic dev embeddings" in caplog.text
    assert "Planner tool calling skipped" in caplog.text


def test_log_warns_on_model_missing(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    monkeypatch.setattr(
        f"{_MODULE}.httpx.get", lambda *a, **k: _models_response(["other"])
    )
    planner_response = MagicMock()
    planner_response.status_code = 400
    monkeypatch.setattr(f"{_MODULE}.httpx.post", lambda *a, **k: planner_response)
    settings = Settings(
        tei_base_url="http://localhost:11434/v1",
        tei_embed_model="mxbai-embed-large",
        vllm_base_url="http://localhost:11434/v1",
        vllm_model="qwen2.5:7b",
    )
    with caplog.at_level(logging.WARNING, logger="codesage.indexing"):
        log_model_backend_status(settings)
    text = caplog.text
    assert "ollama pull qwen2.5:7b" in text
    assert "ollama pull mxbai-embed-large" in text


def test_log_probe_never_raises(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    def _boom(_settings: object) -> None:
        raise RuntimeError("unexpected")

    monkeypatch.setattr(f"{_MODULE}.check_llm_backend", _boom)
    with caplog.at_level(logging.WARNING, logger="codesage.indexing"):
        log_model_backend_status(Settings(vllm_base_url="http://x", tei_base_url="http://x"))
    assert "probe skipped due to unexpected error" in caplog.text


def test_planner_health_check_skips_when_no_url() -> None:
    probe = check_planner_tool_support(Settings(vllm_base_url="", vllm_model=""))
    assert probe.status is ProbeStatus.FALLBACK
    assert get_planner_tools_health() == "unsupported"


def test_planner_health_check_ok(monkeypatch: pytest.MonkeyPatch) -> None:
    response = MagicMock()
    response.status_code = 200
    response.json.return_value = {
        "choices": [{"message": {"role": "assistant", "content": "ok"}}]
    }
    monkeypatch.setattr(f"{_MODULE}.httpx.post", lambda *a, **k: response)
    probe = check_planner_tool_support(
        Settings(vllm_base_url="http://localhost:11434/v1", vllm_model="qwen2.5:7b")
    )
    assert probe.status is ProbeStatus.OK
    assert get_planner_tools_health() == "ok"


def test_planner_health_check_unsupported_on_http_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def _raise(*_a: object, **_k: object) -> None:
        raise httpx.ConnectError("refused")

    monkeypatch.setattr(f"{_MODULE}.httpx.post", _raise)
    probe = check_planner_tool_support(
        Settings(vllm_base_url="http://localhost:11434/v1", vllm_model="m")
    )
    assert probe.status is ProbeStatus.UNREACHABLE
    assert get_planner_tools_health() == "unsupported"


def test_planner_health_check_unsupported_on_bad_status(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    response = MagicMock()
    response.status_code = 400
    response.json.return_value = {"error": "tools not supported"}
    monkeypatch.setattr(f"{_MODULE}.httpx.post", lambda *a, **k: response)
    probe = check_planner_tool_support(
        Settings(vllm_base_url="http://localhost:11434/v1", vllm_model="m")
    )
    assert probe.status is ProbeStatus.UNREACHABLE
    assert get_planner_tools_health() == "unsupported"


def test_planner_health_check_unsupported_on_bad_json(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    response = MagicMock()
    response.status_code = 200
    response.json.side_effect = ValueError("nope")
    monkeypatch.setattr(f"{_MODULE}.httpx.post", lambda *a, **k: response)
    probe = check_planner_tool_support(
        Settings(vllm_base_url="http://localhost:11434/v1", vllm_model="m")
    )
    assert probe.status is ProbeStatus.UNREACHABLE


def test_planner_health_check_unsupported_when_message_missing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    response = MagicMock()
    response.status_code = 200
    response.json.return_value = {"choices": []}
    monkeypatch.setattr(f"{_MODULE}.httpx.post", lambda *a, **k: response)
    probe = check_planner_tool_support(
        Settings(vllm_base_url="http://localhost:11434/v1", vllm_model="m")
    )
    assert probe.status is ProbeStatus.UNREACHABLE


def test_planner_health_check_unsupported_non_object(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    response = MagicMock()
    response.status_code = 200
    response.json.return_value = ["list"]
    monkeypatch.setattr(f"{_MODULE}.httpx.post", lambda *a, **k: response)
    probe = check_planner_tool_support(
        Settings(vllm_base_url="http://localhost:11434/v1", vllm_model="m")
    )
    assert probe.status is ProbeStatus.UNREACHABLE


def test_log_model_backend_status_includes_planner_probe(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    def fake_get(*_a: object, **_k: object) -> MagicMock:
        return _models_response(["m-embed", "m-llm"])

    response = MagicMock()
    response.status_code = 200
    response.json.return_value = {
        "choices": [{"message": {"role": "assistant", "content": "ok"}}]
    }
    monkeypatch.setattr(f"{_MODULE}.httpx.get", fake_get)
    monkeypatch.setattr(f"{_MODULE}.httpx.post", lambda *a, **k: response)
    settings = Settings(
        tei_base_url="http://localhost:11434/v1",
        tei_embed_model="m-embed",
        vllm_base_url="http://localhost:11434/v1",
        vllm_model="m-llm",
    )
    with caplog.at_level(logging.INFO, logger="codesage.indexing"):
        log_model_backend_status(settings)
    assert "Planner tool calling ready" in caplog.text
    assert get_planner_tools_health() == "ok"
