#!/usr/bin/env python3
"""Añade competencias estructuradas a las clases y corrige sus «Atributos de clase».

Hasta la versión 2.2, 15 de las 18 clases tenían copiado el bloque inicial del
Bárbaro (salvaciones, competencias, equipo y dado de golpe). Este script:

  * escribe `competencias`, `competenciasMulticlase`, `equipoInicial` y
    `oroInicial` en cada clase con datos conocidos;
  * regenera `niveles["1"].atributoInicial` a partir de esos datos, usando el
    `dadoDeGolpe` real de la clase (el que usa el motor de reglas);
  * marca como pendientes las clases de Agarias cuyo autor aún no ha dado los
    datos (Anomalía, Tiznado, Vinculador), sin inventarlos.

Fuente de las clases oficiales: Manual del Jugador (2014) y, para el Artífice,
Tasha's Cauldron of Everything (2020). Es idempotente: puede ejecutarse de nuevo.

Uso:  python3 tools/class_proficiencies.py
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CLASSES = ROOT / "frontend" / "src" / "data" / "classes"

ANY = "cualquiera"
NUM = {1: "una", 2: "dos", 3: "tres", 4: "cuatro"}
ABIL = {
    "fuerza": "Fuerza", "destreza": "Destreza", "constitucion": "Constitución",
    "inteligencia": "Inteligencia", "sabiduria": "Sabiduría", "carisma": "Carisma",
}

SIMPLE = "Armas simples"
MARTIAL = "Armas marciales"
LIGHT, MEDIUM, HEAVY, SHIELDS = "Armadura ligera", "Armadura media", "Armadura pesada", "Escudos"
CASTER_WEAPONS = ["Dagas", "Dardos", "Hondas", "Bastones", "Ballestas ligeras"]
ROGUE_WEAPONS = [SIMPLE, "Ballestas de mano", "Espadas largas", "Estoques", "Espadas cortas"]


def skills(n, options):
    return {"elegir": n, "de": options}


DATA = {
    "barbaro": dict(
        origen="Manual del Jugador",
        saves=["fuerza", "constitucion"], armor=[LIGHT, MEDIUM, SHIELDS], weapons=[SIMPLE, MARTIAL], tools=[],
        skills=skills(2, ["Atletismo", "Intimidación", "Naturaleza", "Percepción", "Supervivencia", "Trato con Animales"]),
        multi=dict(armor=[SHIELDS], weapons=[SIMPLE, MARTIAL], tools=[], skills=None),
        equipment=["(a) un gran hacha o (b) cualquier arma marcial cuerpo a cuerpo.",
                   "(a) dos hachas de mano o (b) cualquier arma simple.",
                   "Un paquete de explorador y cuatro jabalinas."],
        gold="2d4 × 10"),
    "bardo": dict(
        origen="Manual del Jugador",
        saves=["destreza", "carisma"], armor=[LIGHT], weapons=ROGUE_WEAPONS, tools=["Tres instrumentos musicales a tu elección"],
        skills=skills(3, ANY),
        multi=dict(armor=[LIGHT], weapons=[], tools=["Un instrumento musical a tu elección"], skills=skills(1, ANY)),
        equipment=["(a) un estoque, (b) una espada larga o (c) cualquier arma simple.",
                   "(a) un paquete de diplomático o (b) un paquete de artista.",
                   "(a) un laúd o (b) cualquier otro instrumento musical.",
                   "Armadura de cuero y una daga."],
        gold="5d4 × 10"),
    "brujo": dict(
        origen="Manual del Jugador",
        saves=["sabiduria", "carisma"], armor=[LIGHT], weapons=[SIMPLE], tools=[],
        skills=skills(2, ["Conocimiento Arcano", "Engaño", "Historia", "Intimidación", "Investigación", "Naturaleza", "Religión"]),
        multi=dict(armor=[LIGHT], weapons=[SIMPLE], tools=[], skills=None),
        equipment=["(a) una ballesta ligera y 20 virotes o (b) cualquier arma simple.",
                   "(a) una bolsa de componentes o (b) un canalizador arcano.",
                   "(a) un paquete de erudito o (b) un paquete de explorador de mazmorras.",
                   "Armadura de cuero, cualquier arma simple y dos dagas."],
        gold="4d4 × 10"),
    "clerigo": dict(
        origen="Manual del Jugador",
        saves=["sabiduria", "carisma"], armor=[LIGHT, MEDIUM, SHIELDS], weapons=[SIMPLE], tools=[],
        skills=skills(2, ["Historia", "Medicina", "Perspicacia", "Persuasión", "Religión"]),
        multi=dict(armor=[LIGHT, MEDIUM, SHIELDS], weapons=[], tools=[], skills=None),
        equipment=["(a) una maza o (b) un martillo de guerra (si tienes competencia).",
                   "(a) una cota de escamas, (b) una armadura de cuero o (c) una cota de malla (si tienes competencia).",
                   "(a) una ballesta ligera y 20 virotes o (b) cualquier arma simple.",
                   "(a) un paquete de sacerdote o (b) un paquete de explorador.",
                   "Un escudo y un símbolo sagrado."],
        gold="5d4 × 10"),
    "druida": dict(
        origen="Manual del Jugador",
        saves=["inteligencia", "sabiduria"],
        armor=[LIGHT, MEDIUM, SHIELDS], armorNote="Los druidas no llevan armaduras ni escudos de metal.",
        weapons=["Garrotes", "Dagas", "Dardos", "Jabalinas", "Mazas", "Bastones", "Cimitarras", "Hoces", "Hondas", "Lanzas"],
        tools=["Útiles de herborista"],
        skills=skills(2, ["Conocimiento Arcano", "Medicina", "Naturaleza", "Percepción", "Perspicacia", "Religión", "Supervivencia", "Trato con Animales"]),
        multi=dict(armor=[LIGHT, MEDIUM, SHIELDS], weapons=[], tools=[], skills=None),
        equipment=["(a) un escudo de madera o (b) cualquier arma simple.",
                   "(a) una cimitarra o (b) cualquier arma simple cuerpo a cuerpo.",
                   "Armadura de cuero, un paquete de explorador y un canalizador druídico."],
        gold="2d4 × 10"),
    "explorador": dict(
        origen="Manual del Jugador",
        saves=["fuerza", "destreza"], armor=[LIGHT, MEDIUM, SHIELDS], weapons=[SIMPLE, MARTIAL], tools=[],
        skills=skills(3, ["Atletismo", "Investigación", "Naturaleza", "Percepción", "Perspicacia", "Sigilo", "Supervivencia", "Trato con Animales"]),
        multi=dict(armor=[LIGHT, MEDIUM, SHIELDS], weapons=[SIMPLE, MARTIAL], tools=[],
                   skills=skills(1, ["Atletismo", "Investigación", "Naturaleza", "Percepción", "Perspicacia", "Sigilo", "Supervivencia", "Trato con Animales"])),
        equipment=["(a) una cota de escamas o (b) una armadura de cuero.",
                   "(a) dos espadas cortas o (b) dos armas simples cuerpo a cuerpo.",
                   "(a) un paquete de explorador de mazmorras o (b) un paquete de explorador.",
                   "Un arco largo y un carcaj con 20 flechas."],
        gold="5d4 × 10"),
    "guerrero": dict(
        origen="Manual del Jugador",
        saves=["fuerza", "constitucion"], armor=[LIGHT, MEDIUM, HEAVY, SHIELDS], weapons=[SIMPLE, MARTIAL], tools=[],
        skills=skills(2, ["Acrobacias", "Atletismo", "Historia", "Intimidación", "Percepción", "Perspicacia", "Supervivencia", "Trato con Animales"]),
        multi=dict(armor=[LIGHT, MEDIUM, SHIELDS], weapons=[SIMPLE, MARTIAL], tools=[], skills=None),
        equipment=["(a) una cota de malla o (b) una armadura de cuero, un arco largo y 20 flechas.",
                   "(a) un arma marcial y un escudo o (b) dos armas marciales.",
                   "(a) una ballesta ligera y 20 virotes o (b) dos hachas de mano.",
                   "(a) un paquete de explorador de mazmorras o (b) un paquete de explorador."],
        gold="5d4 × 10"),
    "hechicero": dict(
        origen="Manual del Jugador",
        saves=["constitucion", "carisma"], armor=[], weapons=CASTER_WEAPONS, tools=[],
        skills=skills(2, ["Conocimiento Arcano", "Engaño", "Intimidación", "Perspicacia", "Persuasión", "Religión"]),
        multi=dict(armor=[], weapons=[], tools=[], skills=None),
        equipment=["(a) una ballesta ligera y 20 virotes o (b) cualquier arma simple.",
                   "(a) una bolsa de componentes o (b) un canalizador arcano.",
                   "(a) un paquete de explorador de mazmorras o (b) un paquete de explorador.",
                   "Dos dagas."],
        gold="3d4 × 10"),
    "mago": dict(
        origen="Manual del Jugador",
        saves=["inteligencia", "sabiduria"], armor=[], weapons=CASTER_WEAPONS, tools=[],
        skills=skills(2, ["Conocimiento Arcano", "Historia", "Investigación", "Medicina", "Perspicacia", "Religión"]),
        multi=dict(armor=[], weapons=[], tools=[], skills=None),
        equipment=["(a) un bastón o (b) una daga.",
                   "(a) una bolsa de componentes o (b) un canalizador arcano.",
                   "(a) un paquete de erudito o (b) un paquete de explorador.",
                   "Un libro de conjuros."],
        gold="4d4 × 10"),
    "monje": dict(
        origen="Manual del Jugador",
        saves=["fuerza", "destreza"], armor=[], weapons=[SIMPLE, "Espadas cortas"],
        tools=["Un tipo de herramientas de artesano o un instrumento musical, a tu elección"],
        skills=skills(2, ["Acrobacias", "Atletismo", "Historia", "Perspicacia", "Religión", "Sigilo"]),
        multi=dict(armor=[], weapons=[SIMPLE, "Espadas cortas"], tools=[], skills=None),
        equipment=["(a) una espada corta o (b) cualquier arma simple.",
                   "(a) un paquete de explorador de mazmorras o (b) un paquete de explorador.",
                   "10 dardos."],
        gold="5d4"),
    "paladin": dict(
        origen="Manual del Jugador",
        saves=["sabiduria", "carisma"], armor=[LIGHT, MEDIUM, HEAVY, SHIELDS], weapons=[SIMPLE, MARTIAL], tools=[],
        skills=skills(2, ["Atletismo", "Intimidación", "Medicina", "Perspicacia", "Persuasión", "Religión"]),
        multi=dict(armor=[LIGHT, MEDIUM, SHIELDS], weapons=[SIMPLE, MARTIAL], tools=[], skills=None),
        equipment=["(a) un arma marcial y un escudo o (b) dos armas marciales.",
                   "(a) cinco jabalinas o (b) cualquier arma simple cuerpo a cuerpo.",
                   "(a) un paquete de sacerdote o (b) un paquete de explorador.",
                   "Una cota de malla y un símbolo sagrado."],
        gold="5d4 × 10"),
    "picaro": dict(
        origen="Manual del Jugador",
        saves=["destreza", "inteligencia"], armor=[LIGHT], weapons=ROGUE_WEAPONS, tools=["Herramientas de ladrón"],
        skills=skills(4, ["Acrobacias", "Atletismo", "Engaño", "Interpretación", "Intimidación", "Investigación",
                          "Juego de Manos", "Percepción", "Perspicacia", "Persuasión", "Sigilo"]),
        multi=dict(armor=[LIGHT], weapons=[], tools=["Herramientas de ladrón"],
                   skills=skills(1, ["Acrobacias", "Atletismo", "Engaño", "Interpretación", "Intimidación", "Investigación",
                                     "Juego de Manos", "Percepción", "Perspicacia", "Persuasión", "Sigilo"])),
        equipment=["(a) un estoque o (b) una espada corta.",
                   "(a) un arco corto y un carcaj con 20 flechas o (b) una espada corta.",
                   "(a) un paquete de ladrón, (b) un paquete de explorador de mazmorras o (c) un paquete de explorador.",
                   "Armadura de cuero, dos dagas y herramientas de ladrón."],
        gold="4d4 × 10"),
    "artifice": dict(
        origen="Tasha's Cauldron of Everything",
        saves=["constitucion", "inteligencia"], armor=[LIGHT, MEDIUM, SHIELDS], weapons=[SIMPLE],
        tools=["Herramientas de ladrón", "Herramientas de hojalatero", "Un tipo de herramientas de artesano a tu elección"],
        skills=skills(2, ["Conocimiento Arcano", "Historia", "Investigación", "Juego de Manos", "Medicina", "Naturaleza", "Percepción"]),
        multi=dict(armor=[LIGHT, MEDIUM, SHIELDS], weapons=[], tools=["Herramientas de ladrón", "Herramientas de hojalatero"], skills=None),
        equipment=["Dos armas simples cualesquiera.",
                   "Una ballesta ligera y 20 virotes.",
                   "(a) una armadura de cuero tachonado o (b) una cota de escamas.",
                   "Herramientas de ladrón y un paquete de explorador de mazmorras."],
        gold="5d4 × 10"),
    # ── Clases de Agarias con datos propios (transcritos de su texto original) ──
    "cazador": dict(
        origen="Agarias",
        saves=["destreza", "inteligencia"], armor=[LIGHT, MEDIUM, SHIELDS], weapons=[SIMPLE, MARTIAL, "Armas de Cazador"],
        tools=["Herramientas de alquimista"],
        skills=skills(3, ["Acrobacias", "Atletismo", "Historia", "Perspicacia", "Investigación", "Religión", "Supervivencia"]),
        multi=None,
        equipment=["(a) un arma marcial o (b) dos armas simples.",
                   "(a) una ballesta ligera y 20 saetas o (b) una ballesta de mano y 20 saetas.",
                   "(a) armadura de cuero tachonado o (b) cota de escamas.",
                   "Un paquete de explorador y suministros de alquimista."],
        gold="5d4 × 10",
        extra='"Teme a la vieja Sangre"\nQue la sangre de sus cuerpos sea lo último que vean.'),
    "shadow": dict(
        origen="Agarias",
        saves=["carisma"], saveChoice={"elegir": 1, "de": ["destreza", "inteligencia"]},
        armor=[LIGHT], weapons=["Dagas", "Espadas"], tools=[],
        skills=skills(3, ["Atletismo", "Acrobacias", "Intimidación", "Perspicacia", "Sigilo", "Engaño"]),
        multi=None,
        equipment=["(a) peto de cuero o (b) armadura de cuero tachonado (si el DM lo permite).",
                   "(a) dos dagas o (b) una espada.",
                   "(a) un paquete de explorador, (b) un paquete de explorador de mazmorras o (c) un paquete de ladrón.",
                   "Un mapa de la región."],
        gold="4d4 × 10"),
}

# Clases de Agarias cuyo bloque inicial era una copia literal del Bárbaro.
PENDING = ["anomalia", "tiznado", "vinculador"]


def join_list(items):
    if not items:
        return "Ninguna"
    if len(items) == 1:
        return items[0]
    return ", ".join(items[:-1]) + " y " + items[-1]


def skills_text(spec):
    n = NUM.get(spec["elegir"], str(spec["elegir"]))
    if spec["de"] == ANY:
        return f"escoge {n} cualesquiera"
    return f"escoge {n} de entre {join_list(spec['de'])}"


def saves_text(d):
    fixed = [ABIL[a] for a in d["saves"]]
    choice = d.get("saveChoice")
    if choice:
        opts = " o ".join(ABIL[a] for a in choice["de"])
        return f"{opts} (a elegir) y {join_list(fixed)}"
    return join_list(fixed)


def starting_text(d, hit_die):
    armor = join_list(d["armor"]) + (f" ({d['armorNote']})" if d.get("armorNote") else "")
    lines = [
        "Atributos de clase:",
        f"❖ Tiradas de Salvación: {saves_text(d)}.",
        "❖ Puntos de golpe:",
        f"    :: Dado de golpe: 1d{hit_die}.",
        f"    :: Nivel 1: {hit_die} + tu modificador de Constitución.",
        f"    :: Niveles siguientes: 1d{hit_die} (o {hit_die // 2 + 1}) + tu modificador de Constitución por nivel.",
        "❖ Competencias:",
        f"    :: Armadura: {armor}.",
        f"    :: Armas: {join_list(d['weapons'])}.",
        f"    :: Herramientas: {join_list(d['tools'])}.",
        f"    :: Habilidades: {skills_text(d['skills'])}.",
        "❖ Equipo. Comienzas con el siguiente equipo, además del que te dé tu trasfondo:",
        *[f"    :: {e}" for e in d["equipment"]],
        f"    :: Alternativa: {d['gold']} po en lugar del equipo de clase.",
        f"❖ Fuente: {d['origen']}.",
    ]
    text = "\n".join(lines)
    if d.get("extra"):
        text += "\n\n" + d["extra"]
    return text


def pending_text(hit_die):
    return "\n".join([
        "Atributos de clase:",
        "❖ Tiradas de Salvación: pendiente de definir por el autor de la clase.",
        "❖ Puntos de golpe:",
        f"    :: Dado de golpe: 1d{hit_die}.",
        f"    :: Nivel 1: {hit_die} + tu modificador de Constitución.",
        f"    :: Niveles siguientes: 1d{hit_die} (o {hit_die // 2 + 1}) + tu modificador de Constitución por nivel.",
        "❖ Competencias: pendientes de definir por el autor de la clase.",
        "❖ Equipo: pendiente de definir por el autor de la clase.",
        "❖ Nota: los datos anteriores eran una copia del Bárbaro y se retiraron para no mostrar reglas incorrectas.",
    ])


def proficiency_block(d):
    block = {
        "salvaciones": d["saves"],
        "armaduras": d["armor"],
        "armas": d["weapons"],
        "herramientas": d["tools"],
        "habilidades": d["skills"],
    }
    if d.get("saveChoice"):
        block["salvacionesElegir"] = d["saveChoice"]
    if d.get("armorNote"):
        block["notaArmadura"] = d["armorNote"]
    return block


def main():
    for key, d in DATA.items():
        path = CLASSES / f"{key}.json"
        cls = json.loads(path.read_text(encoding="utf-8"))
        cls["competencias"] = proficiency_block(d)
        if d["multi"] is not None:
            m = d["multi"]
            cls["competenciasMulticlase"] = {
                "armaduras": m["armor"], "armas": m["weapons"], "herramientas": m["tools"], "habilidades": m["skills"],
            }
        else:
            cls["competenciasMulticlase"] = {"pendiente": True}
        cls["equipoInicial"] = d["equipment"]
        cls["oroInicial"] = d["gold"]
        cls["fuenteReglas"] = d["origen"]
        cls["niveles"]["1"]["atributoInicial"] = starting_text(d, int(cls["dadoDeGolpe"]))
        path.write_text(json.dumps(cls, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"ok  {key}")
    for key in PENDING:
        path = CLASSES / f"{key}.json"
        cls = json.loads(path.read_text(encoding="utf-8"))
        cls["competencias"] = {"pendiente": True}
        cls["competenciasMulticlase"] = {"pendiente": True}
        cls.pop("equipoInicial", None)
        cls.pop("oroInicial", None)
        cls["fuenteReglas"] = "Agarias"
        cls["niveles"]["1"]["atributoInicial"] = pending_text(int(cls["dadoDeGolpe"]))
        path.write_text(json.dumps(cls, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"pendiente  {key}")


if __name__ == "__main__":
    main()
