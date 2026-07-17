"""PostgreSQL persistence — repositories, session, and query helpers.

All datastore access goes through this module's public surface. ORM definitions live in `models/`.
Business orchestration belongs in `services/`.
"""

from models.base import Base
from models.enums import (
    JobStatus,
    ProjectStatus,
    RepoConnectionStatus,
    RepoProvider,
    UserRole,
)
from models import (
    AuditLog,
    CodeChunk,
    DataFlow,
    GraphEdge,
    GraphNode,
    Job,
    PageMap,
    PermissionRule,
    Project,
    QaPlaybook,
    Repo,
    User,
    Workflow,
)
from repositories.graph_queries import build_neighbor_expansion_query, expand_graph_neighbors
from repositories.identity import UserRepository
from repositories.indexing import (
    CodeChunkRepository,
    GraphEdgeRepository,
    GraphNodeRepository,
)
from repositories.derived_knowledge import (
    DataFlowRepository,
    DerivedKnowledgeRepository,
    PageMapRepository,
    PermissionRuleRepository,
    WorkflowRepository,
)
from repositories.keyword import build_keyword_query, keyword_search
from repositories.operations import AuditLogRepository, JobRepository
from repositories.projects import ProjectRepository, RepoRepository
from repositories.session import create_engine_from_settings, create_session_factory, session_scope
from repositories.symbols import build_symbol_query, symbol_search
from repositories.qa_playbooks import QaPlaybookRepository
from repositories.vector import build_similarity_query, similarity_search

__all__ = [
    "AuditLog",
    "AuditLogRepository",
    "Base",
    "CodeChunk",
    "CodeChunkRepository",
    "DataFlow",
    "DataFlowRepository",
    "DerivedKnowledgeRepository",
    "GraphEdge",
    "GraphEdgeRepository",
    "GraphNode",
    "GraphNodeRepository",
    "Job",
    "JobRepository",
    "JobStatus",
    "Project",
    "ProjectRepository",
    "PageMap",
    "PageMapRepository",
    "PermissionRule",
    "PermissionRuleRepository",
    "ProjectStatus",
    "QaPlaybook",
    "QaPlaybookRepository",
    "Repo",
    "RepoConnectionStatus",
    "RepoProvider",
    "RepoRepository",
    "User",
    "UserRepository",
    "Workflow",
    "WorkflowRepository",
    "build_keyword_query",
    "build_neighbor_expansion_query",
    "build_similarity_query",
    "build_symbol_query",
    "create_engine_from_settings",
    "create_session_factory",
    "expand_graph_neighbors",
    "keyword_search",
    "session_scope",
    "similarity_search",
    "symbol_search",
]
