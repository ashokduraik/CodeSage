"""Unit tests for QaPlaybookRepository (mocked session — no live DB)."""

from __future__ import annotations

import uuid
from unittest.mock import MagicMock, patch

from sqlalchemy.dialects import postgresql

from models.enums import RowStatus
from models.qa_playbook import QaPlaybook
from repositories.qa_playbooks import QaPlaybookRepository


def _playbook(**overrides: object) -> QaPlaybook:
    """Build a QaPlaybook instance with sensible defaults for tests."""
    row = QaPlaybook(
        id=uuid.uuid4(),
        project_id=uuid.uuid4(),
        canonical_question="how is EMI calculated?",
        intent_profile="symbol_lookup",
        steps=[{"order": 1, "tool": "search_symbols", "argsTemplate": {"query": "{term:emi}"}}],
        evidence_anchors=[{"filePath": "src/loan.utils.ts", "symbol": "getMinEmi"}],
        question_embedding=[0.1] * 1024,
        success_count=1,
        status=RowStatus.ACTIVE,
    )
    for key, value in overrides.items():
        setattr(row, key, value)
    return row


def test_insert_stamps_actor_and_flushes() -> None:
    session = MagicMock()
    actor = uuid.uuid4()
    with patch("repositories.qa_playbooks.stamp_created", side_effect=lambda r: r) as stamp:
        with patch("repositories.qa_playbooks.RAG_ACTOR_ID", actor):
            repo = QaPlaybookRepository(session)
            row = repo.insert(
                project_id=uuid.uuid4(),
                canonical_question="q",
                intent_profile="conceptual",
                steps=[],
                evidence_anchors=[],
                question_embedding=[0.0] * 4,
            )
    stamp.assert_called_once()
    session.add.assert_called_once_with(row)
    session.flush.assert_called_once()
    assert row.canonical_question == "q"
    assert row.question_embedding == [0.0] * 4


def test_list_active_filters_and_orders() -> None:
    session = MagicMock()
    expected = [_playbook()]
    session.scalars.return_value = expected
    repo = QaPlaybookRepository(session)
    project_id = uuid.uuid4()
    result = repo.list_active(project_id, limit=10)
    assert result == expected
    session.scalars.assert_called_once()


def test_count_active_returns_scalar() -> None:
    session = MagicMock()
    session.scalar.return_value = 7
    repo = QaPlaybookRepository(session)
    assert repo.count_active(uuid.uuid4()) == 7


def test_soft_delete_marks_active_row() -> None:
    session = MagicMock()
    row = _playbook()
    session.get.return_value = row
    with patch("repositories.qa_playbooks.stamp_updated", side_effect=lambda r: r):
        repo = QaPlaybookRepository(session)
        assert repo.soft_delete(row.id) is True
    assert row.status == RowStatus.DELETED
    session.flush.assert_called_once()


def test_soft_delete_returns_false_when_missing_or_deleted() -> None:
    session = MagicMock()
    session.get.return_value = None
    repo = QaPlaybookRepository(session)
    assert repo.soft_delete(uuid.uuid4()) is False

    session.get.return_value = _playbook(status=RowStatus.DELETED)
    assert repo.soft_delete(uuid.uuid4()) is False


def test_find_eviction_candidate_orders_lowest_success() -> None:
    session = MagicMock()
    victim = _playbook(success_count=1)
    session.scalars.return_value.first.return_value = victim
    repo = QaPlaybookRepository(session)
    assert repo.find_eviction_candidate(uuid.uuid4()) is victim
    session.scalars.assert_called_once()


def test_build_similarity_query_compiles() -> None:
    repo = QaPlaybookRepository(MagicMock())
    stmt = repo.build_similarity_query(
        project_id=uuid.uuid4(),
        query_embedding=[0.1] * 1024,
        limit=3,
        max_distance=0.15,
    )
    compiled = str(
        stmt.compile(dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True}),
    )
    assert "qa_playbooks" in compiled
    assert "status" in compiled


def test_similarity_search_converts_distance_to_similarity() -> None:
    session = MagicMock()
    row = _playbook()
    session.execute.return_value.all.return_value = [(row, 0.1)]
    repo = QaPlaybookRepository(session)
    results = repo.similarity_search(
        project_id=row.project_id,
        query_embedding=[0.2] * 1024,
        limit=3,
        min_similarity=0.85,
    )
    assert results == [(row, 0.9)]


def test_mark_success_updates_active_row() -> None:
    session = MagicMock()
    session.execute.return_value.rowcount = 1
    repo = QaPlaybookRepository(session)
    assert repo.mark_success(uuid.uuid4()) is True
    session.flush.assert_called_once()


def test_mark_success_returns_false_when_no_row() -> None:
    session = MagicMock()
    session.execute.return_value.rowcount = 0
    repo = QaPlaybookRepository(session)
    assert repo.mark_success(uuid.uuid4()) is False
