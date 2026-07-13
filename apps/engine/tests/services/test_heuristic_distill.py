"""Tests for graph-heuristic distillation."""

from __future__ import annotations

import uuid
from decimal import Decimal
from unittest.mock import MagicMock, patch

from config import Settings
from models import GraphNode
from services.distill.heuristic import run_heuristic_distillation


def _route_node(name: str, file_path: str) -> GraphNode:
    node = MagicMock(spec=GraphNode)
    node.id = uuid.uuid4()
    node.kind = "route"
    node.name = name
    node.file_path = file_path
    return node


def test_run_heuristic_distillation_writes_artifacts() -> None:
    session = MagicMock()
    project_id = uuid.uuid4()
    nodes = [_route_node("GET /api/users", "src/routes/users.ts")]

    workflows_repo = MagicMock()
    pages_repo = MagicMock()
    perms_repo = MagicMock()
    flows_repo = MagicMock()

    with patch("services.distill.heuristic.WorkflowRepository", return_value=workflows_repo):
        with patch("services.distill.heuristic.PageMapRepository", return_value=pages_repo):
            with patch("services.distill.heuristic.PermissionRuleRepository", return_value=perms_repo):
                with patch("services.distill.heuristic.DataFlowRepository", return_value=flows_repo):
                    result = run_heuristic_distillation(
                        session,
                        project_id,
                        nodes,
                        Settings(distill_heuristic_confidence=0.55),
                    )

    assert result.workflows == 1
    assert result.page_map == 1
    workflows_repo.upsert.assert_called_once()
    call_kwargs = workflows_repo.upsert.call_args.kwargs
    assert call_kwargs["confidence"] == Decimal("0.55")
