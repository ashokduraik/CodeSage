"""Tests for agent QA retrieval tools."""

from __future__ import annotations

import uuid
from unittest.mock import MagicMock

import pytest

from config import Settings
from models.enums import RowStatus
from services.qa.tools import (
    TOOL_DEFINITIONS,
    execute_tool,
    parse_qualified_name,
    tool_definitions_for_planner,
)
from services.retrieval.types import RetrievalMatch


def _chunk(
    *,
    project_id: uuid.UUID | None = None,
    repo_id: uuid.UUID | None = None,
    file_path: str = "src/loan.utils.ts",
    content: str = "function getMinEmi() { return 1; }",
    span: dict | None = None,
    status: RowStatus = RowStatus.ACTIVE,
) -> MagicMock:
    """Build a MagicMock code chunk with the fields tools read."""
    chunk = MagicMock()
    chunk.id = uuid.uuid4()
    chunk.project_id = project_id or uuid.uuid4()
    chunk.repo_id = repo_id or uuid.uuid4()
    chunk.file_path = file_path
    chunk.content = content
    chunk.span = span or {"startLine": 1, "endLine": 10}
    chunk.status = status
    return chunk


def test_tool_definitions_for_planner_lists_all_seven_tools() -> None:
    names = {entry["function"]["name"] for entry in tool_definitions_for_planner()}
    assert names == {
        "search_symbols",
        "search_code",
        "search_vectors",
        "search_hybrid",
        "graph_expand",
        "read_symbol",
        "read_chunk",
    }
    assert len(TOOL_DEFINITIONS) == 7


def test_parse_qualified_name_bare_and_with_file() -> None:
    assert parse_qualified_name("getMinEmi") == (None, "getMinEmi")
    assert parse_qualified_name("src/loan.utils.ts::getMinEmi") == (
        "src/loan.utils.ts",
        "getMinEmi",
    )


def test_parse_qualified_name_rejects_empty() -> None:
    with pytest.raises(ValueError, match="must not be empty"):
        parse_qualified_name("   ")
    with pytest.raises(ValueError, match="symbol part"):
        parse_qualified_name("src/a.ts::")


def test_execute_tool_unknown_name_raises() -> None:
    with pytest.raises(ValueError, match="Unknown QA tool"):
        execute_tool(
            MagicMock(),
            Settings(),
            project_id=uuid.uuid4(),
            tool_name="not_a_tool",
            args={},
            repo_ids=None,
        )


def test_search_symbols_returns_hits_for_known_symbol(monkeypatch: pytest.MonkeyPatch) -> None:
    project_id = uuid.uuid4()
    chunk = _chunk(project_id=project_id, content="export function getMinEmi() {}")

    monkeypatch.setattr(
        "services.qa.tools.symbol_search",
        lambda *a, **k: [(chunk, 0.92)],
    )

    result = execute_tool(
        MagicMock(),
        Settings(),
        project_id=project_id,
        tool_name="search_symbols",
        args={"query": "getMinEmi"},
        repo_ids=None,
    )

    assert result.tool_name == "search_symbols"
    assert len(result.hits) == 1
    assert result.hits[0].chunk_id == chunk.id
    assert result.hits[0].scores["symbol"] == 0.92
    assert result.truncated is False
    assert result.duration_ms >= 0


def test_search_hybrid_fuses_three_legs(monkeypatch: pytest.MonkeyPatch) -> None:
    project_id = uuid.uuid4()
    chunk = _chunk(project_id=project_id)
    fused = RetrievalMatch(
        chunk=chunk,
        fused_score=0.05,
        sources=("vector", "keyword", "symbol"),
        vector_distance=0.2,
        keyword_score=0.4,
        symbol_score=0.9,
    )

    chunks_repo = MagicMock()
    chunks_repo.count_active_by_project.return_value = 100
    monkeypatch.setattr(
        "services.qa.tools.CodeChunkRepository",
        lambda session: chunks_repo,
    )
    monkeypatch.setattr(
        "services.qa.tools.EmbeddingClient",
        lambda settings: MagicMock(embed_texts=lambda texts: [[0.1] * 8]),
    )
    monkeypatch.setattr(
        "services.qa.tools.similarity_search",
        lambda *a, **k: [(chunk, 0.2)],
    )
    monkeypatch.setattr(
        "services.qa.tools.keyword_search",
        lambda *a, **k: [(chunk, 0.4)],
    )
    monkeypatch.setattr(
        "services.qa.tools.symbol_search",
        lambda *a, **k: [(chunk, 0.9)],
    )
    monkeypatch.setattr(
        "services.qa.tools.reciprocal_rank_fusion",
        lambda **kwargs: [fused],
    )

    result = execute_tool(
        MagicMock(),
        Settings(),
        project_id=project_id,
        tool_name="search_hybrid",
        args={"query": "what does getMinEmi do?"},
        repo_ids=None,
    )

    assert len(result.hits) == 1
    assert result.hits[0].scores["fused"] == 0.05
    assert result.hits[0].scores["symbol"] == 0.9


def test_graph_expand_respects_max_extra_chunks(monkeypatch: pytest.MonkeyPatch) -> None:
    project_id = uuid.uuid4()
    seed_id = uuid.uuid4()
    neighbor_a = uuid.uuid4()
    neighbor_b = uuid.uuid4()
    neighbor_c = uuid.uuid4()
    seed = MagicMock(
        id=seed_id,
        project_id=project_id,
        status=RowStatus.ACTIVE,
        file_path="client.ts",
        repo_id=uuid.uuid4(),
    )
    nodes = {
        seed_id: seed,
        neighbor_a: MagicMock(
            id=neighbor_a,
            project_id=project_id,
            status=RowStatus.ACTIVE,
            file_path="a.ts",
            repo_id=uuid.uuid4(),
            span={"startLine": 1, "endLine": 5},
        ),
        neighbor_b: MagicMock(
            id=neighbor_b,
            project_id=project_id,
            status=RowStatus.ACTIVE,
            file_path="b.ts",
            repo_id=uuid.uuid4(),
            span={"startLine": 1, "endLine": 5},
        ),
        neighbor_c: MagicMock(
            id=neighbor_c,
            project_id=project_id,
            status=RowStatus.ACTIVE,
            file_path="c.ts",
            repo_id=uuid.uuid4(),
            span={"startLine": 1, "endLine": 5},
        ),
    }

    def _chunk_for(node_id: uuid.UUID) -> MagicMock:
        node = nodes[node_id]
        return _chunk(
            project_id=project_id,
            repo_id=node.repo_id,
            file_path=node.file_path,
        )

    chunks_by_file = {
        (nodes[neighbor_a].repo_id, "a.ts"): [_chunk_for(neighbor_a)],
        (nodes[neighbor_b].repo_id, "b.ts"): [_chunk_for(neighbor_b)],
        (nodes[neighbor_c].repo_id, "c.ts"): [_chunk_for(neighbor_c)],
    }

    nodes_repo = MagicMock()
    nodes_repo.get_by_id.side_effect = lambda nid: nodes.get(nid)
    chunks_repo = MagicMock()
    chunks_repo.list_by_repo_file.side_effect = lambda repo_id, path: chunks_by_file.get(
        (repo_id, path),
        [],
    )

    monkeypatch.setattr(
        "services.qa.tools.GraphNodeRepository",
        lambda session: nodes_repo,
    )
    monkeypatch.setattr(
        "services.qa.tools.CodeChunkRepository",
        lambda session: chunks_repo,
    )
    monkeypatch.setattr(
        "services.qa.tools.expand_graph_neighbors",
        lambda *a, **k: [
            (seed_id, 0),
            (neighbor_a, 1),
            (neighbor_b, 1),
            (neighbor_c, 1),
        ],
    )

    result = execute_tool(
        MagicMock(),
        Settings(retrieval_graph_max_extra_chunks=2, qa_agent_max_tool_hits=8),
        project_id=project_id,
        tool_name="graph_expand",
        args={"node_id": str(seed_id)},
        repo_ids=None,
    )

    assert len(result.hits) == 2
    assert result.truncated is True
    assert all(hit.scores.get("graph_depth") == 1.0 for hit in result.hits)


def test_read_symbol_qualified_name_with_file(monkeypatch: pytest.MonkeyPatch) -> None:
    project_id = uuid.uuid4()
    repo_id = uuid.uuid4()
    node_id = uuid.uuid4()
    node = MagicMock(
        id=node_id,
        project_id=project_id,
        repo_id=repo_id,
        name="getMinEmi",
        file_path="src/loan.utils.ts",
        span={"startLine": 20, "endLine": 40},
        status=RowStatus.ACTIVE,
    )
    overlapping = _chunk(
        project_id=project_id,
        repo_id=repo_id,
        file_path="src/loan.utils.ts",
        span={"startLine": 22, "endLine": 35},
        content="export function getMinEmi() { return 42; }",
    )
    other = _chunk(
        project_id=project_id,
        repo_id=repo_id,
        file_path="src/loan.utils.ts",
        span={"startLine": 1, "endLine": 10},
        content="// helpers",
    )

    session = MagicMock()
    session.scalars.return_value.all.return_value = [node]
    chunks_repo = MagicMock()
    chunks_repo.list_by_repo_file.return_value = [other, overlapping]
    monkeypatch.setattr(
        "services.qa.tools.CodeChunkRepository",
        lambda _s: chunks_repo,
    )

    result = execute_tool(
        session,
        Settings(),
        project_id=project_id,
        tool_name="read_symbol",
        args={"qualified_name": "src/loan.utils.ts::getMinEmi"},
        repo_ids=None,
    )

    assert len(result.hits) == 1
    assert result.hits[0].chunk_id == overlapping.id
    assert result.hits[0].graph_node_id == node_id
    assert result.hits[0].file_path == "src/loan.utils.ts"


def test_read_chunk_rejects_other_project(monkeypatch: pytest.MonkeyPatch) -> None:
    project_id = uuid.uuid4()
    other_project = uuid.uuid4()
    chunk = _chunk(project_id=other_project)
    chunks_repo = MagicMock()
    chunks_repo.get_by_id.return_value = chunk
    monkeypatch.setattr(
        "services.qa.tools.CodeChunkRepository",
        lambda _s: chunks_repo,
    )

    result = execute_tool(
        MagicMock(),
        Settings(),
        project_id=project_id,
        tool_name="read_chunk",
        args={"chunk_id": str(chunk.id)},
        repo_ids=None,
    )

    assert result.hits == []


def test_read_chunk_returns_active_chunk_in_project(monkeypatch: pytest.MonkeyPatch) -> None:
    project_id = uuid.uuid4()
    chunk = _chunk(project_id=project_id, content="const x = 1;")
    chunks_repo = MagicMock()
    chunks_repo.get_by_id.return_value = chunk
    monkeypatch.setattr(
        "services.qa.tools.CodeChunkRepository",
        lambda _s: chunks_repo,
    )

    result = execute_tool(
        MagicMock(),
        Settings(),
        project_id=project_id,
        tool_name="read_chunk",
        args={"chunk_id": str(chunk.id)},
        repo_ids=None,
    )

    assert len(result.hits) == 1
    assert result.hits[0].chunk_id == chunk.id
    assert "const x" in result.hits[0].excerpt


def test_tool_results_respect_max_hits(monkeypatch: pytest.MonkeyPatch) -> None:
    project_id = uuid.uuid4()
    pairs = [(_chunk(project_id=project_id), 0.9 - i * 0.01) for i in range(12)]

    def _fake_symbol_search(*_a, **kwargs):
        limit = kwargs.get("limit", 12)
        return pairs[:limit]

    monkeypatch.setattr(
        "services.qa.tools.symbol_search",
        _fake_symbol_search,
    )

    result = execute_tool(
        MagicMock(),
        Settings(qa_agent_max_tool_hits=3),
        project_id=project_id,
        tool_name="search_symbols",
        args={"query": "emi"},
        repo_ids=None,
    )

    assert len(result.hits) <= 3
    assert result.truncated is True


def test_excerpt_truncation(monkeypatch: pytest.MonkeyPatch) -> None:
    project_id = uuid.uuid4()
    long_content = "word " * 2000
    chunk = _chunk(project_id=project_id, content=long_content)
    chunks_repo = MagicMock()
    chunks_repo.get_by_id.return_value = chunk
    monkeypatch.setattr(
        "services.qa.tools.CodeChunkRepository",
        lambda _s: chunks_repo,
    )

    result = execute_tool(
        MagicMock(),
        Settings(qa_agent_max_excerpt_tokens=8),
        project_id=project_id,
        tool_name="read_chunk",
        args={"chunk_id": str(chunk.id)},
        repo_ids=None,
    )

    assert len(result.hits) == 1
    assert len(result.hits[0].excerpt) < len(long_content)


def test_search_code_and_vectors(monkeypatch: pytest.MonkeyPatch) -> None:
    project_id = uuid.uuid4()
    chunk = _chunk(project_id=project_id)

    monkeypatch.setattr(
        "services.qa.tools.keyword_search",
        lambda *a, **k: [(chunk, 0.55)],
    )
    monkeypatch.setattr(
        "services.qa.tools.EmbeddingClient",
        lambda settings: MagicMock(embed_texts=lambda texts: [[0.2] * 4]),
    )
    monkeypatch.setattr(
        "services.qa.tools.similarity_search",
        lambda *a, **k: [(chunk, 0.15)],
    )

    code_result = execute_tool(
        MagicMock(),
        Settings(),
        project_id=project_id,
        tool_name="search_code",
        args={"query": "how does getMinEmi calculate EMI?"},
        repo_ids=None,
    )
    vector_result = execute_tool(
        MagicMock(),
        Settings(),
        project_id=project_id,
        tool_name="search_vectors",
        args={"query": "EMI calculation"},
        repo_ids=None,
    )

    assert code_result.hits[0].scores["keyword"] == 0.55
    assert vector_result.hits[0].scores["vector_distance"] == 0.15


def test_read_chunk_rejects_soft_deleted(monkeypatch: pytest.MonkeyPatch) -> None:
    project_id = uuid.uuid4()
    chunk = _chunk(project_id=project_id, status=RowStatus.DELETED)
    chunks_repo = MagicMock()
    chunks_repo.get_by_id.return_value = chunk
    monkeypatch.setattr(
        "services.qa.tools.CodeChunkRepository",
        lambda _s: chunks_repo,
    )

    result = execute_tool(
        MagicMock(),
        Settings(),
        project_id=project_id,
        tool_name="read_chunk",
        args={"chunk_id": str(chunk.id)},
        repo_ids=None,
    )
    assert result.hits == []


def test_graph_expand_rejects_foreign_seed(monkeypatch: pytest.MonkeyPatch) -> None:
    project_id = uuid.uuid4()
    seed_id = uuid.uuid4()
    seed = MagicMock(
        id=seed_id,
        project_id=uuid.uuid4(),
        status=RowStatus.ACTIVE,
    )
    nodes_repo = MagicMock()
    nodes_repo.get_by_id.return_value = seed
    monkeypatch.setattr(
        "services.qa.tools.GraphNodeRepository",
        lambda session: nodes_repo,
    )

    result = execute_tool(
        MagicMock(),
        Settings(),
        project_id=project_id,
        tool_name="graph_expand",
        args={"node_id": str(seed_id)},
        repo_ids=None,
    )
    assert result.hits == []


def test_missing_required_arg_raises() -> None:
    with pytest.raises(ValueError, match="query"):
        execute_tool(
            MagicMock(),
            Settings(),
            project_id=uuid.uuid4(),
            tool_name="search_symbols",
            args={},
            repo_ids=None,
        )
