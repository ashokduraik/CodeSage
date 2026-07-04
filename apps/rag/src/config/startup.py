"""Startup validation for required configuration and database connectivity."""

from __future__ import annotations

from urllib.parse import urlparse

from sqlalchemy import text
from sqlalchemy.engine import Engine

from config import Settings
from config.logging import get_indexing_logger, log_event, sanitize_log_message

import logging

_logger = get_indexing_logger()


class StartupConfigurationError(RuntimeError):
    """Raised when mandatory configuration is missing or the database is unreachable."""


def database_host_label(database_url: str) -> str:
    """Build a credential-free database location label for error messages.

    @param database_url - PostgreSQL connection URL.
    @returns Host, port, and database name without username or password.
    """
    parsed = urlparse(database_url)
    host = parsed.hostname or "unknown"
    port = parsed.port or 5432
    name = parsed.path.lstrip("/") or "unknown"
    return f"{host}:{port}/{name}"


def validate_settings(settings: Settings) -> None:
    """Verify mandatory environment variables before opening a database connection.

    @param settings - Loaded application settings.
    @raises StartupConfigurationError when required values are missing or invalid.
    """
    errors: list[str] = []

    database_url = settings.database_url.strip()
    if not database_url:
        errors.append(
            "DATABASE_URL is required. Copy apps/rag/.env.example to apps/rag/.env "
            "and set DATABASE_URL to your PostgreSQL instance.",
        )
    elif not database_url.startswith(("postgresql://", "postgres://")):
        errors.append(
            "DATABASE_URL must be a PostgreSQL URL starting with postgresql://.",
        )
    elif _database_url_has_unencoded_at_in_password(database_url):
        errors.append(
            "DATABASE_URL looks malformed — if your password contains '@', "
            "URL-encode it (e.g. Test@123 becomes Test%40123).",
        )

    if not settings.repo_clone_dir.strip():
        errors.append(
            "REPO_CLONE_DIR is required — set a local folder path where repositories "
            "are cloned (e.g. D:\\codesage\\repos on Windows).",
        )

    if errors:
        raise StartupConfigurationError(
            "RAG startup configuration is incomplete:\n- " + "\n- ".join(errors),
        )


def _database_url_has_unencoded_at_in_password(database_url: str) -> bool:
    """Return True when the URL authority likely contains a raw ``@`` in the password.

    @param database_url - PostgreSQL connection URL.
    """
    scheme_sep = "://"
    if scheme_sep not in database_url:
        return False
    authority = database_url.split(scheme_sep, 1)[1].split("/", 1)[0]
    return authority.count("@") > 1


def verify_database_connection(settings: Settings, engine: Engine) -> None:
    """Confirm PostgreSQL is reachable before starting the worker.

    @param settings - Loaded application settings (for host label in errors).
    @param engine - SQLAlchemy engine built from settings.
    @raises StartupConfigurationError when the database cannot be reached.
    """
    label = database_host_label(settings.database_url)
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception as exc:
        reason = sanitize_log_message(str(exc))
        raise StartupConfigurationError(
            f"Cannot connect to PostgreSQL at {label}. "
            "From the repo root run: docker compose up -d db migrate. "
            "Ensure DATABASE_URL in apps/rag/.env points at that database. "
            f"Reason: {reason}",
        ) from exc
    log_event(_logger, logging.INFO, f"Connected to PostgreSQL at {label}")
