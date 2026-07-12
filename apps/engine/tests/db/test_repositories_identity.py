"""Tests for identity repositories."""

from __future__ import annotations

import uuid
from unittest.mock import MagicMock

from models import User
from repositories.identity import UserRepository


def test_get_by_id() -> None:
    session = MagicMock()
    user_id = uuid.uuid4()
    user = User(email="a@b.c", password_hash="hash")
    session.get.return_value = user

    repo = UserRepository(session)
    assert repo.get_by_id(user_id) is user
    session.get.assert_called_once_with(User, user_id)


def test_get_by_email() -> None:
    session = MagicMock()
    user = User(email="a@b.c", password_hash="hash")
    session.scalar.return_value = user

    repo = UserRepository(session)
    assert repo.get_by_email("a@b.c") is user
    session.scalar.assert_called_once()
