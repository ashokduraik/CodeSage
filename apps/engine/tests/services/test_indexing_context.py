"""Tests for indexing context resolution."""

from __future__ import annotations

import uuid
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from services.indexing.context import resolve_indexing_context


def test_resolve_indexing_context_with_project() -> None:
    session = MagicMock()
    repo_id = uuid.uuid4()
    project_id = uuid.uuid4()
    repo = SimpleNamespace(
        project_id=project_id,
        repo_url="https://github.com/org/repo.git",
        branch="main",
    )
    project = SimpleNamespace(name="My App")

    with (
        patch("services.indexing.context.RepoRepository") as repo_cls,
        patch("services.indexing.context.ProjectRepository") as project_cls,
    ):
        repo_cls.return_value.get_by_id.return_value = repo
        project_cls.return_value.get_by_id.return_value = project
        ctx = resolve_indexing_context(session, repo_id)

    assert ctx is not None
    assert ctx.project_name == "My App"
    assert ctx.repo_label == "github.com/org/repo"
    assert ctx.branch == "main"


def test_resolve_indexing_context_missing_repo() -> None:
    session = MagicMock()
    with patch("services.indexing.context.RepoRepository") as repo_cls:
        repo_cls.return_value.get_by_id.return_value = None
        assert resolve_indexing_context(session, uuid.uuid4()) is None
