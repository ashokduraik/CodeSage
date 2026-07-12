"""Tests for grounded QA prompt templates."""

from services.llm.prompts import build_code_qa_messages


def test_build_code_qa_messages_includes_exact_abstain_phrase() -> None:
    messages = build_code_qa_messages("where is auth?", ["File: src/a.ts\n```\ncode\n```"])
    system = messages[0]["content"]
    assert (
        "I'm not certain — the retrieved code does not contain enough information to answer that."
        in system
    )
    assert messages[-1]["content"].startswith("Question:")


def test_build_code_qa_messages_includes_prior_history() -> None:
    history = [
        {"role": "user", "content": "What is auth?"},
        {"role": "assistant", "content": "Auth lives in src/auth.ts"},
    ]
    messages = build_code_qa_messages("follow up?", ["File: src/a.ts\n```\ncode\n```"], history)
    assert messages[0]["role"] == "system"
    assert messages[1:3] == history
    assert messages[-1]["role"] == "user"
