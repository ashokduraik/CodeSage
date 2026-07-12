"""Startup connectivity probes for the embedding and LLM backends.

These probes are intentionally non-fatal: the RAG service has deterministic embedding
and excerpt-only answer fallbacks (NFR-7), so an unreachable model server or a
not-yet-pulled model must produce a warning, never a boot failure.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from enum import Enum
from urllib.parse import urlparse

import httpx

from config import Settings
from config.logging import get_indexing_logger, log_event, sanitize_log_message

_logger = get_indexing_logger()


class ProbeStatus(str, Enum):
    """Outcome of a single backend connectivity probe."""

    OK = "ok"
    MODEL_MISSING = "model_missing"
    UNREACHABLE = "unreachable"
    UNVERIFIED = "unverified"
    FALLBACK = "fallback"


@dataclass(frozen=True)
class BackendProbe:
    """Result of probing one backend, with a log-safe message.

    @param status - Probe outcome.
    @param message - Human-readable, credential-free summary for the console.
    """

    status: ProbeStatus
    message: str


def _host_label(base_url: str) -> str:
    """Return the hostname of a base URL for credential-free log messages.

    @param base_url - Backend base URL (e.g. ``http://localhost:11434/v1``).
    @returns Hostname, or the raw value when it cannot be parsed.
    """
    return urlparse(base_url).hostname or base_url


def _model_is_listed(model: str, listed_ids: list[str]) -> bool:
    """Return True when the configured model matches one of the listed ids.

    Uses a lenient match so Ollama's implicit ``:latest`` tag (a bare ``qwen2.5``
    configured against a listed ``qwen2.5:latest``) is still recognized.

    @param model - Configured model name.
    @param listed_ids - Model ids reported by the backend.
    @returns True when the model appears to be available.
    """
    for listed in listed_ids:
        if listed == model:
            return True
        if listed.startswith(f"{model}:") or model.startswith(f"{listed}:"):
            return True
    return False


def probe_openai_backend(
    *,
    base_url: str,
    model: str,
    timeout: float,
) -> BackendProbe:
    """Probe an OpenAI-compatible backend via ``GET {base_url}/models``.

    Chosen over a real embed/chat call so startup never triggers a slow cold model
    load. Reachable-but-unlisted models (e.g. TEI has no ``/models``) degrade to
    ``UNVERIFIED`` rather than a false warning.

    @param base_url - Backend base URL; empty means the client uses a local fallback.
    @param model - Configured model name (may be empty).
    @param timeout - Short probe timeout in seconds.
    @returns Probe result describing reachability and model availability.
    """
    if not base_url.strip():
        return BackendProbe(ProbeStatus.FALLBACK, "no backend configured")

    base = base_url.rstrip("/")
    host = _host_label(base)
    url = f"{base}/models"
    try:
        response = httpx.get(url, timeout=timeout)
    except httpx.HTTPError as exc:
        return BackendProbe(
            ProbeStatus.UNREACHABLE,
            f"cannot reach {host}: {sanitize_log_message(str(exc))}",
        )

    if response.status_code >= 400:
        return BackendProbe(
            ProbeStatus.UNVERIFIED,
            f"reachable at {host} (model list unavailable, HTTP {response.status_code})",
        )

    try:
        payload = response.json()
    except ValueError:
        return BackendProbe(
            ProbeStatus.UNVERIFIED,
            f"reachable at {host} (model list unreadable)",
        )

    listed_ids = [
        str(item.get("id"))
        for item in payload.get("data", [])
        if isinstance(item, dict) and item.get("id")
    ]

    if not model:
        return BackendProbe(ProbeStatus.OK, f"reachable at {host}")
    if _model_is_listed(model, listed_ids):
        return BackendProbe(ProbeStatus.OK, f'"{model}" available at {host}')
    return BackendProbe(
        ProbeStatus.MODEL_MISSING,
        f'"{model}" not found at {host}',
    )


def check_reranker_backend(settings: Settings) -> BackendProbe:
    """Probe the configured cross-encoder reranker backend.

    @param settings - Application settings.
    @returns Probe result for the reranker, or FALLBACK when disabled.
    """
    if not settings.retrieval_reranker_enabled:
        return BackendProbe(ProbeStatus.FALLBACK, "reranker disabled")
    return probe_tei_health(
        base_url=settings.retrieval_reranker_base_url,
        timeout=settings.startup_probe_timeout_seconds,
        label="reranker",
    )


def probe_tei_health(
    *,
    base_url: str,
    timeout: float,
    label: str = "TEI",
) -> BackendProbe:
    """Probe a TEI service via ``GET {base_url}/health``.

    @param base_url - TEI base URL; empty means no backend configured.
    @param timeout - Short probe timeout in seconds.
    @param label - Human-readable service name for log messages.
    @returns Probe result describing reachability.
    """
    if not base_url.strip():
        return BackendProbe(ProbeStatus.FALLBACK, f"no {label} configured")

    base = base_url.rstrip("/")
    host = _host_label(base)
    url = f"{base}/health"
    try:
        response = httpx.get(url, timeout=timeout)
    except httpx.HTTPError as exc:
        return BackendProbe(
            ProbeStatus.UNREACHABLE,
            f"cannot reach {label} at {host}: {sanitize_log_message(str(exc))}",
        )

    if response.status_code >= 400:
        return BackendProbe(
            ProbeStatus.UNREACHABLE,
            f"{label} at {host} unhealthy (HTTP {response.status_code})",
        )
    return BackendProbe(ProbeStatus.OK, f"{label} reachable at {host}")


def check_embedding_backend(settings: Settings) -> BackendProbe:
    """Probe the configured embedding backend.

    @param settings - Application settings.
    @returns Probe result for the embedding backend.
    """
    return probe_openai_backend(
        base_url=settings.tei_base_url,
        model=settings.tei_embed_model,
        timeout=settings.startup_probe_timeout_seconds,
    )


def check_llm_backend(settings: Settings) -> BackendProbe:
    """Probe the configured LLM backend.

    @param settings - Application settings.
    @returns Probe result for the LLM backend.
    """
    return probe_openai_backend(
        base_url=settings.vllm_base_url,
        model=settings.vllm_model,
        timeout=settings.startup_probe_timeout_seconds,
    )


def _pull_hint(model: str) -> str:
    """Build an actionable hint for a missing model.

    @param model - Configured model name.
    @returns Suggested command to make the model available.
    """
    return f"run: ollama pull {model}" if model else "check the backend configuration"


def _log_llm_probe(settings: Settings, probe: BackendProbe) -> None:
    """Emit the LLM backend probe result at the appropriate level.

    @param settings - Application settings (for model name in hints).
    @param probe - LLM probe result.
    """
    if probe.status is ProbeStatus.OK:
        log_event(_logger, logging.INFO, f"LLM backend ready — {probe.message}")
    elif probe.status is ProbeStatus.UNVERIFIED:
        log_event(_logger, logging.INFO, f"LLM backend {probe.message}")
    elif probe.status is ProbeStatus.FALLBACK:
        log_event(
            _logger,
            logging.INFO,
            "LLM backend not configured — answers will use excerpt fallback",
        )
    elif probe.status is ProbeStatus.MODEL_MISSING:
        log_event(
            _logger,
            logging.WARNING,
            f"LLM model {probe.message} — {_pull_hint(settings.vllm_model)}. "
            "Answers will use excerpt fallback until the model is available.",
        )
    else:  # UNREACHABLE
        log_event(
            _logger,
            logging.WARNING,
            f"LLM backend unreachable — {probe.message}. Is the model server "
            "(e.g. Ollama) running? Answers will use excerpt fallback.",
        )


def _log_embedding_probe(settings: Settings, probe: BackendProbe) -> None:
    """Emit the embedding backend probe result at the appropriate level.

    @param settings - Application settings (for model name in hints).
    @param probe - Embedding probe result.
    """
    if probe.status is ProbeStatus.OK:
        log_event(_logger, logging.INFO, f"Embedding backend ready — {probe.message}")
    elif probe.status is ProbeStatus.UNVERIFIED:
        log_event(_logger, logging.INFO, f"Embedding backend {probe.message}")
    elif probe.status is ProbeStatus.FALLBACK:
        log_event(
            _logger,
            logging.INFO,
            "Embedding backend not configured — using deterministic dev embeddings",
        )
    elif probe.status is ProbeStatus.MODEL_MISSING:
        log_event(
            _logger,
            logging.WARNING,
            f"Embedding model {probe.message} — {_pull_hint(settings.tei_embed_model)}. "
            "Indexing and search will fail until the model is available.",
        )
    else:  # UNREACHABLE
        log_event(
            _logger,
            logging.WARNING,
            f"Embedding backend unreachable — {probe.message}. Is the model server "
            "(e.g. Ollama) running? Indexing and search will fail until it is reachable.",
        )


def _log_reranker_probe(probe: BackendProbe) -> None:
    """Emit the reranker backend probe result at the appropriate level.

    @param probe - Reranker probe result.
    """
    if probe.status is ProbeStatus.OK:
        log_event(_logger, logging.INFO, f"Reranker backend ready — {probe.message}")
    elif probe.status is ProbeStatus.FALLBACK:
        log_event(
            _logger,
            logging.INFO,
            "Reranker disabled — using heuristic prune only (M3.2)",
        )
    else:  # UNREACHABLE
        log_event(
            _logger,
            logging.WARNING,
            f"Reranker backend unreachable — {probe.message}. "
            "QA will fall back to heuristic prune.",
        )


def log_model_backend_status(settings: Settings) -> None:
    """Probe both model backends at startup and log success or warnings.

    Never raises: any unexpected error is logged as a warning so a probe failure
    can never abort service startup.

    @param settings - Application settings.
    """
    try:
        _log_llm_probe(settings, check_llm_backend(settings))
        _log_embedding_probe(settings, check_embedding_backend(settings))
        _log_reranker_probe(check_reranker_backend(settings))
    except Exception as exc:  # noqa: BLE001 - startup probe must never crash boot
        log_event(
            _logger,
            logging.WARNING,
            f"Model backend probe skipped due to unexpected error: "
            f"{sanitize_log_message(str(exc))}",
        )
