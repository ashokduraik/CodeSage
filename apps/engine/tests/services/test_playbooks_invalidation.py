"""Unit tests for playbook invalidation, anchor validation, and warm-start (plan 12)."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from config import Settings
from config import constants
from models.enums import RowStatus
from models.qa_playbook import QaPlaybook
from services.qa.playbooks import (
    PlaybookHint,
    execute_warm_start_steps,
    invalidate_playbooks_for_files,
    resolve_args_template,
    select_warm_start_playbook,
    validate_playbook_anchors,
)
from services.qa.tools import QaToolHit, QaToolResult


def _settings(**overrides: object) -> Settings:
    """Build Settings with playbook defaults for unit tests.

    @param overrides - Field overrides for the test.
    @returns Settings instance.
    """
    base: dict[str, object] = {
        "tei_base_url": "",
        "qa_playbook_learning_enabled": True,
        "qa_playbook_warm_start_enabled": False,
        "qa_playbook_warm_start_similarity": 0.92,
        "qa_playbook_max_per_project": 500,
        "qa_playbook_min_similarity": 0.85,
        "qa_playbook_merge_similarity": 0.95,
    }
    base.update(overrides)
    return Settings(**base)  # type: ignore[arg-type]


def _playbook_row(**overrides: object) -> QaPlaybook:
    """Build a QaPlaybook ORM instance for mocked repository returns.

    @param overrides - Attribute overrides.
    @returns QaPlaybook instance.
    """
    row = QaPlaybook(
        id=uuid.uuid4(),
        project_id=uuid.uuid4(),
        canonical_question="how is EMI calculated?",
        intent_profile="symbol_lookup",
        steps=[
            {
                "order": 1,
                "tool": "search_symbols",
                "argsTemplate": {"query": "{term:getMinEmi}"},
            }
        ],
        evidence_anchors=[{"filePath": "src/loan.utils.ts", "symbol": "getMinEmi"}],
        question_embedding=[0.1] * 8,
        success_count=3,
        last_success_at=datetime.now(timezone.utc),
        status=RowStatus.ACTIVE,
    )
    for key, value in overrides.items():
        setattr(row, key, value)
    return row


def _hint(**overrides: object) -> PlaybookHint:
    """Build a PlaybookHint for warm-start selection tests.

    @param overrides - Field overrides.
    @returns PlaybookHint instance.
    """
    values: dict[str, object] = {
        "playbook_id": uuid.uuid4(),
        "canonical_question": "how is EMI calculated?",
        "similarity": 0.95,
        "success_count": 3,
        "steps": [
            {
                "order": 1,
                "tool": "search_symbols",
                "argsTemplate": {"query": "{term:getMinEmi}"},
            }
        ],
        "evidence_anchors": [{"filePath": "src/loan.utils.ts", "symbol": "getMinEmi"}],
        "intent_profile": "symbol_lookup",
    }
    values.update(overrides)
    return PlaybookHint(**values)  # type: ignore[arg-type]


def test_invalidate_soft_deletes_matching_file_path() -> None:
    """Playbooks referencing a changed file path are soft-deleted."""
    session = MagicMock()
    project_id = uuid.uuid4()
    matching = _playbook_row(
        project_id=project_id,
        evidence_anchors=[{"filePath": "src/loan.utils.ts"}],
    )
    other = _playbook_row(
        project_id=project_id,
        evidence_anchors=[{"filePath": "src/other.ts"}],
    )
    with patch("services.qa.playbooks.QaPlaybookRepository") as repo_cls:
        repo = repo_cls.return_value
        repo.list_active.return_value = [matching, other]
        repo.soft_delete.return_value = True
        count = invalidate_playbooks_for_files(
            session,
            project_id=project_id,
            file_paths=["src/loan.utils.ts"],
        )
    assert count == 1
    repo.soft_delete.assert_called_once_with(matching.id)
    session.commit.assert_called_once()


def test_validate_anchors_false_when_file_gone() -> None:
    """Anchor validation fails when the file path has no active chunks."""
    session = MagicMock()
    project_id = uuid.uuid4()
    playbook = _playbook_row(
        project_id=project_id,
        evidence_anchors=[{"filePath": "src/missing.ts"}],
    )
    with (
        patch("services.qa.playbooks.CodeChunkRepository") as chunks_cls,
        patch("services.qa.playbooks.GraphNodeRepository") as nodes_cls,
    ):
        chunks_cls.return_value.has_active_path.return_value = False
        nodes_cls.return_value.get_by_id.return_value = None
        assert (
            validate_playbook_anchors(
                session, project_id=project_id, playbook=playbook
            )
            is False
        )
    chunks_cls.return_value.has_active_path.assert_called_once_with(
        project_id, "src/missing.ts"
    )


def test_validate_anchors_true_when_file_present() -> None:
    """Anchor validation passes when active chunks cover every file path."""
    session = MagicMock()
    project_id = uuid.uuid4()
    playbook = _playbook_row(project_id=project_id)
    with (
        patch("services.qa.playbooks.CodeChunkRepository") as chunks_cls,
        patch("services.qa.playbooks.GraphNodeRepository"),
    ):
        chunks_cls.return_value.has_active_path.return_value = True
        assert (
            validate_playbook_anchors(
                session, project_id=project_id, playbook=playbook
            )
            is True
        )


def test_warm_start_disabled_by_default() -> None:
    """Warm-start stays off when ``QA_PLAYBOOK_WARM_START_ENABLED`` is the default."""
    assert constants.QA_PLAYBOOK_WARM_START_ENABLED is False
    settings = _settings()
    assert settings.qa_playbook_warm_start_enabled is False
    assert select_warm_start_playbook(settings, [_hint()]) is None


def test_warm_start_runs_tools_when_enabled() -> None:
    """When enabled and similarity is high enough, warm-start executes playbook tools."""
    session = MagicMock()
    project_id = uuid.uuid4()
    hint = _hint(similarity=0.95)
    hit = QaToolHit(
        chunk_id=uuid.uuid4(),
        repo_id=uuid.uuid4(),
        file_path="src/loan.utils.ts",
        span={"startLine": 1, "endLine": 10},
        excerpt="function getMinEmi() {}",
        scores={"symbol": 0.9},
        graph_node_id=uuid.uuid4(),
    )
    tool_result = QaToolResult(
        tool_name="search_symbols",
        args={"query": "getMinEmi"},
        hits=[hit],
        truncated=False,
        duration_ms=12.0,
    )
    settings = _settings(qa_playbook_warm_start_enabled=True)
    assert select_warm_start_playbook(settings, [hint]) is hint
    with patch("services.qa.playbooks.execute_tool", return_value=tool_result) as exec_tool:
        steps = execute_warm_start_steps(
            session,
            settings,
            project_id=project_id,
            playbook=hint,
            terms=["getMinEmi", "emi"],
            repo_ids=None,
        )
    assert len(steps) == 1
    assert steps[0].result is tool_result
    exec_tool.assert_called_once()
    assert exec_tool.call_args.kwargs["tool_name"] == "search_symbols"
    assert exec_tool.call_args.kwargs["args"]["query"] == "getMinEmi"


def test_warm_start_falls_through_to_planner_on_low_confidence() -> None:
    """Warm-start may run tools yet leave confidence below the gate (planner from 2).

    Selection + execution are independent of the confidence gate: the agent loop
    evaluates the pool after warm-start and continues the planner when below
    ``QA_AGENT_MIN_CONFIDENCE``. This test asserts tools still run and return hits
    that would yield a sub-threshold pool when scores are weak.
    """
    session = MagicMock()
    hint = _hint(similarity=0.96)
    weak_hit = QaToolHit(
        chunk_id=uuid.uuid4(),
        repo_id=uuid.uuid4(),
        file_path="src/loan.utils.ts",
        span={"startLine": 1, "endLine": 2},
        excerpt="// weak",
        scores={"vector_distance": 0.9, "fused": 0.1},
    )
    tool_result = QaToolResult(
        tool_name="search_symbols",
        args={"query": "getMinEmi"},
        hits=[weak_hit],
        truncated=False,
        duration_ms=5.0,
    )
    settings = _settings(qa_playbook_warm_start_enabled=True)
    selected = select_warm_start_playbook(settings, [hint])
    assert selected is not None
    with patch("services.qa.playbooks.execute_tool", return_value=tool_result):
        steps = execute_warm_start_steps(
            session,
            settings,
            project_id=uuid.uuid4(),
            playbook=selected,
            terms=["getMinEmi"],
            repo_ids=None,
        )
    assert len(steps) == 1
    assert steps[0].result is not None
    assert steps[0].result.hits[0].scores.get("fused") == 0.1


def test_resolve_args_template_prefers_matching_term() -> None:
    """``{term:…}`` resolves to an exact match in the new question's terms."""
    resolved = resolve_args_template(
        {"query": "{term:getMinEmi}"},
        terms=["emi", "getMinEmi"],
        anchors=[],
    )
    assert resolved["query"] == "getMinEmi"


def test_resolve_args_template_anchor_graph_node() -> None:
    """``{anchor:graphNodeId}`` pulls from evidence anchors."""
    node_id = str(uuid.uuid4())
    resolved = resolve_args_template(
        {"nodeId": "{anchor:graphNodeId}"},
        terms=[],
        anchors=[{"filePath": "a.ts", "graphNodeId": node_id}],
    )
    assert resolved["nodeId"] == node_id


def test_select_warm_start_skips_below_similarity() -> None:
    """Hints below the warm-start similarity floor are not selected."""
    settings = _settings(qa_playbook_warm_start_enabled=True)
    assert select_warm_start_playbook(settings, [_hint(similarity=0.90)]) is None


def test_invalidate_returns_zero_for_empty_paths() -> None:
    """No-op when the changed-file list is empty."""
    session = MagicMock()
    assert (
        invalidate_playbooks_for_files(
            session, project_id=uuid.uuid4(), file_paths=[]
        )
        == 0
    )
    session.commit.assert_not_called()


def test_invalidate_matches_path_in_steps_template() -> None:
    """Steps that embed a concrete file path also trigger soft-delete."""
    session = MagicMock()
    project_id = uuid.uuid4()
    matching = _playbook_row(
        project_id=project_id,
        evidence_anchors=[{"filePath": "other.ts"}],
        steps=[
            {
                "order": 1,
                "tool": "read_symbol",
                "argsTemplate": {"qualified_name": "src/loan.utils.ts::getMinEmi"},
            }
        ],
    )
    with patch("services.qa.playbooks.QaPlaybookRepository") as repo_cls:
        repo = repo_cls.return_value
        repo.list_active.return_value = [matching]
        repo.soft_delete.return_value = True
        count = invalidate_playbooks_for_files(
            session,
            project_id=project_id,
            file_paths=["src/loan.utils.ts"],
        )
    assert count == 1


def test_validate_anchors_false_when_empty() -> None:
    """Playbooks with no evidence anchors are treated as invalid."""
    session = MagicMock()
    playbook = _playbook_row(evidence_anchors=[])
    assert (
        validate_playbook_anchors(
            session, project_id=playbook.project_id, playbook=playbook
        )
        is False
    )


def test_validate_anchors_false_for_bad_graph_node() -> None:
    """Missing or inactive graph nodes fail anchor validation."""
    session = MagicMock()
    project_id = uuid.uuid4()
    playbook = _playbook_row(
        project_id=project_id,
        evidence_anchors=[
            {"filePath": "src/loan.utils.ts", "graphNodeId": str(uuid.uuid4())}
        ],
    )
    with (
        patch("services.qa.playbooks.CodeChunkRepository") as chunks_cls,
        patch("services.qa.playbooks.GraphNodeRepository") as nodes_cls,
    ):
        chunks_cls.return_value.has_active_path.return_value = True
        nodes_cls.return_value.get_by_id.return_value = None
        assert (
            validate_playbook_anchors(
                session, project_id=project_id, playbook=playbook
            )
            is False
        )


def test_validate_anchors_false_for_invalid_node_uuid() -> None:
    """Non-UUID graphNodeId values fail validation."""
    session = MagicMock()
    project_id = uuid.uuid4()
    playbook = _playbook_row(
        project_id=project_id,
        evidence_anchors=[{"filePath": "src/a.ts", "graphNodeId": "not-a-uuid"}],
    )
    with patch("services.qa.playbooks.CodeChunkRepository") as chunks_cls:
        chunks_cls.return_value.has_active_path.return_value = True
        assert (
            validate_playbook_anchors(
                session, project_id=project_id, playbook=playbook
            )
            is False
        )


def test_resolve_term_falls_back_to_first_then_exemplar() -> None:
    """Term placeholder uses first new term, then the stored exemplar name."""
    assert resolve_args_template(
        {"query": "{term:getMinEmi}"},
        terms=["emi"],
        anchors=[],
    )["query"] == "emi"
    assert resolve_args_template(
        {"query": "{term:getMinEmi}"},
        terms=[],
        anchors=[],
    )["query"] == "getMinEmi"


def test_resolve_non_placeholder_and_non_string() -> None:
    """Literal args and non-string values pass through unchanged."""
    resolved = resolve_args_template(
        {"limit": 5, "query": "literal"},
        terms=[],
        anchors=[],
    )
    assert resolved == {"limit": 5, "query": "literal"}


def test_select_warm_start_skips_empty_steps() -> None:
    """Warm-start requires a non-empty step list."""
    settings = _settings(qa_playbook_warm_start_enabled=True)
    assert select_warm_start_playbook(settings, [_hint(steps=[])]) is None


def test_execute_warm_start_records_tool_errors() -> None:
    """Tool ValueError is recorded as a failed step without aborting the run."""
    session = MagicMock()
    hint = _hint()
    settings = _settings(qa_playbook_warm_start_enabled=True)
    with patch(
        "services.qa.playbooks.execute_tool",
        side_effect=ValueError("bad args"),
    ):
        steps = execute_warm_start_steps(
            session,
            settings,
            project_id=uuid.uuid4(),
            playbook=hint,
            terms=["getMinEmi"],
            repo_ids=None,
        )
    assert len(steps) == 1
    assert steps[0].result is None
    assert steps[0].error is not None


def test_execute_warm_start_skips_unknown_tools() -> None:
    """Non-retrieval step tools are ignored during warm-start."""
    session = MagicMock()
    hint = _hint(
        steps=[{"order": 1, "tool": "not_a_tool", "argsTemplate": {}}],
    )
    with patch("services.qa.playbooks.execute_tool") as exec_tool:
        steps = execute_warm_start_steps(
            session,
            _settings(qa_playbook_warm_start_enabled=True),
            project_id=uuid.uuid4(),
            playbook=hint,
            terms=[],
            repo_ids=None,
        )
    assert steps == []
    exec_tool.assert_not_called()


def test_find_similar_skips_invalid_anchors() -> None:
    """Hint retrieval silently drops playbooks that fail anchor validation."""
    from services.qa.playbooks import find_similar_playbooks

    session = MagicMock()
    row = _playbook_row()
    with (
        patch("services.qa.playbooks.EmbeddingClient") as embed_cls,
        patch("services.qa.playbooks.QaPlaybookRepository") as repo_cls,
        patch(
            "services.qa.playbooks.validate_playbook_anchors",
            return_value=False,
        ),
    ):
        embed_cls.return_value.embed_texts.return_value = [[0.4] * 8]
        repo_cls.return_value.similarity_search.return_value = [(row, 0.91)]
        hints = find_similar_playbooks(
            session,
            _settings(),
            project_id=row.project_id,
            question="how is EMI calculated?",
        )
    assert hints == []
