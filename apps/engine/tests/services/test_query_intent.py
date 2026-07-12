"""Tests for query intent classification and RRF weight resolution."""

from config import Settings
from services.retrieval.query_intent import (
    QueryIntentProfile,
    classify_query_intent,
    resolve_rrf_weights,
)
from services.retrieval.query_terms import extract_search_terms


def test_classify_symbol_lookup_for_identifier_question() -> None:
    question = "what does getMinEmi do?"
    terms = extract_search_terms(question)
    assert classify_query_intent(question, terms) == QueryIntentProfile.SYMBOL_LOOKUP


def test_classify_symbol_lookup_for_backtick_name() -> None:
    question = "where is `UserService` defined?"
    terms = extract_search_terms(question)
    assert classify_query_intent(question, terms) == QueryIntentProfile.SYMBOL_LOOKUP


def test_classify_conceptual_for_how_question_without_identifiers() -> None:
    question = "how does authentication work?"
    terms = extract_search_terms(question)
    assert classify_query_intent(question, terms) == QueryIntentProfile.CONCEPTUAL


def test_classify_balanced_when_signals_conflict() -> None:
    question = "how does getMinEmi calculate EMI?"
    terms = extract_search_terms(question)
    assert classify_query_intent(question, terms) == QueryIntentProfile.BALANCED


def test_resolve_rrf_weights_symbol_lookup_profile() -> None:
    weights = resolve_rrf_weights(QueryIntentProfile.SYMBOL_LOOKUP, Settings())
    assert weights == (5.0, 2.0, 0.5)


def test_resolve_rrf_weights_conceptual_profile() -> None:
    weights = resolve_rrf_weights(QueryIntentProfile.CONCEPTUAL, Settings())
    assert weights == (1.0, 2.0, 4.0)


def test_resolve_rrf_weights_balanced_uses_env_overrides() -> None:
    settings = Settings(
        retrieval_symbol_weight=4.0,
        retrieval_keyword_weight=3.0,
        retrieval_vector_weight=2.0,
    )
    weights = resolve_rrf_weights(QueryIntentProfile.BALANCED, settings)
    assert weights == (4.0, 3.0, 2.0)
