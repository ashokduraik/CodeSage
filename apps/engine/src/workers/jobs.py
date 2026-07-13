"""Job-type registry for background queue consumers.

The actual job handlers (sync, parse, embed, xrepo, distill) are implemented in Phase 1+
as thin wrappers via services layer. This module defines the known job types and a guard so
enqueue/consume code can validate payloads early.
"""

from typing import Final

JOB_TYPES: Final[tuple[str, ...]] = (
    "sync",
    "parse",
    "embed",
    "xrepo",
    "distill",
    "repo_cleanup",
)


def is_known_job(job_type: str) -> bool:
    """Return True if ``job_type`` is a job the worker knows how to handle."""
    return job_type in JOB_TYPES
