"""Shared fixtures for FastAPI tests that must not require a live database."""

from __future__ import annotations

from collections.abc import Iterator
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from api.main import create_app


@pytest.fixture
def rag_client() -> Iterator[TestClient]:
    """Yield a TestClient with startup DB checks and the worker loop stubbed."""
    engine = MagicMock()
    session = MagicMock()
    session_cm = MagicMock()
    session_cm.__enter__.return_value = session
    session_cm.__exit__.return_value = False
    session_factory = MagicMock(return_value=session_cm)

    with (
        patch("api.main.create_engine_from_settings", return_value=engine),
        patch("api.main.create_session_factory", return_value=session_factory),
        patch("api.main.assert_service_users_exist"),
        patch("api.main.run_worker_loop"),
    ):
        with TestClient(create_app()) as client:
            yield client
