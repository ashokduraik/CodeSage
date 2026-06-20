"""Tests for py_core.db public exports."""

import py_core.db as db


def test_public_exports() -> None:
    names = {
        "Base",
        "User",
        "Project",
        "Repo",
        "Job",
        "AuditLog",
        "GraphNode",
        "GraphEdge",
        "CodeChunk",
        "UserRepository",
        "ProjectRepository",
        "RepoRepository",
        "JobRepository",
        "AuditLogRepository",
        "GraphNodeRepository",
        "GraphEdgeRepository",
        "CodeChunkRepository",
        "create_engine_from_settings",
        "create_session_factory",
        "session_scope",
        "build_similarity_query",
        "similarity_search",
        "build_neighbor_expansion_query",
        "expand_graph_neighbors",
    }
    assert names.issubset(set(db.__all__))
