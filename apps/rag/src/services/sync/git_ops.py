"""Git clone/fetch helpers for the sync job."""

from __future__ import annotations

import logging
import subprocess
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse, urlunparse

from config.logging import get_indexing_logger, log_event, short_commit
from services.sync.paths import is_existing_clone

logger = get_indexing_logger()


@dataclass(frozen=True)
class GitSyncResult:
    """Outcome of a git sync operation."""

    head_sha: str
    changed_files: list[str]


def build_authenticated_url(repo_url: str, token: str | None) -> str:
    """Inject a deploy token into an HTTPS clone URL when provided.

    @param repo_url - Original HTTPS remote URL.
    @param token - Optional plaintext token.
    @returns URL suitable for non-interactive git clone.
    """
    if not token:
        return repo_url
    parsed = urlparse(repo_url)
    if parsed.scheme not in {"http", "https"}:
        return repo_url
    netloc = f"{token}@{parsed.hostname}"
    if parsed.port:
        netloc = f"{token}@{parsed.hostname}:{parsed.port}"
    authed = parsed._replace(netloc=netloc)
    return urlunparse(authed)


def _run_git(args: list[str], *, cwd: Path | None = None) -> subprocess.CompletedProcess[str]:
    """Run a git command and capture stdout/stderr.

    @param args - git subcommand arguments (without the `git` prefix).
    @param cwd - Optional working directory.
    @returns CompletedProcess with text mode output.
    @raises RuntimeError when git exits non-zero.
    """
    completed = subprocess.run(
        ["git", *args],
        cwd=cwd,
        capture_output=True,
        text=True,
        check=False,
    )
    if completed.returncode != 0:
        detail = (completed.stderr or completed.stdout).strip()
        raise RuntimeError(f"git {' '.join(args)} failed: {detail}")
    return completed


def resolve_remote_head(*, repo_url: str, branch: str, token: str | None) -> str:
    """Read the remote branch tip SHA without cloning the repository.

    Used by the freshness poller to detect commits that webhooks may have missed.

    @param repo_url - HTTPS clone URL (token injected when private).
    @param branch - Branch name to resolve.
    @param token - Optional deploy token for private repositories.
    @returns Full commit SHA at ``refs/heads/{branch}`` on the remote.
    @raises RuntimeError when git exits non-zero or the ref is missing.
    """
    authed_url = build_authenticated_url(repo_url, token)
    completed = _run_git(["ls-remote", authed_url, f"refs/heads/{branch}"])
    lines = [line.strip() for line in completed.stdout.splitlines() if line.strip()]
    if not lines:
        raise RuntimeError(f"No remote ref found for branch {branch}")
    parts = lines[0].split()
    if not parts:
        raise RuntimeError("Unexpected ls-remote output")
    return parts[0]


def sync_repository(
    *,
    repo_url: str,
    branch: str,
    worktree: Path,
    token: str | None,
    since_sha: str | None,
    list_files: Callable[[], list[str]],
) -> GitSyncResult:
    """Clone or update a repository and decide which files need re-parsing.

    On first attach performs a shallow clone; on later runs fetches and hard-resets to
    match the remote branch. Compares against ``since_sha`` when provided to produce an
    incremental file list; otherwise scans the full worktree.

    @param repo_url - HTTPS clone URL (token injected separately when private).
    @param branch - Branch name to checkout after fetch or clone.
    @param worktree - Local directory where the clone is stored on disk.
    @param token - Optional deploy token for private repositories.
    @param since_sha - Last indexed commit for incremental diff; ``None`` on first sync.
    @param list_files - Callable returning indexable relative paths after sync completes.
    @returns HEAD SHA and the relative paths that should be sent to the parse step.
    @raises RuntimeError when any git subprocess exits with a non-zero status.
    """
    authed_url = build_authenticated_url(repo_url, token)
    is_update = is_existing_clone(worktree)
    if is_update:
        log_event(logger, logging.INFO, "Fetching latest changes from remote")
        _run_git(["fetch", "--depth", "1", "origin", branch], cwd=worktree)
        _run_git(["checkout", branch], cwd=worktree)
        # After a shallow fetch the local branch may diverge from remote. Hard reset
        # guarantees the worktree matches origin exactly so file diffs are trustworthy.
        _run_git(["reset", "--hard", f"origin/{branch}"], cwd=worktree)
    else:
        log_event(logger, logging.INFO, "Cloning repository (first sync)")
        worktree.parent.mkdir(parents=True, exist_ok=True)
        if worktree.exists():
            raise RuntimeError(f"Worktree path exists but is not a git repo: {worktree}")
        _run_git(
            [
                "clone",
                "--depth",
                "1",
                "--branch",
                branch,
                authed_url,
                str(worktree),
            ],
        )

    head_sha = _run_git(["rev-parse", "HEAD"], cwd=worktree).stdout.strip()
    log_event(logger, logging.INFO, f"Repository at commit {short_commit(head_sha)}")

    if since_sha and since_sha != head_sha:
        try:
            diff = _run_git(["diff", "--name-only", since_sha, head_sha], cwd=worktree)
            changed = [line.strip() for line in diff.stdout.splitlines() if line.strip()]
            all_indexable = set(list_files())
            # Git diff lists every changed path including deletes and non-source files.
            # Keep only paths we actually index so parse jobs stay focused and cheap.
            changed_files = sorted(path for path in changed if path in all_indexable)
            log_event(
                logger,
                logging.INFO,
                f"{len(changed_files)} files changed since last index",
            )
        except RuntimeError:
            # Shallow clones may lack ``since_sha`` objects — fall back to a full scan.
            log_event(
                logger,
                logging.WARNING,
                "Incremental diff unavailable — scanning all indexable source files",
            )
            changed_files = list_files()
            log_event(logger, logging.INFO, "Full index — scanning all source files")
    else:
        # No prior indexed commit, or HEAD did not move — scan the full worktree so
        # first-time attach and no-op syncs still produce a correct file list.
        changed_files = list_files()
        log_event(logger, logging.INFO, "Full index — scanning all source files")
    return GitSyncResult(head_sha=head_sha, changed_files=changed_files)
