"""Tests for tree-sitter symbol extraction."""

from services.parsing.tree_sitter_parser import extract_symbol_spans


def test_extract_symbol_spans_finds_function_and_class() -> None:
    source = """
export function loginUser() {
  return true;
}

class AuthService {
  validate() {
    return false;
  }
}
"""
    spans = extract_symbol_spans(source, "src/auth.ts")
    names = {span.name for span in spans}
    assert "loginUser" in names
    assert "AuthService" in names
    assert "validate" in names


def test_extract_symbol_spans_returns_empty_for_unsupported_extension() -> None:
    assert extract_symbol_spans("def main(): pass", "main.py") == []


def test_extract_symbol_spans_returns_empty_for_blank_file() -> None:
    assert extract_symbol_spans("   \n", "blank.ts") == []
