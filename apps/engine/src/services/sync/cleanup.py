"""Remove detached repository clones from the engine filesystem."""

from __future__ import annotations

import logging
import os
import shutil
import stat
import uuid
from collections.abc import Callable
from pathlib import Path

from config.logging import get_indexing_logger, log_event
from services.sync.paths import repo_worktree_path

logger = get_indexing_logger()


class UnsafeCleanupPathError(ValueError):
    """Raised when a resolved clone path escapes the configured clone root."""


def _clear_readonly_and_retry(
    func: Callable[[str], None],
    path: str,
    exc: BaseException,
) -> None:
    """Recover from a permission error by clearing the read-only bit and retrying.

    Git packs its object database into ``.git/objects/pack/*.pack`` and ``*.idx``
    files that it marks read-only. On Windows ``os.unlink`` refuses to remove a
    read-only file and raises ``PermissionError`` ([WinError 5]), which aborts
    ``shutil.rmtree`` before the clone is fully deleted. This ``onexc`` callback
    flips the offending path back to writable and re-runs the failed operation so
    cleanup succeeds without leaving orphaned worktrees behind.

    @param func - The filesystem operation that failed (e.g. ``os.unlink``).
    @param path - The filesystem path that ``func`` failed to act on.
    @param exc - The exception raised by the original ``func`` call.
    @raises OSError when the retry still fails after clearing the read-only bit.
    """
    # Only the read-only case is recoverable here; anything else (a genuine lock,
    # a missing parent) should propagate so the job is marked failed as before.
    if not isinstance(exc, PermissionError):
        raise exc
    os.chmod(path, stat.S_IWRITE)
    func(path)


def resolve_safe_worktree_path(clone_root: str, repo_id: uuid.UUID) -> Path:
    """Resolve and validate the on-disk clone directory for cleanup.

    Ensures the target path stays inside ``clone_root`` so a malformed repo id
    cannot trigger deletion outside the configured clone directory.

    @param clone_root - Base directory from settings.repo_clone_dir.
    @param repo_id - Repository UUID whose clone directory should be removed.
    @returns Absolute path to the repo-specific clone directory.
    @raises UnsafeCleanupPathError when the resolved path escapes ``clone_root``.
    """
    root = Path(clone_root).resolve()
    worktree = repo_worktree_path(clone_root, repo_id).resolve()
    if not worktree.is_relative_to(root):
        raise UnsafeCleanupPathError(
            f"Refusing to delete clone outside configured root: {worktree}",
        )
    return worktree


def cleanup_repo_clone(clone_root: str, repo_id: uuid.UUID) -> bool:
    """Remove the on-disk clone directory for one repository.

    The operation is idempotent: missing directories are treated as already
    cleaned up and return ``False`` without raising.

    @param clone_root - Base directory from settings.repo_clone_dir.
    @param repo_id - Repository UUID whose clone directory should be removed.
    @returns True when a directory was removed, False when it was already absent.
    @raises UnsafeCleanupPathError when the resolved path escapes ``clone_root``.
    """
    worktree = resolve_safe_worktree_path(clone_root, repo_id)
    if not worktree.exists():
        log_event(
            logger,
            logging.INFO,
            f"Clone cleanup skipped — directory already absent for repo {repo_id}",
        )
        return False

    # onexc clears read-only files (Git pack/idx) that block deletion on Windows.
    shutil.rmtree(worktree, onexc=_clear_readonly_and_retry)
    log_event(
        logger,
        logging.INFO,
        f"Clone cleanup finished — removed {worktree} for repo {repo_id}",
    )
    return True
