"""Procrastinate application (Postgres-backed job queue).

Skeleton wiring for Phase 3. Constructing the connector is lazy (no DB connection until
the worker runs). Not unit-covered (see pyproject coverage omit); integration-tested later.
"""

from procrastinate import App, PsycopgConnector

from config import load_settings


def build_app() -> App:
    """Build the Procrastinate app bound to the configured Postgres URL."""
    settings = load_settings()
    return App(connector=PsycopgConnector(conninfo=settings.database_url))
