"""Tests for QA streaming."""

import uuid
from types import SimpleNamespace
from unittest.mock import MagicMock

from config import Settings
from services.qa.stream_answer import stream_rag_answer


def test_stream_abstains_for_end_user_audience() -> None:
    events = list(
        stream_rag_answer(
            Settings(),
            MagicMock(),
            question="how?",
            project_id=uuid.uuid4(),
            audience="end_user",
        ),
    )
    assert any('"abstain"' in event for event in events)


def test_stream_abstains_without_matches(monkeypatch) -> None:
    session = MagicMock()
    session_factory = MagicMock(return_value=session)
    monkeypatch.setattr(
        "services.qa.stream_answer.retrieve_code_chunks",
        lambda *a, **k: [],
    )
    events = list(
        stream_rag_answer(
            Settings(),
            session_factory,
            question="how?",
            project_id=uuid.uuid4(),
            audience="developer",
        ),
    )
    assert any('"abstain"' in event for event in events)


def test_stream_grounded_answer(monkeypatch) -> None:
    session = MagicMock()
    session_factory = MagicMock(return_value=session)
    chunk = SimpleNamespace(
        repo_id=uuid.uuid4(),
        file_path="src/a.ts",
        span={"startLine": 1, "endLine": 2},
        content="export function main() {}",
    )
    monkeypatch.setattr(
        "services.qa.stream_answer.retrieve_code_chunks",
        lambda *a, **k: [(chunk, 0.1)],
    )
    monkeypatch.setattr(
        "services.qa.stream_answer.is_confident_match",
        lambda settings, matches: True,
    )
    events = list(
        stream_rag_answer(
            Settings(),
            session_factory,
            question="what is main?",
            project_id=uuid.uuid4(),
            audience="developer",
        ),
    )
    joined = "".join(events)
    assert '"citation"' in joined
    assert '"done"' in joined
