"""Thin QA entrypoint — title, audience gate, then agent loop (ADR 0026)."""

from __future__ import annotations

import json
import uuid
from collections.abc import Iterator
from typing import Any

from sqlalchemy.orm import Session, sessionmaker

from config import Settings
from services.llm.title import generate_session_title
from services.qa.agent_loop import stream_agent_answer
from services.router.classify import is_code_audience


def _chunk_event(event_type: str, **fields: Any) -> str:
    """Format one SSE data line from an EngineAnswerChunk-shaped dict.

    @param event_type - Chunk discriminator.
    @param fields - Additional JSON fields.
    @returns SSE-framed payload (`data: …\\n\\n`).
    """
    payload = {"type": event_type, **fields}
    return f"data: {json.dumps(payload, separators=(',', ':'))}\n\n"


def stream_engine_answer(
    settings: Settings,
    session_factory: sessionmaker[Session],
    *,
    question: str,
    project_id: uuid.UUID,
    audience: str,
    repo_ids: list[uuid.UUID] | None = None,
    generate_title: bool = False,
    history: list[dict[str, str]] | None = None,
) -> Iterator[str]:
    """Stream an engine query answer via the agent evidence loop.

    Handles title generation and the Phase-1 end-user abstain before delegating
    developer questions to ``stream_agent_answer``. Social turns use the same
    planner path, and application-owned evidence confidence guards code answers.

    @param settings - Application settings.
    @param session_factory - SQLAlchemy session factory.
    @param question - User question.
    @param project_id - Project scope.
    @param audience - ``developer`` or ``end_user`` (Phase 1 product path abstains).
    @param repo_ids - Optional repo filter.
    @param generate_title - When true, emit a title chunk before the answer.
    @param history - Optional prior conversation turns oldest-first.
    @yields SSE event strings.
    """
    if generate_title:
        title = generate_session_title(settings, question)
        yield _chunk_event("title", content=title)

    if not is_code_audience(audience):
        yield _chunk_event(
            "abstain",
            content="End-user product QA is not available in Phase 1.",
        )
        return

    yield from stream_agent_answer(
        settings,
        session_factory,
        question=question,
        project_id=project_id,
        repo_ids=repo_ids,
        history=history,
    )
