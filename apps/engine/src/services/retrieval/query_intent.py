"""Classify query intent and resolve per-profile RRF weights."""

from __future__ import annotations

import enum
import re

from config import Settings

# camelCase (lower or upper start), snake_case, or dotted qualified names.
_STRONG_IDENTIFIER_RE = re.compile(
    r"(?:\b[a-z]+(?:[A-Z][a-z0-9]+)+\b"  # camelCase
    r"|\b[A-Z][a-z0-9]+(?:[A-Z][a-z0-9]+)+\b"  # PascalCase
    r"|\b[a-z]+(?:_[a-z0-9]+)+\b"  # snake_case
    r"|\b[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*\b)",  # dotted
)

_BACKTICK_RE = re.compile(r"`([^`]+)`")

_SYMBOL_LOOKUP_PHRASES: tuple[str, ...] = (
    "where is",
    "where are",
    "defined",
    "definition of",
    "find ",
    "locate ",
    "what does ",
    "what is ",
)

_CONCEPTUAL_PHRASES: tuple[str, ...] = (
    "how does",
    "how do",
    "how is",
    "how are",
    "explain",
    "lifecycle",
    "authentication work",
    "flow work",
    "overview",
)


class QueryIntentProfile(str, enum.Enum):
    """Retrieval weighting profile derived from question heuristics."""

    SYMBOL_LOOKUP = "symbol_lookup"
    CONCEPTUAL = "conceptual"
    BALANCED = "balanced"


_PROFILE_WEIGHTS: dict[QueryIntentProfile, tuple[float, float, float]] = {
    # symbol, keyword, vector
    QueryIntentProfile.SYMBOL_LOOKUP: (5.0, 2.0, 0.5),
    QueryIntentProfile.CONCEPTUAL: (1.0, 2.0, 4.0),
    QueryIntentProfile.BALANCED: (3.0, 2.0, 1.0),
}


def _has_strong_identifier(question: str, terms: list[str]) -> bool:
    """Return True when the question names a code symbol or path-like token.

    @param question - Raw user question.
    @param terms - Tokens from ``extract_search_terms``.
    """
    if _STRONG_IDENTIFIER_RE.search(question):
        return True
    if _BACKTICK_RE.search(question):
        return True
    for term in terms:
        if _STRONG_IDENTIFIER_RE.fullmatch(term):
            return True
        if "." in term or "_" in term:
            return True
    return False


def _matches_phrase(question_lower: str, phrases: tuple[str, ...]) -> bool:
    """Return True when any phrase appears in the lowercased question."""
    return any(phrase in question_lower for phrase in phrases)


def classify_query_intent(question: str, terms: list[str]) -> QueryIntentProfile:
    """Classify retrieval intent from lightweight heuristics (no LLM).

    @param question - Raw user question text.
    @param terms - Identifier tokens from ``extract_search_terms``.
    @returns Weight profile for RRF fusion.
    """
    lowered = question.lower()
    has_identifier = _has_strong_identifier(question, terms)
    symbol_signal = has_identifier and (
        _matches_phrase(lowered, _SYMBOL_LOOKUP_PHRASES)
        or bool(_BACKTICK_RE.search(question))
        or " do?" in lowered
        or lowered.endswith(" do")
    )
    conceptual_signal = _matches_phrase(lowered, _CONCEPTUAL_PHRASES) and not has_identifier

    if symbol_signal and not conceptual_signal:
        return QueryIntentProfile.SYMBOL_LOOKUP
    if conceptual_signal and not symbol_signal:
        return QueryIntentProfile.CONCEPTUAL
    return QueryIntentProfile.BALANCED


def resolve_rrf_weights(
    profile: QueryIntentProfile,
    settings: Settings,
) -> tuple[float, float, float]:
    """Return ``(symbol_weight, keyword_weight, vector_weight)`` for fusion.

    Balanced profile reads env overrides; other profiles use ADR-fixed tables.

    @param profile - Classified query intent.
    @param settings - Application settings (balanced overrides only).
    @returns Tuple of symbol, keyword, and vector RRF weights.
    """
    if profile == QueryIntentProfile.BALANCED:
        return (
            settings.retrieval_symbol_weight,
            settings.retrieval_keyword_weight,
            settings.retrieval_vector_weight,
        )
    return _PROFILE_WEIGHTS[profile]
