"""OpenAI-compatible vLLM streaming client with excerpt fallback."""

from __future__ import annotations

import json
import time
from collections.abc import Iterator
from dataclasses import dataclass

import httpx

from config import Settings
from services.llm.prompts import build_code_qa_messages


@dataclass
class LlmStreamStats:
    """Usage and timing captured during an LLM stream, for chat metrics.

    Fields stay ``None`` when the backend does not report usage (e.g. the excerpt
    fallback path) so the UI can omit unknown values rather than show zeros.

    @param prompt_tokens - Context tokens consumed, as reported by the backend.
    @param completion_tokens - Generated answer tokens, as reported by the backend.
    @param total_tokens - Sum reported by the backend.
    @param elapsed_seconds - Wall-clock duration of the streamed generation.
    @param tokens_per_second - Completion tokens divided by elapsed seconds.
    """

    prompt_tokens: int | None = None
    completion_tokens: int | None = None
    total_tokens: int | None = None
    elapsed_seconds: float | None = None
    tokens_per_second: float | None = None


def _apply_usage(stats: LlmStreamStats, usage: dict[str, object]) -> None:
    """Copy backend usage counters into the stats object.

    @param stats - Stats object to populate.
    @param usage - ``usage`` block from the final streamed frame.
    """
    prompt = usage.get("prompt_tokens")
    completion = usage.get("completion_tokens")
    total = usage.get("total_tokens")
    if isinstance(prompt, int):
        stats.prompt_tokens = prompt
    if isinstance(completion, int):
        stats.completion_tokens = completion
    if isinstance(total, int):
        stats.total_tokens = total


def _finalize_timing(stats: LlmStreamStats, elapsed_seconds: float) -> None:
    """Record elapsed time and derive tokens/sec when possible.

    @param stats - Stats object to finalize.
    @param elapsed_seconds - Wall-clock duration of the stream.
    """
    stats.elapsed_seconds = elapsed_seconds
    if stats.completion_tokens and elapsed_seconds > 0:
        stats.tokens_per_second = round(stats.completion_tokens / elapsed_seconds, 1)


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
    history: list[dict[str, str]] | None = None,
    stats: LlmStreamStats | None = None,
) -> Iterator[str]:
    """Stream an LLM answer from vLLM, or fall back to excerpt synthesis.

    When ``stats`` is provided and the backend reports usage, it is populated with
    token counts and timing so the caller can emit chat metrics.

    @param settings - Application settings.
    @param question - User question.
    @param context_blocks - Retrieved code excerpts.
    @param history - Optional prior conversation turns for multi-turn QA.
    @param stats - Optional stats object filled with usage and timing when available.
    @yields Text fragments of the answer.
    """
    if not settings.vllm_base_url or not settings.vllm_model:
        yield from _fallback_answer(context_blocks)
        return

    messages = build_code_qa_messages(question, context_blocks, history)
    url = f"{settings.vllm_base_url.rstrip('/')}/chat/completions"
    body = {
        "model": settings.vllm_model,
        "messages": messages,
        "stream": True,
        "temperature": 0.2,
        "max_tokens": settings.llm_completion_reserve_tokens,
        # Ask OpenAI-compatible servers to include a final usage frame so we can
        # report tokens and tokens/sec in the chat UI.
        "stream_options": {"include_usage": True},
    }

    start = time.monotonic()
    try:
        with httpx.stream(
            "POST", url, json=body, timeout=settings.llm_timeout_seconds
        ) as response:
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
                # The usage-only final frame carries no choices; capture it for metrics.
                usage = data.get("usage")
                if isinstance(usage, dict) and stats is not None:
                    _apply_usage(stats, usage)
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
        return

    if stats is not None:
        _finalize_timing(stats, time.monotonic() - start)
