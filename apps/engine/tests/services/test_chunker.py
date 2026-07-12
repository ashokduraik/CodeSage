"""Tests for source chunking."""

from services.parsing.chunker import chunk_source


def test_chunk_source_empty() -> None:
    assert chunk_source("") == []


def test_chunk_source_small_file_single_chunk() -> None:
    content = "\n".join(f"line {i}" for i in range(10))
    chunks = chunk_source(content)
    assert len(chunks) == 1
    assert chunks[0].span["startLine"] == 1
    assert chunks[0].span["endLine"] == 10


def test_chunk_source_splits_large_file() -> None:
    content = "\n".join(f"line {i}" for i in range(120))
    chunks = chunk_source(content, file_path="big.ts", min_lines=40, max_lines=60)
    assert len(chunks) >= 2


def test_chunk_source_uses_symbol_boundaries_for_typescript() -> None:
    content = "\n".join(f"// filler {i}" for i in range(30)) + "\nfunction handleAuth() {\n  return 1;\n}\n"
    chunks = chunk_source(content, file_path="auth.ts", min_lines=5, max_lines=60)
    assert any("handleAuth" in chunk.content for chunk in chunks)


def test_chunk_source_extends_short_window_to_min_lines() -> None:
    content = "\n".join(f"line {i}" for i in range(80))
    chunks = chunk_source(content, min_lines=40, max_lines=45)
    assert chunks[0].span["endLine"] - chunks[0].span["startLine"] + 1 >= 40
