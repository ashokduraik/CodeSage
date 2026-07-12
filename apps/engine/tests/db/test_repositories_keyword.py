"""Tests for keyword retrieval query builders."""

from __future__ import annotations

import uuid

from sqlalchemy.dialects import postgresql

from repositories.keyword import build_keyword_query


def test_build_keyword_query_compiles_with_trigram() -> None:
    stmt = build_keyword_query(
        project_id=uuid.uuid4(),
        terms=["getMinEmi"],
        limit=5,
        repo_ids=[uuid.uuid4()],
    )
    compiled = str(
        stmt.compile(dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True}),
    )
    assert "code_chunks" in compiled
    assert "similarity" in compiled.lower()
    assert "status" in compiled
