"""Tests for recursive graph expansion queries."""

from __future__ import annotations

import uuid
from unittest.mock import MagicMock

import pytest
from sqlalchemy.dialects import postgresql

from repositories.graph_queries import build_neighbor_expansion_query, expand_graph_neighbors


def test_build_neighbor_expansion_query_compiles() -> None:
    seed = uuid.uuid4()
    stmt = build_neighbor_expansion_query(seed_node_ids=[seed], max_depth=2)
    compiled = str(stmt.compile(dialect=postgresql.dialect()))
    assert "reachable" in compiled.lower()
    assert "UNION ALL" in compiled.upper()


def test_build_neighbor_expansion_query_with_edge_kinds() -> None:
    seed = uuid.uuid4()
    stmt = build_neighbor_expansion_query(
        seed_node_ids=[seed],
        max_depth=3,
        edge_kinds=["calls", "imports"],
    )
    compiled = str(
        stmt.compile(dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True}),
    )
    assert "calls" in compiled


def test_build_neighbor_expansion_query_validation() -> None:
    with pytest.raises(ValueError, match="seed_node_ids"):
        build_neighbor_expansion_query(seed_node_ids=[], max_depth=1)
    with pytest.raises(ValueError, match="max_depth"):
        build_neighbor_expansion_query(seed_node_ids=[uuid.uuid4()], max_depth=0)


def test_expand_graph_neighbors_executes() -> None:
    session = MagicMock()
    node_id = uuid.uuid4()
    session.execute.return_value.all.return_value = [(node_id, 0), (uuid.uuid4(), 1)]

    results = expand_graph_neighbors(
        session,
        seed_node_ids=[node_id],
        max_depth=2,
    )
    assert results[0] == (node_id, 0)
    assert len(results) == 2
