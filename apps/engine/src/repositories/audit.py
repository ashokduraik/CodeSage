"""Helpers for mandatory audit columns on domain rows."""

from __future__ import annotations

import uuid
from typing import TypeVar

from config.service_users import resolve_service_user

RAG_ACTOR_ID = resolve_service_user("rag")

T = TypeVar("T")


def stamp_created(row: T) -> T:
    """Set ``created_by`` and ``updated_by`` on a new ORM row for the RAG worker.

    @param row - Unsaved SQLAlchemy model instance with audit columns.
    @returns The same row for chaining.
    """
    actor = RAG_ACTOR_ID
    row.created_by = actor  # type: ignore[attr-defined]
    row.updated_by = actor  # type: ignore[attr-defined]
    return row


def stamp_updated(row: T) -> T:
    """Set ``updated_by`` on an ORM row before flush (``updated_at`` via DB trigger).

    @param row - SQLAlchemy model instance with audit columns.
    @returns The same row for chaining.
    """
    row.updated_by = RAG_ACTOR_ID  # type: ignore[attr-defined]
    return row


def rag_actor_sql() -> uuid.UUID:
    """Return the RAG worker UUID for raw SQL updates."""
    return RAG_ACTOR_ID
