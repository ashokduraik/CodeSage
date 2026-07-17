"""Unit tests for QA playbook learning (ADR 0027 plan 11)."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

from config import Settings
from models.enums import RowStatus
from models.qa_playbook import QaPlaybook
from services.qa.playbooks import (
    PlaybookHint,
    find_similar_playbooks,
    format_playbook_hints_for_planner,
    is_trace_promotable,
    promote_trace_to_playbook,
    steps_from_trace,
)


def _settings(**overrides: object) -> Settings:
    """Build Settings with playbook learning enabled by default.

    @param overrides - Field overrides for the test.
    @returns Settings instance.
    """
    base: dict[str, object] = {
        "tei_base_url": "",
        "qa_playbook_learning_enabled": True,
        "qa_playbook_max_per_project": 500,
        "qa_playbook_min_similarity": 0.85,
        "qa_playbook_merge_similarity": 0.95,
    }
    base.update(overrides)
    return Settings(**base)  # type: ignore[arg-type]


def _trace(**overrides: object) -> dict:
    """Build a promotable InvestigationTrace-shaped dict.

    @param overrides - Top-level field overrides.
    @returns Trace dict.
    """
    trace: dict = {
        "version": 1,
        "agentIterations": 1,
        "finalConfidence": 0.86,
        "intentProfile": "symbol_lookup",
        "terms": ["getMinEmi", "emi"],
        "iterations": [
            {
                "index": 1,
                "confidenceAfter": 0.86,
                "toolCalls": [
                    {
                        "tool": "search_symbols",
                        "args": {"query": "getMinEmi"},
                        "hitCount": 1,
                        "topAnchors": [{"filePath": "src/loan.utils.ts"}],
                    }
                ],
            }
        ],
        "evidenceAnchors": [
            {"filePath": "src/loan.utils.ts", "symbol": "getMinEmi"},
        ],
    }
    trace.update(overrides)
    return trace


def _playbook_row(**overrides: object) -> QaPlaybook:
    """Build a QaPlaybook ORM instance for mocked repository returns.

    @param overrides - Attribute overrides.
    @returns QaPlaybook instance.
    """
    row = QaPlaybook(
        id=uuid.uuid4(),
        project_id=uuid.uuid4(),
        canonical_question="how is EMI calculated?",
        intent_profile="symbol_lookup",
        steps=[
            {
                "order": 1,
                "tool": "search_symbols",
                "argsTemplate": {"query": "{term:getMinEmi}"},
            }
        ],
        evidence_anchors=[{"filePath": "src/loan.utils.ts"}],
        question_embedding=[0.1] * 8,
        success_count=3,
        last_success_at=datetime.now(timezone.utc),
        status=RowStatus.ACTIVE,
    )
    for key, value in overrides.items():
        setattr(row, key, value)
    return row


def test_promote_rejects_abstain_trace() -> None:
    """L2: abstained answers must not be promoted."""
    assert (
        is_trace_promotable(
            _trace(),
            {"abstained": True, "citation_count": 2},
        )
        is False
    )
    session = MagicMock()
    result = promote_trace_to_playbook(
        session,
        _settings(),
        project_id=uuid.uuid4(),
        question="how is EMI calculated?",
        trace=_trace(),
        message_id=None,
        user_id=None,
        message_meta={"abstained": True, "citation_count": 2},
    )
    assert result is None
    session.commit.assert_not_called()


def test_promote_rejects_no_tools() -> None:
    """L3: traces without retrieval tools must not be promoted."""
    trace = _trace(
        iterations=[{"index": 1, "confidenceAfter": 0.9, "toolCalls": []}],
    )
    assert is_trace_promotable(trace, {"abstained": False, "citation_count": 1}) is False


def test_merge_increments_success_count() -> None:
    """Near-duplicate questions merge into an existing playbook."""
    session = MagicMock()
    existing = _playbook_row()
    settings = _settings()
    with (
        patch(
            "services.qa.playbooks.EmbeddingClient"
        ) as embed_cls,
        patch(
            "services.qa.playbooks.QaPlaybookRepository"
        ) as repo_cls,
    ):
        embed_cls.return_value.embed_texts.return_value = [[0.2] * 8]
        repo = repo_cls.return_value
        repo.similarity_search.return_value = [(existing, 0.97)]
        repo.mark_success.return_value = True
        result = promote_trace_to_playbook(
            session,
            settings,
            project_id=existing.project_id,
            question="how is EMI calculated?",
            trace=_trace(),
            message_id=None,
            user_id=None,
        )
    assert result == existing.id
    repo.mark_success.assert_called_once_with(existing.id)
    repo.insert.assert_not_called()
    session.commit.assert_called_once()


def test_cap_evicts_oldest_low_success() -> None:
    """At cap, soft-delete the lowest success / oldest playbook before insert."""
    session = MagicMock()
    project_id = uuid.uuid4()
    victim = _playbook_row(project_id=project_id, success_count=1)
    inserted = _playbook_row(project_id=project_id, id=uuid.uuid4())
    settings = _settings(qa_playbook_max_per_project=2)
    with (
        patch("services.qa.playbooks.EmbeddingClient") as embed_cls,
        patch("services.qa.playbooks.QaPlaybookRepository") as repo_cls,
    ):
        embed_cls.return_value.embed_texts.return_value = [[0.3] * 8]
        repo = repo_cls.return_value
        repo.similarity_search.return_value = []
        repo.count_active.return_value = 2
        repo.find_eviction_candidate.return_value = victim
        repo.insert.return_value = inserted
        result = promote_trace_to_playbook(
            session,
            settings,
            project_id=project_id,
            question="where is auth middleware?",
            trace=_trace(intentProfile="conceptual"),
            message_id=None,
            user_id=None,
        )
    assert result == inserted.id
    repo.soft_delete.assert_called_once_with(victim.id)
    repo.insert.assert_called_once()
    session.commit.assert_called_once()


def test_find_similar_above_threshold() -> None:
    """Hints are returned when similarity meets the floor."""
    session = MagicMock()
    row = _playbook_row()
    with (
        patch("services.qa.playbooks.EmbeddingClient") as embed_cls,
        patch("services.qa.playbooks.QaPlaybookRepository") as repo_cls,
        patch(
            "services.qa.playbooks.validate_playbook_anchors",
            return_value=True,
        ),
    ):
        embed_cls.return_value.embed_texts.return_value = [[0.4] * 8]
        repo_cls.return_value.similarity_search.return_value = [(row, 0.91)]
        hints = find_similar_playbooks(
            session,
            _settings(),
            project_id=row.project_id,
            question="how is EMI calculated?",
        )
    assert len(hints) == 1
    assert hints[0].similarity == 0.91
    assert hints[0].canonical_question == row.canonical_question


def test_find_similar_empty_below_threshold() -> None:
    """No hints when the repository returns no rows above the similarity floor."""
    session = MagicMock()
    with (
        patch("services.qa.playbooks.EmbeddingClient") as embed_cls,
        patch("services.qa.playbooks.QaPlaybookRepository") as repo_cls,
    ):
        embed_cls.return_value.embed_texts.return_value = [[0.5] * 8]
        repo_cls.return_value.similarity_search.return_value = []
        hints = find_similar_playbooks(
            session,
            _settings(),
            project_id=uuid.uuid4(),
            question="unrelated question",
            validate_anchors=False,
        )
    assert hints == []


def test_format_hints_includes_steps() -> None:
    """Planner hint text includes tool steps and the hints-only disclaimer."""
    hint = PlaybookHint(
        playbook_id=uuid.uuid4(),
        canonical_question="how is EMI calculated?",
        similarity=0.91,
        success_count=7,
        steps=[
            {
                "order": 1,
                "tool": "search_symbols",
                "argsTemplate": {"query": "{term:getMinEmi}"},
            },
            {
                "order": 2,
                "tool": "graph_expand",
                "argsTemplate": {"nodeId": "{anchor:graphNodeId}"},
            },
        ],
        evidence_anchors=[
            {"filePath": "src/loan.utils.ts"},
            {"filePath": "backend/services/loan.service.ts"},
        ],
        intent_profile="symbol_lookup",
    )
    text = format_playbook_hints_for_planner([hint])
    assert "Past successful investigations" in text
    assert "search_symbols" in text
    assert "graph_expand" in text
    assert "src/loan.utils.ts" in text
    assert "hints only" in text
    # Placeholders must not leak raw `{term:…}` braces into the planner prompt.
    assert "{term:" not in text
    assert "{anchor:" not in text
    assert "term:getMinEmi" in text
    assert format_playbook_hints_for_planner([]) == ""


def test_steps_from_trace_templates_query() -> None:
    """Concrete search queries become ``{term:…}`` placeholders."""
    steps = steps_from_trace(_trace())
    assert steps[0]["tool"] == "search_symbols"
    assert steps[0]["argsTemplate"]["query"] == "{term:getMinEmi}"


def test_promote_skips_when_learning_disabled() -> None:
    """Kill-switch prevents insert and merge."""
    session = MagicMock()
    result = promote_trace_to_playbook(
        session,
        _settings(qa_playbook_learning_enabled=False),
        project_id=uuid.uuid4(),
        question="how is EMI calculated?",
        trace=_trace(),
        message_id=None,
        user_id=None,
    )
    assert result is None
    assert find_similar_playbooks(
        session,
        _settings(qa_playbook_learning_enabled=False),
        project_id=uuid.uuid4(),
        question="q",
    ) == []


def test_promote_rejects_low_confidence() -> None:
    """L1: sub-threshold confidence is not promotable."""
    assert (
        is_trace_promotable(
            _trace(finalConfidence=0.5),
            {"abstained": False, "citation_count": 1},
        )
        is False
    )
