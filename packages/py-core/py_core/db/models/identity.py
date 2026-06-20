"""ORM models for identity and project tables."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Text, func
from sqlalchemy.dialects.postgresql import BYTEA, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from py_core.db.base import Base
from py_core.db.enums import (
    PROJECT_STATUS,
    REPO_PROVIDER,
    REPO_ROLE,
    USER_ROLE,
    ProjectStatus,
    RepoProvider,
    RepoRole,
    UserRole,
)


class User(Base):
    """Account with a single application role."""

    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    role: Mapped[UserRole] = mapped_column(USER_ROLE, nullable=False, default=UserRole.DEVELOPER)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )


class Project(Base):
    """Logical system that owns one or more repositories."""

    __tablename__ = "projects"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[ProjectStatus] = mapped_column(
        PROJECT_STATUS,
        nullable=False,
        default=ProjectStatus.ACTIVE,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    repos: Mapped[list[Repo]] = relationship(back_populates="project", cascade="all, delete-orphan")


class Repo(Base):
    """Git repository attached to a project."""

    __tablename__ = "repos"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
    )
    repo_url: Mapped[str] = mapped_column(Text, nullable=False)
    provider: Mapped[RepoProvider] = mapped_column(REPO_PROVIDER, nullable=False)
    branch: Mapped[str] = mapped_column(Text, nullable=False, default="main")
    role: Mapped[RepoRole] = mapped_column(REPO_ROLE, nullable=False, default=RepoRole.OTHER)
    token_enc: Mapped[bytes | None] = mapped_column(BYTEA, nullable=True)
    last_indexed_sha: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    project: Mapped[Project] = relationship(back_populates="repos")
