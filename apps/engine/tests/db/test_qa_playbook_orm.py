"""Regression tests for QaPlaybook ORM metadata (ADR 0027 promote path)."""

from __future__ import annotations

import uuid

from sqlalchemy.orm import configure_mappers

from models.qa_playbook import QaPlaybook


def test_configure_mappers_resolves_qa_playbook_without_messages_table() -> None:
    """Promote must not fail because SQLAlchemy cannot resolve FK to unmodeled messages."""
    configure_mappers()
    row = QaPlaybook(
        id=uuid.uuid4(),
        project_id=uuid.uuid4(),
        canonical_question="how is EMI calculated?",
        intent_profile="balanced",
        steps=[],
        evidence_anchors=[],
        source_message_id=uuid.uuid4(),
        created_by=uuid.uuid4(),
        updated_by=uuid.uuid4(),
    )
    assert row.source_message_id is not None


def test_qa_playbook_source_message_id_has_no_orm_foreign_key() -> None:
    """Engine stores provenance as UUID; Node-owned messages table is not in ORM metadata."""
    configure_mappers()
    table = QaPlaybook.__table__
    fk_targets = {fk.target_fullname for fk in table.foreign_keys}
    assert "messages.id" not in fk_targets
