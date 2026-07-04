"""Per-repo failure status and project lifecycle reconciliation."""

from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from models.enums import ProjectStatus, RepoConnectionStatus
from repositories import ProjectRepository, RepoRepository


def mark_repo_indexing_failed(
    session: Session,
    repo_id: uuid.UUID,
    *,
    explanation: str,
) -> None:
    """Persist repo error state after any indexing job failure.

    @param session - Active SQLAlchemy session (caller commits).
    @param repo_id - Affected repository UUID.
    @param explanation - User-facing failure explanation.
    """
    repos = RepoRepository(session)
    repo = repos.update_connection_status(
        repo_id,
        RepoConnectionStatus.ERROR,
        explanation,
    )
    if repo is not None:
        recompute_project_lifecycle(session, repo.project_id)


def recompute_project_lifecycle(session: Session, project_id: uuid.UUID) -> None:
    """Set project lifecycle from aggregate repo connection/index state.

    @param session - Active SQLAlchemy session (caller commits).
    @param project_id - Project UUID to reconcile.
    """
    repos = RepoRepository(session)
    projects = ProjectRepository(session)
    project = projects.get_by_id(project_id)
    if project is None:
        return

    active_repos = repos.list_by_project(project_id)
    if not active_repos:
        projects.update_status(project_id, ProjectStatus.ACTIVE)
        return

    statuses = {repo.connection_status for repo in active_repos}
    all_indexed = all(repo.last_indexed_at is not None for repo in active_repos)
    has_error = RepoConnectionStatus.ERROR.value in statuses

    if all_indexed and RepoConnectionStatus.CONNECTED.value in statuses and not has_error:
        projects.update_status(project_id, ProjectStatus.INDEXED)
        return

    if RepoConnectionStatus.CONNECTING.value in statuses:
        projects.update_status(project_id, ProjectStatus.INDEXING)
        return

    if RepoConnectionStatus.ERROR.value in statuses:
        still_progressing = (
            RepoConnectionStatus.CONNECTING.value in statuses
            or any(repo.last_indexed_at is None for repo in active_repos)
        )
        if still_progressing:
            projects.update_status(project_id, ProjectStatus.INDEXING)
        elif statuses == {RepoConnectionStatus.ERROR.value}:
            projects.update_status(project_id, ProjectStatus.ERROR)
        else:
            projects.update_status(project_id, ProjectStatus.INDEXING)
        return

    if all_indexed and not has_error:
        projects.update_status(project_id, ProjectStatus.INDEXED)
        return

    projects.update_status(project_id, ProjectStatus.INDEXING)
