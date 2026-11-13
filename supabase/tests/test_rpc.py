"""Pruebas de las funciones de Supabase contra un PostgreSQL local.

Ejecutan la migración en una base de datos temporal y llaman a las funciones
con el rol `anon`, igual que hará el navegador a través de PostgREST.

Requisitos: `psql` y una base de datos accesible en AGARIAS_TEST_PG
(p. ej. «-h /tmp -p 54329 -U postgres»). Si no está definida, se omiten.

    AGARIAS_TEST_PG="-h /tmp -p 54329 -U postgres" python -m pytest supabase/tests -q
"""
from __future__ import annotations

import json
import os
import shlex
import subprocess
from pathlib import Path

import pytest

PG = os.environ.get("AGARIAS_TEST_PG")
pytestmark = pytest.mark.skipif(not PG, reason="AGARIAS_TEST_PG no definido")
MIGRATIONS = sorted((Path(__file__).resolve().parent.parent / "migrations").glob("*.sql"))
DB = "agarias_test"


def psql(*args: str, db: str = DB, stdin: str | None = None) -> subprocess.CompletedProcess:
    cmd = ["psql", *shlex.split(PG or ""), "-d", db, "-v", "ON_ERROR_STOP=1", "-qtA", *args]
    return subprocess.run(cmd, input=stdin, text=True, capture_output=True)


@pytest.fixture(scope="module", autouse=True)
def database():
    psql("-c", f"drop database if exists {DB}", db="postgres")
    psql("-c", f"create database {DB}", db="postgres")
    psql("-c", "do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;"
               "do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;")
    for migration in MIGRATIONS:
        res = psql("-f", str(migration))
        assert res.returncode == 0, res.stderr
    yield


def call(fn: str, *args) -> dict:
    """Llama a public.fn(args) como anon. Devuelve el JSON o {'error': código}."""
    params = ", ".join("NULL" if a is None else f"$x${json.dumps(a) if isinstance(a, (dict, list)) else a}$x$" for a in args)
    sql = f"set role anon; select public.{fn}({params});"
    res = psql(stdin=sql)
    if res.returncode != 0:
        msg = res.stderr.strip().splitlines()[0]
        return {"error": msg.split("ERROR:")[-1].strip()}
    return json.loads(res.stdout.strip().splitlines()[-1])


def doc(campaign=None, content=None):
    character = {"identity": {"name": "Vex"}}
    if campaign:
        character["campaign"] = {"id": campaign, "name": "Mesa"}
    if content:
        character["content"] = content
    return {"format": "agarias-dnd-character", "schemaVersion": 3, "character": character}


def test_anon_cannot_touch_tables():
    res = psql("-c", "set role anon; select * from agarias.campaigns;")
    assert res.returncode != 0
    res = psql("-c", "set role anon; insert into agarias.shared_characters values ('x','y','{}');")
    assert res.returncode != 0


def test_share_lifecycle():
    created = call("share_create", doc())
    assert len(created["id"]) >= 16 and len(created["editToken"]) >= 40
    got = call("share_get", created["id"])
    assert got["document"]["character"]["identity"]["name"] == "Vex"
    assert call("share_update", created["id"], "malo", doc(), None) == {"error": "forbidden"}
    upd = call("share_update", created["id"], created["editToken"], doc(), 1)
    assert upd["revision"] == 2
    assert call("share_update", created["id"], created["editToken"], doc(), 1) == {"error": "conflict"}
    assert call("share_delete", created["id"], created["editToken"]) == {"deleted": True}
    assert call("share_get", created["id"]) == {"error": "not_found"}


def test_share_rejects_bad_documents():
    assert call("share_create", {"format": "otro"}) == {"error": "invalid"}
    assert call("share_create", {**doc(), "schemaVersion": 99}) == {"error": "invalid"}
    big = doc()
    big["character"]["notes"] = "x" * 2_100_000
    assert call("share_create", big) == {"error": "payload_too_large"}


def test_campaign_permissions_and_content():
    camp = call("campaign_create", "Las Torres Grises")
    cid, dm, inv = camp["id"], camp["dmKey"], camp["inviteCode"]
    assert call("campaign_get", cid, "nada") == {"error": "forbidden"}
    assert call("campaign_get", cid, inv)["role"] == "jugador"
    assert call("campaign_get", cid, dm)["role"] == "dm"

    # El DM crea un borrador: el jugador no lo ve.
    raza = call("content_upsert", cid, dm, "raza", {"name": "Umbrío"}, None, None)
    assert raza["status"] == "borrador"
    assert call("campaign_get", cid, inv)["items"] == []

    # Un jugador no puede crear contenido salvo que las reglas lo permitan.
    assert call("content_upsert", cid, inv, "dote", {"name": "Mía"}, None, None) == {"error": "forbidden"}
    assert call("campaign_update", cid, inv, None, {"homebrew": {"dote": "propuestas"}}) == {"error": "forbidden"}
    call("campaign_update", cid, dm, None, {"homebrew": {"dote": "propuestas"}})
    prop = call("content_upsert", cid, inv, "dote", {"name": "Mía"}, None, "publicado")
    assert prop["status"] == "propuesto"  # el jugador nunca publica

    # El jugador no puede tocar contenido del DM ni cambiar estados.
    assert call("content_upsert", cid, inv, "raza", {"name": "Hack"}, raza["contentId"], None) == {"error": "forbidden"}
    assert call("content_set_status", cid, inv, raza["contentId"], "publicado") == {"error": "forbidden"}

    # Publicar: ahora el jugador la ve; editar lo publicado sube la versión.
    assert call("content_set_status", cid, dm, raza["contentId"], "publicado")["status"] == "publicado"
    items = call("campaign_get", cid, inv)["items"]
    assert {i["data"]["name"] for i in items} == {"Umbrío", "Mía"}
    v2 = call("content_upsert", cid, dm, "raza", {"name": "Umbrío", "description": "v2"}, raza["contentId"], None)
    assert v2["version"] == 2 and v2["status"] == "publicado"

    # Borrar lo publicado sólo lo retira; una propuesta se elimina.
    assert call("content_delete", cid, dm, raza["contentId"]) == {"deleted": False, "status": "retirado"}
    assert call("content_delete", cid, dm, prop["contentId"]) == {"deleted": True}

    # Rotar la invitación invalida el código anterior.
    new_inv = call("campaign_rotate_invite", cid, dm)["inviteCode"]
    assert call("campaign_get", cid, inv) == {"error": "forbidden"}
    assert call("campaign_get", cid, new_inv)["role"] == "jugador"


def test_share_blocks_unauthorized_campaign_content():
    camp = call("campaign_create", "Mesa 2")
    cid, dm = camp["id"], camp["dmKey"]
    draft = call("content_upsert", cid, dm, "clase", {"name": "Secreta"}, None, None)
    ref = f"hb:{cid}:clase:{draft['contentId']}"
    snapshot = {ref: {"type": "clase", "version": 1, "name": "Secreta", "data": {"name": "Secreta"}}}
    assert call("share_create", doc(cid, snapshot)) == {"error": "unauthorized_content"}
    call("content_set_status", cid, dm, draft["contentId"], "publicado")
    assert "id" in call("share_create", doc(cid, snapshot))
    # Contenido de OTRA campaña o local no se comprueba aquí.
    assert "id" in call("share_create", doc(cid, {"hb:local:raza:abc": {"type": "raza", "data": {"name": "x"}}}))


def test_extension_unlock_codes_checked_on_share():
    import hashlib
    camp = call("campaign_create", "Mesa 3")
    cid, dm = camp["id"], camp["dmKey"]
    code = "ABCD-EFGH-2345"
    ext = call("content_upsert", cid, dm, "extension", {"name": "Juramento Oculto", "classKey": "guerrero", "access": "desbloqueo",
               "unlockHash": hashlib.sha256(code.encode()).hexdigest()}, None, "publicado")
    ref = f"hb:{cid}:extension:{ext['contentId']}"
    content = {ref: {"type": "extension", "version": 1, "name": "x", "data": {"name": "x"}}}
    d = doc(cid, content)
    assert call("share_create", d) == {"error": "unauthorized_content"}
    d["character"]["unlocks"] = [{"ref": ref, "code": "ZZZZ-ZZZZ-ZZZZ"}]
    assert call("share_create", d) == {"error": "unauthorized_content"}
    d["character"]["unlocks"] = [{"ref": ref, "code": code}]
    assert "id" in call("share_create", d)


def market(day=1, seed="s", note="x"):
    return {"format": "agarias-shop-world", "version": 1, "seed": seed, "day": day, "shops": {}, "ledger": [], "note": note}


def test_shop_market_per_campaign():
    camp = call("campaign_create", "Mercado")
    cid, dm, inv = camp["id"], camp["dmKey"], camp["inviteCode"]
    assert call("shop_market_get", cid, "nada") == {"error": "forbidden"}
    empty = call("shop_market_get", cid, inv)
    assert empty["world"] is None and empty["revision"] == 0 and empty["role"] == "jugador"

    # El primero que entra crea el mercado; luego hace falta la revisión correcta.
    assert call("shop_market_save", cid, inv, market(), 0)["revision"] == 1
    assert call("shop_market_save", cid, inv, market(), 0) == {"error": "conflict"}
    assert call("shop_market_save", cid, inv, market(), None) == {"error": "conflict"}
    assert call("shop_market_save", cid, inv, market(note="compra"), 1)["revision"] == 2
    assert call("shop_market_get", cid, dm)["world"]["note"] == "compra"

    # Sólo el DM avanza el día o reinicia el mercado.
    assert call("shop_market_save", cid, inv, market(day=2), 2) == {"error": "forbidden"}
    assert call("shop_market_save", cid, inv, market(seed="otra"), 2) == {"error": "forbidden"}
    assert call("shop_market_save", cid, dm, market(day=2), 2)["revision"] == 3

    # Formato y tamaño.
    assert call("shop_market_save", cid, dm, {"format": "otro", "day": 1, "shops": {}}, 3) == {"error": "invalid"}
    big = market(day=2)
    big["note"] = "x" * 1_600_000
    assert call("shop_market_save", cid, dm, big, 3) == {"error": "payload_too_large"}

    # Las tablas siguen cerradas para anon.
    assert psql("-c", "set role anon; select * from agarias.shop_markets;").returncode != 0


def test_merchant_content_type():
    camp = call("campaign_create", "Mercaderes")
    cid, dm = camp["id"], camp["dmKey"]
    created = call("content_upsert", cid, dm, "mercader", {"name": "Odette", "location": "plaza-mayor", "sells": ["equipo"]}, None, "publicado")
    assert created["status"] == "publicado"
    assert call("content_upsert", cid, dm, "inventado", {"name": "X"}, None, None) == {"error": "invalid"}
    items = call("campaign_get", cid, dm)["items"]
    assert any(i["type"] == "mercader" for i in items)


def test_world_content_is_dm_only():
    camp = call("campaign_create", "Thaabdur")
    cid, dm, inv = camp["id"], camp["dmKey"], camp["inviteCode"]
    # Aunque las reglas permitan propuestas para todo, el mundo de la Tienda es sólo del DM.
    rules = {"homebrew": {t: "propuestas" for t in ["mercader", "region", "faccion", "evento", "dote"]}}
    call("campaign_update", cid, dm, None, rules)
    for t in ["mercader", "region", "faccion", "evento"]:
        assert call("content_upsert", cid, inv, t, {"name": "X"}, None, None) == {"error": "forbidden"}
        assert call("content_upsert", cid, dm, t, {"name": "Y"}, None, "publicado")["status"] == "publicado"
    assert call("content_upsert", cid, inv, "dote", {"name": "Mía"}, None, None)["status"] == "propuesto"


def test_campaign_details():
    camp = call("campaign_create", "Thaabdur")
    cid, dm, inv = camp["id"], camp["dmKey"], camp["inviteCode"]
    assert call("campaign_get", cid, dm)["details"] == {}
    details = {"synopsis": "Minas y conspiraciones.", "kind": "campana", "players": {"min": 3, "max": 5}}
    assert call("campaign_set_details", cid, inv, details) == {"error": "forbidden"}
    assert call("campaign_set_details", cid, dm, details)["details"] == details
    assert call("campaign_get", cid, inv)["details"] == details
    assert call("campaign_set_details", cid, dm, {"x": "y" * 30000}) == {"error": "payload_too_large"}
