"""Vector retrieval over code_chunks for developer QA."""

from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from config import Settings
from models import CodeChunk
from repositories import ProjectRepository, similarity_search
from services.embedding.tei_client import EmbeddingClient


def retrieve_code_chunks(
    session: Session,
    settings: Settings,
    *,
    project_id: uuid.UUID,
    question: str,
    repo_ids: list[uuid.UUID] | None = None,
) -> list[tuple[CodeChunk, float]]:
    """Embed the question and return the nearest code chunks by cosine distance.

    @param session - Active SQLAlchemy session.
    @param settings - Application settings.
    @param project_id - Project scope.
    @param question - User question text.
    @param repo_ids - Optional repo filter.
    @returns Ranked `(chunk, distance)` pairs (lower distance = better match).
    @raises ValueError when the project does not exist.
    """
    project = ProjectRepository(session).get_by_id(project_id)
    if project is None:
        raise ValueError(f"Project not found: {project_id}")

    client = EmbeddingClient(settings)
    query_vector = client.embed_texts([question])[0]
    return similarity_search(
        session,
        project_id=project_id,
        query_embedding=query_vector,
        limit=settings.retrieval_top_k,
        repo_ids=repo_ids,
    )


def is_confident_match(settings: Settings, matches: list[tuple[CodeChunk, float]]) -> bool:
    """Return True when the best retrieval score meets the abstain threshold.

    @param settings - Application settings.
    @param matches - Retrieval results ordered by ascending distance.
    """
    if not matches:
        return False
    best_distance = matches[0][1]
    return best_distance <= settings.retrieval_max_distance
