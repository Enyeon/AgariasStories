#!/usr/bin/env python3
"""Regenera frontend/src/data/rules-reference.json con un formato estructurado.

Cada entrada distingue:
  * kind:   accion | condicion | danio | estado
  * origin: oficial (D&D 5e, Manual del Jugador 2014) | agarias (propio de la campaña)
  * effect / applies / ends: qué hace, cómo se aplica, cómo termina.

Regla de la casa (petición del DM): no se inventan aplicaciones ni finales para
los conceptos de Agarias. Si no están definidos se guarda `null` y la app
muestra «Pendiente de definir por el DM». El texto original de cada concepto de
Agarias se conserva en `original`.

Las acciones de combate se copian del archivo actual con dos correcciones.
Uso:  python3 tools/rules_reference.py
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TARGET = ROOT / "frontend" / "src" / "data" / "rules-reference.json"
BACKUP = ROOT / "docs" / "historial" / "rules-reference-v2.json"

BY_EFFECT = "Cuando lo indique el rasgo, conjuro, criatura u objeto que lo provoca."
END_EFFECT = "Cuando termina el efecto que la causó, o como indique ese efecto (por ejemplo, superando una tirada de salvación)."


def cond(id_, name, en, summary, effect, applies=BY_EFFECT, ends=END_EFFECT, related=None):
    return {"id": id_, "kind": "condicion", "origin": "oficial", "name": name, "en": en, "summary": summary,
            "effect": effect, "applies": applies, "ends": ends, "related": related or []}


CONDITIONS = [
    cond("cond-agarrado", "Agarrado", "Grappled", "Alguien o algo te sujeta y no te deja desplazarte.",
         ["Tu velocidad es 0 y no puede aumentar por ninguna bonificación."],
         applies="Con un ataque de agarre: el atacante usa uno de sus ataques para hacer una prueba de Fuerza (Atletismo) contra tu Fuerza (Atletismo) o Destreza (Acrobacias). También por rasgos de criaturas y algunos conjuros.",
         ends="Si usas tu acción y ganas una prueba de Fuerza (Atletismo) o Destreza (Acrobacias) contra el Atletismo del que te agarra; si quien te agarra queda Incapacitado; o si un efecto te saca de su alcance."),
    cond("cond-asustado", "Asustado", "Frightened", "El miedo a una fuente concreta te domina.",
         ["Tienes desventaja en las pruebas de característica y en las tiradas de ataque mientras la fuente de tu miedo esté en tu línea de visión.",
          "No puedes acercarte voluntariamente a la fuente de tu miedo."]),
    cond("cond-aturdido", "Aturdido", "Stunned", "Estás aturdido y apenas puedes reaccionar.",
         ["Estás Incapacitado, no puedes moverte y sólo puedes hablar con titubeos.",
          "Fallas automáticamente las tiradas de salvación de Fuerza y Destreza.",
          "Las tiradas de ataque contra ti tienen ventaja."], related=["Incapacitado"]),
    cond("cond-cegado", "Cegado", "Blinded", "No puedes ver.",
         ["Fallas automáticamente cualquier prueba de característica que requiera la vista.",
          "Las tiradas de ataque contra ti tienen ventaja y las tuyas tienen desventaja."]),
    cond("cond-derribado", "Derribado", "Prone", "Estás tumbado en el suelo.",
         ["Sólo puedes desplazarte arrastrándote (cada pie cuesta un pie extra), salvo que te levantes.",
          "Tienes desventaja en tus tiradas de ataque.",
          "Los ataques contra ti tienen ventaja si el atacante está a 5 pies o menos; si está más lejos, tienen desventaja."],
         applies="Puedes tirarte al suelo voluntariamente. También al caer Inconsciente, con un empujón (acción de Empujar) o por efectos que lo indiquen.",
         ends="Levantándote: te cuesta la mitad de tu velocidad. No puedes si tu velocidad es 0."),
    cond("cond-ensordecido", "Ensordecido", "Deafened", "No puedes oír.",
         ["Fallas automáticamente cualquier prueba de característica que requiera el oído."]),
    cond("cond-envenenado", "Envenenado", "Poisoned", "Un veneno o una toxina te debilita.",
         ["Tienes desventaja en las tiradas de ataque y en las pruebas de característica."]),
    cond("cond-hechizado", "Hechizado", "Charmed", "Una influencia mágica o sobrenatural te hace ver a alguien como un amigo.",
         ["No puedes atacar a quien te hechizó ni elegirlo como objetivo de capacidades o efectos mágicos dañinos.",
          "Quien te hechizó tiene ventaja en las pruebas de característica para relacionarse socialmente contigo."]),
    cond("cond-incapacitado", "Incapacitado", "Incapacitated", "No puedes actuar.",
         ["No puedes realizar acciones ni reacciones."],
         related=["Aturdido", "Inconsciente", "Paralizado", "Petrificado"]),
    cond("cond-inconsciente", "Inconsciente", "Unconscious", "Estás sin sentido.",
         ["Estás Incapacitado, no puedes moverte ni hablar y no eres consciente de lo que te rodea.",
          "Sueltas lo que sostengas y caes Derribado.",
          "Fallas automáticamente las tiradas de salvación de Fuerza y Destreza.",
          "Las tiradas de ataque contra ti tienen ventaja.",
          "Cualquier ataque que te impacte es un crítico si el atacante está a 5 pies o menos."],
         applies="Al quedar a 0 puntos de golpe sin morir, por el sueño mágico y por otros efectos que lo indiquen.",
         ends="Al recuperar al menos 1 punto de golpe, al estabilizarte y despertar (1d4 horas después), o cuando termine el efecto que te dejó inconsciente.",
         related=["Incapacitado", "Derribado"]),
    cond("cond-invisible", "Invisible", "Invisible", "No se te puede ver sin magia o un sentido especial.",
         ["A efectos de esconderte, se considera que estás en una zona muy oscura. Aún pueden localizarte por el ruido que haces o las huellas que dejas.",
          "Las tiradas de ataque contra ti tienen desventaja y las tuyas tienen ventaja."]),
    cond("cond-paralizado", "Paralizado", "Paralyzed", "Tu cuerpo no responde.",
         ["Estás Incapacitado y no puedes moverte ni hablar.",
          "Fallas automáticamente las tiradas de salvación de Fuerza y Destreza.",
          "Las tiradas de ataque contra ti tienen ventaja.",
          "Cualquier ataque que te impacte es un crítico si el atacante está a 5 pies o menos."], related=["Incapacitado"]),
    cond("cond-petrificado", "Petrificado", "Petrified", "Te has convertido, junto con los objetos no mágicos que llevas, en una sustancia sólida inanimada (normalmente piedra).",
         ["Tu peso se multiplica por diez y dejas de envejecer.",
          "Estás Incapacitado, no puedes moverte ni hablar y no eres consciente de lo que te rodea.",
          "Las tiradas de ataque contra ti tienen ventaja.",
          "Fallas automáticamente las tiradas de salvación de Fuerza y Destreza.",
          "Tienes resistencia a todo el daño.",
          "Eres inmune al veneno y a la enfermedad; un veneno o enfermedad que ya tuvieras queda en suspenso, no se cura."],
         related=["Incapacitado"]),
    cond("cond-restringido", "Restringido", "Restrained", "Algo te inmoviliza: una red, raíces, una telaraña…",
         ["Tu velocidad es 0 y no puede aumentar por ninguna bonificación.",
          "Las tiradas de ataque contra ti tienen ventaja y las tuyas tienen desventaja.",
          "Tienes desventaja en las tiradas de salvación de Destreza."],
         applies="Cuando lo indique el efecto: una red, el conjuro Enmarañar, la telaraña de una araña gigante, la constricción de una serpiente…",
         ends="Como indique el efecto. Lo habitual es una prueba de Fuerza contra una CD; en el caso de una red, también cortándola (5 de daño cortante contra CA 10)."),
    {
        "id": "cond-agotamiento", "kind": "condicion", "origin": "oficial", "name": "Agotamiento", "en": "Exhaustion",
        "summary": "Cansancio extremo que se mide en seis niveles acumulativos.",
        "effect": ["Nivel 1: desventaja en las pruebas de característica.", "Nivel 2: velocidad reducida a la mitad.",
                   "Nivel 3: desventaja en las tiradas de ataque y de salvación.", "Nivel 4: máximo de puntos de golpe reducido a la mitad.",
                   "Nivel 5: velocidad 0.", "Nivel 6: muerte.",
                   "Los efectos se acumulan: en el nivel 3 sufres también los de los niveles 1 y 2."],
        "applies": "Cuando lo indique un efecto (marcha forzada, hambre, sed, frío extremo, ciertos conjuros o criaturas). Cada aplicación suma uno o más niveles.",
        "ends": "Un descanso largo reduce un nivel si has comido y bebido. Algunos conjuros (como Restablecimiento mayor) también reducen el nivel.",
        "related": [],
    },
]

AGARIAS_CONDITIONS = [
    {"id": "cond-contusionado", "kind": "condicion", "origin": "agarias", "name": "Contusionado", "en": "Injured",
     "summary": "Etiqueta narrativa: el personaje está magullado o herido.",
     "effect": ["Sin efecto mecánico propio. Sirve para describir la escena."],
     "applies": None, "ends": None, "related": [],
     "original": "Estado narrativo, no mecánico. No es parte de las reglas base."},
    {"id": "cond-provocado", "kind": "condicion", "origin": "agarias", "name": "Provocado", "en": "Provoked",
     "summary": "Una criatura concentra su atención en quien la provoca.",
     "effect": ["Tiene desventaja en ataques, conjuros u otras acciones ofensivas que no tengan como objetivo a quien la provocó."],
     "applies": None, "ends": None, "related": [],
     "note": "Se parece al efecto de algunos rasgos oficiales (por ejemplo, el Desafío del campeón del Juramento de la Corona o la Marca inquebrantable del Caballero), pero no es una condición oficial de 5e.",
     "original": "Una criatura bajo este efecto tiene desventaja en ataques, conjuros u otras acciones ofensivas que no tengan como objetivo al provocador."},
]


def dmg(key, name, en, summary, original=None, origin="oficial", note=None):
    item = {"id": f"danio-{key}", "kind": "danio", "origin": origin, "name": name, "en": en, "summary": summary,
            "effect": ["No tiene efecto propio: importa para las resistencias, inmunidades y vulnerabilidades de cada criatura."],
            "applies": "Lo indica cada ataque, conjuro o rasgo que hace daño.", "ends": None, "related": []}
    if original:
        item["flavor"] = original
    if note:
        item["note"] = note
    return item


DAMAGE = [
    dmg("acido", "Ácido", "Acid", "Sustancias corrosivas, como el aliento de un dragón negro.",
        "Una sustancia corrosiva que quema piel, armaduras y objetos. Puede disolver materiales rápidamente."),
    dmg("contundente", "Contundente", "Bludgeoning", "Golpes con fuerza bruta: mazas, caídas, puñetazos, constricción."),
    dmg("cortante", "Cortante", "Slashing", "Espadas, hachas y garras."),
    dmg("frio", "Frío", "Cold", "Frío glacial, como el de un Rayo de escarcha.",
        "Congelación súbita que ralentiza el cuerpo, entumece los sentidos y puede inmovilizar extremidades.",
        note="En la versión anterior aparecía como «Hielo». Su descripción menciona ralentizar e inmovilizar: eso sólo ocurre si el ataque o conjuro concreto lo dice."),
    dmg("fuego", "Fuego", "Fire", "Llamas y calor, como el de una Bola de fuego.",
        "Llamas que infligen daño continuo, chamuscan tejidos y pueden propagar el caos si no se controlan."),
    dmg("fuerza", "Fuerza", "Force", "Energía mágica pura, como la de un Proyectil mágico. No es el atributo Fuerza.",
        "Representa la energía mágica pura, invisible y sin forma elemental. Es uno de los tipos de daño más difíciles de resistir.",
        note="En la versión anterior aparecía como «Fuerza (Strength)», una mala traducción: en inglés es Force."),
    dmg("necrotico", "Necrótico", "Necrotic", "Energía que marchita la materia viva y consume la fuerza vital, como el Toque escalofriante.",
        "Energía de la muerte que consume la fuerza vital, marchita la carne y deja cicatrices antinaturales."),
    dmg("perforante", "Perforante", "Piercing", "Lanzas, flechas y mordiscos."),
    dmg("psiquico", "Psíquico", "Psychic", "Ataques mentales, como los de un desollador mental.",
        "Ataques mentales que alteran los pensamientos, causan confusión, alucinaciones o un miedo paralizante."),
    dmg("radiante", "Radiante", "Radiant", "Luz abrasadora o poder divino, como el de Llama sagrada o el de un ángel.",
        "Una luz pura y poderosa que quema el mal, ciega a los impuros y sana a los dignos.",
        note="El daño radiante no cura por sí mismo; algunos rasgos o conjuros concretos sí lo hacen."),
    dmg("relampago", "Relámpago", "Lightning", "Electricidad, como la de un Relámpago o el aliento de un dragón azul.",
        "Una descarga rápida y violenta que atraviesa armaduras y músculos, causando espasmos o parálisis breve.",
        note="La parálisis sólo ocurre si el efecto concreto lo indica; el tipo de daño no paraliza por sí solo."),
    dmg("trueno", "Trueno", "Thunder", "Ondas de sonido violentas, como las de Onda atronadora."),
    dmg("veneno", "Veneno", "Poison", "Toxinas, picaduras y gases venenosos."),
    dmg("profano", "Profano", "Unholy", "Poder de entidades malignas o de juramentos rotos. En Agarias es el opuesto del daño Sagrado.",
        "Energía corrupta usada por seres oscuros, que hiere el alma y se opone a la luz y lo sagrado.", origin="agarias",
        note="No existe como tipo de daño en D&D 5e. En las reglas oficiales, los efectos de este estilo suelen hacer daño Necrótico. En Agarias es un tipo propio: resistir el daño Necrótico no protege del Profano salvo que la criatura lo diga."),
    dmg("sagrado", "Sagrado", "Holy", "Poder divino benigno canalizado por dioses o por la fe.",
        "Energía celestial canalizada por dioses o fe, que impone orden, justicia y reprime la oscuridad.", origin="agarias",
        note="No existe como tipo de daño en D&D 5e; lo más cercano es Radiante. En Agarias es un tipo propio: resistir el daño Radiante no protege del Sagrado salvo que la criatura lo diga."),
]


def estado(key, name, en, summary, original, effect=None, note=None):
    return {"id": f"estado-{key}", "kind": "estado", "origin": "agarias", "name": name, "en": en, "summary": summary,
            "effect": effect, "applies": None, "ends": None, "related": [], "original": original, **({"note": note} if note else {})}


STATES = [
    estado("corrupto", "Corrupto", "Corrupted",
           "Una criatura u objeto alterado por una influencia ajena y persistente (entes prohibidos, el Vacío). Es un estado que dura, no un tipo de daño.",
           "Una energía impura que deforma cuerpo y mente, vinculada a entes prohibidos o fuerzas del Vacío."),
    estado("desgarro", "Desgarro", "Torn",
           "Herida brutal que causa hemorragia, propia de garras, colmillos y armas dentadas.",
           "Daño físico brutal que causa hemorragia y puede reducir -1 a -3 CA al impactar críticamente armaduras naturales o físicas. Efecto exclusivo de ataques con garras, colmillos o armas dentadas como espadas serradas.",
           effect=["Según el texto original: un impacto crítico puede reducir la CA de una armadura natural o física entre 1 y 3. Falta definir si es -1d3 o lo decide el DM, y cuánto dura."],
           note="Falta definir: cuánto daño hace la hemorragia, cuándo se tira y cómo se detiene (por ejemplo, con Medicina o curación)."),
    estado("dolor", "Dolor", "Pain",
           "Un estado físico extremo que debilita los reflejos y nubla la concentración.",
           "Un estado físico extremo que debilita los reflejos y nubla la concentración, causado por daño severo o magia torturante.",
           note="Falta definir el efecto mecánico (por ejemplo, desventaja en las salvaciones de Concentración) y cómo se aplica y termina."),
    estado("vacio", "Vacío", "Void",
           "Energía sofocante que drena el aliento y la fuerza vital.",
           "Una energía sofocante que drena el aliento y la fuerza vital. Las criaturas afectadas por este daño sufren asfixia parcial y, además, los ataques con este efecto, tras fallar el ataque, aún pueden ser atraídas 5 pies hacia la fuente del efecto.",
           effect=["Según el texto original: incluso si el ataque falla, el objetivo puede ser atraído 5 pies hacia la fuente."],
           note="Falta definir: si es un tipo de daño o un estado, qué es «asfixia parcial» en reglas y si hay salvación para evitar la atracción."),
]

INTROS = {
    "condicion": "Las 15 condiciones oficiales de D&D 5e (Manual del Jugador, 2014) y las propias de Agarias, marcadas aparte. Una condición dura hasta que termina el efecto que la causó, salvo que se indique otra cosa.",
    "danio": "Los 13 tipos de daño oficiales y los 2 tipos propios de Agarias. Un tipo de daño no tiene efecto por sí mismo: importa para las resistencias, inmunidades y vulnerabilidades.",
    "estado": "Mecánicas propias de la campaña. Lo que el DM aún no ha definido aparece como «Pendiente»: la app no inventa cómo se aplican ni cómo terminan.",
}


def main():
    old = json.loads(TARGET.read_text(encoding="utf-8"))
    if not BACKUP.exists():
        BACKUP.parent.mkdir(parents=True, exist_ok=True)
        BACKUP.write_text(json.dumps(old, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    actions = [g for g in old if g.get("kind", "accion") == "accion" and g["title"] not in ("Condiciones", "Estados")]
    for g in actions:
        g["kind"] = "accion"
        for it in g["items"]:
            it.setdefault("kind", "accion")
            it.setdefault("origin", "oficial")
            if it["id"] == "accion-withdrawal":
                it["name"] = "Destrabarse (Disengage)"
                it["text"] = "Tu movimiento no provoca ataques de oportunidad durante el resto del turno."
            if it["id"] == "accion-ready" and g["title"].startswith("Acciones en tu"):
                it["text"] = ("Eliges un desencadenante («si el orco cruza la puerta…») y una acción. Cuando ocurre el desencadenante, "
                              "puedes usar tu reacción para realizarla. Si es un conjuro, debes mantener la concentración hasta entonces.")
        # La acción Preparar aparece en dos grupos; en Reacciones se aclara que gasta la reacción.
        if g["title"].startswith("Reacciones"):
            for it in g["items"]:
                if it["id"] == "accion-ready":
                    it["id"] = "reaccion-ready"
                    it["text"] = "Cuando se cumple el desencadenante de una acción Preparada, la realizas usando tu reacción."
                if it["id"] == "accion-oportunidad":
                    it["text"] = ("¿Cuándo se usa?: Una criatura hostil que puedes ver sale de tu alcance sin usar la acción de Destrabarse.\n\n"
                                  "Ejemplo: Atacas cuerpo a cuerpo al enemigo que huye.")
    out = actions + [
        {"id": "condiciones", "kind": "condicion", "title": "Condiciones", "intro": INTROS["condicion"], "items": CONDITIONS + AGARIAS_CONDITIONS},
        {"id": "danio", "kind": "danio", "title": "Tipos de daño", "intro": INTROS["danio"], "items": DAMAGE},
        {"id": "estados", "kind": "estado", "title": "Estados de Agarias", "intro": INTROS["estado"], "items": STATES},
    ]
    TARGET.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"ok: {sum(len(g['items']) for g in out)} entradas en {len(out)} grupos")


if __name__ == "__main__":
    main()
