"""Scheduled freshness poll — detect remote git drift and enqueue incremental sync.

Public entry point: ``poll_stale_repos`` in ``poll_repos``.
"""

from services.freshness.poll_repos import poll_stale_repos

__all__ = ["poll_stale_repos"]
