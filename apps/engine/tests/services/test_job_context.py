"""Tests for indexing job context resolution."""

from __future__ import annotations

import uuid

from config.service_users import WEBHOOK_HANDLER_USER_ID
from services.indexing.job_context import resolve_run_id, resolve_trigger


def test_resolve_run_id_sync_uses_job_id() -> None:
    job_id = uuid.uuid4()
    assert resolve_run_id("sync", {"repoId": str(uuid.uuid4())}, job_id) == job_id


def test_resolve_run_id_parse_uses_payload_run_id() -> None:
    run_id = uuid.uuid4()
    job_id = uuid.uuid4()
    assert resolve_run_id("parse", {"runId": str(run_id)}, job_id) == run_id


def test_resolve_trigger_from_payload() -> None:
    assert resolve_trigger("sync", {"trigger": "initial_attach"}, None) == "initial_attach"


def test_resolve_trigger_webhook_handler() -> None:
    assert (
        resolve_trigger("sync", {"repoId": str(uuid.uuid4())}, WEBHOOK_HANDLER_USER_ID)
        == "webhook_push"
    )


def test_resolve_trigger_manual_sync_fallback() -> None:
    human = uuid.uuid4()
    assert resolve_trigger("sync", {"repoId": str(uuid.uuid4())}, human) == "manual_sync"
