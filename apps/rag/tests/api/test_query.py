"""Tests for POST /rag/query."""

import uuid

from fastapi.testclient import TestClient

from api.main import create_app


def test_rag_query_streams_abstain_for_end_user() -> None:
    with TestClient(create_app()) as client:
        response = client.post(
            "/rag/query",
            json={
                "question": "How do I checkout?",
                "projectId": str(uuid.uuid4()),
                "audience": "end_user",
            },
        )
        assert response.status_code == 200
        assert "text/event-stream" in response.headers["content-type"]
        assert "abstain" in response.text
