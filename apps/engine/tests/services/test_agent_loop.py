"""Tests for the agent-orchestrated QA loop (ADR 0026)."""

from __future__ import annotations

import json
import uuid
from unittest.mock import MagicMock

import pytest

from config import Settings
from services.llm.vllm_client import LlmToolCallingError, ParsedToolCall, PlannerTurnResult
from services.qa.agent_loop import (
    EvidencePool,
    evaluate_evidence_confidence,
    hits_to_retrieval_matches,
    is_social_question,
    stream_agent_answer,
)
from services.qa.tools import QaToolHit, QaToolResult
from services.retrieval.query_intent import QueryIntentProfile


def _parse_events(raw: list[str]) -> list[dict]:
    """Decode SSE data lines into JSON payloads.

    @param raw - Collected SSE event strings.
    @returns Parsed chunk dicts.
    """
    out: list[dict] = []
    for event in raw:
        line = event.removeprefix("data: ").strip()
        if line:
            out.append(json.loads(line))
    return out


def _hit(
    *,
    file_path: str = "src/auth.ts",
    symbol: float | None = 0.95,
    excerpt: str = "export function login() {}",
    fused: float = 0.05,
) -> QaToolHit:
    """Build a strong symbol-style tool hit for confidence tests.

    @param file_path - Citation path.
    @param symbol - Symbol similarity score.
    @param excerpt - Excerpt text.
    @param fused - Fused ranking score.
    @returns Frozen tool hit.
    """
    return QaToolHit(
        chunk_id=uuid.uuid4(),
        repo_id=uuid.uuid4(),
        file_path=file_path,
        span={"startLine": 1, "endLine": 10},
        excerpt=excerpt,
        scores={"symbol": symbol, "fused": fused},
    )


def test_is_social_question_matches_greetings() -> None:
    assert is_social_question("Hi!")
    assert is_social_question("thank you")
    assert not is_social_question("   ")
    assert not is_social_question("where is AuthService?")


def test_evidence_pool_deduplicates_and_caps() -> None:
    pool = EvidencePool(max_chunks=1)
    original = _hit(file_path="a.ts")
    refreshed = QaToolHit(
        chunk_id=original.chunk_id,
        repo_id=original.repo_id,
        file_path="a.ts",
        span=original.span,
        excerpt="refreshed",
        scores={"keyword": 0.9},
    )
    assert pool.add(original, tool="search_symbols", iteration=1) is True
    assert pool.add(refreshed, tool="search_code", iteration=2) is False
    assert pool.hits()[0].excerpt == "refreshed"
    assert pool.add(_hit(file_path="b.ts"), tool="search_code", iteration=2) is False
    assert len(pool.hits()) == 1


def test_hits_to_retrieval_matches_sorts_by_fused() -> None:
    weak = _hit(file_path="a.ts", symbol=0.2, fused=0.01)
    strong = _hit(file_path="b.ts", symbol=0.99, fused=0.05)
    matches = hits_to_retrieval_matches([weak, strong])
    assert matches[0].chunk.file_path == "b.ts"  # type: ignore[attr-defined]


def test_hits_to_retrieval_matches_maps_vector_keyword_and_graph() -> None:
    hit = QaToolHit(
        chunk_id=uuid.uuid4(),
        repo_id=uuid.uuid4(),
        file_path="src/flow.ts",
        span={"startLine": 3, "endLine": 9},
        excerpt="const flow = true;",
        scores={
            "keyword": 0.8,
            "vector_distance": 0.2,
            "graph_depth": 1.0,
            "is_graph_expanded": 1.0,
        },
    )
    match = hits_to_retrieval_matches([hit])[0]
    assert match.sources == ("keyword", "vector")
    assert match.keyword_score == 0.8
    assert match.vector_distance == 0.2
    assert match.graph_depth == 1
    assert match.is_graph_expanded is True


def test_abstains_after_max_iterations_no_evidence(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = Settings(qa_agent_max_iterations=2, qa_agent_min_confidence=0.8)
    session_factory = MagicMock(return_value=MagicMock())

    monkeypatch.setattr(
        "services.qa.agent_loop.complete_with_tools",
        lambda *a, **k: PlannerTurnResult(tool_calls=[], assistant_content=None),
    )

    events = _parse_events(
        list(
            stream_agent_answer(
                settings,
                session_factory,
                question="where is AuthService defined?",
                project_id=uuid.uuid4(),
            )
        )
    )
    types = [e["type"] for e in events]
    assert "abstain" in types
    assert types[-1] == "done"
    assert "token" not in types


def test_social_turn_without_tools(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = Settings(qa_agent_max_iterations=5)
    session_factory = MagicMock(return_value=MagicMock())
    monkeypatch.setattr(
        "services.qa.agent_loop.complete_with_tools",
        lambda *a, **k: PlannerTurnResult(
            tool_calls=[], assistant_content="Hello! How can I help with the codebase?"
        ),
    )
    events = _parse_events(
        list(
            stream_agent_answer(
                settings,
                session_factory,
                question="hi",
                project_id=uuid.uuid4(),
            )
        )
    )
    types = [e["type"] for e in events]
    assert types == ["token", "done"]
    assert "Hello" in events[0]["content"]


def test_emits_tool_and_citation_events(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = Settings(qa_agent_max_iterations=1, qa_agent_min_confidence=0.99)
    session_factory = MagicMock(return_value=MagicMock())
    hit = _hit()

    monkeypatch.setattr(
        "services.qa.agent_loop.complete_with_tools",
        lambda *a, **k: PlannerTurnResult(
            tool_calls=[
                ParsedToolCall(name="search_symbols", arguments={"query": "login"}, id="c1")
            ]
        ),
    )
    monkeypatch.setattr(
        "services.qa.agent_loop.execute_tool",
        lambda *a, **k: QaToolResult(
            tool_name="search_symbols",
            args={"query": "login"},
            hits=[hit],
            truncated=False,
            duration_ms=12.0,
        ),
    )
    # Force gate to fail so we abstain after emitting tool/citation events.
    monkeypatch.setattr(
        "services.qa.agent_loop.evaluate_evidence_confidence",
        lambda *a, **k: (0.1, False),
    )

    events = _parse_events(
        list(
            stream_agent_answer(
                settings,
                session_factory,
                question="where is login?",
                project_id=uuid.uuid4(),
            )
        )
    )
    types = [e["type"] for e in events]
    assert "tool_start" in types
    assert "tool_result" in types
    assert "citation" in types
    assert "abstain" in types


def test_answers_when_confidence_reaches_threshold(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = Settings(
        qa_agent_max_iterations=3,
        qa_agent_min_confidence=0.5,
        llm_max_context_tokens=8192,
        vllm_model="test-model",
    )
    session_factory = MagicMock(return_value=MagicMock())
    hit = _hit(symbol=0.99)

    monkeypatch.setattr(
        "services.qa.agent_loop.complete_with_tools",
        lambda *a, **k: PlannerTurnResult(
            tool_calls=[
                ParsedToolCall(name="search_symbols", arguments={"query": "login"}, id="c1")
            ]
        ),
    )
    monkeypatch.setattr(
        "services.qa.agent_loop.execute_tool",
        lambda *a, **k: QaToolResult(
            tool_name="search_symbols",
            args={"query": "login"},
            hits=[hit],
            truncated=False,
            duration_ms=5.0,
        ),
    )
    monkeypatch.setattr(
        "services.qa.agent_loop.evaluate_evidence_confidence",
        lambda *a, **k: (0.85, True),
    )
    captured: dict[str, object] = {}

    def fake_final(
        settings: Settings,
        *,
        question: str,
        context_blocks: list[str],
        history=None,
        stats=None,
    ):
        captured["blocks"] = list(context_blocks)
        captured["question"] = question
        stats.prompt_tokens = 10
        stats.completion_tokens = 5
        stats.total_tokens = 15
        stats.tokens_per_second = 25.0
        stats.elapsed_seconds = 0.2
        yield "grounded answer"

    monkeypatch.setattr("services.qa.agent_loop.stream_final_answer", fake_final)

    events = _parse_events(
        list(
            stream_agent_answer(
                settings,
                session_factory,
                question="how does login work?",
                project_id=uuid.uuid4(),
                history=[{"role": "user", "content": "Earlier question"}],
            )
        )
    )
    types = [e["type"] for e in events]
    assert "token" in types
    assert "metrics" in types
    assert types[-1] == "done"
    metrics = next(e["metrics"] for e in events if e["type"] == "metrics")
    assert metrics["agentIterations"] == 1
    assert metrics["evidenceConfidence"] == 0.85
    assert metrics["toolCallCount"] == 1
    assert metrics["investigationTrace"]["version"] == 1
    assert metrics["investigationTrace"]["agentIterations"] == 1
    assert metrics["investigationTrace"]["finalConfidence"] == 0.85
    assert metrics["investigationTrace"]["iterations"][0]["index"] == 1
    assert metrics["promptTokens"] == 10
    assert metrics["completionTokens"] == 5
    assert metrics["totalTokens"] == 15
    assert metrics["tokensPerSecond"] == 25.0
    assert metrics["elapsedMs"] == 200


def test_final_prompt_only_includes_pool_excerpts(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = Settings(
        qa_agent_max_iterations=2,
        qa_agent_min_confidence=0.5,
        llm_max_context_tokens=8192,
    )
    session_factory = MagicMock(return_value=MagicMock())
    hit = _hit(file_path="src/only-pool.ts", excerpt="POOL_EXCERPT_UNIQUE")

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
            hits=[hit],
            truncated=False,
            duration_ms=1.0,
        ),
    )
    monkeypatch.setattr(
        "services.qa.agent_loop.evaluate_evidence_confidence",
        lambda *a, **k: (0.9, True),
    )

    def fake_final(
        settings: Settings,
        *,
        question: str,
        context_blocks: list[str],
        history=None,
        stats=None,
    ):
        assert any("POOL_EXCERPT_UNIQUE" in b for b in context_blocks)
        assert any("src/only-pool.ts" in b for b in context_blocks)
        yield "ok"

    monkeypatch.setattr("services.qa.agent_loop.stream_final_answer", fake_final)

    list(
        stream_agent_answer(
            settings,
            session_factory,
            question="explain x",
            project_id=uuid.uuid4(),
        )
    )


def test_planner_error_yields_error_chunk(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = Settings()
    session_factory = MagicMock(return_value=MagicMock())

    def _boom(*_a: object, **_k: object) -> PlannerTurnResult:
        raise LlmToolCallingError("no tools")

    monkeypatch.setattr("services.qa.agent_loop.complete_with_tools", _boom)
    events = _parse_events(
        list(
            stream_agent_answer(
                settings,
                session_factory,
                question="where is Foo?",
                project_id=uuid.uuid4(),
            )
        )
    )
    assert events[0]["type"] == "error"


def test_invalid_tool_arguments_return_result_then_abstain(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = Settings(qa_agent_max_iterations=1)
    session_factory = MagicMock(return_value=MagicMock())
    monkeypatch.setattr(
        "services.qa.agent_loop.complete_with_tools",
        lambda *a, **k: PlannerTurnResult(
            tool_calls=[
                ParsedToolCall(
                    name="search_code",
                    arguments={},
                    id=None,
                )
            ]
        ),
    )

    def _invalid(*_a: object, **_k: object) -> QaToolResult:
        raise ValueError("query is required")

    monkeypatch.setattr("services.qa.agent_loop.execute_tool", _invalid)
    events = _parse_events(
        list(
            stream_agent_answer(
                settings,
                session_factory,
                question="find code",
                project_id=uuid.uuid4(),
            )
        )
    )
    types = [event["type"] for event in events]
    assert types == ["tool_start", "tool_result", "abstain", "done"]
    assert events[1]["tool"]["hitCount"] == 0


def test_evaluate_evidence_confidence_empty_pool() -> None:
    pool = EvidencePool(max_chunks=5)
    conf, passes = evaluate_evidence_confidence(
        pool,
        Settings(),
        intent=QueryIntentProfile.BALANCED,
        terms=[],
    )
    assert conf == 0.0
    assert passes is False


def test_evaluate_evidence_confidence_strong_symbol() -> None:
    pool = EvidencePool(max_chunks=5)
    pool.add(_hit(symbol=0.99), tool="search_symbols", iteration=1)
    conf, passes = evaluate_evidence_confidence(
        pool,
        Settings(qa_agent_min_confidence=0.5),
        intent=QueryIntentProfile.SYMBOL_LOOKUP,
        terms=["login"],
    )
    assert conf > 0.0
    assert passes is True


def test_evaluate_evidence_confidence_rejects_weak_vector_only() -> None:
    vector_hit = QaToolHit(
        chunk_id=uuid.uuid4(),
        repo_id=uuid.uuid4(),
        file_path="src/unrelated.ts",
        span={"startLine": 1, "endLine": 2},
        excerpt="const unrelated = true;",
        scores={"vector_distance": 0.99},
    )
    pool = EvidencePool(max_chunks=5)
    pool.add(vector_hit, tool="search_vectors", iteration=1)
    confidence, passes = evaluate_evidence_confidence(
        pool,
        Settings(qa_agent_min_confidence=0.1),
        intent=QueryIntentProfile.CONCEPTUAL,
        terms=[],
    )
    assert confidence >= 0.0
    assert passes is False
