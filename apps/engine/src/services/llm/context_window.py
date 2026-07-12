"""Detect the connected LLM's maximum context window.

The grounded QA path packs as many retrieved code chunks as fit the model's context
window instead of a fixed count. Different backends expose this size differently, so
detection is best-effort and provider-specific, with a configurable fallback. Results
are cached per model because a model's context length is stable for the process
lifetime.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

from config import Settings
from config.logging import get_indexing_logger, log_event, sanitize_log_message

_logger = get_indexing_logger()

# Cache detected windows keyed by "base_url|model" so we probe each backend once.
_CONTEXT_CACHE: dict[str, int] = {}


def _cache_key(base_url: str, model: str) -> str:
    """Build the per-model cache key.

    @param base_url - Configured LLM base URL.
    @param model - Configured model name.
    @returns Stable cache key combining both values.
    """
    return f"{base_url.rstrip('/')}|{model}"


def _detect_from_openai_models(base: str, model: str, timeout: float) -> int | None:
    """Read ``max_model_len`` from an OpenAI-compatible ``/models`` listing (vLLM).

    @param base - Base URL already ending in the OpenAI path (``.../v1``).
    @param model - Configured model name to match in the listing.
    @param timeout - Probe timeout in seconds.
    @returns Detected context length, or ``None`` when unavailable.
    """
    try:
        response = httpx.get(f"{base}/models", timeout=timeout)
        if response.status_code >= 400:
            return None
        payload = response.json()
    except (httpx.HTTPError, ValueError):
        return None

    for item in payload.get("data", []):
        if not isinstance(item, dict):
            continue
        # Match the configured model, but accept the sole entry when ids differ so a
        # single-model vLLM server still yields its window.
        max_len = item.get("max_model_len")
        if isinstance(max_len, int) and max_len > 0:
            if item.get("id") == model or len(payload.get("data", [])) == 1:
                return max_len
    return None


def _detect_from_ollama_show(base: str, model: str, timeout: float) -> int | None:
    """Read the context length from Ollama's native ``/api/show`` endpoint.

    Ollama exposes context length only on its native API, not the OpenAI-compatible
    ``/v1`` path, so the ``/v1`` suffix is stripped to reach ``/api/show``. The
    architecture-prefixed key varies by model (e.g. ``qwen2.context_length``), so any
    key ending in ``context_length`` is accepted.

    @param base - Base URL ending in the OpenAI path (``.../v1``).
    @param model - Configured model name to inspect.
    @param timeout - Probe timeout in seconds.
    @returns Detected context length, or ``None`` when unavailable.
    """
    root = base[: -len("/v1")] if base.endswith("/v1") else base
    try:
        response = httpx.post(f"{root}/api/show", json={"model": model}, timeout=timeout)
        if response.status_code >= 400:
            return None
        payload: dict[str, Any] = response.json()
    except (httpx.HTTPError, ValueError):
        return None

    model_info = payload.get("model_info")
    if not isinstance(model_info, dict):
        return None
    for key, value in model_info.items():
        if key.endswith("context_length") and isinstance(value, int) and value > 0:
            return value
    return None


def resolve_model_context_window(settings: Settings) -> int:
    """Return the connected model's max context window in tokens.

    Tries vLLM's ``max_model_len`` then Ollama's ``/api/show``; falls back to
    ``settings.llm_max_context_tokens`` when detection is disabled or fails. Never
    raises — a detection error must not break answering. Results are cached per model.

    @param settings - Application settings (LLM URL, model, timeouts, fallback).
    @returns Detected or configured context window size in tokens.
    """
    fallback = settings.llm_max_context_tokens
    base_url = settings.vllm_base_url
    model = settings.vllm_model
    if not settings.llm_context_detect_enabled or not base_url or not model:
        return fallback

    key = _cache_key(base_url, model)
    cached = _CONTEXT_CACHE.get(key)
    if cached is not None:
        return cached

    base = base_url.rstrip("/")
    timeout = settings.startup_probe_timeout_seconds
    try:
        detected = _detect_from_openai_models(base, model, timeout) or _detect_from_ollama_show(
            base, model, timeout
        )
    except Exception as exc:  # noqa: BLE001 - detection must never break a query
        log_event(
            _logger,
            logging.WARNING,
            f"Context window detection failed: {sanitize_log_message(str(exc))}. "
            f"Using fallback {fallback} tokens.",
        )
        detected = None

    window = detected if detected is not None else fallback
    _CONTEXT_CACHE[key] = window
    return window


def reset_context_cache() -> None:
    """Clear the detection cache. Intended for tests that vary settings.

    @returns None.
    """
    _CONTEXT_CACHE.clear()
