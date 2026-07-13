"""Enqueue distillation when a project finishes indexing or has stale artifacts."""

from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from repositories import DerivedKnowledgeRepository, JobRepository, RepoRepository


def maybe_enqueue_distill(
    session: Session,
    project_id: uuid.UUID,
    *,
    stale_artifact_ids: list[uuid.UUID] | None = None,
) -> bool:
    """Queue a ``distill`` job when every active repo is index-complete.

    Deduplicates pending/running distill jobs for the same project. When
    ``stale_artifact_ids`` is provided, only those artifacts are re-derived.

    @param session - Active SQLAlchemy session; caller commits.
    @param project_id - Project UUID to evaluate.
    @param stale_artifact_ids - Optional stale row ids for incremental derive.
    @returns ``True`` when a new distill job was inserted.
    """
    repos = RepoRepository(session)
    active_repos = repos.list_by_project(project_id)
    if not active_repos:
        return False
    if not all(repo.last_indexed_at is not None for repo in active_repos):
        return False

    jobs = JobRepository(session)
    if jobs.has_active_job("distill", project_id=project_id):
        return False

    payload: dict[str, object] = {"projectId": str(project_id)}
    if stale_artifact_ids:
        payload["staleArtifactIds"] = [str(row_id) for row_id in stale_artifact_ids]

    jobs.enqueue("distill", payload)
    return True


def maybe_enqueue_distill_after_file_changes(
    session: Session,
    project_id: uuid.UUID,
    changed_files: list[str],
) -> bool:
    """Mark derived artifacts stale and enqueue incremental distillation.

    Called after incremental parse when specific files changed.

    @param session - Active SQLAlchemy session; caller commits.
    @param project_id - Owning project UUID.
    @param changed_files - Repo-relative paths that were re-parsed.
    @returns ``True`` when a distill job was enqueued.
    """
    if not changed_files:
        return False
    derived = DerivedKnowledgeRepository(session)
    derived.mark_stale_by_files(project_id, changed_files)
    stale_ids = derived.get_stale_ids(project_id)
    if not stale_ids:
        return False
    return maybe_enqueue_distill(session, project_id, stale_artifact_ids=stale_ids)
