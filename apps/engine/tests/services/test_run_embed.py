"""Tests for embed job orchestration."""

from __future__ import annotations

import logging
import uuid
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from config import Settings
from config.logging import INDEXING_LOGGER_NAME, IndexingContext, configure_logging
from services.embedding.run_embed import create_embed_handler, handle_embed_job
from tests.helpers import make_exec_ctx


@pytest.fixture(autouse=True)
def _indexing_logs(caplog: pytest.LogCaptureFixture) -> None:
    configure_logging(Settings(log_level="info"))
    caplog.set_level(logging.INFO, logger=INDEXING_LOGGER_NAME)


def test_handle_embed_job_requires_payload() -> None:
    with pytest.raises(ValueError, match="repoId and chunkIds"):
        handle_embed_job(MagicMock(), Settings(), {}, make_exec_ctx(job_type="embed"))


def test_handle_embed_job_missing_repo() -> None:
    with patch("services.embedding.run_embed.RepoRepository") as repo_cls:
        repo_cls.return_value.get_by_id.return_value = None
        with pytest.raises(ValueError, match="Repo not found"):
            handle_embed_job(
                MagicMock(),
                Settings(),
                {"repoId": str(uuid.uuid4()), "chunkIds": [str(uuid.uuid4())]},
                make_exec_ctx(job_type="embed"),
            )


def test_handle_embed_job_updates_vectors_and_marks_indexed(
    monkeypatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    repo_id = uuid.uuid4()
    project_id = uuid.uuid4()
    chunk_id = uuid.uuid4()
    row = SimpleNamespace(id=chunk_id, content="export {}", repo_id=repo_id)
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
    monkeypatch.setattr("services.embedding.run_embed.maybe_enqueue_xrepo", lambda *a, **k: False)
    monkeypatch.setattr(
        "services.embedding.run_embed.EmbeddingClient",
        lambda settings: SimpleNamespace(embed_texts=lambda texts: [[0.1, 0.2]]),
    )

    handle_embed_job(
        MagicMock(),
        Settings(),
        {"repoId": str(repo_id), "chunkIds": [str(chunk_id)]},
        make_exec_ctx(job_type="embed", repo_id=repo_id, project_id=project_id),
    )
    mock_chunks.update_embedding.assert_called_once()
    mock_projects.update_status.assert_called_once()
    mock_repos.mark_index_complete.assert_called_once_with(repo_id, sha=None)
    assert "Step 3/3 finished" in caplog.text
    assert "Indexing complete" in caplog.text


def test_handle_embed_job_enqueues_xrepo_when_ready(monkeypatch) -> None:
    repo_id = uuid.uuid4()
    project_id = uuid.uuid4()
    chunk_id = uuid.uuid4()
    row = SimpleNamespace(id=chunk_id, content="export {}", repo_id=repo_id)
    repo = SimpleNamespace(id=repo_id, project_id=project_id)

    mock_repos = MagicMock()
    mock_repos.get_by_id.return_value = repo
    mock_chunks = MagicMock()
    mock_chunks.get_by_id.return_value = row
    mock_chunks.list_unembedded.return_value = []
    enqueue_called: list[uuid.UUID] = []

    monkeypatch.setattr("services.embedding.run_embed.RepoRepository", lambda s: mock_repos)
    monkeypatch.setattr("services.embedding.run_embed.ProjectRepository", lambda s: MagicMock())
    monkeypatch.setattr("services.embedding.run_embed.CodeChunkRepository", lambda s: mock_chunks)
    monkeypatch.setattr(
        "services.embedding.run_embed.EmbeddingClient",
        lambda settings: SimpleNamespace(embed_texts=lambda texts: [[0.1, 0.2]]),
    )
    monkeypatch.setattr(
        "services.embedding.run_embed.maybe_enqueue_xrepo",
        lambda session, pid: enqueue_called.append(pid) or True,
    )

    handle_embed_job(
        MagicMock(),
        Settings(),
        {"repoId": str(repo_id), "chunkIds": [str(chunk_id)]},
        make_exec_ctx(job_type="embed", repo_id=repo_id, project_id=project_id),
    )
    assert enqueue_called == [project_id]


def test_handle_embed_job_missing_chunk_raises() -> None:
    repo_id = uuid.uuid4()
    repo = SimpleNamespace(id=repo_id, project_id=uuid.uuid4())
    mock_repos = MagicMock()
    mock_repos.get_by_id.return_value = repo
    mock_chunks = MagicMock()
    mock_chunks.get_by_id.return_value = None

    with patch("services.embedding.run_embed.RepoRepository", lambda s: mock_repos):
        with patch("services.embedding.run_embed.ProjectRepository", lambda s: MagicMock()):
            with patch("services.embedding.run_embed.CodeChunkRepository", lambda s: mock_chunks):
                with pytest.raises(ValueError, match="Chunk not found"):
                    handle_embed_job(
                        MagicMock(),
                        Settings(),
                        {"repoId": str(repo_id), "chunkIds": [str(uuid.uuid4())]},
                        make_exec_ctx(job_type="embed", repo_id=repo_id),
                    )


def test_handle_embed_job_no_valid_chunks_logs_skip(
    monkeypatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    repo_id = uuid.uuid4()
    repo = SimpleNamespace(id=repo_id, project_id=uuid.uuid4())
    mock_repos = MagicMock()
    mock_repos.get_by_id.return_value = repo

    monkeypatch.setattr("services.embedding.run_embed.RepoRepository", lambda s: mock_repos)
    monkeypatch.setattr("services.embedding.run_embed.ProjectRepository", lambda s: MagicMock())
    monkeypatch.setattr("services.embedding.run_embed.CodeChunkRepository", lambda s: MagicMock())
    monkeypatch.setattr(
        "services.embedding.run_embed.resolve_indexing_context",
        lambda session, rid: IndexingContext(
            project_name="App",
            repo_label="github.com/org/r",
            branch="main",
        ),
    )

    handle_embed_job(
        MagicMock(),
        Settings(),
        {"repoId": str(repo_id), "chunkIds": []},
        make_exec_ctx(job_type="embed", repo_id=repo_id, project_id=repo.project_id),
    )
    assert "Step 3/3 skipped" in caplog.text


def test_create_embed_handler_delegates_to_handle_embed_job(monkeypatch) -> None:
    session = MagicMock()
    factory = MagicMock(return_value=session)
    called: list[tuple] = []
    monkeypatch.setattr(
        "services.embedding.run_embed.handle_embed_job",
        lambda *a, **k: called.append((a, k)),
    )
    handler = create_embed_handler(Settings(), factory)
    payload = {"repoId": str(uuid.uuid4()), "chunkIds": []}
    ctx = make_exec_ctx(job_type="embed")
    handler(payload, ctx, session)
    assert called
