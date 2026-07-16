"""Tests for the thin stream_engine_answer entrypoint."""

from __future__ import annotations

import json
import uuid
from unittest.mock import MagicMock

from config import Settings
from services.qa.stream_answer import stream_engine_answer


def _parse_events(raw: list[str]) -> list[dict]:
    """Decode SSE data lines into JSON payloads.

    @param raw - Collected SSE event strings.
    @returns Parsed chunk dicts.
    """
    return [json.loads(e.removeprefix("data: ").strip()) for e in raw if e.strip()]


def test_stream_abstains_for_end_user_audience() -> None:
    events = _parse_events(
        list(
            stream_engine_answer(
                Settings(),
                MagicMock(),
                question="how?",
                project_id=uuid.uuid4(),
                audience="end_user",
            )
        )
    )
    assert events[0]["type"] == "abstain"
    assert "End-user" in events[0]["content"]


def test_stream_delegates_to_agent_loop(monkeypatch) -> None:
    called: dict[str, object] = {}

    def fake_agent(
        settings,
        session_factory,
        *,
        question,
        project_id,
        repo_ids=None,
        history=None,
    ):
        called["question"] = question
        called["project_id"] = project_id
        yield 'data: {"type":"token","content":"from-agent"}\n\n'
        yield 'data: {"type":"done"}\n\n'

    monkeypatch.setattr("services.qa.stream_answer.stream_agent_answer", fake_agent)
    project_id = uuid.uuid4()
    events = _parse_events(
        list(
            stream_engine_answer(
                Settings(),
                MagicMock(),
                question="where is login?",
                project_id=project_id,
                audience="developer",
            )
        )
    )
    assert called["question"] == "where is login?"
    assert called["project_id"] == project_id
    assert events[0]["type"] == "token"
    assert events[0]["content"] == "from-agent"
    assert events[-1]["type"] == "done"


def test_stream_emits_title_then_delegates(monkeypatch) -> None:
    monkeypatch.setattr(
        "services.qa.stream_answer.generate_session_title",
        lambda settings, question: "Auth flow",
    )
    monkeypatch.setattr(
        "services.qa.stream_answer.stream_agent_answer",
        lambda *a, **k: iter(['data: {"type":"done"}\n\n']),
    )
    events = _parse_events(
        list(
            stream_engine_answer(
                Settings(),
                MagicMock(),
                question="how does auth work?",
                project_id=uuid.uuid4(),
                audience="developer",
                generate_title=True,
            )
        )
    )
    assert events[0]["type"] == "title"
    assert events[0]["content"] == "Auth flow"
    assert events[-1]["type"] == "done"


def test_end_user_not_delegated_to_agent(monkeypatch) -> None:
    agent = MagicMock(return_value=iter([]))
    monkeypatch.setattr("services.qa.stream_answer.stream_agent_answer", agent)
    list(
        stream_engine_answer(
            Settings(),
            MagicMock(),
            question="hi",
            project_id=uuid.uuid4(),
            audience="end_user",
        )
    )
    agent.assert_not_called()
