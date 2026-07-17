"""Tests for question term extraction."""

from services.retrieval.query_terms import extract_search_terms


def test_extract_search_terms_finds_identifiers() -> None:
    terms = extract_search_terms("how does getMinEmi calculate EMI in loan.utils.ts?")
    assert "getMinEmi" in terms
    assert "EMI" in terms
    assert "utils" in terms
    assert "how" not in terms
    assert "calculate" not in terms


def test_extract_search_terms_deduplicates_case_insensitive() -> None:
    terms = extract_search_terms("getMinEmi and getminemi again")
    assert terms.count("getMinEmi") == 1
