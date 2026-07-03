"""PostgreSQL enum types and domain constants for the ORM layer."""

from __future__ import annotations

import enum

from sqlalchemy.dialects.postgresql import ENUM

USER_ROLE = ENUM(
    "admin",
    "expert",
    "developer",
    "end_user",
    name="user_role",
    create_type=False,
)

REPO_PROVIDER = ENUM(
    "github",
    "gitlab",
    name="repo_provider",
    create_type=False,
)

PROJECT_STATUS = ENUM(
    "active",
    "indexed",
    "indexing",
    "stale",
    "connecting",
    "error",
    name="project_status",
    create_type=False,
)

JOB_STATUS = ENUM(
    "pending",
    "running",
    "done",
    "failed",
    name="job_status",
    create_type=False,
)


class UserRole(str, enum.Enum):
    """Application role stored on `users.role`."""

    ADMIN = "admin"
    EXPERT = "expert"
    DEVELOPER = "developer"
    END_USER = "end_user"


class RepoProvider(str, enum.Enum):
    """Git host for a connected repository."""

    GITHUB = "github"
    GITLAB = "gitlab"


class RepoConnectionStatus(str, enum.Enum):
    """Git connection / sync health for a connected repository."""

    CONNECTING = "connecting"
    CONNECTED = "connected"
    ERROR = "error"


class ProjectStatus(str, enum.Enum):
    """Project lifecycle / index health state."""

    ACTIVE = "active"
    INDEXED = "indexed"
    INDEXING = "indexing"
    STALE = "stale"
    CONNECTING = "connecting"
    ERROR = "error"


class JobStatus(str, enum.Enum):
    """Postgres-backed job queue row status."""

    PENDING = "pending"
    RUNNING = "running"
    DONE = "done"
    FAILED = "failed"


class RowStatus(str, enum.Enum):
    """Row visibility status on every table (`A` = Active, `D` = Deleted)."""

    ACTIVE = "A"
    DELETED = "D"
