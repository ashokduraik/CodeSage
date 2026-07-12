"""ORM models for identity and project tables."""



from __future__ import annotations



import uuid

from datetime import datetime



from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, func

from sqlalchemy.dialects.postgresql import BYTEA, UUID

from sqlalchemy.orm import Mapped, mapped_column, relationship



from models.base import Base

from models.enums import (

    PROJECT_STATUS,

    REPO_PROVIDER,

    USER_ROLE,

    ProjectStatus,

    RepoConnectionStatus,

    RepoProvider,

    RowStatus,

    UserRole,

)





class User(Base):

    """Account with a single application role."""



    __tablename__ = "users"



    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    email: Mapped[str] = mapped_column(Text, nullable=False, unique=True)

    password_hash: Mapped[str] = mapped_column(Text, nullable=False)

    role: Mapped[UserRole] = mapped_column(USER_ROLE, nullable=False, default=UserRole.DEVELOPER)

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





class Project(Base):

    """Logical system that owns one or more repositories."""



    __tablename__ = "projects"



    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    name: Mapped[str] = mapped_column(Text, nullable=False)

    lifecycle_status: Mapped[ProjectStatus] = mapped_column(

        PROJECT_STATUS,

        nullable=False,

        default=ProjectStatus.ACTIVE,

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

    full_name: Mapped[str | None] = mapped_column(Text, nullable=True)

    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    base_url: Mapped[str | None] = mapped_column(Text, nullable=True)

    is_private: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    connection_status: Mapped[str] = mapped_column(

        Text,

        nullable=False,

        default=RepoConnectionStatus.CONNECTING.value,

    )

    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)

    last_error_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    webhook_id: Mapped[str | None] = mapped_column(Text, nullable=True)

    webhook_secret_enc: Mapped[bytes | None] = mapped_column(BYTEA, nullable=True)

    webhook_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    token_enc: Mapped[bytes | None] = mapped_column(BYTEA, nullable=True)

    last_indexed_sha: Mapped[str | None] = mapped_column(Text, nullable=True)

    last_indexed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    primary_language: Mapped[str | None] = mapped_column(Text, nullable=True)

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



    project: Mapped[Project] = relationship(back_populates="repos")

