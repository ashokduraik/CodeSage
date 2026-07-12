"""Tests for git sync helpers."""

from pathlib import Path

import pytest

from models.enums import RepoConnectionStatus
from services.sync.git_ops import GitSyncResult, build_authenticated_url, resolve_remote_head, sync_repository
from services.sync.paths import (
    FileScanResult,
    is_existing_clone,
    is_indexable_file,
    list_indexable_files,
    repo_worktree_path,
    resolve_worktree_file,
    scan_indexable_files,
    should_skip_dir,
)


def test_build_authenticated_url_keeps_clean_url() -> None:
    url = build_authenticated_url("https://github.com/org/repo.git", "tok")
    assert url == "https://github.com/org/repo.git"


def test_build_authenticated_url_without_token() -> None:
    url = "https://github.com/org/repo.git"
    assert build_authenticated_url(url, None) == url


def test_resolve_remote_head_parses_ls_remote_output(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_run(args: list[str], *, cwd: Path | None = None, token: str | None = None) -> object:
        class Result:
            stdout = "deadbeef\trefs/heads/main\n"
            returncode = 0

        return Result()

    monkeypatch.setattr("services.sync.git_ops._run_git", fake_run)
    assert resolve_remote_head(repo_url="https://github.com/org/r.git", branch="main", token=None) == "deadbeef"


def test_repo_worktree_path() -> None:
    import uuid

    repo_id = uuid.uuid4()
    path = repo_worktree_path("/tmp/clones", repo_id)
    assert path == Path("/tmp/clones") / str(repo_id)


def test_is_existing_clone(tmp_path: Path) -> None:
    worktree = tmp_path / "repo"
    assert is_existing_clone(worktree) is False
    worktree.mkdir()
    assert is_existing_clone(worktree) is False
    (worktree / ".git").mkdir()
    assert is_existing_clone(worktree) is True


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


def test_should_skip_dir() -> None:
    assert should_skip_dir("node_modules") is True
    assert should_skip_dir("src") is False


def test_list_indexable_files_missing_root() -> None:
    assert list_indexable_files(Path("/nonexistent/path"), max_file_bytes=1000) == []


def test_list_indexable_files_skips_large_files(tmp_path: Path) -> None:
    big = tmp_path / "big.ts"
    big.write_text("x" * 20, encoding="utf-8")
    files = list_indexable_files(tmp_path, max_file_bytes=5)
    assert files == []


def test_list_indexable_files_skips_large_files(tmp_path: Path) -> None:
    big = tmp_path / "big.ts"
    big.write_text("x" * 20, encoding="utf-8")
    files = list_indexable_files(tmp_path, max_file_bytes=5)
    assert files == []
    scan = scan_indexable_files(tmp_path, max_file_bytes=5)
    assert scan.skipped_large_count == 1


def test_resolve_worktree_file_rejects_traversal(tmp_path: Path) -> None:
    worktree = tmp_path / "repo"
    worktree.mkdir()
    (worktree / "safe.ts").write_text("ok", encoding="utf-8")
    outside = tmp_path / "outside.ts"
    outside.write_text("secret", encoding="utf-8")

    assert resolve_worktree_file(worktree, "safe.ts") == (worktree / "safe.ts").resolve()
    assert resolve_worktree_file(worktree, "../outside.ts") is None
    assert resolve_worktree_file(worktree, "../../etc/passwd") is None


def test_sync_repository_diff_fallback_on_shallow_history(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    calls: list[list[str]] = []

    def fake_run(args: list[str], *, cwd: Path | None = None, token: str | None = None) -> object:
        calls.append(args)
        if args[:2] == ["diff", "--name-only"]:
            raise RuntimeError("git diff failed: bad object")
        class Result:
            stdout = "sha2\n"
            returncode = 0

        if args[:2] == ["rev-parse", "HEAD"]:
            Result.stdout = "sha2\n"
        return Result()

    monkeypatch.setattr("services.sync.git_ops._run_git", fake_run)
    worktree = tmp_path / "repo"
    worktree.mkdir()
    (worktree / ".git").mkdir()
    result = sync_repository(
        repo_url="https://example.com/r.git",
        branch="main",
        worktree=worktree,
        token=None,
        since_sha="sha1",
        list_files=lambda: ["a.ts"],
    )
    assert result.changed_files == ["a.ts"]


def test_sync_repository_clone_logs(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    import logging

    from config import Settings
    from config.logging import configure_logging

    configure_logging(Settings(log_level="info"))
    calls: list[list[str]] = []

    def fake_run(args: list[str], *, cwd: Path | None = None, token: str | None = None) -> object:
        calls.append(args)

        class Result:
            stdout = "abc123\n"
            returncode = 0

        if args[:2] == ["rev-parse", "HEAD"]:
            Result.stdout = "sha1\n"
        return Result()

    monkeypatch.setattr("services.sync.git_ops._run_git", fake_run)
    worktree = tmp_path / "repo"
    sync_repository(
        repo_url="https://example.com/r.git",
        branch="main",
        worktree=worktree,
        token=None,
        since_sha=None,
        list_files=lambda: ["a.ts"],
    )
    captured = capsys.readouterr()
    assert "Cloning repository" in captured.err
    assert "Full index" in captured.err


def test_sync_repository_clone(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    calls: list[list[str]] = []

    def fake_run(args: list[str], *, cwd: Path | None = None, token: str | None = None) -> object:
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


def test_build_authenticated_url_non_http_scheme() -> None:
    url = "git@github.com:org/repo.git"
    assert build_authenticated_url(url, "tok") == url


def test_build_authenticated_url_with_port() -> None:
    url = build_authenticated_url("https://gitlab.com:8443/org/repo.git", "tok")
    assert url == "https://gitlab.com:8443/org/repo.git"


def test_run_git_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    def fail(*args: object, **kwargs: object) -> object:
        class Result:
            returncode = 1
            stdout = ""
            stderr = "bad"

        return Result()

    monkeypatch.setattr("services.sync.git_ops.subprocess.run", fail)
    from services.sync.git_ops import _run_git

    with pytest.raises(RuntimeError, match="failed"):
        _run_git(["status"])


def test_run_git_does_not_embed_token_in_args(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, object] = {}

    def record_run(cmd: list[str], **kwargs: object) -> object:
        captured["cmd"] = cmd
        captured["env"] = kwargs.get("env")

        class Result:
            returncode = 0
            stdout = "ok"
            stderr = ""

        return Result()

    monkeypatch.setattr("services.sync.git_ops.subprocess.run", record_run)
    from services.sync.git_ops import _run_git

    _run_git(["ls-remote", "https://github.com/org/repo.git", "refs/heads/main"], token="secret-token")
    cmd = captured["cmd"]
    assert isinstance(cmd, list)
    assert "secret-token" not in " ".join(cmd)
    env = captured["env"]
    assert isinstance(env, dict)
    assert env.get("CODESAGE_GIT_TOKEN") == "secret-token"


def test_sync_repository_fetch_existing(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    calls: list[list[str]] = []

    def fake_run(args: list[str], *, cwd: Path | None = None, token: str | None = None) -> object:
        calls.append(args)
        class Result:
            stdout = "sha2\n"
            returncode = 0

        if args[:2] == ["rev-parse", "HEAD"]:
            Result.stdout = "sha2\n"
        if args[:2] == ["diff", "--name-only"]:
            Result.stdout = "a.ts\n"
        return Result()

    monkeypatch.setattr("services.sync.git_ops._run_git", fake_run)
    worktree = tmp_path / "repo"
    worktree.mkdir()
    (worktree / ".git").mkdir()
    result = sync_repository(
        repo_url="https://example.com/r.git",
        branch="main",
        worktree=worktree,
        token=None,
        since_sha="sha1",
        list_files=lambda: ["a.ts", "b.ts"],
    )
    assert result.changed_files == ["a.ts"]
    assert any(args[0] == "fetch" for args in calls)


def test_sync_repository_fetch_existing_logs(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    import logging

    from config import Settings
    from config.logging import configure_logging

    configure_logging(Settings(log_level="info"))

    def fake_run(args: list[str], *, cwd: Path | None = None, token: str | None = None) -> object:
        class Result:
            stdout = "sha2\n"
            returncode = 0

        if args[:2] == ["rev-parse", "HEAD"]:
            Result.stdout = "sha2\n"
        if args[:2] == ["diff", "--name-only"]:
            Result.stdout = "a.ts\n"
        return Result()

    monkeypatch.setattr("services.sync.git_ops._run_git", fake_run)
    worktree = tmp_path / "repo"
    worktree.mkdir()
    (worktree / ".git").mkdir()
    sync_repository(
        repo_url="https://example.com/r.git",
        branch="main",
        worktree=worktree,
        token=None,
        since_sha="sha1",
        list_files=lambda: ["a.ts"],
    )
    captured = capsys.readouterr()
    assert "Fetching latest changes" in captured.err
    assert "Cloning repository" not in captured.err


def test_sync_repository_rejects_non_git_existing_path(tmp_path: Path) -> None:
    worktree = tmp_path / "repo"
    worktree.mkdir()
    with pytest.raises(RuntimeError, match="not a git repo"):
        sync_repository(
            repo_url="https://example.com/r.git",
            branch="main",
            worktree=worktree,
            token=None,
            since_sha=None,
            list_files=lambda: [],
        )
