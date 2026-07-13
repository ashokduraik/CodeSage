"""Tests for distillation pipeline orchestration."""

from __future__ import annotations

import uuid
from unittest.mock import ANY, MagicMock, patch

from config import Settings
from services.distill.heuristic import DistillResult
from services.distill.pipeline import run_distillation, _persist_llm_payload


def test_run_distillation_uses_incremental_path_for_stale_ids() -> None:
    session = MagicMock()
    project_id = uuid.uuid4()
    stale_ids = [uuid.uuid4()]
    expected = DistillResult(1, 0, 0, 0)
    with patch(
        "services.distill.pipeline.run_incremental_heuristic",
        return_value=expected,
    ) as incremental:
        result = run_distillation(
            session,
            project_id,
            Settings(),
            stale_artifact_ids=stale_ids,
        )
    incremental.assert_called_once_with(session, project_id, stale_ids, ANY)
    assert result == expected


def test_run_distillation_falls_back_to_heuristic_without_llm() -> None:
    session = MagicMock()
    project_id = uuid.uuid4()
    nodes = []
    expected = DistillResult(2, 1, 1, 1)
    with patch("services.distill.pipeline.discover_entrypoints", return_value=nodes):
        with patch("services.distill.pipeline.expand_entrypoint_context", return_value=nodes):
            with patch(
                "services.distill.pipeline.run_heuristic_distillation",
                return_value=expected,
            ) as heuristic:
                result = run_distillation(
                    session,
                    project_id,
                    Settings(vllm_base_url="", vllm_model=""),
                )
    heuristic.assert_called_once()
    assert result == expected


def test_persist_llm_payload_writes_all_artifact_types() -> None:
    session = MagicMock()
    project_id = uuid.uuid4()
    payload = {
        "workflows": [{"name": "checkout", "steps": [], "confidence": 0.8, "source_refs": []}],
        "page_map": [
            {
                "route": "/checkout",
                "components": [],
                "data_sources": [],
                "confidence": 0.7,
                "source_refs": [],
            },
        ],
        "permission_rules": [
            {
                "target": "/admin",
                "required_permission": "admin",
                "confidence": 0.6,
                "source_refs": [],
            },
        ],
        "data_flows": [
            {
                "page_ref": "/orders",
                "source_chain": [],
                "freshness_type": "cached",
                "confidence": 0.65,
                "source_refs": [],
            },
        ],
    }
    with patch("repositories.WorkflowRepository") as wf_cls:
        with patch("repositories.PageMapRepository") as page_cls:
            with patch("repositories.PermissionRuleRepository") as perm_cls:
                with patch("repositories.DataFlowRepository") as flow_cls:
                    result = _persist_llm_payload(session, project_id, payload)
    assert result == DistillResult(1, 1, 1, 1)
    wf_cls.return_value.upsert.assert_called_once()
    page_cls.return_value.upsert.assert_called_once()
    perm_cls.return_value.upsert.assert_called_once()
    flow_cls.return_value.upsert.assert_called_once()
