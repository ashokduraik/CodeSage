"""Enqueue cross-repo linking when a multi-repo project finishes indexing."""

from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from repositories import JobRepository, RepoRepository


def maybe_enqueue_xrepo(session: Session, project_id: uuid.UUID) -> bool:
    """Queue an ``xrepo`` job when every active repo in a project is index-complete.

    Cross-repo linking only makes sense once each repository has embeddings and graph
    nodes. A pending or running xrepo job for the same project prevents duplicates.

    @param session - Active SQLAlchemy session; caller commits.
    @param project_id - Project UUID to evaluate.
    @returns ``True`` when a new xrepo job was inserted.
    """
    repos = RepoRepository(session)
    active_repos = repos.list_by_project(project_id)
    if len(active_repos) < 2:
        return False
    if not all(repo.last_indexed_at is not None for repo in active_repos):
        return False

    jobs = JobRepository(session)
    if jobs.has_active_job("xrepo", project_id=project_id):
        return False

    jobs.enqueue("xrepo", {"projectId": str(project_id)})
    return True
