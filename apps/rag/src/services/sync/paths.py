"""Filesystem helpers for repository clones."""

from __future__ import annotations

import uuid
from pathlib import Path

from services.sync.constants import INDEXABLE_EXTENSIONS, SKIP_DIR_NAMES


def repo_worktree_path(clone_root: str, repo_id: uuid.UUID) -> Path:
    """Return the on-disk path where a repo clone is stored.

    @param clone_root - Base directory from settings.repo_clone_dir.
    @param repo_id - Repo UUID.
    @returns Absolute path to the repo worktree directory.
    """
    return Path(clone_root) / str(repo_id)


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


def list_indexable_files(root: Path, max_file_bytes: int) -> list[str]:
    """Walk a clone directory and return relative paths of indexable source files.

    Skips vendored/build directories and files larger than ``max_file_bytes``.

    @param root - Repository worktree root.
    @param max_file_bytes - Maximum per-file size to index.
    @returns Sorted relative POSIX-style paths.
    """
    if not root.is_dir():
        return []
    found: list[str] = []
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        if any(part in SKIP_DIR_NAMES for part in path.relative_to(root).parts):
            continue
        if not is_indexable_file(path):
            continue
        if path.stat().st_size > max_file_bytes:
            continue
        found.append(path.relative_to(root).as_posix())
    return sorted(found)
