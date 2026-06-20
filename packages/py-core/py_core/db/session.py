"""Engine and session factory helpers."""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from typing import TYPE_CHECKING

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

if TYPE_CHECKING:
    from py_core.config import Settings


def create_engine_from_settings(settings: Settings) -> Engine:
    """Build a SQLAlchemy engine from application settings.

    @param settings - Loaded configuration including `database_url`.
    @returns A configured SQLAlchemy engine (pool pre-ping enabled).
    """
    database_url = settings.database_url
    if database_url.startswith("postgresql://"):
        database_url = database_url.replace("postgresql://", "postgresql+psycopg://", 1)
    return create_engine(database_url, pool_pre_ping=True)


def create_session_factory(engine: Engine) -> sessionmaker[Session]:
    """Create a session factory bound to the given engine.

    @param engine - SQLAlchemy engine.
    @returns A `sessionmaker` producing ORM sessions with autoflush disabled.
    """
    return sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


@contextmanager
def session_scope(session_factory: sessionmaker[Session]) -> Iterator[Session]:
    """Provide a transactional scope around a series of operations.

    Commits on success, rolls back on exception, and always closes the session.

    @param session_factory - Factory returned by {@link create_session_factory}.
    @yields An open SQLAlchemy session.
    """
    session = session_factory()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
