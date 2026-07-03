"""Graph node/edge extraction during parse (Phase 1)."""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from sqlalchemy.orm import Session

from models import GraphEdge, GraphNode
from repositories import GraphEdgeRepository, GraphNodeRepository
from services.parsing.tree_sitter_parser import SymbolSpan, extract_symbol_spans


@dataclass(frozen=True)
class FileGraphResult:
    """Counts of graph rows written for one file."""

    node_count: int
    edge_count: int


def persist_file_graph(
    session: Session,
    *,
    project_id: uuid.UUID,
    repo_id: uuid.UUID,
    file_path: str,
    content: str,
) -> FileGraphResult:
    """Replace graph nodes/edges for a file with freshly extracted symbols.

    @param session - Active SQLAlchemy session.
    @param project_id - Owning project UUID.
    @param repo_id - Source repo UUID.
    @param file_path - Relative path within the repo.
    @param content - Full file text.
    @returns Counts of nodes and edges persisted.
    """
    nodes_repo = GraphNodeRepository(session)

    nodes_repo.delete_by_repo_file(repo_id, file_path)

    file_node = nodes_repo.add(
        GraphNode(
            project_id=project_id,
            repo_id=repo_id,
            kind="file",
            name=file_path,
            file_path=file_path,
            span=None,
        ),
    )

    edges_repo = GraphEdgeRepository(session)
    symbols = extract_symbol_spans(content, file_path)
    edge_count = 0
    for symbol in symbols:
        symbol_node = nodes_repo.add(_symbol_to_node(project_id, repo_id, file_path, symbol))
        edges_repo.add(
            GraphEdge(
                project_id=project_id,
                src_id=file_node.id,
                dst_id=symbol_node.id,
                kind="contains",
            ),
        )
        edge_count += 1

    return FileGraphResult(node_count=1 + len(symbols), edge_count=edge_count)


def _symbol_to_node(
    project_id: uuid.UUID,
    repo_id: uuid.UUID,
    file_path: str,
    symbol: SymbolSpan,
) -> GraphNode:
    """Build a GraphNode ORM instance from an extracted symbol span."""
    return GraphNode(
        project_id=project_id,
        repo_id=repo_id,
        kind=symbol.kind,
        name=symbol.name,
        file_path=file_path,
        span={"startLine": symbol.start_line, "endLine": symbol.end_line},
    )
