"""Map exceptions to plain-English failure explanations for logs and persistence."""

from __future__ import annotations

import re
from urllib.parse import urlparse

from config import Settings
from config.logging import sanitize_log_message

_DOCKER_HOSTS = frozenset({"tei", "postgres", "db", "redis", "rag", "api", "web"})


def explain_failure(
    exc: BaseException,
    *,
    job_type: str,
    settings: Settings | None = None,
) -> str:
    """Translate an exception into a user-facing failure explanation.

    @param exc - Raised exception from a job handler.
    @param job_type - Queue job discriminator (sync, parse, embed, …).
    @param settings - Application settings for host-specific hints.
    @returns Sanitized plain-English explanation with optional fix hint.
    """
    raw = str(exc)
    lowered = raw.lower()
    name = type(exc).__name__

    if "token_enc_key must decode" in lowered:
        return (
            "Encryption key mismatch — TOKEN_ENC_KEY in apps/rag/.env "
            "must match apps/api"
        )

    if "repo not found" in lowered:
        return "Repository was detached or deleted — retry after re-attaching"

    if "getaddrinfo failed" in lowered or "connecterror" in name.lower():
        return _explain_connect_failure(raw, settings)

    if "tei embed failed" in lowered or (
        job_type == "embed" and "embed" in lowered and "failed" in lowered
    ):
        return sanitize_log_message(f"Embedding service error — {raw}")

    if "git " in lowered and "failed" in lowered:
        return sanitize_log_message(f"Git operation failed — {raw}")

    if job_type == "embed" and settings is not None and settings.tei_base_url:
        host = urlparse(settings.tei_base_url).hostname or settings.tei_base_url
        if "getaddrinfo" in lowered or "connect" in lowered:
            return _tei_unreachable_message(host)

    return sanitize_log_message(f"{name}: {raw}")


def _explain_connect_failure(raw: str, settings: Settings | None) -> str:
    """Build a DNS/connectivity explanation for embedding or network errors.

    @param raw - Raw exception text.
    @param settings - Optional settings for TEI host context.
    @returns Sanitized explanation string.
    """
    if settings is not None and settings.tei_base_url:
        host = urlparse(settings.tei_base_url).hostname or ""
        if host and (_is_docker_hostname(host) or host in raw):
            return _tei_unreachable_message(host)

    return sanitize_log_message("Network/DNS error — cannot resolve hostname")


def _is_docker_hostname(host: str) -> bool:
    """Return True when a hostname is typically Docker-compose internal.

    @param host - Parsed hostname from a service URL.
    @returns Whether the host looks like a compose service name.
    """
    if host in _DOCKER_HOSTS:
        return True
    return bool(re.match(r"^[a-z][a-z0-9-]*$", host) and "." not in host)


def _tei_unreachable_message(host: str) -> str:
    """Build the standard TEI unreachable hint for local vs Docker setups.

    @param host - Embedding service hostname.
    @returns User-facing explanation with configuration hint.
    """
    return (
        f'Embedding service unreachable at {host} — hostname "{host}" is '
        "Docker-only; for local dev set TEI_BASE_URL=http://127.0.0.1:8080 "
        "or leave empty for dev placeholder embeddings"
    )


def format_failure_summary(
    job_type: str,
    context_label: str,
    step_num: int,
    step_name: str,
    explanation: str,
    job_id: str | None = None,
) -> str:
    """Build a one-line ERROR summary for a failed job.

    @param job_type - Queue job discriminator.
    @param context_label - Project/repo context or fallback label.
    @param step_num - Pipeline step number (0 when unknown).
    @param step_name - Plain-English step name.
    @param explanation - Output of ``explain_failure``.
    @param job_id - Optional short job id prefix for disambiguation.
    @returns Full failure summary line.
    """
    id_part = f" {job_id}" if job_id else ""
    if step_num > 0:
        step_part = f" — Step {step_num}/3 {step_name}"
    else:
        step_part = ""
    return (
        f"Job failed — {job_type}{id_part} — {context_label}{step_part}: "
        f"{explanation}"
    )
