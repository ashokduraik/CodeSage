"""Fixed service account UUIDs for audit attribution (must match API migration)."""

from __future__ import annotations

import logging
import uuid
from typing import Literal

from sqlalchemy import select
from sqlalchemy.orm import Session

from config.logging import get_indexing_logger, log_event
from config.startup import StartupConfigurationError
from models.enums import UserRole

ServiceComponent = Literal["api", "rag", "webhook"]

API_SYSTEM_USER_ID = uuid.UUID("a0000001-0000-4000-8000-000000000001")
RAG_WORKER_USER_ID = uuid.UUID("a0000001-0000-4000-8000-000000000002")
WEBHOOK_HANDLER_USER_ID = uuid.UUID("a0000001-0000-4000-8000-000000000003")

SYSTEM_USER_ROLE = "system"

SERVICE_USER_IDS: frozenset[uuid.UUID] = frozenset(
    {
        API_SYSTEM_USER_ID,
        RAG_WORKER_USER_ID,
        WEBHOOK_HANDLER_USER_ID,
    },
)

_COMPONENT_TO_ID: dict[ServiceComponent, uuid.UUID] = {
    "api": API_SYSTEM_USER_ID,
    "rag": RAG_WORKER_USER_ID,
    "webhook": WEBHOOK_HANDLER_USER_ID,
}


def resolve_service_user(component: ServiceComponent) -> uuid.UUID:
    """Return the fixed UUID for a component service account (no DB lookup).

    @param component - Internal writer component key.
    @returns Service user UUID matching the migration seed.
    """
    return _COMPONENT_TO_ID[component]


def is_service_user_id(user_id: uuid.UUID) -> bool:
    """Return whether ``user_id`` is a known service account UUID."""
    return user_id in SERVICE_USER_IDS


def _role_as_str(role: UserRole | str) -> str:
    """Normalize a user role column to its string value.

    @param role - ORM role enum or raw string from the database.
    @returns Role string (e.g. ``system``).
    """
    if isinstance(role, UserRole):
        return role.value
    return str(role)


def assert_service_users_exist(session: Session) -> None:
    """Verify seeded service users exist with role ``system`` (startup check).

    @param session - Open SQLAlchemy session.
    @raises StartupConfigurationError - When any expected service user is missing or wrong role.
    """
    from models import User

    rows = session.scalars(select(User).where(User.id.in_(SERVICE_USER_IDS))).all()
    found = {row.id: _role_as_str(row.role) for row in rows}
    expected = {
        API_SYSTEM_USER_ID: "api-system@codesage.internal",
        RAG_WORKER_USER_ID: "rag-worker@codesage.internal",
        WEBHOOK_HANDLER_USER_ID: "webhook-handler@codesage.internal",
    }
    for user_id, email in expected.items():
        role = found.get(user_id)
        if role is None:
            raise StartupConfigurationError(
                f"Database schema is not ready — service user {email} is missing. "
                "Apply migrations by starting the API once (npm run dev:api) or run "
                "docker compose up -d db migrate.",
            )
        if role != SYSTEM_USER_ROLE:
            raise StartupConfigurationError(
                f"Database schema is not ready — service user {email} has role {role}, "
                f"expected {SYSTEM_USER_ROLE}. Re-run migrations via npm run dev:api.",
            )
    log_event(
        get_indexing_logger(),
        logging.INFO,
        "Database schema ready — service users verified",
    )
