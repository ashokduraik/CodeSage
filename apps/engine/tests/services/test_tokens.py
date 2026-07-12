"""Tests for approximate token counting and truncation."""

from services.llm.tokens import count_tokens, truncate_to_tokens


def test_count_tokens_empty_is_zero() -> None:
    assert count_tokens("") == 0


def test_count_tokens_positive_for_text() -> None:
    assert count_tokens("hello world, this is some code") > 0


def test_truncate_to_tokens_keeps_short_text() -> None:
    text = "short text"
    assert truncate_to_tokens(text, 100) == text


def test_truncate_to_tokens_shortens_long_text() -> None:
    text = "word " * 500
    truncated = truncate_to_tokens(text, 10)
    assert count_tokens(truncated) <= 10
    assert len(truncated) < len(text)


def test_truncate_to_tokens_zero_budget_is_empty() -> None:
    assert truncate_to_tokens("anything", 0) == ""
