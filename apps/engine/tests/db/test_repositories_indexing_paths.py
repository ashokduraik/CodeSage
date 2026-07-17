"""Tests for CodeChunkRepository path resolution."""

from __future__ import annotations

import uuid
from unittest.mock import MagicMock

from models import CodeChunk
from models.enums import RowStatus
from repositories.indexing import CodeChunkRepository, _span_start_line


def test_span_start_line_reads_start_line_key() -> None:
    chunk = CodeChunk(
        project_id=uuid.uuid4(),
        repo_id=uuid.uuid4(),
        file_path="src/a.ts",
        span={"startLine": 12, "endLine": 20},
        content="x",
    )
    assert _span_start_line(chunk) == 12


def test_list_active_by_project_path_returns_empty_for_blank_query() -> None:
    repo = CodeChunkRepository(MagicMock())
    assert repo.list_active_by_project_path(uuid.uuid4(), "   ") == []


def test_list_active_by_project_path_sorts_exact_match_first() -> None:
    project_id = uuid.uuid4()
    session = MagicMock()
    exact = CodeChunk(
        project_id=project_id,
        repo_id=uuid.uuid4(),
        file_path="src/loan.utils.ts",
        span={"startLine": 1, "endLine": 10},
        content="a",
        status=RowStatus.ACTIVE,
    )
    suffix = CodeChunk(
        project_id=project_id,
        repo_id=uuid.uuid4(),
        file_path="lib/src/loan.utils.ts",
        span={"startLine": 1, "endLine": 10},
        content="b",
        status=RowStatus.ACTIVE,
    )
    session.scalars.return_value.all.return_value = [suffix, exact]
    repo = CodeChunkRepository(session)
    rows = repo.list_active_by_project_path(project_id, "src/loan.utils.ts")
    assert rows[0].file_path == "src/loan.utils.ts"
