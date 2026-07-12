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


def test_extract_api_signals_fetch_defaults_to_get() -> None:
    source = "fetch('/api/users');"
    signals = extract_api_signals(source, "client.ts")
    assert len(signals) == 1
    assert signals[0].key == "GET /api/users"


def test_extract_api_signals_fetch_with_explicit_method() -> None:
    source = "fetch('/api/users', { method: 'POST' });"
    signals = extract_api_signals(source, "client.ts")
    assert len(signals) == 1
    assert signals[0].key == "POST /api/users"


def test_extract_api_signals_fetch_with_nested_options_object() -> None:
    source = """
fetch('/api/users', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
});
"""
    signals = extract_api_signals(source, "client.ts")
    assert len(signals) == 1
    assert signals[0].key == "POST /api/users"
