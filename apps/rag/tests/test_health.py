def test_health_ok(rag_client) -> None:
    response = rag_client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "rag"}
