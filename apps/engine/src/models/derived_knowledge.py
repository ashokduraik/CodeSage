"""ORM models for LLM-distilled product knowledge tables."""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import Boolean, DateTime, ForeignKey, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from models.base import Base
from models.enums import RowStatus


class Workflow(Base):
    """LLM-distilled business or user workflow spanning project repos."""

    __tablename__ = "workflows"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    steps: Mapped[list[Any]] = mapped_column(JSONB, nullable=False, insert_default=list)
    confidence: Mapped[Decimal] = mapped_column(Numeric, nullable=False)
    source_refs: Mapped[list[Any]] = mapped_column(JSONB, nullable=False, insert_default=list)
    is_stale: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    is_expert_override: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false",
    )
    status: Mapped[RowStatus] = mapped_column(
        String(1), nullable=False, default=RowStatus.ACTIVE, server_default="A",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(),
    )
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False,
    )
    updated_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False,
    )


class PageMap(Base):
    """Derived UI route to components and data sources."""

    __tablename__ = "page_map"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
    )
    route: Mapped[str] = mapped_column(Text, nullable=False)
    components: Mapped[list[Any]] = mapped_column(JSONB, nullable=False, insert_default=list)
    data_sources: Mapped[list[Any]] = mapped_column(JSONB, nullable=False, insert_default=list)
    confidence: Mapped[Decimal] = mapped_column(Numeric, nullable=False)
    source_refs: Mapped[list[Any]] = mapped_column(JSONB, nullable=False, insert_default=list)
    is_stale: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    is_expert_override: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false",
    )
    status: Mapped[RowStatus] = mapped_column(
        String(1), nullable=False, default=RowStatus.ACTIVE, server_default="A",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(),
    )
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False,
    )
    updated_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False,
    )


class PermissionRule(Base):
    """Inferred permission or role requirement for a page or action."""

    __tablename__ = "permission_rules"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
    )
    target: Mapped[str] = mapped_column(Text, nullable=False)
    required_permission: Mapped[str] = mapped_column(Text, nullable=False)
    confidence: Mapped[Decimal] = mapped_column(Numeric, nullable=False)
    source_refs: Mapped[list[Any]] = mapped_column(JSONB, nullable=False, insert_default=list)
    is_stale: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    is_expert_override: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false",
    )
    status: Mapped[RowStatus] = mapped_column(
        String(1), nullable=False, default=RowStatus.ACTIVE, server_default="A",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(),
    )
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False,
    )
    updated_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False,
    )


class DataFlow(Base):
    """Per-page data origin chain and freshness classification."""

    __tablename__ = "data_flows"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
    )
    page_ref: Mapped[str] = mapped_column(Text, nullable=False)
    source_chain: Mapped[list[Any]] = mapped_column(JSONB, nullable=False, insert_default=list)
    freshness_type: Mapped[str] = mapped_column(Text, nullable=False)
    confidence: Mapped[Decimal] = mapped_column(Numeric, nullable=False)
    source_refs: Mapped[list[Any]] = mapped_column(JSONB, nullable=False, insert_default=list)
    is_stale: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    is_expert_override: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false",
    )
    status: Mapped[RowStatus] = mapped_column(
        String(1), nullable=False, default=RowStatus.ACTIVE, server_default="A",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(),
    )
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False,
    )
    updated_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False,
    )
