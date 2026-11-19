#!/usr/bin/env python3
"""Razas de Agarias Pt. V: Aliens (AgSt 1.31).

Añade (o actualiza, es idempotente) en frontend/src/data:
  * races.json         las razas alienígenas y sus subrazas;
  * race-catalog.json  el grupo «Razas de Agarias Pt. V: Aliens»;
  * race-lore.json     la historia de cada linaje (la comparten sus subrazas).

Decisiones del autor (18-nov-2026), en resumen:
  * Son especies recién descubiertas y minoritarias; unas vienen de otros
    planetas, otras de otros planos y otras ya estaban en el mundo. El lore
    habla de Agarias, nunca de una campaña concreta (como Lord 100).
  * Neutrales salvo los Vhorr (≈ 80 % hostiles). La magia funciona igual.
  * Nombres propios para no usar propiedad intelectual ajena: Varkai
    («Predator»), Vhorr («Xenomorfos»), Sembradores («Ingenieros»). Los
    Sembradores crearon a los Vhorr, los Micelianos y los Crystali. Los Sram
    son otra raza creadora (no se toca aquí).
  * Su tecnología es EQUIPO (Tienda), no un rasgo racial.
  * Umbrael, dios del Vacío absoluto, forma la trifecta con Bahamut y Tiamat
    (hermanos). Grhagur Bael fue el primer Dracónido del Vacío (sin clan).
    Grhagur Enyeon Enerson (apellido, nombre, clan) fue profeta, inició la
    clase Shadow Knight y devoró a la Sombra Primordial.

Equilibrio: +2/+1 de atributos; un único rasgo «fuerte» y con usos
limitados; vuelo sólo en formato Aarakocra; sin tamaño Grande; sólo
resistencias (nunca inmunidades importantes).

Uso: python3 tools/aliens_agarias.py
"""
from __future__ import annotations

import json
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "frontend" / "src" / "data"
GROUP = "Razas de Agarias Pt. V: Aliens"
ALL = ["fuerza", "destreza", "constitucion", "inteligencia", "sabiduria", "carisma"]

DARKVISION = ("♻ Visión en la Oscuridad. Puedes ver con luz tenue a 60 pies (12 casillas) o menos de ti como si hubiera luz "
              "brillante, y en la oscuridad como si hubiera luz tenue. En la oscuridad solo distingues tonos de gris.")


def info(*traits: str) -> str:
    return "Rasgos de Raza:\n" + "\n".join(traits)


def race(**kw):
    base = {"velocidad": 30}
    base.update(kw)
    return base


# ── Varkai (cazadores) ─────────────────────────────────────────────────────

VARKAI_BASE = [
    "♻ Tipo y tamaño. Eres un humanoide Mediano (entre 2 y 2,3 m de altura).",
    DARKVISION,
    "♻ Rastreador nato. Eres competente en Supervivencia y tienes ventaja en las pruebas de Sabiduría (Supervivencia) para seguir un rastro.",
    "♻ Marca de la presa. Como acción adicional, marcas a una criatura que puedas ver a 60 pies (12 casillas) o menos durante 1 minuto. "
    "Mientras dure, tienes ventaja en las pruebas de Sabiduría (Percepción) y (Supervivencia) para encontrarla, y una vez por turno, "
    "cuando la impactas con un ataque, le haces 1d4 de daño adicional del mismo tipo. La marca termina antes si marcas a otra criatura. "
    "Puedes usarla tantas veces como tu bonificador por competencia y recuperas los usos al terminar un descanso largo.",
    "♻ Código del cazador. Eres competente en Intimidación o en Sigilo (elige una al crear el personaje).",
    "♻ Tecnología de caza. Los Varkai no nacen con su tecnología: el camuflaje óptico, la lanza retráctil o el cañón de plasma son equipo "
    "que se gana, se compra o se hereda.",
]
VARKAI_CLANS = {
    "Varkai (Clan Colmillo)": ("Cazadores de cuerpo a cuerpo que sólo aceptan la presa que puede devolver el golpe.",
                               "♻ Clan Colmillo. Eres competente con las armas marciales cuerpo a cuerpo de una mano."),
    "Varkai (Clan Sombra)": ("Acechadores pacientes: la presa sólo los ve cuando ya es tarde.",
                             "♻ Clan Sombra. Mientras estés en luz tenue u oscuridad, puedes usar la acción de Esconderse como acción adicional. "
                             "Puedes hacerlo tantas veces como tu bonificador por competencia y recuperas los usos al terminar un descanso largo."),
    "Varkai (Clan Lejano)": ("Tiradores que abaten a su presa desde donde ella no puede verlos.",
                             "♻ Clan Lejano. Atacar a distancia larga con un arma a distancia no te impone desventaja."),
}

# ── Vhorr (Hijos de la Colmena) ────────────────────────────────────────────

VHORR_BASE = [
    "♻ Tipo y tamaño. Eres una monstruosidad Mediana.",
    "♻ Velocidad. Tienes una velocidad caminando de 35 pies y una velocidad trepando de 30 pies.",
    "♻ Exoesqueleto. Mientras no lleves armadura, tu CA es 13 + tu modificador de Destreza. Puedes usar escudo.",
    DARKVISION,
    "♻ Eco de la Colmena. Rompiste con la mente de la colmena, pero su eco aún te protege: tienes ventaja en las tiradas de salvación para no quedar hechizado.",
    "♻ Despierto. Sólo los Vhorr despiertos (uno de cada cinco, aproximadamente) pueden ser personajes. No todos tienen todas las capacidades "
    "de la especie: elige tu variante (Rastrero, Coleador o Ácido).",
    "♻ Sin descendencia compartida. No pueden tener hijos con otras especies.",
]
VHORR_VARIANTS = {
    "Vhorr Despierto (Rastrero)": ("Silencioso y paciente, se mueve por techos y conductos.",
                                   "♻ Rastrero. Tienes ventaja en las pruebas de Destreza (Sigilo) mientras estés en luz tenue u oscuridad."),
    "Vhorr Despierto (Coleador)": ("Su cola segmentada termina en una punta afilada.",
                                   "♻ Cola. Tu cola es un arma natural con la que puedes hacer ataques sin armas: alcance 10 pies (2 casillas) y, "
                                   "si impacta, 1d6 + tu modificador de Fuerza o Destreza de daño perforante (en lugar del daño normal de un ataque sin armas)."),
    "Vhorr Despierto (Ácido)": ("Su sangre corroe el metal y la carne.",
                                "♻ Sangre ácida. Cuando una criatura a 5 pies (1 casilla) o menos te impacta con un ataque cuerpo a cuerpo, puedes usar tu "
                                "reacción para salpicarla: recibe 1d6 de daño de ácido (2d6 en nivel 5, 3d6 en nivel 11 y 4d6 en nivel 17). Puedes hacerlo "
                                "tantas veces como tu bonificador por competencia y recuperas los usos al terminar un descanso largo."),
}

# ── Sembradores ────────────────────────────────────────────────────────────

SEMBRADOR_BASE = [
    "♻ Tipo y tamaño. Eres un humanoide Mediano, aunque muy alto (de 2,4 a 2,8 m).",
    "♻ Constitución Poderosa. Cuentas como una talla mayor para determinar tu capacidad de carga y el peso que puedes empujar, arrastrar o levantar.",
    "♻ Aguante de los Primeros. Cuando recibes daño, puedes usar tu reacción para reducirlo en 1d12 + tu modificador de Constitución. "
    "Puedes hacerlo tantas veces como tu bonificador por competencia y recuperas los usos al terminar un descanso largo.",
    "♻ Saber del Escultor. Eres competente con un tipo de herramientas de artesano de tu elección y en Medicina o en Arcanos (elige una).",
    "♻ Presencia antigua. Tienes ventaja en las pruebas de Inteligencia (Historia) sobre civilizaciones antiguas, ruinas y razas creadas por otras.",
]
SEMBRADOR_SUBRACES = {
    "Sembrador del Alba": ("Eruditos que todavía estudian lo que sus antepasados sembraron.",
                           "♻ Del Alba. Conoces un truco de la lista de conjuros del Mago. La Inteligencia es tu aptitud mágica para él."),
    "Sembrador de la Ceniza": ("Guerreros que guardan las ruinas de su civilización caída.",
                               "♻ De la Ceniza. Eres competente con las armas marciales cuerpo a cuerpo."),
}

# ── Thri-kreen (oficial) y Thri-kreen del Vacío (Agarias) ──────────────────

TK_COMMON = [
    "♻ Tipo y tamaño. Eres una monstruosidad Mediana o Pequeña (lo eliges al crear el personaje).",
    DARKVISION,
    "♻ Brazos secundarios. Tienes dos brazos secundarios, algo más pequeños, bajo los principales. Pueden manipular un objeto, abrir o "
    "cerrar una puerta o un recipiente, coger o dejar un objeto Diminuto, o empuñar un arma con la propiedad ligera.",
    "♻ Sin sueño. No necesitas dormir y puedes permanecer consciente durante un descanso largo, aunque debes evitar la actividad intensa para obtener sus beneficios.",
    "♻ Telepatía thri-kreen. Sin ayuda de la magia no puedes hablar los idiomas que no son thri-kreen, así que transmites tus pensamientos: "
    "puedes comunicarte mentalmente con criaturas voluntarias a 120 pies (24 casillas) o menos. No necesitan compartir un idioma contigo, "
    "pero deben entender al menos uno. El vínculo se rompe si os alejáis más de esa distancia, si alguno queda incapacitado o si cualquiera lo corta (sin acción).",
]
TK_OFFICIAL = TK_COMMON[:1] + [
    "♻ Caparazón camaleónico. Mientras no lleves armadura, tu CA es 13 + tu modificador de Destreza. Como acción, puedes cambiar el color de "
    "tu caparazón para imitar el de tu entorno, lo que te da ventaja en las pruebas de Destreza (Sigilo) para esconderte en él.",
] + TK_COMMON[1:]
TK_VOID = TK_COMMON[:1] + [
    "♻ Caparazón de penumbra. Mientras no lleves armadura, tu CA es 13 + tu modificador de Destreza. Tu caparazón oscuro, pulido por la noche "
    "lunar, te da ventaja en las pruebas de Destreza (Sigilo) para esconderte en luz tenue u oscuridad.",
] + TK_COMMON[1:] + [
    "♻ Aliento contenido. Puedes aguantar la respiración hasta 1 hora.",
    "♻ Salto lunar. Criado en la gravedad baja de la Luna, la distancia de tus saltos (de longitud y de altura) se triplica.",
]
TK_GUARDS = {
    "Thri-kreen del Vacío (Guardia del Osario)": ("Vigilan los osarios lunares donde descansan los primeros Dracónidos del Vacío.",
                                                 "♻ Guardia del Osario. Eres competente en Percepción."),
    "Thri-kreen del Vacío (Guardia de Senda)": ("Guían y protegen a los viajeros entre la Luna y Agarias.",
                                               "♻ Guardia de Senda. Tu velocidad caminando aumenta en 5 pies."),
}

# ── Medusoides ─────────────────────────────────────────────────────────────

MEDUSOIDE_BASE = [
    "♻ Tipo y tamaño. Eres una aberración Mediana.",
    "♻ Flotación. Siempre flotas unos centímetros por encima del suelo: ignoras el terreno difícil formado por barro, hielo, arena o agua poco profunda. No es vuelo.",
    "♻ Planeo elevado. No sufres daño por caída. Al caer, puedes avanzar 2 pies en horizontal por cada pie que desciendes (no puedes ganar altura).",
    "♻ Doble respiración. Puedes respirar aire y agua.",
    "♻ Descarga. Conoces el truco Agarre electrizante. La Sabiduría es tu aptitud mágica para él.",
    "♻ Bioluminiscencia. Como acción adicional, emites luz brillante en un radio de 10 pies y luz tenue 10 pies más allá, o la apagas.",
    "♻ Lenguaje cromático. Hablas con colores y patrones de luz; para tu especie, hablar con sonidos es una forma muy primitiva de comunicación. "
    "Entiendes los idiomas hablados que conoces, pero no los pronuncias: cualquier criatura que pueda verte a 60 pies (12 casillas) o menos y "
    "entienda al menos un idioma comprende lo que le transmites. Los componentes verbales de tus conjuros son destellos rítmicos de luz.",
]
MEDUSOIDE_SUB = {
    "Medusoide (Abisal)": ("De las profundidades de su océano natal: sus colores son fríos y lentos.",
                           "♻ Abisal. Tienes una velocidad nadando de 30 pies."),
    "Medusoide (Celeste)": ("De las capas altas de su atmósfera: sus colores son vivos y rápidos.",
                            "♻ Celeste. Tu planeo avanza 4 pies en horizontal por cada pie que desciendes."),
}

# ── Micelianos ─────────────────────────────────────────────────────────────

MICELIANO_BASE = [
    "♻ Tipo y tamaño. Eres un humanoide (planta) Pequeño o Mediano (lo eliges al crear el personaje).",
    "♻ Cuerpo fúngico. Tienes resistencia al daño de veneno y ventaja en las tiradas de salvación para no quedar envenenado.",
    "♻ Nube de esporas. Como acción, liberas esporas en un radio de 10 pies (2 casillas) a tu alrededor. Cada criatura de tu elección en el "
    "área debe superar una tirada de salvación de Constitución (CD 8 + tu modificador de Constitución + tu bonificador por competencia) o quedar "
    "envenenada hasta el final de tu siguiente turno. Puedes hacerlo tantas veces como tu bonificador por competencia y recuperas los usos al "
    "terminar un descanso largo.",
    "♻ Red micelial. Puedes conversar telepáticamente con una criatura a 30 pies (6 casillas) o menos que entienda al menos un idioma.",
    "♻ Memoria Micelial. Eres un fragmento de la colonia, que guarda pedazos de los que murieron. Al terminar un descanso largo, tira 1d6: con 5 "
    "o 6 recuperas un fragmento de memoria y eliges una competencia con un arma, una herramienta o una habilidad que tendrás hasta tu siguiente descanso largo.",
    "♻ Último superviviente. Cuando un ataque o efecto que no afecta a un área te deja a 0 puntos de golpe sin matarte en el acto, quedas a 1 punto "
    "de golpe. No puedes volver a usar este rasgo hasta que termines un descanso largo.",
]
MICELIANO_SUB = {
    "Miceliano (Colonia de las Profundidades)": ("Colonias de cuevas y bosques sin sol.", DARKVISION.replace("♻ Visión en la Oscuridad", "♻ Colonia de las Profundidades. Visión en la Oscuridad")),
    "Miceliano (Colonia Errante)": ("Esporas que viajan con el viento y germinan lejos de casa.",
                                   "♻ Colonia Errante. Tu velocidad caminando aumenta en 5 pies."),
}

# ── Cthulhianos ────────────────────────────────────────────────────────────

CTHULHIANO_BASE = [
    "♻ Tipo y tamaño. Eres un humanoide Mediano.",
    "♻ Ojos múltiples. Tus varios ojos te dan visión en la oscuridad a 60 pies (12 casillas) y eres competente en Percepción.",
    "♻ Telepatía limitada. Puedes conversar mentalmente, sin hablar, con una criatura a 30 pies (6 casillas) o menos que entienda al menos un idioma. "
    "No sirve para leer mentes ni para imponer nada: sólo para conversar.",
    "♻ Tentáculos. Los tentáculos simples de tu cabeza te dan ventaja en las pruebas para mantener una presa y para que no te quiten un objeto que sujetas.",
    "♻ Sin magia innata. A diferencia de criaturas parecidas, tu especie no tiene magia propia: si usas magia, la aprendiste como cualquier otro.",
]
CTHULHIANO_SUB = {
    "Cthulhiano (Sideral)": ("Nómadas del espacio, con alas membranosas.",
                             "♻ Alas. Tienes una velocidad volando de 30 pies. Para usarla no puedes llevar armadura media ni pesada."),
    "Cthulhiano (Oceánico)": ("Nómadas de los océanos, sin alas.",
                              "♻ Oceánico. Tienes una velocidad nadando de 30 pies y puedes respirar aire y agua."),
}

# ── Crystali ───────────────────────────────────────────────────────────────

CRYSTALI = [
    "♻ Tipo y tamaño. Eres un humanoide Mediano.",
    "♻ Cuerpo cristalino. Tienes resistencia al daño radiante, pero vulnerabilidad al daño de trueno.",
    "♻ Refracción. Cuando lanzas un conjuro que hace daño radiante, puedes sumar tu bonificador por competencia a una de sus tiradas de daño. "
    "Puedes hacerlo tantas veces como tu bonificador por competencia y recuperas los usos al terminar un descanso largo.",
    "♻ Resonancia. Puedes comunicarte mediante vibraciones con criaturas que estén tocando la misma superficie sólida que tú a 30 pies (6 casillas) "
    "o menos y entiendan al menos un idioma.",
    "♻ Memoria cristalina. Tus cristales guardan lo que viviste: tienes ventaja en las pruebas de Inteligencia (Historia) sobre hechos que presenciaste.",
    "♻ Ramas de color. Tu color (transparente, blanco, negro u otro) indica tu rama familiar y tu cultura; no cambia tus rasgos.",
]

# ── Dracónidos del Vacío y Selenkos ────────────────────────────────────────

ANCLAJE = ("♻ Anclaje gravitatorio. Umbrael preparó a sus hijos para cualquier gravedad: tienes ventaja en las tiradas de salvación para no ser "
           "empujado, atraído o derribado, y la gravedad alta o baja no te afecta.")
DESPLAZAMIENTO = (" El arrastre no es un agujero negro: el Vacío desplaza el aire y la materia, y cuando se mueve, lo desplazado quiere "
                  "volver a donde estaba; por eso es atraído hacia el centro.")


def races_data():
    out = {}
    lore_of = {}

    def add(name, linaje, entry):
        out[name] = entry
        lore_of[name] = linaje

    for name, (desc, trait) in VARKAI_CLANS.items():
        add(name, "varkai", race(choice={"count": 1, "bonus": 2, "allowedChoices": ["fuerza", "destreza"]}, sabiduria=1,
                                 lenguage="Idioma: Puedes leer, escribir y hablar Común y Varkai", yaHabla=["Común", "Varkai"],
                                 efectos=[{"type": "competencia", "kind": "habilidad", "value": "Supervivencia"}],
                                 descripcion=desc, info=info(*VARKAI_BASE, trait), linaje="varkai", tipo="Humanoide",
                                 tamano="Mediano", origen="Un planeta selvático de dos soles"))
    for name, (desc, trait) in VHORR_VARIANTS.items():
        add(name, "vhorr", race(velocidad=35, climb=30, destreza=2, constitucion=1,
                                lenguage="Idioma: Entiendes el Común y lo hablas con dificultad; también el lenguaje químico de la Colmena",
                                yaHabla=["Común", "Colmena"], descripcion=desc, info=info(*VHORR_BASE, trait), linaje="vhorr",
                                tipo="Monstruosidad", tamano="Mediano", origen="Bioarma de los Sembradores"))
    for name, (desc, trait) in SEMBRADOR_SUBRACES.items():
        add(name, "sembradores", race(fuerza=2, inteligencia=1, lenguage="Idioma: Puedes leer, escribir y hablar Común y Primigenio",
                                      yaHabla=["Común", "Primigenio"], descripcion=desc, info=info(*SEMBRADOR_BASE, trait),
                                      linaje="sembradores", tipo="Humanoide", tamano="Mediano", origen="Una civilización estelar extinta"))
    add("Thri-kreen", "thri-kreen", race(choices=[{"count": 1, "bonus": 2}, {"count": 1, "bonus": 1}],
                                         lenguage="Idioma: Hablas Thri-kreen; entiendes el Común y otro idioma, pero los transmites por telepatía",
                                         languageElection=1, yaHabla=["Común", "Thri-kreen"],
                                         descripcion="Insectoides de cuatro brazos y caparazón cambiante (regla oficial de Spelljammer).",
                                         info=info(*TK_OFFICIAL), linaje="thri-kreen", tipo="Monstruosidad", tamano="Pequeño o Mediano",
                                         origen="El mar astral y otros mundos"))
    for name, (desc, trait) in TK_GUARDS.items():
        add(name, "thri-kreen", race(choices=[{"count": 1, "bonus": 2}, {"count": 1, "bonus": 1}],
                                     lenguage="Idioma: Hablas Thri-kreen; entiendes el Común y el Habla del Vacío, pero los transmites por telepatía",
                                     yaHabla=["Común", "Thri-kreen", "Habla del Vacío"], descripcion=desc,
                                     info=info(*TK_VOID, trait), linaje="thri-kreen", tipo="Monstruosidad", tamano="Pequeño o Mediano",
                                     origen="La Luna (lado oscuro)"))
    for name, (desc, trait) in MEDUSOIDE_SUB.items():
        extra = {"swim": 30} if "Abisal" in name else {}
        add(name, "medusoides", race(sabiduria=2, constitucion=1, **extra,
                                     lenguage="Idioma: Entiendes el Común y el Cromático; te expresas con luz y color",
                                     yaHabla=["Común", "Cromático"], descripcion=desc, info=info(*MEDUSOIDE_BASE, trait),
                                     linaje="medusoides", tipo="Aberración", tamano="Mediano", origen="Un planeta oceánico de nubes densas"))
    for name, (desc, trait) in MICELIANO_SUB.items():
        extra = {"velocidad": 35} if "Errante" in name else {}
        add(name, "micelianos", race(**({"velocidad": 30} | extra), constitucion=2,
                                     choice={"count": 1, "bonus": 1, "allowedChoices": ["inteligencia", "sabiduria"]},
                                     lenguage="Idioma: Puedes leer, escribir y hablar Común y comunicarte por la Red micelial",
                                     yaHabla=["Común"], languageElection=1,
                                     efectos=[{"type": "resistencia", "value": "veneno"}],
                                     descripcion=desc, info=info(*MICELIANO_BASE, trait), linaje="micelianos",
                                     tipo="Humanoide (planta)", tamano="Pequeño o Mediano", origen="Jardín de los Sembradores"))
    for name, (desc, trait) in CTHULHIANO_SUB.items():
        extra = {"fly": 30} if "Sideral" in name else {"swim": 30}
        add(name, "cthulhianos", race(inteligencia=2, constitucion=1, **extra,
                                      lenguage="Idioma: Puedes leer, escribir y hablar Común y Abisal profundo",
                                      yaHabla=["Común", "Abisal profundo"],
                                      efectos=[{"type": "competencia", "kind": "habilidad", "value": "Percepción"}],
                                      descripcion=desc, info=info(*CTHULHIANO_BASE, trait), linaje="cthulhianos",
                                      tipo="Humanoide", tamano="Mediano", origen="Los océanos y el espacio (nómadas)"))
    add("Crystali", "crystali", race(constitucion=2, sabiduria=1, lenguage="Idioma: Puedes leer, escribir y hablar Común y Resonante",
                                     yaHabla=["Común", "Resonante"],
                                     efectos=[{"type": "resistencia", "value": "radiante"}, {"type": "vulnerabilidad", "value": "trueno"}],
                                     descripcion="Seres de cristal vivo: archivos andantes de lo que han visto.",
                                     info=info(*CRYSTALI), linaje="crystali", tipo="Humanoide", tamano="Mediano",
                                     origen="Archivos vivientes de los Sembradores"))
    # Selenkos: kobolds de mecánica idéntica a los de Monstruos del Multiverso, con otra cultura.
    add("Selenko (Kobold del Vacío)", "selenkos", race(choices=[{"count": 1, "bonus": 2}, {"count": 1, "bonus": 1}],
        lenguage="Idioma: Puedes leer, escribir y hablar Común y Habla del Vacío", languageElection=0,
        yaHabla=["Común", "Habla del Vacío"],
        doteOpciones=["Legado Kobold: Astucia", "Legado Kobold: Desafiante", "Legado Kobold: Hechicería Dracónica"],
        descripcion="Kobolds de escamas violáceas, sirvientes naturales de los Dracónidos del Vacío.",
        info=info(
            "♻ Tipo y tamaño. Eres un humanoide Pequeño.",
            "♻ Grito Dracónico. Como acción adicional, lanzas un grito a tus enemigos a 10 pies (2 casillas) o menos de ti. Hasta el principio de tu "
            "siguiente turno, tus aliados y tú tenéis ventaja en las tiradas de ataque contra cualquiera de esos enemigos que haya podido oírte. Puedes "
            "usarlo tantas veces como tu bonificador por competencia y recuperas todos los usos al terminar un descanso largo.",
            "♻ Legado Kobold. Elige un legado en «Dote racial»: Astucia (Talento artesano), Desafiante (Tenacidad) o Hechicería Dracónica.",
            DARKVISION,
            "♻ Cultura selenka. Mecánicamente son kobolds como los de Monstruos del Multiverso; lo que cambia es su cultura (ver su historia)."),
        linaje="selenkos", tipo="Humanoide", tamano="Pequeño", origen="La Luna (lado oscuro)"))
    return out, lore_of


def lore_data():
    S = lambda titulo, texto: {"titulo": titulo, "texto": texto}
    return {
        "varkai": {
            "nombre": "Varkai, los Cazadores de las Estrellas",
            "resumen": "Una cultura de caza ritual y de honor que viaja entre mundos en busca de la presa digna.",
            "secciones": [
                S("Origen", "Los Varkai nacieron en un planeta selvático iluminado por dos soles, donde todo lo que vivía cazaba o era cazado. "
                  "Sus primeras ciudades no se levantaron para protegerse de los depredadores, sino para entrenarse contra ellos. Con el tiempo "
                  "dominaron su mundo y, cuando ya no quedó presa a su altura, miraron al cielo.\n\nDesde entonces viajan entre planetas en naves "
                  "pequeñas y silenciosas. No conquistan: cazan. Un mundo les interesa por lo que puede enseñarles una presa nueva, no por sus tierras."),
                S("Cultura y honor", "La vida de un Varkai se mide en trofeos, pero no en cualquier trofeo. Matar a un ser desarmado, a una cría o a "
                  "un enfermo es la mayor deshonra; abatir a una presa que podía haberte matado es la mayor gloria. Cada clan guarda su propio código, "
                  "y romperlo convierte al cazador en presa de los suyos.\n\nSu tecnología —camuflaje óptico, lanzas retráctiles, armas de energía— es "
                  "herencia de clan y prueba de mérito: un joven no la recibe al nacer, la gana en su primera gran cacería. Por eso un Varkai sin "
                  "equipo no es menos Varkai, sólo uno que aún no ha demostrado nada."),
                S("Clanes", "El Clan Colmillo busca el combate cuerpo a cuerpo; el Clan Sombra acecha durante días antes de dejarse ver; el Clan "
                  "Lejano abate a su presa desde donde ella no puede responder, y por eso los otros clanes lo miran con cierta desconfianza."),
                S("En Agarias", "Los Varkai son recién llegados y muy pocos. La mayoría caza en las regiones más salvajes y peligrosas "
                  "de Agarias, donde las bestias están a su altura. Son neutrales: con los mortales que respetan la caza se muestran corteses, incluso generosos; "
                  "con quien caza por placer o por crueldad, implacables. Algunos aventureros de Agarias se han ganado un trofeo de un Varkai como "
                  "señal de respeto, y lo llevan con orgullo."),
            ],
            "relacionadas": ["vhorr"],
        },
        "vhorr": {
            "nombre": "Vhorr, los Hijos de la Colmena",
            "resumen": "La bioarma de los Sembradores: una colmena hostil de la que sólo unos pocos han despertado.",
            "secciones": [
                S("Origen", "Los Sembradores crearon a los Vhorr como un arma viva: una especie que se adapta a cualquier mundo, se reproduce dentro "
                  "de la colmena y obedece a una única mente. Cuando su civilización cayó, el arma siguió funcionando sin nadie que la controlase. "
                  "Las colmenas se extendieron a los mundos donde los Sembradores habían sembrado vida, y allí donde llegan, devoran."),
                S("La Colmena", "Un Vhorr de la colmena no tiene nombre ni voluntad propia: siente lo que siente la reina, sigue el rastro químico "
                  "de sus hermanos y ataca lo que la colmena considera amenaza o alimento. Por eso la inmensa mayoría (unos ocho de cada diez) son "
                  "hostiles a todo lo demás. No pueden tener hijos con otras especies: sólo la colmena engendra Vhorr.\n\nNo todos los Vhorr tienen "
                  "todas las capacidades de la especie, igual que no todos los dracónidos tienen alas y cola: unos trepan y acechan, otros nacen con "
                  "una cola que es un arma y otros con una sangre que corroe el metal."),
                S("Los Despiertos", "A veces un Vhorr se separa de la colmena —por una herida, por la distancia, por algo que nadie entiende— y "
                  "despierta. De pronto el silencio dentro de su cabeza es suyo. Muchos enloquecen; otros aprenden a pensar por sí mismos, a hablar "
                  "con dificultad y a convivir con quienes antes habrían sido presa. Sólo los Despiertos pueden ser personajes.\n\nEl eco de la "
                  "colmena nunca desaparece del todo: los protege de los encantamientos, pero también les recuerda de dónde vienen."),
                S("En Agarias", "Las colmenas son raras y casi siempre están en lugares remotos y profundos de Agarias o en ruinas de los Sembradores. "
                  "Los Varkai las consideran la presa suprema. Un Vhorr Despierto será recibido con miedo en casi cualquier lugar, y tendrá que "
                  "demostrar una y otra vez que ya no pertenece a la colmena."),
            ],
            "relacionadas": ["sembradores", "varkai"],
        },
        "sembradores": {
            "nombre": "Sembradores, los Escultores de la Vida",
            "resumen": "Una civilización antigua que viajaba entre estrellas sembrando vida… y armas.",
            "secciones": [
                S("Origen", "Antes de que muchas especies supieran que existían otros mundos, los Sembradores ya viajaban entre ellos. Eran altos, "
                  "pálidos y pacientes, y su arte era la vida misma: tomaban un mundo yermo y lo llenaban de criaturas diseñadas por ellos. Algunas "
                  "razas que hoy caminan por Agarias no saben que fueron, en origen, uno de sus jardines."),
                S("Lo que crearon", "Entre sus obras más conocidas están los Micelianos, un jardín de memoria donde cada fragmento recuerda a los "
                  "demás; los Crystali, archivos vivientes que guardan lo que ven; y los Vhorr, el arma que crearon para limpiar mundos y que "
                  "terminó escapando de su control. Los Sram no son obra suya: son otra raza creadora, con su propia historia."),
                S("La caída", "Nadie sabe con certeza qué acabó con su civilización. Algunos dicen que fueron los Vhorr; otros, que los Sembradores "
                  "se dividieron entre los que querían seguir creando y los que querían deshacer lo creado. Hoy quedan muy pocos: los del Alba, "
                  "eruditos que estudian lo que sus antepasados sembraron, y los de la Ceniza, guerreros que custodian las ruinas."),
                S("En Agarias", "Los Sembradores que quedan son una minoría casi legendaria. Algunos viven apartados en lugares que pocos alcanzan; otros "
                  "recorren el mundo buscando sus antiguos jardines. Miran a las razas que crearon con una mezcla de orgullo y culpa, y muchas de "
                  "ellas no saben si agradecerles la vida o pedirles cuentas."),
            ],
            "relacionadas": ["vhorr", "micelianos", "crystali"],
        },
        "thri-kreen": {
            "nombre": "Thri-kreen",
            "resumen": "Insectoides de cuatro brazos que no duermen; en Agarias, algunos guardan la noche de la Luna.",
            "secciones": [
                S("Origen", "Los thri-kreen son insectoides de cuatro brazos y caparazón quitinoso que han llegado a muchos mundos viajando por el "
                  "mar astral. No duermen, hablan entre ellos con chasquidos y, con las demás especies, mediante telepatía. Su caparazón cambia de "
                  "color para confundirse con el entorno."),
                S("Los Guardias del Vacío", "En el lado oscuro de la Luna vive una rama propia de Agarias. Cuando Umbrael creó a los Dracónidos del "
                  "Vacío, la noche lunar era larga y peligrosa, y los thri-kreen, que no necesitan dormir, se convirtieron en sus guardianes "
                  "perfectos. Desde entonces su caparazón se oscureció hasta el morado de la penumbra, aprendieron a aguantar la respiración en la "
                  "nada y a saltar lejos en la gravedad baja.\n\nNo son siervos: son guardias por elección y por tradición. Unos vigilan los osarios "
                  "lunares donde descansan los primeros Dracónidos del Vacío; otros guían y protegen a quienes viajan entre la Luna y Agarias."),
                S("En Agarias", "Los thri-kreen son raros y la mayoría de la gente nunca ha visto uno. Los Guardias del Vacío bajan a Agarias "
                  "acompañando a los Dracónidos del Vacío o cumpliendo encargos de la Luna, y se les reconoce por el silencio con el que vigilan "
                  "mientras los demás duermen."),
            ],
            "relacionadas": ["draconido-vacio"],
        },
        "medusoides": {
            "nombre": "Medusoides",
            "resumen": "Criaturas flotantes que hablan con la luz y consideran el sonido una forma primitiva de comunicarse.",
            "secciones": [
                S("Origen", "Los Medusoides vienen de un planeta cubierto por un océano y por nubes tan densas que casi no se distingue dónde termina "
                  "uno y empieza el otro. Evolucionaron flotando entre ambos, por eso respiran aire y agua y nunca tocan del todo el suelo. Sus "
                  "cuerpos translúcidos acumulan electricidad, que usan para cazar y para defenderse."),
                S("Lenguaje cromático", "Para un Medusoide, hablar con sonidos es una forma extremadamente primitiva de comunicarse: lenta, pobre y "
                  "ruidosa. Ellos se expresan con cambios de color y patrones de luz que pueden transmitir varias ideas a la vez. Una conversación "
                  "entre Medusoides parece, a ojos ajenos, una danza de luces.\n\nEntienden los idiomas hablados, pero no los pronuncian: con las "
                  "demás especies se comunican con señales que cualquiera puede comprender si los ve. Algunos sienten cierta lástima por quienes "
                  "sólo pueden hablar con la boca."),
                S("Sociedad", "Los Abisales viven en las profundidades y sus colores son fríos y pausados; los Celestes, en las capas altas de la "
                  "atmósfera, y sus luces son vivas y rápidas. Ambos se consideran el mismo pueblo y se reúnen en grandes asambleas luminosas."),
                S("En Agarias", "Recién descubiertos y muy escasos, los Medusoides llegaron a Agarias por caminos que todavía no explican. Son "
                  "neutrales y curiosos; las ciudades costeras y los mares de Agarias son los únicos lugares donde se los ve con cierta frecuencia."),
            ],
        },
        "micelianos": {
            "nombre": "Micelianos, la Colonia que Recuerda",
            "resumen": "No son individuos aislados: cada uno es un fragmento de una colonia que conserva la memoria de sus muertos.",
            "secciones": [
                S("Origen", "Los Micelianos fueron un jardín de los Sembradores: una red de hongos diseñada para recordar. Bajo el suelo de su mundo "
                  "natal se extiende la colonia, y de ella brotan los cuerpos que caminan, piensan y viajan. Cada Miceliano es un fragmento de esa red, "
                  "con personalidad propia pero unido al resto por la Red micelial."),
                S("Memoria Micelial", "Cuando un Miceliano muere, la colonia puede absorber parte de sus recuerdos. No lo devuelve a la vida ni "
                  "guarda todo lo que fue: conserva fragmentos, y a veces otros Micelianos los recuperan al descansar —un oficio, una forma de "
                  "luchar, una habilidad aprendida por otro—.\n\nPor eso, para ellos, morir no significa necesariamente desaparecer. Un Miceliano "
                  "habla de sus muertos en presente, y sus funerales son devolver el cuerpo a la tierra para que la colonia lo recuerde."),
                S("Último superviviente", "Cada fragmento lleva dentro la voluntad de la colonia de no perder a nadie más. Ante un golpe que debería "
                  "acabar con él, un Miceliano se aferra a la vida aunque sea por un hilo; sólo lo que arrasa un área entera, como el fuego o una "
                  "explosión, puede llevárselo de una vez. Por eso temen el fuego más que a ningún enemigo."),
                S("En Agarias", "Las Colonias de las Profundidades crecen en cuevas y bosques sin sol; las Colonias Errantes viajan con el viento y "
                  "germinan lejos de casa. En Agarias son pocos, neutrales y discretos, y muchos buscan restos de los Sembradores para entender "
                  "para qué fueron creados."),
            ],
            "relacionadas": ["sembradores"],
        },
        "cthulhianos": {
            "nombre": "Cthulhianos, los Nómadas de lo Profundo",
            "resumen": "Una especie de aspecto cósmico y tentáculos que, en su cultura, es tan normal como cualquier otra.",
            "secciones": [
                S("Origen", "Los Cthulhianos tienen un aspecto que a muchas especies les resulta inquietante: tentáculos que nacen de la cabeza, "
                  "varios ojos y, en algunos, alas membranosas. Pero no son monstruos ni dioses dormidos: son un pueblo nómada que recorre los "
                  "océanos y el espacio desde hace generaciones, sin un mundo fijo al que llamar hogar."),
                S("Cultura", "A diferencia de otras criaturas con las que a veces se los confunde, los Cthulhianos no tienen magia propia ni dominan "
                  "mentes. Su telepatía sólo sirve para conversar sin hablar, algo tan natural para ellos como para otros mover los labios. Son "
                  "pacientes, observadores y muy dados a la conversación larga; sus tentáculos se mueven con lo que sienten, como las manos de "
                  "quien gesticula."),
                S("Siderales y Oceánicos", "Los Siderales viajan por el espacio con sus alas; los Oceánicos, sin ellas, recorren los mares nadando. "
                  "Ambos se consideran un solo pueblo y se encuentran en lugares de paso, donde intercambian noticias de mundos lejanos."),
                S("En Agarias", "Son recién descubiertos y escasos. La gente los mira con recelo por su aspecto, y muchos Cthulhianos han aprendido a "
                  "presentarse con una calma y una cortesía que desarman cualquier prejuicio. Son neutrales y suelen ofrecerse como guías, "
                  "intérpretes o navegantes."),
            ],
        },
        "crystali": {
            "nombre": "Crystali, los Archivos Vivientes",
            "resumen": "Seres de cristal que guardan en su cuerpo todo lo que han visto; su color marca su rama familiar.",
            "secciones": [
                S("Origen", "Los Sembradores crearon a los Crystali para que recordaran por ellos: cuerpos de cristal vivo capaces de guardar lo que "
                  "ven y de devolverlo intacto siglos después. Cuando sus creadores cayeron, los Crystali se quedaron con su memoria… y sin nadie que "
                  "les dijera qué hacer con ella."),
                S("Luz y resonancia", "Su cuerpo refracta la luz, y la magia luminosa se vuelve más intensa al atravesarlos. Entre ellos se comunican "
                  "por vibraciones que viajan a través de la roca y el suelo. Esa misma naturaleza los hace frágiles ante el sonido violento: un "
                  "trueno puede agrietarlos como a un cristal cualquiera."),
                S("Las ramas de color", "Un Crystali puede ser blanco, negro, de cualquier color o transparente. El color no da poderes: indica la rama "
                  "familiar a la que pertenece y, con ella, su cultura y su lugar en la sociedad. Los transparentes son los desahuciados: considerados "
                  "«vacíos» por los demás, sufren el racismo de su propia especie y muchos abandonan a los suyos para buscar su lugar entre otros pueblos."),
                S("En Agarias", "Son pocos y neutrales. Los eruditos de Agarias los buscan por lo que recuerdan, y no siempre con buenas intenciones; por "
                  "eso muchos Crystali eligen con cuidado qué cuentan y a quién."),
            ],
            "relacionadas": ["sembradores"],
        },
        "draconido-vacio": {
            "nombre": "Dracónidos del Vacío, los Hijos de Umbrael",
            "resumen": "Una rama dracónica nacida en la Luna, creada por Umbrael para vivir donde otros sólo ven la nada.",
            "secciones": [
                S("Umbrael, el Señor de la Quietud", "Umbrael es el dios del Vacío absoluto. Junto con Bahamut y Tiamat forma la trifecta dracónica: "
                  "son hermanos, y como hermanos han peleado muchas veces y siempre han terminado perdonándose. Se le representa como un dragón de un "
                  "morado tan oscuro que se confunde con el cielo sin estrellas.\n\nMientras sus hermanos llenaban el mundo con sus hijos, Umbrael "
                  "miró a la Luna, a su lado oscuro, donde nada vivía. Su filosofía es la de sobrevivir en lo que otros consideran la nada: no "
                  "destruir el vacío ni temerlo, sino habitarlo."),
                S("Origen", "Umbrael creó a los Dracónidos del Vacío en el lado oscuro de la Luna. El primero de todos fue Grhagur Bael, que no "
                  "pertenecía a ningún clan porque aún no existían las ramas que hoy dividen a su pueblo. Umbrael implantó en sus hijos una fisiología "
                  "capaz de vivir y sobrevivir en gravedades muy distintas, por eso la gravedad apenas les afecta y no pueden ser arrastrados con "
                  "facilidad.\n\nNo son dracónidos que vinieron del espacio: son otra rama evolutiva, nacida y diseñada para un mundo sin aire, y su "
                  "aspecto morado oscuro los hace casi imperceptibles en su entorno."),
                S("El Vacío", "Su aliento no es fuego, hielo ni ningún elemento: es Vacío. Y no es un agujero negro. El Vacío desplaza el aire y "
                  "toda la materia a su paso; cuando ese Vacío se mueve, lo desplazado quiere volver a donde estaba, y por eso lo que está cerca es "
                  "atraído hacia el centro. Su resistencia es el propio Vacío."),
                S("Clanes, fe y el profeta", "Con el tiempo surgieron los clanes y sus ramas. Sus nombres se escriben con el apellido primero, "
                  "luego el nombre y por último el clan. El más recordado es Grhagur Enyeon Enerson, profeta de Umbrael, que inició la senda de los "
                  "Shadow Knight y devoró a la Sombra Primordial.\n\nHoy hay Eruditos, que guardan el saber de su pueblo, y Supervivientes, curtidos "
                  "en los entornos más extremos. Los acompañan los Thri-kreen del Vacío, sus guardianes, y los Selenkos, sus sirvientes naturales. "
                  "En Agarias son pocos y neutrales."),
            ],
            "relacionadas": ["thri-kreen", "selenkos"],
        },
        "selenkos": {
            "nombre": "Selenkos, los Kobolds del Vacío",
            "resumen": "Kobolds de la Luna, sirvientes naturales de los Dracónidos del Vacío: iguales a los demás, con otra cultura.",
            "secciones": [
                S("Origen", "Los Selenkos son kobolds que viven en el lado oscuro de la Luna desde que llegaron los primeros Dracónidos del Vacío. "
                  "Sus escamas tienen reflejos violáceos y su cuerpo es el de cualquier kobold: lo que los distingue es su cultura."),
                S("Cultura", "Para un Selenko, servir a los Dracónidos del Vacío no es una cadena, sino un orgullo heredado. Mantienen sus túneles, "
                  "sus forjas y sus despensas, y presumen de que ningún Dracónido del Vacío sobreviviría a la noche lunar sin ellos. Celebran los "
                  "eclipses como fiestas sagradas de Umbrael y cuentan los años por las visitas de los dracónidos a sus madrigueras."),
                S("En Agarias", "Los Selenkos bajan a Agarias acompañando a sus señores, y muchos acaban quedándose por curiosidad. Son neutrales, "
                  "ruidosos y trabajadores, y sienten un respeto casi reverencial por cualquier dracónido, sea de la rama que sea."),
            ],
            "relacionadas": ["draconido-vacio"],
        },
    }


FRAGMENTO_OLD = ("Realiza un ataque de hechizo a distancia; si impacta, el objetivo recibe 1d8 de daño de Vacío. Además, debe realizar "
                 "una tirada de salvación de Sabiduría. Si falla, queda aturdido hasta el final de su siguiente turno.\n"
                 "A niveles superiores, el daño aumenta a 2d8 en el nivel 5, 3d8 en el nivel 11 y 4d8 en el nivel 17.")
FRAGMENTO_NEW = ("El objetivo debe superar una tirada de salvación de Sabiduría o quedar aturdido por el Vacío hasta el final de su "
                 "siguiente turno: tiene desventaja en las tiradas de ataque y en las pruebas de característica (no es el estado "
                 "Aturdido). Este truco no hace daño: el daño del Vacío es cosa de tu aliento.")
ADAPTACION_OLD = ("♻ Adaptación Extrema. Eres inmune a los efectos nocivos derivados de la exposición al Vacío. Esto significa que puedes "
                  "respirar y operar sin inconvenientes en entornos sin atmósfera (como el espacio exterior), bajo el agua o en atmósferas "
                  "tóxicas y cargadas de magia caótica.")
ADAPTACION_NEW = ("♻ Adaptación Extrema. Las condiciones extremas de la Luna te curtieron: puedes respirar y actuar con normalidad sin "
                  "atmósfera (como en el espacio exterior), bajo el agua o en atmósferas tóxicas o cargadas de magia caótica. Es una "
                  "adaptación al ambiente: no te protege del daño de Vacío (para eso tienes tu resistencia), ni de venenos, "
                  "conjuros o ataques.")


def update_void_draconids(races):
    """Dracónidos del Vacío ya existentes: añade el Anclaje gravitatorio y explica el arrastre del aliento."""
    for key in ("Dracónido Erudito (Vacío)", "Dracónido Superviviente (Vacío)"):
        r = races[key]
        txt = r["info"]
        if "Anclaje gravitatorio" not in txt:
            txt = txt.replace("Este arrastre no provoca ataques de oportunidad.",
                              "Este arrastre no provoca ataques de oportunidad." + DESPLAZAMIENTO, 1)
            txt = txt.replace("\n♻ Resistencia al Daño.", "\n" + ANCLAJE + "\n♻ Resistencia al Daño.", 1)
        txt = txt.replace(FRAGMENTO_OLD, FRAGMENTO_NEW).replace(ADAPTACION_OLD, ADAPTACION_NEW)
        r["info"] = txt
        r["efectos"] = [{"type": "resistencia", "value": "vacio"}]
        r["descripcion"] = ("Eruditos del Vacío: guardan el saber de los hijos de Umbrael." if "Erudito" in key
                            else "Supervivientes del Vacío: curtidos en los entornos más extremos.")


def main():
    races_path, cat_path, lore_path = DATA / "races.json", DATA / "race-catalog.json", DATA / "race-lore.json"
    races = json.loads(races_path.read_text(encoding="utf-8"))
    catalog = json.loads(cat_path.read_text(encoding="utf-8"))
    lore = json.loads(lore_path.read_text(encoding="utf-8"))

    new, _ = races_data()
    races.update(new)
    update_void_draconids(races)
    lore.update(lore_data())

    group = next(g for g in catalog if g["source"] == GROUP)
    keep = [r for r in group["races"] if r not in new]  # p. ej. los Dracónidos del Vacío
    order = ["Dracónido Erudito (Vacío)", "Dracónido Superviviente (Vacío)", "Selenko (Kobold del Vacío)"]
    group["races"] = [r for r in order if r in races] + [r for r in keep if r not in order] + [r for r in new if r not in order]

    races_path.write_text(json.dumps(races, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    cat_path.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    lore_path.write_text(json.dumps(lore, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"ok: {len(new)} razas nuevas, {len(group['races'])} en «{GROUP}», {len(lore) - 1} historias")


if __name__ == "__main__":
    main()
