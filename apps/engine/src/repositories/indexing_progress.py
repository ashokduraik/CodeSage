"""Repository for append-only repo indexing progress events."""

from __future__ import annotations

from sqlalchemy.orm import Session

from models.indexing_progress import RepoIndexingEvent


class RepoIndexingEventRepository:
    """Data access for ``repo_indexing_events``."""

    def __init__(self, session: Session) -> None:
        """Bind the repository to an open SQLAlchemy session.

        @param session - Active ORM session.
        """
        self._session = session

    def insert(self, event: RepoIndexingEvent) -> RepoIndexingEvent:
        """Persist one progress event row (append-only).

        @param event - Stamped ORM instance ready to flush.
        @returns The flushed event row.
        """
        self._session.add(event)
        self._session.flush()
        return event
