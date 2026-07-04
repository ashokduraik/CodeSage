"""Fixed service account UUIDs for audit attribution (must match API migration)."""

from __future__ import annotations

import uuid
from typing import Literal

from sqlalchemy import select
from sqlalchemy.orm import Session

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


def assert_service_users_exist(session: Session) -> None:
    """Verify seeded service users exist with role ``system`` (startup check).

    @param session - Open SQLAlchemy session.
    @raises RuntimeError - When any expected service user is missing or wrong role.
    """
    from models import User

    rows = session.scalars(select(User).where(User.id.in_(SERVICE_USER_IDS))).all()
    found = {row.id: row.role.value for row in rows}
    expected = {
        API_SYSTEM_USER_ID: "api-system@codesage.internal",
        RAG_WORKER_USER_ID: "rag-worker@codesage.internal",
        WEBHOOK_HANDLER_USER_ID: "webhook-handler@codesage.internal",
    }
    for user_id, email in expected.items():
        role = found.get(user_id)
        if role is None:
            raise RuntimeError(f"Service user missing after migration: {email} ({user_id})")
        if role != SYSTEM_USER_ROLE:
            raise RuntimeError(f"Service user {email} has role {role}, expected system")
