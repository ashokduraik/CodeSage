"""Tests for distillation LLM client."""

from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

from config import Settings
from services.llm.distill_client import complete_distill_json, resolve_distill_model


def test_resolve_distill_model_prefers_distill_model() -> None:
    settings = Settings(vllm_model="small", vllm_distill_model="large")
    assert resolve_distill_model(settings) == "large"


def test_resolve_distill_model_falls_back_to_vllm_model() -> None:
    settings = Settings(vllm_model="small", vllm_distill_model="")
    assert resolve_distill_model(settings) == "small"


def test_complete_distill_json_returns_none_when_unconfigured() -> None:
    assert complete_distill_json(
        Settings(vllm_base_url="", vllm_model=""),
        system_prompt="sys",
        user_prompt="user",
    ) is None


def test_complete_distill_json_parses_response() -> None:
    settings = Settings(vllm_base_url="http://llm/v1", vllm_model="qwen")
    payload = {"workflows": [], "page_map": [], "permission_rules": [], "data_flows": []}
    response = MagicMock()
    response.status_code = 200
    response.json.return_value = {
        "choices": [{"message": {"content": json.dumps(payload)}}],
    }
    with patch("services.llm.distill_client.httpx.post", return_value=response):
        parsed = complete_distill_json(
            settings,
            system_prompt="sys",
            user_prompt="user",
        )
    assert parsed == payload
