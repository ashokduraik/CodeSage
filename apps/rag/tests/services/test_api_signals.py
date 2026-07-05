"""Tests for HTTP/route signal extraction."""

from services.graph.api_signals import extract_api_signals, normalize_api_path


def test_normalize_api_path_relative_only() -> None:
    assert normalize_api_path("/api/users") == "/api/users"
    assert normalize_api_path("/api/users/") == "/api/users"
    assert normalize_api_path("https://example.com/x") is None


def test_extract_api_signals_finds_client_and_server_patterns() -> None:
    source = """
import axios from 'axios';
export function loadUser() {
  return axios.get('/api/users');
}
app.post('/api/users', handler);
"""
    signals = extract_api_signals(source, "src/routes.ts")
    keys = {signal.key for signal in signals}
    assert "GET /api/users" in keys
    assert "POST /api/users" in keys
    assert any(signal.kind == "http_call" for signal in signals)
    assert any(signal.kind == "route" for signal in signals)


def test_extract_api_signals_skips_non_js_files() -> None:
    assert extract_api_signals("fetch('/x')", "README.md") == []
