"""Git clone/fetch helpers for the sync job."""

from __future__ import annotations

import logging
import os
import stat
import subprocess
import sys
import tempfile
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse

from config.logging import get_indexing_logger, log_event, sanitize_log_message, short_commit
from services.sync.paths import is_existing_clone

logger = get_indexing_logger()

_ASKPASS_SCRIPT = """\
import os
import sys

prompt = (sys.argv[1] if len(sys.argv) > 1 else "").lower()
token = os.environ.get("CODESAGE_GIT_TOKEN", "")
if "username" in prompt:
    print("x-access-token", end="")
else:
    print(token, end="")
"""


@dataclass(frozen=True)
class GitSyncResult:
    """Outcome of a git sync operation."""

    head_sha: str
    changed_files: list[str]


def build_authenticated_url(repo_url: str, token: str | None) -> str:
    """Return the clean HTTPS URL used for git commands.

    Tokens are supplied via ``GIT_ASKPASS`` instead of embedding credentials in the URL.

    @param repo_url - Original HTTPS remote URL.
    @param token - Optional plaintext token (unused in the returned URL).
    @returns URL suitable for non-interactive git clone without embedded secrets.
    """
    _ = token
    return repo_url


@contextmanager
def _git_token_env(token: str | None) -> Iterator[tuple[dict[str, str], list[str]]]:
    """Yield subprocess env vars that authenticate git without argv secrets.

    @param token - Optional deploy token for private repositories.
    @yields Tuple of environment overrides and temp file paths to delete afterward.
    """
    cleanup_paths: list[str] = []
    if not token:
        yield {}, cleanup_paths
        return

    with tempfile.NamedTemporaryFile(
        mode="w",
        suffix=".py",
        delete=False,
        encoding="utf-8",
    ) as handle:
        handle.write(_ASKPASS_SCRIPT)
        askpass_path = handle.name
    cleanup_paths.append(askpass_path)

    if os.name != "nt":
        os.chmod(askpass_path, stat.S_IRUSR | stat.S_IXUSR)
        askpass_exec = askpass_path
    else:
        with tempfile.NamedTemporaryFile(
            mode="w",
            suffix=".cmd",
            delete=False,
            encoding="utf-8",
        ) as wrapper:
            wrapper.write(f'@"{sys.executable}" "{askpass_path}" %*\n')
            askpass_exec = wrapper.name
        cleanup_paths.append(askpass_exec)

    try:
        yield (
            {
                "GIT_TERMINAL_PROMPT": "0",
                "GIT_ASKPASS": askpass_exec,
                "GIT_ASKPASS_REQUIRE": "force",
                "CODESAGE_GIT_TOKEN": token,
            },
            cleanup_paths,
        )
    finally:
        pass


def _run_git(
    args: list[str],
    *,
    cwd: Path | None = None,
    token: str | None = None,
) -> subprocess.CompletedProcess[str]:
    """Run a git command and capture stdout/stderr.

    @param args - git subcommand arguments (without the `git` prefix).
    @param cwd - Optional working directory.
    @param token - Optional deploy token supplied through ``GIT_ASKPASS``.
    @returns CompletedProcess with text mode output.
    @raises RuntimeError when git exits non-zero.
    """
    env = os.environ.copy()
    cleanup_paths: list[str] = []
    if token:
        with _git_token_env(token) as (token_env, temp_paths):
            cleanup_paths.extend(temp_paths)
            env.update(token_env)
            completed = subprocess.run(
                ["git", *args],
                cwd=cwd,
                capture_output=True,
                text=True,
                check=False,
                env=env,
            )
    else:
        completed = subprocess.run(
            ["git", *args],
            cwd=cwd,
            capture_output=True,
            text=True,
            check=False,
            env=env,
        )

    for path in cleanup_paths:
        try:
            os.unlink(path)
        except OSError:
            pass

    if completed.returncode != 0:
        detail = sanitize_log_message((completed.stderr or completed.stdout).strip())
        command_label = " ".join(args[:2]) if len(args) >= 2 else (args[0] if args else "git")
        raise RuntimeError(f"git {command_label} failed: {detail}")
    return completed


def _ensure_clean_origin(worktree: Path, repo_url: str) -> None:
    """Rewrite ``origin`` to a token-free URL after clone or fetch.

    @param worktree - Local git worktree path.
    @param repo_url - Canonical HTTPS remote without embedded credentials.
    """
    _run_git(["remote", "set-url", "origin", repo_url], cwd=worktree)


def resolve_remote_head(*, repo_url: str, branch: str, token: str | None) -> str:
    """Read the remote branch tip SHA without cloning the repository.

    Used by the freshness poller to detect commits that webhooks may have missed.

    @param repo_url - HTTPS clone URL without embedded credentials.
    @param branch - Branch name to resolve.
    @param token - Optional deploy token for private repositories.
    @returns Full commit SHA at ``refs/heads/{branch}`` on the remote.
    @raises RuntimeError when git exits non-zero or the ref is missing.
    """
    completed = _run_git(
        ["ls-remote", repo_url, f"refs/heads/{branch}"],
        token=token,
    )
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

    @param repo_url - HTTPS clone URL without embedded credentials.
    @param branch - Branch name to checkout after fetch or clone.
    @param worktree - Local directory where the clone is stored on disk.
    @param token - Optional deploy token for private repositories.
    @param since_sha - Last indexed commit for incremental diff; ``None`` on first sync.
    @param list_files - Callable returning indexable relative paths after sync completes.
    @returns HEAD SHA and the relative paths that should be sent to the parse step.
    @raises RuntimeError when any git subprocess exits with a non-zero status.
    """
    is_update = is_existing_clone(worktree)
    if is_update:
        log_event(logger, logging.INFO, "Fetching latest changes from remote")
        _ensure_clean_origin(worktree, repo_url)
        _run_git(["fetch", "--depth", "1", "origin", branch], cwd=worktree, token=token)
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
                repo_url,
                str(worktree),
            ],
            token=token,
        )
        _ensure_clean_origin(worktree, repo_url)

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
