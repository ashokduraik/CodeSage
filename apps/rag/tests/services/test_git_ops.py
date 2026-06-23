"""Tests for git sync helpers."""

from pathlib import Path

import pytest

from services.sync.git_ops import GitSyncResult, build_authenticated_url, sync_repository
from services.sync.paths import is_indexable_file, list_indexable_files, repo_worktree_path


def test_build_authenticated_url_injects_token() -> None:
    url = build_authenticated_url("https://github.com/org/repo.git", "tok")
    assert url.startswith("https://tok@github.com/")


def test_build_authenticated_url_without_token() -> None:
    url = "https://github.com/org/repo.git"
    assert build_authenticated_url(url, None) == url


def test_repo_worktree_path() -> None:
    import uuid

    repo_id = uuid.uuid4()
    path = repo_worktree_path("/tmp/clones", repo_id)
    assert path == Path("/tmp/clones") / str(repo_id)


def test_list_indexable_files_filters(tmp_path: Path) -> None:
    (tmp_path / "src").mkdir()
    (tmp_path / "src" / "app.ts").write_text("export {}", encoding="utf-8")
    (tmp_path / "node_modules").mkdir()
    (tmp_path / "node_modules" / "bad.ts").write_text("x", encoding="utf-8")
    (tmp_path / "readme.md").write_text("nope", encoding="utf-8")
    files = list_indexable_files(tmp_path, max_file_bytes=10_000)
    assert files == ["src/app.ts"]


def test_is_indexable_file() -> None:
    assert is_indexable_file(Path("a.tsx")) is True
    assert is_indexable_file(Path("a.md")) is False


def test_sync_repository_clone(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    calls: list[list[str]] = []

    def fake_run(args: list[str], *, cwd: Path | None = None) -> object:
        calls.append(args)
        class Result:
            stdout = "abc123\n"
            returncode = 0

        if args[:2] == ["rev-parse", "HEAD"]:
            Result.stdout = "sha1\n"
        return Result()

    monkeypatch.setattr("services.sync.git_ops._run_git", fake_run)
    worktree = tmp_path / "repo"
    result = sync_repository(
        repo_url="https://example.com/r.git",
        branch="main",
        worktree=worktree,
        token=None,
        since_sha=None,
        list_files=lambda: ["a.ts"],
    )
    assert isinstance(result, GitSyncResult)
    assert result.head_sha == "sha1"
    assert result.changed_files == ["a.ts"]
    assert calls[0][0] == "clone"
