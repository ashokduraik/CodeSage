"""Tests for indexing repositories."""

from __future__ import annotations

import uuid
from unittest.mock import MagicMock

from models import CodeChunk, GraphEdge, GraphNode
from repositories.indexing import (
    CodeChunkRepository,
    GraphEdgeRepository,
    GraphNodeRepository,
)


def test_graph_node_get_by_id() -> None:
    session = MagicMock()
    node = GraphNode(
        project_id=uuid.uuid4(),
        repo_id=uuid.uuid4(),
        kind="function",
        name="main",
    )
    session.get.return_value = node

    repo = GraphNodeRepository(session)
    assert repo.get_by_id(node.id) is node


def test_graph_node_list_by_repo() -> None:
    session = MagicMock()
    node = GraphNode(
        project_id=uuid.uuid4(),
        repo_id=uuid.uuid4(),
        kind="function",
        name="main",
    )
    session.scalars.return_value = iter([node])

    repo = GraphNodeRepository(session)
    assert repo.list_by_repo(node.repo_id) == [node]


def test_graph_node_add_and_delete_by_file() -> None:
    session = MagicMock()
    result = MagicMock()
    result.rowcount = 2
    session.execute.return_value = result

    repo = GraphNodeRepository(session)
    node = GraphNode(
        project_id=uuid.uuid4(),
        repo_id=uuid.uuid4(),
        kind="file",
        name="index.ts",
        file_path="src/index.ts",
    )
    assert repo.add(node) is node
    assert repo.delete_by_repo_file(node.repo_id, "src/index.ts") == 2


def test_graph_edge_list_and_add() -> None:
    session = MagicMock()
    edge = GraphEdge(
        project_id=uuid.uuid4(),
        src_id=uuid.uuid4(),
        dst_id=uuid.uuid4(),
        kind="calls",
    )
    session.scalars.side_effect = [iter([edge]), iter([edge])]

    repo = GraphEdgeRepository(session)
    assert repo.list_by_project(edge.project_id) == [edge]
    assert repo.list_by_src(edge.src_id) == [edge]
    assert repo.add(edge) is edge


def test_graph_edge_delete_by_repo_nodes() -> None:
    session = MagicMock()
    result = MagicMock()
    result.rowcount = 3
    session.execute.return_value = result

    repo = GraphEdgeRepository(session)
    assert repo.delete_by_repo_nodes(uuid.uuid4()) == 3


def test_code_chunk_crud_paths() -> None:
    session = MagicMock()
    chunk = CodeChunk(
        project_id=uuid.uuid4(),
        repo_id=uuid.uuid4(),
        file_path="a.ts",
        span={"start_line": 1, "end_line": 5},
        content="code",
    )
    session.get.return_value = chunk
    session.scalars.side_effect = [iter([chunk]), iter([chunk]), iter([chunk])]

    repo = CodeChunkRepository(session)
    assert repo.get_by_id(chunk.id) is chunk
    assert repo.list_by_repo(chunk.repo_id) == [chunk]
    assert repo.list_unembedded(chunk.repo_id) == [chunk]

    created = repo.add(
        project_id=chunk.project_id,
        repo_id=chunk.repo_id,
        file_path="b.ts",
        span={"start_line": 1, "end_line": 2},
        content="other",
        symbol_refs=[{"name": "foo"}],
    )
    assert created.file_path == "b.ts"

    updated = repo.update_embedding(chunk.id, [0.1, 0.2])
    assert updated is chunk
    assert chunk.embedding == [0.1, 0.2]

    session.get.return_value = None
    assert repo.update_embedding(uuid.uuid4(), [0.1]) is None

    result = MagicMock()
    result.rowcount = 1
    session.execute.return_value = result
    assert repo.delete_by_repo_file(chunk.repo_id, "a.ts") == 1
