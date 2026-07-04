"""Tests for RAG audit column stamping helpers."""

from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from config.service_users import RAG_WORKER_USER_ID
from repositories.audit import RAG_ACTOR_ID, rag_actor_sql, stamp_created, stamp_updated


@dataclass
class _FakeRow:
    """Minimal stand-in for an ORM row with audit columns."""

    created_by: UUID | None = None
    updated_by: UUID | None = None


def test_rag_actor_id_matches_rag_worker_constant() -> None:
    """RAG_ACTOR_ID is resolved once from the rag-worker service user."""
    assert RAG_ACTOR_ID == RAG_WORKER_USER_ID
    assert rag_actor_sql() == RAG_WORKER_USER_ID


def test_stamp_created_sets_both_audit_actor_columns() -> None:
    """New rows get created_by and updated_by from the RAG worker."""
    row = _FakeRow()
    stamp_created(row)
    assert row.created_by == RAG_WORKER_USER_ID
    assert row.updated_by == RAG_WORKER_USER_ID


def test_stamp_updated_sets_updated_by_only() -> None:
    """Updates set updated_by; updated_at is left to the DB trigger."""
    row = _FakeRow(created_by=RAG_WORKER_USER_ID, updated_by=RAG_WORKER_USER_ID)
    stamp_updated(row)
    assert row.updated_by == RAG_WORKER_USER_ID
