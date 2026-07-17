"""ORM model for QA investigation playbooks (ADR 0027)."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pgvector.sqlalchemy import HALFVEC
from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from config import DEFAULT_EMBEDDING_DIMENSION
from models.base import Base
from models.enums import RowStatus


class QaPlaybook(Base):
    """Project-scoped successful investigation path for planner hints (ADR 0027).

    Stores retrieval strategy (tool steps + stable anchors), not answer text.
    Soft-deleted via ``status = 'D'`` when anchors go stale after re-index.
    """

    __tablename__ = "qa_playbooks"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
    )
    canonical_question: Mapped[str] = mapped_column(Text, nullable=False)
    question_embedding: Mapped[list[float] | None] = mapped_column(
        HALFVEC(DEFAULT_EMBEDDING_DIMENSION),
        nullable=True,
    )
    intent_profile: Mapped[str] = mapped_column(Text, nullable=False)
    steps: Mapped[list[Any]] = mapped_column(JSONB, nullable=False)
    evidence_anchors: Mapped[list[Any]] = mapped_column(JSONB, nullable=False)
    success_count: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    last_success_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    source_message_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("messages.id", ondelete="SET NULL"),
        nullable=True,
    )
    status: Mapped[RowStatus] = mapped_column(
        String(1),
        nullable=False,
        default=RowStatus.ACTIVE,
        server_default="A",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=False,
    )
    updated_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=False,
    )
