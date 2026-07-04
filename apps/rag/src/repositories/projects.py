"""Repositories for `projects` and `repos` tables."""

from __future__ import annotations

import re
import uuid
from datetime import UTC, datetime

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from models.enums import ProjectStatus, RepoConnectionStatus, RowStatus
from models import Project, Repo
from repositories.audit import stamp_created, stamp_updated

_TOKEN_PATTERN = re.compile(r"ghp_[A-Za-z0-9]+|glpat-[A-Za-z0-9_-]+|://[^@\s]+@")


def sanitize_sync_error(message: str, max_len: int = 2000) -> str:
    """Strip token-like substrings from sync error messages before persistence.

    @param message - Raw exception message.
    @param max_len - Maximum stored length.
    @returns Sanitized error text safe to show in the UI.
    """
    cleaned = _TOKEN_PATTERN.sub("[redacted]", message)
    return cleaned[:max_len]


class ProjectRepository:
    """Data access for projects."""

    def __init__(self, session: Session) -> None:
        """Bind the repository to an open SQLAlchemy session.

        @param session - Active ORM session.
        """
        self._session = session

    def get_by_id(self, project_id: uuid.UUID) -> Project | None:
        """Fetch an active project by primary key.

        @param project_id - Project UUID.
        @returns The project row or `None` when missing or soft-deleted.
        """
        project = self._session.get(Project, project_id)
        if project is None or project.status != RowStatus.ACTIVE:
            return None
        return project

    def list_all(self) -> list[Project]:
        """Return active projects ordered by creation time (newest first).

        @returns Project rows.
        """
        stmt = (
            select(Project)
            .where(Project.status == RowStatus.ACTIVE)
            .order_by(Project.created_at.desc())
        )
        return list(self._session.scalars(stmt))

    def create(self, name: str, status: ProjectStatus = ProjectStatus.ACTIVE) -> Project:
        """Insert a new project row.

        @param name - Display name.
        @param status - Initial lifecycle status.
        @returns The persisted project (flushed, not committed).
        """
        project = stamp_created(Project(name=name, lifecycle_status=status))
        self._session.add(project)
        self._session.flush()
        return project

    def update_status(self, project_id: uuid.UUID, status: ProjectStatus) -> Project | None:
        """Update a project's lifecycle status.

        @param project_id - Project UUID.
        @param status - New lifecycle status value.
        @returns Updated project or `None` if not found.
        """
        project = self.get_by_id(project_id)
        if project is None:
            return None
        project.lifecycle_status = status
        stamp_updated(project)
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
        """Fetch an active repo by primary key.

        @param repo_id - Repo UUID.
        @returns The repo row or `None` when missing or soft-deleted.
        """
        repo = self._session.get(Repo, repo_id)
        if repo is None or repo.status != RowStatus.ACTIVE:
            return None
        return repo

    def list_by_project(self, project_id: uuid.UUID) -> list[Repo]:
        """List active repos belonging to a project.

        @param project_id - Owning project UUID.
        @returns Repo rows ordered by creation time.
        """
        stmt = (
            select(Repo)
            .where(Repo.project_id == project_id, Repo.status == RowStatus.ACTIVE)
            .order_by(Repo.created_at)
        )
        return list(self._session.scalars(stmt))

    def update_head_sha(self, repo_id: uuid.UUID, sha: str) -> Repo | None:
        """Record the git HEAD SHA after sync (used for incremental diffs).

        Does not update ``last_indexed_at`` — that is set when embedding completes.

        @param repo_id - Repo UUID.
        @param sha - Git commit SHA.
        @returns Updated repo or `None` if not found.
        """
        repo = self.get_by_id(repo_id)
        if repo is None:
            return None
        repo.last_indexed_sha = sha
        stamp_updated(repo)
        self._session.flush()
        return repo

    def mark_index_complete(self, repo_id: uuid.UUID) -> Repo | None:
        """Stamp ``last_indexed_at`` when all chunks for a repo are embedded.

        @param repo_id - Repo UUID.
        @returns Updated repo or `None` if not found.
        """
        repo = self.get_by_id(repo_id)
        if repo is None:
            return None
        repo.last_indexed_at = datetime.now(UTC)
        stamp_updated(repo)
        self._session.flush()
        return repo

    def update_last_indexed_sha(self, repo_id: uuid.UUID, sha: str) -> Repo | None:
        """Record SHA and timestamp (legacy helper — prefer update_head_sha + mark_index_complete).

        @param repo_id - Repo UUID.
        @param sha - Git commit SHA.
        @returns Updated repo or `None` if not found.
        """
        repo = self.get_by_id(repo_id)
        if repo is None:
            return None
        repo.last_indexed_sha = sha
        repo.last_indexed_at = datetime.now(UTC)
        stamp_updated(repo)
        self._session.flush()
        return repo

    def update_connection_status(
        self,
        repo_id: uuid.UUID,
        status: RepoConnectionStatus,
        last_error: str | None = None,
    ) -> Repo | None:
        """Update repo connection health after sync success or failure.

        @param repo_id - Repo UUID.
        @param status - New connection status.
        @param last_error - Error message when status is ERROR; cleared otherwise.
        @returns Updated repo or `None` if not found.
        """
        repo = self.get_by_id(repo_id)
        if repo is None:
            return None
        repo.connection_status = status.value
        if status == RepoConnectionStatus.ERROR:
            repo.last_error = sanitize_sync_error(last_error or "Sync failed.")
            repo.last_error_at = datetime.now(UTC)
        else:
            repo.last_error = None
            repo.last_error_at = None
        stamp_updated(repo)
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
