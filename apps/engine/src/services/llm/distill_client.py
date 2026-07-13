"""LLM client for structured distillation JSON completions."""

from __future__ import annotations

import json
from typing import Any

import httpx

from config import Settings


def resolve_distill_model(settings: Settings) -> str:
    """Return the model id used for distillation (larger model per ADR 0009).

    Falls back to ``VLLM_MODEL`` when ``VLLM_DISTILL_MODEL`` is unset.

    @param settings - Application settings.
    @returns Model id string, or empty when LLM is not configured.
    """
    if settings.vllm_distill_model:
        return settings.vllm_distill_model
    return settings.vllm_model


def complete_distill_json(
    settings: Settings,
    *,
    system_prompt: str,
    user_prompt: str,
) -> dict[str, Any] | None:
    """Request a single JSON object from the distillation LLM.

    Returns ``None`` when the LLM endpoint is not configured or the response is
    not valid JSON — callers should fall back to heuristic distillation.

    @param settings - Application settings with vLLM endpoint and model ids.
    @param system_prompt - System instruction for structured extraction.
    @param user_prompt - User content with graph/code context.
    @returns Parsed JSON object or ``None`` on failure.
    """
    if not settings.vllm_base_url or not resolve_distill_model(settings):
        return None

    url = f"{settings.vllm_base_url.rstrip('/')}/chat/completions"
    body = {
        "model": resolve_distill_model(settings),
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0.1,
        "max_tokens": settings.llm_completion_reserve_tokens,
        "response_format": {"type": "json_object"},
    }
    try:
        response = httpx.post(url, json=body, timeout=settings.llm_timeout_seconds)
        if response.status_code >= 400:
            return None
        data = response.json()
        content = data["choices"][0]["message"]["content"]
        parsed = json.loads(content)
        if isinstance(parsed, dict):
            return parsed
    except (httpx.HTTPError, KeyError, json.JSONDecodeError, TypeError):
        return None
    return None
