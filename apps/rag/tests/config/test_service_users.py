"""Tests for fixed service user UUIDs and startup validation."""

from __future__ import annotations

import uuid
from unittest.mock import MagicMock

import pytest

from config.service_users import (
    API_SYSTEM_USER_ID,
    RAG_WORKER_USER_ID,
    WEBHOOK_HANDLER_USER_ID,
    assert_service_users_exist,
    is_service_user_id,
    resolve_service_user,
)
from models.enums import UserRole


def test_resolve_service_user_returns_fixed_uuids() -> None:
    """Each component maps to a distinct migration-seeded UUID."""
    assert resolve_service_user("api") == API_SYSTEM_USER_ID
    assert resolve_service_user("rag") == RAG_WORKER_USER_ID
    assert resolve_service_user("webhook") == WEBHOOK_HANDLER_USER_ID


def test_is_service_user_id_recognizes_seeded_ids() -> None:
    """Known service UUIDs are identified without a DB round-trip."""
    assert is_service_user_id(API_SYSTEM_USER_ID) is True
    assert is_service_user_id(uuid.UUID("00000000-0000-0000-0000-000000000099")) is False


def test_assert_service_users_exist_passes_when_all_present() -> None:
    """Startup check succeeds when every service user has role system."""
    session = MagicMock()
    user_api = MagicMock(id=API_SYSTEM_USER_ID, role=UserRole.SYSTEM)
    user_rag = MagicMock(id=RAG_WORKER_USER_ID, role=UserRole.SYSTEM)
    user_webhook = MagicMock(id=WEBHOOK_HANDLER_USER_ID, role=UserRole.SYSTEM)
    session.scalars.return_value.all.return_value = [user_api, user_rag, user_webhook]

    assert_service_users_exist(session)


def test_assert_service_users_exist_raises_when_missing() -> None:
    """Startup check fails when a seeded service user row is absent."""
    session = MagicMock()
    session.scalars.return_value.all.return_value = []

    with pytest.raises(RuntimeError, match="missing after migration"):
        assert_service_users_exist(session)


def test_assert_service_users_exist_raises_on_wrong_role() -> None:
    """Startup check fails when a service user exists but role is not system."""
    session = MagicMock()
    user_api = MagicMock(id=API_SYSTEM_USER_ID, role=UserRole.ADMIN)
    user_rag = MagicMock(id=RAG_WORKER_USER_ID, role=UserRole.SYSTEM)
    user_webhook = MagicMock(id=WEBHOOK_HANDLER_USER_ID, role=UserRole.SYSTEM)
    session.scalars.return_value.all.return_value = [user_api, user_rag, user_webhook]

    with pytest.raises(RuntimeError, match="expected system"):
        assert_service_users_exist(session)
