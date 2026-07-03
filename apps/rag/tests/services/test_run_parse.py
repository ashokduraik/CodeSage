"""Tests for parse job orchestration."""

from __future__ import annotations

import uuid
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from config import Settings
from services.parsing.chunker import SourceChunk
from services.parsing.run_parse import create_parse_handler, handle_parse_job


def test_handle_parse_job_requires_payload() -> None:
    with pytest.raises(ValueError, match="repoId and files"):
        handle_parse_job(MagicMock(), Settings(), {})


def test_handle_parse_job_missing_repo() -> None:
    with patch("services.parsing.run_parse.RepoRepository") as repo_cls:
        repo_cls.return_value.get_by_id.return_value = None
        with pytest.raises(ValueError, match="Repo not found"):
            handle_parse_job(
                MagicMock(),
                Settings(),
                {"repoId": str(uuid.uuid4()), "files": ["a.ts"]},
            )


def test_handle_parse_job_chunks_and_enqueues_embed(tmp_path: Path, monkeypatch) -> None:
    repo_id = uuid.uuid4()
    project_id = uuid.uuid4()
    worktree = tmp_path / str(repo_id)
    worktree.mkdir()
    (worktree / "src").mkdir()
    (worktree / "src" / "app.ts").write_text("line\n" * 50, encoding="utf-8")

    repo = SimpleNamespace(id=repo_id, project_id=project_id)
    chunk_row = SimpleNamespace(id=uuid.uuid4())
    mock_repos = MagicMock()
    mock_repos.get_by_id.return_value = repo
    mock_chunks = MagicMock()
    mock_chunks.add.return_value = chunk_row
    mock_jobs = MagicMock()

    monkeypatch.setattr("services.parsing.run_parse.RepoRepository", lambda s: mock_repos)
    monkeypatch.setattr("services.parsing.run_parse.CodeChunkRepository", lambda s: mock_chunks)
    monkeypatch.setattr("services.parsing.run_parse.JobRepository", lambda s: mock_jobs)
    monkeypatch.setattr("services.parsing.run_parse.persist_file_graph", lambda *a, **k: None)
    monkeypatch.setattr(
        "services.parsing.run_parse.chunk_source",
        lambda text, file_path="": [
            SourceChunk(content=text, span={"startLine": 1, "endLine": 1}),
        ],
    )

    handle_parse_job(
        MagicMock(),
        Settings(repo_clone_dir=str(tmp_path)),
        {"repoId": str(repo_id), "files": ["src/app.ts", 123, "missing.ts"]},
    )
    mock_chunks.delete_by_repo_file.assert_called_once()
    mock_jobs.enqueue.assert_called_once()
    assert mock_jobs.enqueue.call_args[0][0] == "embed"


def test_create_parse_handler_rolls_back_on_error(monkeypatch) -> None:
    session = MagicMock()
    factory = MagicMock(return_value=session)
    monkeypatch.setattr(
        "services.parsing.run_parse.handle_parse_job",
        lambda *a, **k: (_ for _ in ()).throw(RuntimeError("fail")),
    )
    handler = create_parse_handler(Settings(), factory)
    with pytest.raises(RuntimeError):
        handler({"repoId": str(uuid.uuid4()), "files": []})
    session.rollback.assert_called_once()
