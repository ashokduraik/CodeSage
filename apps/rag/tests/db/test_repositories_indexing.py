"""Tests for active code chunk counting."""

import uuid
from unittest.mock import MagicMock

from repositories.indexing import CodeChunkRepository


def test_count_active_by_project_returns_scalar() -> None:
    session = MagicMock()
    session.scalar.return_value = 42
    repo = CodeChunkRepository(session)
    count = repo.count_active_by_project(uuid.uuid4())
    assert count == 42
    session.scalar.assert_called_once()


def test_count_active_by_project_with_repo_filter() -> None:
    session = MagicMock()
    session.scalar.return_value = 7
    repo = CodeChunkRepository(session)
    repo_ids = [uuid.uuid4(), uuid.uuid4()]
    count = repo.count_active_by_project(uuid.uuid4(), repo_ids=repo_ids)
    assert count == 7
