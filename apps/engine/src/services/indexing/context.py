"""Resolve project/repo labels for indexing log messages."""

from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from config.logging import IndexingContext, safe_repo_label
from repositories import ProjectRepository, RepoRepository


def resolve_indexing_context(session: Session, repo_id: uuid.UUID) -> IndexingContext | None:
    """Load project and repository labels for log context.

    @param session - Active SQLAlchemy session.
    @param repo_id - Repository UUID from a job payload.
    @returns Context for log lines, or ``None`` when the repo is missing.
    """
    repo = RepoRepository(session).get_by_id(repo_id)
    if repo is None:
        return None
    project = ProjectRepository(session).get_by_id(repo.project_id)
    project_name = project.name if project is not None else None
    return IndexingContext(
        project_name=project_name,
        repo_label=safe_repo_label(repo.repo_url),
        branch=repo.branch,
    )
