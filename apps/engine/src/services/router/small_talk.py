"""Detect obvious greetings and social turns that should not run retrieval."""

from __future__ import annotations

import re

# Normalized exact phrases only — avoids broad regex that could swallow real code questions.
_SMALL_TALK_PHRASES: frozenset[str] = frozenset(
    {
        "hi",
        "hello",
        "hey",
        "thanks",
        "thank you",
        "good morning",
        "good afternoon",
        "good evening",
        "how are you",
        "howdy",
        "yo",
    },
)

_PUNCTUATION_RE = re.compile(r"[^\w\s']+")


def _normalize_small_talk(text: str) -> str:
    """Lowercase and strip punctuation so ``Hi!`` and `` hi `` match the phrase set.

    @param text - Raw user message.
    @returns Normalized phrase for lookup.
    """
    collapsed = " ".join(text.strip().lower().split())
    return _PUNCTUATION_RE.sub("", collapsed).strip()


def is_small_talk_message(question: str) -> bool:
    """Return True when the message is a short social turn, not a codebase question.

    Only exact normalized phrases match — partial or longer questions always return
    False so retrieval still runs for real queries.

    @param question - User message text.
    @returns Whether the message should skip retrieval and LLM grounding.
    """
    normalized = _normalize_small_talk(question)
    if not normalized:
        return False
    return normalized in _SMALL_TALK_PHRASES


def small_talk_reply() -> str:
    """Return a concise assistant reply for greeting/social messages.

    @returns Product-aligned message steering the user toward grounded code QA.
    """
    return (
        "Hi. Ask me about the indexed codebase and I'll answer with citations."
    )
