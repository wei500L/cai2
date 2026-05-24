from app.core.config import get_settings


def test_healthz(client) -> None:
    response = client.get("/healthz")

    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert body["mode"] == "dev"
    assert body["version"] == "0.1.0"
    assert isinstance(body["ts"], int)


def test_readyz(client) -> None:
    settings = get_settings()
    response = client.get("/readyz")

    assert response.status_code == 200
    body = response.json()
    assert body["ready"] is True
    assert body["status"] == "ok"
    assert body["llm_provider"] == settings.llm_provider
    assert body["checks"] == {
        "repositories": True,
        "db": "skipped",
        "llm_ready": True,
    }
