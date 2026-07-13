"""Tests for repository clone cleanup helpers."""

from __future__ import annotations

import os
import stat
import uuid
from pathlib import Path

import pytest

from services.sync.cleanup import (
    UnsafeCleanupPathError,
    _clear_readonly_and_retry,
    cleanup_repo_clone,
    resolve_safe_worktree_path,
)


def test_resolve_safe_worktree_path_returns_repo_directory(tmp_path: Path) -> None:
    repo_id = uuid.uuid4()
    worktree = resolve_safe_worktree_path(str(tmp_path), repo_id)
    assert worktree == (tmp_path / str(repo_id)).resolve()


def test_cleanup_repo_clone_removes_existing_directory(tmp_path: Path) -> None:
    repo_id = uuid.uuid4()
    worktree = tmp_path / str(repo_id)
    worktree.mkdir()
    (worktree / ".git").mkdir()
    (worktree / "README.md").write_text("hello", encoding="utf-8")

    removed = cleanup_repo_clone(str(tmp_path), repo_id)

    assert removed is True
    assert not worktree.exists()


def test_cleanup_repo_clone_is_idempotent_when_directory_missing(tmp_path: Path) -> None:
    repo_id = uuid.uuid4()
    removed = cleanup_repo_clone(str(tmp_path), repo_id)
    assert removed is False


def test_cleanup_repo_clone_removes_readonly_git_pack_files(tmp_path: Path) -> None:
    """Read-only Git pack files (the Windows [WinError 5] case) are still removed."""
    repo_id = uuid.uuid4()
    worktree = tmp_path / str(repo_id)
    pack_dir = worktree / ".git" / "objects" / "pack"
    pack_dir.mkdir(parents=True)
    pack_file = pack_dir / "pack-abc.idx"
    pack_file.write_bytes(b"binary index")
    os.chmod(pack_file, stat.S_IREAD)

    removed = cleanup_repo_clone(str(tmp_path), repo_id)

    assert removed is True
    assert not worktree.exists()


def test_clear_readonly_and_retry_recovers_from_permission_error(tmp_path: Path) -> None:
    target = tmp_path / "locked.idx"
    target.write_bytes(b"data")
    os.chmod(target, stat.S_IREAD)

    _clear_readonly_and_retry(os.unlink, str(target), PermissionError("denied"))

    assert not target.exists()


def test_clear_readonly_and_retry_reraises_non_permission_errors() -> None:
    original = FileNotFoundError("missing")

    def _never_called(_: str) -> None:  # pragma: no cover - must not run
        raise AssertionError("func should not be retried for non-permission errors")

    with pytest.raises(FileNotFoundError):
        _clear_readonly_and_retry(_never_called, "whatever", original)


def test_resolve_safe_worktree_path_rejects_escape(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    repo_id = uuid.uuid4()

    def _bad_path(clone_root: str, repo_uuid: uuid.UUID) -> Path:
        return Path(clone_root).resolve().parent / str(repo_uuid)

    monkeypatch.setattr("services.sync.cleanup.repo_worktree_path", _bad_path)

    with pytest.raises(UnsafeCleanupPathError):
        resolve_safe_worktree_path(str(tmp_path), repo_id)
