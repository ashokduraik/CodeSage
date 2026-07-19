"""Tests for follow-up QA context (ADR 0028): rewrite + prior-evidence seed."""

from __future__ import annotations

import json
import uuid
from unittest.mock import MagicMock

import pytest

from config import Settings
from services.llm.prompts import (
    FOLLOWUP_REWRITE_SYSTEM_PROMPT,
    build_followup_rewrite_messages,
)
from services.llm.vllm_client import LlmToolCallingError
from services.qa.agent_loop import stream_agent_answer
from services.qa.followup import (
    prior_evidence_nonempty,
    rewrite_followup_question,
    seed_pool_from_prior_evidence,
    should_apply_followup_context,
)
from services.qa.tools import QaToolHit, QaToolResult
from services.llm.vllm_client import ParsedToolCall, PlannerTurnResult


def _parse_events(raw: list[str]) -> list[dict]:
    """Decode SSE data lines into JSON payloads."""
    out: list[dict] = []
    for event in raw:
        line = event.removeprefix("data: ").strip()
        if line:
            out.append(json.loads(line))
    return out


def _hit(
    *,
    file_path: str = "src/app/services/loan.utils.ts",
    excerpt: str = "return (amount * r * pow) / (pow - 1);",
) -> QaToolHit:
    """Build a strong seed hit for follow-up gate tests."""
    return QaToolHit(
        chunk_id=uuid.uuid4(),
        repo_id=uuid.uuid4(),
        file_path=file_path,
        span={"startLine": 10, "endLine": 20},
        excerpt=excerpt,
        scores={"symbol": 0.95, "fused": 0.05},
    )


# --- R*: rewrite ---


def test_build_followup_rewrite_messages_includes_history_and_question() -> None:
    history = [
        {"role": "user", "content": "How EMI is calculated?"},
        {
            "role": "assistant",
            "content": "EMI uses loan.utils.ts formula amount * r * pow / (pow - 1)",
        },
    ]
    messages = build_followup_rewrite_messages(
        "I don't understand the second point from above",
        history,
    )
    assert messages[0]["role"] == "system"
    assert messages[0]["content"] == FOLLOWUP_REWRITE_SYSTEM_PROMPT
    assert messages[1:3] == history
    assert messages[-1] == {
        "role": "user",
        "content": "I don't understand the second point from above",
    }


def test_rewrite_followup_mentions_emi_from_history(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = Settings(qa_followup_context_enabled=True)
    history = [
        {"role": "user", "content": "How EMI is calculated in this repo?"},
        {
            "role": "assistant",
            "content": (
                "3. EMI Calculation in loan.utils.ts: "
                "EMI = amount * r * (1+r)^n / ((1+r)^n - 1)"
            ),
        },
    ]
    monkeypatch.setattr(
        "services.qa.followup.complete_text",
        lambda *a, **k: (
            "Explain the EMI formula EMI = amount * r * (1+r)^n / ((1+r)^n - 1) "
            "in loan.utils.ts"
        ),
    )
    rewritten = rewrite_followup_question(
        settings,
        "I don't understand the second point from above",
        history,
    )
    assert "EMI" in rewritten or "loan.utils" in rewritten


def test_rewrite_followup_echoes_standalone_question(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = Settings()
    standalone = "How is EMI calculated in loan.utils.ts?"
    monkeypatch.setattr(
        "services.qa.followup.complete_text",
        lambda *a, **k: standalone,
    )
    assert (
        rewrite_followup_question(settings, standalone, [{"role": "user", "content": "hi"}])
        == standalone
    )


def test_rewrite_followup_falls_back_on_llm_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = Settings()
    original = "I don't understand the second point"

    def boom(*_a, **_k):
        raise LlmToolCallingError("offline")

    monkeypatch.setattr("services.qa.followup.complete_text", boom)
    assert (
        rewrite_followup_question(
            settings,
            original,
            [{"role": "user", "content": "prior"}],
        )
        == original
    )


def test_rewrite_not_applied_when_history_empty(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    called = {"n": 0}

    def track(*_a, **_k):
        called["n"] += 1
        return "should not run"

    monkeypatch.setattr("services.qa.followup.complete_text", track)
    settings = Settings(qa_followup_context_enabled=True)
    assert rewrite_followup_question(settings, "How does auth work?", []) == (
        "How does auth work?"
    )
    assert called["n"] == 0


def test_should_apply_followup_context_respects_toggle_and_history() -> None:
    assert should_apply_followup_context(
        Settings(qa_followup_context_enabled=True),
        [{"role": "user", "content": "q"}],
    )
    assert not should_apply_followup_context(
        Settings(qa_followup_context_enabled=True),
        None,
    )
    assert not should_apply_followup_context(
        Settings(qa_followup_context_enabled=False),
        [{"role": "user", "content": "q"}],
    )


# --- S*: seed ---


def test_rewrite_followup_falls_back_on_empty_llm_output(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = Settings()
    monkeypatch.setattr(
        "services.qa.followup.complete_text",
        lambda *a, **k: "   ",
    )
    assert (
        rewrite_followup_question(
            settings,
            "original?",
            [{"role": "user", "content": "prior"}],
        )
        == "original?"
    )


def test_rewrite_followup_takes_first_line_only(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = Settings()
    monkeypatch.setattr(
        "services.qa.followup.complete_text",
        lambda *a, **k: "Explain EMI in loan.utils.ts\nExtra commentary",
    )
    assert (
        rewrite_followup_question(
            settings,
            "second point?",
            [{"role": "user", "content": "prior"}],
        )
        == "Explain EMI in loan.utils.ts"
    )


def test_around_line_from_span_variants() -> None:
    from services.qa.followup import _around_line_from_span

    assert _around_line_from_span(None) is None
    assert _around_line_from_span("x") is None
    assert _around_line_from_span({"start_line": 5}) == 5
    assert _around_line_from_span({"aroundLine": 7.0}) == 7
    assert _around_line_from_span({"around_line": "9"}) == 9
    assert _around_line_from_span({"startLine": 0}) is None
    assert _around_line_from_span({"other": 3}) is None


def test_seed_skips_invalid_citation_and_anchor_shapes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = Settings(qa_followup_max_graph_expands=2)
    calls: list[str] = []

    def fake_execute(
        _session,
        _settings,
        *,
        project_id,
        tool_name,
        args,
        repo_ids,
    ):
        calls.append(tool_name)
        return QaToolResult(
            tool_name=tool_name,
            args=args,
            hits=[],
            truncated=False,
            duration_ms=0.0,
        )

    monkeypatch.setattr("services.qa.followup.execute_tool", fake_execute)
    node = str(uuid.uuid4())
    steps = seed_pool_from_prior_evidence(
        MagicMock(),
        settings,
        project_id=uuid.uuid4(),
        prior={
            "citations": [
                "not-a-dict",
                {"kind": "code", "repoId": str(uuid.uuid4()), "filePath": "   "},
                {
                    "kind": "code",
                    "repoId": str(uuid.uuid4()),
                    "filePath": "ok.ts",
                    "span": {"startLine": 1},
                },
                {
                    "kind": "code",
                    "repoId": str(uuid.uuid4()),
                    "filePath": "ok.ts",
                    "span": {"startLine": 1},
                },
            ],
            "evidenceAnchors": [
                "bad",
                {"filePath": "a.ts"},
                {"filePath": "a.ts", "graphNodeId": "  "},
                {"filePath": "a.ts", "graphNodeId": node},
                {"filePath": "a.ts", "graphNodeId": node},
            ],
        },
        repo_ids=None,
    )
    assert calls == ["read_chunks_for_path", "graph_expand"]
    assert len(steps) == 2


def test_seed_caps_graph_expands(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = Settings(qa_followup_max_graph_expands=1)
    calls: list[str] = []

    def fake_execute(
        _session,
        _settings,
        *,
        project_id,
        tool_name,
        args,
        repo_ids,
    ):
        calls.append(args["node_id"])
        return QaToolResult(
            tool_name=tool_name,
            args=args,
            hits=[],
            truncated=False,
            duration_ms=0.0,
        )

    monkeypatch.setattr("services.qa.followup.execute_tool", fake_execute)
    n1, n2 = str(uuid.uuid4()), str(uuid.uuid4())
    seed_pool_from_prior_evidence(
        MagicMock(),
        settings,
        project_id=uuid.uuid4(),
        prior={
            "evidenceAnchors": [
                {"filePath": "a.ts", "graphNodeId": n1},
                {"filePath": "b.ts", "graphNodeId": n2},
            ]
        },
        repo_ids=None,
    )
    assert calls == [n1]


def test_prior_evidence_nonempty() -> None:
    assert not prior_evidence_nonempty(None)
    assert not prior_evidence_nonempty({})
    assert prior_evidence_nonempty(
        {"citations": [{"kind": "code", "filePath": "a.ts", "repoId": str(uuid.uuid4())}]}
    )
    assert prior_evidence_nonempty(
        {"evidenceAnchors": [{"filePath": "a.ts", "graphNodeId": str(uuid.uuid4())}]}
    )


def test_seed_pool_calls_read_chunks_for_path_with_around_line(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = Settings(qa_followup_max_seed_citations=8)
    session = MagicMock()
    calls: list[tuple[str, dict]] = []
    hit = _hit()

    def fake_execute(
        _session,
        _settings,
        *,
        project_id,
        tool_name,
        args,
        repo_ids,
    ):
        calls.append((tool_name, dict(args)))
        return QaToolResult(
            tool_name=tool_name,
            args=args,
            hits=[hit],
            truncated=False,
            duration_ms=1.0,
        )

    monkeypatch.setattr("services.qa.followup.execute_tool", fake_execute)
    repo_id = str(uuid.uuid4())
    steps = seed_pool_from_prior_evidence(
        session,
        settings,
        project_id=uuid.uuid4(),
        prior={
            "citations": [
                {
                    "kind": "code",
                    "repoId": repo_id,
                    "filePath": "src/app/services/loan.utils.ts",
                    "span": {"startLine": 12, "endLine": 24},
                }
            ]
        },
        repo_ids=None,
    )
    assert len(steps) == 1
    assert steps[0].tool == "read_chunks_for_path"
    assert steps[0].result is not None
    assert calls[0][0] == "read_chunks_for_path"
    assert calls[0][1]["path"] == "src/app/services/loan.utils.ts"
    assert calls[0][1]["around_line"] == 12


def test_seed_pool_graph_expand_from_anchors(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = Settings(qa_followup_max_graph_expands=3)
    node_id = str(uuid.uuid4())
    calls: list[str] = []

    def fake_execute(
        _session,
        _settings,
        *,
        project_id,
        tool_name,
        args,
        repo_ids,
    ):
        calls.append(tool_name)
        return QaToolResult(
            tool_name=tool_name,
            args=args,
            hits=[_hit()],
            truncated=False,
            duration_ms=1.0,
        )

    monkeypatch.setattr("services.qa.followup.execute_tool", fake_execute)
    steps = seed_pool_from_prior_evidence(
        MagicMock(),
        settings,
        project_id=uuid.uuid4(),
        prior={"evidenceAnchors": [{"filePath": "a.ts", "graphNodeId": node_id}]},
        repo_ids=None,
    )
    assert calls == ["graph_expand"]
    assert steps[0].args["node_id"] == node_id


def test_seed_pool_caps_citations(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = Settings(qa_followup_max_seed_citations=2)
    calls: list[str] = []

    def fake_execute(
        _session,
        _settings,
        *,
        project_id,
        tool_name,
        args,
        repo_ids,
    ):
        calls.append(args["path"])
        return QaToolResult(
            tool_name=tool_name,
            args=args,
            hits=[],
            truncated=False,
            duration_ms=0.0,
        )

    monkeypatch.setattr("services.qa.followup.execute_tool", fake_execute)
    citations = [
        {
            "kind": "code",
            "repoId": str(uuid.uuid4()),
            "filePath": f"file{i}.ts",
            "span": {"startLine": i + 1},
        }
        for i in range(5)
    ]
    seed_pool_from_prior_evidence(
        MagicMock(),
        settings,
        project_id=uuid.uuid4(),
        prior={"citations": citations},
        repo_ids=None,
    )
    assert calls == ["file0.ts", "file1.ts"]


def test_seed_pool_skips_missing_path_errors(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = Settings()

    def fake_execute(*_a, **_k):
        raise ValueError("path not found")

    monkeypatch.setattr("services.qa.followup.execute_tool", fake_execute)
    steps = seed_pool_from_prior_evidence(
        MagicMock(),
        settings,
        project_id=uuid.uuid4(),
        prior={
            "citations": [
                {
                    "kind": "code",
                    "repoId": str(uuid.uuid4()),
                    "filePath": "missing.ts",
                    "span": {"startLine": 1},
                }
            ]
        },
        repo_ids=None,
    )
    assert len(steps) == 1
    assert steps[0].error is not None
    assert steps[0].result is None


# --- A*: agent loop integration ---


@pytest.fixture(autouse=True)
def _stub_playbooks(monkeypatch: pytest.MonkeyPatch) -> None:
    """Disable playbook DB I/O in this module's agent-loop tests."""
    monkeypatch.setattr(
        "services.qa.agent_loop.find_similar_playbooks",
        lambda *a, **k: [],
    )
    monkeypatch.setattr(
        "services.qa.agent_loop.promote_trace_to_playbook",
        lambda *a, **k: None,
    )


def test_agent_loop_followup_seed_passes_gate_without_planner(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A1: vague follow-up + priorEvidence → seed clears gate → answer."""
    settings = Settings(
        qa_followup_context_enabled=True,
        qa_agent_min_confidence=0.5,
        llm_max_context_tokens=8192,
    )
    session_factory = MagicMock(return_value=MagicMock())
    hit = _hit()
    planner_calls = {"n": 0}

    monkeypatch.setattr(
        "services.qa.agent_loop.rewrite_followup_question",
        lambda *_a, **_k: "Explain the EMI formula in loan.utils.ts",
    )

    def fake_seed(*_a, **_k):
        from services.qa.followup import FollowupSeedStep

        return [
            FollowupSeedStep(
                tool="read_chunks_for_path",
                args={"path": "src/app/services/loan.utils.ts", "around_line": 12},
                result=QaToolResult(
                    tool_name="read_chunks_for_path",
                    args={"path": "src/app/services/loan.utils.ts"},
                    hits=[hit],
                    truncated=False,
                    duration_ms=2.0,
                ),
            )
        ]

    monkeypatch.setattr(
        "services.qa.agent_loop.seed_pool_from_prior_evidence",
        fake_seed,
    )
    monkeypatch.setattr(
        "services.qa.agent_loop.evaluate_evidence_confidence",
        lambda *a, **k: (0.9, True),
    )

    def track_planner(*_a, **_k):
        planner_calls["n"] += 1
        return PlannerTurnResult(tool_calls=[], assistant_content="")

    monkeypatch.setattr(
        "services.qa.agent_loop.complete_with_tools",
        track_planner,
    )
    monkeypatch.setattr(
        "services.qa.agent_loop.stream_final_answer",
        lambda *a, **k: iter(["explained EMI"]),
    )

    events = _parse_events(
        list(
            stream_agent_answer(
                settings,
                session_factory,
                question="I don't understand the second point from above",
                project_id=uuid.uuid4(),
                history=[
                    {"role": "user", "content": "How EMI is calculated?"},
                    {"role": "assistant", "content": "EMI formula in loan.utils.ts"},
                ],
                prior_evidence={
                    "citations": [
                        {
                            "kind": "code",
                            "repoId": str(uuid.uuid4()),
                            "filePath": "src/app/services/loan.utils.ts",
                            "span": {"startLine": 12, "endLine": 24},
                        }
                    ]
                },
            )
        )
    )
    types = [e["type"] for e in events]
    assert "citation" in types
    assert "token" in types
    assert "abstain" not in types
    assert types[-1] == "done"
    assert planner_calls["n"] == 0
    metrics = next(e["metrics"] for e in events if e["type"] == "metrics")
    assert metrics["agentIterations"] == 1
    assert metrics["investigationTrace"]["iterations"][0].get("followupSeed") is True


def test_agent_loop_followup_weak_seed_continues_to_planner(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A2: weak local seed → planner runs with rewritten question."""
    settings = Settings(
        qa_followup_context_enabled=True,
        qa_agent_max_iterations=3,
        qa_agent_min_confidence=0.8,
        llm_max_context_tokens=8192,
    )
    session_factory = MagicMock(return_value=MagicMock())
    hit = _hit()
    captured: dict[str, str] = {}

    monkeypatch.setattr(
        "services.qa.agent_loop.rewrite_followup_question",
        lambda *_a, **_k: "Explain EMI in loan.utils.ts",
    )

    def fake_seed(*_a, **_k):
        from services.qa.followup import FollowupSeedStep

        return [
            FollowupSeedStep(
                tool="read_chunks_for_path",
                args={"path": "loan.utils.ts"},
                result=QaToolResult(
                    tool_name="read_chunks_for_path",
                    args={"path": "loan.utils.ts"},
                    hits=[hit],
                    truncated=False,
                    duration_ms=1.0,
                ),
            )
        ]

    monkeypatch.setattr(
        "services.qa.agent_loop.seed_pool_from_prior_evidence",
        fake_seed,
    )

    conf_calls = {"n": 0}

    def fake_conf(*_a, **_k):
        conf_calls["n"] += 1
        # First call = follow-up seed gate (fail); later planner path (pass).
        if conf_calls["n"] == 1:
            return 0.2, False
        return 0.9, True

    monkeypatch.setattr(
        "services.qa.agent_loop.evaluate_evidence_confidence",
        fake_conf,
    )

    def fake_planner(settings, messages, tools, **_k):
        captured["planner_user"] = messages[-1]["content"]
        return PlannerTurnResult(
            tool_calls=[
                ParsedToolCall(
                    name="search_hybrid",
                    arguments={"query": "EMI"},
                    id="c1",
                )
            ]
        )

    monkeypatch.setattr(
        "services.qa.agent_loop.complete_with_tools",
        fake_planner,
    )
    monkeypatch.setattr(
        "services.qa.agent_loop.execute_tool",
        lambda *a, **k: QaToolResult(
            tool_name="search_hybrid",
            args={"query": "EMI"},
            hits=[hit],
            truncated=False,
            duration_ms=1.0,
        ),
    )
    monkeypatch.setattr(
        "services.qa.agent_loop.stream_final_answer",
        lambda *a, **k: iter(["ok"]),
    )

    events = _parse_events(
        list(
            stream_agent_answer(
                settings,
                session_factory,
                question="I don't understand the second point",
                project_id=uuid.uuid4(),
                history=[{"role": "user", "content": "EMI?"}],
                prior_evidence={
                    "citations": [
                        {
                            "kind": "code",
                            "repoId": str(uuid.uuid4()),
                            "filePath": "loan.utils.ts",
                        }
                    ]
                },
            )
        )
    )
    assert captured["planner_user"] == "Explain EMI in loan.utils.ts"
    assert "token" in [e["type"] for e in events]
    assert "abstain" not in [e["type"] for e in events]


def test_agent_loop_followup_without_prior_evidence_rewrites_only(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A4: history without priorEvidence → rewrite + normal planner."""
    settings = Settings(qa_followup_context_enabled=True, qa_agent_min_confidence=0.5)
    session_factory = MagicMock(return_value=MagicMock())
    hit = _hit()
    seed_called = {"n": 0}
    captured: dict[str, str] = {}

    monkeypatch.setattr(
        "services.qa.agent_loop.rewrite_followup_question",
        lambda *_a, **_k: "Explain EMI calculation",
    )

    def track_seed(*_a, **_k):
        seed_called["n"] += 1
        return []

    monkeypatch.setattr(
        "services.qa.agent_loop.seed_pool_from_prior_evidence",
        track_seed,
    )
    def fake_planner(settings, messages, tools, **_k):
        captured["q"] = messages[-1]["content"]
        return PlannerTurnResult(
            tool_calls=[
                ParsedToolCall(
                    name="search_symbols",
                    arguments={"query": "EMI"},
                    id="c1",
                )
            ]
        )

    monkeypatch.setattr(
        "services.qa.agent_loop.complete_with_tools",
        fake_planner,
    )
    monkeypatch.setattr(
        "services.qa.agent_loop.execute_tool",
        lambda *a, **k: QaToolResult(
            tool_name="search_symbols",
            args={"query": "EMI"},
            hits=[hit],
            truncated=False,
            duration_ms=1.0,
        ),
    )
    monkeypatch.setattr(
        "services.qa.agent_loop.evaluate_evidence_confidence",
        lambda *a, **k: (0.9, True),
    )
    monkeypatch.setattr(
        "services.qa.agent_loop.stream_final_answer",
        lambda *a, **k: iter(["ok"]),
    )

    list(
        stream_agent_answer(
            settings,
            session_factory,
            question="tell me more",
            project_id=uuid.uuid4(),
            history=[{"role": "user", "content": "EMI?"}],
            prior_evidence=None,
        )
    )
    assert seed_called["n"] == 0
    assert captured["q"] == "Explain EMI calculation"


def test_agent_loop_skips_followup_on_first_turn(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A5: no history → no rewrite."""
    settings = Settings(qa_followup_context_enabled=True, qa_agent_min_confidence=0.5)
    session_factory = MagicMock(return_value=MagicMock())
    rewrite_called = {"n": 0}

    def track_rewrite(*_a, **_k):
        rewrite_called["n"] += 1
        return "rewritten"

    monkeypatch.setattr(
        "services.qa.agent_loop.rewrite_followup_question",
        track_rewrite,
    )
    monkeypatch.setattr(
        "services.qa.agent_loop.complete_with_tools",
        lambda *a, **k: PlannerTurnResult(
            tool_calls=[
                ParsedToolCall(name="search_code", arguments={"query": "x"}, id="c1")
            ]
        ),
    )
    monkeypatch.setattr(
        "services.qa.agent_loop.execute_tool",
        lambda *a, **k: QaToolResult(
            tool_name="search_code",
            args={"query": "x"},
            hits=[_hit()],
            truncated=False,
            duration_ms=1.0,
        ),
    )
    monkeypatch.setattr(
        "services.qa.agent_loop.evaluate_evidence_confidence",
        lambda *a, **k: (0.9, True),
    )
    monkeypatch.setattr(
        "services.qa.agent_loop.stream_final_answer",
        lambda *a, **k: iter(["ok"]),
    )

    list(
        stream_agent_answer(
            settings,
            session_factory,
            question="How does auth work?",
            project_id=uuid.uuid4(),
            history=None,
        )
    )
    assert rewrite_called["n"] == 0


def test_agent_loop_social_with_history_skips_followup_seed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A6: social thanks with history still short-circuits; no seed."""
    settings = Settings(qa_followup_context_enabled=True)
    session_factory = MagicMock(return_value=MagicMock())
    seed_called = {"n": 0}

    def track_seed(*_a, **_k):
        seed_called["n"] += 1
        return []

    monkeypatch.setattr(
        "services.qa.agent_loop.seed_pool_from_prior_evidence",
        track_seed,
    )
    monkeypatch.setattr(
        "services.qa.agent_loop.complete_with_tools",
        lambda *a, **k: PlannerTurnResult(
            tool_calls=[],
            assistant_content="You're welcome!",
        ),
    )

    events = _parse_events(
        list(
            stream_agent_answer(
                settings,
                session_factory,
                question="thanks",
                project_id=uuid.uuid4(),
                history=[
                    {"role": "user", "content": "How EMI?"},
                    {"role": "assistant", "content": "formula…"},
                ],
                prior_evidence={
                    "citations": [
                        {
                            "kind": "code",
                            "repoId": str(uuid.uuid4()),
                            "filePath": "loan.utils.ts",
                        }
                    ]
                },
            )
        )
    )
    assert seed_called["n"] == 0
    assert any(e["type"] == "token" for e in events)
    assert "abstain" not in [e["type"] for e in events]


def test_toggle_off_skips_rewrite_and_seed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """S5: QA_FOLLOWUP_CONTEXT_ENABLED=false leaves the legacy path."""
    settings = Settings(
        qa_followup_context_enabled=False,
        qa_agent_min_confidence=0.5,
    )
    session_factory = MagicMock(return_value=MagicMock())
    rewrite_called = {"n": 0}
    seed_called = {"n": 0}

    def track_rewrite(*_a, **_k):
        rewrite_called["n"] += 1
        return "x"

    def track_seed(*_a, **_k):
        seed_called["n"] += 1
        return []

    monkeypatch.setattr(
        "services.qa.agent_loop.rewrite_followup_question",
        track_rewrite,
    )
    monkeypatch.setattr(
        "services.qa.agent_loop.seed_pool_from_prior_evidence",
        track_seed,
    )
    monkeypatch.setattr(
        "services.qa.agent_loop.complete_with_tools",
        lambda *a, **k: PlannerTurnResult(
            tool_calls=[
                ParsedToolCall(name="search_code", arguments={"query": "x"}, id="c1")
            ]
        ),
    )
    monkeypatch.setattr(
        "services.qa.agent_loop.execute_tool",
        lambda *a, **k: QaToolResult(
            tool_name="search_code",
            args={"query": "x"},
            hits=[_hit()],
            truncated=False,
            duration_ms=1.0,
        ),
    )
    monkeypatch.setattr(
        "services.qa.agent_loop.evaluate_evidence_confidence",
        lambda *a, **k: (0.9, True),
    )
    monkeypatch.setattr(
        "services.qa.agent_loop.stream_final_answer",
        lambda *a, **k: iter(["ok"]),
    )

    list(
        stream_agent_answer(
            settings,
            session_factory,
            question="I don't understand",
            project_id=uuid.uuid4(),
            history=[{"role": "user", "content": "prior"}],
            prior_evidence={"citations": [{"filePath": "a.ts", "kind": "code", "repoId": str(uuid.uuid4())}]},
        )
    )
    assert rewrite_called["n"] == 0
    assert seed_called["n"] == 0
