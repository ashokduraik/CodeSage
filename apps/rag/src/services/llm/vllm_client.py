"""OpenAI-compatible vLLM streaming client with excerpt fallback."""

from __future__ import annotations

import json
from collections.abc import Iterator

import httpx

from config import Settings
from services.llm.prompts import build_code_qa_messages


def _fallback_answer(context_blocks: list[str]) -> Iterator[str]:
    """Yield a deterministic answer from retrieved excerpts when vLLM is unavailable.

    @param context_blocks - Retrieved code context strings.
    @yields Answer text fragments.
    """
    yield "Based on the indexed code, here is what I found:\n\n"
    for block in context_blocks[:3]:
        yield f"{block}\n\n"


def stream_vllm_answer(
    settings: Settings,
    *,
    question: str,
    context_blocks: list[str],
) -> Iterator[str]:
    """Stream an LLM answer from vLLM, or fall back to excerpt synthesis.

    @param settings - Application settings.
    @param question - User question.
    @param context_blocks - Retrieved code excerpts.
    @yields Text fragments of the answer.
    """
    if not settings.vllm_base_url or not settings.vllm_model:
        yield from _fallback_answer(context_blocks)
        return

    messages = build_code_qa_messages(question, context_blocks)
    url = f"{settings.vllm_base_url.rstrip('/')}/chat/completions"
    body = {"model": settings.vllm_model, "messages": messages, "stream": True, "temperature": 0.2}

    try:
        with httpx.stream("POST", url, json=body, timeout=120.0) as response:
            if response.status_code >= 400:
                yield from _fallback_answer(context_blocks)
                return
            for line in response.iter_lines():
                if not line.startswith("data: "):
                    continue
                payload = line[6:].strip()
                if payload == "[DONE]":
                    break
                try:
                    data = json.loads(payload)
                except json.JSONDecodeError:
                    # vLLM occasionally emits partial SSE frames or keep-alive lines.
                    # Skip bad JSON rather than failing the whole answer stream.
                    continue
                choices = data.get("choices", [])
                if not choices:
                    continue
                delta = choices[0].get("delta", {})
                content = delta.get("content")
                if content:
                    yield content
    except httpx.HTTPError:
        # When vLLM is down or times out, still return grounded excerpts from retrieval.
        # Product rule (NFR-7): never invent an answer — cite indexed code or abstain.
        yield from _fallback_answer(context_blocks)
