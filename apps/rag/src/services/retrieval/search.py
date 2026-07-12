"""Hybrid retrieval over code_chunks for developer QA."""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from sqlalchemy.orm import Session

from config import Settings
from repositories import (
    CodeChunkRepository,
    ProjectRepository,
    keyword_search,
    similarity_search,
    symbol_search,
)
from services.embedding.tei_client import EmbeddingClient
from services.retrieval.adaptive_top_k import ProjectSizeTier, resolve_project_tier, resolve_top_k
from services.retrieval.fusion import reciprocal_rank_fusion
from services.retrieval.graph_expand import augment_matches_with_graph
from services.retrieval.hybrid_confidence import compute_hybrid_confidence, has_hard_vector_fail
from services.retrieval.prune import prune_matches
from services.retrieval.query_intent import QueryIntentProfile, classify_query_intent, resolve_rrf_weights
from services.retrieval.query_terms import extract_search_terms
from services.retrieval.rerank import rerank_matches, select_rerank_candidates
from services.retrieval.types import RetrievalMatch


@dataclass(frozen=True)
class RetrievalContext:
    """Metadata from one retrieval pass for logging and confidence."""

    intent: QueryIntentProfile
    tier: ProjectSizeTier
    terms: list[str]
    hybrid_confidence: float | None = None
    reranker_applied: bool = False


def retrieve_code_chunks(
    session: Session,
    settings: Settings,
    *,
    project_id: uuid.UUID,
    question: str,
    repo_ids: list[uuid.UUID] | None = None,
) -> tuple[list[RetrievalMatch], RetrievalContext]:
    """Run hybrid retrieval and return pruned ranked code chunks.

    Executes vector, keyword (``pg_trgm``), and symbol search with intent-aware
    weights and adaptive top-k, fuses with RRF, graph-expands, then prunes.

    @param session - Active SQLAlchemy session.
    @param settings - Application settings.
    @param project_id - Project scope.
    @param question - User question text.
    @param repo_ids - Optional repo filter.
    @returns Tuple of pruned matches and retrieval metadata.
    @raises ValueError when the project does not exist.
    """
    project = ProjectRepository(session).get_by_id(project_id)
    if project is None:
        raise ValueError(f"Project not found: {project_id}")

    terms = extract_search_terms(question)
    intent = classify_query_intent(question, terms)

    chunk_count = CodeChunkRepository(session).count_active_by_project(
        project_id,
        repo_ids=repo_ids,
    )
    tier = resolve_project_tier(chunk_count, settings)
    top_k = resolve_top_k(tier, settings)
    symbol_weight, keyword_weight, vector_weight = resolve_rrf_weights(intent, settings)

    client = EmbeddingClient(settings)
    query_vector = client.embed_texts([question])[0]
    vector_hits = similarity_search(
        session,
        project_id=project_id,
        query_embedding=query_vector,
        limit=top_k["vector"],
        repo_ids=repo_ids,
    )
    keyword_hits = keyword_search(
        session,
        project_id=project_id,
        terms=terms,
        limit=top_k["keyword"],
        repo_ids=repo_ids,
        min_similarity=settings.retrieval_keyword_min_similarity,
    )
    symbol_hits = symbol_search(
        session,
        project_id=project_id,
        terms=terms,
        limit=top_k["symbol"],
        repo_ids=repo_ids,
        min_similarity=settings.retrieval_symbol_min_similarity,
    )

    fused = reciprocal_rank_fusion(
        vector_hits=vector_hits,
        keyword_hits=keyword_hits,
        symbol_hits=symbol_hits,
        rrf_k=settings.retrieval_rrf_k,
        vector_weight=vector_weight,
        keyword_weight=keyword_weight,
        symbol_weight=symbol_weight,
        limit=settings.retrieval_fused_top_k,
    )

    expanded = augment_matches_with_graph(
        session,
        settings,
        project_id=project_id,
        matches=fused,
    )

    reranker_applied = False
    if settings.retrieval_reranker_enabled and settings.retrieval_reranker_base_url.strip():
        candidates = select_rerank_candidates(expanded, settings, intent=intent)
        outcome = rerank_matches(question, candidates, settings)
        if outcome.applied:
            pruned = outcome.matches[: settings.retrieval_reranker_output_k]
            reranker_applied = True
        else:
            pruned = prune_matches(
                expanded,
                limit=settings.retrieval_context_top_k,
                intent=intent,
            )
    else:
        pruned = prune_matches(
            expanded,
            limit=settings.retrieval_context_top_k,
            intent=intent,
        )

    context = RetrievalContext(
        intent=intent,
        tier=tier,
        terms=terms,
        reranker_applied=reranker_applied,
    )
    return pruned, context


def is_confident_match(
    settings: Settings,
    matches: list[RetrievalMatch],
    *,
    question: str,
    context: RetrievalContext | None = None,
) -> bool:
    """Return True when hybrid retrieval confidence is high enough to answer.

    Uses composite hybrid confidence plus a hard vector-only fail guard.

    @param settings - Application settings.
    @param matches - Pruned retrieval results, best first.
    @param question - User question (for term extraction when context absent).
    @param context - Optional precomputed retrieval metadata.
    """
    if not matches:
        return False

    if context is None:
        terms = extract_search_terms(question)
        intent = classify_query_intent(question, terms)
    else:
        terms = context.terms
        intent = context.intent

    if has_hard_vector_fail(matches, settings):
        return False

    score = compute_hybrid_confidence(
        matches,
        settings,
        intent=intent,
        terms=terms,
    )
    return score >= settings.retrieval_min_confidence
