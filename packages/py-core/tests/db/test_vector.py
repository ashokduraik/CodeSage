"""Tests for pgvector similarity query helpers."""

from __future__ import annotations

import uuid
from unittest.mock import MagicMock

from sqlalchemy.dialects import postgresql

from py_core.db.models import CodeChunk
from py_core.db.vector import build_similarity_query, similarity_search


def test_build_similarity_query_compiles() -> None:
    project_id = uuid.uuid4()
    stmt = build_similarity_query(
        project_id=project_id,
        query_embedding=[0.1] * 1024,
        limit=5,
        repo_ids=[uuid.uuid4()],
    )
    compiled = str(
        stmt.compile(dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True}),
    )
    assert "code_chunks" in compiled
    assert "cosine_distance" in compiled.lower() or "<=>" in compiled


def test_build_similarity_query_without_repo_filter() -> None:
    stmt = build_similarity_query(
        project_id=uuid.uuid4(),
        query_embedding=[0.0, 0.1],
        limit=10,
    )
    assert stmt._limit_clause.value == 10  # noqa: SLF001


def test_similarity_search_executes() -> None:
    session = MagicMock()
    chunk = CodeChunk(
        project_id=uuid.uuid4(),
        repo_id=uuid.uuid4(),
        file_path="a.ts",
        span={"start_line": 1},
        content="x",
    )
    session.execute.return_value.all.return_value = [(chunk, 0.42)]

    results = similarity_search(
        session,
        project_id=chunk.project_id,
        query_embedding=[0.1],
        limit=3,
    )
    assert results == [(chunk, 0.42)]
