"""Repository for `users` table access."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from py_core.db.models import User


class UserRepository:
    """Data access for user accounts."""

    def __init__(self, session: Session) -> None:
        """Bind the repository to an open SQLAlchemy session.

        @param session - Active ORM session (caller owns transaction boundaries).
        """
        self._session = session

    def get_by_id(self, user_id: uuid.UUID) -> User | None:
        """Fetch a user by primary key.

        @param user_id - User UUID.
        @returns The user row or `None`.
        """
        return self._session.get(User, user_id)

    def get_by_email(self, email: str) -> User | None:
        """Fetch a user by unique email address.

        @param email - Normalized email string.
        @returns The user row or `None`.
        """
        stmt = select(User).where(User.email == email)
        return self._session.scalar(stmt)
