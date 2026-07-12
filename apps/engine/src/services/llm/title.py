"""Conversation title generation from the first user question."""

from __future__ import annotations

import httpx

from config import Settings

_MAX_TITLE_LEN = 60


def _truncate_title(question: str) -> str:
    """Return a display-safe title from the question when the LLM is unavailable.

    @param question - Raw user question text.
    """
    line = question.strip().split("\n", maxsplit=1)[0].strip()
    if not line:
        return "New Chat"
    if len(line) <= _MAX_TITLE_LEN:
        return line
    return f"{line[: _MAX_TITLE_LEN - 1].rstrip()}…"


def generate_session_title(settings: Settings, question: str) -> str:
    """Generate a short conversation title summarizing the user's first question.

    Uses vLLM when configured; otherwise falls back to a truncated question string.

    @param settings - Application settings.
    @param question - First message in the conversation.
    @returns Human-readable session title.
    """
    fallback = _truncate_title(question)
    if not settings.vllm_base_url or not settings.vllm_model:
        return fallback

    url = f"{settings.vllm_base_url.rstrip('/')}/chat/completions"
    body = {
        "model": settings.vllm_model,
        "messages": [
            {
                "role": "system",
                "content": (
                    "Summarize the user question as a short chat title (max 8 words). "
                    "Reply with only the title text, no quotes or punctuation wrapper."
                ),
            },
            {"role": "user", "content": question},
        ],
        "stream": False,
        "temperature": 0.2,
        "max_tokens": 32,
    }

    try:
        response = httpx.post(url, json=body, timeout=30.0)
        if response.status_code >= 400:
            return fallback
        data = response.json()
        choices = data.get("choices", [])
        if not choices:
            return fallback
        content = choices[0].get("message", {}).get("content", "")
        title = str(content).strip().strip('"').strip("'")
        if not title:
            return fallback
        if len(title) > _MAX_TITLE_LEN:
            return f"{title[: _MAX_TITLE_LEN - 1].rstrip()}…"
        return title
    except httpx.HTTPError:
        return fallback
