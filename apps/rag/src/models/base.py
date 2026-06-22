"""SQLAlchemy declarative base and shared column helpers."""

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Root declarative base for all CodeSage ORM models."""
