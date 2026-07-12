"""Tests for small-talk detection."""

import pytest

from services.router.small_talk import is_small_talk_message, small_talk_reply


@pytest.mark.parametrize(
    "message",
    ["hi", "Hi!", "  hello  ", "hey.", "thanks", "Thank you!", "good morning"],
)
def test_is_small_talk_message_matches_greetings(message: str) -> None:
    assert is_small_talk_message(message) is True


@pytest.mark.parametrize(
    "message",
    ["", "   ", "where is auth?", "hi there", "hello world", "how does sync work?"],
)
def test_is_small_talk_message_rejects_code_questions(message: str) -> None:
    assert is_small_talk_message(message) is False


def test_small_talk_reply_is_non_empty() -> None:
    assert "codebase" in small_talk_reply().lower()
