"""Golden regression matrix for agent-orchestrated developer QA."""

from __future__ import annotations

import json
from collections.abc import Callable, Iterator
from dataclasses import dataclass
from typing import Any
from unittest.mock import MagicMock

import pytest

from config import Settings
from services.llm.vllm_client import ParsedToolCall, PlannerTurnResult
from services.qa.agent_loop import stream_agent_answer
from services.qa.tools import QaToolHit, QaToolResult
from tests.fixtures.agent_qa_seed import AgentQaSeed, build_agent_qa_seed


@dataclass(frozen=True)
class GoldenRun:
    """Observed SSE events and tool names from one scripted agent run.

    @param events - Decoded EngineAnswerChunk payloads.
    @param tool_names - Retrieval tools invoked in order.
    """

    events: list[dict[str, Any]]
    tool_names: list[str]


def _parse_events(raw_events: Iterator[str]) -> list[dict[str, Any]]:
    """Decode SSE data lines emitted by the agent loop.

    @param raw_events - SSE-framed event iterator.
    @returns JSON payloads in stream order.
    """
    return [
        json.loads(event.removeprefix("data: ").strip())
        for event in raw_events
        if event.removeprefix("data: ").strip()
    ]


def _turn(tool_name: str, **arguments: Any) -> PlannerTurnResult:
    """Build one scripted planner turn containing a single tool call.

    @param tool_name - Registered QA tool name.
    @param arguments - JSON-compatible tool arguments.
    @returns Planner turn consumed by the orchestration loop.
    """
    return PlannerTurnResult(
        tool_calls=[
            ParsedToolCall(
                name=tool_name,
                arguments=arguments,
                id=f"call_{tool_name}",
            )
        ]
    )


def _scripted_planner(
    turns: list[PlannerTurnResult],
) -> Callable[..., PlannerTurnResult]:
    """Return a planner callable that consumes deterministic turns.

    @param turns - Planner outputs in expected iteration order.
    @returns Callable matching ``complete_with_tools``.
    """
    scripted = iter(turns)

    def _next(*_args: object, **_kwargs: object) -> PlannerTurnResult:
        """Return the next scripted planner output.

        @returns Next configured planner turn.
        @raises StopIteration - When the loop exceeds the expected iterations.
        """
        return next(scripted)

    return _next


def _run_scripted_question(
    monkeypatch: pytest.MonkeyPatch,
    seed: AgentQaSeed,
    *,
    question: str,
    turns: list[PlannerTurnResult],
    hits_by_tool: dict[str, list[QaToolHit]] | None = None,
    confidence_outcomes: list[tuple[float, bool]] | None = None,
) -> GoldenRun:
    """Run the public agent stream with deterministic planner and retrieval outputs.

    @param monkeypatch - Pytest patch helper.
    @param seed - Golden indexed snapshot.
    @param question - Developer question under test.
    @param turns - Scripted planner turns.
    @param hits_by_tool - Tool name to deterministic hits.
    @param confidence_outcomes - Gate results in iteration order.
    @returns Decoded stream and invoked tool names.
    """
    max_iterations = max(len(turns), 1)
    settings = Settings(
        qa_agent_max_iterations=max_iterations,
        qa_agent_min_confidence=0.8,
        llm_max_context_tokens=8192,
        vllm_model="golden-test-model",
    )
    session = MagicMock()
    session_factory = MagicMock(return_value=session)
    tool_names: list[str] = []
    configured_hits = hits_by_tool or {}

    monkeypatch.setattr(
        "services.qa.agent_loop.find_similar_playbooks",
        lambda *a, **k: [],
    )
    monkeypatch.setattr(
        "services.qa.agent_loop.promote_trace_to_playbook",
        lambda *a, **k: None,
    )

    monkeypatch.setattr(
        "services.qa.agent_loop.complete_with_tools",
        _scripted_planner(turns),
    )

    def _execute(
        _session: object,
        _settings: Settings,
        *,
        project_id: object,
        tool_name: str,
        args: dict[str, Any],
        repo_ids: list[object] | None,
    ) -> QaToolResult:
        """Return fixture hits for one scripted retrieval tool.

        @param _session - Unused mocked database session.
        @param _settings - Agent settings.
        @param project_id - Project scope supplied by the loop.
        @param tool_name - Invoked tool name.
        @param args - Planner-provided tool arguments.
        @param repo_ids - Optional repository filter.
        @returns Stable tool result.
        """
        assert project_id == seed.project.id
        assert repo_ids is None
        tool_names.append(tool_name)
        return QaToolResult(
            tool_name=tool_name,
            args=args,
            hits=configured_hits.get(tool_name, []),
            truncated=False,
            duration_ms=1.0,
        )

    monkeypatch.setattr("services.qa.agent_loop.execute_tool", _execute)

    outcomes = iter(confidence_outcomes or [(0.9, True)])

    def _confidence(*_args: object, **_kwargs: object) -> tuple[float, bool]:
        """Return the next deterministic confidence-gate result.

        @returns Configured confidence and pass/fail decision.
        """
        return next(outcomes)

    monkeypatch.setattr(
        "services.qa.agent_loop.evaluate_evidence_confidence",
        _confidence,
    )

    def _final_answer(
        _settings: Settings,
        *,
        question: str,
        context_blocks: list[str],
        history: list[dict[str, str]] | None = None,
        stats: object | None = None,
    ) -> Iterator[str]:
        """Yield a deterministic answer after asserting evidence was packed.

        @param _settings - Agent settings.
        @param question - Current developer question.
        @param context_blocks - Evidence-only final context.
        @param history - Trimmed conversation history.
        @param stats - Mutable stream metrics object.
        @yields One grounded answer token.
        """
        assert question
        assert context_blocks
        _ = history
        _ = stats
        yield "Grounded answer from the golden fixture."

    monkeypatch.setattr(
        "services.qa.agent_loop.stream_final_answer",
        _final_answer,
    )

    events = _parse_events(
        stream_agent_answer(
            settings,
            session_factory,
            question=question,
            project_id=seed.project.id,
        )
    )
    session.close.assert_called_once()
    return GoldenRun(events=events, tool_names=tool_names)


def _event_types(run: GoldenRun) -> list[str]:
    """Return event discriminators from one golden run.

    @param run - Completed scripted run.
    @returns SSE event types in stream order.
    """
    return [str(event["type"]) for event in run.events]


def _citation_paths(run: GoldenRun) -> list[str]:
    """Return file paths from citation chunks.

    @param run - Completed scripted run.
    @returns Cited repository-relative paths.
    """
    return [
        str(event["citation"]["filePath"])
        for event in run.events
        if event["type"] == "citation"
    ]


def test_g1_get_min_emi_cites_implementation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """G1 resolves the exact symbol and answers with its implementation citation."""
    seed = build_agent_qa_seed()
    hit = seed.hit_for_path(
        "src/loan.utils.ts",
        scores={"symbol": 0.99},
        graph_node_name="getMinEmi",
    )
    run = _run_scripted_question(
        monkeypatch,
        seed,
        question="what does getMinEmi do?",
        turns=[_turn("search_symbols", query="getMinEmi")],
        hits_by_tool={"search_symbols": [hit]},
    )

    assert run.tool_names == ["search_symbols"]
    assert "src/loan.utils.ts" in _citation_paths(run)
    assert "token" in _event_types(run)
    assert "abstain" not in _event_types(run)


def test_g2_emi_calculation_exercises_confidence_path(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """G2 uses hybrid evidence and reports the deterministic confidence metric."""
    seed = build_agent_qa_seed()
    hit = seed.hit_for_path(
        "src/loan.utils.ts",
        scores={"symbol": 0.92, "keyword": 0.84, "fused": 0.05},
    )
    run = _run_scripted_question(
        monkeypatch,
        seed,
        question="how is EMI calculated?",
        turns=[_turn("search_hybrid", query="how is EMI calculated?")],
        hits_by_tool={"search_hybrid": [hit]},
        confidence_outcomes=[(0.87, True)],
    )

    assert run.tool_names == ["search_hybrid"]
    assert any("loan" in path for path in _citation_paths(run))
    metrics = next(
        event["metrics"] for event in run.events if event["type"] == "metrics"
    )
    assert metrics["evidenceConfidence"] == 0.87
    assert metrics["agentIterations"] == 1


def test_g3_user_service_uses_symbol_tool(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """G3 finds the fixture's UserService definition through symbol lookup."""
    seed = build_agent_qa_seed()
    hit = seed.hit_for_path(
        "src/services/user.service.ts",
        scores={"symbol": 0.98},
        graph_node_name="UserService",
    )
    run = _run_scripted_question(
        monkeypatch,
        seed,
        question="where is UserService defined?",
        turns=[_turn("search_symbols", query="UserService")],
        hits_by_tool={"search_symbols": [hit]},
    )

    assert run.tool_names == ["search_symbols"]
    assert _citation_paths(run) == ["src/services/user.service.ts"]
    assert "abstain" not in _event_types(run)


def test_g4_hello_is_social_reply_without_retrieval(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """G4 returns a social reply without retrieval or abstention."""
    seed = build_agent_qa_seed()
    run = _run_scripted_question(
        monkeypatch,
        seed,
        question="hello",
        turns=[
            PlannerTurnResult(
                tool_calls=[],
                assistant_content="Hello! Ask me about the indexed code.",
            )
        ],
    )

    assert run.tool_names == []
    assert _event_types(run) == ["token", "done"]
    assert "abstain" not in _event_types(run)


def test_g5_unknown_concept_abstains_after_max_iterations(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """G5 exhausts scripted searches and abstains instead of hallucinating."""
    seed = build_agent_qa_seed()
    turns = [
        _turn("search_hybrid", query="quantum_flux_capacitor"),
        _turn("search_code", query="quantum_flux_capacitor"),
        _turn("search_vectors", query="quantum flux capacitor"),
    ]
    run = _run_scripted_question(
        monkeypatch,
        seed,
        question="how does quantum_flux_capacitor work?",
        turns=turns,
        confidence_outcomes=[(0.0, False)] * len(turns),
    )

    assert run.tool_names == [
        "search_hybrid",
        "search_code",
        "search_vectors",
    ]
    assert _citation_paths(run) == []
    assert _event_types(run)[-2:] == ["abstain", "done"]
    assert "token" not in _event_types(run)


def test_g6_graph_expand_adds_cross_repo_backend_citation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """G6 follows the HTTP graph path and cites the second repository."""
    seed = build_agent_qa_seed()
    service_hit = seed.hit_for_path(
        "src/services/loan.service.ts",
        scores={"symbol": 0.9},
        graph_node_name="LoanService.doCalc",
    )
    backend_hit = seed.hit_for_path(
        "src/rates.controller.ts",
        scores={"graph_depth": 1.0, "is_graph_expanded": 1.0},
        graph_node_name="GET /internal/rates/current",
    )
    graph_node_id = str(seed.node_for_name("LoanService.doCalc").id)
    run = _run_scripted_question(
        monkeypatch,
        seed,
        question="where does LoanService load the current rate policy?",
        turns=[
            _turn("search_symbols", query="LoanService.doCalc"),
            _turn("graph_expand", node_id=graph_node_id),
        ],
        hits_by_tool={
            "search_symbols": [service_hit],
            "graph_expand": [backend_hit],
        },
        confidence_outcomes=[(0.55, False), (0.91, True)],
    )

    assert run.tool_names == ["search_symbols", "graph_expand"]
    assert "src/rates.controller.ts" in _citation_paths(run)
    assert backend_hit.repo_id != service_hit.repo_id
    assert "abstain" not in _event_types(run)
