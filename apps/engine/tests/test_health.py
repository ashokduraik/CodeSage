"""Health and app lifespan tests."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from api.main import create_app
from config import Settings


def test_health_ok(engine_client) -> None:
    response = engine_client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["service"] == "engine"
    assert body["plannerTools"] in ("ok", "unsupported")


def test_lifespan_skips_freshness_poll_thread_when_disabled() -> None:
    """Poll daemon must not start when FRESHNESS_POLL_ENABLED is false."""
    engine = MagicMock()
    session = MagicMock()
    session_cm = MagicMock()
    session_cm.__enter__.return_value = session
    session_cm.__exit__.return_value = False
    session_factory = MagicMock(return_value=session_cm)

    with (
        patch("api.main.validate_settings"),
        patch("api.main.verify_database_connection"),
        patch("api.main.create_engine_from_settings", return_value=engine),
        patch("api.main.create_session_factory", return_value=session_factory),
        patch("api.main.assert_service_users_exist"),
        patch("api.main.run_worker_loop"),
        patch("api.main.run_freshness_poll_loop") as poll_loop,
        patch("api.main._settings", Settings(freshness_poll_enabled=False)),
    ):
        with TestClient(create_app()) as _client:
            pass

    poll_loop.assert_not_called()

