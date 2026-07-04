"""Filesystem helpers for repository clones."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from pathlib import Path

from services.sync.constants import INDEXABLE_EXTENSIONS, SKIP_DIR_NAMES


@dataclass(frozen=True)
class FileScanResult:
    """Outcome of walking a clone for indexable source files."""

    paths: list[str]
    skipped_large_count: int


def repo_worktree_path(clone_root: str, repo_id: uuid.UUID) -> Path:
    """Return the on-disk path where a repo clone is stored.

    @param clone_root - Base directory from settings.repo_clone_dir.
    @param repo_id - Repo UUID.
    @returns Absolute path to the repo worktree directory.
    """
    return Path(clone_root) / str(repo_id)


def is_existing_clone(worktree: Path) -> bool:
    """Return True when a git worktree already exists on disk.

    @param worktree - Local clone directory.
    @returns True when the path contains a ``.git`` directory.
    """
    return worktree.exists() and (worktree / ".git").exists()


def should_skip_dir(name: str) -> bool:
    """Return True when a directory name should be excluded from indexing walks.

    @param name - Directory basename.
    """
    return name in SKIP_DIR_NAMES


def is_indexable_file(path: Path) -> bool:
    """Return True when a file extension is eligible for Phase 1 parsing.

    @param path - File path relative or absolute.
    """
    return path.suffix.lower() in INDEXABLE_EXTENSIONS


def scan_indexable_files(root: Path, max_file_bytes: int) -> FileScanResult:
    """Walk a clone directory and return indexable source file paths plus skip stats.

    Skips vendored/build directories and files larger than ``max_file_bytes``.

    @param root - Repository worktree root.
    @param max_file_bytes - Maximum per-file size to index.
    @returns Sorted relative paths and a count of skipped oversized files.
    """
    if not root.is_dir():
        return FileScanResult(paths=[], skipped_large_count=0)
    found: list[str] = []
    skipped_large = 0
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        if any(part in SKIP_DIR_NAMES for part in path.relative_to(root).parts):
            continue
        if not is_indexable_file(path):
            continue
        if path.stat().st_size > max_file_bytes:
            skipped_large += 1
            continue
        found.append(path.relative_to(root).as_posix())
    return FileScanResult(paths=sorted(found), skipped_large_count=skipped_large)


def list_indexable_files(root: Path, max_file_bytes: int) -> list[str]:
    """Walk a clone directory and return relative paths of indexable source files.

    @param root - Repository worktree root.
    @param max_file_bytes - Maximum per-file size to index.
    @returns Sorted relative POSIX-style paths.
    """
    return scan_indexable_files(root, max_file_bytes).paths
