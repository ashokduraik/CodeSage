"""Repositories for graph and vector chunk tables."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from models import CodeChunk, GraphEdge, GraphNode


class GraphNodeRepository:
    """Data access for `graph_nodes`."""

    def __init__(self, session: Session) -> None:
        """Bind the repository to an open SQLAlchemy session.

        @param session - Active ORM session.
        """
        self._session = session

    def get_by_id(self, node_id: uuid.UUID) -> GraphNode | None:
        """Fetch a graph node by primary key.

        @param node_id - Node UUID.
        @returns The node row or `None`.
        """
        return self._session.get(GraphNode, node_id)

    def list_by_repo(self, repo_id: uuid.UUID) -> list[GraphNode]:
        """List all nodes for a repository.

        @param repo_id - Repo UUID.
        @returns Node rows.
        """
        stmt = select(GraphNode).where(GraphNode.repo_id == repo_id)
        return list(self._session.scalars(stmt))

    def add(self, node: GraphNode) -> GraphNode:
        """Persist a new graph node.

        @param node - Unsaved node instance.
        @returns The flushed node with generated id.
        """
        self._session.add(node)
        self._session.flush()
        return node

    def delete_by_repo_file(self, repo_id: uuid.UUID, file_path: str) -> int:
        """Remove all nodes for a file (incremental re-index cleanup).

        @param repo_id - Repo UUID.
        @param file_path - Relative file path within the repo.
        @returns Number of rows deleted.
        """
        stmt = delete(GraphNode).where(
            GraphNode.repo_id == repo_id,
            GraphNode.file_path == file_path,
        )
        result = self._session.execute(stmt)
        return result.rowcount


class GraphEdgeRepository:
    """Data access for `graph_edges`."""

    def __init__(self, session: Session) -> None:
        """Bind the repository to an open SQLAlchemy session.

        @param session - Active ORM session.
        """
        self._session = session

    def list_by_project(self, project_id: uuid.UUID) -> list[GraphEdge]:
        """List all edges scoped to a project.

        @param project_id - Project UUID.
        @returns Edge rows.
        """
        stmt = select(GraphEdge).where(GraphEdge.project_id == project_id)
        return list(self._session.scalars(stmt))

    def list_by_src(self, src_id: uuid.UUID) -> list[GraphEdge]:
        """List outgoing edges from a source node.

        @param src_id - Source node UUID.
        @returns Edge rows.
        """
        stmt = select(GraphEdge).where(GraphEdge.src_id == src_id)
        return list(self._session.scalars(stmt))

    def add(self, edge: GraphEdge) -> GraphEdge:
        """Persist a new graph edge.

        @param edge - Unsaved edge instance.
        @returns The flushed edge with generated id.
        """
        self._session.add(edge)
        self._session.flush()
        return edge

    def delete_by_repo_nodes(self, repo_id: uuid.UUID) -> int:
        """Remove edges whose source or destination nodes belong to a repo.

        Used before deleting nodes for a file/repo during incremental re-index.

        @param repo_id - Repo UUID.
        @returns Number of rows deleted.
        """
        node_ids = select(GraphNode.id).where(GraphNode.repo_id == repo_id).scalar_subquery()
        stmt = delete(GraphEdge).where(
            GraphEdge.src_id.in_(node_ids) | GraphEdge.dst_id.in_(node_ids),
        )
        result = self._session.execute(stmt)
        return result.rowcount


class CodeChunkRepository:
    """Data access for `code_chunks`."""

    def __init__(self, session: Session) -> None:
        """Bind the repository to an open SQLAlchemy session.

        @param session - Active ORM session.
        """
        self._session = session

    def get_by_id(self, chunk_id: uuid.UUID) -> CodeChunk | None:
        """Fetch a chunk by primary key.

        @param chunk_id - Chunk UUID.
        @returns The chunk row or `None`.
        """
        return self._session.get(CodeChunk, chunk_id)

    def list_by_repo(self, repo_id: uuid.UUID) -> list[CodeChunk]:
        """List all chunks for a repository.

        @param repo_id - Repo UUID.
        @returns Chunk rows.
        """
        stmt = select(CodeChunk).where(CodeChunk.repo_id == repo_id)
        return list(self._session.scalars(stmt))

    def list_unembedded(self, repo_id: uuid.UUID, limit: int = 100) -> list[CodeChunk]:
        """Return chunks that still need embedding for a repo.

        @param repo_id - Repo UUID.
        @param limit - Maximum rows to return.
        @returns Chunks with a null embedding column.
        """
        stmt = (
            select(CodeChunk)
            .where(CodeChunk.repo_id == repo_id, CodeChunk.embedding.is_(None))
            .limit(limit)
        )
        return list(self._session.scalars(stmt))

    def add(
        self,
        *,
        project_id: uuid.UUID,
        repo_id: uuid.UUID,
        file_path: str,
        span: dict[str, Any],
        content: str,
        symbol_refs: list[Any] | None = None,
    ) -> CodeChunk:
        """Insert a new code chunk row.

        @param project_id - Owning project UUID.
        @param repo_id - Source repo UUID.
        @param file_path - Relative path within the repo.
        @param span - Source span metadata (JSON-serializable).
        @param content - Chunk source text.
        @param symbol_refs - Optional symbol reference list.
        @returns The persisted chunk (flushed, not committed).
        """
        chunk = CodeChunk(
            project_id=project_id,
            repo_id=repo_id,
            file_path=file_path,
            span=span,
            content=content,
            symbol_refs=symbol_refs or [],
        )
        self._session.add(chunk)
        self._session.flush()
        return chunk

    def update_embedding(self, chunk_id: uuid.UUID, embedding: list[float]) -> CodeChunk | None:
        """Set the vector embedding for a chunk.

        @param chunk_id - Chunk UUID.
        @param embedding - Float vector matching `embedding_dimension`.
        @returns Updated chunk or `None` if not found.
        """
        chunk = self.get_by_id(chunk_id)
        if chunk is None:
            return None
        chunk.embedding = embedding
        self._session.flush()
        return chunk

    def delete_by_repo_file(self, repo_id: uuid.UUID, file_path: str) -> int:
        """Remove all chunks for a file (incremental re-index cleanup).

        @param repo_id - Repo UUID.
        @param file_path - Relative file path within the repo.
        @returns Number of rows deleted.
        """
        stmt = delete(CodeChunk).where(
            CodeChunk.repo_id == repo_id,
            CodeChunk.file_path == file_path,
        )
        result = self._session.execute(stmt)
        return result.rowcount
