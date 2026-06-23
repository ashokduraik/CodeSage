"""Tests for job handler dispatch."""

import uuid
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from workers.handlers.dispatch import UnsupportedJobError, build_job_handlers, dispatch_job


def _job(job_type: str, payload: dict | None = None) -> SimpleNamespace:
    return SimpleNamespace(
        id=uuid.uuid4(),
        type=job_type,
        payload=payload or {},
    )


def test_dispatch_unknown_job_type() -> None:
    with pytest.raises(UnsupportedJobError):
        dispatch_job(_job("nope"), {})


def test_dispatch_unimplemented_known_type() -> None:
    with pytest.raises(UnsupportedJobError, match="No handler"):
        dispatch_job(_job("distill"), {"sync": lambda p: None})


def test_dispatch_calls_handler() -> None:
    seen: list[dict] = []
    dispatch_job(_job("sync", {"repoId": "x"}), {"sync": seen.append})
    assert seen == [{"repoId": "x"}]


def test_build_job_handlers_returns_phase1_types() -> None:
    settings = MagicMock()
    factory = MagicMock()
    handlers = build_job_handlers(settings, factory)
    assert set(handlers) == {"sync", "parse", "embed"}
