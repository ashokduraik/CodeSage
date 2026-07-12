"""Tests for project lifecycle reconciliation after repo failures."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from unittest.mock import MagicMock

from models.enums import ProjectStatus, RepoConnectionStatus
from services.indexing.failure_status import recompute_project_lifecycle


def _repo(
    *,
    connection_status: str,
    last_indexed_at: datetime | None = None,
) -> MagicMock:
    row = MagicMock()
    row.connection_status = connection_status
    row.last_indexed_at = last_indexed_at
    return row


def test_recompute_project_indexed_when_all_repos_done() -> None:
    session = MagicMock()
    project_id = uuid.uuid4()
    indexed_at = datetime.now(UTC)
    repo = _repo(
        connection_status=RepoConnectionStatus.CONNECTED.value,
        last_indexed_at=indexed_at,
    )

    from unittest.mock import patch

    with (
        patch("services.indexing.failure_status.RepoRepository") as repo_cls,
        patch("services.indexing.failure_status.ProjectRepository") as project_cls,
    ):
        repo_cls.return_value.list_by_project.return_value = [repo]
        project_cls.return_value.get_by_id.return_value = MagicMock()
        recompute_project_lifecycle(session, project_id)
        project_cls.return_value.update_status.assert_called_once_with(
            project_id,
            ProjectStatus.INDEXED,
        )


def test_recompute_project_stays_indexing_when_one_repo_errors() -> None:
    session = MagicMock()
    project_id = uuid.uuid4()
    ok_repo = _repo(
        connection_status=RepoConnectionStatus.CONNECTED.value,
        last_indexed_at=None,
    )
    bad_repo = _repo(connection_status=RepoConnectionStatus.ERROR.value)

    from unittest.mock import patch

    with (
        patch("services.indexing.failure_status.RepoRepository") as repo_cls,
        patch("services.indexing.failure_status.ProjectRepository") as project_cls,
    ):
        repo_cls.return_value.list_by_project.return_value = [ok_repo, bad_repo]
        project_cls.return_value.get_by_id.return_value = MagicMock()
        recompute_project_lifecycle(session, project_id)
        project_cls.return_value.update_status.assert_called_once_with(
            project_id,
            ProjectStatus.INDEXING,
        )


def test_recompute_project_not_indexed_when_error_repo_has_prior_index() -> None:
    session = MagicMock()
    project_id = uuid.uuid4()
    indexed_at = datetime.now(UTC)
    ok_repo = _repo(
        connection_status=RepoConnectionStatus.CONNECTED.value,
        last_indexed_at=indexed_at,
    )
    bad_repo = _repo(
        connection_status=RepoConnectionStatus.ERROR.value,
        last_indexed_at=indexed_at,
    )

    from unittest.mock import patch

    with (
        patch("services.indexing.failure_status.RepoRepository") as repo_cls,
        patch("services.indexing.failure_status.ProjectRepository") as project_cls,
    ):
        repo_cls.return_value.list_by_project.return_value = [ok_repo, bad_repo]
        project_cls.return_value.get_by_id.return_value = MagicMock()
        recompute_project_lifecycle(session, project_id)
        project_cls.return_value.update_status.assert_called_once_with(
            project_id,
            ProjectStatus.INDEXING,
        )
