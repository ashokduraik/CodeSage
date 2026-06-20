"""Tests for engine and session helpers."""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from py_core.config import load_settings
from py_core.db.session import (
    create_engine_from_settings,
    create_session_factory,
    session_scope,
)


def test_create_engine_from_settings() -> None:
    settings = load_settings()
    engine = create_engine_from_settings(settings)
    assert str(engine.url).startswith("postgresql")


def test_create_session_factory() -> None:
    settings = load_settings()
    engine = create_engine_from_settings(settings)
    factory = create_session_factory(engine)
    assert factory.kw["autoflush"] is False


def test_session_scope_commits_on_success() -> None:
    session = MagicMock()
    factory = MagicMock(return_value=session)

    with session_scope(factory):
        pass

    session.commit.assert_called_once()
    session.close.assert_called_once()
    session.rollback.assert_not_called()


def test_session_scope_rolls_back_on_error() -> None:
    session = MagicMock()
    factory = MagicMock(return_value=session)

    with pytest.raises(RuntimeError, match="boom"):
        with session_scope(factory):
            raise RuntimeError("boom")

    session.rollback.assert_called_once()
    session.close.assert_called_once()
    session.commit.assert_not_called()
