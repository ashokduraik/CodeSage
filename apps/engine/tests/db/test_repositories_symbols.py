"""Tests for symbol retrieval query builders."""

from __future__ import annotations

import uuid

from sqlalchemy.dialects import postgresql

from repositories.symbols import build_symbol_query, _chunk_matches_symbol


def test_build_symbol_query_compiles_with_symbol_kinds() -> None:
    stmt = build_symbol_query(
        project_id=uuid.uuid4(),
        terms=["getMinEmi"],
        limit=5,
    )
    compiled = str(
        stmt.compile(dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True}),
    )
    assert "graph_nodes" in compiled
    assert "function" in compiled
    assert "similarity" in compiled.lower()


def test_chunk_matches_symbol_by_symbol_refs() -> None:
    from models import CodeChunk

    chunk = CodeChunk(
        project_id=uuid.uuid4(),
        repo_id=uuid.uuid4(),
        file_path="loan.utils.ts",
        span={"startLine": 1, "endLine": 10},
        content="export function getMinEmi() {}",
        symbol_refs=[{"kind": "function", "name": "getMinEmi", "startLine": 1}],
    )
    assert _chunk_matches_symbol(chunk, "getMinEmi") is True
    assert _chunk_matches_symbol(chunk, "otherFn") is False
