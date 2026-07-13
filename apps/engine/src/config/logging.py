"""Structured, beginner-friendly logging for the engine service."""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from urllib.parse import urlparse

from config import Settings

INDEXING_LOGGER_NAME = "codesage.indexing"

ENGINE_LOG_FORMAT = "%(asctime)s  %(levelname)-5s  [ENGINE]  %(message)s"
ENGINE_LOG_DATEFMT = "%Y-%m-%d %H:%M:%S"

_TOKEN_PATTERN = re.compile(
    r"github_pat_[A-Za-z0-9_]+|ghp_[A-Za-z0-9]+|glpat-[A-Za-z0-9_-]+|://[^@\s/]+@[^@\s/]+|://[^@\s]+@",
)

JOB_STEPS: dict[str, tuple[int, str]] = {
    "sync": (1, "syncing repository"),
    "parse": (2, "reading source files"),
    "embed": (3, "making code searchable"),
}

SYNC_STEP_NAMES: dict[bool, str] = {
    False: "cloning repository",
    True: "fetching latest changes",
}

# All process loggers that must share one console format (including uvicorn).
_SERVICE_LOGGER_NAMES: tuple[str, ...] = (
    INDEXING_LOGGER_NAME,
    "uvicorn",
    "uvicorn.error",
    "uvicorn.access",
    "watchfiles",
)


def get_indexing_logger() -> logging.Logger:
    """Return the shared engine application logger.

    @returns Logger whose output uses the unified ``[ENGINE]`` format.
    """
    return logging.getLogger(INDEXING_LOGGER_NAME)


def sanitize_log_message(message: str, max_len: int = 500) -> str:
    """Strip token-like substrings before writing a log line.

    @param message - Raw log text.
    @param max_len - Maximum emitted length.
    @returns Redacted, truncated message safe for console output.
    """
    cleaned = _TOKEN_PATTERN.sub("[redacted]", message)
    return cleaned[:max_len]


def safe_repo_label(repo_url: str) -> str:
    """Build a credential-free repository label for logs.

    @param repo_url - HTTPS clone URL (never authenticated).
    @returns Host and path, e.g. ``github.com/org/repo``.
    """
    parsed = urlparse(repo_url)
    host = parsed.hostname or ""
    path = parsed.path.strip("/")
    if path.endswith(".git"):
        path = path[:-4]
    if host and path:
        return f"{host}/{path}"
    return host or "unknown repository"


def short_commit(sha: str) -> str:
    """Return a short commit prefix for human-readable logs.

    @param sha - Full git SHA.
    @returns First seven characters or ``unknown``.
    """
    return sha[:7] if sha else "unknown"


@dataclass(frozen=True)
class IndexingContext:
    """Project and repository labels for indexing log lines."""

    project_name: str | None
    repo_label: str
    branch: str | None = None


def format_indexing_context(ctx: IndexingContext) -> str:
    """Build a credential-free project/repo label for log messages.

    @param ctx - Resolved indexing context.
    @returns Plain-English context string.
    """
    if ctx.project_name:
        base = f'project "{ctx.project_name}" / repo {ctx.repo_label}'
    else:
        base = f"repo {ctx.repo_label}"
    if ctx.branch:
        return f"{base} (branch {ctx.branch})"
    return base


def format_job_fallback_context(job_type: str) -> str:
    """Build a context string when a job payload has no ``repoId``.

    @param job_type - Queue job discriminator.
    @returns Fallback context for unsupported or future job types.
    """
    return f"job type {job_type} (no repo)"


def format_job_claim_message(ctx: IndexingContext | str, step_num: int, step_name: str) -> str:
    """Format the line emitted when the worker claims a job.

    @param ctx - Indexing context or pre-formatted fallback string.
    @param step_num - Pipeline step number (1–3).
    @param step_name - Plain-English step name.
    @returns Full claim message.
    """
    label = format_indexing_context(ctx) if isinstance(ctx, IndexingContext) else ctx
    return f"Job claimed — {label} — Step {step_num}/3 {step_name}"


def format_job_finished_message(
    ctx: IndexingContext | str,
    step_num: int,
    step_name: str,
    elapsed_s: int,
) -> str:
    """Format the line emitted when a job row is marked done.

    @param ctx - Indexing context or pre-formatted fallback string.
    @param step_num - Pipeline step number (1–3).
    @param step_name - Plain-English step name.
    @param elapsed_s - Wall-clock seconds for the job.
    @returns Full finished message.
    """
    label = format_indexing_context(ctx) if isinstance(ctx, IndexingContext) else ctx
    return f"Job finished — {label} — Step {step_num}/3 {step_name} (took {elapsed_s}s)"


def format_job_failed_message(
    ctx: IndexingContext | str,
    step_num: int,
    step_name: str,
    reason: str,
) -> str:
    """Format the line emitted when a job row is marked failed.

    @param ctx - Indexing context or pre-formatted fallback string.
    @param step_num - Pipeline step number (1–3).
    @param step_name - Plain-English step name.
    @param reason - Sanitized failure reason.
    @returns Full failure message.
    """
    label = format_indexing_context(ctx) if isinstance(ctx, IndexingContext) else ctx
    return f"Job failed — {label} — Step {step_num}/3 {step_name}: {reason}"


def should_log_parse_milestone(files_read: int, total: int) -> bool:
    """Return True when a parse progress milestone should be logged at INFO.

    @param files_read - Files processed so far.
    @param total - Total files in the job.
    @returns True on every 10th file, percent milestones, or the final file.
    """
    if total <= 0 or files_read <= 0:
        return False
    if files_read == total:
        return True
    if files_read % 10 == 0:
        return True
    percent = round((files_read / total) * 100)
    return percent in {25, 50, 75}


def parse_progress_message(files_read: int, total: int) -> str:
    """Build a parse-step progress line for INFO logging.

    @param files_read - Files processed so far.
    @param total - Total files in the job.
    @returns Milestone message with count and percentage.
    """
    percent = round((files_read / total) * 100) if total else 0
    return f"Step 2/3 progress — read {files_read} of {total} files ({percent}%)"


def format_worker_ready_message(clone_dir: str, poll_seconds: int) -> str:
    """Build the worker-ready line logged at startup.

    @param clone_dir - Repository clone root from settings.
    @param poll_seconds - Idle poll interval in seconds.
    @returns Worker configuration summary.
    """
    return f"Worker ready — clone directory {clone_dir}, poll every {poll_seconds}s"


def format_pending_queue_message(counts: list[tuple[str, int]]) -> str:
    """Build the pending-queue summary for startup.

    @param counts - Job type counts from ``summarize_pending``.
    @returns Empty-queue or pending summary line.
    """
    total = sum(count for _, count in counts)
    if total == 0:
        return "Job queue: empty — attach a repo in the UI to start indexing"
    parts = ", ".join(f"{count} {job_type}" for job_type, count in counts)
    return f"Job queue: {total} pending ({parts}) — processing now"


def format_running_queue_message(running_count: int, stale_seconds: int = 600) -> str:
    """Build a startup warning when jobs are stuck in ``running`` state.

    @param running_count - Number of running active jobs.
    @param stale_seconds - Seconds before stale running jobs are auto-reclaimed.
    @returns Warning with recovery hint.
    """
    stale_min = max(1, stale_seconds // 60)
    return (
        f"Job queue: {running_count} running (possibly stuck) — "
        f"jobs running longer than {stale_min} min are auto-reclaimed to pending or failed"
    )


def format_reclaimed_jobs_message(reclaimed_count: int) -> str:
    """Build a log line when stale running jobs were reclaimed.

    @param reclaimed_count - Number of jobs moved to pending or failed.
    @returns INFO/WARN message for the indexing worker log.
    """
    return f"Reclaimed {reclaimed_count} stale running job(s)"


def format_orphaned_reclaimed_jobs_message(reclaimed_count: int) -> str:
    """Build a log line when orphaned running jobs were reset on worker start.

    @param reclaimed_count - Number of jobs moved from running to pending.
    @returns WARNING message for the indexing worker log.
    """
    return f"Reclaimed {reclaimed_count} orphaned running job(s) from previous worker"


def log_failure(
    logger: logging.Logger,
    summary: str,
    exc: BaseException | None = None,
) -> None:
    """Emit a failure summary and sanitized traceback lines at ERROR.

    @param logger - Target logger (typically ``codesage.indexing``).
    @param summary - One-line failure summary.
    @param exc - Optional exception for traceback lines.
    """
    import traceback

    log_event(logger, logging.ERROR, summary)
    if exc is None:
        return
    for line in traceback.format_exception(type(exc), exc, exc.__traceback__):
        for sub in line.rstrip().splitlines():
            if sub.strip():
                log_event(logger, logging.ERROR, f"  {sub}")


def job_step(job_type: str) -> tuple[int, str]:
    """Map a job type to its step number and plain-English name.

    @param job_type - Queue job type string.
    @returns ``(step_number, step_name)``; unknown types use step 0.
    """
    return JOB_STEPS.get(job_type, (0, job_type))


def sync_step_name(is_update: bool) -> str:
    """Return the plain-English sync step name for clone vs fetch.

    @param is_update - True when an on-disk clone already exists.
    @returns Step name for job claim/finish log lines.
    """
    return SYNC_STEP_NAMES[is_update]


def log_event(logger: logging.Logger, level: int, message: str) -> None:
    """Emit one sanitized log line.

    @param logger - Target logger (typically ``codesage.indexing``).
    @param level - ``logging`` level constant.
    @param message - Plain-English message; redacted before emit.
    """
    logger.log(level, sanitize_log_message(message))


def _build_console_handler() -> logging.Handler:
    """Create a stderr stream handler with the unified engine log format.

    @returns Configured stream handler.
    """
    formatter = logging.Formatter(fmt=ENGINE_LOG_FORMAT, datefmt=ENGINE_LOG_DATEFMT)
    handler = logging.StreamHandler()
    handler.setFormatter(formatter)
    return handler


def configure_logging(settings: Settings) -> None:
    """Configure uniform console logging for the entire engine process.

    Applies the same ``TIMESTAMP  LEVEL  [ENGINE]  message`` format to application,
    indexing, and uvicorn loggers. Call before ``uvicorn.run(..., log_config=None)``.

    @param settings - Application settings (``log_level``).
    """
    level_name = settings.log_level.upper()
    level = getattr(logging, level_name, logging.INFO)
    handler = _build_console_handler()

    for logger_name in _SERVICE_LOGGER_NAMES:
        service_logger = logging.getLogger(logger_name)
        service_logger.handlers.clear()
        service_logger.addHandler(handler)
        service_logger.setLevel(level)
        service_logger.propagate = False

    for noisy in ("httpx", "httpcore"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
