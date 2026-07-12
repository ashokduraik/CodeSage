"""Question routing — code vs product paths."""

from __future__ import annotations

# Phase 1: only developer/code QA is enabled; end_user routes abstain in stream_answer.


def is_code_audience(audience: str) -> bool:
    """Return True when the audience should use the code retrieval path.

    @param audience - Request audience string (`developer` or `end_user`).
    """
    return audience == "developer"
