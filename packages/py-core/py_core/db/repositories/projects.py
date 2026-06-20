"""Repositories for `projects` and `repos` tables."""

from __future__ import annotations

import uuid

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from py_core.db.enums import ProjectStatus
from py_core.db.models import Project, Repo


class ProjectRepository:
    """Data access for projects."""

    def __init__(self, session: Session) -> None:
        """Bind the repository to an open SQLAlchemy session.

        @param session - Active ORM session.
        """
        self._session = session

    def get_by_id(self, project_id: uuid.UUID) -> Project | None:
        """Fetch a project by primary key.

        @param project_id - Project UUID.
        @returns The project row or `None`.
        """
        return self._session.get(Project, project_id)

    def list_all(self) -> list[Project]:
        """Return all projects ordered by creation time (newest first).

        @returns Project rows.
        """
        stmt = select(Project).order_by(Project.created_at.desc())
        return list(self._session.scalars(stmt))

    def create(self, name: str, status: ProjectStatus = ProjectStatus.ACTIVE) -> Project:
        """Insert a new project row.

        @param name - Display name.
        @param status - Initial lifecycle status.
        @returns The persisted project (flushed, not committed).
        """
        project = Project(name=name, status=status)
        self._session.add(project)
        self._session.flush()
        return project

    def update_status(self, project_id: uuid.UUID, status: ProjectStatus) -> Project | None:
        """Update a project's lifecycle status.

        @param project_id - Project UUID.
        @param status - New status value.
        @returns Updated project or `None` if not found.
        """
        project = self.get_by_id(project_id)
        if project is None:
            return None
        project.status = status
        self._session.flush()
        return project


class RepoRepository:
    """Data access for repositories attached to projects."""

    def __init__(self, session: Session) -> None:
        """Bind the repository to an open SQLAlchemy session.

        @param session - Active ORM session.
        """
        self._session = session

    def get_by_id(self, repo_id: uuid.UUID) -> Repo | None:
        """Fetch a repo by primary key.

        @param repo_id - Repo UUID.
        @returns The repo row or `None`.
        """
        return self._session.get(Repo, repo_id)

    def list_by_project(self, project_id: uuid.UUID) -> list[Repo]:
        """List repos belonging to a project.

        @param project_id - Owning project UUID.
        @returns Repo rows ordered by creation time.
        """
        stmt = select(Repo).where(Repo.project_id == project_id).order_by(Repo.created_at)
        return list(self._session.scalars(stmt))

    def update_last_indexed_sha(self, repo_id: uuid.UUID, sha: str) -> Repo | None:
        """Record the SHA successfully indexed for incremental sync.

        @param repo_id - Repo UUID.
        @param sha - Git commit SHA.
        @returns Updated repo or `None` if not found.
        """
        repo = self.get_by_id(repo_id)
        if repo is None:
            return None
        repo.last_indexed_sha = sha
        self._session.flush()
        return repo

    def delete(self, repo_id: uuid.UUID) -> bool:
        """Delete a repo row.

        @param repo_id - Repo UUID.
        @returns `True` when a row was deleted.
        """
        stmt = delete(Repo).where(Repo.id == repo_id)
        result = self._session.execute(stmt)
        return result.rowcount > 0
