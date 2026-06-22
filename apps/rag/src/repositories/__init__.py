"""PostgreSQL persistence — repositories, session, and query helpers.

All datastore access goes through this module's public surface. ORM definitions live in `models/`.
Business orchestration belongs in `services/`.
"""

from models.base import Base
from models.enums import (
    JobStatus,
    ProjectStatus,
    RepoProvider,
    RepoRole,
    UserRole,
)
from models import (
    AuditLog,
    CodeChunk,
    GraphEdge,
    GraphNode,
    Job,
    Project,
    Repo,
    User,
)
from repositories.graph_queries import build_neighbor_expansion_query, expand_graph_neighbors
from repositories.identity import UserRepository
from repositories.indexing import (
    CodeChunkRepository,
    GraphEdgeRepository,
    GraphNodeRepository,
)
from repositories.operations import AuditLogRepository, JobRepository
from repositories.projects import ProjectRepository, RepoRepository
from repositories.session import create_engine_from_settings, create_session_factory, session_scope
from repositories.vector import build_similarity_query, similarity_search

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
