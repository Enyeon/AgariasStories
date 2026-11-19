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


def legacy_campaign(name: str) -> dict:
    """Campaña con el acceso «antiguo»: el código de invitación basta para jugar
    (así quedan las campañas creadas antes de 20261118)."""
    camp = call("campaign_create", name)
    assert call("campaign_set_access", camp["id"], camp["dmKey"], "true") == {"openInvite": True}
    return camp


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
    camp = legacy_campaign("Las Torres Grises")
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
    camp = legacy_campaign("Mesa 2")
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
    camp = legacy_campaign("Mesa 3")
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
    camp = legacy_campaign("Mercado")
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
    camp = legacy_campaign("Mercaderes")
    cid, dm = camp["id"], camp["dmKey"]
    created = call("content_upsert", cid, dm, "mercader", {"name": "Odette", "location": "plaza-mayor", "sells": ["equipo"]}, None, "publicado")
    assert created["status"] == "publicado"
    assert call("content_upsert", cid, dm, "inventado", {"name": "X"}, None, None) == {"error": "invalid"}
    items = call("campaign_get", cid, dm)["items"]
    assert any(i["type"] == "mercader" for i in items)


def test_world_content_is_dm_only():
    camp = legacy_campaign("Thaabdur")
    cid, dm, inv = camp["id"], camp["dmKey"], camp["inviteCode"]
    # Aunque las reglas permitan propuestas para todo, el mundo de la Tienda es sólo del DM.
    rules = {"homebrew": {t: "propuestas" for t in ["mercader", "region", "faccion", "evento", "dote"]}}
    call("campaign_update", cid, dm, None, rules)
    for t in ["mercader", "region", "faccion", "evento"]:
        assert call("content_upsert", cid, inv, t, {"name": "X"}, None, None) == {"error": "forbidden"}
        assert call("content_upsert", cid, dm, t, {"name": "Y"}, None, "publicado")["status"] == "publicado"
    assert call("content_upsert", cid, inv, "dote", {"name": "Mía"}, None, None)["status"] == "propuesto"


def test_campaign_details():
    camp = legacy_campaign("Thaabdur")
    cid, dm, inv = camp["id"], camp["dmKey"], camp["inviteCode"]
    assert call("campaign_get", cid, dm)["details"] == {}
    details = {"synopsis": "Minas y conspiraciones.", "kind": "campana", "players": {"min": 3, "max": 5}}
    assert call("campaign_set_details", cid, inv, details) == {"error": "forbidden"}
    assert call("campaign_set_details", cid, dm, details)["details"] == details
    assert call("campaign_get", cid, inv)["details"] == details
    assert call("campaign_set_details", cid, dm, {"x": "y" * 30000}) == {"error": "payload_too_large"}


def test_exploration_reports_are_dm_only():
    camp = legacy_campaign("Informes")
    cid, dm, inv = camp["id"], camp["dmKey"], camp["inviteCode"]
    assert call("shop_market_save", cid, inv, market(), 0)["revision"] == 1
    # Un mercado viejo sin «reports» y uno con la lista vacía valen lo mismo.
    assert call("shop_market_save", cid, inv, {**market(), "reports": []}, 1)["revision"] == 2
    pending = {**market(), "reports": [{"id": "rep-1", "status": "pendiente", "outcome": "exito"}]}
    assert call("shop_market_save", cid, inv, pending, 2) == {"error": "forbidden"}
    assert call("shop_market_save", cid, dm, pending, 2)["revision"] == 3
    confirmed = {**market(), "reports": [{"id": "rep-1", "status": "confirmado", "outcome": "descubrimiento"}]}
    assert call("shop_market_save", cid, inv, confirmed, 3) == {"error": "forbidden"}
    # El jugador puede seguir comprando sin tocar los informes.
    assert call("shop_market_save", cid, inv, {**pending, "note": "compra"}, 3)["revision"] == 4
    assert call("shop_market_save", cid, dm, confirmed, 4)["revision"] == 5


def test_floor_progress_is_dm_only():
    camp = legacy_campaign("Lord 100")
    cid, dm, inv = camp["id"], camp["dmKey"], camp["inviteCode"]
    assert call("shop_market_save", cid, inv, market(), 0)["revision"] == 1
    floor2 = {**market(), "progress": {"enabled": True, "current": 2, "done": {}, "overrides": {}, "log": []}}
    assert call("shop_market_save", cid, inv, floor2, 1) == {"error": "forbidden"}
    assert call("shop_market_save", cid, dm, floor2, 1)["revision"] == 2
    # Un jugador sigue pudiendo comprar si no toca el piso…
    assert call("shop_market_save", cid, inv, {**floor2, "note": "compra"}, 2)["revision"] == 3
    # …pero no abrir un negocio ni marcar un requisito.
    cheat = {**floor2, "progress": {**floor2["progress"], "done": {"forja": True}}}
    assert call("shop_market_save", cid, inv, cheat, 3) == {"error": "forbidden"}
    # Ni crear un mercado ya con piso.
    other = legacy_campaign("Otra")
    assert call("shop_market_save", other["id"], other["inviteCode"], floor2, 0) == {"error": "forbidden"}


# ── Campañas con jugadores (20261118) ───────────────────────────────────────

def pc_doc(name="Vex"):
    return {"format": "agarias-dnd-character", "schemaVersion": 3, "character": {"identity": {"name": name}}}


def test_join_requires_dm_approval():
    camp = call("campaign_create", "Mesa nueva")
    cid, dm, inv = camp["id"], camp["dmKey"], camp["inviteCode"]
    # En una campaña nueva el código de invitación ya no da acceso por sí solo.
    assert call("campaign_get", cid, inv) == {"error": "forbidden"}
    assert call("campaign_join", cid, "malo", "Ana", "jugador") == {"error": "forbidden"}
    ana = call("campaign_join", cid, inv, "Ana", "jugador")
    assert ana["status"] == "pendiente" and len(ana["key"]) >= 30
    me = call("campaign_me", cid, ana["key"])
    assert me["status"] == "pendiente" and me["role"] == "jugador"
    # Pendiente: no ve la campaña, pero ya puede proponer su PJ.
    assert call("campaign_get", cid, ana["key"]) == {"error": "forbidden"}
    assert call("campaign_roster", cid, ana["key"]) == {"error": "forbidden"}
    pc = call("pc_link", cid, ana["key"], pc_doc(), {"name": "Vex", "level": 3})
    assert pc["status"] == "pendiente"

    roster = call("campaign_roster", cid, dm)
    assert [m["status"] for m in roster["members"]] == ["pendiente"]
    assert roster["characters"][0]["summary"]["name"] == "Vex"
    # Sólo el DM aprueba.
    assert call("member_update", cid, ana["key"], ana["memberId"], "activo", None) == {"error": "forbidden"}
    assert call("member_update", cid, dm, ana["memberId"], "activo", None)["status"] == "activo"
    assert call("pc_review", cid, dm, pc["pcId"], "activo")["status"] == "activo"
    assert call("campaign_get", cid, ana["key"])["role"] == "jugador"
    # La copia apunta a la campaña (Homebrew y mercado de esa campaña).
    got = call("pc_get", cid, ana["key"], pc["pcId"])
    assert got["mine"] and got["document"]["character"]["campaign"]["id"] == cid


def test_pc_save_revision_events_and_privacy():
    camp = call("campaign_create", "Mesa registro")
    cid, dm, inv = camp["id"], camp["dmKey"], camp["inviteCode"]
    ana = call("campaign_join", cid, inv, "Ana", "jugador")
    bob = call("campaign_join", cid, inv, "Bob", "jugador")
    obs = call("campaign_join", cid, inv, "Ojo", "observador")
    for m in (ana, bob, obs):
        call("member_update", cid, dm, m["memberId"], "activo", None)
    pc = call("pc_link", cid, ana["key"], pc_doc(), {"name": "Vex", "level": 3})
    call("pc_review", cid, dm, pc["pcId"], "activo")
    # Los observadores no tienen PJ ni tocan el mercado.
    assert call("pc_link", cid, obs["key"], pc_doc("X"), None) == {"error": "forbidden"}
    assert call("shop_market_save", cid, obs["key"], {"format": "agarias-shop-world", "day": 1, "shops": {}}, 0) == {"error": "forbidden"}

    # Guardar: dueño sí, otro jugador no; revisión obligatoria.
    events = [{"kind": "compra", "text": "Compra una cuerda", "visibility": "privado"},
              {"kind": "nivel", "text": "Sube a nivel 4", "visibility": "publico"}]
    assert call("pc_save", cid, bob["key"], pc["pcId"], pc_doc(), None, 2, [], None, None) == {"error": "forbidden"}
    assert call("pc_save", cid, ana["key"], pc["pcId"], pc_doc(), None, 7, events, None, None) == {"error": "conflict"}
    saved = call("pc_save", cid, ana["key"], pc["pcId"], pc_doc(), {"name": "Vex", "level": 4}, 1, events, None, None)
    assert saved["revision"] == 2
    # El jugador no decide si su PJ muere; el DM sí, y queda registrado.
    assert call("pc_save", cid, ana["key"], pc["pcId"], None, None, 2, [], "muerto", None) == {"error": "forbidden"}
    dead = call("pc_save", cid, dm, pc["pcId"], None, None, 2, [], "muerto", None)
    assert dead["state"] == "muerto" and dead["revision"] == 3

    def kinds(key):
        return [e["kind"] for e in call("events_list", cid, key, None, None, 50)["events"]]
    assert "compra" in kinds(ana["key"]) and "compra" not in kinds(bob["key"])  # privado
    assert "nivel" in kinds(bob["key"]) and "muerte" in kinds(obs["key"])       # público
    assert "compra" in kinds(dm)

    # Nota sólo para el DM escrita por el jugador: la ve él y el DM, nadie más.
    call("event_add", cid, ana["key"], "nota", "Secreto para el DM", None, pc["pcId"], "dm", None)
    assert "nota" in kinds(ana["key"]) and "nota" in kinds(dm) and "nota" not in kinds(bob["key"])
    assert call("event_add", cid, bob["key"], "nota", "Hack", None, pc["pcId"], "publico", None) == {"error": "forbidden"}

    # Privacidad de la ficha para los demás.
    assert call("pc_get", cid, bob["key"], pc["pcId"])["document"] is None
    call("pc_save", cid, ana["key"], pc["pcId"], None, None, 3, [], None, "publico")
    assert call("pc_get", cid, bob["key"], pc["pcId"])["document"]["character"]["identity"]["name"] == "Vex"
    call("pc_save", cid, ana["key"], pc["pcId"], None, None, 4, [], None, "privado")
    assert call("pc_get", cid, bob["key"], pc["pcId"])["summary"] == {"name": "Vex"}


def test_expel_and_sessions():
    camp = call("campaign_create", "Mesa sesiones")
    cid, dm, inv = camp["id"], camp["dmKey"], camp["inviteCode"]
    ana = call("campaign_join", cid, inv, "Ana", "jugador")
    call("member_update", cid, dm, ana["memberId"], "activo", None)
    pc = call("pc_link", cid, ana["key"], pc_doc(), {"name": "Vex"})
    call("pc_review", cid, dm, pc["pcId"], "activo")

    assert call("session_start", cid, dm, "La cripta")["session"] == 1
    call("event_add", cid, dm, "nota", "Encuentran la llave", None, None, "publico", None)
    ev = call("events_list", cid, dm, None, None, 10)["events"]
    assert ev[0]["sessionId"] == 1 and ev[0]["kind"] == "nota"
    assert call("session_end", cid, dm)["ended"] == 1

    # Expulsar desvincula su PJ sin borrar nada; la clave deja de valer.
    assert call("member_update", cid, dm, ana["memberId"], "expulsado", None)["status"] == "expulsado"
    assert call("campaign_me", cid, ana["key"]) == {"error": "forbidden"}
    assert call("campaign_roster", cid, dm)["characters"][0]["status"] == "desvinculado"
    # No se puede eliminar a un miembro activo; a uno expulsado sí (sus PJ quedan).
    bob = call("campaign_join", cid, inv, "Bob", "jugador")
    call("member_update", cid, dm, bob["memberId"], "activo", None)
    assert call("member_update", cid, dm, bob["memberId"], "eliminar", None) == {"error": "invalid"}
    assert call("member_update", cid, dm, ana["memberId"], "eliminar", None)["deleted"] is True
    assert len(call("campaign_roster", cid, dm)["characters"]) == 1


def test_legacy_invite_keeps_working_and_can_be_closed():
    camp = legacy_campaign("Mesa antigua")
    cid, dm, inv = camp["id"], camp["dmKey"], camp["inviteCode"]
    me = call("campaign_me", cid, inv)
    assert me["legacy"] is True and me["role"] == "jugador"
    # Con la clave de invitación compartida no se puede ser dueño de un PJ.
    assert call("pc_link", cid, inv, pc_doc(), None) == {"error": "forbidden"}
    call("campaign_set_access", cid, dm, "false")
    assert call("campaign_get", cid, inv) == {"error": "forbidden"}


# ── Mundo, sesiones e intercambio (20261119) ────────────────────────────────

def table_with_two_players(name="Mesa mundo"):
    camp = call("campaign_create", name)
    cid, dm, inv = camp["id"], camp["dmKey"], camp["inviteCode"]
    ana = call("campaign_join", cid, inv, "Ana", "jugador")
    bob = call("campaign_join", cid, inv, "Bob", "jugador")
    for m in (ana, bob):
        call("member_update", cid, dm, m["memberId"], "activo", None)
    return cid, dm, ana, bob


def titles(cid, key):
    return sorted(e["title"] for e in call("world_list", cid, key)["entries"])


def test_world_reveal_levels_and_secrets():
    cid, dm, ana, bob = table_with_two_players()
    tower = call("world_upsert", cid, dm, None, "lugar", "Torre Gris", {"summary": "Una torre."}, {"text": "El liche vive aquí"}, "oculto", None)
    assert tower["reveal"] == "oculto" and tower["secret"]["text"]
    assert titles(cid, ana["key"]) == []
    # Sólo Ana lo descubre.
    call("world_upsert", cid, dm, tower["entryId"], "lugar", "Torre Gris", {"summary": "Una torre."}, {"text": "El liche vive aquí"}, "algunos", "{" + ana["memberId"] + ",intruso}")
    seen = call("world_list", cid, ana["key"])["entries"]
    assert [e["title"] for e in seen] == ["Torre Gris"] and "secret" not in seen[0] and seen[0]["revealedTo"] is None
    assert titles(cid, bob["key"]) == []
    # Ahora todos; el registro lo anota.
    call("world_upsert", cid, dm, tower["entryId"], "lugar", "Torre Gris", {"summary": "Una torre."}, {"text": "x"}, "todos", None)
    assert titles(cid, bob["key"]) == ["Torre Gris"]
    kinds = [e["kind"] for e in call("events_list", cid, bob["key"], None, None, 50)["events"]]
    assert "descubrimiento" in kinds
    # Los jugadores no editan entradas del DM ni crean lugares.
    assert call("world_upsert", cid, ana["key"], tower["entryId"], "lugar", "Mía", {}, {}, None, None) == {"error": "forbidden"}
    assert call("world_upsert", cid, ana["key"], None, "lugar", "Mía", {}, {}, None, None) == {"error": "forbidden"}


def test_player_notes_private_even_from_dm():
    cid, dm, ana, bob = table_with_two_players("Mesa notas")
    priv = call("world_upsert", cid, ana["key"], None, "nota", "Sospecho del posadero", {"text": "…"}, {"x": 1}, "autor", None)
    assert priv["reveal"] == "autor" and "secret" not in priv
    assert titles(cid, ana["key"]) == ["Sospecho del posadero"]
    assert titles(cid, dm) == [] and titles(cid, bob["key"]) == []
    shared = call("world_upsert", cid, ana["key"], None, "nota", "Plan", {}, {}, "todos", None)
    assert "Plan" in titles(cid, bob["key"]) and "Plan" in titles(cid, dm)
    assert call("world_upsert", cid, ana["key"], None, "nota", "x", {}, {}, "algunos", None) == {"error": "invalid"}
    assert call("world_delete", cid, bob["key"], shared["entryId"]) == {"error": "forbidden"}
    assert call("world_delete", cid, ana["key"], shared["entryId"])["deleted"] is True


def test_quest_completion_logged():
    cid, dm, ana, _ = table_with_two_players("Mesa misiones")
    q = call("world_upsert", cid, dm, None, "mision", "Rescatar a Lira", {"quest": {"status": "activa"}}, {}, "todos", None)
    call("world_upsert", cid, dm, q["entryId"], "mision", "Rescatar a Lira", {"quest": {"status": "completada"}}, {}, None, None)
    texts = [e["text"] for e in call("events_list", cid, ana["key"], None, None, 50)["events"]]
    assert any(t.startswith("Misión completada") for t in texts)


def test_chapters_and_sessions():
    cid, dm, ana, _ = table_with_two_players("Mesa capítulos")
    assert call("chapter_upsert", cid, ana["key"], None, "x", "") == {"error": "forbidden"}
    ch = call("chapter_upsert", cid, dm, None, "La cripta", "Empieza todo")["chapterId"]
    s = call("session_start", cid, dm, "Primera noche", None)
    assert s == {"session": 1, "chapterId": ch}
    call("event_add", cid, dm, "nota", "Cae la puerta", None, None, "publico", None)
    call("session_update", cid, dm, 1, "Primera noche", "Resumen para todos", "Secreto", ch)
    call("session_end", cid, dm)
    call("session_start", cid, dm, "Segunda", None)
    mine = call("sessions_list", cid, ana["key"])
    assert [c["title"] for c in mine["chapters"]] == ["La cripta"]
    first = mine["sessions"][0]
    assert first["summary"] == "Resumen para todos" and first["dmNotes"] is None and first["events"] >= 2
    assert call("sessions_list", cid, dm)["sessions"][0]["dmNotes"] == "Secreto"
    only1 = call("events_list", cid, ana["key"], None, None, 50, 1)["events"]
    assert only1 and all(e["sessionId"] == 1 for e in only1)


def test_pc_transfer_items_and_coins():
    cid, dm, ana, bob = table_with_two_players("Mesa intercambio")
    def char(name, items, gp):
        return {"format": "agarias-dnd-character", "schemaVersion": 3,
                "character": {"identity": {"name": name}, "equipment": {"items": items, "coins": {"cp": 0, "sp": 0, "gp": gp, "pp": 0, "system": "dnd"}}}}
    a = call("pc_link", cid, ana["key"], char("Vex", [{"name": "Poción", "quantity": 3, "notes": "", "equipped": True}, {"name": "Cuerda", "quantity": 1, "notes": ""}], 10), {"name": "Vex"})
    b = call("pc_link", cid, bob["key"], char("Kael", [{"name": "poción", "quantity": 1, "notes": ""}], 0), {"name": "Kael"})
    for p in (a, b):
        call("pc_review", cid, dm, p["pcId"], "activo")
    # Otro jugador no puede dar lo de Vex; revisión obligatoria; el nombre se comprueba.
    assert call("pc_transfer", cid, bob["key"], a["pcId"], b["pcId"], 1, 0, "Poción", 1, None) == {"error": "forbidden"}
    assert call("pc_transfer", cid, ana["key"], a["pcId"], b["pcId"], 9, 0, "Poción", 1, None) == {"error": "conflict"}
    assert call("pc_transfer", cid, ana["key"], a["pcId"], b["pcId"], 1, 0, "Antorcha", 1, None) == {"error": "conflict"}
    res = call("pc_transfer", cid, ana["key"], a["pcId"], b["pcId"], 1, 0, "Poción", 2, {"gp": 4})
    assert res["fromRevision"] == 2 and res["given"] == "2× Poción, 4 po"
    va = call("pc_get", cid, ana["key"], a["pcId"])["document"]["character"]["equipment"]
    kb = call("pc_get", cid, bob["key"], b["pcId"])["document"]["character"]["equipment"]
    assert va["items"][0]["quantity"] == 1 and va["coins"]["gp"] == 6
    assert kb["items"] == [{"name": "poción", "quantity": 3, "notes": ""}] and kb["coins"]["gp"] == 4
    # Dar la última unidad quita la línea; lo recibido llega sin equipar.
    call("pc_transfer", cid, ana["key"], a["pcId"], b["pcId"], 2, 1, "Cuerda", 5, None)
    va = call("pc_get", cid, ana["key"], a["pcId"])["document"]["character"]["equipment"]
    assert [i["name"] for i in va["items"]] == ["Poción"]
    # Sin saldo suficiente no se mueve nada.
    assert call("pc_transfer", cid, ana["key"], a["pcId"], b["pcId"], 3, None, None, 1, {"gp": 99}) == {"error": "invalid"}
    ev = [e["text"] for e in call("events_list", cid, bob["key"], None, None, 50)["events"]]
    assert any("Kael recibe 2× Poción, 4 po de Vex" in t for t in ev)


# ── Registro: anclar y eliminar (20261120) ──────────────────────────────────

def test_event_pin_and_delete():
    cid, dm, ana, bob = table_with_two_players("Mesa anclas")
    e1 = call("event_add", cid, dm, "nota", "Pista pública", None, None, "publico", None)["id"]
    e2 = call("event_add", cid, dm, "nota", "Secreto", None, None, "dm", None)["id"]
    # Sólo el DM.
    assert call("event_pin", cid, ana["key"], e1, "todos", "true") == {"error": "forbidden"}
    assert call("event_delete", cid, ana["key"], e1) == {"error": "forbidden"}
    assert call("event_pin", cid, dm, e1, "todos", "true") == {"id": e1, "pinned": True, "pinnedByMe": False}
    assert call("event_pin", cid, dm, e2, "personal", "true")["pinnedByMe"] is True
    assert call("event_pin", cid, dm, e1, "nada", "true") == {"error": "invalid"}
    # Jugadores: ven el anclado público; nunca el personal del DM ni lo que no podían ver.
    pins = call("events_list", cid, ana["key"], None, None, 50, None, "true")["events"]
    assert [e["id"] for e in pins] == [e1] and pins[0]["pinned"] and pins[0]["pinnedByMe"] is False
    assert sorted(e["id"] for e in call("events_list", cid, dm, None, None, 50, None, "true")["events"]) == sorted([e1, e2])
    # Límite de 15 «para todos».
    for i in range(14):
        eid = call("event_add", cid, dm, "nota", f"n{i}", None, None, "publico", None)["id"]
        assert call("event_pin", cid, dm, eid, "todos", "true")["pinned"] is True
    extra = call("event_add", cid, dm, "nota", "una más", None, None, "publico", None)["id"]
    assert call("event_pin", cid, dm, extra, "todos", "true") == {"error": "payload_too_large"}
    assert call("event_pin", cid, dm, e1, "todos", "false")["pinned"] is False
    assert call("event_pin", cid, dm, extra, "todos", "true")["pinned"] is True
    # Eliminar es definitivo (y se lleva sus anclas).
    assert call("event_delete", cid, dm, e2)["deleted"] is True
    assert call("event_delete", cid, dm, e2) == {"error": "not_found"}
    assert all(e["id"] != e2 for e in call("events_list", cid, dm, None, None, 200, None, None)["events"])
