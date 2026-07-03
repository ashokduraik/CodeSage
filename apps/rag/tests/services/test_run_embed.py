"""Tests for embed job orchestration."""

from __future__ import annotations

import uuid
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from config import Settings
from services.embedding.run_embed import create_embed_handler, handle_embed_job


def test_handle_embed_job_requires_payload() -> None:
    with pytest.raises(ValueError, match="repoId and chunkIds"):
        handle_embed_job(MagicMock(), Settings(), {})


def test_handle_embed_job_missing_repo() -> None:
    with patch("services.embedding.run_embed.RepoRepository") as repo_cls:
        repo_cls.return_value.get_by_id.return_value = None
        with pytest.raises(ValueError, match="Repo not found"):
            handle_embed_job(
                MagicMock(),
                Settings(),
                {"repoId": str(uuid.uuid4()), "chunkIds": [str(uuid.uuid4())]},
            )


def test_handle_embed_job_updates_vectors_and_marks_indexed(monkeypatch) -> None:
    repo_id = uuid.uuid4()
    project_id = uuid.uuid4()
    chunk_id = uuid.uuid4()
    row = SimpleNamespace(id=chunk_id, content="export {}")
    repo = SimpleNamespace(id=repo_id, project_id=project_id)

    mock_repos = MagicMock()
    mock_repos.get_by_id.return_value = repo
    mock_projects = MagicMock()
    mock_chunks = MagicMock()
    mock_chunks.get_by_id.return_value = row
    mock_chunks.list_unembedded.return_value = []

    monkeypatch.setattr("services.embedding.run_embed.RepoRepository", lambda s: mock_repos)
    monkeypatch.setattr("services.embedding.run_embed.ProjectRepository", lambda s: mock_projects)
    monkeypatch.setattr("services.embedding.run_embed.CodeChunkRepository", lambda s: mock_chunks)
    monkeypatch.setattr(
        "services.embedding.run_embed.EmbeddingClient",
        lambda settings: SimpleNamespace(embed_texts=lambda texts: [[0.1, 0.2]]),
    )

    handle_embed_job(
        MagicMock(),
        Settings(),
        {"repoId": str(repo_id), "chunkIds": [str(chunk_id)]},
    )
    mock_chunks.update_embedding.assert_called_once()
    mock_projects.update_status.assert_called_once()
    mock_repos.mark_index_complete.assert_called_once_with(repo_id)


def test_handle_embed_job_no_valid_chunks_returns_early(monkeypatch) -> None:
    repo_id = uuid.uuid4()
    repo = SimpleNamespace(id=repo_id, project_id=uuid.uuid4())
    mock_repos = MagicMock()
    mock_repos.get_by_id.return_value = repo
    mock_chunks = MagicMock()
    mock_chunks.get_by_id.return_value = None

    monkeypatch.setattr("services.embedding.run_embed.RepoRepository", lambda s: mock_repos)
    monkeypatch.setattr("services.embedding.run_embed.ProjectRepository", lambda s: MagicMock())
    monkeypatch.setattr("services.embedding.run_embed.CodeChunkRepository", lambda s: mock_chunks)

    handle_embed_job(
        MagicMock(),
        Settings(),
        {"repoId": str(repo_id), "chunkIds": [str(uuid.uuid4())]},
    )
    mock_chunks.update_embedding.assert_not_called()


def test_create_embed_handler_commits(monkeypatch) -> None:
    session = MagicMock()
    factory = MagicMock(return_value=session)
    monkeypatch.setattr("services.embedding.run_embed.handle_embed_job", lambda *a, **k: None)
    create_embed_handler(Settings(), factory)({"repoId": str(uuid.uuid4()), "chunkIds": []})
    session.commit.assert_called_once()
