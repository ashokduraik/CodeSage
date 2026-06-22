"""Tests for project and repo repositories."""

from __future__ import annotations

import uuid
from unittest.mock import MagicMock

from models.enums import ProjectStatus, RepoProvider
from models import Project, Repo
from repositories.projects import ProjectRepository, RepoRepository


def test_project_get_by_id() -> None:
    session = MagicMock()
    project_id = uuid.uuid4()
    project = Project(name="demo")
    session.get.return_value = project

    repo = ProjectRepository(session)
    assert repo.get_by_id(project_id) is project


def test_project_list_all() -> None:
    session = MagicMock()
    project = Project(name="demo")
    session.scalars.return_value = iter([project])

    repo = ProjectRepository(session)
    assert repo.list_all() == [project]


def test_project_create() -> None:
    session = MagicMock()
    repo = ProjectRepository(session)
    project = repo.create("demo", ProjectStatus.INDEXING)
    assert project.name == "demo"
    assert project.status == ProjectStatus.INDEXING
    session.add.assert_called_once()
    session.flush.assert_called_once()


def test_project_update_status_found() -> None:
    session = MagicMock()
    project = Project(name="demo")
    session.get.return_value = project

    repo = ProjectRepository(session)
    updated = repo.update_status(uuid.uuid4(), ProjectStatus.INDEXED)
    assert updated is project
    assert project.status == ProjectStatus.INDEXED


def test_project_update_status_missing() -> None:
    session = MagicMock()
    session.get.return_value = None
    repo = ProjectRepository(session)
    assert repo.update_status(uuid.uuid4(), ProjectStatus.ERROR) is None


def test_repo_list_by_project() -> None:
    session = MagicMock()
    repo_row = Repo(
        project_id=uuid.uuid4(),
        repo_url="https://x",
        provider=RepoProvider.GITHUB,
    )
    session.scalars.return_value = iter([repo_row])

    repo = RepoRepository(session)
    assert repo.list_by_project(repo_row.project_id) == [repo_row]


def test_repo_update_last_indexed_sha() -> None:
    session = MagicMock()
    repo_row = Repo(
        project_id=uuid.uuid4(),
        repo_url="https://x",
        provider=RepoProvider.GITHUB,
    )
    session.get.return_value = repo_row

    repo = RepoRepository(session)
    updated = repo.update_last_indexed_sha(uuid.uuid4(), "abc123")
    assert updated is repo_row
    assert repo_row.last_indexed_sha == "abc123"


def test_repo_update_last_indexed_sha_missing() -> None:
    session = MagicMock()
    session.get.return_value = None
    repo = RepoRepository(session)
    assert repo.update_last_indexed_sha(uuid.uuid4(), "abc") is None


def test_repo_delete() -> None:
    session = MagicMock()
    result = MagicMock()
    result.rowcount = 1
    session.execute.return_value = result

    repo = RepoRepository(session)
    assert repo.delete(uuid.uuid4()) is True
