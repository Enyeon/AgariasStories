#!/usr/bin/env python3
"""Corrige las subclases de relleno copiadas entre clases.

Hasta la v2.2, 12 clases tenían como subclases «Hebra Paradoja / Error / Virus /
.exe» (las de la Anomalía) o entradas vacías, siempre al nivel 3. Este script:

  * pone en cada clase oficial sus subclases del Manual del Jugador (2014) o de
    Tasha (Artífice), en el nivel correcto, con una descripción breve propia y
    `rasgosPendientes: true` (los rasgos de cada nivel aún no están cargados);
  * conserva las subclases con contenido real (p. ej. el Borracho Errante del
    Monje);
  * marca Tiznado y Vinculador como «subclase pendiente» (sus «Hebras» eran una
    copia de la Anomalía) y quita sus opciones falsas;
  * guarda en `subclasesRetiradas` las claves antiguas para que la migración
    avise a los personajes que las tenían elegidas.

Es idempotente. Uso:  python3 tools/class_subclasses.py
"""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CLASSES = ROOT / "frontend" / "src" / "data" / "classes"

PHB = "Manual del Jugador"
OFFICIAL = {
    "bardo": ("Colegio de bardo", 3, PHB, [
        ("conocimiento", "Colegio del Conocimiento", "Bardos que reúnen saber de todas partes: más habilidades y secretos mágicos de otras clases."),
        ("valor", "Colegio del Valor", "Escaldos que inspiran en combate: armaduras medias, escudos, armas marciales y ataque adicional."),
    ]),
    "brujo": ("Patrón sobrenatural", 1, PHB, [
        ("archihada", "El Archihada", "Un señor o señora feérico: hechizos de encantamiento e ilusión y presencia feérica."),
        ("infernal", "El Infernal", "Un pacto con un demonio de los planos inferiores: puntos de golpe temporales y fuego."),
        ("primigenio", "El Primigenio", "Una entidad incomprensible del más allá: telepatía y magia que quiebra la mente."),
    ]),
    "clerigo": ("Dominio divino", 1, PHB, [
        ("conocimiento", "Dominio del Conocimiento", "Dioses del saber: idiomas, habilidades expertas y lectura de pensamientos."),
        ("engano", "Dominio del Engaño", "Dioses de la astucia: duplicados ilusorios, invisibilidad y bendición del embaucador."),
        ("guerra", "Dominio de la Guerra", "Dioses de la batalla: armaduras pesadas, armas marciales y ataques adicionales."),
        ("luz", "Dominio de la Luz", "Dioses del sol y la verdad: fuego, luz radiante y protección contra ataques."),
        ("naturaleza", "Dominio de la Naturaleza", "Dioses de la naturaleza: armaduras pesadas, conjuros druídicos y control de bestias y plantas."),
        ("tempestad", "Dominio de la Tempestad", "Dioses del trueno y el mar: relámpago, trueno y represalia contra quien te golpea."),
        ("vida", "Dominio de la Vida", "Dioses de la vida y la curación: curaciones más potentes y armadura pesada."),
    ]),
    "druida": ("Círculo druídico", 2, PHB, [
        ("tierra", "Círculo de la Tierra", "Sabios ligados a un terreno: conjuros adicionales y recuperación de magia."),
        ("luna", "Círculo de la Luna", "Guardianes salvajes: formas salvajes de combate más poderosas."),
    ]),
    "explorador": ("Arquetipo de explorador", 3, PHB, [
        ("cazador", "Cazador", "Especialista en abatir amenazas: técnicas contra hordas, gigantes y enemigos escurridizos."),
        ("senor-bestias", "Señor de las Bestias", "Explorador unido a un compañero animal que lucha a su lado."),
    ]),
    "guerrero": ("Arquetipo marcial", 3, PHB, [
        ("campeon", "Campeón", "Excelencia física: críticos más frecuentes y gran resistencia."),
        ("maestro-batalla", "Maestro de Batalla", "Táctico: maniobras alimentadas por dados de superioridad."),
        ("caballero-arcano", "Caballero Arcano", "Combina el acero con conjuros de abjuración y evocación."),
    ]),
    "hechicero": ("Origen hechicero", 1, PHB, [
        ("draconico", "Linaje Dracónico", "Sangre de dragón: más resistencia, escamas y afinidad con un tipo de daño."),
        ("magia-salvaje", "Magia Salvaje", "Magia caótica: oleadas de magia salvaje impredecibles."),
    ]),
    "mago": ("Tradición arcana", 2, PHB, [
        ("abjuracion", "Escuela de Abjuración", "Magia protectora: un escudo arcano que absorbe daño."),
        ("adivinacion", "Escuela de Adivinación", "Ver el futuro: tiradas de portento que sustituyen dados."),
        ("conjuracion", "Escuela de Conjuración", "Crear y teletransportar: objetos menores y transposición."),
        ("encantamiento", "Escuela de Encantamiento", "Influir en mentes: mirada hipnótica y encantamientos dobles."),
        ("evocacion", "Escuela de Evocación", "Energía destructiva: proteger aliados del área de tus conjuros y potenciarlos."),
        ("ilusion", "Escuela de Ilusión", "Engañar los sentidos: ilusiones mejoradas y que se vuelven reales."),
        ("nigromancia", "Escuela de Nigromancia", "La vida y la muerte: cosecha de vida y no muertos más fuertes."),
        ("transmutacion", "Escuela de Transmutación", "Transformar la materia: alquimia menor y piedra del transmutador."),
    ]),
    "monje": ("Tradición monástica", 3, PHB, [
        ("mano-abierta", "Camino de la Mano Abierta", "Maestros del combate sin armas: derribar, empujar y negar reacciones con Ráfaga de golpes."),
        ("sombra", "Camino de la Sombra", "Ninjas y espías: conjuros de sombra y teletransporte entre sombras."),
        ("cuatro-elementos", "Camino de los Cuatro Elementos", "Canalizan los elementos con su ki."),
    ]),
    "paladin": ("Juramento sagrado", 3, PHB, [
        ("devocion", "Juramento de Devoción", "El ideal del caballero: honestidad, coraje y compasión."),
        ("antiguos", "Juramento de los Antiguos", "Proteger la luz y la vida: aura contra conjuros y naturaleza."),
        ("venganza", "Juramento de Venganza", "Castigar a los malvados: persecución implacable de un enemigo."),
    ]),
    "picaro": ("Arquetipo de pícaro", 3, PHB, [
        ("ladron", "Ladrón", "Manos rápidas, escalada y uso de objetos mágicos."),
        ("asesino", "Asesino", "Golpes letales contra enemigos sorprendidos e identidades falsas."),
        ("embaucador-arcano", "Embaucador Arcano", "Conjuros de encantamiento e ilusión y una mano de mago mejorada."),
    ]),
    "artifice": ("Especialidad de artífice", 3, "Tasha's Cauldron of Everything", [
        ("alquimista", "Alquimista", "Elixires experimentales y curación potenciada."),
        ("armero", "Armero", "Una armadura arcana que sirve de arma y protección."),
        ("artillero", "Artillero", "Un cañón arcano y conjuros destructivos."),
        ("herrero-batalla", "Herrero de Batalla", "Un defensor de acero que combate a tu lado."),
    ]),
}
PENDING = {"tiznado": "Subclase", "vinculador": "Subclase"}
PLACEHOLDER = re.compile(r"^(Hebra .+)?$")


def empty_desc(s):
    return not (s.get("subDescripcion", "").replace("✦", "").strip())


def is_placeholder(s):
    return PLACEHOLDER.match(s.get("subNombre", "").strip()) and empty_desc(s)


def find_sub(cls):
    for lvl, data in cls["niveles"].items():
        if "subClase" in data:
            return lvl, data["subClase"]
    return None, None


def main():
    for key, (label, level, source, subs) in OFFICIAL.items():
        path = CLASSES / f"{key}.json"
        cls = json.loads(path.read_text(encoding="utf-8"))
        old_lvl, old = find_sub(cls)
        kept, retired = {}, list(cls.get("subclasesRetiradas", []))
        for k, s in (old or {}).items():
            if is_placeholder(s):
                if k not in retired and not any(k == sk for sk, *_ in subs):
                    retired.append(k)
            else:
                kept[k] = s
        if old_lvl is not None:
            del cls["niveles"][old_lvl]["subClase"]
        new = {}
        for sk, name, desc in subs:
            prev = (old or {}).get(sk)
            new[sk] = prev if prev and not is_placeholder(prev) else {
                "subNombre": name, "subDescripcion": desc, "subNivel": {}, "rasgosPendientes": True, "fuente": source,
            }
        new.update(kept)
        cls["niveles"].setdefault(str(level), {})["subClase"] = new
        cls["subclaseNombre"] = label
        if retired:
            cls["subclasesRetiradas"] = retired
        path.write_text(json.dumps(cls, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"ok  {key}: {label} (nivel {level}), {len(new)} opciones, retiradas {retired}")

    for key, label in PENDING.items():
        path = CLASSES / f"{key}.json"
        cls = json.loads(path.read_text(encoding="utf-8"))
        old_lvl, old = find_sub(cls)
        retired = list(cls.get("subclasesRetiradas", []))
        if old_lvl is not None:
            for k, s in old.items():
                if is_placeholder(s) and k not in retired:
                    retired.append(k)
            remaining = {k: s for k, s in old.items() if not is_placeholder(s)}
            if remaining:
                cls["niveles"][old_lvl]["subClase"] = remaining
            else:
                del cls["niveles"][old_lvl]["subClase"]
        cls["subclasePendiente"] = True
        if retired:
            cls["subclasesRetiradas"] = retired
        path.write_text(json.dumps(cls, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"pendiente  {key}: retiradas {retired}")

    # El Bárbaro también recibe su etiqueta oficial.
    path = CLASSES / "barbaro.json"
    cls = json.loads(path.read_text(encoding="utf-8"))
    cls.setdefault("subclaseNombre", "Senda primaria")
    path.write_text(json.dumps(cls, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
