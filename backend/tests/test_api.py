from __future__ import annotations

import copy
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


def make_document(name: str = "Kael") -> dict:
    return {
        "format": "agarias-dnd-character",
        "schemaVersion": 1,
        "character": {
            "identity": {"name": name, "portrait": None},
            "abilities": {"fuerza": 15, "destreza": 12, "constitucion": 14, "inteligencia": 8, "sabiduria": 10, "carisma": 13},
            "levels": [{"classKey": "barbaro", "hpRoll": 12, "improvement": None, "featureChoices": {}}],
            "futureField": {"kept": True},
        },
    }


@pytest.fixture()
def settings(tmp_path: Path) -> Settings:
    return Settings(
        env="test",
        database_path=tmp_path / "test.db",
        frontend_dist=None,
        max_body_bytes=200_000,
        rate_limit_writes=1000,
    )


@pytest.fixture()
def client(settings: Settings) -> TestClient:
    return TestClient(create_app(settings))


def create(client: TestClient, document: dict | None = None) -> dict:
    res = client.post("/api/characters", json={"document": document or make_document()})
    assert res.status_code == 201, res.text
    return res.json()


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def test_health(client: TestClient) -> None:
    assert client.get("/api/health").json() == {"status": "ok"}


def test_create_returns_unpredictable_id_and_token(client: TestClient) -> None:
    a, b = create(client), create(client)
    assert len(a["id"]) == 16 and a["id"] != b["id"]
    assert len(a["editToken"]) >= 40
    assert a["revision"] == 1


def test_shared_link_roundtrip_preserves_document(client: TestClient) -> None:
    doc = make_document()
    created = create(client, doc)
    res = client.get(f"/api/characters/{created['id']}")
    assert res.status_code == 200
    body = res.json()
    assert body["document"] == doc  # integridad exacta, incluidos campos desconocidos
    assert "editToken" not in body and "edit_token_hash" not in res.text
    assert res.headers["cache-control"] == "no-store"


def test_update_requires_valid_token(client: TestClient) -> None:
    created = create(client)
    doc = make_document("Otro")
    assert client.put(f"/api/characters/{created['id']}", json={"document": doc}).status_code == 403
    assert client.put(f"/api/characters/{created['id']}", json={"document": doc}, headers=auth("x" * 43)).status_code == 403
    ok = client.put(f"/api/characters/{created['id']}", json={"document": doc, "revision": 1}, headers=auth(created["editToken"]))
    assert ok.status_code == 200
    assert ok.json()["revision"] == 2
    assert client.get(f"/api/characters/{created['id']}").json()["document"]["character"]["identity"]["name"] == "Otro"


def test_update_detects_concurrent_changes(client: TestClient) -> None:
    created = create(client)
    headers = auth(created["editToken"])
    url = f"/api/characters/{created['id']}"
    assert client.put(url, json={"document": make_document("A"), "revision": 1}, headers=headers).status_code == 200
    stale = client.put(url, json={"document": make_document("B"), "revision": 1}, headers=headers)
    assert stale.status_code == 409
    assert stale.json()["error"]["code"] == "conflict"


def test_delete(client: TestClient) -> None:
    created = create(client)
    url = f"/api/characters/{created['id']}"
    assert client.delete(url).status_code == 403
    assert client.delete(url, headers=auth(created["editToken"])).status_code == 204
    assert client.get(url).status_code == 404


@pytest.mark.parametrize("bad_id", ["abc", "../../etc/passwd", "a" * 17, "aaaaaaaaaaaaaaa$"])
def test_invalid_ids_are_not_found(client: TestClient, bad_id: str) -> None:
    res = client.get(f"/api/characters/{bad_id}")
    assert res.status_code == 404
    assert res.json()["error"]["code"] == "not_found"


def test_rejects_foreign_or_corrupt_documents(client: TestClient) -> None:
    cases = [
        {"format": "otro", "schemaVersion": 1, "character": {}},
        {"format": "agarias-dnd-character", "schemaVersion": 99, "character": {}},
        {"format": "agarias-dnd-character", "schemaVersion": 1, "character": "texto"},
    ]
    for document in cases:
        res = client.post("/api/characters", json={"document": document})
        assert res.status_code == 422, document
        assert res.json()["error"]["code"] == "invalid_document"


@pytest.mark.parametrize("version,status", [(1, 201), (2, 201), (3, 201), (4, 422)])
def test_schema_versions(client: TestClient, version: int, status: int) -> None:
    doc = make_document()
    doc["schemaVersion"] = version
    assert client.post("/api/characters", json={"document": doc}).status_code == status


def test_rejects_out_of_range_values(client: TestClient) -> None:
    doc = make_document()
    doc["character"]["abilities"]["fuerza"] = 99
    assert client.post("/api/characters", json={"document": doc}).status_code == 422

    doc = make_document()
    doc["character"]["levels"] = [{"classKey": "mago", "hpRoll": 3}] * 21
    assert client.post("/api/characters", json={"document": doc}).status_code == 422

    doc = make_document()
    doc["character"]["identity"]["portrait"] = "javascript:alert(1)"
    assert client.post("/api/characters", json={"document": doc}).status_code == 422


def test_rejects_too_deep_documents(client: TestClient) -> None:
    doc = make_document()
    deep: dict = {}
    cursor = deep
    for _ in range(12):
        cursor["x"] = {}
        cursor = cursor["x"]
    doc["character"]["notes"] = deep
    assert client.post("/api/characters", json={"document": doc}).status_code == 422


def test_rejects_malformed_json(client: TestClient) -> None:
    res = client.post("/api/characters", content=b"{no json", headers={"Content-Type": "application/json"})
    assert res.status_code == 422
    assert res.json()["error"]["code"] == "invalid_request"


def test_body_size_limit(client: TestClient) -> None:
    doc = make_document()
    doc["character"]["notes"] = {"backstory": "x" * 19_000, "more": ["y" * 19_000] * 12}
    res = client.post("/api/characters", json={"document": doc})
    assert res.status_code == 413
    assert res.json()["error"]["code"] == "payload_too_large"


def test_rate_limit(settings: Settings) -> None:
    limited = TestClient(create_app(Settings(**{**settings.__dict__, "rate_limit_writes": 2})))
    assert limited.post("/api/characters", json={"document": make_document()}).status_code == 201
    assert limited.post("/api/characters", json={"document": make_document()}).status_code == 201
    res = limited.post("/api/characters", json={"document": make_document()})
    assert res.status_code == 429
    assert "Espera" in res.json()["error"]["message"]


def test_security_headers(client: TestClient) -> None:
    res = client.get("/api/health")
    assert res.headers["x-content-type-options"] == "nosniff"
    assert "frame-ancestors 'none'" in res.headers["content-security-policy"]


def test_data_survives_restart(settings: Settings) -> None:
    first = TestClient(create_app(settings))
    created = create(first)
    second = TestClient(create_app(settings))  # nueva instancia, misma base de datos
    assert second.get(f"/api/characters/{created['id']}").json()["document"] == make_document()


def test_serves_spa_without_path_traversal(tmp_path: Path, settings: Settings) -> None:
    dist = tmp_path / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text("<html>app</html>")
    (dist / "assets" / "app.js").write_text("console.log(1)")
    (tmp_path / "secret.txt").write_text("secreto")
    app_client = TestClient(create_app(Settings(**{**settings.__dict__, "frontend_dist": dist})))

    assert app_client.get("/").text == "<html>app</html>"
    assert app_client.get("/personaje/abcdefghijklmnop").text == "<html>app</html>"
    assert app_client.get("/assets/app.js").headers["cache-control"].startswith("public")
    assert app_client.get("/assets/missing.js").status_code == 404
    assert "secreto" not in app_client.get("/../secret.txt").text
    assert "secreto" not in app_client.get("/%2e%2e/secret.txt").text
    assert app_client.get("/api/unknown").status_code == 404


def test_document_is_not_mutated_by_server(client: TestClient) -> None:
    doc = make_document()
    original = copy.deepcopy(doc)
    created = create(client, doc)
    assert client.get(f"/api/characters/{created['id']}").json()["document"] == original
