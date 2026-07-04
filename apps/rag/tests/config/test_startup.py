"""Tests for RAG startup configuration validation."""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest
from sqlalchemy.exc import OperationalError

from config import Settings
from config.startup import (
    StartupConfigurationError,
    database_host_label,
    validate_settings,
    verify_database_connection,
)


def test_database_host_label_omits_credentials() -> None:
    label = database_host_label("postgresql://user:secret@db.example.com:5432/codesage")
    assert label == "db.example.com:5432/codesage"
    assert "secret" not in label
    assert "user" not in label


def test_validate_settings_requires_database_url() -> None:
    with pytest.raises(StartupConfigurationError, match="DATABASE_URL is required"):
        validate_settings(Settings(database_url="  ", repo_clone_dir="/tmp/repos"))


def test_validate_settings_requires_postgresql_scheme() -> None:
    with pytest.raises(StartupConfigurationError, match="PostgreSQL URL"):
        validate_settings(Settings(database_url="mysql://localhost/db", repo_clone_dir="/tmp"))


def test_validate_settings_requires_repo_clone_dir() -> None:
    with pytest.raises(StartupConfigurationError, match="REPO_CLONE_DIR is required"):
        validate_settings(
            Settings(
                database_url="postgresql://codesage:pw@localhost:5432/codesage",
                repo_clone_dir="   ",
            ),
        )


def test_validate_settings_passes_with_required_values() -> None:
    validate_settings(
        Settings(
            database_url="postgresql://codesage:pw@localhost:5432/codesage",
            repo_clone_dir="/tmp/repos",
        ),
    )


def test_validate_settings_rejects_unencoded_at_in_password() -> None:
    with pytest.raises(StartupConfigurationError, match="URL-encode"):
        validate_settings(
            Settings(
                database_url="postgresql://codesage_dba:Test@123@localhost:5432/codesage_db",
                repo_clone_dir="/tmp/repos",
            ),
        )


def test_verify_database_connection_raises_when_unreachable() -> None:
    engine = MagicMock()
    engine.connect.side_effect = OperationalError("stmt", {}, Exception("connection refused"))

    with pytest.raises(StartupConfigurationError, match="Cannot connect to PostgreSQL") as raised:
        verify_database_connection(
            Settings(database_url="postgresql://codesage:pw@localhost:5432/codesage"),
            engine,
        )

    assert "localhost:5432/codesage" in str(raised.value)
    assert "docker compose up -d db migrate" in str(raised.value)


def test_verify_database_connection_passes_on_select_one(capsys: pytest.CaptureFixture[str]) -> None:
    from config.logging import configure_logging

    configure_logging(Settings(log_level="info"))

    engine = MagicMock()
    connection = MagicMock()
    engine.connect.return_value.__enter__.return_value = connection

    verify_database_connection(
        Settings(database_url="postgresql://codesage:pw@localhost:5432/codesage"),
        engine,
    )
    connection.execute.assert_called_once()
    assert "Connected to PostgreSQL" in capsys.readouterr().err
