"""Repositories for derived product knowledge tables."""

from __future__ import annotations

import uuid
from decimal import Decimal
from typing import Any

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from models.derived_knowledge import DataFlow, PageMap, PermissionRule, Workflow
from models.enums import RowStatus
from repositories.audit import RAG_ACTOR_ID, stamp_created, stamp_updated

SourceRef = dict[str, Any]

# Tables sharing staleness and override semantics for incremental distillation.
_DERIVED_TABLES = ("workflows", "page_map", "permission_rules", "data_flows")


class DerivedKnowledgeRepository:
    """Shared queries across all four derived-knowledge tables."""

    def __init__(self, session: Session) -> None:
        """Bind the repository to an open SQLAlchemy session.

        @param session - Active ORM session.
        """
        self._session = session

    def mark_stale_by_files(self, project_id: uuid.UUID, file_paths: list[str]) -> int:
        """Mark derived rows stale when their citations reference changed files.

        Skips expert-override rows so Phase 5 authoritative answers survive re-index.

        @param project_id - Owning project UUID.
        @param file_paths - Repo-relative paths touched by incremental parse.
        @returns Total rows marked stale across all derived tables.
        """
        if not file_paths:
            return 0
        total = 0
        for table in _DERIVED_TABLES:
            stmt = text(
                f"""
                UPDATE {table}
                SET is_stale = true,
                    updated_by = :updated_by
                WHERE project_id = :project_id
                  AND status = 'A'
                  AND is_expert_override = false
                  AND EXISTS (
                    SELECT 1
                    FROM jsonb_array_elements(source_refs) AS ref
                    WHERE ref->>'kind' = 'file'
                      AND ref->>'path' = ANY(:file_paths)
                  )
                """,
            )
            result = self._session.execute(
                stmt,
                {
                    "project_id": str(project_id),
                    "file_paths": file_paths,
                    "updated_by": str(RAG_ACTOR_ID),
                },
            )
            total += result.rowcount or 0
        return total

    def get_stale_ids(self, project_id: uuid.UUID) -> list[uuid.UUID]:
        """Collect UUIDs of stale derived artifacts for incremental distill jobs.

        @param project_id - Owning project UUID.
        @returns Artifact ids across workflows, page_map, permission_rules, data_flows.
        """
        stale_ids: list[uuid.UUID] = []
        for model in (Workflow, PageMap, PermissionRule, DataFlow):
            stmt = select(model.id).where(
                model.project_id == project_id,
                model.status == RowStatus.ACTIVE,
                model.is_stale.is_(True),
            )
            stale_ids.extend(self._session.scalars(stmt).all())
        return stale_ids

    def count_active_by_project(self, project_id: uuid.UUID) -> int:
        """Count all active derived-knowledge rows for a project.

        @param project_id - Owning project UUID.
        @returns Sum of rows across the four tables.
        """
        total = 0
        for model in (Workflow, PageMap, PermissionRule, DataFlow):
            stmt = (
                select(func.count())
                .select_from(model)
                .where(model.project_id == project_id, model.status == RowStatus.ACTIVE)
            )
            total += int(self._session.scalar(stmt) or 0)
        return total

    def count_all_active(self) -> int:
        """Count active derived-knowledge rows project-wide (dashboard aggregate).

        @returns Total active rows across all projects.
        """
        total = 0
        for model in (Workflow, PageMap, PermissionRule, DataFlow):
            stmt = (
                select(func.count())
                .select_from(model)
                .where(model.status == RowStatus.ACTIVE)
            )
            total += int(self._session.scalar(stmt) or 0)
        return total


class WorkflowRepository:
    """Data access for ``workflows``."""

    def __init__(self, session: Session) -> None:
        """Bind the repository to an open SQLAlchemy session."""
        self._session = session

    def list_by_project(self, project_id: uuid.UUID) -> list[Workflow]:
        """List active workflows for a project ordered by name."""
        stmt = (
            select(Workflow)
            .where(Workflow.project_id == project_id, Workflow.status == RowStatus.ACTIVE)
            .order_by(Workflow.name)
        )
        return list(self._session.scalars(stmt))

    def upsert(
        self,
        *,
        project_id: uuid.UUID,
        name: str,
        steps: list[Any],
        confidence: Decimal,
        source_refs: list[SourceRef],
        row_id: uuid.UUID | None = None,
    ) -> Workflow:
        """Insert or update a workflow, respecting expert overrides.

        @param project_id - Owning project UUID.
        @param name - Workflow name (e.g. checkout).
        @param steps - Ordered steps with citations.
        @param confidence - Model confidence 0–1.
        @param source_refs - Citation pointers.
        @param row_id - When set, update that row if not an expert override.
        @returns Persisted workflow row (flushed).
        """
        if row_id is not None:
            existing = self._session.get(Workflow, row_id)
            if existing is not None and existing.is_expert_override:
                return existing
        stmt = select(Workflow).where(
            Workflow.project_id == project_id,
            Workflow.name == name,
            Workflow.status == RowStatus.ACTIVE,
        )
        row = self._session.scalar(stmt)
        if row is not None and row.is_expert_override:
            return row
        if row is None:
            row = stamp_created(Workflow(project_id=project_id, name=name))
            self._session.add(row)
        row.steps = steps
        row.confidence = confidence
        row.source_refs = source_refs
        row.is_stale = False
        stamp_updated(row)
        self._session.flush()
        return row


class PageMapRepository:
    """Data access for ``page_map``."""

    def __init__(self, session: Session) -> None:
        """Bind the repository to an open SQLAlchemy session."""
        self._session = session

    def list_by_project(self, project_id: uuid.UUID) -> list[PageMap]:
        """List active page map entries for a project ordered by route."""
        stmt = (
            select(PageMap)
            .where(PageMap.project_id == project_id, PageMap.status == RowStatus.ACTIVE)
            .order_by(PageMap.route)
        )
        return list(self._session.scalars(stmt))

    def upsert(
        self,
        *,
        project_id: uuid.UUID,
        route: str,
        components: list[Any],
        data_sources: list[Any],
        confidence: Decimal,
        source_refs: list[SourceRef],
        row_id: uuid.UUID | None = None,
    ) -> PageMap:
        """Insert or update a page map row, respecting expert overrides."""
        if row_id is not None:
            existing = self._session.get(PageMap, row_id)
            if existing is not None and existing.is_expert_override:
                return existing
        stmt = select(PageMap).where(
            PageMap.project_id == project_id,
            PageMap.route == route,
            PageMap.status == RowStatus.ACTIVE,
        )
        row = self._session.scalar(stmt)
        if row is not None and row.is_expert_override:
            return row
        if row is None:
            row = stamp_created(PageMap(project_id=project_id, route=route))
            self._session.add(row)
        row.components = components
        row.data_sources = data_sources
        row.confidence = confidence
        row.source_refs = source_refs
        row.is_stale = False
        stamp_updated(row)
        self._session.flush()
        return row


class PermissionRuleRepository:
    """Data access for ``permission_rules``."""

    def __init__(self, session: Session) -> None:
        """Bind the repository to an open SQLAlchemy session."""
        self._session = session

    def list_by_project(self, project_id: uuid.UUID) -> list[PermissionRule]:
        """List active permission rules for a project ordered by target."""
        stmt = (
            select(PermissionRule)
            .where(PermissionRule.project_id == project_id, PermissionRule.status == RowStatus.ACTIVE)
            .order_by(PermissionRule.target)
        )
        return list(self._session.scalars(stmt))

    def upsert(
        self,
        *,
        project_id: uuid.UUID,
        target: str,
        required_permission: str,
        confidence: Decimal,
        source_refs: list[SourceRef],
        row_id: uuid.UUID | None = None,
    ) -> PermissionRule:
        """Insert or update a permission rule, respecting expert overrides."""
        if row_id is not None:
            existing = self._session.get(PermissionRule, row_id)
            if existing is not None and existing.is_expert_override:
                return existing
        stmt = select(PermissionRule).where(
            PermissionRule.project_id == project_id,
            PermissionRule.target == target,
            PermissionRule.required_permission == required_permission,
            PermissionRule.status == RowStatus.ACTIVE,
        )
        row = self._session.scalar(stmt)
        if row is not None and row.is_expert_override:
            return row
        if row is None:
            row = stamp_created(PermissionRule(
                project_id=project_id,
                target=target,
                required_permission=required_permission,
            ))
            self._session.add(row)
        row.confidence = confidence
        row.source_refs = source_refs
        row.is_stale = False
        stamp_updated(row)
        self._session.flush()
        return row


class DataFlowRepository:
    """Data access for ``data_flows``."""

    def __init__(self, session: Session) -> None:
        """Bind the repository to an open SQLAlchemy session."""
        self._session = session

    def list_by_project(self, project_id: uuid.UUID) -> list[DataFlow]:
        """List active data flows for a project ordered by page reference."""
        stmt = (
            select(DataFlow)
            .where(DataFlow.project_id == project_id, DataFlow.status == RowStatus.ACTIVE)
            .order_by(DataFlow.page_ref)
        )
        return list(self._session.scalars(stmt))

    def upsert(
        self,
        *,
        project_id: uuid.UUID,
        page_ref: str,
        source_chain: list[Any],
        freshness_type: str,
        confidence: Decimal,
        source_refs: list[SourceRef],
        row_id: uuid.UUID | None = None,
    ) -> DataFlow:
        """Insert or update a data flow row, respecting expert overrides."""
        if row_id is not None:
            existing = self._session.get(DataFlow, row_id)
            if existing is not None and existing.is_expert_override:
                return existing
        stmt = select(DataFlow).where(
            DataFlow.project_id == project_id,
            DataFlow.page_ref == page_ref,
            DataFlow.status == RowStatus.ACTIVE,
        )
        row = self._session.scalar(stmt)
        if row is not None and row.is_expert_override:
            return row
        if row is None:
            row = stamp_created(DataFlow(project_id=project_id, page_ref=page_ref))
            self._session.add(row)
        row.source_chain = source_chain
        row.freshness_type = freshness_type
        row.confidence = confidence
        row.source_refs = source_refs
        row.is_stale = False
        stamp_updated(row)
        self._session.flush()
        return row
