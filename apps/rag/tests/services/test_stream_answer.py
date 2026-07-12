"""Tests for QA streaming."""

import json
import logging
import uuid
from types import SimpleNamespace
from unittest.mock import MagicMock

from config import Settings
from services.qa.stream_answer import stream_rag_answer
from services.retrieval.adaptive_top_k import ProjectSizeTier
from services.retrieval.query_intent import QueryIntentProfile
from services.retrieval.search import RetrievalContext
from services.retrieval.types import RetrievalMatch


def _retrieval_context() -> RetrievalContext:
    return RetrievalContext(
        intent=QueryIntentProfile.BALANCED,
        tier=ProjectSizeTier.SMALL,
        terms=[],
    )


def _retrieve_tuple(*matches: RetrievalMatch) -> tuple[list[RetrievalMatch], RetrievalContext]:
    return list(matches), _retrieval_context()


def _make_chunk(name: str, content: str) -> SimpleNamespace:
    """Build a stand-in code chunk row for streaming tests.

    @param name - File path for the chunk.
    @param content - Chunk source text.
    @returns A namespace matching the attributes stream_answer reads.
    """
    return SimpleNamespace(
        repo_id=uuid.uuid4(),
        file_path=name,
        span={"startLine": 1, "endLine": 2},
        content=content,
        symbol_refs=[],
    )

def _make_match(
    name: str,
    content: str,
    *,
    vector_distance: float = 0.1,
) -> RetrievalMatch:
    """Build a fused retrieval hit for streaming tests."""
    chunk = _make_chunk(name, content)
    return RetrievalMatch(
        chunk=chunk,
        fused_score=0.02,
        sources=("vector",),
        vector_distance=vector_distance,
    )


def _metrics_event(events: list[str]) -> dict:
    """Extract and parse the single metrics SSE event from a stream.

    @param events - Collected SSE event strings.
    @returns The decoded metrics payload dict.
    """
    for event in events:
        data = json.loads(event.removeprefix("data: ").strip())
        if data.get("type") == "metrics":
            return data["metrics"]
    raise AssertionError("no metrics event found")


def test_stream_abstains_for_end_user_audience() -> None:
    events = list(
        stream_rag_answer(
            Settings(),
            MagicMock(),
            question="how?",
            project_id=uuid.uuid4(),
            audience="end_user",
        ),
    )
    assert any('"abstain"' in event for event in events)


def test_stream_abstains_when_project_missing(monkeypatch) -> None:
    session = MagicMock()
    session_factory = MagicMock(return_value=session)
    monkeypatch.setattr(
        "services.qa.stream_answer.retrieve_code_chunks",
        lambda *a, **k: (_ for _ in ()).throw(ValueError("Project not found: x")),
    )
    events = list(
        stream_rag_answer(
            Settings(),
            session_factory,
            question="how?",
            project_id=uuid.uuid4(),
            audience="developer",
        ),
    )
    assert any("Project not found" in event for event in events)


def test_stream_abstains_without_matches(monkeypatch) -> None:
    session = MagicMock()
    session_factory = MagicMock(return_value=session)
    monkeypatch.setattr(
        "services.qa.stream_answer.retrieve_code_chunks",
        lambda *a, **k: _retrieve_tuple(),
    )
    events = list(
        stream_rag_answer(
            Settings(),
            session_factory,
            question="how?",
            project_id=uuid.uuid4(),
            audience="developer",
        ),
    )
    assert any('"abstain"' in event for event in events)


def test_stream_grounded_answer(monkeypatch) -> None:
    session = MagicMock()
    session_factory = MagicMock(return_value=session)
    chunk = _make_chunk("src/a.ts", "export function main() {}")
    monkeypatch.setattr(
        "services.qa.stream_answer.retrieve_code_chunks",
        lambda *a, **k: (
            [_make_match("src/a.ts", "export function main() {}")],
            _retrieval_context(),
        ),
    )
    monkeypatch.setattr(
        "services.qa.stream_answer.is_confident_match",
        lambda settings, matches, **kwargs: True,
    )
    monkeypatch.setattr(
        "services.qa.stream_answer.stream_vllm_answer",
        lambda settings, question, context_blocks, stats=None, history=None: iter(["answer text"]),
    )
    events = list(
        stream_rag_answer(
            Settings(),
            session_factory,
            question="what is main?",
            project_id=uuid.uuid4(),
            audience="developer",
        ),
    )
    joined = "".join(events)
    assert '"citation"' in joined
    assert '"metrics"' in joined
    assert '"done"' in joined


def test_stream_grounded_answer_emits_metrics(monkeypatch) -> None:
    session_factory = MagicMock(return_value=MagicMock())
    chunk = _make_chunk("src/a.ts", "export function main() {}")
    monkeypatch.setattr(
        "services.qa.stream_answer.retrieve_code_chunks",
        lambda *a, **k: _retrieve_tuple(_make_match("src/a.ts", "export function main() {}")),
    )
    monkeypatch.setattr(
        "services.qa.stream_answer.is_confident_match",
        lambda settings, matches, **kwargs: True,
    )
    monkeypatch.setattr(
        "services.qa.stream_answer.stream_vllm_answer",
        lambda settings, question, context_blocks, stats=None, history=None: iter(["answer"]),
    )
    events = list(
        stream_rag_answer(
            Settings(vllm_model="qwen2.5:7b", llm_max_context_tokens=4096),
            session_factory,
            question="what is main?",
            project_id=uuid.uuid4(),
            audience="developer",
        ),
    )
    metrics = _metrics_event(events)
    assert metrics["contextChunks"] == 1
    assert metrics["maxContextTokens"] == 4096
    assert metrics["model"] == "qwen2.5:7b"
    assert metrics["contextTokens"] > 0


def test_packing_limits_chunks_to_context_budget(monkeypatch) -> None:
    session_factory = MagicMock(return_value=MagicMock())
    # Many large chunks but a tiny window: only a subset should be packed as context.
    big_content = "const x = 1;\n" * 200
    matches = [_make_match(f"src/f{i}.ts", big_content) for i in range(10)]
    monkeypatch.setattr(
        "services.qa.stream_answer.retrieve_code_chunks",
        lambda *a, **k: _retrieve_tuple(*matches),
    )
    monkeypatch.setattr(
        "services.qa.stream_answer.is_confident_match",
        lambda settings, matches, **kwargs: True,
    )
    monkeypatch.setattr(
        "services.qa.stream_answer.stream_vllm_answer",
        lambda settings, question, context_blocks, stats=None, history=None: iter(["answer"]),
    )
    events = list(
        stream_rag_answer(
            Settings(llm_max_context_tokens=1200, llm_completion_reserve_tokens=256),
            session_factory,
            question="explain",
            project_id=uuid.uuid4(),
            audience="developer",
        ),
    )
    metrics = _metrics_event(events)
    # Fewer than all 10 chunks fit; at least the top one is always included.
    assert 1 <= metrics["contextChunks"] < 10
    citations = sum(1 for e in events if '"citation"' in e)
    assert citations == metrics["contextChunks"]


def test_stream_small_talk_skips_retrieval_and_llm(monkeypatch) -> None:
    retrieve_mock = MagicMock(return_value=[])
    llm_mock = MagicMock(return_value=iter(["should not run"]))
    monkeypatch.setattr("services.qa.stream_answer.retrieve_code_chunks", retrieve_mock)
    monkeypatch.setattr("services.qa.stream_answer.stream_vllm_answer", llm_mock)

    events = list(
        stream_rag_answer(
            Settings(),
            MagicMock(),
            question="hi",
            project_id=uuid.uuid4(),
            audience="developer",
        ),
    )
    joined = "".join(events)
    assert '"token"' in joined
    assert '"done"' in joined
    assert "codebase" in joined.lower()
    assert '"citation"' not in joined
    retrieve_mock.assert_not_called()
    llm_mock.assert_not_called()


def test_history_is_passed_to_llm_and_trimmed_when_over_budget(monkeypatch) -> None:
    session_factory = MagicMock(return_value=MagicMock())
    chunk = _make_chunk("src/a.ts", "export function main() {}")
    captured: dict[str, object] = {}

    def fake_vllm(settings, *, question, context_blocks, history=None, stats=None):
        captured["history"] = history
        yield "answer"

    monkeypatch.setattr(
        "services.qa.stream_answer.retrieve_code_chunks",
        lambda *a, **k: _retrieve_tuple(_make_match("src/a.ts", "export function main() {}")),
    )
    monkeypatch.setattr(
        "services.qa.stream_answer.is_confident_match",
        lambda settings, matches, **kwargs: True,
    )
    monkeypatch.setattr("services.qa.stream_answer.stream_vllm_answer", fake_vllm)

    long_turn = "x" * 4000
    history = [
        {"role": "user", "content": long_turn},
        {"role": "assistant", "content": long_turn},
        {"role": "user", "content": "latest"},
        {"role": "assistant", "content": "latest answer"},
    ]
    list(
        stream_rag_answer(
            Settings(llm_max_context_tokens=1200, llm_completion_reserve_tokens=256),
            session_factory,
            question="follow up",
            project_id=uuid.uuid4(),
            audience="developer",
            history=history,
        ),
    )
    trimmed = captured.get("history")
    assert isinstance(trimmed, list)
    assert len(trimmed) < len(history)


def test_debug_logging_reports_retrieval_and_prompt(monkeypatch, caplog) -> None:
    session_factory = MagicMock(return_value=MagicMock())
    chunk = _make_chunk("src/emi.ts", "export function getMinEmi() {}")
    monkeypatch.setattr(
        "services.qa.stream_answer.retrieve_code_chunks",
        lambda *a, **k: _retrieve_tuple(
            _make_match("src/emi.ts", "export function getMinEmi() {}", vector_distance=0.12),
        ),
    )
    monkeypatch.setattr(
        "services.qa.stream_answer.is_confident_match",
        lambda settings, matches, **kwargs: True,
    )
    monkeypatch.setattr(
        "services.qa.stream_answer.stream_vllm_answer",
        lambda settings, question, context_blocks, stats=None, history=None: iter(["a"]),
    )
    with caplog.at_level(logging.DEBUG, logger="codesage.indexing"):
        list(
            stream_rag_answer(
                Settings(),
                session_factory,
                question="how is EMI calculated?",
                project_id=uuid.uuid4(),
                audience="developer",
            ),
        )
    text = caplog.text
    assert "QA retrieval" in text
    assert "src/emi.ts" in text
    assert "QA prompt" in text
    assert "rrf=" in text


def test_debug_logging_reports_rerank_scores(monkeypatch, caplog) -> None:
    session_factory = MagicMock(return_value=MagicMock())
    match = _make_match("src/emi.ts", "export function getMinEmi() {}", vector_distance=0.12)
    match = RetrievalMatch(
        chunk=match.chunk,
        fused_score=match.fused_score,
        sources=match.sources,
        vector_distance=match.vector_distance,
        rerank_score=0.88,
    )
    context = RetrievalContext(
        intent=QueryIntentProfile.BALANCED,
        tier=ProjectSizeTier.SMALL,
        terms=[],
        reranker_applied=True,
    )
    monkeypatch.setattr(
        "services.qa.stream_answer.retrieve_code_chunks",
        lambda *a, **k: ([match], context),
    )
    monkeypatch.setattr(
        "services.qa.stream_answer.is_confident_match",
        lambda settings, matches, **kwargs: True,
    )
    monkeypatch.setattr(
        "services.qa.stream_answer.stream_vllm_answer",
        lambda settings, question, context_blocks, stats=None, history=None: iter(["a"]),
    )
    with caplog.at_level(logging.DEBUG, logger="codesage.indexing"):
        list(
            stream_rag_answer(
                Settings(),
                session_factory,
                question="how is EMI calculated?",
                project_id=uuid.uuid4(),
                audience="developer",
            ),
        )
    assert "reranker=true" in caplog.text
    assert "rerank=" in caplog.text


def test_debug_logging_silent_when_not_debug(monkeypatch, caplog) -> None:
    session_factory = MagicMock(return_value=MagicMock())
    chunk = _make_chunk("src/emi.ts", "export function getMinEmi() {}")
    monkeypatch.setattr(
        "services.qa.stream_answer.retrieve_code_chunks",
        lambda *a, **k: _retrieve_tuple(
            _make_match("src/emi.ts", "export function getMinEmi() {}", vector_distance=0.12),
        ),
    )
    monkeypatch.setattr(
        "services.qa.stream_answer.is_confident_match",
        lambda settings, matches, **kwargs: True,
    )
    monkeypatch.setattr(
        "services.qa.stream_answer.stream_vllm_answer",
        lambda settings, question, context_blocks, stats=None, history=None: iter(["a"]),
    )
    with caplog.at_level(logging.INFO, logger="codesage.indexing"):
        list(
            stream_rag_answer(
                Settings(),
                session_factory,
                question="how is EMI calculated?",
                project_id=uuid.uuid4(),
                audience="developer",
            ),
        )
    assert "QA retrieval" not in caplog.text
