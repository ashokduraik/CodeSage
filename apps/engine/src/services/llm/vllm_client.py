"""OpenAI-compatible vLLM streaming client with excerpt fallback and tool calling."""

from __future__ import annotations

import json
import time
from collections.abc import Iterator
from dataclasses import dataclass, field
from typing import Any

import httpx

from config import Settings
from config.logging import sanitize_log_message
from services.llm.prompts import build_code_qa_messages


class LlmToolCallingError(Exception):
    """Raised when a planner tool-calling completion cannot run.

    The agent loop must not silently fall back to excerpt-only QA when the LLM
    endpoint is missing or rejects the request — that would bypass grounding tools.
    """


@dataclass
class ParsedToolCall:
    """One tool invocation parsed from an OpenAI-compatible chat completion.

    @param name - Function name the model selected (must match a registered tool).
    @param arguments - Parsed JSON object of tool arguments (empty dict if missing).
    @param id - Provider call id when present (needed to echo tool results).
    """

    name: str
    arguments: dict[str, Any]
    id: str | None = None


@dataclass
class PlannerTurnResult:
    """Outcome of one non-streaming planner LLM turn with tools enabled.

    Empty ``tool_calls`` with optional ``assistant_content`` means the model spoke
    without tools (social / clarification). Empty both means the agent loop should
    continue or abstain — this client does not apply social heuristics (plan 05).

    @param tool_calls - Parsed tool invocations (may be empty).
    @param assistant_content - Raw assistant text when the model replied without tools.
    @param usage - Token usage counters when the backend reported them.
    """

    tool_calls: list[ParsedToolCall] = field(default_factory=list)
    assistant_content: str | None = None
    usage: dict[str, int] | None = None


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


def stream_final_answer(
    settings: Settings,
    *,
    question: str,
    context_blocks: list[str],
    history: list[dict[str, str]] | None = None,
    stats: LlmStreamStats | None = None,
) -> Iterator[str]:
    """Stream the grounded final answer after the agent has gathered evidence.

    Thin wrapper around ``stream_vllm_answer`` so the agent loop (plan 05) can call a
    clearly named final-answer entry point without changing streaming behaviour.

    @param settings - Application settings.
    @param question - User question.
    @param context_blocks - Retrieved code excerpts used as grounding.
    @param history - Optional prior conversation turns.
    @param stats - Optional stats object filled with usage and timing when available.
    @yields Text fragments of the answer.
    """
    yield from stream_vllm_answer(
        settings,
        question=question,
        context_blocks=context_blocks,
        history=history,
        stats=stats,
    )


def _parse_tool_arguments(raw: object) -> dict[str, Any]:
    """Parse a tool ``arguments`` field into a dict.

    Providers may return a JSON string (OpenAI) or an already-decoded object (Ollama).
    Invalid JSON becomes an empty dict so the agent loop can surface a tool error
    rather than crashing the planner turn.

    @param raw - Arguments value from the provider payload.
    @returns Parsed argument dict (empty when missing or invalid).
    """
    if isinstance(raw, dict):
        return dict(raw)
    if isinstance(raw, str):
        if not raw.strip():
            return {}
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            return {}
        if isinstance(parsed, dict):
            return parsed
        return {}
    return {}


def parse_openai_tool_calls_from_response(payload: dict[str, Any]) -> PlannerTurnResult:
    """Extract tool calls and optional text from an OpenAI-style chat completion body.

    Accepts both the standard ``choices[0].message`` shape and Ollama native
    ``message`` at the top level so one parser covers the OpenAI shim and native API.

    @param payload - Parsed JSON body from ``/chat/completions`` or Ollama ``/api/chat``.
    @returns Planner turn with tool calls, optional assistant text, and usage when present.
    """
    message: dict[str, Any] = {}
    choices = payload.get("choices")
    if isinstance(choices, list) and choices:
        choice0 = choices[0] if isinstance(choices[0], dict) else {}
        raw_message = choice0.get("message")
        if isinstance(raw_message, dict):
            message = raw_message
    elif isinstance(payload.get("message"), dict):
        message = payload["message"]

    raw_calls = message.get("tool_calls")
    tool_calls: list[ParsedToolCall] = []
    if isinstance(raw_calls, list):
        for item in raw_calls:
            if not isinstance(item, dict):
                continue
            # OpenAI nests name/args under ``function``; some shims flatten them.
            function = item.get("function") if isinstance(item.get("function"), dict) else item
            name = function.get("name") if isinstance(function, dict) else None
            if not isinstance(name, str) or not name:
                continue
            call_id = item.get("id")
            tool_calls.append(
                ParsedToolCall(
                    name=name,
                    arguments=_parse_tool_arguments(
                        function.get("arguments") if isinstance(function, dict) else None
                    ),
                    id=call_id if isinstance(call_id, str) else None,
                )
            )

    content = message.get("content")
    assistant_content = content if isinstance(content, str) and content.strip() else None

    usage_out: dict[str, int] | None = None
    usage = payload.get("usage")
    if isinstance(usage, dict):
        usage_out = {}
        for key in ("prompt_tokens", "completion_tokens", "total_tokens"):
            value = usage.get(key)
            if isinstance(value, int):
                usage_out[key] = value
        if not usage_out:
            usage_out = None
    else:
        # Ollama native reports prompt_eval_count / eval_count on the top-level frame.
        prompt = payload.get("prompt_eval_count")
        completion = payload.get("eval_count")
        if isinstance(prompt, int) or isinstance(completion, int):
            usage_out = {}
            if isinstance(prompt, int):
                usage_out["prompt_tokens"] = prompt
            if isinstance(completion, int):
                usage_out["completion_tokens"] = completion
            if isinstance(prompt, int) and isinstance(completion, int):
                usage_out["total_tokens"] = prompt + completion

    return PlannerTurnResult(
        tool_calls=tool_calls,
        assistant_content=assistant_content,
        usage=usage_out,
    )


def _planner_timeout(settings: Settings) -> httpx.Timeout:
    """Build an HTTP timeout for a non-streaming planner call.

    @param settings - Application settings (planner timeout + connect defaults).
    @returns httpx timeout object.
    """
    return httpx.Timeout(
        connect=30.0,
        read=settings.qa_agent_planner_timeout_seconds,
        write=30.0,
        pool=30.0,
    )


def _normalize_tool_call_arguments_for_api(
    messages: list[dict[str, Any]],
    *,
    as_objects: bool,
) -> list[dict[str, Any]]:
    """Copy messages with tool-call ``arguments`` shaped for the target API.

    OpenAI ``/chat/completions`` expects ``arguments`` as a JSON string. Ollama
    native ``/api/chat`` expects a JSON object. Replaying the wrong shape on turn 2+
    makes some servers return HTTP 400 while parsing the request history.

    @param messages - Planner conversation including assistant tool_calls.
    @param as_objects - True for Ollama native; False for OpenAI-compatible.
    @returns Shallow-copied messages with normalized tool_call arguments.
    """
    normalized: list[dict[str, Any]] = []
    for message in messages:
        if message.get("role") != "assistant" or not isinstance(
            message.get("tool_calls"), list
        ):
            normalized.append(message)
            continue
        new_message = dict(message)
        new_calls: list[dict[str, Any]] = []
        for call in message["tool_calls"]:
            if not isinstance(call, dict):
                continue
            new_call = dict(call)
            function = call.get("function")
            if isinstance(function, dict):
                new_function = dict(function)
                raw_args = function.get("arguments")
                if as_objects:
                    if isinstance(raw_args, str):
                        try:
                            parsed = json.loads(raw_args) if raw_args.strip() else {}
                        except json.JSONDecodeError:
                            parsed = {}
                        new_function["arguments"] = (
                            parsed if isinstance(parsed, dict) else {}
                        )
                    elif isinstance(raw_args, dict):
                        new_function["arguments"] = raw_args
                    else:
                        new_function["arguments"] = {}
                else:
                    if isinstance(raw_args, dict):
                        new_function["arguments"] = json.dumps(raw_args)
                    elif isinstance(raw_args, str):
                        new_function["arguments"] = raw_args
                    else:
                        new_function["arguments"] = "{}"
                new_call["function"] = new_function
            new_calls.append(new_call)
        new_message["tool_calls"] = new_calls
        normalized.append(new_message)
    return normalized


def complete_with_tools(
    settings: Settings,
    messages: list[dict[str, Any]],
    tools: list[dict[str, Any]],
    *,
    stats: LlmStreamStats | None = None,
) -> PlannerTurnResult:
    """Run one non-streaming chat completion with OpenAI-compatible tool calling.

    Used by the agent planner (ADR 0026): ``stream=False`` so tool_call JSON payloads
    arrive as a single parseable frame. Does **not** fall back to excerpt synthesis —
    missing config or HTTP failure raises ``LlmToolCallingError`` so the agent loop
    can abstain rather than invent an ungrounded answer.

    Primary path: ``POST {VLLM_BASE_URL}/chat/completions`` with ``tools`` and
    ``tool_choice: auto``. Ollama is reached via its OpenAI ``/v1`` shim (same path);
    native ``/api/chat`` is used only when the base URL looks like Ollama **and** the
    model is a thinking model that needs ``think: false`` on the native API.

    @param settings - Application settings including LLM base URL and model id.
    @param messages - Chat messages (system / user / assistant / tool) for this turn.
    @param tools - OpenAI tool definition objects (from ``tool_definitions_for_planner``).
    @param stats - Optional stats object filled with usage and timing when available.
    @returns Parsed planner turn (tool calls and/or assistant text).
    @raises LlmToolCallingError when the LLM is not configured or the request fails.
    """
    if not settings.vllm_base_url or not settings.vllm_model:
        raise LlmToolCallingError(
            "LLM tool calling requires VLLM_BASE_URL and VLLM_MODEL; "
            "excerpt fallback is not used for the agent planner"
        )

    ollama_root = _ollama_native_root(settings.vllm_base_url)
    # Thinking models on Ollama's /v1 often ignore think:false; native /api/chat
    # honours it and still accepts a tools array on recent Ollama builds.
    use_ollama_native = ollama_root is not None and _is_thinking_model(settings.vllm_model)
    api_messages = _normalize_tool_call_arguments_for_api(
        messages,
        as_objects=use_ollama_native,
    )

    if use_ollama_native:
        assert ollama_root is not None
        url = f"{ollama_root}/api/chat"
        body: dict[str, Any] = {
            "model": settings.vllm_model,
            "messages": api_messages,
            "stream": False,
            "tools": tools,
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
            "messages": api_messages,
            "stream": False,
            "temperature": 0.2,
            "max_tokens": settings.llm_completion_reserve_tokens,
            "tools": tools,
            "tool_choice": "auto",
        }
        if _is_thinking_model(settings.vllm_model):
            body["think"] = False
            body["chat_template_kwargs"] = {"enable_thinking": False}

    start = time.monotonic()
    try:
        response = httpx.post(url, json=body, timeout=_planner_timeout(settings))
    except httpx.HTTPError as exc:
        raise LlmToolCallingError(
            f"planner tool-calling request failed: {sanitize_log_message(str(exc))}"
        ) from exc

    if response.status_code >= 400:
        raise LlmToolCallingError(
            f"planner tool-calling HTTP {response.status_code}: "
            f"{sanitize_log_message(response.text[:200])}"
        )

    try:
        payload = response.json()
    except ValueError as exc:
        raise LlmToolCallingError("planner tool-calling response was not valid JSON") from exc

    if not isinstance(payload, dict):
        raise LlmToolCallingError("planner tool-calling response was not a JSON object")

    result = parse_openai_tool_calls_from_response(payload)

    if stats is not None and result.usage is not None:
        _apply_usage(stats, result.usage)
        _finalize_timing(stats, time.monotonic() - start)

    return result


def complete_text(
    settings: Settings,
    messages: list[dict[str, Any]],
    *,
    max_tokens: int = 256,
    temperature: float = 0.0,
) -> str:
    """Run one non-streaming chat completion without tools and return assistant text.

    Used for follow-up question rewrite (ADR 0028) and other small non-retrieval
    completions. Raises ``LlmToolCallingError`` when the LLM is not configured or
    the request fails so callers can fall back to the original input.

    @param settings - Application settings including LLM base URL and model id.
    @param messages - Chat messages (system / user / assistant).
    @param max_tokens - Maximum completion tokens.
    @param temperature - Sampling temperature (0 for deterministic rewrite).
    @returns Assistant message content stripped of surrounding whitespace.
    @raises LlmToolCallingError when the LLM is unavailable or the response is empty.
    """
    if not settings.vllm_base_url or not settings.vllm_model:
        raise LlmToolCallingError(
            "LLM text completion requires VLLM_BASE_URL and VLLM_MODEL"
        )

    ollama_root = _ollama_native_root(settings.vllm_base_url)
    use_ollama_native = ollama_root is not None and _is_thinking_model(settings.vllm_model)

    if use_ollama_native:
        assert ollama_root is not None
        url = f"{ollama_root}/api/chat"
        body: dict[str, Any] = {
            "model": settings.vllm_model,
            "messages": messages,
            "stream": False,
            "think": False,
            "options": {
                "temperature": temperature,
                "num_predict": max_tokens,
            },
        }
    else:
        url = f"{settings.vllm_base_url.rstrip('/')}/chat/completions"
        body = {
            "model": settings.vllm_model,
            "messages": messages,
            "stream": False,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if _is_thinking_model(settings.vllm_model):
            body["think"] = False
            body["chat_template_kwargs"] = {"enable_thinking": False}

    try:
        response = httpx.post(url, json=body, timeout=_planner_timeout(settings))
    except httpx.HTTPError as exc:
        raise LlmToolCallingError(
            f"text completion request failed: {sanitize_log_message(str(exc))}"
        ) from exc

    if response.status_code >= 400:
        raise LlmToolCallingError(
            f"text completion HTTP {response.status_code}: "
            f"{sanitize_log_message(response.text[:200])}"
        )

    try:
        payload = response.json()
    except ValueError as exc:
        raise LlmToolCallingError("text completion response was not valid JSON") from exc

    if not isinstance(payload, dict):
        raise LlmToolCallingError("text completion response was not a JSON object")

    # OpenAI-compatible: choices[0].message.content; Ollama native: message.content.
    content = ""
    choices = payload.get("choices")
    if isinstance(choices, list) and choices:
        first = choices[0]
        if isinstance(first, dict):
            message = first.get("message")
            if isinstance(message, dict):
                raw = message.get("content")
                if isinstance(raw, str):
                    content = raw
    if not content:
        message = payload.get("message")
        if isinstance(message, dict):
            raw = message.get("content")
            if isinstance(raw, str):
                content = raw

    text = content.strip()
    if not text:
        raise LlmToolCallingError("text completion returned empty content")
    return text
