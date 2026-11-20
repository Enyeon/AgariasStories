#!/usr/bin/env python3
"""Raza INK y clase Adaptado (AgSt 1.36). Generador idempotente.

Escribe en frontend/src/data:
  * races.json, race-catalog.json, race-lore.json  la raza INK (Pt. V: Aliens)
    y su historia pública;
  * class-creatures.json                           las invocaciones Ink (Conejo
    y el repertorio);
  * classes/adaptado.json                          la clase Adaptado.

Diseño acordado con el autor (19-nov-2026); el detalle y las razones están en
el doc del proyecto «claude/ink-diagnostico.md». Resumen de lo que manda:
  * El personaje es el INK: un experimento de los Sram sobre el «Sujeto».
    Para los Sram son «Fracasos»; fabricaron miles, quizá millones.
  * Raza y clase son distintas; la clase se recomienda para la raza. La
    Inhibición (no causar daño) es de la CLASE. La raza no puede dañar ni
    matar a su portador.
  * Conejo desde la creación (racial). Repertorio: 3 invocaciones elegidas en
    el nivel 3 (la de la Senda cuenta), que mejoran y se pueden cambiar en los
    niveles 7, 11 y 15. Capacidad de Manifestación 1/2/3 en los niveles 3/7/13;
    Conejo y Ruleta no ocupan capacidad. El Golem no usa concentración.
  * Caramelos: la enfermedad de las estadísticas (racial). La cura existe sólo
    como rumor en el lore público: el secreto es de un jugador (Vacío, el
    Experimento 048) y no se publica aquí.
  * Contratistas: obedecen al jugador y, en combate, se unifican en una sola
    entidad (la Cuadrilla). La Inhibición no se aplica a ellos.

Uso: python3 tools/ink_adaptado.py
"""
from __future__ import annotations

import json
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "frontend" / "src" / "data"
GROUP = "Razas de Agarias Pt. V: Aliens"
RACE = "INK"
CLASS = "adaptado"


def load(p: Path):
    return json.loads(p.read_text(encoding="utf-8"))


def save(p: Path, d, indent=2):
    p.write_text(json.dumps(d, ensure_ascii=False, indent=indent) + "\n", encoding="utf-8")


# ══ Raza INK ═══════════════════════════════════════════════════════════════

RACE_INFO = "\n".join([
    "Rasgos de Raza:",
    "♻ Tipo y tamaño. Eres una aberración Mediana: biológicamente sintética, con metabolismo y necesidades orgánicas. No eres un constructo.",
    "♻ La raza no te daña. Ningún rasgo de tu raza puede causarte daño ni matarte.",
    "♻ Poliforme. Como acción, adoptas el aspecto de una criatura Pequeña o Mediana que hayas visto, o vuelves a tu forma natural. "
    "Copias la forma, la voz (si la oíste al menos 1 minuto) y un olor superficial; nunca sus estadísticas, sentidos, velocidades, ataques "
    "ni rasgos. Tu tamaño real no cambia. Dura hasta que la cambies o quedes inconsciente. Usos: tu bonificador de competencia por descanso "
    "largo. Suplantar a alguien concreto sigue pidiendo Carisma (Engaño) contra Sabiduría (Perspicacia); quien lo conoce de cerca tiene "
    "ventaja, y un olfato de rastreo puede notar que algo no cuadra.",
    "♻ Reserva de oxígeno. Dependes del oxígeno, pero lo almacenas: puedes contener la respiración 10 × (1 + tu modificador de Constitución) "
    "minutos (mínimo 10). Al agotarla empiezas a asfixiarte con las reglas normales. Recuperas la reserva tras respirar aire 10 minutos. "
    "No te protege de gases venenosos, de la asfixia mágica ni del daño de Vacío.",
    "♻ Contracción defensiva. Cuando una criatura que puedes ver ataca a un aliado a 10 pies (2 casillas) o menos de ti, puedes usar tu "
    "reacción para darle +2 a la CA contra ese ataque. Usos: tu bonificador de competencia por descanso largo.",
    "♻ Calma del Ink. Tienes ventaja en las tiradas de salvación para no quedar asustado ni encantado.",
    "♻ Conejo. Desde que naces te acompaña el Conejo, el primer ser que los Sram unieron a tu linaje. Lo manifiestas o reabsorbes como "
    "acción adicional y no ocupa Capacidad de Manifestación (sus estadísticas están en Criaturas → Añadir criatura → De un catálogo).",
    "♻ Enfermedad de las estadísticas. Puedes quitarte 1 punto de un atributo para crear un caramelo que lo replica (10 minutos). "
    "Quien se lo come gana +1 a ese atributo durante 1 hora (sin pasar de 20). Tienes como máximo tantos puntos cedidos como tu bonificador "
    "de competencia; recuperas cada punto 1 hora después de que se coman su caramelo o si se pierde. Desde el segundo caramelo en 24 horas, "
    "la vida de quien los come se drena: pierde 1 PG máximo cada 10 minutos, o 3 si se comió dos o más de golpe, sin bajar nunca de 1. "
    "Sólo lo detiene la cura de la enfermedad o la magia divina o sagrada, que devuelve lo drenado. (Ficha: tarjeta «Caramelos».)",
    "♻ Expresividad. Tus rasgos faciales son «sugeridos» y se mueven solos; es puramente estético y no da ventajas.",
])

RACE_ENTRY = {
    "velocidad": 30,
    "choices": [{"count": 2, "bonus": 1}],
    "lenguage": "Idioma: Puedes leer, escribir y hablar Común y Sram",
    "yaHabla": ["Común", "Sram"],
    "efectos": [
        {"type": "habilita", "value": "invocaciones_ink"},
        {"type": "habilita", "value": "caramelos"},
        {"type": "recurso", "id": "poliforme", "nombre": "Poliforme", "max": {"bc": True}},
        {"type": "recurso", "id": "contraccion-defensiva", "nombre": "Contracción defensiva", "max": {"bc": True}},
    ],
    "descripcion": "Experimentos de biomasa de los Sram, que ellos llaman «Fracasos»: frágiles, maleables y con varias vidas dentro.",
    "info": RACE_INFO,
    "linaje": "ink",
    "tipo": "Aberración",
    "tamano": "Mediano",
    "origen": "Instalaciones orbitales de los Sram",
    "claseRecomendada": CLASS,
}

LORE = {
    "nombre": "INK, los Fracasos de los Sram",
    "resumen": "Experimentos de biomasa que debían ser herramientas y terminaron siendo personas.",
    "secciones": [
        {"titulo": "El Sujeto", "texto":
            "Los Sram son una civilización dedicada a la experimentación biológica a gran escala. Uno de sus proyectos fue el Sujeto: "
            "una criatura de biomasa maleable, pensada para reconocimiento e infiltración. En las primeras etapas de su evolución, los Sram "
            "empezaron a unirlo con otros seres vivos cuando aún era joven, y esos seres pasaron a formar parte de él.\n\n"
            "A esa evolución adelantada y experimental la llamaron «Ink». Fabricaron miles, quizá millones, en sus instalaciones orbitales."},
        {"titulo": "Fracasos", "texto":
            "Para los Sram, los INK son un fracaso. La plasticidad de su cuerpo vino acompañada de algo que nadie había pedido: personalidad, "
            "voluntad, vínculos y la capacidad de negarse. Su química no está hecha para el conflicto, sino para resolver problemas.\n\n"
            "Algunos escaparon, otros fueron liberados y otros siguen naciendo en instalaciones activas sin conocer otra vida. Todos comparten "
            "lo mismo: un cuerpo sin forma fija y varias vidas dentro, que pueden salir de él como invocaciones: el Conejo, el primero de todas, "
            "y las que cada INK aprende a manifestar."},
        {"titulo": "La enfermedad de las estadísticas", "texto":
            "Las capacidades de un INK nunca terminaron de asentarse. Puede arrancarse un pedazo de sí mismo —su fuerza, sus reflejos, su "
            "memoria— y darle forma de caramelo para que otro lo use. Pero la enfermedad viaja con el caramelo: quien abusa de ellos siente "
            "cómo la vida se le escapa poco a poco, y sólo la magia divina consigue frenarlo.\n\n"
            "Por eso no tienen una esperanza de vida fija: un INK vive mientras su cuerpo pueda sostener sus estadísticas. Entre ellos corre "
            "un rumor que nadie ha podido confirmar: que existe una cura."},
        {"titulo": "En Agarias", "texto":
            "Los INK que se asientan entre otras razas suelen ser diplomáticos, sanadores, espías, artistas o mediadores. Rara vez guerreros, "
            "y cuando lo son, prefieren ganar sin que el enemigo llegue a entender cómo perdió. Muchos siguen el camino del Adaptado, que "
            "convierte su biología en protección para los demás. Por su aspecto húmedo y sus rasgos que se mueven solos, más de uno los mira "
            "con recelo hasta que los conoce."},
    ],
}

# ══ Invocaciones Ink (data/class-creatures.json) ═══════════════════════════

T = lambda name, text: {"name": name, "text": text}
UPG = "Mejora del Repertorio"

CREATURES = {
    "conejo": {
        "name": "Conejo", "size": "Pequeño", "creatureType": "Bestia (biomasa Ink)", "capacidad": False,
        "ac": {"base": 12, "bc": True}, "hp": {"base": 0, "porNivel": 2, "atributo": "sabiduria"}, "hpTexto": "2 × tu nivel + tu mod. de Sabiduría",
        "speed": "40 pies, salto 15 pies",
        "abilities": {"fuerza": 6, "destreza": 16, "constitucion": 10, "inteligencia": 4, "sabiduria": 14, "carisma": 8},
        "senses": "Visión en la oscuridad 60 pies, Percepción pasiva 14", "languages": "Entiende al INK",
        "description": "El primer ser que los Sram unieron al linaje del INK. Es racial: sólo lo tiene la raza INK. No ocupa Capacidad de Manifestación.",
        "traits": [
            T("Parte de ti", "Se manifiesta o se reabsorbe como acción adicional del INK. Actúa en tu iniciativa, justo después de ti. Si cae a 0 PG, vuelve a ti sin hacerte daño y no puede manifestarse hasta un descanso corto, o gastando 1 de Esencia."),
            T("Conexión", "Deja de actuar si se aleja más de 60 pies de ti; si sigue así 1 minuto, se reabsorbe."),
            T("Si quedas inconsciente", "No desaparece: sólo puede usar Ayudar y se coloca a tu lado si puede."),
        ],
        "actions": [
            T("Ayudar", "Da ventaja a un aliado en su siguiente prueba o tirada de ataque antes del inicio del siguiente turno del Conejo."),
            T("Conducto", "(Adaptado) Tus rasgos y hechizos de toque (Toque Estabilizador, Segundo Aliento Prestado…) pueden salir desde el Conejo, a 60 pies de ti."),
            T("Rescate", "Arrastra a un aliado inconsciente o caído hasta 15 pies sin provocar ataques de oportunidad."),
        ],
        "mejoras": [
            {"nivel": 5, "texto": "Ayudar puede darse a un aliado a 30 pies del Conejo sin moverse."},
            {"nivel": 11, "texto": "Conducto llega a 120 pies."},
            {"nivel": 17, "texto": "Una vez por ronda puede usar Ayudar como reacción."},
        ],
    },
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
        "name": "Loro insultador", "size": "Diminuto", "creatureType": "Bestia (biomasa Ink)", "ac": 13,
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
        "name": "Ruleta", "size": "Mediano (mide lo que mide el INK)", "creatureType": "Biomasa Ink", "capacidad": False,
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
        "name": "Topo", "size": "Pequeño", "creatureType": "Bestia (biomasa Ink)", "ac": 13,
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
        "name": "Pulpo", "size": "Mediano", "creatureType": "Bestia (biomasa Ink)", "ac": 12,
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
        "name": "Polilla", "size": "Diminuto", "creatureType": "Bestia (biomasa Ink)", "ac": 13,
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
        "name": "Montura", "size": "Grande", "creatureType": "Bestia (biomasa Ink)", "ac": 13,
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
        "name": "Esponja", "size": "Pequeño", "creatureType": "Biomasa Ink", "ac": 11,
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
        "name": "Araña", "size": "Pequeño", "creatureType": "Bestia (biomasa Ink)", "ac": 13,
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
        "name": "Luciérnaga", "size": "Diminuto", "creatureType": "Bestia (biomasa Ink)", "ac": 13,
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


def repertoire_list(exclude=None):
    ops = [{"id": k, "nombre": CREATURES[k]["name"], "descripcion": ROLE[k] + " Estadísticas: Criaturas → Añadir criatura → De un catálogo."}
           for k in REPERTOIRE_ORDER if k != exclude]
    return {"titulo": "Repertorio de invocaciones", "ayuda": "Tus invocaciones conocidas: tres en total, contando la que te da tu Senda. Cada una hace cosas distintas.", "opciones": ops}


# ══ Hechizos y trucos Ink (elecciones) ═════════════════════════════════════

def spell(id_, nombre, nivel, escuela, tiempo, alcance, comps, dur, texto, req=None):
    cost = f" Coste: {nivel} de Esencia." if nivel else ""
    head = f"<i>{'Truco' if nivel == 0 else f'Nivel {nivel}'} · {escuela}</i> · {tiempo} · {alcance} · {comps} · {dur}.{cost}<br>"
    o = {"id": id_, "nombre": nombre, "descripcion": head + texto}
    if req:
        o["requisitos"] = {"nivel": req}
    return o


TRUCOS = [
    spell("orientacion", "Orientación", 0, "Adivinación", "1 acción", "Toque", "V, S", "Concentración, 1 minuto", "Una criatura voluntaria suma 1d4 a una prueba de característica de su elección antes de que acabe el conjuro."),
    spell("resistencia", "Resistencia", 0, "Abjuración", "1 acción", "Toque", "V, S", "Concentración, 1 minuto", "Una criatura voluntaria suma 1d4 a una tirada de salvación de su elección antes de que acabe el conjuro."),
    spell("perdonar-moribundos", "Perdonar a los moribundos", 0, "Nigromancia", "1 acción", "Toque", "V, S", "Instantánea", "Estabilizas a una criatura viva a 0 PG."),
    spell("mensaje", "Mensaje", 0, "Transmutación", "1 acción", "120 pies", "V, S", "1 ronda", "Susurras un mensaje a una criatura y sólo ella lo oye; puede responder en un susurro."),
    spell("remendar", "Remendar", 0, "Transmutación", "1 minuto", "Toque", "V, S", "Instantánea", "Reparas una rotura o desgarro de un objeto."),
    spell("mano-de-mago", "Mano de mago", 0, "Conjuración", "1 acción", "30 pies", "V, S", "1 minuto", "Una mano espectral manipula objetos ligeros (no ataca ni activa objetos mágicos)."),
    spell("taumaturgia", "Taumaturgia", 0, "Transmutación", "1 acción", "30 pies", "V", "Hasta 1 minuto", "Una pequeña maravilla: tu voz retumba, las llamas parpadean, se oyen golpes, se abre una puerta…"),
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


# ══ Clase Adaptado ═════════════════════════════════════════════════════════

def block(name, text, efectos=None, elegir=None):
    b = {"name": name, "titleName": f"✦ {name.upper()} ✦", "descripcion": text}
    if efectos:
        b["efectos"] = efectos
    if elegir:
        b["elegir"] = elegir
    return b


def sub_block(name, text, efectos=None, elegir=None):
    b = {"subName": name, "subDescripcion": text}
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
        block("Hechizos Ink", "Lanzas hechizos con Sabiduría (CD de clase = 8 + tu bonificador de competencia + tu modificador de Sabiduría). No tienes espacios "
              "de conjuro: cada hechizo cuesta tantos puntos de Esencia como su nivel. Conoces los trucos y hechizos que elijas de la lista Ink "
              "(columnas «Hechizos conocidos» y «Nivel máx. de hechizo»). Ninguno hace daño. Al subir de nivel puedes cambiar uno.",
              elegir=[{"lista": "trucos-ink", "cantidad": 2}, {"lista": "hechizos-ink", "cantidad": 2}]),
        block("Injerto Sram", "Si no eres un INK, tus invocaciones salen de un injerto de biomasa Sram que recibiste al tomar esta clase. Tienes todo lo de la "
              "clase, pero no el Conejo, que es de la raza INK.",
              efectos=[{"type": "habilita", "value": "invocaciones_ink"}]),
    ],
    2: [
        block("Desplazamiento", "Como acción adicional, dejas un rastro de biomasa de 15 × 5 pies sobre una superficie sólida contigua (suelo, pared o techo). "
              "Hasta el final de tu turno te mueves por él sin gastar velocidad ni provocar ataques de oportunidad. No sirve en el aire ni si tu velocidad es 0. "
              "Usos: tu modificador de Constitución (mínimo 1) por descanso largo.",
              efectos=[{"type": "recurso", "id": "desplazamiento", "nombre": "Desplazamiento", "max": {"atributo": "constitucion", "minimo": 1}}]),
        block("Desecho biológico", "Cuando manifiestas una invocación que no sea el Conejo o la Ruleta, o cuando una cae a 0 PG, queda un Desecho de 5 pies a su lado: "
              "terreno difícil, CA 10, 1 PG. Se disuelve al final de tu siguiente turno, si se aleja más de 30 pies de su invocación o de ti, o al terminar el combate. "
              "Con una acción adicional (o la acción de una invocación) puedes gestionarlo:<br>• <b>Reabsorber:</b> recuperas 1 de Esencia (una vez por turno).<br>"
              "• <b>Contener:</b> el Golem lo absorbe y gana 1d6 PG temporales.<br>• <b>Moldear</b> (1 minuto): barricada (cobertura media), charco adhesivo "
              "(terreno difícil; salvación de Destreza o apresado hasta el final de su siguiente turno) o puente o asidero.<br>Si lo ignoras un turno entero, "
              "se <b>descontrola</b>: se extiende y deja terreno difícil en un cuadrado de 10 pies hasta el final del combate. Nunca hace daño."),
    ],
    3: [
        block("Repertorio de invocaciones", "Las vidas que llevas dentro aprenden a salir. Conoces tres invocaciones del repertorio; la de tu Senda (si te da una) "
              "cuenta entre las tres y la eliges en el paso de la Senda. Se manifiestan con una acción (salvo que su bloque diga otra cosa) y, si caen a 0 PG, "
              "vuelven a ti sin hacerte daño; no pueden volver a manifestarse hasta un descanso corto o gastando 2 de Esencia. "
              "<b>Capacidad de Manifestación:</b> cuántas pueden estar fuera a la vez (columna «Invocaciones fuera»); el Conejo y la Ruleta no cuentan. "
              "Sus estadísticas están en Criaturas → Añadir criatura → De un catálogo.",
              efectos=[{"type": "bono", "target": "invocaciones", "desdeTabla": "Invocaciones fuera"}]),
        block("Contratista", "Fuera de combate puedes contratar a criaturas con Inteligencia 4 o más que puedan comunicarse contigo y estén dispuestas a negociar "
              "(guías, artesanos, guardias, mercenarios…; las poderosas o legendarias sólo si el DM lo permite). El precio depende del riesgo. Los contratistas "
              "<b>obedecen tus órdenes</b> mientras dure el contrato. Puedes mantener tantos contratos como tu bonificador de competencia.<br>"
              "<b>Cuadrilla.</b> Al empezar un combate, todos tus contratistas se unifican en una sola entidad con un turno y una acción. Usa las estadísticas "
              "del más fuerte, cuyo FR no puede pasar de la mitad de tu nivel (mínimo 1/8). Cada contratista extra suma 5 PG y un talento de su oficio "
              "(guardia +1 CA, guía +10 pies de velocidad, curandero una curación de 1d8 por combate, explorador +5 a la Percepción pasiva…). La diriges tú. "
              "A 0 PG se dispersa: huyen heridos y pierdes sus servicios hasta renegociar. La Inhibición no se aplica a la Cuadrilla (son seres "
              "independientes), y no cuenta como invocación ni se beneficia de tus invocaciones."),
    ],
    5: [block("Conducto", "Tus rasgos y hechizos de toque pueden salir desde cualquiera de tus invocaciones manifestadas a 60 pies de ti.")],
    7: [block("Mejora del Repertorio", "Tus invocaciones mejoran (ver «Mejora (nivel 7)» en sus estadísticas) y puedes cambiar una de las que conoces por otra del repertorio (no la de tu Senda).")],
    9: [block("Instinto Preeminente", "Tienes ventaja en las tiradas de iniciativa y no puedes ser sorprendido mientras estés consciente.")],
    11: [
        block("Mejora del Repertorio", "Tus invocaciones mejoran otra vez (nivel 11) y puedes cambiar una de las que conoces."),
        block("Reflejo Táctico", "Cuando manifiestas una invocación, un aliado que puedas ver puede usar su reacción para moverse la mitad de su velocidad sin provocar ataques de oportunidad."),
    ],
    13: [block("Escudo de Biomasa", "Como reacción, cuando un aliado a 30 pies hace una tirada de salvación, gastas 1 de Esencia y la hace con ventaja.")],
    15: [
        block("Mejora del Repertorio", "Tus invocaciones mejoran por última vez (nivel 15) y puedes cambiar una de las que conoces."),
        block("Biomasa Resiliente", "Tus invocaciones tienen resistencia a todo el daño salvo el de fuerza."),
    ],
    17: [block("Sincronía de Invocaciones", "Una vez por ronda, una de tus invocaciones puede usar su acción como reacción.")],
    18: [block("Dulce Remedio", "Una vez por descanso largo, tocando a una criatura, detienes el drenaje de los caramelos que sufre y le devuelves lo drenado. No cura la enfermedad: sólo la frena.",
               efectos=[{"type": "recurso", "id": "dulce-remedio", "nombre": "Dulce Remedio", "max": {"valor": 1}}])],
    20: [block("Núcleo Ink", "Una vez por descanso largo, como acción, manifiestas todas tus invocaciones sin coste y sin límite de capacidad durante 1 minuto. "
               "Mientras dure, tú y tus aliados a 30 pies no podéis bajar de 1 PG por un único ataque o efecto.",
               efectos=[{"type": "recurso", "id": "nucleo-ink", "nombre": "Núcleo Ink", "max": {"valor": 1}}])],
}

SENDAS = {
    "refugio": ("Senda del Refugio", "golem", "Protección: el Golem es tu núcleo.", {
        3: ("Caparazón Compartido", "Tu invocación de Senda es el Golem. Cuando tu Golem usa Interceptar, una vez por turno puedes reducir a la mitad el daño que recibes tú de otro ataque ese mismo turno."),
        6: ("Biomasa densa", "Los PG del Golem aumentan en 3 × tu nivel."),
        10: ("Doble intercepción", "El Golem puede Interceptar dos veces por ronda, a aliados distintos."),
        14: ("Muralla viva", "Cuando un aliado detrás del Golem hace una salvación contra un efecto de área, la hace con ventaja."),
    }),
    "insulto": ("Senda del Insulto", "loro", "Provocación: el Loro es tu núcleo.", {
        3: ("Lengua afilada", "Tu invocación de Senda es el Loro. Su Insulto Disonante impone además desventaja en las salvaciones contra el miedo."),
        6: ("Loro gratis", "Una vez por descanso corto o largo, manifiestas el Loro sin coste."),
        10: ("Burla paralizante", "Las criaturas afectadas por el Insulto no pueden hacer ataques de oportunidad."),
        14: ("Coro de insultos", "Puedes tener dos Loros fuera a la vez (comparten el límite de usos)."),
    }),
    "espejo": ("Senda del Espejo", None, "Engaño: Poliforme es tu herramienta.", {
        3: ("Rostro ajeno", "Ventaja en Engaño mientras usas Poliforme para hacerte pasar por otro. Además, eliges una invocación más del repertorio y conoces Máscara de Otro sin que cuente."),
        6: ("Cambio veloz", "Puedes usar Poliforme como acción adicional."),
        10: ("Lengua prestada", "Si oyes un idioma durante 1 minuto, lo hablas hasta tu siguiente descanso largo."),
        14: ("Doble", "Una de tus invocaciones adopta tu forma durante 1 minuto (una ilusión física: no copia tus rasgos)."),
    }),
    "azar": ("Senda del Azar", "ruleta", "Riesgo: la Ruleta es tu núcleo.", {
        3: ("Jugador nato", "Tu invocación de Senda es la Ruleta, ya desde el nivel 3."),
        6: ("Segunda tirada", "Cuando te apliques la Ruleta a ti mismo con un resultado de 1 a 7, puedes repetir la tirada y quedarte con la segunda."),
        10: ("Mesa caliente", "Puedes girar la Ruleta dos veces por descanso largo (sigue siendo una por descanso corto)."),
        14: ("Suerte dirigida", "Una vez por descanso largo, eliges un resultado de 18 a 20 en lugar de tirar. No se combina con Segunda tirada."),
    }),
    "enjambre": ("Senda del Enjambre", None, "Fragmentación: más piezas, más pequeñas.", {
        3: ("Fragmentos", "Eliges una invocación más del repertorio. Además, tu invocación fuera más pequeña no ocupa Capacidad de Manifestación."),
        6: ("Desecho duradero", "El Desecho que moldeas dura 10 minutos."),
        10: ("Miniatura", "Al manifestar una invocación, puedes gastar 1 de Esencia para que salga con una versión en miniatura (mitad de PG, sin reacción). Sólo una miniatura a la vez."),
        14: ("Doble miniatura", "Puedes tener dos miniaturas a la vez."),
    }),
}


def build_class():
    niveles = {}
    prev_cube = None
    for lv in range(1, 21):
        n = {}
        if lv == 1:
            n["descripcion"] = "Soporte biológico experimental: saca de su cuerpo las vidas que lleva dentro para proteger, rescatar y desordenar el combate, sin herir jamás a nadie."
            n["descripcionLarga"] = ("El Adaptado es cómo un INK entrena su biología maleable hasta convertirla en un kit de soporte, control y supervivencia. No es la clase "
                                     "que más daño hace: no hace ninguno. Es la clase que hace que el resto del grupo rinda más. Cada turno decides a quién proteges, "
                                     "qué invocación sale y dónde, si te expones para salvar a otro o si arriesgas la Ruleta. Se recomienda para la raza INK, "
                                     "pero cualquier raza puede tomarla.")
            n["atributoInicial"] = ("Atributos de clase:\n❖ Tiradas de Salvación: Sabiduría y Carisma.\n❖ Puntos de golpe:\n    :: Dado de golpe: 1d8.\n"
                                    "    :: Nivel 1: 8 + tu modificador de Constitución.\n    :: Niveles siguientes: 1d8 (o 5) + tu modificador de Constitución por nivel.\n"
                                    "❖ Competencias:\n    :: Armadura: Armadura ligera y escudos.\n    :: Armas: Ninguna (Inhibición).\n"
                                    "    :: Herramientas: una herramienta de artesano o un kit de herbolario.\n"
                                    "    :: Habilidades: escoge dos entre Perspicacia, Persuasión, Medicina, Investigación, Engaño, Naturaleza y Trato con Animales.\n"
                                    "❖ Fuente: Agarias.")
        cube = {"columnas": ["Esencia", "Hechizos conocidos", "Nivel máx. de hechizo", "Invocaciones fuera"],
                "filas": [[str(ESENCIA[lv - 1]), str(KNOWN[lv - 1]), f"{MAX_SPELL(lv)}.º", CAPACITY(lv)]]}
        # Sólo en los niveles donde algo cambia (la app hereda la última tabla).
        if lv == 1 or cube["filas"] != prev_cube:
            n["infoCubo"] = cube
        prev_cube = cube["filas"]
        blocks = {}
        names = ["blockUno", "blockDos", "blockTres", "blockCuatro", "blockCinco", "blockSeis"]
        for i, b in enumerate(FEATURES.get(lv, [])):
            blocks[names[i]] = b
        # Hechizos y trucos nuevos al subir de nivel (con cambio opcional de uno).
        if lv > 1:
            gain = KNOWN[lv - 1] - KNOWN[lv - 2]
            elegir = [{"lista": "hechizos-ink", "cantidad": gain, "reemplazar": 1}]
            if CANTRIPS.get(lv):
                elegir.append({"lista": "trucos-ink", "cantidad": CANTRIPS[lv]})
            n["elegir"] = elegir
        if lv == 3:
            blocks[names[len(blocks)]] = block("Senda de Tinta", "Eliges una Senda de Tinta: tu especialización. Las Sendas del Refugio, del Insulto y del Azar "
                                              "te dan su invocación (cuenta entre tus tres); las del Espejo y del Enjambre te dejan elegir una más.")
        if blocks:
            n["infoBlock"] = blocks
        niveles[str(lv)] = n

    # Subclases (Sendas), con su propia lista de repertorio sin duplicar su invocación.
    subs = {}
    for key, (nombre, own, lema, feats) in SENDAS.items():
        sub_lists = {"repertorio": repertoire_list(exclude=own)}
        sub_nivel = {}
        for lv, (fname, ftext) in feats.items():
            b = sub_block(fname, ftext)
            if lv == 3:
                b["elegir"] = {"lista": "repertorio", "cantidad": 2 if own else 3}
            sub_nivel[str(lv)] = {"infoSubBlock": {"subBlockUno": b}}
        for lv in (7, 11, 15):
            sub_nivel.setdefault(str(lv), {})["elegir"] = {"lista": "repertorio", "cantidad": 0, "reemplazar": 1, "rasgo": "Mejora del Repertorio"}
        own_txt = f" Tu invocación de Senda es {CREATURES[own]['name']}." if own else ""
        subs[key] = {
            "subNombre": nombre, "fuente": "Agarias",
            "subDescripcion": f"✦ {nombre.upper()} ✦\n{lema}{own_txt}",
            "listasDeEleccion": sub_lists,
            "subNivel": sub_nivel,
        }
    niveles["3"]["subClase"] = subs

    return {
        "nombre": "Adaptado",
        "claseName": CLASS,
        "seccion": "agarias",
        "icono": "🫧",
        "fuenteReglas": "Agarias (diseño del autor, revisado el 19-nov-2026)",
        "razaRecomendada": [RACE],
        "dadoDeGolpe": 8,
        "nivelesDeAumento": [4, 8, 12, 16, 19],
        "conjurador": False,
        "subclaseNombre": "Senda de Tinta",
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
        "listasDeEleccion": {
            "trucos-ink": {"titulo": "Trucos Ink", "ayuda": "Trucos sin daño.", "opciones": TRUCOS, "reemplazarAlSubir": True},
            "hechizos-ink": {"titulo": "Hechizos Ink", "ayuda": "Cuestan tanta Esencia como su nivel. El nivel máximo sale de tu tabla.", "opciones": HECHIZOS},
        },
        "niveles": niveles,
    }


def main():
    races = load(DATA / "races.json")
    races[RACE] = RACE_ENTRY
    save(DATA / "races.json", races)

    catalog = load(DATA / "race-catalog.json")
    group = next(g for g in catalog if g["source"] == GROUP)
    if RACE not in group["races"]:
        group["races"].append(RACE)
    save(DATA / "race-catalog.json", catalog)

    lore = load(DATA / "race-lore.json")
    lore["ink"] = LORE
    save(DATA / "race-lore.json", lore)

    cc = load(DATA / "class-creatures.json")
    cc["grupos"]["ink"] = {"nombre": "Invocaciones Ink", "fuente": "Invocación Ink (raza INK · clase Adaptado)", "criaturas": CREATURES}
    save(DATA / "class-creatures.json", cc)

    save(DATA / "classes" / f"{CLASS}.json", build_class())
    print("ok: raza INK, 11 invocaciones, clase Adaptado")


if __name__ == "__main__":
    main()
