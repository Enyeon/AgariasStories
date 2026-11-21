#!/usr/bin/env python3
"""Clase Anomalía, «la criatura condenada» (AgSt 1.39). Generador idempotente.

Escribe en frontend/src/data:
  * classes/anomalia.json   la clase, sus cuatro Hebras y su lore;
  * spells.json             los conjuros propios de la Anomalía (origen Agarias)
                            y las copias de conjuros oficiales que la app no tenía;
  * class-creatures.json    las Manifestaciones de Ayuda Anómala (grupo «anomalia»).
Y en docs/homebrew:
  * secretos-del-plano-anomalo.json  paquete de Homebrew (extensiones con código
                            del DM): Superior Reign, Armagedón y Hadar.

Decisiones del autor (20-nov-2026; diagnóstico en el doc del proyecto
«claude/anomalia-diagnostico.md»):
  * Sabiduría; prepara nivel + Sabiduría conjuros cada descanso largo; trucos
    2/3/4 (niveles 1, 4 y 10); armas sencillas y el foco anómalo; multiclase con
    Sabiduría 13, sin competencias extra; sin recuperación en descanso corto.
  * La condena: Estabilidad = BC + Sabiduría. Ganar Inestabilidad la gasta; al
    quedarse sin ella llega el Colapso (estado Corrupto de Agarias + tabla d10).
    Pasado el máximo, cada punto cuesta un Dado de Golpe. Se recupera con un
    descanso largo. Narrativamente, el Plano Anómalo la va reclamando.
  * Tablas d10 de Efectos Anómalos menores y mayores (glitch, tiempo, virus y
    .exe), sin daño enorme.
  * Condiciones: aterrado = asustado; confundido = efecto de Confusión;
    ralentizado = efecto de Ralentizar; desorientado = desventaja en ataques y
    pruebas durante 1 turno; loco = Confusión durante 1 minuto. «Daño verdadero»
    = daño de Vacío.
  * Límites: Espejismo, Torsión y Replicación BC por descanso largo; Infección a
    una criatura; Devorador Sabiduría por descanso largo; Deformación 1 por
    descanso largo. Paradox comparte espacios y concentración, un conjuro con
    espacio por ronda entre las dos y +2 de Inestabilidad. Ayuda Anómala pasa al
    13 con concentración y Realidad Inestable al 15. Eco Imposible 1 por descanso
    largo, deja sin Estabilidad y no se combina con Avatar el mismo día.
  * Trucos: Catástrofe con salvación; Toque del Anómalo da PG temporales.
  * Toda la lista se reequilibra; Escudo y Armadura de mago entran en la lista.
    Los conjuros oficiales modificados llevan «Versión de Agarias».
  * Superior Reign, Armagedón y Hadar salen de la lista: son Secretos del Plano
    Anómalo que el DM desbloquea con código.
  * Lore: Zzeryxia es la Diosa anómala; Animalía es su creación, casi tan
    poderosa como ella, encerrada en una prisión dimensional por entidades
    pseudo y cuasi divinas, y enloquecida por la soledad. La «Deidad Primigenia»
    se retira. El Plano Anómalo está separado de los planos terrenales; Zzeryxia
    y Umbrael son grandes amigos en el Plano divino. Una Anomalía puede aparecer
    de cualquier forma y ser de cualquier raza. Hadar: lo que los brujos llaman
    Hadar es, en Agarias, un fragmento del Plano Anómalo.

Uso: python3 tools/anomalia.py
"""
from __future__ import annotations

import json
from pathlib import Path

from casillas import con_casillas  # AgSt 1.38: toda distancia en pies lleva sus casillas

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "frontend" / "src" / "data"
CLASS = "anomalia"
NAME = "Anomalía"
TITLE = "A̡̞̼͚̟̞̤̓ͥn̯̳ͯ̇ͫͤͥ͗ͨo͖̟̼̅̍͌ͫ̓m̬̲ͯ͑ͤa̲͉̖̳̻̋͋l̻̠ͭ̇̆ͥ͊i͓̺̩͓̼̯͛ͫͨa͍͈͛̏ͧ̏͊ͧ͋"


def load(p: Path):
    return json.loads(p.read_text(encoding="utf-8"))


def save(p: Path, d, indent=2):
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(con_casillas(json.dumps(d, ensure_ascii=False, indent=indent)) + "\n", encoding="utf-8")


def recurso(id_, nombre, max_, corto=None):
    e = {"type": "recurso", "id": id_, "nombre": nombre, "max": max_}
    if corto:
        e["corto"] = corto
    return e


UNO = {"valor": 1}
BC = {"bc": True}
SAB = {"atributo": "sabiduria", "minimo": 1}


def table(head, rows):
    th = "".join(f"<th>{h}</th>" for h in head)
    tr = "".join("<tr>" + "".join(f"<td>{c}</td>" for c in r) + "</tr>" for r in rows)
    return f"<table><thead><tr>{th}</tr></thead><tbody>{tr}</tbody></table>"


# ══ Tablas ═════════════════════════════════════════════════════════════════

COLAPSO = [
    ("1", "<b>Desincronía.</b> Pierdes tu acción adicional y tu reacción hasta el final de tu siguiente turno."),
    ("2", "<b>Eco hueco.</b> Durante 1 minuto, los objetivos de tus conjuros tienen ventaja en las salvaciones contra ellos y tú desventaja en tus ataques con conjuros."),
    ("3", "<b>Teletransporte errático.</b> Te teletransportas en una dirección al azar 10 pies por cada punto de 1d4, al espacio libre más cercano."),
    ("4", "<b>Grieta.</b> Recibes 2d6 de daño psíquico que no se puede reducir."),
    ("5", "<b>Ruido.</b> Quedas ensordecido y tu voz sale distorsionada: no puedes lanzar conjuros con componente verbal hasta el final de tu siguiente turno."),
    ("6", "<b>Fallo de renderizado.</b> Te vuelves translúcido hasta el final de tu siguiente turno: los ataques contra ti tienen desventaja y tus tiradas de ataque también."),
    ("7", "<b>Lag.</b> Tu velocidad es 0 hasta el final de tu siguiente turno."),
    ("8", "<b>Fuga anómala.</b> Cada criatura a 10 pies de ti, aliados incluidos, hace una salvación de Sabiduría contra tu CD de conjuros o queda asustada de ti hasta el final de su siguiente turno."),
    ("9", "<b>Tic-tac.</b> Oyes el reloj del Plano Anómalo: tienes desventaja en las salvaciones de concentración hasta el final de tu siguiente turno."),
    ("10", "<b>Mirada de Zzeryxia.</b> Zzeryxia te mira y el Colapso no ocurre: no quedas Corrupto y recuperas 1d4 de Estabilidad."),
]

MENORES = [
    ("1", "Glitch", "<b>Píxel muerto.</b> Una criatura a 30 pies hace una salvación de Constitución o queda cegada hasta el final de su siguiente turno."),
    ("2", "Glitch", "<b>Clip.</b> Te teletransportas a un espacio libre que puedas ver a 15 pies."),
    ("3", "Tiempo", "<b>Tic.</b> Tú o un aliado a 30 pies ganáis +10 pies de velocidad hasta el final de su siguiente turno."),
    ("4", "Tiempo", "<b>Tac.</b> Una criatura a 30 pies hace una salvación de Sabiduría o pierde 10 pies de velocidad hasta el final de su siguiente turno."),
    ("5", "Virus", "<b>Contagio leve.</b> Una criatura a 30 pies hace una salvación de Constitución o tiene desventaja en su siguiente tirada de salvación."),
    ("6", "Virus", "<b>Anticuerpo.</b> Tú o un aliado a 30 pies ganáis 1d6 + tu modificador de Sabiduría PG temporales."),
    ("7", ".exe", "<b>Susurro.</b> Una criatura a 30 pies hace una salvación de Sabiduría o queda asustada de ti hasta el final de su siguiente turno."),
    ("8", ".exe", "<b>Pantalla congelada.</b> Una criatura a 30 pies hace una salvación de Sabiduría o no puede usar reacciones hasta el inicio de su siguiente turno."),
    ("9", "—", "<b>Retorno.</b> Recuperas un uso de Ondas de Distorsión."),
    ("10", "—", "<b>Elección.</b> Eliges cualquier resultado de esta tabla."),
]

MAYORES = [
    ("1", "Glitch", "<b>Textura rota.</b> Durante 1 minuto el área es terreno difícil y oscuridad mágica que la visión en la oscuridad no atraviesa."),
    ("2", "Glitch", "<b>Retroceso de posición.</b> Cada criatura que elijas en el área vuelve al espacio donde empezó su último turno (o al libre más cercano)."),
    ("3", "Tiempo", "<b>Pausa.</b> Cada criatura hostil en el área hace una salvación de Sabiduría o queda incapacitada hasta el final de su siguiente turno."),
    ("4", "Tiempo", "<b>Aceleración.</b> Tú y cada aliado en el área tenéis, en vuestro siguiente turno, una acción extra limitada: Atacar (un solo ataque), Correr, Destrabarse, Esconderse o Usar un objeto."),
    ("5", "Virus", "<b>Brote.</b> Cada criatura hostil en el área hace una salvación de Constitución o no puede recuperar PG y tiene desventaja en su siguiente salvación hasta el final de tu siguiente turno."),
    ("6", "Virus", "<b>Inmunidad compartida.</b> Tú y cada aliado en el área ganáis resistencia a un tipo de daño que elijas hasta el final de tu siguiente turno."),
    ("7", ".exe", "<b>Proceso fantasma.</b> Cada criatura hostil en el área hace una salvación de Sabiduría o queda asustada de ti durante 1 minuto; repite la salvación al final de cada uno de sus turnos."),
    ("8", ".exe", "<b>Pantallazo.</b> Cada criatura hostil en el área hace una salvación de Inteligencia o pierde su reacción y tiene desventaja en su siguiente tirada de ataque."),
    ("9", "—", "<b>Fuga de memoria.</b> Recuperas un espacio de conjuro gastado de nivel 3 o inferior."),
    ("10", "—", "<b>Elección.</b> Eliges cualquier resultado de esta tabla."),
]


# ══ Lore y aclaraciones ════════════════════════════════════════════════════

LORE = (
    "<b>El Plano Anómalo.</b> Es un plano completamente separado de los planos terrenales: una dimensión caótica donde las leyes de la magia, la "
    "física y la realidad se distorsionan. Las Anomalías son quienes han entrado en contacto con él y canalizan su energía para alterar la realidad "
    "con conjuros extraños e inestables. Una Anomalía puede aparecer de cualquier forma (un accidente, un contagio, un encuentro, un nacimiento "
    "extraño) y ser de cualquier raza.\n\n"
    "<b>Zzeryxia, la Diosa anómala.</b> También llamada la Dama de las anomalías, reina en el Plano Anómalo: entropía creativa, errores divinos y "
    "posibilidades improbables. Es neutral caótica: no se inclina hacia el bien ni hacia el mal. Su comprensión de las anomalías la convierte en "
    "una fuente de conocimiento única, pero su mente opera a un nivel de complejidad y caos que puede llevar a la locura a quien la contacta, y "
    "sus respuestas son vagas, crípticas o incomprensibles. En el Plano divino, Zzeryxia y Umbrael, el dios del Vacío, son muy grandes amigos.\n\n"
    "<b>Animalía.</b> La creación de Zzeryxia: una entidad divina casi tan poderosa como su creadora, capaz de alterar la realidad a voluntad. Por "
    "su poder desmedido y su naturaleza impredecible, las entidades pseudo-divinas y cuasi-divinas la encerraron en una prisión dimensional de la "
    "que no puede escapar. Al principio el aislamiento no le perturbó; con el tiempo, la soledad corrompió su mente. Animalía no odia a ninguna "
    "criatura, pero se ha vuelto cruel: los gritos de dolor y las súplicas de piedad son lo único que alimenta su placer mientras maquina su "
    "escape.\n\n"
    "<b>La condena.</b> Su poder es inmenso, pero siempre está al borde del colapso. Cuanto más alto llega una Anomalía, más siente que el Plano "
    "Anómalo la está reclamando. Cómo termina esa historia lo decide la mesa."
)

OFICIAL_VS_AGARIAS = (
    "La Anomalía es una clase de Agarias. Algunos de sus nombres coinciden con los de D&D oficial; en Agarias significan esto:\n"
    "• <b>Hadar.</b> En D&D oficial es un Gran Antiguo, una estrella oscura (los conjuros oficiales <i>Brazos de Hadar</i> y <i>Hambre de Hadar</i>, "
    "y el patrón Gran Antiguo del Brujo). En Agarias, lo que los brujos llaman Hadar es un fragmento del Plano Anómalo. Los conjuros oficiales "
    "siguen funcionando igual; los de la Anomalía que llevan «Hadar» en el nombre son de Agarias.\n"
    "• <b>Conjuros oficiales.</b> La lista incluye conjuros oficiales tal cual (Perdición, Escudo, Armadura de mago, Clarividencia, Invocar "
    "aberración y otros) y algunos modificados: estos últimos dicen al final «Versión de Agarias» y qué cambia respecto al oficial.\n"
    "• <b>Vacío.</b> Es un tipo de daño propio de Agarias (ver Reglas). Lo que el documento original llamaba «daño verdadero» es daño de Vacío.\n"
    "• <b>Corrupto.</b> Es un estado de Agarias (ver Reglas): la Anomalía lo sufre al Colapsar.\n"
    "• <b>Condiciones.</b> La Anomalía usa las condiciones oficiales. «Aterrado» es asustado; «confundido», el efecto del conjuro Confusión; "
    "«ralentizado», el del conjuro Ralentizar; «desorientado», desventaja en tiradas de ataque y pruebas durante 1 turno; «loco», bajo Confusión "
    "durante 1 minuto (salvo que el conjuro diga otra cosa)."
)


# ══ Rasgos de la clase ═════════════════════════════════════════════════════

def block(name, text, efectos=None, elegir=None):
    b = {"name": name, "titleName": f"✦ {name.upper()} ✦", "descripcion": text}
    if efectos:
        b["efectos"] = efectos
    if elegir:
        b["elegir"] = elegir
    return b


FEATURES = {
    1: [
        block("Magia Anómala", "Lanzas conjuros con <b>Sabiduría</b>: CD = 8 + tu bonificador de competencia + tu modificador de Sabiduría; ataque de conjuro = "
              "tu bonificador de competencia + tu modificador de Sabiduría. Tienes los espacios de la tabla (como un lanzador completo) y los recuperas con un "
              "descanso largo; no tienes recuperación en descansos cortos.\n<b>Trucos.</b> Conoces dos trucos de Anomalía; aprendes otro a nivel 4 y otro a nivel 10.\n"
              "<b>Conjuros preparados.</b> Al terminar un descanso largo preparas tantos conjuros de la lista de Anomalía como tu nivel de Anomalía + tu modificador "
              "de Sabiduría (mínimo 1), de niveles para los que tengas espacios. Los eliges en la pestaña <b>Conjuros</b>.\n<b>Foco.</b> Usas un foco anómalo: un objeto "
              "deformado (un reloj sin agujas, un espejo roto, un dado con caras imposibles) que funciona como foco arcano. Eres competente con él como arma improvisada.\n"
              "<b>Multiclase.</b> Para tomar o dejar niveles de Anomalía necesitas Sabiduría 13. No ganas competencias al entrar por multiclase."),
        block("La condena: Estabilidad", "Tu conexión con el Plano Anómalo te sostiene y te consume. Tienes una reserva de <b>Estabilidad</b> igual a tu bonificador "
              "de competencia + tu modificador de Sabiduría (la verás en Recursos). Cada punto de <b>Inestabilidad</b> que ganas gasta un punto de Estabilidad. "
              "Ganas Inestabilidad:\n• +1 al usar Reacción Improbable, Portal Anómalo, Ayuda Anómala, Realidad Inestable o Error Profetizado;\n• +2 al usar Paradox o "
              "Avatar de Zzeryxia; Eco Imposible te deja sin Estabilidad;\n• +1 al lanzar un conjuro con un espacio de nivel 6 o superior;\n• +1 cuando te afecta un "
              "<i>Contrahechizo</i> o un <i>Disipar magia</i> (a ti o a un conjuro tuyo), y al empezar tu turno dentro de un <i>Campo antimagia</i>.\n"
              "<b>Colapso.</b> Cuando te quedas sin Estabilidad, quedas <b>Corrupto</b> (estado de Agarias) hasta el final de tu siguiente turno y tiras en la tabla "
              "de Colapso.\n<b>Más allá del límite.</b> Sin Estabilidad, cada punto de Inestabilidad que ganarías te cuesta un Dado de Golpe (lo pierdes sin tirarlo). "
              "Si no te quedan, no puedes usar el rasgo ni lanzar el conjuro que la causaría; si la Inestabilidad no la eliges tú (un Contrahechizo), no pasa nada más.\n"
              "Recuperas toda la Estabilidad con un descanso largo.\n\n" + table(["d10", "Colapso"], COLAPSO),
              efectos=[recurso("estabilidad", "Estabilidad", {"bc": True, "atributo": "sabiduria"})]),
        block("Conexión Caótica", "Una vez por descanso largo puedes comunicarte telepáticamente con Zzeryxia durante unos instantes. Su respuesta es críptica: "
              "símbolos, imágenes oníricas o frases desconectadas. Elige uno:\n• obtienes una pista vaga sobre un evento futuro, una decisión o una amenaza;\n"
              "• justo después de ver una tirada de d20 tuya, la repites y eliges cuál de las dos tiradas usas.",
              efectos=[recurso("conexion-caotica", "Conexión Caótica", UNO)]),
        block("Afinidad con la relojería", "Las Anomalías ven el mundo en engranajes y resortes, como un reloj que sólo ellas oyen. Eres competente con las "
              "herramientas de hojalatero, tienes ventaja en las pruebas para entender, abrir, reparar o desactivar mecanismos (cerraduras, relojes, trampas "
              "mecánicas, artefactos) y ventaja en las salvaciones contra trampas mecánicas: sientes cuándo algo va a fallar.",
              efectos=[{"type": "competencia", "kind": "herramienta", "value": "Herramientas de hojalatero"}]),
        block("Efectos Anómalos", "Algunos rasgos y conjuros te piden tirar en estas tablas. Las criaturas hacen la salvación contra tu CD de conjuros.\n\n"
              "<b>Efecto Anómalo menor</b> (en ti o a 30 pies)\n" + table(["d10", "Tipo", "Efecto"], MENORES) +
              "\n<b>Efecto Anómalo mayor</b> (en una esfera de 20 pies de radio centrada en el punto del efecto)\n" + table(["d10", "Tipo", "Efecto"], MAYORES)),
        block("El Plano Anómalo", LORE),
        block("Oficial vs. Agarias", OFICIAL_VS_AGARIAS),
    ],
    2: [
        block("Ondas de Distorsión", "Como acción adicional liberas una onda del Plano Anómalo. Elige un efecto:\n• te teletransportas hasta 10 pies a un espacio "
              "libre que puedas ver;\n• creas una ilusión menor (como el truco <i>Ilusión menor</i>);\n• el entorno se distorsiona: los ataques contra ti tienen "
              "desventaja hasta el inicio de tu siguiente turno;\n• <b>Glitch:</b> tiras en la tabla de Efecto Anómalo menor.\nUsos: tu modificador de Sabiduría "
              "(mínimo 1) por descanso largo.",
              efectos=[recurso("ondas-distorsion", "Ondas de Distorsión", SAB)]),
    ],
    3: [
        block("Anomalía en Evolución", "Eliges tu Hebra: <b>Paradoja</b>, <b>Error</b>, <b>Virus</b> o <b>.exe</b>. Te da rasgos a los niveles 3, 6, 10 y 14."),
    ],
    5: [
        block("Reacción Improbable", "Como reacción, cuando una criatura a 60 pies hace una tirada de ataque, una salvación o una prueba de característica (no "
              "hace falta que seas el objetivo), alteras el destino. Elige:\n• <b>Repetir:</b> la criatura repite la tirada y usa el nuevo resultado;\n"
              "• <b>Invertir:</b> un ataque que impacta falla y uno que falla impacta (sin crítico); una salvación o prueba superada se falla, y al revés.\n"
              "Ganas 1 de Inestabilidad. Una vez por descanso corto o largo.",
              efectos=[recurso("reaccion-improbable", "Reacción Improbable", UNO, "todo")]),
    ],
    7: [
        block("Zona Inestable", "Como acción, creas un aura de caos de 10 pies de radio centrada en ti durante 1 minuto (sin concentración). Al crearla, eliges "
              "qué criaturas quedan <b>sintonizadas</b> (tú siempre lo estás). Cada vez que una criatura lanza un conjuro dentro del aura tira 1d6 (las "
              "sintonizadas tiran 2d6 y eligen uno):\n• 1: el conjuro falla sin gastar el espacio;\n• 6: el conjuro hace el máximo en sus dados de daño o curación;\n"
              "• 2–5: nada.\nUna vez por descanso largo.",
              efectos=[recurso("zona-inestable", "Zona Inestable", UNO)]),
    ],
    9: [
        block("Tormenta de Errores", "Cuando lanzas un conjuro de nivel 3 o superior, puedes liberar la energía sobrante: cada criatura hostil a 10 pies de ti hace "
              "una salvación de Sabiduría o queda cegada y bajo el efecto de <i>Confusión</i> hasta el final de su siguiente turno. Una vez por descanso largo.",
              efectos=[recurso("tormenta-errores", "Tormenta de Errores", UNO)]),
    ],
    11: [
        block("Portal Anómalo", "Como acción, abres un portal de 15 pies de diámetro entre tu posición y un lugar de <b>este mismo plano</b> donde hayas estado "
              "al menos una vez. Dura 1 minuto o hasta que lo cierres (sin acción). Cualquier criatura puede cruzarlo en ambos sentidos. Se ve bizarro: "
              "niebla con tentáculos, geometrías imposibles. Ganas 1 de Inestabilidad. Una vez por descanso largo.",
              efectos=[recurso("portal-anomalo", "Portal Anómalo", UNO)]),
    ],
    13: [
        block("Ayuda Anómala", "Como acción, con concentración (hasta 1 minuto), traes dos <b>Manifestaciones anómalas</b>, criaturas a medias del Plano Anómalo. "
              "Elige la forma de cada una (pueden repetirse): Globo de espejos, Figura pixelada o Sombra de voces. Aparecen en espacios libres a 30 pies, actúan "
              "justo después de ti en la iniciativa y obedecen tus órdenes telepáticas (sin acción). Si no les das órdenes, se defienden. Desaparecen a 0 PG o "
              "al terminar el rasgo. Ganas 1 de Inestabilidad. Una vez por descanso largo.\nSus estadísticas están en Criaturas → Añadir criatura → De un catálogo.",
              efectos=[recurso("ayuda-anomala", "Ayuda Anómala", UNO), {"type": "habilita", "value": "invocaciones_anomalia"}]),
    ],
    15: [
        block("Realidad Inestable", "Como acción adicional, fuerzas a la realidad a aceptar tu voluntad: hasta el final de tu siguiente turno tienes ventaja en "
              "todas tus tiradas de ataque, salvaciones y pruebas de característica. Tu forma parpadea y deja ecos contradictorios. Ganas 1 de Inestabilidad. "
              "Una vez por descanso largo.",
              efectos=[recurso("realidad-inestable", "Realidad Inestable", UNO)]),
        block("Eco Imposible", "Cuando morirías (fallas tu tercera salvación contra la muerte o un efecto te mata al instante), una versión alternativa de ti que "
              "sí sobrevivió te reemplaza: apareces en el espacio donde empezaste tu último turno, con los PG, espacios de conjuro y usos que tenías al empezar "
              "ese turno. El resto del mundo no retrocede. Te quedas sin Estabilidad (Colapso). Una vez por descanso largo, y no funciona si ya usaste Avatar de "
              "Zzeryxia desde tu último descanso largo.",
              efectos=[recurso("eco-imposible", "Eco Imposible", UNO)]),
    ],
    17: [
        block("Singularidad", "Cuando lanzas un conjuro de nivel 9, puedes abrir una Singularidad Anómala en una esfera de 20 pies de radio centrada en el punto del "
              "conjuro (o en ti, si es personal). Cada criatura que elijas en el área hace una salvación de Constitución: recibe 8d10 de daño de fuerza, o la mitad "
              "si la supera. Cada criatura que falle se teletransporta en una dirección al azar 10 pies por cada punto de 1d6 (al espacio libre más cercano). Después tiras en la "
              "tabla de Efecto Anómalo mayor. Una vez por descanso largo.",
              efectos=[recurso("singularidad", "Singularidad", UNO)]),
    ],
    18: [
        block("Doble Anomalía", "Puedes mantener la concentración en dos conjuros de Anomalía a la vez, si uno de los dos es de nivel 3 o inferior. Cada vez que "
              "empiezas a mantener dos, ganas 1 de Inestabilidad. Si pierdes la concentración, pierdes los dos. No puedes hacerlo mientras Paradox está activo: "
              "cada versión sigue limitada a una concentración (que comparten)."),
    ],
    20: [
        block("Avatar de Zzeryxia", "Como reacción, cuando vas a caer a 0 PG, fallas una salvación contra la muerte o eres objetivo de un efecto que podría "
              "destruirte o borrarte de la existencia, Zzeryxia toma tu cuerpo hasta el final de tu siguiente turno:\n• eres inmune al daño y a las condiciones;\n"
              "• cada criatura que intente afectarte hace una salvación de Sabiduría CD 20 o queda aturdida hasta el final de su siguiente turno;\n• recuperas un "
              "espacio de conjuro gastado de nivel 6 o inferior, o terminas una condición que te afecte.\nDespués, hasta el final de tu siguiente turno, tienes "
              "desventaja en tiradas de ataque y salvaciones y no puedes lanzar conjuros de nivel 6 o superior. Ganas 2 de Inestabilidad. Una vez por descanso "
              "largo, y no funciona si ya usaste Eco Imposible desde tu último descanso largo.",
              efectos=[recurso("avatar-zzeryxia", "Avatar de Zzeryxia", UNO)]),
    ],
}


# ══ Hebras (subclases, nivel 3) ════════════════════════════════════════════
# Se conservan las claves senda1–senda4 para no romper personajes guardados.

TERROR = [
    ("risa-danada", "Risa Dañada", "Como acción adicional, una risa inquietante: cada criatura a 10 pies hace una salvación de Sabiduría o queda asustada de ti hasta el final de tu siguiente turno. Una vez por descanso corto o largo.", [recurso("risa-danada", "Risa Dañada", UNO, "todo")]),
    ("mandibula-desencajada", "Mandíbula Desencajada", "Como acción, un grito sobrenatural en un cono de 15 pies: cada criatura hace una salvación de Sabiduría o queda asustada de ti durante 1 minuto; repite la salvación al final de cada uno de sus turnos. Una vez por descanso largo.", [recurso("mandibula-desencajada", "Mandíbula Desencajada", UNO)]),
    ("presencia-inquietante", "Presencia Inquietante", "Ventaja en las pruebas de Carisma (Intimidación). Una vez por descanso largo puedes lanzar <i>Causar miedo</i> sin gastar espacio.", [recurso("presencia-inquietante", "Causar miedo (Presencia Inquietante)", UNO)]),
    ("cuerpo-distorsionado", "Cuerpo Distorsionado", "Te contorsionas de forma antinatural: ventaja en las pruebas de Destreza (Sigilo) y en las pruebas para escapar de ataduras o de un agarre.", []),
    ("torsion-rapida", "Torsión Rápida", "Como reacción, cuando una criatura te ataca, te mueves 10 pies sin provocar ataques de oportunidad, dejando un rastro de glitch. Usos: tu bonificador de competencia por descanso largo.", [recurso("torsion-rapida", "Torsión Rápida", BC)]),
    ("te-siguen", "Te Siguen...", "Cuando estás en oscuridad, puedes intentar esconderte aunque te estén observando.", []),
]
CODIGO = [
    ("desfase-visual", "Desfase Visual", "Puedes moverte a través de objetos sólidos hasta 10 pies, como si fueras etéreo (no puedes terminar el movimiento dentro). Una vez por descanso corto o largo.", [recurso("desfase-visual", "Desfase Visual", UNO, "todo")]),
    ("error-de-realidad", "Error de Realidad", "Una vez por descanso largo puedes lanzar <i>Desplazamiento</i> sin gastar espacio. Mientras dura, tu imagen parpadea erráticamente.", [recurso("error-de-realidad", "Desplazamiento (Error de Realidad)", UNO)]),
    ("ruido-blanco-mental", "Ruido Blanco Mental", "Nadie puede leer tu mente: quien lo intente (<i>Detectar pensamientos</i> o similar) sólo oye ruido y recibe daño psíquico igual a tu modificador de Sabiduría. Los conjuros de adivinación que te buscan (<i>Localizar criatura</i>, <i>Escudriñar</i>…) fallan si su lanzador no supera una salvación de Sabiduría contra tu CD de conjuros.", []),
    ("presencia-corrupta", "Presencia Corrupta", "Te mueves a saltos y sacudidas: ignoras el terreno difícil y puedes atravesar el espacio de otras criaturas, pero no terminar tu turno en él.", []),
    ("mente-desvinculada", "Mente Desvinculada", "Tienes ventaja en las salvaciones para no quedar encantado o asustado.", []),
    ("donde-estoy", "¿Dónde estoy?", "Tu existencia cambia constantemente: <i>Localizar criatura</i> y otros conjuros de rastreo no te encuentran.", []),
]


def cualidades_list():
    ops = [{"id": i, "nombre": f"Terror: {n}", "descripcion": d, **({"efectos": e} if e else {})} for i, n, d, e in TERROR]
    ops += [{"id": i, "nombre": f"Código Roto: {n}", "descripcion": d, **({"efectos": e} if e else {})} for i, n, d, e in CODIGO]
    return {"titulo": "Cualidades Mutantes", "ayuda": "Dos a nivel 3 y otras dos a nivel 15, del Terror o del Código Roto (puedes mezclarlas).", "opciones": ops}


def sub(nombre, desc, niveles, listas=None):
    names = ["subBlockUno", "subBlockDos", "subBlockTres"]
    sub_nivel = {}
    for lv, blocks in niveles.items():
        entry = {"infoSubBlock": {}}
        for i, (n, t, efectos, elegir) in enumerate(blocks):
            b = {"subName": n, "subDescripcion": t}
            if efectos:
                b["efectos"] = efectos
            if elegir:
                b["elegir"] = elegir
            entry["infoSubBlock"][names[i]] = b
        sub_nivel[str(lv)] = entry
    s = {"subNombre": nombre, "fuente": "Agarias", "subDescripcion": desc, "subNivel": sub_nivel}
    if listas:
        s["listasDeEleccion"] = listas
    return s


def F(n, t, efectos=None, elegir=None):
    return (n, t, efectos, elegir)


HEBRAS = {
    "senda1": sub("Hebra Paradoja", "✦ HEBRA PARADOJA ✦\nCaminas como una paradoja viviente: existes a la vez en varias líneas temporales, duplicas tu ser y pliegas la causalidad.", {
        3: [F("Espejismo alterado", "Como reacción, cuando una criatura que puedas ver a 30 pies te impacta a ti o a un aliado con un ataque con arma (no mágico), "
              "intercambias tu posición con la del atacante: el ataque le impacta a él y recibe su propio daño. No sirve contra conjuros ni ataques mágicos. "
              "Usos: tu bonificador de competencia por descanso largo.", [recurso("espejismo-alterado", "Espejismo alterado", BC)])],
        6: [F("Ciclo invertido", "Actúas un poco fuera de fase. Como reacción, te mueves 10 pies sin provocar ataques de oportunidad. Usos: tu modificador de "
              "Sabiduría (mínimo 1) por descanso largo.", [recurso("ciclo-invertido", "Ciclo invertido", SAB)])],
        10: [F("Doble consecuencia", "Una vez por descanso largo, cuando lanzas un conjuro de nivel 1 o superior que afecta a una sola criatura y no tiene alcance "
               "personal, puedes afectar también a una segunda criatura dentro del alcance. Además, una vez por descanso largo puedes repetir una tirada en la "
               "tabla de Efecto Anómalo menor y elegir cuál de los dos resultados usas.",
               [recurso("doble-consecuencia", "Doble consecuencia", UNO), recurso("doble-consecuencia-tabla", "Doble consecuencia (repetir tabla)", UNO)])],
        14: [F("Paradox", "Como acción, te desdoblas en una segunda versión de ti durante 1 minuto. La copia aparece en un espacio libre a 30 pies y actúa justo "
               "después de ti en la iniciativa.\n• Las dos versiones <b>comparten</b> los PG, los espacios de conjuro, los usos de los rasgos y la concentración.\n"
               "• Entre las dos, sólo se lanza <b>un conjuro con espacio por ronda</b>; la otra puede lanzar trucos, usar rasgos, moverse y atacar.\n"
               "• Si una de las dos cae a 0 PG, la copia desaparece.\nGanas 2 de Inestabilidad. No puedes usar Doble Anomalía mientras dura. Una vez por "
               "descanso largo.", [recurso("paradox", "Paradox", UNO)])],
    }),
    "senda2": sub("Hebra Error", "✦ HEBRA ERROR ✦\nNo canalizas el caos: lo encarnas como el error de un sistema mal optimizado. La realidad se comporta de forma absurda a tu alrededor, como si fueras un personaje atrapado en un videojuego fallido.", {
        3: [F("Colisión", "Como acción adicional activas Colisión hasta el final de tu turno: caminas por el aire, por las paredes y por el techo como si fueran "
              "suelo, ignoras el terreno difícil, no provocas ataques de oportunidad y puedes atravesar una criatura o un objeto de hasta 5 pies de grosor "
              "(no puedes terminar dentro). Si terminas el turno en el aire, caes. Usos: tu modificador de Sabiduría (mínimo 1) por descanso largo.",
              [recurso("colision", "Colisión", SAB)])],
        6: [F("Física Bugeada", "Como reacción, cuando sufrirías daño por una caída o por un ataque con arma, dices «fuera del mapa»: no recibes ese daño, "
              "desapareces y reapareces en un espacio libre que puedas ver a 30 pies. Una vez por descanso corto o largo.",
              [recurso("fisica-bugeada", "Física Bugeada", UNO, "todo")])],
        10: [F("Realidades Divergentes", "Tu mente explora futuros alternos. Cuando fallas una salvación, puedes repetirla y elegir el resultado: una vez por turno, "
               "y tu modificador de Sabiduría (mínimo 1) veces por descanso largo. Además, al terminar un descanso largo eliges un tipo de tirada (ataque, "
               "salvación o prueba): hasta tu siguiente descanso largo, una vez puedes repetir una tirada de ese tipo y quedarte con la mejor.",
               [recurso("realidades-divergentes", "Realidades Divergentes", SAB), recurso("realidad-elegida", "Realidad elegida", UNO)])],
        14: [F("Error Profetizado", "Una vez por descanso largo, cuando lanzas un conjuro de nivel 6 o inferior, declaras un «error inevitable» en un enemigo: "
               "su siguiente salvación contra ese conjuro falla sin tirar («la realidad parpadea… y decide no cargar la voluntad de tu enemigo»). Una criatura "
               "con Resistencia legendaria puede gastar un uso para superarla igualmente. Ganas 1 de Inestabilidad.",
               [recurso("error-profetizado", "Error Profetizado", UNO)])],
    }),
    "senda3": sub("Hebra Virus", "✦ HEBRA VIRUS ✦\nEres portador de un ente anómalo que se comporta como un virus mágico: corrompe y se replica en las mentes y los cuerpos de otros, como una mente colmena.", {
        3: [F("Infección", "Cuando una criatura falla una salvación contra uno de tus conjuros, puedes marcarla como <b>infectada</b> durante 1 minuto. Mientras "
              "lo esté, tiene desventaja en las salvaciones de concentración y en las salvaciones contra tus conjuros, y no puede recuperar PG con magia (sí pierde "
              "los caramelos de un Experimento 043, porque cualquier curación se los lleva). Sólo puedes tener <b>una</b> criatura infectada a la vez: infectar "
              "a otra cura a la anterior. Reinfectar reinicia la duración.")],
        6: [F("Replicación", "Cuando lanzas un truco o un conjuro de nivel 1 que afecta a una sola criatura, puede replicarse a una segunda criatura a 10 pies "
              "de la primera: hace la misma salvación (o recibe el mismo ataque). Una vez por turno. Si las dos fallan, eliges cuál queda infectada. Usos: tu "
              "bonificador de competencia por descanso largo.", [recurso("replicacion", "Replicación", BC)])],
        10: [F("Ejecución Remota", "Puedes lanzar un conjuro desde dentro de tu criatura infectada si está a 60 pies o menos, sin necesitar verla ni tener "
               "alcance. El conjuro sólo puede tener un objetivo (aunque su efecto se extienda) y, si tiene área, se centra en la infectada. Cuando una criatura "
               "muere mientras está infectada, recuperas 1d12 PG.")],
        14: [F("Devorador de conjuros", "Como reacción, cuando una criatura hostil lanza un conjuro de nivel 4 o inferior que sólo te afecta a ti, hace una "
               "salvación de Inteligencia: si la falla, el conjuro se cancela y recuperas PG iguales a la mitad del daño que habría hecho. Usos: tu modificador "
               "de Sabiduría (mínimo 1) por descanso largo.\n<b>Autopurga.</b> Una vez por descanso largo, como acción adicional, tu criatura infectada hace una "
               "salvación de Constitución: recibe 4d10 de daño psíquico y queda aturdida hasta el final de su siguiente turno, o la mitad sin aturdimiento si la "
               "supera. Pierde la infección.", [recurso("devorador-conjuros", "Devorador de conjuros", SAB), recurso("autopurga", "Autopurga", UNO)])],
    }),
    "senda4": sub("Hebra .exe", "✦ HEBRA .EXE ✦\nNo eres una criatura: eres un concepto corrompido por el Plano Anómalo, una presencia memética hecha para infundir terror.", {
        3: [F("Cualidad Mutante", "Cruzas el umbral entre lo físico y lo imposible. Eliges dos Cualidades Mutantes, del Terror, del Código Roto o una de cada. "
              "A nivel 15 eliges otras dos.", None, {"lista": "cualidades", "cantidad": 2})],
        6: [F("Paquete de Corrupción", "Cuando caerías a 0 PG sin morir en el acto, quedas con 1 PG y te teletransportas hasta 10 pies a un espacio libre que "
              "puedas ver, sin provocar ataques. Una vez por descanso largo.", [recurso("paquete-corrupcion", "Paquete de Corrupción", UNO)])],
        10: [F("Deformación", "Como acción, adoptas una forma terrorífica durante 1 minuto: tus miembros se duplican, tu boca se abre demasiado, tus extremidades "
               "se alargan. Cada criatura que te vea por primera vez en ese minuto hace una salvación de Sabiduría o queda paralizada hasta el final de su turno "
               "(una vez por criatura). Mientras dura, puedes lanzar <i>Imagen mayor</i> una vez sin gastar espacio. Una vez por descanso largo.",
               [recurso("deformacion", "Deformación", UNO)])],
        14: [F("Fragmentación Letal", "Como reacción, cuando una criatura te daña con un ataque o un conjuro, hace una salvación de Inteligencia: si la falla, "
               "recibe 6d6 de daño psíquico y queda aturdida hasta el final de su siguiente turno. Una vez por descanso largo.",
               [recurso("fragmentacion-letal", "Fragmentación Letal", UNO)])],
        15: [F("Cualidad Mutante (nivel 15)", "Eliges otras dos Cualidades Mutantes.", None, {"lista": "cualidades", "cantidad": 2})],
    }, {"cualidades": cualidades_list()}),
}


# ══ Manifestaciones de Ayuda Anómala (class-creatures.json, grupo «anomalia») ══

T = lambda name, text: {"name": name, "text": text}
MANIFESTACIONES = {
    "globo-espejos": {
        "name": "Globo de espejos", "size": "Mediano", "creatureType": "Aberración (manifestación anómala)", "ac": {"base": 13, "bc": True},
        "hp": {"base": 20, "porNivel": 3}, "hpTexto": "20 + 3 × tu nivel", "speed": "0 pies, volar 40 pies (levitar)",
        "abilities": {"fuerza": 10, "destreza": 14, "constitucion": 14, "inteligencia": 12, "sabiduria": 14, "carisma": 8},
        "senses": "Visión en la oscuridad 60 pies, Percepción pasiva 12", "capacidad": False,
        "description": "Un globo flotante de espejos y tentáculos. Dura lo que la Ayuda Anómala (concentración, hasta 1 minuto). Inmune a cegado y psíquico.",
        "actions": [T("Multiataque", "Hace dos ataques de Reflejo."),
                    T("Reflejo", "Ataque de conjuro a distancia (tu bonificador de ataque con conjuros), 120 pies, un objetivo. Impacto: 2d8 de daño radiante.")],
        "reactions": [T("Espejo", "Cuando una criatura a 30 pies te ataca a ti o a un aliado tuyo, el atacante tiene desventaja en ese ataque.")],
    },
    "figura-pixelada": {
        "name": "Figura pixelada", "size": "Mediano", "creatureType": "Aberración (manifestación anómala)", "ac": {"base": 14, "bc": True},
        "hp": {"base": 20, "porNivel": 3}, "hpTexto": "20 + 3 × tu nivel", "speed": "40 pies",
        "abilities": {"fuerza": 14, "destreza": 16, "constitucion": 12, "inteligencia": 10, "sabiduria": 10, "carisma": 6},
        "senses": "Visión en la oscuridad 60 pies, Percepción pasiva 10", "capacidad": False,
        "description": "Una figura humana hecha de píxeles que cambia constantemente. Dura lo que la Ayuda Anómala. Inmune a apresado y derribado.",
        "traits": [T("Salto de fotograma", "Al inicio de su turno puede teletransportarse hasta 20 pies a un espacio libre que vea.")],
        "actions": [T("Multiataque", "Hace dos ataques de Corte de datos."),
                    T("Corte de datos", "Ataque de conjuro cuerpo a cuerpo (tu bonificador de ataque con conjuros), 5 pies. Impacto: 1d10 + tu modificador de Sabiduría de daño psíquico.")],
    },
    "sombra-voces": {
        "name": "Sombra de voces", "size": "Mediano", "creatureType": "Aberración (manifestación anómala)", "ac": {"base": 12, "bc": True},
        "hp": {"base": 25, "porNivel": 3}, "hpTexto": "25 + 3 × tu nivel", "speed": "30 pies, volar 30 pies",
        "abilities": {"fuerza": 6, "destreza": 14, "constitucion": 14, "inteligencia": 12, "sabiduria": 14, "carisma": 16},
        "senses": "Visión en la oscuridad 120 pies, Percepción pasiva 12", "capacidad": False,
        "description": "Una sombra que habla con muchas voces a la vez. Dura lo que la Ayuda Anómala. Puede atravesar criaturas y objetos como terreno difícil.",
        "actions": [T("Toque helado", "Ataque de conjuro cuerpo a cuerpo (tu bonificador de ataque con conjuros), 5 pies. Impacto: 2d8 de daño necrótico."),
                    T("Coro", "Cada criatura que elija a 15 pies hace una salvación de Sabiduría contra tu CD de conjuros o queda asustada hasta el final de su siguiente turno. Recarga 5–6.")],
    },
}


# ══ Conjuros ═══════════════════════════════════════════════════════════════

def spell(nombre, nivel, escuela, tiempo, alcance, comps, dur, texto, tipo, version=None, origen="Agarias"):
    desc = texto
    if version:
        desc += f"\n\n⟡ Versión de Agarias de «{version[0]}» ({version[1]}). Cambios: {version[2]}"
    return {"nombre": nombre, "entry": {
        "tipo": list(tipo), "escuela": escuela, "nivel": "Truco" if nivel == 0 else nivel, "origen": origen,
        "componentes": comps, "tiempoLanzamiento": tiempo, "alcance": alcance, "duracion": dur,
        "listaConjurador": "Conjuros de Anomalía.", "conjuradorTrue": {CLASS: True},
        "descripcion": desc,
    }}


HADAR_NOTE = "\nEn Agarias, Hadar es un fragmento del Plano Anómalo (ver «Oficial vs. Agarias» en la Anomalía)."
SUP = "<b>A niveles superiores.</b> "

SPELLS = [
    # ── Trucos ──
    spell("Contraer la Realidad", 0, "Transmutación", "1 acción", "Toque", "V, S", "Concentración, hasta 10 minutos",
          "Tú o una criatura voluntaria que toques encogéis hasta una escala entre vuestra altura normal y 10 cm (la eliges al lanzarlo). Mientras dure, el "
          "objetivo tiene ventaja en las pruebas de Destreza (Sigilo) y puede pasar por huecos diminutos; las criaturas más grandes que él tienen desventaja en "
          "sus ataques contra él; tiene desventaja en las pruebas de Fuerza y en los ataques cuerpo a cuerpo, y no puede manipular objetos grandes ni empujar "
          "criaturas. Al terminar recupera su tamaño al instante (en el espacio libre más cercano si el suyo está ocupado).",
          ["Utilidad", "Cambiaformas"], ("Agrandar/Reducir", "Manual del Jugador", "es un truco, sólo reduce, no cambia el daño y afecta a un solo objetivo.")),
    spell("Mano de la Falla", 0, "Conjuración", "1 acción", "30 pies", "V, S", "Concentración, hasta 1 minuto",
          "Aparece una mano etérea y temblorosa hecha de esencia anómala. Puede manipular objetos de hasta 10 libras (4,5 kg), abrir recipientes y accionar "
          "cerraduras, interruptores y mecanismos sencillos. No puede atacar ni activar objetos mágicos. Como acción la mueves hasta 30 pies; desaparece si se "
          "aleja más de 30 pies de ti.", ["Utilidad"], ("Mano de mago", "Reglas básicas", "requiere concentración y tiene aspecto anómalo.")),
    spell("Visión Anómala", 0, "Adivinación", "1 acción", "Personal (radio de 30 pies)", "V, S, M (un fragmento de cristal distorsionado)", "Concentración, hasta 10 minutos",
          "Ves la estructura caótica de la realidad: notas la magia a 30 pies, como con <i>Detectar magia</i>, y tienes ventaja en las pruebas de Sabiduría "
          "(Percepción) e Inteligencia (Investigación) para encontrar puertas ocultas, trampas, estructuras inestables, objetos mágicos o anomalías.",
          ["Detección"], ("Detectar magia", "Reglas básicas", "es un truco con radio de 30 pies y da ventaja para buscar.")),
    spell("Catástrofe / Apocalipsis", 0, "Evocación", "1 acción", "60 pies", "V, S", "Instantánea",
          "Dos caras de un mismo poder: al aprender este truco conoces las dos y eliges cuál lanzas cada vez.\n• <b>Catástrofe:</b> una criatura que puedas "
          "ver hace una salvación de Constitución o recibe 1d8 de daño contundente.\n• <b>Apocalipsis:</b> una criatura que puedas ver hace una salvación de "
          "Sabiduría o recibe 1d8 de daño psíquico.\nEl daño sube a 2d8 a nivel 5, 3d8 a nivel 11 y 4d8 a nivel 17. Son un eco del Armagedón, un Secreto del "
          "Plano Anómalo.", ["Daño", "Contundente", "Psíquico"]),
    spell("Toque del Anómalo", 0, "Transmutación", "1 acción", "Toque", "V, S", "1 minuto",
          "Reconfiguras la estructura vital de una criatura: gana 1d6 + tu modificador de Sabiduría PG temporales durante 1 minuto (no se suman a otros PG "
          "temporales). Sube a 2d6 a nivel 5, 3d6 a nivel 11 y 4d6 a nivel 17. No afecta a muertos vivientes ni constructos.", ["Protección"]),
    # ── Nivel 1 ──
    spell("Descarga del caos", 1, "Evocación", "1 acción", "120 pies", "V, S", "Instantánea",
          "Haz un ataque de conjuro a distancia. Si impacta, el objetivo recibe 2d8 de daño de uno de los tipos que indican los dos d8 (eliges): 1 ácido, 2 "
          "frío, 3 fuego, 4 vacío, 5 relámpago, 6 veneno, 7 psíquico, 8 trueno. Si los dos d8 sacan el mismo número, la energía salta a otra criatura a 30 "
          "pies del objetivo: nuevo ataque y nuevo daño (puede volver a saltar). Cada criatura sólo puede ser objetivo una vez por lanzamiento.\n" + SUP +
          "+1d6 por cada nivel por encima del 1.", ["Daño"],
          ("Descarga de caos", "Guía de Xanathar", "no suma 1d6 extra y la tabla cambia fuerza por vacío (el daño de Vacío asfixia y puede atraer 5 pies; ver Reglas).")),
    spell("Brazos de Hadar", 1, "Conjuración", "1 acción", "30 pies", "V, S", "Instantánea",
          "Brazos tentaculares surgen del suelo en un punto: cada criatura a 10 pies de él hace una salvación de Fuerza. Si falla, recibe 2d6 de daño necrótico "
          "y queda apresada hasta el inicio de tu siguiente turno (puede usar su acción para repetir la salvación y soltarse). Si la supera, la mitad y no queda "
          "apresada.\n" + SUP + "+1d6 por cada nivel por encima del 1." + HADAR_NOTE, ["Daño", "Necrótico", "Control"],
          ("Brazos de Hadar", "Manual del Jugador", "aparece en un punto a 30 pies (no centrado en ti) y apresa en lugar de quitar la reacción.")),
    spell("Susurros disonantes", 1, "Encantamiento", "1 acción", "60 pies", "V", "Instantánea",
          "Una criatura que elijas oye una melodía disonante que sólo ella percibe y hace una salvación de Sabiduría. Si falla, recibe 3d6 de daño psíquico y "
          "debe usar su reacción, si la tiene, para alejarse de ti tanto como pueda (sin meterse en peligros evidentes). Si la supera, la mitad y no se mueve. "
          "Una criatura ensordecida la supera automáticamente.\n" + SUP + "+1d6 por cada nivel por encima del 1.", ["Daño", "Psíquico"], origen="Manual del Jugador"),
    spell("Causar miedo", 1, "Nigromancia", "1 acción", "60 pies", "V", "Concentración, hasta 1 minuto",
          "Una criatura que puedas ver hace una salvación de Sabiduría o queda asustada de ti mientras dure; repite la salvación al final de cada uno de sus "
          "turnos. Los constructos y los muertos vivientes son inmunes.\n" + SUP + "+1 criatura por cada nivel por encima del 1 (a 30 pies entre sí).",
          ["Control"], origen="Guía de Xanathar"),
    spell("Vida falsa", 1, "Nigromancia", "1 acción", "Personal", "V, S, M (un poco de alcohol o licor destilado)", "1 hora",
          "Te refuerzas con una armadura nigromántica de vida: ganas 1d8 + 4 PG temporales mientras dure.\n" + SUP + "+5 PG temporales por cada nivel por "
          "encima del 1.", ["Protección"], ("Vida falsa", "Manual del Jugador", "da 1d8 + 4 PG temporales en lugar de 1d4 + 4.")),
    spell("Huracán Arcoíris", 1, "Evocación", "1 acción", "Línea de 30 pies o cono de 15 pies (eliges)", "V, S, M (polvo o arena roja, amarilla y azul)", "Instantánea",
          "Un torrente iridiscente de energía anómala: cada criatura en el área hace una salvación de Constitución. Si falla, recibe 2d6 de daño contundente y "
          "queda derribada. Si la supera, la mitad y no cae.\n" + SUP + "+1d6 por cada nivel por encima del 1.", ["Daño", "Contundente", "Control"]),
    # ── Nivel 2 ──
    spell("Caos pulsante", 2, "Evocación", "1 acción", "60 pies", "V, S, M (un trozo de cristal fracturado)", "Instantánea",
          "Haz un ataque de conjuro a distancia. Si impacta, el objetivo recibe 3d8 de daño de un tipo al azar (1d4): 1 psíquico, 2 trueno, 3 relámpago, 4 "
          "necrótico.\n" + SUP + "+1d8 por cada nivel por encima del 2.", ["Daño"]),
    spell("Bocas Hambrientas de Hadar", 2, "Conjuración", "1 acción", "60 pies", "V, S, M (un fragmento de carbón)", "Concentración, hasta 1 minuto",
          "Una esfera de oscuridad anómala de 10 pies de radio aparece en un punto: es oscuridad mágica, terreno difícil, y dentro se oyen susurros, mordidas y "
          "chillidos. Cada criatura hostil que empiece su turno dentro hace una salvación de Destreza: si falla, recibe 2d6 de daño necrótico y tiene desventaja "
          "en su siguiente tirada de ataque; si la supera, la mitad. Una criatura que muere dentro no puede ser resucitada durante 1 minuto.\n" + SUP +
          "+1d6 por cada nivel por encima del 2." + HADAR_NOTE, ["Daño", "Necrótico", "Control"],
          ("Hambre de Hadar", "Manual del Jugador", "es de nivel 2 con 10 pies de radio (no 20) y hace un solo daño necrótico al empezar el turno.")),
    spell("Disrupción temporal", 2, "Transmutación", "1 acción", "30 pies", "V, S, M (una esfera de cristal rota)", "Concentración, hasta 1 minuto",
          "Una criatura hace una salvación de Sabiduría. Si falla, al inicio de cada uno de sus turnos pierde 5 pies de velocidad (se acumula); si llega a 0, "
          "queda paralizada mientras dure. Repite la salvación al final de cada uno de sus turnos y, si la supera, termina.\n" + SUP +
          "+1 criatura por cada nivel por encima del 2.", ["Control"]),
    spell("Escudo de distorsión", 2, "Abjuración", "1 acción", "Personal", "V, S, M (un espejo roto)", "Concentración, hasta 1 minuto",
          "El espacio a tu alrededor fluctúa. Cuando te impacta un ataque, tira 1d4: con un 4, el ataque falla.", ["Protección"]),
    spell("Fallo de realidad", 2, "Ilusión", "1 acción", "60 pies", "V, S", "Concentración, hasta 1 minuto",
          "Una zona de 10 pies de radio se vuelve inestable. Cada criatura que entre en ella o empiece ahí su turno hace una salvación de Sabiduría. Si falla, "
          "hasta el final de su turno tiene desventaja en los ataques contra criaturas dentro de la zona y en las salvaciones contra efectos que salgan de ella.\n"
          + SUP + "+10 pies de radio por cada nivel por encima del 2.", ["Control", "Engaño"]),
    spell("Alterarse a sí mismo", 2, "Transmutación", "1 acción", "Personal", "V, S", "Concentración, hasta 1 hora",
          "Eliges una forma; con una acción puedes cambiar a otra mientras dure:\n• <b>Adaptación acuática:</b> respiras bajo el agua y tienes velocidad de "
          "nado igual a la de caminar.\n• <b>Cambiar de apariencia:</b> cambias tu aspecto (altura, peso, rasgos, voz…) sin cambiar de tamaño ni de forma básica.\n"
          "• <b>Armas naturales:</b> tus golpes sin armas hacen 1d6 de daño contundente, perforante o cortante (según el arma natural), eres competente con ellos "
          "y son mágicos con +1 al ataque y al daño.", ["Cambiaformas", "Utilidad"], origen="Manual del Jugador"),
    # ── Nivel 3 ──
    spell("Virus de la Realidad", 3, "Conjuración", "1 acción", "30 pies", "V, S, M (un trozo de cristal roto)", "1 minuto",
          "Una criatura hace una salvación de Constitución. Si falla, recibe 4d8 de daño psíquico y queda <b>infectada</b> durante 1 minuto: desventaja en las "
          "salvaciones de concentración y no puede recuperar PG con magia. Repite la salvación al final de cada uno de sus turnos. Si la supera, la mitad y no se "
          "infecta. Con la Hebra Virus, cuenta como tu Infección (sólo una criatura a la vez).\n" + SUP + "+1d8 por cada nivel por encima del 3.", ["Daño", "Psíquico"]),
    spell("Desfase Digital", 3, "Transmutación", "1 acción", "30 pies", "V, S, M (un trozo de código escrito en papel)", "Concentración, hasta 1 minuto",
          "Una criatura hace una salvación de Constitución. Si falla, su cuerpo parpadea entre fases: tiene desventaja en las tiradas de ataque y no puede usar "
          "reacciones, aunque tiene ventaja en las salvaciones de Destreza. Repite la salvación al final de cada uno de sus turnos.\n" + SUP +
          "+1 criatura por cada nivel por encima del 3.", ["Control"]),
    spell("Paradoja Espectral", 3, "Adivinación", "1 acción", "60 pies", "V, S", "Concentración, hasta 1 minuto",
          "Una criatura que puedas ver hace una salvación de Sabiduría. Si falla, queda atrapada en una versión espectral de sí misma: no puede hacer ni recibir "
          "daño contundente, perforante ni cortante y no puede mover objetos ni criaturas. Repite la salvación al final de cada uno de sus turnos.\n" + SUP +
          "+1 criatura por cada nivel por encima del 3.", ["Control"]),
    spell("Corona de Hadar", 3, "Encantamiento", "1 acción", "30 pies", "V, S", "Concentración, hasta 1 minuto",
          "Una corona de tentáculos negros flota sobre un humanoide que puedas ver. Hace una salvación de Sabiduría o queda encantado por ti y obedece órdenes "
          "verbales sencillas (abrir puertas, entregar objetos, activar mecanismos, protegerte…). No puede atacar, lanzar conjuros dañinos ni dañar a nadie, "
          "ni hacer nada evidentemente peligroso para él o contrario a su naturaleza. Repite la salvación al final de cada uno de sus turnos.\n" + SUP +
          "+1 criatura por cada nivel por encima del 3." + HADAR_NOTE, ["Control", "Social"]),
    spell("Reparación de código", 3, "Nigromancia", "1 acción", "Toque", "V, S, M (una astilla iridiscente de cristal ancestral de 300 po, que se consume)", "Instantánea",
          "Tocas a una criatura que haya muerto en el último minuto. Si su alma quiere volver y nada se lo impide, reescribes su «código vital» y vuelve a la vida "
          "con 1 PG. No funciona con quien murió de vejez ni devuelve partes del cuerpo perdidas.", ["Curación"],
          ("Revivir", "Reglas básicas", "el mismo efecto con otro componente.")),
    # ── Nivel 4 ──
    spell("Rebobinar Destino", 4, "Adivinación", "1 reacción, cuando una criatura que puedas ver a 60 pies falla una tirada de ataque, una salvación o una prueba", "60 pies", "V, S", "Instantánea",
          "La criatura repite la tirada fallida y usa el nuevo resultado. Tú recibes 2d6 de daño psíquico que no se puede reducir de ninguna forma.\n" + SUP +
          "con un espacio de nivel 5 recibes 1d6; con uno de nivel 6 o superior, nada.", ["Ayuda"]),
    spell("Errores de Fase", 4, "Transmutación", "1 acción", "60 pies", "V, S, M (un fragmento de espejo roto)", "Concentración, hasta 1 minuto",
          "Una criatura hace una salvación de Sabiduría. Si falla, recibe 2d10 de daño psíquico y entra y sale de fase: tiene desventaja en sus tiradas de "
          "ataque, ventaja en Destreza (Sigilo), y los ataques contra ella tienen ventaja. Repite la salvación al final de cada uno de sus turnos. Si la supera, "
          "la mitad del daño y nada más.\n" + SUP + "+1d10 por cada nivel por encima del 4.", ["Daño", "Psíquico", "Control"]),
    spell("Inyección de Realidad", 4, "Conjuración", "1 acción", "90 pies", "V, S", "Concentración, hasta 1 minuto",
          "Una criatura hace una salvación de Constitución. Si falla, recibe 3d10 de daño de fuerza y su cuerpo se vuelve borroso: la primera vez que recibe "
          "daño en cada turno, recibe 1d10 de daño de fuerza adicional. Repite la salvación al final de cada uno de sus turnos. Si la supera, la mitad del daño "
          "y nada más.\n" + SUP + "+1d10 al daño inicial por cada nivel por encima del 4.", ["Daño", "Fuerza"]),
    spell("Ciclo de Restauración Anómala", 4, "Transmutación", "1 acción", "30 pies", "V, S", "Concentración, hasta 1 minuto",
          "Una criatura que puedas ver tira 1d6 al inicio de cada uno de sus turnos: 1, nada; 2–4, recupera 2d6 PG; 5, recupera 4d6 PG; 6, recupera 4d6 PG y "
          "termina una de estas: cegado, ensordecido, envenenado, asustado o bajo <i>Ralentizar</i>. El conjuro termina tras cinco tiradas. Una criatura sólo "
          "puede tener un Ciclo a la vez. No afecta a muertos vivientes ni constructos.", ["Curación"]),
    spell("Ojos de Hadar", 4, "Adivinación", "1 acción", "Personal", "V, S", "Concentración, hasta 10 minutos",
          "Tus ojos se llenan de pupilas flotantes. A 60 pies ves criaturas y objetos invisibles, reconoces las ilusiones como falsas y ves las puertas y "
          "trampas ocultas por magia. Tienes ventaja en las pruebas de Sabiduría (Percepción) que usan la vista.\n" + SUP + "con un espacio de nivel 6 o "
          "superior, ganas visión verdadera a 120 pies durante 1 hora, sin concentración." + HADAR_NOTE, ["Detección"],
          ("Visión verdadera", "Reglas básicas", "es de nivel 4 con concentración y 60 pies, y no ve las formas originales ni el Plano Etéreo (salvo a nivel 6+).")),
    # ── Nivel 5 ──
    spell("Contactar otro plano", 5, "Adivinación", "1 minuto (ritual)", "Personal", "V", "1 minuto",
          "Contactas mentalmente con Zzeryxia. Haz una salvación de Inteligencia CD 15. Si fallas, recibes 6d6 de daño psíquico y quedas loco hasta terminar un "
          "descanso largo: no puedes realizar acciones, no entiendes a nadie, no puedes leer y sólo hablas en galimatías (<i>Restablecimiento mayor</i> lo "
          "termina). Si la superas, puedes hacerle hasta cinco preguntas antes de que termine: el DM responde con una palabra («sí», «no», «tal vez», «nunca», "
          "«irrelevante» o «poco claro»), o con una frase corta si una palabra engañaría. Zzeryxia es críptica.", ["Comunicación", "Ritual"],
          ("Contactar otro plano", "Manual del Jugador", "siempre contacta con Zzeryxia, la Diosa anómala.")),
    spell("Reflejo Distorsionado", 5, "Ilusión", "1 acción", "60 pies", "V, S, M (un espejo de mano de plata)", "Instantánea",
          "Una criatura que puedas ver se enfrenta a un eco de sí misma y hace una salvación de Sabiduría. Si falla, repite su última acción contra sí misma: si "
          "era un ataque, se impacta automáticamente; si afectaba a varios objetivos, sólo la afecta a ella. No se refleja (y sólo sufre lo del éxito) una acción "
          "legendaria, de guarida, con Recarga (como un aliento) o un conjuro de nivel superior al espacio que usaste. Si supera la salvación, tiene desventaja en "
          "su siguiente tirada de ataque o prueba.", ["Daño", "Control"]),
    spell("Bucle de Caos", 5, "Transmutación", "1 acción", "120 pies", "V, S", "Concentración, hasta 1 minuto",
          "Una criatura hace una salvación de Sabiduría. Si falla, queda atrapada en un bucle: en cada uno de sus turnos debe repetir el mismo movimiento y la "
          "misma acción que en su turno anterior, contra el mismo objetivo si sigue siendo posible; si no puede, pierde esa acción. Repite la salvación al final "
          "de cada uno de sus turnos.\n" + SUP + "+1 criatura por cada nivel por encima del 5.", ["Control"]),
    spell("Palabra de Hadar", 5, "Encantamiento", "1 acción", "30 pies", "V, S", "Concentración, hasta 1 minuto",
          "Una criatura que puedas ver hace una salvación de Sabiduría. Si falla, mientras dure puedes usar una acción para declarar una <b>Afirmación de Hadar</b> "
          "(hasta tres por lanzamiento):\n• obligarla a una acción concreta («te arrodillas», «entrega tu arma»);\n• alterar su percepción («tu piel es ceniza»);\n"
          "• un efecto menor en el entorno, sólo para ella («las paredes se desmoronan»).\nCada vez, haz una salvación de Carisma contra tu propia CD. Si la "
          "superas, ocurre (nunca causa daño directo ni muerte inmediata). Si fallas, el DM elige: recibes 4d10 de daño necrótico; quedas cegado, ensordecido o "
          "bajo <i>Confusión</i> durante 1 minuto; o la afirmación afecta a un aliado cercano. Nada puede igualar un conjuro de nivel 6 o superior." + HADAR_NOTE,
          ["Control", "Social"]),
    spell("Paradoja Invertida", 5, "Transmutación", "1 acción", "60 pies", "V, S, M (un reloj de arena roto)", "Concentración, hasta 1 minuto",
          "Dos criaturas que puedas ver hacen una salvación de Sabiduría (una voluntaria puede fallarla). Si las dos fallan, mientras dure el daño que reciba "
          "una lo recibe la otra en su lugar, y al revés. Si una muere, la otra cae a 0 PG.\n" + SUP + "+1 criatura por cada nivel por encima del 5 (el daño "
          "pasa a la siguiente en el orden que elijas al lanzarlo).", ["Control"]),
    spell("Virus de Memoria", 5, "Encantamiento", "1 acción", "60 pies", "V, S", "Concentración, hasta 1 minuto",
          "Una criatura hace una salvación de Inteligencia. Si falla, olvida un conjuro, rasgo o ataque que elijas (si no sabes cuál tiene, el DM elige el último "
          "que usó). Cada vez que intente usarlo, recibe 4d6 de daño psíquico y el intento falla. Repite la salvación al final de cada uno de sus turnos.\n" + SUP +
          "+1 capacidad olvidada por cada nivel por encima del 5.", ["Control", "Daño", "Psíquico"]),
    # ── Nivel 6 ──
    spell("Grito del Núcleo Ancestral", 6, "Evocación", "1 acción", "120 pies", "V, S, M (una astilla de obsidiana negra de 400 po)", "Instantánea",
          "Un círculo de sonido distorsionado de 30 pies de radio. Cada criatura dentro hace una salvación de Constitución: si falla, recibe 8d8 de daño "
          "necrótico y queda cegada y ensordecida durante 1 minuto (repite la salvación al final de cada uno de sus turnos); si la supera, la mitad y nada más. "
          "Las criaturas sordas tienen ventaja. Los objetos no mágicos que nadie lleve y tengan 20 PG o menos se desintegran.", ["Daño", "Necrótico", "Control"]),
    spell("Alas de Hadar", 6, "Transmutación", "1 acción", "Personal", "V, S", "Concentración, hasta 10 minutos",
          "Te brotan alas de tentáculos negros: velocidad de vuelo de 60 pies, sin daño por caídas y ventaja en las salvaciones de Fuerza y Constitución. Una vez "
          "por turno, como acción adicional, azotas con ellas: cada criatura a 10 pies hace una salvación de Destreza o recibe 3d6 de daño necrótico y cae "
          "derribada (la mitad y sin caer si la supera). Si el conjuro termina en un lugar sagrado o consagrado, haz una salvación de Carisma CD 16 o quedas "
          "aturdido hasta el final de tu siguiente turno." + HADAR_NOTE, ["Movimiento", "Daño", "Necrótico"]),
    spell("Mirada de la Anomalía", 6, "Adivinación", "1 acción", "60 pies", "V, S", "Concentración, hasta 1 minuto",
          "Un ojo de Zzeryxia aparece sobre una criatura, que hace una salvación de Sabiduría. Si falla, queda desorientada: desventaja en las tiradas de ataque "
          "y no puede usar reacciones. Al inicio de su siguiente turno repite la salvación: si vuelve a fallar, queda aturdida hasta el final de ese turno. "
          "Después repite la salvación al final de cada uno de sus turnos para terminar el efecto. Mientras dure, ves a través de sus ojos, aunque esté en otro "
          "plano o en oscuridad mágica.", ["Control", "Detección"]),
    spell("Fauces del Plano Anómalo", 6, "Conjuración", "1 acción", "90 pies", "V, S, M (dientes de una criatura extraplanar)", "Concentración, hasta 1 minuto",
          "Una mandíbula espectral flota sobre un punto. Cada criatura que empiece su turno a 10 pies de ella hace una salvación de Fuerza: si falla, es "
          "arrastrada 10 pies hacia ella y recibe 6d6 de daño necrótico; si la supera, la mitad. Como acción adicional puedes moverla hasta 20 pies.",
          ["Daño", "Necrótico", "Control"]),
    spell("Tormenta de Vidrioceniza", 6, "Evocación", "1 acción", "150 pies", "V, S, M (ceniza mezclada con cristal molido)", "Concentración, hasta 1 minuto",
          "Una tormenta de ceniza negra y cristal gira en un radio de 20 pies. Es terreno difícil y no se ve más allá de 10 pies dentro. Cada criatura que entre "
          "por primera vez en un turno o empiece ahí su turno hace una salvación de Constitución: si falla, recibe 3d6 de daño de fuego y 3d6 de daño cortante y "
          "queda cegada hasta el inicio de su siguiente turno; si la supera, la mitad y no se ciega.", ["Daño", "Fuego", "Control"]),
    spell("Barrera Psiónica", 6, "Abjuración", "1 reacción, cuando eres objetivo de un conjuro o de un ataque mágico", "Personal", "V, S", "1 minuto",
          "Un escudo de pura voluntad: tienes resistencia al daño psíquico, eres inmune a quedar encantado o asustado y sumas +3 a tus salvaciones de "
          "Inteligencia, Sabiduría y Carisma. Quien intente leer tu mente o detectarte con magia recibe 2d10 de daño psíquico.", ["Protección", "Daño"]),
    spell("Reescribir la Carne", 6, "Transmutación", "1 acción", "60 pies", "V, S", "Instantánea",
          "Reescribes el código de los cuerpos: hasta seis criaturas que elijas recuperan 4d8 + tu modificador de Sabiduría PG cada una. Tira 1d4: 1, una de "
          "ellas (la elige el DM) pierde 2d8 PG en lugar de curarse; 2–3, normal; 4, una que elijas recupera el doble. No afecta a muertos vivientes ni "
          "constructos.", ["Curación"], ("Curar heridas en masa", "Reglas básicas", "es de nivel 6, cura 4d8 en lugar de 3d8 y añade la tirada de caos.")),
    # ── Nivel 7 ──
    spell("Capa de Hadar", 7, "Transmutación", "1 acción", "Personal", "V, S, M (una pluma negra y un trozo de tela quemada)", "Concentración, hasta 1 minuto",
          "Una capa viva de sombra líquida te cubre: resistencia al daño de fuerza, necrótico y psíquico. La primera vez en cada turno que una criatura te "
          "impacta cuerpo a cuerpo, recibe 2d8 de daño necrótico. Una vez por ronda, como reacción, te disipas en humo y te teletransportas 30 pies a un espacio "
          "que veas. Al terminar, haz una salvación de Sabiduría CD 16 o quedas bajo <i>Confusión</i> hasta el final de tu siguiente turno." + HADAR_NOTE,
          ["Protección", "Teletransporte", "Daño"]),
    spell("Puerta de Sangreal", 7, "Conjuración", "1 minuto", "10 pies", "V, S, M (un anillo de sangre solidificada)", "1 minuto",
          "Una puerta vertical lleva a un lugar de cualquier plano donde hayas estado al menos una vez. Tú y hasta diez criaturas voluntarias podéis cruzarla "
          "en ambos sentidos mientras dure. Quien la cruza queda marcado con el símbolo de Sangreal: ventaja en las salvaciones contra encantamientos y "
          "maldiciones durante 1 hora.", ["Teletransporte"]),
    spell("Llamarada del Pacto Final", 7, "Evocación", "1 acción", "150 pies", "V, S, M (una calavera calcinada en miniatura)", "Instantánea",
          "Fuego verde espectral en una esfera de 20 pies de radio. Cada criatura hace una salvación de Destreza: si falla, recibe 10d6 de daño de fuego y 2d6 "
          "de daño psíquico y no puede recuperar PG con magia hasta el final de su siguiente turno; si la supera, la mitad y nada más. Termina los conjuros de "
          "nivel 3 o inferior activos en el área. No daña objetos no mágicos.", ["Daño", "Fuego", "Psíquico"]),
    spell("Reverso del Tiempo Menor", 7, "Transmutación", "1 reacción, cuando una criatura a 60 pies muere o queda incapacitada", "60 pies", "V, S", "Instantánea",
          "Tiras de los hilos del destino: la criatura vuelve a como estaba al inicio de su último turno (posición, PG y condiciones). Queda aturdida hasta el "
          "final de su siguiente turno, desorientada por el flujo temporal. No sirve contra la muerte por vejez. Sólo puedes lanzarlo una vez por descanso "
          "largo.", ["Curación", "Ayuda"]),
    spell("Orbe del Juicio Estático", 7, "Evocación", "1 acción", "120 pies", "V, S, M (una perla rota y un alfiler)", "Concentración, hasta 1 minuto",
          "Un orbe de energía estática de 20 pies de radio flota en un punto. Cada criatura hostil que empiece su turno dentro hace una salvación de Constitución: "
          "si falla, recibe 4d10 de daño radiante y no puede lanzar conjuros hasta el final de su siguiente turno; si la supera, la mitad. Como acción adicional "
          "puedes moverlo hasta 30 pies.", ["Daño", "Radiante", "Control"]),
    # ── Nivel 8 ──
    spell("Requiem del Vacío", 8, "Nigromancia", "1 acción", "60 pies", "V, S, M (una cuerda cortada en tres partes)", "Concentración, hasta 1 minuto",
          "Un canto prohibido atrae a las almas moribundas. Cada vez que una criatura muere a 60 pies de ti mientras dure, ganas 40 PG temporales (no se suman a "
          "otros) y puedes usar tu reacción para que su cadáver estalle: cada criatura a 10 pies hace una salvación de Constitución o recibe 5d10 de daño "
          "necrótico (la mitad si la supera). Como mucho tres explosiones.", ["Daño", "Necrótico", "Protección"]),
    spell("Ojo de la Eternidad", 8, "Adivinación", "1 minuto", "El mismo plano", "V, S, M (un cristal azul profundo)", "Concentración, hasta 10 minutos",
          "Un gran ojo de luz cósmica aparece en un lugar de este plano que hayas visto, te hayan descrito o donde hayas estado. Ves y oyes desde él como si "
          "estuvieras allí, también a través de barreras (salvo 1 pulgada de plomo o 3 pies de piedra), y puedes lanzar conjuros de adivinación a través de él. "
          "Las criaturas con visión verdadera ven el ojo.", ["Detección"]),
    spell("Lienzo de Realidad Fluida", 8, "Ilusión", "1 acción", "90 pies", "V, S, M (una gota de tinta mágica y un espejo de 950 po)", "Concentración, hasta 1 minuto",
          "Un cubo de 60 pies de lado se vuelve un espacio ilusorio y maleable: creas paredes, huecos, escaleras o plataformas ilusorias, y como acción adicional "
          "recoloreas o mueves sus elementos. Cada criatura que empiece su turno dentro hace una salvación de Sabiduría o tiene desventaja en las tiradas de "
          "ataque y pruebas de característica hasta el inicio de su siguiente turno. Una prueba de Inteligencia (Investigación) contra tu CD revela que un "
          "elemento concreto es ilusorio.", ["Control", "Engaño"]),
    spell("Llamas del Comienzo del Mundo", 8, "Evocación", "1 acción", "150 pies", "V, S, M (un fragmento de magma solidificado)", "Instantánea",
          "Llamas primordiales en una esfera de 40 pies de radio. Cada criatura hace una salvación de Destreza: si falla, recibe 10d10 de daño de fuego que "
          "ignora la resistencia al fuego (no la inmunidad); si la supera, la mitad. El área queda carbonizada y es terreno difícil hasta que se enfría "
          "(1d4 horas).", ["Daño", "Fuego"]),
    # ── Nivel 9 ──
    spell("Desgarro del Tiempo", 9, "Transmutación", "1 acción", "300 pies", "V, S, M (un reloj de arena sin arena)", "Concentración, hasta 1 minuto",
          "Abres una grieta en el tiempo. Hasta seis criaturas que elijas a 60 pies del punto hacen una salvación de Constitución. Si fallan, quedan fuera del "
          "tiempo durante 1d4 rondas: no actúan, no se mueven, no pueden ser objetivo ni recibir daño y luego vuelven a su espacio. Si la superan, quedan bajo "
          "<i>Ralentizar</i> y con desventaja en los ataques y salvaciones mientras dure. Mientras te concentres, puedes usar una acción para acelerar o "
          "revertir el tiempo en la zona con fines narrativos (envejecer una fortaleza, rejuvenecer un cadáver), nunca para hacer daño, a juicio del DM.",
          ["Control"]),
    spell("Eclipse del Alma", 9, "Nigromancia", "1 acción", "150 pies", "V, S, M (una máscara funeraria)", "Instantánea",
          "Un eclipse oscurece el campo por un instante. Hasta seis criaturas enemigas a 60 pies del punto hacen una salvación de Carisma: si fallan, reciben "
          "10d10 de daño necrótico y hacen una salvación de Sabiduría; si fallan esta segunda, su alma se arranca en parte: quedan aturdidas y sin acciones "
          "legendarias, resistencias al daño ni curación mágica hasta el final de su siguiente turno. Si superan la primera, la mitad y nada más. No afecta a "
          "muertos vivientes ni constructos.", ["Daño", "Necrótico", "Control"]),
    spell("Tormenta Primordial", 9, "Evocación", "1 acción", "500 pies", "V, S, M (una gema de cada color del arcoíris)", "Concentración, hasta 1 minuto",
          "Una tormenta elemental cubre una esfera de 60 pies de radio. Al inicio de cada uno de tus turnos eliges un efecto (puedes cambiarlo cada turno):\n"
          "• <b>Fuego etéreo:</b> cada enemigo en el área hace una salvación de Destreza o recibe 6d10 de daño de fuego (la mitad si la supera).\n"
          "• <b>Tormenta de hielo:</b> cada enemigo hace una salvación de Constitución o recibe 4d10 de daño de frío (la mitad si la supera); el área es "
          "terreno difícil hasta tu siguiente turno.\n• <b>Relámpagos:</b> hasta tres criaturas que elijas hacen una salvación de Destreza o reciben 8d8 de "
          "daño de relámpago (la mitad si la superan).\n• <b>Viento cortante:</b> cada criatura hace una salvación de Fuerza o es empujada 30 pies; nadie "
          "puede volar en el área hasta tu siguiente turno.", ["Daño", "Fuego", "Frío", "Relámpago"]),
    spell("Cántico del Vacío Insondable", 9, "Encantamiento", "1 acción", "60 pies", "V, S, M (una lengua conservada y una gema púrpura)", "Concentración, hasta 1 minuto",
          "Hasta seis criaturas que elijas hacen una salvación de Inteligencia o quedan atrapadas en una visión alienígena: no distinguen amigos de enemigos, "
          "tienen desventaja en las tiradas de ataque, salvaciones y pruebas, y no pueden lanzar conjuros de concentración. Repiten la salvación al final de "
          "cada uno de sus turnos. Si una la falla tres veces seguidas, su mente colapsa: queda incapacitada y bajo <i>Confusión</i> hasta que termine un "
          "descanso largo o reciba <i>Restablecimiento mayor</i>.", ["Control"]),
]

OFFICIAL_IN_LIST = ["Perdición", "Escudo", "Armadura de mago", "Clarividencia", "Invocar aberración"]


# ══ Secretos del Plano Anómalo (paquete de Homebrew para el DM) ════════════

SECRETOS = [
    {
        "id": "secreto-superior-reign", "name": "Secreto del Plano Anómalo: Superior Reign",
        "description": "Dominio sobre una región: la saca del tiempo y la guarda en el Reino Superior. Sólo con el código del DM.",
        "condition": "Haber meditado 1 hora canalizando el Plano Anómalo y que el DM considere que la Anomalía ha alcanzado una «evolución arcana».",
        "features": [{"level": 15, "name": "Superior Reign", "text":
            "Como acción (o en 10 minutos como ritual), gastando un espacio de conjuro de nivel 8 y una gema negra de 10.000 po con un fragmento de plano (se "
            "consume), encierras en el <b>Reino Superior</b> los objetos inertes y estructuras de un cubo de hasta 100 pies de lado a 500 pies de ti. Las "
            "criaturas no se trasladan: quedan donde estaban. Dentro, el tiempo no avanza y nada se deteriora; nadie puede entrar sin tu permiso, y el contenido "
            "no puede ser afectado por teletransporte, control planar ni alteración del tiempo.\n• Como acción, haces aparecer o desaparecer el contenido en un "
            "punto visible a 500 pies. Sólo puedes tener un Reino Superior a la vez.\n• Mientras exista, tu Estabilidad máxima se reduce en 2 (la condena lo "
            "sostiene).\n• Si mueres o quedas inconsciente más de 1 hora, el contenido vuelve a su sitio original (o donde el DM decida).\n<b>Para lanzarlo:</b> "
            "no estar encantado, enfermo por magia ni bajo control mental; haber meditado 1 hora; no haber lanzado otro conjuro de tiempo o espacio en la "
            "última hora. Ganas 2 de Inestabilidad."}],
    },
    {
        "id": "secreto-armagedon", "name": "Secreto del Plano Anómalo: Armagedón",
        "description": "El poder del que Catástrofe y Apocalipsis son sólo un eco: borrar a una criatura de la existencia. Sólo con el código del DM.",
        "condition": "Que el DM lo entregue como revelación de Zzeryxia o del Plano Anómalo.",
        "features": [{"level": 17, "name": "Armagedón", "text":
            "<b>Requisito previo:</b> impactar a una misma criatura enemiga con Catástrofe 3 veces y con Apocalipsis otras 3 (6 en total) en 1 hora como "
            "máximo.\n<b>Ritual:</b> gastas un espacio de conjuro de nivel 9 y un pergamino antiguo con escritura celestial (se consume) y cantas durante dos "
            "turnos completos (a 120 pies del objetivo). Mientras tanto no puedes moverte ni lanzar otros conjuros; si recibes daño, haz una salvación de "
            "Constitución CD 20 o el ritual se pierde (el espacio no); nada debe impedirte hablar o gesticular.\n<b>Efecto:</b> el objetivo hace una salvación "
            "de Carisma.\n• <b>Si falla:</b> se desintegra existencialmente, como si nunca hubiera existido: su alma desaparece, su historia se borra de los "
            "recuerdos mundanos y sólo un <i>Deseo</i> o una intervención divina directa pueden traerlo de vuelta. Cada otra criatura a 30 pies recibe 8d10 "
            "de daño de Vacío.\n• <b>Si la supera:</b> recibe 12d10 de daño de Vacío y el DM elige: pierde para siempre un rasgo legendario, no puede lanzar "
            "magia durante 1d6 días o sufre una malformación existencial (cuerpo, memoria o identidad).\nLas criaturas con voluntad cósmica (a juicio del DM) "
            "sólo reciben el daño, y no afecta a entidades fuera de la realidad conocida. Te quedas sin Estabilidad (Colapso). Una vez cada 15 días."}],
    },
    {
        "id": "secreto-hadar", "name": "Secreto del Plano Anómalo: Hadar",
        "description": "Invocar a Hadar, fragmento del Plano Anómalo, y su Poema de la Destrucción. Sólo con el código del DM.",
        "condition": "Haber lanzado con éxito (sin ser contrarrestado ni fallar) los siete conjuros de Hadar: Brazos (1), Bocas Hambrientas (2), Corona (3), Ojos (4), Palabra (5), Alas (6) y Capa (7). Lleva la cuenta en tus notas.",
        "features": [{"level": 13, "name": "👁 Hadar, fragmento del Plano Anómalo 👁", "text":
            "Cumplido el requisito, como acción gastas un espacio de conjuro de nivel 7 o superior y Hadar aparece: una esfera oscura de 60 pies crece sobre él "
            "durante tu turno. Al final de tu turno lanza el <b>Poema de la Destrucción</b> (no es un conjuro tuyo ni requiere concentración; dura 2 turnos). "
            "El DM tira 1d4 en la tabla de comportamiento. Cada objetivo hace una salvación de Constitución CD 20:\n• <b>Si falla:</b> recibe 10d10 + 40 de daño "
            "necrótico; si cae a 0 PG, Hadar lo absorbe y no deja cadáver (sólo <i>Deseo</i> o una intervención divina lo traen de vuelta).\n• <b>Si la supera:</b> "
            "la mitad del daño y queda aturdido, sin poder hablar ni lanzar conjuros, hasta el final de su siguiente turno.\n" + table(["d4", "Comportamiento de Hadar"], [
                ("1", "<b>Desgarro selectivo:</b> ataca a hasta 3 criaturas a 60 pies del epicentro, primero las de mayor VD o nivel (al azar si empatan)."),
                ("2", "<b>Rayo del Vacío:</b> el Poema sale como una línea de 100 pies de largo y 15 de ancho; todas las criaturas en ella hacen la salvación."),
                ("3", "<b>Voracidad aleatoria:</b> elige al azar 1d4 criaturas hostiles visibles en el área."),
                ("4", "<b>Voluntad insondable:</b> el DM elige libremente los objetivos (como mucho 3), aunque sean aliados o neutrales. Nunca tú."),
            ]) + "\nDespués Hadar se desvanece. Te quedas sin Estabilidad (Colapso). Para volver a invocarlo tienes que lanzar otra vez los siete conjuros de "
            "Hadar. Si alguien lanza un conjuro de Hadar mientras Hadar está presente, la invocación anterior se desvanece." + HADAR_NOTE}],
    },
]


def secretos_pack():
    items = []
    for s in SECRETOS:
        items.append({"id": s["id"], "version": 1, "type": "extension", "data": {
            "name": s["name"], "description": s["description"], "source": "Agarias · Anomalía",
            "classKey": CLASS, "kind": "rasgos", "access": "desbloqueo", "origin": "evento",
            "condition": s["condition"], "features": s["features"],
        }})
    return {"format": "agarias-homebrew-pack", "name": "Secretos del Plano Anómalo", "exportedAt": "2026-11-20T00:00:00.000Z", "version": 2, "items": items}


# ══ Clase ══════════════════════════════════════════════════════════════════

CANTRIPS_KNOWN = [2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4]
SLOTS = {1: [2], 2: [3], 3: [4, 2], 4: [4, 3], 5: [4, 3, 2], 6: [4, 3, 3], 7: [4, 3, 3, 1], 8: [4, 3, 3, 2], 9: [4, 3, 3, 3, 1], 10: [4, 3, 3, 3, 2],
         11: [4, 3, 3, 3, 2, 1], 12: [4, 3, 3, 3, 2, 1], 13: [4, 3, 3, 3, 2, 1, 1], 14: [4, 3, 3, 3, 2, 1, 1], 15: [4, 3, 3, 3, 2, 1, 1, 1],
         16: [4, 3, 3, 3, 2, 1, 1, 1], 17: [4, 3, 3, 3, 2, 1, 1, 1, 1], 18: [4, 3, 3, 3, 3, 1, 1, 1, 1], 19: [4, 3, 3, 3, 3, 2, 1, 1, 1], 20: [4, 3, 3, 3, 3, 2, 2, 1, 1]}


def build_class():
    niveles = {}
    names = ["blockUno", "blockDos", "blockTres", "blockCuatro", "blockCinco", "blockSeis", "blockSiete", "blockOcho"]
    for lv in range(1, 21):
        n = {}
        if lv == 1:
            n["descripcion"] = "Un fallo consciente de la realidad: lanza magia caótica del Plano Anómalo que siempre está al borde del colapso."
            n["descripcionLarga"] = (f"{TITLE}, la criatura condenada. No estudia como un mago ni pacta como un brujo: ha tocado el Plano Anómalo y la realidad "
                                     "le obedece mal. Cada conjuro es una apuesta y cada rasgo fuerte acerca el Colapso. Elige una Hebra (Paradoja, Error, Virus o "
                                     ".exe) que define qué tipo de fallo es.")
            n["atributoInicial"] = ("Atributos de clase:\n❖ Habilidad principal: Sabiduría.\n❖ Tiradas de Salvación: Inteligencia y Sabiduría.\n❖ Puntos de golpe:\n"
                                    "    :: Dado de golpe: 1d6.\n    :: Nivel 1: 6 + tu modificador de Constitución.\n"
                                    "    :: Niveles siguientes: 1d6 (o 4) + tu modificador de Constitución por nivel.\n"
                                    "❖ Competencias:\n    :: Armadura: Ninguna.\n    :: Armas: Armas simples y tu foco anómalo (como arma improvisada).\n"
                                    "    :: Herramientas: Herramientas de hojalatero (Afinidad con la relojería).\n"
                                    "    :: Habilidades: elige 2 entre Conocimiento Arcano, Historia, Religión, Engaño, Persuasión, Investigación y Perspicacia.\n"
                                    "❖ Multiclase: requiere Sabiduría 13; no da competencias.\n"
                                    "❖ Equipo inicial: (a) un bastón o (b) una daga; (a) un paquete de erudito o (b) un paquete de explorador; un foco anómalo; 5d4 × 10 PO.\n"
                                    "❖ Fuente: Agarias.")
        slots = SLOTS[lv]
        n["infoCubo"] = {"columnas": ["Trucos", "Conjuros preparados", "Espacios (nv. 1.º–9.º)"],
                         "filas": [[str(CANTRIPS_KNOWN[lv - 1]), f"{lv}+Sab", " · ".join(map(str, slots))]]}
        blocks = {names[i]: b for i, b in enumerate(FEATURES.get(lv, []))}
        if blocks:
            n["infoBlock"] = blocks
        niveles[str(lv)] = n
    niveles["3"]["subClase"] = HEBRAS

    return {
        "nombre": NAME,
        "claseName": CLASS,
        "seccion": "agarias",
        "icono": "🌀",
        "fuenteReglas": "Agarias (diseño del autor, revisado el 20-nov-2026)",
        "dadoDeGolpe": 6,
        "nivelesDeAumento": [4, 8, 12, 16, 19],
        "conjurador": True,
        "attribute": "sabiduria",
        "lanzamiento": {"progression": "full", "preparedFrom": "full", "cantripsKnown": CANTRIPS_KNOWN},
        "listaConjuros": OFFICIAL_IN_LIST + [s["nombre"] for s in SPELLS],
        "subclaseNombre": "Hebra anómala",
        "competencias": {
            "salvaciones": ["inteligencia", "sabiduria"],
            "armaduras": [],
            "armas": ["Armas simples"],
            "herramientas": [],
            "habilidades": {"elegir": 2, "de": ["Conocimiento Arcano", "Historia", "Religión", "Engaño", "Persuasión", "Investigación", "Perspicacia"]},
        },
        "competenciasMulticlase": {"armaduras": [], "armas": [], "herramientas": [], "habilidades": None},
        "equipoInicial": ["(a) Un bastón o (b) una daga.", "(a) Un paquete de erudito o (b) un paquete de explorador.", "Un foco anómalo (funciona como foco arcano)."],
        "oroInicial": "5d4 × 10",
        "niveles": niveles,
    }


def main():
    spells = load(DATA / "spells.json")
    for s in SPELLS:
        prev = spells.get(s["nombre"])
        # Nunca se pisa un conjuro de otra fuente: sólo los que ya eran de la Anomalía.
        if prev and CLASS not in prev.get("conjuradorTrue", {}):
            raise SystemExit(f"«{s['nombre']}» ya existe en spells.json y no es de la Anomalía")
        spells[s["nombre"]] = s["entry"]
    for name in OFFICIAL_IN_LIST:
        if name not in spells:
            raise SystemExit(f"falta el conjuro oficial «{name}» en spells.json")
    save(DATA / "spells.json", spells)

    cc = load(DATA / "class-creatures.json")
    cc["grupos"]["anomalia"] = {"nombre": "Manifestaciones anómalas", "fuente": "Ayuda Anómala (Anomalía)", "criaturas": MANIFESTACIONES}
    save(DATA / "class-creatures.json", cc)

    save(DATA / "classes" / f"{CLASS}.json", build_class())
    save(ROOT / "docs" / "homebrew" / "secretos-del-plano-anomalo.json", secretos_pack())
    print(f"ok: {len(SPELLS)} conjuros nuevos + {len(OFFICIAL_IN_LIST)} oficiales, {len(HEBRAS)} Hebras, {len(MANIFESTACIONES)} manifestaciones, {len(SECRETOS)} Secretos")


if __name__ == "__main__":
    main()
