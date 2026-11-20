#!/usr/bin/env python3
"""Raza «Experimento 043» y clase Adaptado (AgSt 1.36–1.37). Generador idempotente.

Escribe en frontend/src/data:
  * races.json, race-catalog.json, race-lore.json  la raza (una entrada por
    Sujeto de origen) y su historia pública;
  * class-creatures.json                           los Sujetos (grupo
    «sujetos», uno por raza) y el repertorio del Adaptado (grupo «ink»);
  * spells.json                                    los hechizos del Adaptado;
  * classes/adaptado.json                          la clase.

Decisiones del autor (19 y 20-nov-2026; detalle en el doc del proyecto
«claude/ink-diagnostico.md»):
  * La raza es el «Experimento 043» de los Sram (forma de slime, sin rostro).
    Los Sram preparan el salto de ser esqueletos a tener un cuerpo moldeable.
    Hicieron 43 experimentos; del 043 hay decenas. Un Sram llamado «Sram» se
    sacrificó y eso hizo avanzar el proyecto. El 043-0 fue el primero y escapó
    a los dos años. Cada uno es valioso: llevan dentro un «combustible» de
    estadísticas. Los Sram les repiten que están enfermos para que no se vayan.
  * Cada jugador elige su Sujeto de origen (la primera criatura con la que se
    experimentó) de una tabla cerrada: decide su tamaño (hasta Grande) y es su
    primera invocación, que no ocupa capacidad. El Conejo es el de Vacío.
  * «Ink» no es el nombre de la raza: es la Cura de Tinta. Las Curas
    elementales (no son curas del todo) llegan por la historia, normalmente a
    nivel 5, y sustituyen a las Sendas: dan rostro, el Don del elemento y la
    Simbiosis. Sin la Cura no se usan los rasgos de nivel 6 o más.
  * Poliforme a voluntad, si recuerdas a la criatura: dibujarla pide d20 +
    Historia o Juego de Manos.
  * Caramelos: sin límite de tiempo; cualquier curación se lo lleva todo.
  * Los hechizos se eligen en la pestaña Conjuros (lanzamiento por puntos de
    Esencia), no en la subida de nivel.

Uso: python3 tools/ink_adaptado.py
"""
from __future__ import annotations

import json
from pathlib import Path

from casillas import con_casillas  # AgSt 1.38: toda distancia en pies lleva sus casillas

DATA = Path(__file__).resolve().parent.parent / "frontend" / "src" / "data"
GROUP = "Razas de Agarias Pt. V: Aliens"
BASE = "Experimento 043"
OLD_KEYS = ["INK"]  # Clave anterior (AgSt 1.36); validation.js la traduce.
LINAJE = "experimento-043"
CLASS = "adaptado"


def load(p: Path):
    return json.loads(p.read_text(encoding="utf-8"))


def save(p: Path, d, indent=2):
    p.write_text(con_casillas(json.dumps(d, ensure_ascii=False, indent=indent)) + "\n", encoding="utf-8")


T = lambda name, text: {"name": name, "text": text}

# ══ Sujetos de origen (grupo «sujetos» de class-creatures.json) ════════════
# Cada uno: tamaño, qué hace (sencillo, sin repetir el repertorio ni otros
# Sujetos) y por qué lo eligieron los Sram. Todos actúan sobre «el aliado más
# cercano» al Sujeto, como el Conejo de Vacío.

SUJETOS = {
    "conejo": {
        "name": "Conejo", "size": "Pequeño", "por": "El primero de todos: el del 043-0. Los Sram buscaban su regeneración rápida y su instinto de cuidar de la camada.",
        "que": "Cura y ayuda al aliado más cercano.",
        "speed": "40 pies, salto 15 pies", "abilities": [6, 16, 10, 4, 14, 8], "senses": "Visión en la oscuridad 60 pies",
        "actions": [T("Curita", "El aliado más cercano a 30 pies recupera 1d4 + tu modificador de Sabiduría PG. Usos: tu bonificador de competencia por descanso largo."),
                    T("Ayudar", "Da ventaja al aliado más cercano en su siguiente prueba o tirada de ataque.")],
        "mejoras": [(5, "Curita cura 2d4 + Sabiduría."), (11, "Curita llega a 60 pies."), (17, "Puede usar Ayudar como reacción una vez por ronda.")],
    },
    "gato": {
        "name": "Gato", "size": "Pequeño", "por": "Los Sram estudiaban cómo cae siempre de pie y se levanta de lo que mataría a otros.",
        "que": "Mantiene en pie al aliado más cercano.",
        "speed": "40 pies, trepar 30 pies", "abilities": [6, 16, 10, 4, 14, 10], "senses": "Visión en la oscuridad 60 pies",
        "reactions": [T("Siete vidas", "Cuando el aliado más cercano a 30 pies cae a 0 PG sin morir en el acto, queda a 1 PG. Una vez por descanso largo.")],
        "actions": [T("Caer de pie", "El aliado más cercano no sufre daño por caída en su siguiente caída antes del inicio del siguiente turno del Gato.")],
        "mejoras": [(5, "Siete vidas: dos veces por descanso largo."), (11, "Caer de pie alcanza a todos los aliados a 10 pies."), (17, "Siete vidas deja al aliado con PG igual a tu nivel.")],
    },
    "perro": {
        "name": "Perro", "size": "Mediano", "por": "Lealtad: los Sram querían una biomasa que no abandonara nunca a quien protege.",
        "que": "Levanta y acompaña al aliado más cercano.",
        "speed": "40 pies", "abilities": [12, 14, 12, 4, 12, 8], "senses": "Olfato agudo, Percepción pasiva 13",
        "actions": [T("Levántate", "El aliado más cercano, si está derribado, se levanta sin gastar movimiento."),
                    T("Olfato fiel", "Hasta tu siguiente turno, el aliado más cercano tiene ventaja en las pruebas de Sabiduría (Percepción) basadas en el olfato y no puede ser sorprendido por criaturas a 30 pies.")],
        "mejoras": [(5, "Levántate también termina el estado agarrado si lo sujeta una criatura Mediana o menor."), (11, "Olfato fiel alcanza 60 pies."), (17, "Levántate puede usarse como reacción.")],
    },
    "cuervo": {
        "name": "Cuervo", "size": "Pequeño", "por": "Memoria e ingenio: los Sram lo usaron para estudiar cómo guardar recuerdos en la biomasa.",
        "que": "Lleva lo que haga falta al aliado que lo necesita.",
        "speed": "10 pies, vuelo 50 pies", "abilities": [4, 16, 10, 8, 14, 8], "senses": "Percepción pasiva 14",
        "actions": [T("Mensajero", "Lleva un objeto ligero (como una poción) hasta un aliado a 60 pies; ese aliado puede usarlo como acción adicional en su siguiente turno."),
                    T("Recordar", "Repite palabra por palabra algo que oyó en la última hora.")],
        "mejoras": [(5, "Mensajero: el aliado puede usar el objeto como reacción."), (11, "Vuelo 80 pies."), (17, "Puede llevar dos objetos a dos aliados distintos.")],
    },
    "buho": {
        "name": "Búho", "size": "Pequeño", "por": "Vista en la oscuridad y silencio absoluto: lo que los Sram querían para moverse sin ser vistos.",
        "que": "Presta sus ojos nocturnos al aliado más cercano.",
        "speed": "5 pies, vuelo 60 pies", "abilities": [4, 14, 10, 4, 16, 8], "senses": "Visión en la oscuridad 120 pies",
        "actions": [T("Ojos de la noche", "Hasta el final de tu siguiente turno, el aliado más cercano tiene visión en la oscuridad de 60 pies y no sufre desventaja por luz tenue.")],
        "traits": [T("Vuelo silencioso", "No provoca ataques de oportunidad al salir del alcance de una criatura.")],
        "mejoras": [(5, "Ojos de la noche dura 1 minuto."), (11, "Afecta a dos aliados."), (17, "El aliado también ve a través de la oscuridad mágica.")],
    },
    "serpiente": {
        "name": "Serpiente", "size": "Mediano", "por": "Muda de piel: los Sram la usaron para aprender a renovar un cuerpo sin romperlo.",
        "que": "Cubre la retirada del aliado más cercano.",
        "speed": "30 pies, nadar 30 pies", "abilities": [10, 16, 12, 2, 12, 6], "senses": "Visión ciega 10 pies",
        "actions": [T("Siseo", "Hasta el inicio de su siguiente turno, las criaturas a 5 pies de la Serpiente tienen desventaja en los ataques de oportunidad contra el aliado más cercano.")],
        "traits": [T("Muda", "Una vez por descanso largo, la Serpiente vuelve a sus PG máximos al quedar a 0 PG en lugar de volver a ti.")],
        "mejoras": [(5, "Siseo alcanza 10 pies."), (11, "Siseo afecta a todos los aliados a 10 pies de la Serpiente."), (17, "Muda: dos veces por descanso largo.")],
    },
    "oso": {
        "name": "Oso", "size": "Grande", "por": "Fuerza y aguante: los Sram estudiaban cómo ahorra energía al hibernar.",
        "que": "Da calor y firmeza al aliado más cercano.",
        "speed": "40 pies", "abilities": [16, 10, 16, 2, 12, 6], "senses": "Olfato agudo, Percepción pasiva 13", "hp": 4,
        "actions": [T("Calor de la osera", "Hasta el inicio de su siguiente turno, el aliado más cercano tiene ventaja en las salvaciones de Constitución para mantener la concentración.")],
        "traits": [T("Corpulento", "Un aliado Mediano o más pequeño puede ocupar el espacio del Oso sin contar como terreno difícil.")],
        "mejoras": [(5, "Calor de la osera dura 1 minuto."), (11, "También ventaja en las salvaciones contra agotamiento."), (17, "Afecta a dos aliados.")],
    },
    "ciervo": {
        "name": "Ciervo", "size": "Grande", "por": "Velocidad y alerta: los Sram querían un cuerpo que reaccionara antes que el peligro.",
        "que": "Da impulso al aliado más cercano.",
        "speed": "50 pies", "abilities": [14, 16, 12, 2, 14, 6], "senses": "Percepción pasiva 14", "hp": 3,
        "actions": [T("Salto de huida", "El aliado más cercano gana +10 pies de velocidad hasta el final de su siguiente turno.")],
        "mejoras": [(5, "+15 pies."), (11, "El aliado tampoco sufre terreno difícil natural."), (17, "Afecta a dos aliados.")],
    },
}
ABIL = ["fuerza", "destreza", "constitucion", "inteligencia", "sabiduria", "carisma"]


def sujeto_creature(k, s, race_key):
    return {
        "name": s["name"], "size": s["size"], "creatureType": "Sujeto (biomasa del Exp. 043)", "capacidad": False, "razas": [race_key],
        "ac": {"base": 12, "bc": True}, "hp": {"base": 0, "porNivel": s.get("hp", 2), "atributo": "sabiduria"},
        "hpTexto": f"{s.get('hp', 2)} × tu nivel + tu mod. de Sabiduría",
        "speed": s["speed"], "abilities": dict(zip(ABIL, s["abilities"])), "senses": s["senses"], "languages": "Entiende al Experimento 043",
        "description": f"Tu Sujeto de origen. {s['que']} Por qué: {s['por']} No ocupa Capacidad de Manifestación.",
        "traits": [T("Parte de ti", "Se manifiesta o se reabsorbe como acción adicional. Actúa en tu iniciativa, justo después de ti. Si cae a 0 PG, vuelve a ti sin hacerte daño y no puede manifestarse hasta un descanso corto, o gastando 1 de Esencia. Deja de actuar a más de 60 pies de ti.")] + s.get("traits", []),
        "actions": s.get("actions", []), "reactions": s.get("reactions", []),
        "mejoras": [{"nivel": n, "texto": x} for n, x in s["mejoras"]],
    }


def race_key(s):
    return f"{BASE} ({s['name']})"


# ══ Raza ═══════════════════════════════════════════════════════════════════

def race_info(s):
    return "\n".join([
        "Rasgos de Raza:",
        f"♻ Tipo y tamaño. Eres una aberración {s['size']} (el tamaño de tu Sujeto de origen): biomasa sintética de los Sram, con metabolismo y necesidades orgánicas. No eres un constructo.",
        f"♻ Sujeto de origen: {s['name']}. {s['que']} Es tu primera invocación: la manifiestas o reabsorbes como acción adicional y no ocupa Capacidad de Manifestación (estadísticas en Criaturas → Añadir criatura → De un catálogo).",
        "♻ La raza no te daña. Ningún rasgo de tu raza puede causarte daño ni matarte.",
        "♻ Sin rostro. Eres biomasa sin cara: tu rostro se forma por primera vez cuando recibes una Cura elemental (habla con tu DM; normalmente llega a nivel 5).",
        "♻ Poliforme. A voluntad, como acción, adoptas el aspecto de una criatura que recuerdes o vuelves a tu forma natural. Para recordarla tienes que dibujarla "
        "en un libro, papel o papiro: tira d20 + Inteligencia (Historia) o Destreza (Juego de Manos) contra la CD que fije el DM. Mientras conserves el dibujo, "
        "puedes adoptar esa forma. Copias la forma, la voz (si la oíste al menos 1 minuto) y un olor superficial; nunca sus estadísticas, sentidos, velocidades, "
        "ataques ni rasgos, y tu tamaño real no cambia. Suplantar a alguien concreto sigue pidiendo Carisma (Engaño) contra Sabiduría (Perspicacia); quien lo "
        "conoce de cerca tiene ventaja, y un olfato de rastreo puede notar que algo no cuadra.",
        "♻ Reserva de oxígeno. Dependes del oxígeno, pero lo almacenas: puedes contener la respiración 10 × (1 + tu modificador de Constitución) minutos "
        "(mínimo 10). Al agotarla empiezas a asfixiarte con las reglas normales. Recuperas la reserva tras respirar aire 10 minutos. No te protege de gases "
        "venenosos, de la asfixia mágica ni del daño de Vacío.",
        "♻ Contracción defensiva. Cuando una criatura que puedes ver ataca a un aliado a 10 pies (2 casillas) o menos de ti, puedes usar tu reacción para darle "
        "+2 a la CA contra ese ataque. Usos: tu bonificador de competencia por descanso largo.",
        "♻ Calma. Tienes ventaja en las tiradas de salvación para no quedar asustado ni encantado.",
        "♻ Enfermedad de las estadísticas. Puedes quitarte 1 punto de un atributo para crear un caramelo que lo replica (10 minutos). Quien se lo come gana +1 a "
        "ese atributo, sin límite de tiempo (sin pasar de 20). Tienes como máximo tantos puntos cedidos como tu bonificador de competencia; recuperas cada punto "
        "1 hora después de que se coman su caramelo o si se pierde. Desde el segundo caramelo en 24 horas, la vida de quien los come se drena: pierde 1 PG máximo "
        "cada 10 minutos, o 3 si se comió dos o más de golpe, sin bajar nunca de 1. Cualquier curación se lo lleva todo: el drenaje, lo drenado y los puntos "
        "ganados. (Ficha: tarjeta «Caramelos».)",
    ])


def race_entry(k, s):
    return {
        "velocidad": 30,
        "choices": [{"count": 2, "bonus": 1}],
        "lenguage": "Idioma: Puedes leer, escribir y hablar Común y Sram",
        "yaHabla": ["Común", "Sram"],
        "efectos": [
            {"type": "habilita", "value": "invocaciones_sujetos"},
            {"type": "habilita", "value": "caramelos"},
            {"type": "recurso", "id": "contraccion-defensiva", "nombre": "Contracción defensiva", "max": {"bc": True}},
        ],
        "descripcion": f"Experimento 043 de los Sram. Sujeto de origen: {s['name']} ({s['que'][0].lower() + s['que'][1:]})",
        "info": race_info(s),
        "linaje": LINAJE,
        "tipo": "Aberración",
        "tamano": s["size"],
        "origen": "Instalaciones orbitales de los Sram",
        "claseRecomendada": CLASS,
    }


LORE = {
    "nombre": "Experimento 043",
    "resumen": "Biomasa moldeable de los Sram: valiosa, perseguida y convencida de estar enferma.",
    "secciones": [
        {"titulo": "El salto de los Sram", "texto":
            "Los Sram son una civilización dedicada a la experimentación biológica. Su meta es dar el salto de ser esqueletos a tener un cuerpo moldeable, "
            "y para eso necesitaban aprender a crearlo. Hicieron 43 experimentos. El último, el Experimento 043, fue el que funcionó: una biomasa con forma "
            "de slime que se une a una criatura viva —su Sujeto de origen— cuando aún es joven, y la hace parte de sí.\n\n"
            "El avance no fue gratis. Un Sram llamado, literalmente, «Sram» se sacrificó por el proyecto, y su sacrificio lo hizo avanzar más que todos "
            "los intentos anteriores."},
        {"titulo": "Decenas, no millones", "texto":
            "Del Experimento 043 existen decenas, no más. El primero de todos, el 043-0, nació de un conejo; a los dos años consiguió escapar de los Sram.\n\n"
            "Los Sram no dejan cabos sueltos. Cada uno de estos seres es valioso: lleva dentro un «combustible» de estadísticas tan potente que cualquier "
            "ser con inteligencia o tecnología avanzada querría tener uno para fortalecerse con facilidad. Por eso los vigilan, los buscan y los recuperan."},
        {"titulo": "La enfermedad", "texto":
            "Los Sram les repiten una y otra vez que están enfermos, para que no se vayan. Algo de verdad hay: un Experimento 043 puede arrancarse un "
            "pedazo de sí mismo —su fuerza, sus reflejos, su memoria— y darle forma de caramelo para que otro lo use. Pero quien abusa de esos caramelos "
            "siente cómo la vida se le escapa poco a poco, hasta que cualquier curación se lleva el efecto… y el poder ganado."},
        {"titulo": "Las «curas»", "texto":
            "Algunos encuentran algo que parece una cura: un elemento (fuego, frío, fuerza…) que se funde con su biomasa. No lo es del todo, pero los "
            "cambia: por primera vez se forma su rostro y pueden ver su cara, y su elemento les da habilidades nuevas. La primera de estas «curas» que se "
            "conoce fue la Tinta, y de ella viene el nombre «Ink».\n\n"
            "Fuera de los Sram suelen ser diplomáticos, sanadores, espías o mediadores, y muchos siguen el camino del Adaptado. Sin rostro y con un cuerpo "
            "que se mueve solo, más de uno los mira con recelo hasta que los conoce."},
    ],
}

# ══ Invocaciones Ink (data/class-creatures.json) ═══════════════════════════

T = lambda name, text: {"name": name, "text": text}
UPG = "Mejora del Repertorio"

CREATURES = {
    "golem": {
        "name": "Golem", "size": "Grande", "creatureType": "Constructo de biomasa", "ac": 15,
        "hp": {"base": 20, "porNivel": 5}, "hpTexto": "20 + 5 × tu nivel", "speed": "20 pies",
        "abilities": {"fuerza": 16, "destreza": 6, "constitucion": 20, "inteligencia": 10, "sabiduria": 14, "carisma": 1},
        "senses": "Visión en la oscuridad 60 pies, Percepción pasiva 12",
        "description": "Biomasa endurecida que protege. Ocupa Capacidad de Manifestación (no usa concentración). Inmune a asustado, encantado y paralizado.",
        "traits": [T("Recuperación", "Al final de su turno puede recuperar 1d4 + su modificador de Constitución PG. Dos veces por descanso corto o largo.")],
        "actions": [
            T("Interponerse", "Se coloca junto a un aliado: el siguiente ataque cuerpo a cuerpo de un enemigo contra ese aliado, antes del próximo turno del Golem, tiene desventaja."),
            T("Apartar", "Una criatura adyacente que haya atacado a un aliado este asalto hace una salvación de Fuerza (CD de clase) o es empujada 10 pies o derribada. Sin daño, y nunca hacia algo que la dañe."),
            T("Cobertura", "Se planta: un aliado detrás de él tiene cobertura media (+2 CA) contra ataques a distancia."),
        ],
        "reactions": [T("Interceptar", "Una vez por turno, si un aliado a 10 pies recibe un ataque, reduce su daño en 1d10 + tu bonificador de competencia (lo absorbe el Golem). Es su reacción, no la tuya.")],
        "mejoras": [
            {"nivel": 7, "texto": "CA 16; Cobertura da cobertura de tres cuartos (+5 CA)."},
            {"nivel": 11, "texto": "Apartar alcanza a dos criaturas adyacentes."},
            {"nivel": 15, "texto": "CA 17; Interceptar reduce 2d10 + tu bonificador de competencia."},
        ],
    },
    "loro": {
        "name": "Loro insultador", "size": "Diminuto", "creatureType": "Bestia (biomasa del Exp. 043)", "ac": 13,
        "hp": 1, "speed": "30 pies, vuelo 60 pies",
        "abilities": {"fuerza": 6, "destreza": 14, "constitucion": 1, "inteligencia": 10, "sabiduria": 14, "carisma": 20},
        "senses": "Visión en la oscuridad 60 pies, Percepción pasiva 12", "languages": "Todos los idiomas (sólo insultos)",
        "description": "Frágil, rapidísimo y ruidoso. Se manifiesta como acción adicional a 30 pies de ti y no usa concentración. Ocupa Capacidad de Manifestación.",
        "traits": [T("Insulto Disonante", "Al manifestarse, cada criatura hostil a 20 pies del Loro hace una salvación de Sabiduría (CD de clase). Si falla, durante 1 minuto tiene desventaja en las tiradas de ataque contra cualquiera que no sea el Loro o tú, mientras el Loro siga vivo y a la vista. Repite la salvación al final de cada uno de sus turnos.")],
        "mejoras": [
            {"nivel": 7, "texto": "Sus PG pasan a ser tu nivel."},
            {"nivel": 11, "texto": "Insulto Disonante alcanza 30 pies."},
            {"nivel": 15, "texto": "Si el Loro cae, el Insulto dura hasta el final de la siguiente ronda."},
        ],
    },
    "ruleta": {
        "name": "Ruleta", "size": "Mediano (mide lo que mide el INK)", "creatureType": "Biomasa del Exp. 043", "capacidad": False,
        "description": "Gastas una acción y 2 de Esencia: la Ruleta aparece, gira, muestra el resultado y desaparece. No ocupa Capacidad de Manifestación. Una vez por descanso corto o largo. Eliges el objetivo (tú o una criatura a 30 pies) antes de tirar; los resultados negativos afectan a quien elegiste.",
        "traits": [
            T("1 · Rebote biológico", "Pierdes 1 punto de Esencia adicional y tienes desventaja en tu siguiente tirada de salvación. Sin daño."),
            T("2–4 · Sobrecarga negativa", "El objetivo tiene desventaja en su siguiente tirada de ataque."),
            T("5–7 · Inestabilidad menor", "La velocidad del objetivo se reduce a la mitad hasta el final de su siguiente turno."),
            T("8–11 · Destello", "Cualquier criatura que elijas tiene ventaja en su siguiente prueba de característica."),
            T("12–14 · Impulso menor", "El objetivo tiene ventaja en su siguiente tirada de ataque o prueba de característica."),
            T("15–17 · Refuerzo", "El objetivo gana 1d8 PG temporales."),
            T("18–19 · Golpe de suerte", "El objetivo tiene ventaja en su siguiente ataque, prueba o salvación, y gana 1d6 PG temporales."),
            T("20 · Resonancia perfecta", "Eliges: el objetivo obtiene un turno adicional justo después del actual (sólo movimiento y una acción), o un enemigo tiene desventaja en sus dos siguientes tiradas."),
        ],
        "mejoras": [
            {"nivel": 7, "texto": "Refuerzo da 2d8 PG temporales y Golpe de suerte 2d6."},
            {"nivel": 11, "texto": "Puedes elegir el objetivo después de ver el resultado una vez por descanso largo."},
            {"nivel": 15, "texto": "Cuesta 1 de Esencia."},
        ],
    },
    "topo": {
        "name": "Topo", "size": "Pequeño", "creatureType": "Bestia (biomasa del Exp. 043)", "ac": 13,
        "hp": {"base": 5, "porNivel": 3}, "hpTexto": "5 + 3 × tu nivel", "speed": "20 pies, excavar 15 pies",
        "abilities": {"fuerza": 12, "destreza": 12, "constitucion": 14, "inteligencia": 4, "sabiduria": 12, "carisma": 6},
        "senses": "Sentido sísmico 30 pies, Percepción pasiva 11",
        "description": "Rol: terreno y túneles. Ocupa Capacidad de Manifestación.",
        "traits": [T("Túneles", "Abre en tierra o arena un túnel de 5 pies de ancho por el que pueden pasar criaturas Medianas; sirve de refugio o salida.")],
        "actions": [
            T("Socavón", "Hunde el suelo bajo una criatura a 5 pies: salvación de Destreza (CD de clase) o queda derribada. El suelo queda como terreno difícil hasta el final del combate."),
            T("Avisar", "Comparte su sentido sísmico: tú y un aliado no podéis ser sorprendidos por criaturas que toquen el suelo a 30 pies hasta tu siguiente turno."),
        ],
        "mejoras": [
            {"nivel": 7, "texto": "Socavón afecta a un cuadrado de 10 pies."},
            {"nivel": 11, "texto": "Sentido sísmico 60 pies."},
            {"nivel": 15, "texto": "Excavar 30 pies; el túnel admite criaturas Grandes."},
        ],
    },
    "pulpo": {
        "name": "Pulpo", "size": "Mediano", "creatureType": "Bestia (biomasa del Exp. 043)", "ac": 12,
        "hp": {"base": 5, "porNivel": 3}, "hpTexto": "5 + 3 × tu nivel", "speed": "20 pies, trepar 20 pies, nadar 30 pies",
        "abilities": {"fuerza": 14, "destreza": 14, "constitucion": 12, "inteligencia": 6, "sabiduria": 10, "carisma": 6},
        "senses": "Visión en la oscuridad 60 pies, Percepción pasiva 10",
        "description": "Rol: manipular y sujetar. Ocupa Capacidad de Manifestación.",
        "traits": [T("Tentáculos", "Manipula objetos a 15 pies: abre puertas, recoge cosas o usa herramientas con tu competencia.")],
        "actions": [
            T("Sujetar", "Agarra a una criatura a 15 pies (escapar: CD de clase). Mientras la sujeta, no puede usar Sujetar con otra."),
            T("Desarmar", "Una criatura a 15 pies hace una salvación de Fuerza (CD de clase) o suelta un objeto que sostenga."),
            T("Recoger", "Arrastra a un aliado caído hasta 15 pies hacia él sin provocar ataques de oportunidad."),
        ],
        "mejoras": [
            {"nivel": 7, "texto": "Puede sujetar a dos criaturas a la vez."},
            {"nivel": 11, "texto": "La criatura sujeta queda además apresada."},
            {"nivel": 15, "texto": "Alcance de 30 pies."},
        ],
    },
    "polilla": {
        "name": "Polilla", "size": "Diminuto", "creatureType": "Bestia (biomasa del Exp. 043)", "ac": 13,
        "hp": {"base": 1, "porNivel": 1}, "hpTexto": "1 + tu nivel", "speed": "10 pies, vuelo 60 pies",
        "abilities": {"fuerza": 2, "destreza": 16, "constitucion": 8, "inteligencia": 6, "sabiduria": 14, "carisma": 6},
        "senses": "Visión ciega 30 pies, Percepción pasiva 14",
        "description": "Rol: explorar y revelar. Ocupa Capacidad de Manifestación.",
        "traits": [T("Ojos prestados", "Como acción adicional, ves y oyes lo que ella hasta el inicio de tu siguiente turno.")],
        "actions": [
            T("Revelar", "Una criatura invisible u oculta a 30 pies queda marcada hasta el final de tu siguiente turno: no se beneficia de ser invisible y no puede esconderse."),
            T("Tocar ilusión", "Al tocar una ilusión, sabes que es una ilusión."),
        ],
        "mejoras": [
            {"nivel": 7, "texto": "Revelar dura 1 minuto."},
            {"nivel": 11, "texto": "Visión ciega 60 pies."},
            {"nivel": 15, "texto": "Revelar afecta a todas las criaturas en un radio de 15 pies."},
        ],
    },
    "montura": {
        "name": "Montura", "size": "Grande", "creatureType": "Bestia (biomasa del Exp. 043)", "ac": 13,
        "hp": {"base": 10, "porNivel": 4}, "hpTexto": "10 + 4 × tu nivel", "speed": "40 pies",
        "abilities": {"fuerza": 16, "destreza": 12, "constitucion": 14, "inteligencia": 4, "sabiduria": 10, "carisma": 6},
        "senses": "Percepción pasiva 10",
        "description": "Rol: transporte. Lleva a una criatura Mediana o más pequeña. Ocupa Capacidad de Manifestación.",
        "traits": [T("Pisada firme", "Ignora el terreno difícil del Desecho, de Enredo Adhesivo y del Socavón.")],
        "actions": [
            T("Evacuar", "Se mueve hasta su velocidad con su jinete sin provocar ataques de oportunidad."),
            T("Recoger al vuelo", "Durante su movimiento sube a un aliado voluntario como jinete."),
        ],
        "mejoras": [
            {"nivel": 7, "texto": "Velocidad 50 pies."},
            {"nivel": 11, "texto": "Lleva dos jinetes."},
            {"nivel": 15, "texto": "Gana velocidad de trepar igual a su velocidad."},
        ],
    },
    "esponja": {
        "name": "Esponja", "size": "Pequeño", "creatureType": "Biomasa del Exp. 043", "ac": 11,
        "hp": {"base": 5, "porNivel": 3}, "hpTexto": "5 + 3 × tu nivel", "speed": "15 pies, nadar 15 pies",
        "abilities": {"fuerza": 6, "destreza": 8, "constitucion": 16, "inteligencia": 3, "sabiduria": 12, "carisma": 6},
        "senses": "Percepción pasiva 11",
        "description": "Rol: absorber estados (venenos, enfermedades, condiciones). Ocupa Capacidad de Manifestación.",
        "actions": [
            T("Absorber", "Un aliado a 5 pies termina el estado envenenado, o repite al instante una salvación contra una condición que le afecte."),
            T("Filtro", "Hasta el inicio de su siguiente turno, los aliados a 10 pies tienen ventaja en las salvaciones contra veneno y enfermedad."),
        ],
        "mejoras": [
            {"nivel": 7, "texto": "Absorber también termina cegado o ensordecido."},
            {"nivel": 11, "texto": "Filtro alcanza 20 pies."},
            {"nivel": 15, "texto": "Absorber termina también paralizado (no si lo causa un hechizo de nivel 6 o más)."},
        ],
    },
    "arana": {
        "name": "Araña", "size": "Pequeño", "creatureType": "Bestia (biomasa del Exp. 043)", "ac": 13,
        "hp": {"base": 5, "porNivel": 3}, "hpTexto": "5 + 3 × tu nivel", "speed": "30 pies, trepar 30 pies",
        "abilities": {"fuerza": 10, "destreza": 16, "constitucion": 12, "inteligencia": 4, "sabiduria": 12, "carisma": 4},
        "senses": "Visión en la oscuridad 60 pies, Percepción pasiva 11",
        "description": "Rol: anclar y sostener (caídas y desplazamientos). Ocupa Capacidad de Manifestación.",
        "traits": [T("Hilos", "Tiende cuerdas y puentes de hasta 30 pies entre superficies.")],
        "reactions": [T("Anclar", "Cuando un aliado a 30 pies va a ser empujado, atraído o va a caer, evita hasta 15 pies de ese movimiento (y la caída correspondiente).")],
        "mejoras": [
            {"nivel": 7, "texto": "Anclar evita hasta 30 pies."},
            {"nivel": 11, "texto": "Hilos de hasta 60 pies."},
            {"nivel": 15, "texto": "Anclar puede usarse dos veces por ronda."},
        ],
    },
    "luciernaga": {
        "name": "Luciérnaga", "size": "Diminuto", "creatureType": "Bestia (biomasa del Exp. 043)", "ac": 13,
        "hp": {"base": 1, "porNivel": 2}, "hpTexto": "1 + 2 × tu nivel", "speed": "10 pies, vuelo 40 pies",
        "abilities": {"fuerza": 2, "destreza": 14, "constitucion": 10, "inteligencia": 4, "sabiduria": 14, "carisma": 12},
        "senses": "Percepción pasiva 12",
        "description": "Rol: luz y ánimo. Ocupa Capacidad de Manifestación.",
        "traits": [T("Farol", "Emite luz brillante en un radio de 20 pies y tenue 20 pies más (puede apagarla).")],
        "actions": [T("Aliento de luz", "Un aliado a 30 pies que esté asustado o encantado repite al instante la salvación con ventaja.")],
        "reactions": [T("Valor", "Cuando un aliado a 30 pies hace una salvación contra quedar asustado, le da ventaja.")],
        "mejoras": [
            {"nivel": 7, "texto": "Aliento de luz da además 1d6 PG temporales."},
            {"nivel": 11, "texto": "Luz brillante de 40 pies."},
            {"nivel": 15, "texto": "Los aliados a 10 pies son inmunes a quedar asustados."},
        ],
    },
}

REPERTOIRE_ORDER = ["golem", "loro", "ruleta", "topo", "pulpo", "polilla", "montura", "esponja", "arana", "luciernaga"]
ROLE = {
    "golem": "Protección: interponerse, apartar, cobertura e interceptar daño.",
    "loro": "Atraer: Insulto Disonante obliga a atacarle a él o a ti.",
    "ruleta": "Azar: aparece, gira y desaparece (no ocupa capacidad).",
    "topo": "Terreno: túneles, socavones y aviso sísmico.",
    "pulpo": "Manipular: sujetar, desarmar y recoger aliados.",
    "polilla": "Explorar: ves por ella y revela lo invisible.",
    "montura": "Transporte: lleva y evacua aliados.",
    "esponja": "Estados: absorbe venenos y condiciones.",
    "arana": "Anclaje: hilos y evitar empujones o caídas.",
    "luciernaga": "Ánimo y luz: contra el miedo y el encantamiento.",
}


def repertoire_list():
    ops = [{"id": k, "nombre": CREATURES[k]["name"], "descripcion": ROLE[k] + " Estadísticas: Criaturas → Añadir criatura → De un catálogo."}
           for k in REPERTOIRE_ORDER]
    return {"titulo": "Repertorio de invocaciones", "ayuda": "Tus tres invocaciones conocidas. Cada una hace cosas distintas.", "opciones": ops}


# ══ Hechizos del Adaptado (data/spells.json) ═══════════════════════════════

def spell(id_, nombre, nivel, escuela, tiempo, alcance, comps, dur, texto, req=None, tipo=("Ayuda",)):
    """Conjuro del catálogo (data/spells.json). `req` = nivel de Adaptado a partir del cual se puede aprender."""
    return {"nombre": nombre, "entry": {
        "tipo": list(tipo), "escuela": escuela, "nivel": "Truco" if nivel == 0 else nivel, "origen": "Agarias",
        "componentes": comps, "tiempoLanzamiento": tiempo, "alcance": alcance, "duracion": dur,
        "listaConjurador": "Conjuros de Adaptado.", "conjuradorTrue": {CLASS: True},
        "descripcion": texto.replace("<b>", "").replace("</b>", "") + (f"\n\nCoste para el Adaptado: {nivel} de Esencia." if nivel else ""),
    }}


# Trucos oficiales en listaConjuros; aquí sólo el truco nuevo.
TRUCOS = [
    spell("gota-de-tinta", "Gota de tinta", 0, "Transmutación", "1 acción adicional", "30 pies", "S", "Hasta el final de tu siguiente turno", "Marcas a una criatura con una gota de biomasa: el siguiente ataque de un aliado contra ella tiene +1. Sin daño."),
]

HECHIZOS = [
    spell("vinculo-reconfortante", "Vínculo Reconfortante", 1, "Abjuración", "1 acción", "60 pies", "V, S", "Concentración, 1 minuto", "Un aliado (no tú) gana resistencia a un tipo de daño que elijas (contundente, perforante, cortante, fuego, frío, ácido, veneno, rayo o trueno). <b>A nivel superior:</b> +1 aliado por cada nivel por encima de 1."),
    spell("piel-reactiva", "Piel Reactiva", 1, "Transmutación", "1 acción adicional", "Toque", "V, S", "Concentración, 1 minuto", "Una criatura voluntaria gana +2 a la CA y ventaja en las salvaciones para no ser derribada."),
    spell("espora-confusora", "Espora Confusora", 1, "Encantamiento", "1 acción", "30 pies", "V", "Instantánea", "Una criatura hace una salvación de Sabiduría o tiene desventaja en su siguiente tirada de ataque antes del final de su siguiente turno. No afecta a quien es inmune al veneno o no respira. <b>A nivel superior:</b> +1 criatura por nivel."),
    spell("mascara-de-otro", "Máscara de Otro", 1, "Ilusión", "1 acción adicional", "Toque", "V, S", "1 hora", "Una criatura voluntaria (puedes ser tú) tiene ventaja en todas sus pruebas de Carisma (Engaño) durante una misma interacción social."),
    spell("segundo-aliento-prestado", "Segundo Aliento Prestado", 2, "Abjuración", "1 acción", "Toque", "V, S", "Instantánea", "Una criatura recupera 2d8 + tu modificador de Sabiduría PG, sin gastar sus Dados de Golpe.", 5),
    spell("enredo-adhesivo", "Enredo Adhesivo", 2, "Conjuración", "1 acción", "60 pies", "V, S, M (una gota de tu biomasa)", "Concentración, 1 minuto", "Un cuadrado de 10 pies se vuelve terreno difícil. Quien empiece su turno en él o entre por primera vez hace una salvación de Fuerza o queda apresado hasta que use su acción y la supere.", 5),
    spell("disolucion-parcial", "Disolución Parcial", 2, "Transmutación", "1 acción", "Toque", "V, S", "1 minuto", "Una criatura voluntaria ignora el terreno difícil y puede atravesar el espacio de criaturas Medianas o mayores como terreno difícil (sin terminar ahí). No atraviesa objetos ni paredes.", 5),
    spell("miasma-debilitante", "Miasma Debilitante", 3, "Nigromancia", "1 acción", "60 pies", "V, S", "Concentración, 1 minuto", "Hasta tres criaturas a 20 pies entre sí hacen una salvación de Constitución o tienen desventaja en sus tiradas de ataque. Repiten la salvación al final de cada uno de sus turnos.", 9),
    spell("zona-de-regeneracion", "Zona de Regeneración", 3, "Abjuración", "1 acción", "30 pies", "V, S", "Concentración, 1 minuto", "Un área de 15 pies de radio: cada aliado que termine su turno dentro recupera 1d6 PG (una vez por ronda).", 9),
    spell("santuario-ink", "Santuario Ink", 3, "Abjuración", "1 acción adicional", "30 pies", "V, S", "Concentración, 1 minuto", "Un aliado queda envuelto en biomasa: quien quiera atacarle o afectarle con un conjuro dañino hace antes una salvación de Sabiduría o elige otro objetivo. Termina si ese aliado ataca o lanza un conjuro que afecte a un enemigo.", 9),
    spell("espejo-de-carne", "Espejo de Carne", 4, "Abjuración", "1 reacción (un aliado a 30 pies es alcanzado por un ataque)", "30 pies", "V, S", "Instantánea", "Recibes tú el ataque en lugar de tu aliado, con tus resistencias. El daño lo causa el enemigo, no tu raza. Una vez por combate.", 13),
    spell("paralizacion-simbiotica", "Paralización Simbiótica", 4, "Transmutación", "1 acción", "30 pies", "V, S, M (una porción de tu biomasa)", "Concentración, 1 minuto", "Una criatura hace una salvación de Constitución o queda apresada y con desventaja en las salvaciones de Fuerza y Destreza. Repite la salvación al final de cada uno de sus turnos. No afecta a criaturas Enormes o mayores.", 13),
    spell("pulso-de-calma", "Pulso de Calma", 4, "Encantamiento", "1 acción", "60 pies", "V, S", "Instantánea", "Cada criatura que elijas en una esfera de 20 pies hace una salvación de Sabiduría o no puede atacar hasta el final de su siguiente turno.", 13),
    spell("reconfiguracion-mayor", "Reconfiguración Mayor", 5, "Abjuración", "1 acción", "30 pies", "V, S", "Instantánea", "Hasta seis criaturas que puedas ver recuperan cada una 5d8 + tu modificador de Sabiduría PG.", 17),
]

# Hechizos conocidos por nivel (total) y nivel máximo de hechizo.
KNOWN = [2, 3, 3, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12]
CANTRIPS = {1: 2, 4: 1, 10: 1}
MAX_SPELL = lambda lv: 1 if lv < 5 else 2 if lv < 9 else 3 if lv < 13 else 4 if lv < 17 else 5
ESENCIA = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 20, 20]
CAPACITY = lambda lv: "-" if lv < 3 else "1" if lv < 7 else "2" if lv < 13 else "3"



# ══ Curas elementales (subclases a nivel 5) ════════════════════════════════
# Los elementos son los tipos de daño de energía de las Reglas (sin los físicos:
# contundente, cortante y perforante no son elementos) más Profano, Sagrado y
# Vacío de Agarias, y la Tinta nueva. Ninguno hace daño: cada uno da una
# propiedad de soporte única. Rasgos en los niveles 5 (Don y Simbiosis), 10
# (Afinidad) y 15 (Dominio).

ELEMENTOS = {
    "acido": ("Ácido", "Rostro de vapores verdes; tu biomasa burbujea.",
              "Disolver ataduras: como acción adicional, un aliado a 30 pies deja de estar agarrado o apresado (disuelves lo que lo sujeta, sin dañar a nadie). Usos: tu bonificador de competencia por descanso largo.",
              "El aliado no puede quedar agarrado ni apresado.",
              "Disuelves en 1 minuto un objeto no mágico del tamaño de una puerta (cerraduras, barrotes, cadenas).",
              "Disolver ataduras libera a todos los aliados a 30 pies."),
    "frio": ("Frío", "Rostro escarchado; tu biomasa se vuelve cristalina.",
             "Conservar: como acción, un aliado a 0 PG a 30 pies se estabiliza y tiene ventaja en las salvaciones contra la muerte hasta que lo curen. Usos: tu bonificador de competencia por descanso largo.",
             "El aliado ignora el terreno difícil de hielo y nieve y tiene ventaja en las salvaciones de Constitución.",
             "Creas un puente o plataforma de hielo de hasta 20 pies durante 1 minuto.",
             "Una vez por descanso largo, congelas en el tiempo a un aliado: hasta el inicio de tu siguiente turno no puede ser afectado por nada, pero tampoco actuar."),
    "fuego": ("Fuego", "Rostro de brasas; tu biomasa da calor.",
              "Hoguera: cada aliado que termine un descanso corto contigo recupera 1 Dado de Golpe extra y reduce en 1 su agotamiento.",
              "El aliado no puede quedar asustado.",
              "Tú y tus aliados a 30 pies no sufréis el frío extremo; puedes emitir luz brillante en 20 pies.",
              "Una vez por descanso largo, como acción, un aliado a 0 PG a 30 pies se levanta con PG iguales a tu nivel."),
    "fuerza": ("Fuerza", "Rostro de energía pura y transparente; el poder primordial.",
               "Escudo: como acción adicional, un aliado a 30 pies gana PG temporales iguales al doble de tu nivel. Usos: tu bonificador de competencia por descanso largo.",
               "El aliado gana +2 a la CA (en lugar de +1).",
               "Puedes repartir el Escudo entre dos aliados.",
               "Una vez por descanso largo, levantas una barrera de fuerza de 10 × 10 pies durante 1 minuto (concentración) que nada atraviesa."),
    "necrotico": ("Necrótico", "Rostro pálido y sereno; tu biomasa huele a tierra.",
                  "Umbral: como reacción, un aliado a 30 pies que falle una salvación contra la muerte la repite. Usos: tu bonificador de competencia por descanso largo.",
                  "El aliado tiene resistencia al daño necrótico y sus PG máximos no pueden reducirse.",
                  "Sientes a los no muertos y a los vivos a 60 pies y sabes cuántos PG le quedan a una criatura que ves.",
                  "Una vez por descanso largo, devuelves la vida con 1 PG a una criatura muerta hace menos de 1 minuto."),
    "psiquico": ("Psíquico", "Rostro de ojos brillantes; tu biomasa vibra al pensar.",
                 "Red mental: hasta tantos aliados como tu bonificador de competencia quedan vinculados contigo (telepatía a 60 pies). Si uno ve a un enemigo, todos saben dónde está.",
                 "El aliado tiene ventaja en las salvaciones de Inteligencia y Sabiduría.",
                 "Lees los pensamientos superficiales de una criatura (como Detectar pensamientos), tantas veces como tu bonificador de competencia por descanso largo.",
                 "Una vez por ronda, un aliado vinculado puede usar su reacción para hacer la acción Ayudar a otro aliado."),
    "radiante": ("Radiante", "Rostro luminoso; tu biomasa brilla por dentro.",
                 "Faro: tus curaciones (rasgos, hechizos e invocaciones) suman tu bonificador de competencia.",
                 "El aliado emite luz brillante en 20 pies y tiene ventaja contra quedar cegado.",
                 "Cuando curas a un aliado, otro a 10 pies de él recupera la mitad.",
                 "Una vez por descanso largo, todos los aliados a 30 pies recuperan 4d8 PG."),
    "relampago": ("Relámpago", "Rostro chispeante; tu biomasa se eriza.",
                  "Chispa: tú y los aliados a 30 pies sumáis tu modificador de Sabiduría a la iniciativa.",
                  "El aliado gana +10 pies de velocidad y no provoca ataques de oportunidad.",
                  "Puedes darle a un aliado a 30 pies tu Desplazamiento: lo usa él en su turno.",
                  "Una vez por descanso largo, un aliado gana una acción adicional en su siguiente turno (sólo Atacar una vez, Correr, Destrabarse, Esconderse o Usar un objeto)."),
    "trueno": ("Trueno", "Rostro de ondas; tu biomasa retumba.",
               "Contrasonido: como reacción, cuando una criatura a 60 pies lanza un conjuro con componente verbal, tus aliados tienen ventaja en las salvaciones contra ese conjuro. Usos: tu bonificador de competencia por descanso largo.",
               "El aliado no puede quedar ensordecido y tiene ventaja contra los efectos de sonido.",
               "Ecolocalización: visión ciega a 30 pies.",
               "Una vez por descanso largo, creas una esfera de silencio de 20 pies durante 1 minuto (concentración)."),
    "veneno": ("Veneno", "Rostro de colores vivos y tóxicos; tu biomasa es dulzona.",
               "Toxina sedante: como acción, una criatura a 30 pies hace una salvación de Constitución (CD de clase) o su velocidad queda a 0 hasta el final de su siguiente turno. Sin daño. Usos: tu bonificador de competencia por descanso largo.",
               "El aliado es inmune al estado envenenado.",
               "Al tocar una sustancia sabes si es veneno, poción o droga y qué hace.",
               "Toxina sedante afecta a cada criatura que elijas en una esfera de 10 pies."),
    "profano": ("Profano", "Rostro de sombras rojizas.",
                "Maldición menor: como acción adicional, una criatura a 60 pies tiene desventaja en su siguiente tirada de salvación. Usos: tu bonificador de competencia por descanso largo.",
                "El aliado tiene resistencia al daño Profano y ventaja contra las maldiciones.",
                "Detectas maldiciones y objetos malditos al tocarlos.",
                "Maldición menor afecta a todas sus salvaciones hasta el final de su siguiente turno."),
    "sagrado": ("Sagrado", "Rostro dorado y sereno.",
                "Gracia: como acción adicional, un aliado a 30 pies suma 1d4 a sus tiradas de ataque y de salvación hasta el final de su siguiente turno. Usos: tu bonificador de competencia por descanso largo.",
                "El aliado tiene resistencia al daño Profano y ventaja contra efectos de no muertos e infernales.",
                "Gracia suma 1d6.",
                "Gracia alcanza a dos aliados a la vez."),
    "vacio": ("Vacío", "Rostro morado oscuro, casi invisible.",
              "Burbuja de aire: un aliado a 30 pies puede respirar en cualquier lugar (agua, gas, sin aire) durante 1 hora y tiene ventaja contra los gases. Usos: tu bonificador de competencia por descanso largo.",
              "El aliado flota: velocidad de vuelo de 20 pies (puede quedarse suspendido).",
              "Burbuja de aire alcanza a todos los aliados a 10 pies.",
              "Una vez por descanso largo, escondes a un aliado en un bolsillo de Vacío: desaparece hasta el inicio de tu siguiente turno y nada puede afectarle."),
    "tinta": ("Tinta", "Rostro de tinta negra y azul, con trazos que se mueven; de aquí viene el nombre «Ink».",
              "Sello de tinta: como acción, gastas la Esencia de uno de tus hechizos y lo escribes en la piel de un aliado. Durante 1 hora, ese aliado puede activarlo como acción adicional, como si lo lanzaras tú. Un sello a la vez.",
              "El aliado gana además tu Poliforme mientras dure (puede cambiar de aspecto con tus dibujos).",
              "Copias en tinta, en minutos y sin tirada, cualquier documento, mapa o dibujo; tus dibujos de Poliforme no necesitan tirada.",
              "Puedes tener dos sellos a la vez y tu Simbiosis no tiene límite de duración."),
}


def build_elements():
    subs = {}
    for key, (nombre, rostro, don, simb, afin, domi) in ELEMENTOS.items():
        sub_nivel = {
            "5": {"infoSubBlock": {
                "subBlockUno": {"subName": f"Rostro de {nombre}", "subDescripcion": f"{rostro} Por primera vez puedes ver tu cara."},
                "subBlockDos": {"subName": f"Don: {don.split(':')[0]}", "subDescripcion": don},
                "subBlockTres": {"subName": "Simbiosis elemental", "subDescripcion": f"Mientras estás fundido con un aliado (Simbiosis): {simb}"},
            }},
            "10": {"infoSubBlock": {"subBlockUno": {"subName": f"Afinidad de {nombre}", "subDescripcion": afin}}},
            "15": {"infoSubBlock": {"subBlockUno": {"subName": f"Dominio de {nombre}", "subDescripcion": domi}}},
        }
        uses = [{"type": "recurso", "id": f"don-{key}", "nombre": f"Don: {don.split(':')[0]}", "max": {"bc": True}}] if "bonificador de competencia por descanso largo" in don else []
        if uses:
            sub_nivel["5"]["infoSubBlock"]["subBlockDos"]["efectos"] = uses
        subs[key] = {
            "subNombre": f"Cura de {nombre}", "fuente": "Agarias",
            "subDescripcion": f"✦ CURA DE {nombre.upper()} ✦\n{rostro} No es una cura del todo: es un elemento que se funde con tu biomasa.",
            "subNivel": sub_nivel,
        }
    return subs


# ══ Clase Adaptado ═════════════════════════════════════════════════════════

NIVEL_MAXIMO = [1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5]
CANTRIPS_KNOWN = [2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4]
OFFICIAL_CANTRIPS = ["Guía", "Resistencia", "Piedad con los moribundos", "Mensaje", "Reparar", "Mano de mago", "Taumaturgia", "Luz", "Prestidigitación", "Luces danzantes", "Ilusión menor"]


def block(name, text, efectos=None, elegir=None):
    b = {"name": name, "titleName": f"✦ {name.upper()} ✦", "descripcion": text}
    if efectos:
        b["efectos"] = efectos
    if elegir:
        b["elegir"] = elegir
    return b


FEATURES = {
    1: [
        block("Inhibición", "Nada de lo que haces causa daño: ni tus ataques, ni tus conjuros, ni tus rasgos, ni tus invocaciones, ni los objetos que actives. "
              "Si un efecto tuyo fuese a causar daño, causa 0. Tampoco puedes mover a una criatura (empujar, atraer, derribar, teletransportar) "
              "hacia algo que le vaya a causar daño: ese desplazamiento no ocurre.<br>Sí puedes agarrar, empujar o derribar sin peligro, proteger, curar, "
              "dar ventajas, imponer desventajas o condiciones que no causan daño y ayudar a otros a actuar. Ayudar a aliados que sí hacen daño "
              "está permitido. Se aplica mientras tengas al menos un nivel de Adaptado, también en multiclase.",
              efectos=[{"type": "habilita", "value": "inhibicion"}]),
        block("Esencia Adaptativa", "La biomasa que puedes reconfigurar antes de descansar. Tienes los puntos de Esencia de la tabla; los recuperas todos con un "
              "descanso largo y, con uno corto, tu modificador de Sabiduría (mínimo 1). La gastas en hechizos (coste = nivel del hechizo), en la Ruleta "
              "y en volver a manifestar invocaciones caídas.",
              efectos=[{"type": "recurso", "id": "esencia", "nombre": "Esencia Adaptativa", "max": {"tabla": "Esencia"}, "corto": {"atributo": "sabiduria"}}]),
        block("Toque Estabilizador", "Como acción, tocas a una criatura: si está a 0 PG, se estabiliza sin tirada; si no, recupera 1d8 + tu modificador de "
              "Sabiduría PG. Usos gratuitos: tu modificador de Sabiduría (mínimo 1) por descanso largo; los siguientes cuestan 1 de Esencia cada uno.",
              efectos=[{"type": "recurso", "id": "toque-estabilizador", "nombre": "Toque Estabilizador (gratis)", "max": {"atributo": "sabiduria", "minimo": 1}}]),
        block("Hechizos", "Lanzas hechizos con Sabiduría (CD = 8 + tu bonificador de competencia + tu modificador de Sabiduría). No tienes espacios de conjuro: "
              "cada hechizo cuesta tantos puntos de Esencia como su nivel (los trucos no cuestan). Los eliges en la pestaña <b>Conjuros</b>, de la lista del "
              "Adaptado (marca «Sólo de mis clases»): trucos y hechizos conocidos según tu tabla, hasta el nivel máximo que indica. Ninguno hace daño. "
              "Al subir de nivel puedes cambiar uno."),
        block("Injerto Sram", "Si no eres un Experimento 043, tus invocaciones salen de un injerto de biomasa Sram que recibiste al tomar esta clase. Tienes todo "
              "lo de la clase, pero no un Sujeto de origen (eso es de la raza).",
              efectos=[{"type": "habilita", "value": "invocaciones_ink"}]),
    ],
    2: [
        block("Desplazamiento", "Como acción adicional, dejas un rastro de biomasa de 15 × 5 pies sobre una superficie sólida contigua (suelo, pared o techo). "
              "Hasta el final de tu turno te mueves por él sin gastar velocidad ni provocar ataques de oportunidad. No sirve en el aire ni si tu velocidad es 0. "
              "Usos: tu modificador de Constitución (mínimo 1) por descanso largo.",
              efectos=[{"type": "recurso", "id": "desplazamiento", "nombre": "Desplazamiento", "max": {"atributo": "constitucion", "minimo": 1}}]),
        block("Desecho biológico", "Cuando manifiestas una invocación que no sea tu Sujeto o la Ruleta, o cuando una cae a 0 PG, queda un Desecho de 5 pies a su lado: "
              "terreno difícil, CA 10, 1 PG. Se disuelve al final de tu siguiente turno, si se aleja más de 30 pies de su invocación o de ti, o al terminar el combate. "
              "Con una acción adicional (o la acción de una invocación) puedes gestionarlo:<br>• <b>Reabsorber:</b> recuperas 1 de Esencia (una vez por turno).<br>"
              "• <b>Contener:</b> el Golem lo absorbe y gana 1d6 PG temporales.<br>• <b>Moldear</b> (1 minuto): barricada (cobertura media), charco adhesivo "
              "(terreno difícil; salvación de Destreza o apresado hasta el final de su siguiente turno) o puente o asidero.<br>Si lo ignoras un turno entero, "
              "se <b>descontrola</b>: se extiende y deja terreno difícil en un cuadrado de 10 pies hasta el final del combate. Nunca hace daño."),
    ],
    3: [
        block("Repertorio de invocaciones", "Las vidas que llevas dentro aprenden a salir. Eliges tres invocaciones del repertorio; cada una hace cosas distintas. "
              "Se manifiestan con una acción (salvo que su bloque diga otra cosa) y, si caen a 0 PG, vuelven a ti sin hacerte daño; no pueden volver a "
              "manifestarse hasta un descanso corto o gastando 2 de Esencia. <b>Capacidad de Manifestación:</b> cuántas pueden estar fuera a la vez "
              "(columna «Invocaciones fuera»); tu Sujeto y la Ruleta no cuentan. Sus estadísticas están en Criaturas → Añadir criatura → De un catálogo.",
              efectos=[{"type": "bono", "target": "invocaciones", "desdeTabla": "Invocaciones fuera"}],
              elegir={"lista": "repertorio", "cantidad": 3}),
        block("Contratista", "Fuera de combate puedes contratar a criaturas con Inteligencia 4 o más que puedan comunicarse contigo y estén dispuestas a negociar "
              "(guías, artesanos, guardias, mercenarios…; las poderosas o legendarias sólo si el DM lo permite). El precio depende del riesgo. Los contratistas "
              "<b>obedecen tus órdenes</b> mientras dure el contrato. Puedes mantener tantos contratos como tu bonificador de competencia.<br>"
              "<b>Cuadrilla.</b> Al empezar un combate, todos tus contratistas se unifican en una sola entidad con un turno y una acción. Usa las estadísticas "
              "del más fuerte, cuyo FR no puede pasar de la mitad de tu nivel (mínimo 1/8). Cada contratista extra suma 5 PG y un talento de su oficio "
              "(guardia +1 CA, guía +10 pies de velocidad, curandero una curación de 1d8 por combate, explorador +5 a la Percepción pasiva…). La diriges tú. "
              "A 0 PG se dispersa: huyen heridos y pierdes sus servicios hasta renegociar. La Inhibición no se aplica a la Cuadrilla (son seres "
              "independientes), y no cuenta como invocación ni se beneficia de tus invocaciones."),
    ],
    5: [
        block("La Cura elemental", "Un elemento se funde con tu biomasa: no es una cura del todo, pero te cambia. Se forma tu rostro, ves tu cara por primera vez y "
              "ganas las habilidades de tu elemento (tu subclase). <b>Habla con tu DM</b> para saber cómo y cuándo la consigues en la historia: normalmente "
              "llega a nivel 5. <b>Sin la Cura no puedes usar los rasgos de Adaptado de nivel 6 o más.</b>"),
        block("Simbiosis", "Con la Cura aprendes a fundirte con otros, como un simbionte. Como acción adicional te fundes con un aliado voluntario adyacente durante "
              "1 minuto o hasta que te separes (acción adicional). Ocupas su espacio y te mueves con él; no puedes ser objetivo de ataques ni efectos (vas dentro "
              "de su piel) y el aliado gana +1 a la CA y la Simbiosis de tu elemento. Puedes lanzar hechizos y usar tus invocaciones, pero no moverte por tu "
              "cuenta. Si el aliado cae a 0 PG, te separas en un espacio adyacente. Usos: tu bonificador de competencia por descanso largo.",
              efectos=[{"type": "recurso", "id": "simbiosis", "nombre": "Simbiosis", "max": {"bc": True}}]),
        block("Conducto", "Tus rasgos y hechizos de toque pueden salir desde cualquiera de tus invocaciones manifestadas a 60 pies de ti."),
    ],
    7: [block("Mejora del Repertorio", "Tus invocaciones mejoran (ver «Mejora (nivel 7)» en sus estadísticas) y puedes cambiar una de las que conoces por otra del repertorio.",
              elegir={"lista": "repertorio", "cantidad": 0, "reemplazar": 1})],
    9: [block("Instinto Preeminente", "Tienes ventaja en las tiradas de iniciativa y no puedes ser sorprendido mientras estés consciente.")],
    11: [
        block("Mejora del Repertorio", "Tus invocaciones mejoran otra vez (nivel 11) y puedes cambiar una de las que conoces.",
              elegir={"lista": "repertorio", "cantidad": 0, "reemplazar": 1}),
        block("Reflejo Táctico", "Cuando manifiestas una invocación, un aliado que puedas ver puede usar su reacción para moverse la mitad de su velocidad sin provocar ataques de oportunidad."),
    ],
    13: [block("Escudo de Biomasa", "Como reacción, cuando un aliado a 30 pies hace una tirada de salvación, gastas 1 de Esencia y la hace con ventaja.")],
    15: [
        block("Mejora del Repertorio", "Tus invocaciones mejoran por última vez (nivel 15) y puedes cambiar una de las que conoces.",
              elegir={"lista": "repertorio", "cantidad": 0, "reemplazar": 1}),
        block("Biomasa Resiliente", "Tus invocaciones tienen resistencia a todo el daño salvo el de fuerza."),
    ],
    17: [block("Sincronía de Invocaciones", "Una vez por ronda, una de tus invocaciones puede usar su acción como reacción.")],
    18: [block("Biomasa Inagotable", "Una vez por descanso largo, al tirar iniciativa, recuperas 4 puntos de Esencia.",
               efectos=[{"type": "recurso", "id": "biomasa-inagotable", "nombre": "Biomasa Inagotable", "max": {"valor": 1}}])],
    20: [block("Núcleo", "Una vez por descanso largo, como acción, manifiestas todas tus invocaciones sin coste y sin límite de capacidad durante 1 minuto. "
               "Mientras dure, tú y tus aliados a 30 pies no podéis bajar de 1 PG por un único ataque o efecto.",
               efectos=[{"type": "recurso", "id": "nucleo", "nombre": "Núcleo", "max": {"valor": 1}}])],
}


def build_class():
    niveles = {}
    prev_cube = None
    names = ["blockUno", "blockDos", "blockTres", "blockCuatro", "blockCinco", "blockSeis"]
    for lv in range(1, 21):
        n = {}
        if lv == 1:
            n["descripcion"] = "Soporte biológico experimental: saca de su cuerpo las vidas que lleva dentro para proteger, rescatar y desordenar el combate, sin herir jamás a nadie."
            n["descripcionLarga"] = ("El Adaptado es cómo un Experimento 043 entrena su biología maleable hasta convertirla en un kit de soporte, control y supervivencia. "
                                     "No es la clase que más daño hace: no hace ninguno. Es la clase que hace que el resto del grupo rinda más. Cada turno decides a quién "
                                     "proteges, qué invocación sale y dónde, si te expones para salvar a otro o si arriesgas la Ruleta. Se recomienda para el "
                                     "Experimento 043, pero cualquier raza puede tomarla.")
            n["atributoInicial"] = ("Atributos de clase:\n❖ Tiradas de Salvación: Sabiduría y Carisma.\n❖ Puntos de golpe:\n    :: Dado de golpe: 1d8.\n"
                                    "    :: Nivel 1: 8 + tu modificador de Constitución.\n    :: Niveles siguientes: 1d8 (o 5) + tu modificador de Constitución por nivel.\n"
                                    "❖ Competencias:\n    :: Armadura: Armadura ligera y escudos.\n    :: Armas: Ninguna (Inhibición).\n"
                                    "    :: Herramientas: una herramienta de artesano o un kit de herbolario.\n"
                                    "    :: Habilidades: escoge dos entre Perspicacia, Persuasión, Medicina, Investigación, Engaño, Naturaleza y Trato con Animales.\n"
                                    "❖ Fuente: Agarias.")
        cube = {"columnas": ["Esencia", "Hechizos conocidos", "Nivel máx. de hechizo", "Invocaciones fuera"],
                "filas": [[str(ESENCIA[lv - 1]), str(KNOWN[lv - 1]), f"{NIVEL_MAXIMO[lv - 1]}.º", CAPACITY(lv)]]}
        if lv == 1 or cube["filas"] != prev_cube:
            n["infoCubo"] = cube
        prev_cube = cube["filas"]
        blocks = {names[i]: b for i, b in enumerate(FEATURES.get(lv, []))}
        if blocks:
            n["infoBlock"] = blocks
        niveles[str(lv)] = n
    niveles["5"]["subClase"] = build_elements()

    return {
        "nombre": "Adaptado",
        "claseName": CLASS,
        "seccion": "agarias",
        "icono": "🫧",
        "fuenteReglas": "Agarias (diseño del autor, revisado el 20-nov-2026)",
        "razaRecomendada": [race_key(s) for s in SUJETOS.values()],
        "dadoDeGolpe": 8,
        "nivelesDeAumento": [4, 8, 12, 16, 19],
        "conjurador": True,
        "attribute": "sabiduria",
        "lanzamiento": {"progression": "puntos", "puntos": "Esencia", "nivelMaximo": NIVEL_MAXIMO, "cantripsKnown": CANTRIPS_KNOWN, "spellsKnown": KNOWN},
        "listaConjuros": OFFICIAL_CANTRIPS + [s["nombre"] for s in TRUCOS + HECHIZOS],
        "subclaseNombre": "Cura elemental",
        "cdClase": {"nombre": "CD de clase (Adaptado)", "atributos": ["sabiduria"]},
        "competencias": {
            "salvaciones": ["sabiduria", "carisma"],
            "armaduras": ["Armadura ligera", "Escudos"],
            "armas": [],
            "herramientas": [],
            "habilidades": {"elegir": 2, "de": ["Perspicacia", "Persuasión", "Medicina", "Investigación", "Engaño", "Naturaleza", "Trato con Animales"]},
            "notaArmadura": "Sin armas: la Inhibición impide causar daño.",
        },
        "competenciasMulticlase": {"armaduras": ["Armadura ligera"], "armas": [], "herramientas": [], "habilidades": None},
        "equipoInicial": ["Armadura de cuero.", "Un escudo.", "Un kit de herbolario o una herramienta de artesano.", "Un paquete de diplomático o de explorador."],
        "oroInicial": "4d4 × 10",
        "listasDeEleccion": {"repertorio": repertoire_list()},
        "niveles": niveles,
    }


def main():
    races = load(DATA / "races.json")
    for k in OLD_KEYS:
        races.pop(k, None)
    for k in [k for k in races if k.startswith(BASE)]:
        races.pop(k)
    for s_id, s in SUJETOS.items():
        races[race_key(s)] = race_entry(s_id, s)
    save(DATA / "races.json", races)

    catalog = load(DATA / "race-catalog.json")
    group = next(g for g in catalog if g["source"] == GROUP)
    group["races"] = [r for r in group["races"] if r not in OLD_KEYS and not r.startswith(BASE)] + [race_key(s) for s in SUJETOS.values()]
    save(DATA / "race-catalog.json", catalog)

    lore = load(DATA / "race-lore.json")
    lore.pop("ink", None)
    lore[LINAJE] = LORE
    save(DATA / "race-lore.json", lore)

    cc = load(DATA / "class-creatures.json")
    cc["grupos"]["sujetos"] = {"nombre": "Sujeto de origen", "fuente": "Sujeto de origen (Experimento 043)", "porRaza": True,
                               "criaturas": {k: sujeto_creature(k, s, race_key(s)) for k, s in SUJETOS.items()}}
    cc["grupos"]["ink"] = {"nombre": "Repertorio del Adaptado", "fuente": "Invocación del Adaptado", "criaturas": CREATURES}
    save(DATA / "class-creatures.json", cc)

    spells = load(DATA / "spells.json")
    for s in TRUCOS + HECHIZOS:
        spells[s["nombre"]] = s["entry"]
    save(DATA / "spells.json", spells)

    save(DATA / "classes" / f"{CLASS}.json", build_class())
    print(f"ok: {len(SUJETOS)} Sujetos, {len(CREATURES)} invocaciones, {len(TRUCOS) + len(HECHIZOS)} hechizos, {len(ELEMENTOS)} Curas")


if __name__ == "__main__":
    main()
