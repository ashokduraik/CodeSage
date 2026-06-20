"""Repository public surface grouped by table domain."""

from py_core.db.repositories.identity import UserRepository
from py_core.db.repositories.indexing import (
    CodeChunkRepository,
    GraphEdgeRepository,
    GraphNodeRepository,
)
from py_core.db.repositories.operations import AuditLogRepository, JobRepository
from py_core.db.repositories.projects import ProjectRepository, RepoRepository

__all__ = [
    "AuditLogRepository",
    "CodeChunkRepository",
    "GraphEdgeRepository",
    "GraphNodeRepository",
    "JobRepository",
    "ProjectRepository",
    "RepoRepository",
    "UserRepository",
]
