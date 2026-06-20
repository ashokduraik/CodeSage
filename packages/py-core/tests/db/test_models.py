"""Tests for ORM model metadata."""

from py_core.db.base import Base
from py_core.db.models import (
    AuditLog,
    CodeChunk,
    GraphEdge,
    GraphNode,
    Job,
    Project,
    Repo,
    User,
)


def test_all_models_registered_on_base() -> None:
    expected = {
        "users",
        "projects",
        "repos",
        "jobs",
        "audit_log",
        "graph_nodes",
        "graph_edges",
        "code_chunks",
    }
    assert expected.issubset(Base.metadata.tables.keys())


def test_model_tablename_aliases() -> None:
    assert User.__tablename__ == "users"
    assert Project.__tablename__ == "projects"
    assert Repo.__tablename__ == "repos"
    assert Job.__tablename__ == "jobs"
    assert AuditLog.__tablename__ == "audit_log"
    assert GraphNode.__tablename__ == "graph_nodes"
    assert GraphEdge.__tablename__ == "graph_edges"
    assert CodeChunk.__tablename__ == "code_chunks"
