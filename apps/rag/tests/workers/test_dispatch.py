"""Tests for job handler dispatch."""

import uuid
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from tests.helpers import make_exec_ctx
from workers.handlers.dispatch import UnsupportedJobError, build_job_handlers, dispatch_job


def _job(job_type: str, payload: dict | None = None) -> SimpleNamespace:
    return SimpleNamespace(
        id=uuid.uuid4(),
        type=job_type,
        payload=payload or {},
    )


def test_dispatch_unknown_job_type() -> None:
    with pytest.raises(UnsupportedJobError):
        dispatch_job(_job("nope"), {}, make_exec_ctx(), MagicMock())


def test_dispatch_unimplemented_known_type() -> None:
    with pytest.raises(UnsupportedJobError, match="No handler"):
        dispatch_job(_job("distill"), {"sync": lambda p, c, s: None}, make_exec_ctx(), MagicMock())


def test_dispatch_calls_handler() -> None:
    seen: list[dict] = []

    def handler(payload: dict, _ctx: object, _session: MagicMock) -> None:
        seen.append(payload)

    dispatch_job(
        _job("sync", {"repoId": "x"}),
        {"sync": handler},
        make_exec_ctx(),
        MagicMock(),
    )
    assert seen == [{"repoId": "x"}]


def test_build_job_handlers_returns_phase1_types() -> None:
    settings = MagicMock()
    factory = MagicMock()
    handlers = build_job_handlers(settings, factory)
    assert set(handlers) == {"sync", "parse", "embed"}
