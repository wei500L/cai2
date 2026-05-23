def test_healthz(client) -> None:
    response = client.get("/healthz")

    assert response.status_code == 200
    body = response.json()
    assert body == {
        "status": "ok",
        "service": "diplomacy-backend",
        "env": "dev",
        "ws_path": "/ws",
        "llm_provider": "mock",
        "version": "0.1.0",
    }


def test_readyz(client) -> None:
    response = client.get("/readyz")

    assert response.status_code == 200
    body = response.json()
    assert body["ready"] is True
    assert body["status"] == "ok"
    assert body["llm_provider"] == "mock"
    assert body["checks"] == {
        "repositories": True,
        "db": "skipped",
        "mock_llm": True,
    }
