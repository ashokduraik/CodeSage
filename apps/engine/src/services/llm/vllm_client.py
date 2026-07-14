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


def _apply_ollama_counts(stats: LlmStreamStats, data: dict[str, object]) -> None:
    """Map Ollama native ``/api/chat`` eval counts onto OpenAI-style usage fields.

    @param stats - Stats object to populate.
    @param data - Final Ollama stream frame (``done: true``).
    """
    prompt = data.get("prompt_eval_count")
    completion = data.get("eval_count")
    if isinstance(prompt, int):
        stats.prompt_tokens = prompt
    if isinstance(completion, int):
        stats.completion_tokens = completion
    if isinstance(prompt, int) and isinstance(completion, int):
        stats.total_tokens = prompt + completion


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


def _is_thinking_model(model: str) -> bool:
    """Return whether the model may emit a separate reasoning stream before content.

    @param model - Configured chat model id.
    @returns True for Qwen3.x / QwQ-style thinking models.
    """
    model_l = model.lower()
    return "qwen3" in model_l or "qwq" in model_l


def _ollama_native_root(base_url: str) -> str | None:
    """Return Ollama server root when ``base_url`` is the OpenAI-compatible Ollama base.

    Example: ``http://host:11434/v1`` → ``http://host:11434``.

    @param base_url - Configured ``VLLM_BASE_URL``.
    @returns Native root, or ``None`` when this does not look like Ollama.
    """
    trimmed = base_url.rstrip("/")
    root = trimmed[:-3] if trimmed.endswith("/v1") else trimmed
    if ":11434" in root:
        return root
    return None


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
    token counts and timing so the caller can emit chat metrics. If the model
    returns no text (empty stream / unsupported options), grounded excerpts are
    streamed so the UI never ends on a silent wait with no answer text.

    Thinking models on Ollama's OpenAI ``/v1`` endpoint often ignore ``think:false``
    and stream only ``reasoning`` for a long time. Those are routed to native
    ``/api/chat`` where ``think: false`` actually disables thinking.

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
    ollama_root = _ollama_native_root(settings.vllm_base_url)
    use_ollama_native = ollama_root is not None and _is_thinking_model(settings.vllm_model)

    if use_ollama_native:
        assert ollama_root is not None
        url = f"{ollama_root}/api/chat"
        body: dict[str, object] = {
            "model": settings.vllm_model,
            "messages": messages,
            "stream": True,
            # Native API honors this; OpenAI-compatible /v1 often does not.
            "think": False,
            "options": {
                "temperature": 0.2,
                "num_predict": settings.llm_completion_reserve_tokens,
            },
        }
    else:
        url = f"{settings.vllm_base_url.rstrip('/')}/chat/completions"
        body = {
            "model": settings.vllm_model,
            "messages": messages,
            "stream": True,
            "temperature": 0.2,
            "max_tokens": settings.llm_completion_reserve_tokens,
        }
        if settings.llm_stream_include_usage:
            body["stream_options"] = {"include_usage": True}
        if _is_thinking_model(settings.vllm_model):
            body["think"] = False
            body["chat_template_kwargs"] = {"enable_thinking": False}

    timeout = httpx.Timeout(
        connect=30.0,
        read=settings.llm_timeout_seconds,
        write=30.0,
        pool=30.0,
    )
    start = time.monotonic()
    emitted = False
    try:
        with httpx.stream("POST", url, json=body, timeout=timeout) as response:
            if response.status_code >= 400:
                yield from _fallback_answer(context_blocks)
                return
            for line in response.iter_lines():
                payload = line
                if line.startswith("data: "):
                    payload = line[6:].strip()
                elif not line.strip() or line.startswith(":"):
                    continue
                else:
                    # Ollama native + some servers emit bare JSON lines.
                    payload = line.strip()
                if payload == "[DONE]":
                    break
                try:
                    data = json.loads(payload)
                except json.JSONDecodeError:
                    continue

                content: object = None
                if use_ollama_native:
                    message = data.get("message") if isinstance(data.get("message"), dict) else {}
                    content = message.get("content")
                    if data.get("done") and stats is not None:
                        _apply_ollama_counts(stats, data)
                else:
                    usage = data.get("usage")
                    if isinstance(usage, dict) and stats is not None:
                        _apply_usage(stats, usage)
                    choices = data.get("choices", [])
                    if not choices:
                        continue
                    choice0 = choices[0] if isinstance(choices[0], dict) else {}
                    delta = choice0.get("delta") if isinstance(choice0.get("delta"), dict) else {}
                    message = (
                        choice0.get("message") if isinstance(choice0.get("message"), dict) else {}
                    )
                    content = delta.get("content") or message.get("content")

                if isinstance(content, str) and content:
                    emitted = True
                    yield content

                if use_ollama_native and data.get("done"):
                    break
    except httpx.HTTPError:
        yield from _fallback_answer(context_blocks)
        return

    if not emitted:
        yield from _fallback_answer(context_blocks)
        return

    if stats is not None:
        _finalize_timing(stats, time.monotonic() - start)
