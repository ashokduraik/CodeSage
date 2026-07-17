"""Deterministic ORM seed data for agent-QA regression tests.

The fixture mirrors indexed snapshots without cloning a Git repository. Unit tests
consume the records in memory; PostgreSQL integration tests may persist the same
objects with :func:`seed_agent_qa_session`.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy.orm import Session

from config import DEFAULT_EMBEDDING_DIMENSION
from models import CodeChunk, GraphEdge, GraphNode, Project, Repo
from models.enums import (
    ProjectStatus,
    RepoConnectionStatus,
    RepoProvider,
    RowStatus,
)
from services.qa.tools import QaToolHit

_FIXTURE_ROOT = Path(__file__).parent / "agent_qa_repo"
_NAMESPACE = uuid.UUID("9f43c693-22f4-48b0-9e18-966bc8c44da2")


def _id(name: str) -> uuid.UUID:
    """Return a stable UUID for one fixture record.

    @param name - Human-readable record key.
    @returns A deterministic UUID scoped to the agent-QA fixture.
    """
    return uuid.uuid5(_NAMESPACE, name)


def _read_source(relative_path: str) -> str:
    """Read one committed fixture source file.

    @param relative_path - Path relative to ``agent_qa_repo``.
    @returns UTF-8 source text used as indexed chunk content.
    @raises FileNotFoundError - When fixture files and seed definitions drift.
    """
    return (_FIXTURE_ROOT / relative_path).read_text(encoding="utf-8")


def _embedding(position: int) -> list[float]:
    """Build a deterministic vector with the configured pgvector width.

    @param position - Index receiving the non-zero marker.
    @returns Stable fake embedding suitable for test database inserts.
    """
    values = [0.0] * DEFAULT_EMBEDDING_DIMENSION
    values[position % DEFAULT_EMBEDDING_DIMENSION] = 1.0
    return values


@dataclass(frozen=True)
class AgentQaSeed:
    """Complete indexed snapshot for the golden agent-QA questions.

    @param project - Project owning both fixture repositories.
    @param repos - Frontend/service repositories used for cross-repo traversal.
    @param chunks - One indexed chunk per fixture source file.
    @param nodes - Symbol and route graph nodes.
    @param edges - Cross-repo ``http_call`` graph edge.
    """

    project: Project
    repos: tuple[Repo, ...]
    chunks: tuple[CodeChunk, ...]
    nodes: tuple[GraphNode, ...]
    edges: tuple[GraphEdge, ...]

    def chunk_for_path(self, file_path: str) -> CodeChunk:
        """Return the fixture chunk with the requested repository-relative path.

        @param file_path - Exact indexed path.
        @returns Matching code chunk.
        @raises KeyError - When the fixture has no such path.
        """
        for chunk in self.chunks:
            if chunk.file_path == file_path:
                return chunk
        raise KeyError(file_path)

    def node_for_name(self, name: str) -> GraphNode:
        """Return a graph node by exact symbol or route name.

        @param name - Exact graph node name.
        @returns Matching graph node.
        @raises KeyError - When the fixture has no such node.
        """
        for node in self.nodes:
            if node.name == name:
                return node
        raise KeyError(name)

    def hit_for_path(
        self,
        file_path: str,
        *,
        scores: dict[str, float | None],
        graph_node_name: str | None = None,
        excerpt: str | None = None,
    ) -> QaToolHit:
        """Convert one fixture chunk into the stable QA tool-result shape.

        @param file_path - Exact indexed path.
        @param scores - Retrieval signals for confidence evaluation.
        @param graph_node_name - Optional node furnishing graph provenance.
        @param excerpt - Optional excerpt override (defaults to full chunk content).
        @returns Tool hit ready for an evidence pool.
        """
        chunk = self.chunk_for_path(file_path)
        node = self.node_for_name(graph_node_name) if graph_node_name else None
        refs = list(chunk.symbol_refs or [])
        return QaToolHit(
            chunk_id=chunk.id,
            repo_id=chunk.repo_id,
            file_path=chunk.file_path,
            span=chunk.span,
            excerpt=excerpt if excerpt is not None else chunk.content,
            scores=scores,
            graph_node_id=node.id if node else None,
            symbol_refs=refs,
        )

    def records(self) -> list[object]:
        """Return ORM records in logical parent-before-child order.

        @returns All project, repository, chunk, node, and edge records.
        """
        return [
            self.project,
            *self.repos,
            *self.chunks,
            *self.nodes,
            *self.edges,
        ]


def build_agent_qa_seed(*, actor_id: uuid.UUID | None = None) -> AgentQaSeed:
    """Build the deterministic golden repository snapshot in memory.

    The returned records include active row status, fixed IDs, fake embeddings,
    symbol references, and a cross-repo HTTP edge. Callers may use them directly
    in unit mocks or insert them into PostgreSQL.

    @param actor_id - Existing user ID for audit foreign keys.
    @returns Fully linked fixture records.
    """
    actor = actor_id or _id("actor")
    project_id = _id("project")
    app_repo_id = _id("repo:loan-app")
    rates_repo_id = _id("repo:rates-service")

    project = Project(
        id=project_id,
        name="Agent QA Golden Loans",
        lifecycle_status=ProjectStatus.INDEXED,
        status=RowStatus.ACTIVE,
        created_by=actor,
        updated_by=actor,
    )
    repos = (
        Repo(
            id=app_repo_id,
            project_id=project_id,
            repo_url="https://example.invalid/codesage/loan-app.git",
            provider=RepoProvider.GITHUB,
            branch="main",
            full_name="codesage/loan-app",
            primary_language="TypeScript",
            connection_status=RepoConnectionStatus.CONNECTED.value,
            status=RowStatus.ACTIVE,
            created_by=actor,
            updated_by=actor,
        ),
        Repo(
            id=rates_repo_id,
            project_id=project_id,
            repo_url="https://example.invalid/codesage/rates-service.git",
            provider=RepoProvider.GITHUB,
            branch="main",
            full_name="codesage/rates-service",
            primary_language="TypeScript",
            connection_status=RepoConnectionStatus.CONNECTED.value,
            status=RowStatus.ACTIVE,
            created_by=actor,
            updated_by=actor,
        ),
    )

    chunk_specs = (
        (
            app_repo_id,
            "src/loan.utils.ts",
            "src/loan.utils.ts",
            {"startLine": 1, "endLine": 48},
            [
                {"kind": "function", "name": "getMinEmi", "startLine": 9},
                {"kind": "function", "name": "calculateEmi", "startLine": 25},
                {"kind": "function", "name": "getEMIAmount", "startLine": 43},
            ],
        ),
        (
            app_repo_id,
            "src/emi-calculator.module.ts",
            "src/emi-calculator.module.ts",
            {"startLine": 1, "endLine": 1},
            [],
        ),
        (
            app_repo_id,
            "src/api/loan.routes.ts",
            "src/api/loan.routes.ts",
            {"startLine": 1, "endLine": 12},
            [{"kind": "route", "name": "POST /loans/calculate"}],
        ),
        (
            app_repo_id,
            "src/services/loan.service.ts",
            "src/services/loan.service.ts",
            {"startLine": 1, "endLine": 27},
            [
                {"kind": "class", "name": "LoanService"},
                {"kind": "method", "name": "LoanService.doCalc"},
            ],
        ),
        (
            app_repo_id,
            "src/services/user.service.ts",
            "src/services/user.service.ts",
            {"startLine": 1, "endLine": 14},
            [
                {"kind": "class", "name": "UserService"},
                {"kind": "method", "name": "UserService.displayName"},
            ],
        ),
        (
            rates_repo_id,
            "src/rates.controller.ts",
            "backend/src/rates.controller.ts",
            {"startLine": 1, "endLine": 9},
            [{"kind": "route", "name": "GET /internal/rates/current"}],
        ),
    )
    chunks = tuple(
        CodeChunk(
            id=_id(f"chunk:{file_path}"),
            project_id=project_id,
            repo_id=repo_id,
            file_path=file_path,
            span=span,
            content=_read_source(source_path),
            embedding=_embedding(index),
            symbol_refs=symbol_refs,
            status=RowStatus.ACTIVE,
            created_by=actor,
            updated_by=actor,
        )
        for index, (repo_id, file_path, source_path, span, symbol_refs) in enumerate(
            chunk_specs
        )
    )

    node_specs = (
        (app_repo_id, "function", "getMinEmi", "src/loan.utils.ts", 8, 15),
        (app_repo_id, "function", "calculateEmi", "src/loan.utils.ts", 24, 35),
        (app_repo_id, "function", "getEMIAmount", "src/loan.utils.ts", 43, 48),
        (
            app_repo_id,
            "method",
            "LoanService.doCalc",
            "src/services/loan.service.ts",
            17,
            26,
        ),
        (
            app_repo_id,
            "class",
            "UserService",
            "src/services/user.service.ts",
            2,
            14,
        ),
        (
            rates_repo_id,
            "route",
            "GET /internal/rates/current",
            "src/rates.controller.ts",
            5,
            7,
        ),
    )
    nodes = tuple(
        GraphNode(
            id=_id(f"node:{name}"),
            project_id=project_id,
            repo_id=repo_id,
            kind=kind,
            name=name,
            file_path=file_path,
            span={"startLine": start_line, "endLine": end_line},
            status=RowStatus.ACTIVE,
            created_by=actor,
            updated_by=actor,
        )
        for repo_id, kind, name, file_path, start_line, end_line in node_specs
    )
    edge = GraphEdge(
        id=_id("edge:loan-service-to-rates"),
        project_id=project_id,
        src_id=_id("node:LoanService.doCalc"),
        dst_id=_id("node:GET /internal/rates/current"),
        kind="http_call",
        status=RowStatus.ACTIVE,
        created_by=actor,
        updated_by=actor,
    )
    return AgentQaSeed(
        project=project,
        repos=repos,
        chunks=chunks,
        nodes=nodes,
        edges=(edge,),
    )


def seed_agent_qa_session(session: Session, seed: AgentQaSeed) -> None:
    """Insert a golden agent-QA snapshot into an integration-test session.

    The caller owns transaction rollback/commit so the same helper works with
    savepoint-based fixtures and disposable test databases.

    @param session - SQLAlchemy session connected to a migrated test database.
    @param seed - Records produced by :func:`build_agent_qa_seed`.
    @returns None.
    """
    session.add_all(seed.records())
    session.flush()
