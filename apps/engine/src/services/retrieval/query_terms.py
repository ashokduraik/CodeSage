"""Extract searchable identifier tokens from a natural-language question."""

from __future__ import annotations

import re

# camelCase, snake_case, and simple identifiers long enough to be meaningful symbols.
_IDENTIFIER_RE = re.compile(r"\b[A-Za-z_][A-Za-z0-9_]{2,}\b")

# Common English words that should not drive symbol/keyword search.
_STOP_WORDS: frozenset[str] = frozenset(
    {
        "how",
        "what",
        "where",
        "when",
        "why",
        "who",
        "does",
        "the",
        "this",
        "that",
        "with",
        "from",
        "into",
        "about",
        "repo",
        "code",
        "file",
        "function",
        "class",
        "method",
        "calculated",
        "calculate",
        "work",
        "works",
    },
)


def extract_search_terms(question: str) -> list[str]:
    """Return deduplicated identifier-like tokens from a user question.

    Strips common question words so symbol and keyword retrievers focus on names
    the user actually typed (e.g. ``getMinEmi``) rather than filler prose.

    @param question - Raw user question text.
    @returns Lowercased unique tokens in first-seen order.
    """
    seen: set[str] = set()
    terms: list[str] = []
    for match in _IDENTIFIER_RE.finditer(question):
        token = match.group(0)
        lowered = token.lower()
        if lowered in _STOP_WORDS or lowered in seen:
            continue
        seen.add(lowered)
        terms.append(token)
    return terms
