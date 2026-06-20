"""PostgreSQL persistence layer — models, repositories, and query helpers.

All Python services access the single datastore through this module's public surface.
"""

from py_core.db.base import Base
from py_core.db.enums import (
    JobStatus,
    ProjectStatus,
    RepoProvider,
    RepoRole,
    UserRole,
)
from py_core.db.graph_queries import build_neighbor_expansion_query, expand_graph_neighbors
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
from py_core.db.repositories import (
    AuditLogRepository,
    CodeChunkRepository,
    GraphEdgeRepository,
    GraphNodeRepository,
    JobRepository,
    ProjectRepository,
    RepoRepository,
    UserRepository,
)
from py_core.db.session import create_engine_from_settings, create_session_factory, session_scope
from py_core.db.vector import build_similarity_query, similarity_search

__all__ = [
    "AuditLog",
    "AuditLogRepository",
    "Base",
    "CodeChunk",
    "CodeChunkRepository",
    "GraphEdge",
    "GraphEdgeRepository",
    "GraphNode",
    "GraphNodeRepository",
    "Job",
    "JobRepository",
    "JobStatus",
    "Project",
    "ProjectRepository",
    "ProjectStatus",
    "Repo",
    "RepoProvider",
    "RepoRepository",
    "RepoRole",
    "User",
    "UserRepository",
    "UserRole",
    "build_neighbor_expansion_query",
    "build_similarity_query",
    "create_engine_from_settings",
    "create_session_factory",
    "expand_graph_neighbors",
    "session_scope",
    "similarity_search",
]
