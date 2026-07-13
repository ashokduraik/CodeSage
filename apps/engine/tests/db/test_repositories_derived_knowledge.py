"""Tests for derived-knowledge repositories."""

from __future__ import annotations

import uuid
from decimal import Decimal
from unittest.mock import MagicMock

from models.derived_knowledge import DataFlow, PageMap, PermissionRule, Workflow
from models.enums import RowStatus
from repositories.derived_knowledge import (
    DataFlowRepository,
    DerivedKnowledgeRepository,
    PageMapRepository,
    PermissionRuleRepository,
    WorkflowRepository,
)


def test_mark_stale_by_files_returns_zero_for_empty_paths() -> None:
    session = MagicMock()
    repo = DerivedKnowledgeRepository(session)
    assert repo.mark_stale_by_files(uuid.uuid4(), []) == 0
    session.execute.assert_not_called()


def test_mark_stale_by_files_updates_all_tables() -> None:
    session = MagicMock()
    session.execute.return_value = MagicMock(rowcount=2)
    repo = DerivedKnowledgeRepository(session)
    total = repo.mark_stale_by_files(uuid.uuid4(), ["src/auth.ts"])
    assert total == 8
    assert session.execute.call_count == 4


def test_get_stale_ids_collects_from_all_tables() -> None:
    session = MagicMock()
    stale_id = uuid.uuid4()
    scalar_result = MagicMock()
    scalar_result.all.return_value = [stale_id]
    session.scalars.return_value = scalar_result
    repo = DerivedKnowledgeRepository(session)
    assert repo.get_stale_ids(uuid.uuid4()) == [stale_id, stale_id, stale_id, stale_id]


def test_workflow_upsert_skips_expert_override() -> None:
    session = MagicMock()
    row_id = uuid.uuid4()
    existing = Workflow(
        project_id=uuid.uuid4(),
        name="checkout",
        steps=[],
        confidence=Decimal("0.9"),
        source_refs=[],
        is_expert_override=True,
        created_by=uuid.uuid4(),
        updated_by=uuid.uuid4(),
    )
    session.get.return_value = existing
    repo = WorkflowRepository(session)
    result = repo.upsert(
        project_id=existing.project_id,
        name="checkout",
        steps=[{"order": 1}],
        confidence=Decimal("0.5"),
        source_refs=[],
        row_id=row_id,
    )
    assert result is existing
    session.scalar.assert_not_called()


def test_workflow_upsert_creates_new_row() -> None:
    session = MagicMock()
    session.scalar.return_value = None
    project_id = uuid.uuid4()
    repo = WorkflowRepository(session)
    row = repo.upsert(
        project_id=project_id,
        name="login",
        steps=[{"order": 1, "label": "/login"}],
        confidence=Decimal("0.7"),
        source_refs=[{"kind": "file", "path": "src/login.ts"}],
    )
    assert row.name == "login"
    assert row.is_stale is False
    session.add.assert_called_once()
    session.flush.assert_called_once()


def test_page_map_list_by_project_filters_active() -> None:
    session = MagicMock()
    page = PageMap(
        project_id=uuid.uuid4(),
        route="/home",
        components=[],
        data_sources=[],
        confidence=Decimal("0.6"),
        source_refs=[],
        status=RowStatus.ACTIVE,
        created_by=uuid.uuid4(),
        updated_by=uuid.uuid4(),
    )
    session.scalars.return_value = iter([page])
    repo = PageMapRepository(session)
    assert repo.list_by_project(page.project_id) == [page]


def test_permission_rule_upsert_respects_existing_override() -> None:
    session = MagicMock()
    project_id = uuid.uuid4()
    existing = PermissionRule(
        project_id=project_id,
        target="/admin",
        required_permission="admin",
        confidence=Decimal("1"),
        source_refs=[],
        is_expert_override=True,
        created_by=uuid.uuid4(),
        updated_by=uuid.uuid4(),
    )
    session.scalar.return_value = existing
    repo = PermissionRuleRepository(session)
    result = repo.upsert(
        project_id=project_id,
        target="/admin",
        required_permission="user",
        confidence=Decimal("0.5"),
        source_refs=[],
    )
    assert result is existing


def test_data_flow_upsert_updates_existing_row() -> None:
    session = MagicMock()
    project_id = uuid.uuid4()
    existing = DataFlow(
        project_id=project_id,
        page_ref="/orders",
        source_chain=[],
        freshness_type="async",
        confidence=Decimal("0.5"),
        source_refs=[],
        created_by=uuid.uuid4(),
        updated_by=uuid.uuid4(),
    )
    session.scalar.return_value = existing
    repo = DataFlowRepository(session)
    row = repo.upsert(
        project_id=project_id,
        page_ref="/orders",
        source_chain=[{"hop": "GET /orders"}],
        freshness_type="cached",
        confidence=Decimal("0.8"),
        source_refs=[{"kind": "file", "path": "src/orders.ts"}],
    )
    assert row is existing
    assert row.freshness_type == "cached"
    assert row.is_stale is False
