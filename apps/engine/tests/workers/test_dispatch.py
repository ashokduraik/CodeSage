"""Tests for job handler dispatch."""

from __future__ import annotations

import uuid
from unittest.mock import MagicMock

import pytest

from config import Settings
from tests.helpers import make_exec_ctx
from workers.handlers.dispatch import UnsupportedJobError, build_job_handlers, dispatch_job


def test_build_job_handlers_includes_xrepo() -> None:
    handlers = build_job_handlers(Settings(), MagicMock())
    assert "xrepo" in handlers


def test_dispatch_job_unknown_type() -> None:
    job = MagicMock(type="distill", payload={})
    with pytest.raises(UnsupportedJobError, match="Unknown job type"):
        dispatch_job(job, {}, MagicMock(), MagicMock())


def test_dispatch_job_unregistered_handler() -> None:
    job = MagicMock(type="sync", payload={})
    with pytest.raises(UnsupportedJobError, match="No handler registered"):
        dispatch_job(job, {}, MagicMock(), MagicMock())


def test_dispatch_job_invokes_handler() -> None:
    job = MagicMock(type="xrepo", payload={"projectId": str(uuid.uuid4())})
    handler = MagicMock()
    ctx = make_exec_ctx(job_type="xrepo")
    session = MagicMock()
    dispatch_job(job, {"xrepo": handler}, ctx, session)
    handler.assert_called_once_with(job.payload, ctx, session)
