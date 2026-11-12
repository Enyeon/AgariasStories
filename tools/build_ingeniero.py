"""Genera frontend/src/data/classes/ingeniero.json (clase homebrew de Agarias).

Fuente principal: el texto «Engineer» que pasó el usuario (Marc Lee), traducido
y corregido. Donde el texto no dice nada (niveles 6, 11, 17, 18 y 20) se
mantienen rasgos de la versión anterior. Además de las cuatro disciplinas del
texto, se conservan las dos inventadas antes (el usuario pidió tener las seis).

Correcciones aplicadas al texto (también se explican en la respuesta):
- Unidades: pies (como el resto de la app) y conceptos de 5e («acción
  completa» → acción; «aturdido 1 asalto/dazed» → sin reacciones).
- Guantelete S.T.E.A.M.: «+ tu nivel» de daño → + tu bonificador por competencia.
- Omnibáculo: sin ataque base ni tope en Pararrayos → se añaden.
- Humo del Lanzallamas: «no pueden atacar ni lanzar conjuros» → zona muy oscura.
- Traje de poder: +Int a la CA todo el combate → reacción y 2 de Energía, 1 minuto.
- Corcel de engranajes: CA 30 y modificadores erróneos → CA 18 y modificadores correctos.
- Máquina sísmica: frase sobre «quedar enterrado» que no correspondía → eliminada.
- Nivel 13: la tabla dice «Indomable» pero el texto describe Saboteador → Saboteador.
"""
import json, sys

OUT = sys.argv[1]

def blk(name, desc, efectos=None, elegir=None):
    b = {"name": name, "titleName": f"✦ {name.upper()} ✦", "descripcion": desc}
    if efectos: b["efectos"] = efectos
    if elegir: b["elegir"] = elegir
    return b
def sblk(name, desc, efectos=None, elegir=None):
    b = {"subName": name, "subTitleName": f"✦ {name.upper()} ✦", "subDescripcion": desc}
    if efectos: b["efectos"] = efectos
    if elegir: b["elegir"] = elegir
    return b
ORD = ["blockUno", "blockDos", "blockTres", "blockCuatro"]
SORD = ["subBlockUno", "subBlockDos", "subBlockTres", "subBlockCuatro"]
def blocks(*bs): return {ORD[i]: b for i, b in enumerate(bs)}
def sub(*bs, elegir=None):
    d = {"infoSubBlock": {SORD[i]: b for i, b in enumerate(bs)}}
    if elegir: d["elegir"] = elegir
    return d
def table(head, rows):
    h = "".join(f"<th>{c}</th>" for c in head)
    b = "".join("<tr>" + "".join(f"<td>{c}</td>" for c in r) + "</tr>" for r in rows)
    return f"<table><thead><tr>{h}</tr></thead><tbody>{b}</tbody></table>"
def comp(kind, v): return {"type": "competencia", "kind": kind, "value": v}
def prep(*names): return [{"type": "conjuro_preparado", "value": n} for n in names]

# ── Tabla (del texto) ────────────────────────────────────────────────────
KNOWN = [None, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 22, 23, 23, 24, 25, 26]
SLOTS = [None,
    (4, 3, 0, 0), (5, 3, 0, 0), (5, 4, 0, 0), (5, 4, 0, 0), (5, 4, 0, 0),
    (6, 5, 1, 0), (6, 5, 1, 0), (6, 5, 2, 0), (7, 5, 2, 0), (7, 6, 3, 0),
    (7, 6, 3, 1), (7, 6, 4, 1), (7, 6, 4, 2), (7, 6, 4, 2), (7, 7, 5, 3),
    (7, 7, 5, 3), (7, 7, 5, 4), (7, 7, 6, 4), (7, 7, 6, 5), (7, 7, 6, 5)]
COLS = ["Energía", "Esquemas conocidos", "Artefactos equipados (T · S · A · I)"]
def slot_txt(t): return " · ".join(str(x) if x else "–" for x in t)
def cubo(n): return {"columnas": COLS, "filas": [[str(2 * n) if n >= 2 else "-", str(KNOWN[n]), slot_txt(SLOTS[n])]]}

# Nivel de Ingeniero desde el que hay huecos de cada complejidad.
ACCESS = {"Trivial": 1, "Simple": 1, "Avanzado": 6, "Intrincado": 11}
ENERGY = {"Trivial": 1, "Simple": 2, "Avanzado": 4, "Intrincado": 6}
COST = {"Trivial": ("25 po", "2 horas"), "Simple": ("40 po", "4 horas"), "Avanzado": ("75 po", "6 horas"), "Intrincado": ("150 po", "8 horas")}

# ── Artefactos (traducción del texto) ────────────────────────────────────
G = []
def g(i, n, c, equipo, act, d, ef=None):
    G.append((i, n, c, equipo, act, d, ef))

T, S, A, I = "Trivial", "Simple", "Avanzado", "Intrincado"
g("alcoholimetro", "Alcoholímetro", T, "Cinturón de herramientas", "1 acción",
  "Identificas el veneno o la enfermedad que afecta a una criatura. La criatura debe usar una acción para soplar en el artefacto; tras 1d4 asaltos de análisis, indica el tipo de enfermedad o veneno, o la criatura que produjo el veneno.\n<b>Sintetizar antídoto.</b> Tras analizar el aliento, puedes usar una acción para sintetizar un antídoto contra ese veneno o enfermedad (tarda 1d4 asaltos). Beberlo da ventaja en la siguiente salvación contra ese mismo veneno o enfermedad. Solo sirve a la criatura que dio la muestra.")
g("reductor-de-entropia", "Reductor de entropía", T, "Tocado", "1 reacción",
  "Cuando sacas un 1 en una tirada de ataque, prueba de característica o salvación, puedes usar tu reacción para volver a tirar el dado; debes usar el nuevo resultado. Se recarga con un descanso corto o largo.")
g("extintor", "Extintor", T, "Guantes", "1 acción",
  "Rocías espuma ignífuga en un cono de 15 pies. Apaga las llamas no mágicas descubiertas y se adhiere a las criaturas del área, que tienen ventaja en las salvaciones contra el daño de fuego. La espuma se evapora tras 3 asaltos. Se recarga con un descanso corto o largo.")
g("dispositivo-de-flotacion", "Dispositivo de flotación", T, "Cinturón de herramientas", "1 acción",
  "Tu cinturón flota durante 1 hora: te mantienes a flote en cualquier líquido en calma y tienes ventaja en las pruebas de Fuerza (Atletismo) para nadar. Si lo activas sumergido, te sube a la superficie a 60 pies por asalto. Puedes desactivarlo con otra interacción.")
g("herramientas-gnomicas", "Herramientas gnómicas", T, "Cinturón de herramientas", "1 acción",
  "Una herramienta de bolsillo con decenas de piezas plegables (lezna, cincel, lima, alicates, destornillador, llave, sierra, pinzas, lupa, ganzúa…).\n<b>Auxiliar.</b> En un apuro sustituye a tus herramientas de hojalatero o a otras herramientas de artesano con las que tengas competencia, con desventaja por su tamaño. Desde el nivel 11 ya no impone desventaja.")
g("lampara-frontal", "Lámpara frontal", T, "Tocado", "1 acción",
  "Emite luz brillante en un cono de 30 pies y luz tenue 30 pies más, hacia donde mires. No da calor ni necesita combustible. Se enciende o apaga con una acción.")
g("espejo-retrovisor", "Espejo retrovisor", T, "Gafas", "Continuo",
  "Además de tu campo de visión normal, ves lo que hay detrás de ti. Ninguna criatura que se acerque por detrás puede sorprenderte.")
g("lanzador-de-armas", "Lanzador de armas", T, "Arma (sin la propiedad A dos manos)", "1 acción + 1 ataque",
  "Junto con una acción de Ataque con el arma que lo lleva, haces un ataque a distancia con ella como si tuviera la propiedad Arrojadiza (alcance 20/40). Se recarga con un descanso corto o largo.")
g("condensador-de-agua", "Condensador de agua", T, "Cinturón de herramientas", "1 acción",
  "Condensa el vapor del aire en una bolsa del cinturón. Como acción, viertes hasta 4 litros (1 galón) de agua limpia y potable. Se recarga con un descanso corto o largo.")
g("pluma-retractil", "Pluma retráctil", T, "Guantes", "1 acción",
  "Un tintero y una pluma mecánica escondidos en el guante; los sacas o guardas con una acción.\n<b>Tinta invisible.</b> Como acción, escribes un mensaje de hasta 50 palabras que se desvanece un asalto después; solo puede leerlo una criatura capaz de ver lo invisible.")
g("pistola-de-bengalas", "Pistola de bengalas", T, "Arma de fuego", "1 acción + 1 ataque",
  "Junto con una acción de Ataque con el arma de fuego que lo lleva, disparas una bengala que arde 1 minuto. En exteriores da luz tenue en 120 pies de radio y se ve a 3 millas; en interiores, luz brillante en 30 pies y tenue 30 más. Si atacas a una criatura con ella, causa 1d4 de daño de fuego en lugar del daño del arma.")
g("lente-de-aguila", "Lente de águila", T, "Gafas", "Continuo",
  "Sumas tu modificador de Inteligencia (mínimo +1) a tus pruebas de Percepción (la ficha lo suma sola).\n<b>Vista de águila.</b> Al usar una acción de Ataque con un arma a distancia, puedes activarlo para sumar 1d6 a las tiradas de ataque de esa acción (incluido Ataque extra). Se recarga con un descanso corto o largo.",
  [{"type": "bono", "target": "habilidad:Percepción", "desdeAtributo": "inteligencia", "minimo": 1}])
g("patines-retractiles", "Patines de hielo retráctiles", T, "Calzado", "1 acción",
  "Despliegas cuchillas bajo las botas: ignoras el terreno difícil por hielo o nieve, pero el terreno sin hielo ni nieve es difícil para ti. Se recogen con otra acción. Con las cuchillas fuera puedes dar una patada como ataque desarmado que causa 1d4 de daño cortante.")
g("magitector", "Magitector", T, "Gafas", "Continuo",
  "Percibes la presencia de magia a 30 pies de ti. Como acción, ves un aura tenue alrededor de cada criatura u objeto mágico visible del área y sabes su escuela de magia.\n<b>Identificar magia.</b> Aprendes las propiedades de un objeto mágico, si hay conjuros afectándolo y, si lo creó un conjuro, cuál fue.")

g("guantes-antigravedad", "Guantes antigravedad", S, "Guantes", "Interacción con objeto",
  "Al activarlos, tu capacidad para empujar, arrastrar o levantar se duplica.")
g("capa-camaleon", "Capa camaleón", S, "Capa", "1 acción",
  "Tu capa cambia de color para fundirse con el entorno. Durante 3 minutos tienes ventaja en las pruebas de Destreza (Sigilo) y un +10 adicional mientras permanezcas inmóvil, sin moverte ni realizar acciones.")
g("desfibrilador", "Desfibrilador", S, "Guantes", "1 acción",
  "Una criatura inconsciente y moribunda a 10 pies de ti recupera 1 punto de golpe. Se recarga con un descanso corto o largo.")
g("irradiador-de-alimentos", "Irradiador de alimentos", S, "Guantes", "1 acción",
  "Toda la comida y bebida no mágica en una esfera de 5 pies de radio centrada en ti queda purificada, libre de veneno y enfermedad.")
g("estabilizador-giroscopico", "Estabilizador giroscópico", S, "Cinturón de herramientas", "1 acción",
  "Durante 3 minutos tienes ventaja en las pruebas de Destreza (Acrobacias) para no caerte. Se recarga con un descanso corto o largo.")
g("amortiguador-inercial", "Amortiguador inercial", S, "Calzado", "1 reacción",
  "Cuando un efecto te empuja, arrastra o desplaza contra tu voluntad, reduces la distancia hasta 10 pies (20 pies desde el nivel 11 y 30 desde el nivel 17).")
g("brujula-detecta-mentiras", "Brújula detectamentiras", S, "Tocado", "Continuo",
  "Siempre sabes dónde está el norte y tu altitud o profundidad aproximada.\n<b>Piedra imán de la verdad (1 Energía).</b> Durante 3 minutos, mientras mires el artefacto, sabes si una criatura que habla miente a propósito o dice la verdad. Se recarga con un descanso corto o largo.")
g("gafas-de-vision-nocturna", "Gafas de visión nocturna", S, "Gafas", "Continuo",
  "Tienes visión en la oscuridad a 60 pies; si ya la tenías, su alcance aumenta 15 pies.\n<b>Visión electroscópica.</b> Con una interacción, durante 1 minuto ves las criaturas y objetos invisibles como si fueran visibles.")
g("capa-paracaidas", "Capa paracaídas", S, "Capa", "1 reacción",
  "Cuando caes, reduces el daño por caída en cinco veces tu nivel de Ingeniero. Se recarga con un descanso corto o largo.")
g("rebreather", "Respirador", S, "Tocado", "Continuo",
  "Puedes respirar bajo el agua.\n<b>Filtro de aire.</b> Como acción, activas un filtro de emergencia: durante 1 minuto tienes ventaja en las salvaciones contra gases y vapores dañinos.")
g("campo-de-recuperacion", "Campo de recuperación", S, "Cinturón de herramientas", "Continuo",
  "Si tú o una criatura amiga a 60 pies recuperáis puntos de golpe al final de un descanso corto, cada una recupera 1d4 PG adicionales (1d6 desde el nivel 11 y 1d8 desde el 17).")
g("guantes-taser", "Guantes táser", S, "Guantes", "1 acción",
  "Junto con una acción de Ataque, haces un ataque desarmado contra una criatura a 5 pies, con ventaja si lleva armadura metálica. Si impacta, causa tu daño desarmado más 1d8 de relámpago y no puede realizar reacciones hasta el inicio de su siguiente turno. El daño de relámpago sube a 2d8 en el nivel 11 y a 3d8 en el 17.")
g("encendedor", "Encendedor", S, "Guantes", "Interacción con objeto",
  "Produce una pequeña llama para encender una vela, una antorcha o una fogata.\n<b>Manos calientes.</b> Como acción, lanzas un cono de llamas de 15 pies: cada criatura hace una salvación de Destreza; 2d6 de fuego si falla, la mitad si tiene éxito. Prende los objetos inflamables que nadie lleve. El daño sube a 3d6 en el nivel 11 y a 4d6 en el 17.")
g("rociador-de-vapor", "Rociador de vapor", S, "Cinturón de herramientas", "1 reacción",
  "Impones desventaja en la tirada de ataque de una criatura a 5 pies de ti. No afecta a quien no puede quedar Cegado.")
g("traductor-universal", "Traductor universal", S, "Tocado", "1 acción",
  "Comprendes el significado literal de cualquier idioma hablado que oigas.")
g("guantes-maestros-hojalatero", "Guantes maestros de hojalatero", S, "Guantes", "Continuo",
  "Construir objetos mecánicos (incluidos tus artefactos y dispositivos) te lleva la mitad de tiempo y tienes ventaja en las pruebas de construcción y reparación. El Taller lo aplica solo al calcular el tiempo.\n<b>Oxicorte (1 Energía).</b> El índice del guante despliega un mechero de llama pequeña y muy caliente.")

g("infusion-de-adrenalina", "Infusión de adrenalina", A, "Armadura", "1 acción",
  "En el turno en que lo activas puedes realizar una acción adicional a la normal, que puede ser cualquier acción salvo atacar. Se recarga con un descanso corto o largo.")
g("municion-balistica", "Munición balística", A, "Arma (arco, ballesta o arma de fuego)", "Continuo",
  "Aumenta la velocidad de los disparos: al impactar, tiras dos veces los dados de daño del arma y usas el resultado más alto.")
g("espada-motosierra", "Espada motosierra", A, "Arma (de filo que cause daño cortante)", "Continuo",
  "Dientes motorizados afilan la hoja: con un crítico, tiras un dado de daño del arma adicional (dos desde el nivel 17).")
g("disfraz-holografico", "Disfraz holográfico", A, "Cinturón de herramientas", "1 acción",
  "Proyectas un holograma a tu alrededor que cambia tu aspecto (ropa, armadura y pertenencias incluidas) durante 10 minutos, sin cambiar tu tipo de cuerpo. No resiste una inspección física. Se recarga con un descanso corto o largo.")
g("zapatos-hinchables", "Zapatos hinchables", A, "Calzado", "Continuo",
  "Puedes moverte sobre cualquier líquido (agua, arenas movedizas, lava…) como si fuera suelo firme. Si el líquido es dañino, sigues recibiendo su daño.")
g("escaner-de-vida", "Escáner de formas de vida", A, "Cinturón de herramientas", "1 acción",
  "Detectas cuántas criaturas Pequeñas o mayores hay a 100 pies de ti, su tamaño y su distancia y dirección aproximadas. No detecta constructos ni muertos vivientes.")
g("protoplasmador", "Protoplasmador masivo", A, "Guantes", "1 acción",
  "Hasta tres criaturas que puedas ver a 50 pies recuperan 3d6 + tu modificador de Inteligencia PG (4d6 en el nivel 11 y 6d6 en el 17). Funciona en seres vivos y constructos, no en muertos vivientes.")
g("boton-de-reinicio", "Botón de reinicio", A, "Cinturón de herramientas", "1 reacción",
  "Al final del turno de otra criatura en combate, inviertes el flujo del tiempo: se deshace lo ocurrido en ese turno y la criatura lo repite (puede actuar igual o distinto). Se recarga con un descanso corto o largo.")
g("ventosas-trepadoras", "Ventosas trepadoras", A, "Guantes", "Continuo",
  "Ventaja en las pruebas de Fuerza (Atletismo) para trepar. Desde el nivel 17, trepar no te cuesta movimiento extra.")
g("mira-telescopica", "Mira telescópica", A, "Arma (arco, ballesta o arma de fuego)", "Continuo",
  "No tienes desventaja al atacar con esta arma a un objetivo a largo alcance.")
g("botas-con-ruedas", "Botas con ruedas", A, "Calzado", "Continuo",
  "Puedes usar una acción adicional en cada turno para Correr.\n<b>Propulsor cohete.</b> Con una interacción, durante 1 minuto tu velocidad caminando se duplica y los ataques de oportunidad contra ti tienen desventaja.")

g("optivisor-avanzado", "Optivisor avanzado", I, "Gafas", "1 acción",
  "Obtienes visión verdadera hasta 120 pies: ves puertas ocultas y secretas y la región fronteriza del Plano Etéreo. Se recarga con un descanso corto o largo.")
g("generador-de-invisibilidad", "Generador de invisibilidad", I, "Cinturón de herramientas", "1 acción",
  "Proyectas una esfera de 10 pies de radio que se mueve contigo: tú y las criaturas dentro sois invisibles para quien esté fuera (con lo que lleváis encima). Dura 1 minuto o hasta que la canceles con una interacción.")
g("mochila-propulsora", "Mochila propulsora", I, "Capa", "1 acción",
  "Durante 1 minuto tienes una velocidad de vuelo de 45 pies. Si sigues en el aire al terminar, caes.")
g("taladro-minero", "Taladro minero", I, "Guantes", "1 acción",
  "Obtienes una velocidad de excavar de 15 pies hasta el final de tu segundo turno siguiente, dejando un túnel de 5 pies de ancho y tan alto como tú.")
g("teletransportador", "Teletransportador", I, "Cinturón de herramientas", "1 acción",
  "Te teletransportas con lo que llevas a un punto que veas a 100 pies. En tus dos turnos siguientes puedes repetirlo una vez por turno como acción adicional. Si el destino está ocupado, recibes 4d6 de daño de fuerza y no te teletransportas.")
g("maquina-sismica", "Máquina sísmica", I, "Cinturón de herramientas", "1 acción",
  "Colocas un reactor sísmico a 10 pies. Al inicio de tu siguiente turno provoca un temblor en un círculo de 50 pies de radio: el suelo se vuelve terreno difícil, cada criatura en el suelo supera una salvación de Destreza o queda Derribada y cada estructura en contacto con el suelo recibe 50 de daño contundente (si cae a 0 PG, se derrumba y puede dañar a las criaturas cercanas). Se repite al inicio de tus dos turnos siguientes, salvo que lo detengas con una acción. Se recarga con un descanso corto o largo.")
g("zona-de-dilatacion-temporal", "Zona de dilatación temporal", I, "Cinturón de herramientas", "1 acción",
  "Eliges un punto a 60 pies: durante 1 minuto, en una esfera de 20 pies de radio el tiempo se ralentiza. Moverse cuesta el doble, hay −2 a las salvaciones de Destreza y ninguna criatura puede hacer más de un ataque en su turno. Puedes terminarlo con una interacción. Se recarga con un descanso corto o largo.")
g("casco-neuroadaptativo", "Casco neuroadaptativo", I, "Tocado", "Continuo",
  "Detectas la presencia o ausencia de pensamientos superficiales de criaturas conscientes (Inteligencia 1 o más); cuanto más tiempo estudies una zona o criatura, más información obtienes. Tus pensamientos no pueden leerse ni sirven para detectarte.")
g("suministro-de-energia", "Suministro de energía de reserva", I, "Cinturón de herramientas", "1 acción",
  "Recuperas toda tu reserva de Energía. Se recarga con un descanso corto o largo.")

ESQUEMAS = []
for i, n, c, equipo, act, d, ef in G:
    coste = "" if act == "Continuo" else f" · {ENERGY[c]} Energía"
    o = {"id": i, "nombre": n, "descripcion": f"<b>{c}</b> · {equipo} · {act}{coste}.\n{d}", "requisitos": {"nivel": ACCESS[c]}, "complejidad": c, "activacion": act}
    if ef: o["efectos"] = ef
    ESQUEMAS.append(o)

# ── Dispositivos característicos (del texto, con correcciones) ───────────
def dev(i, n, d): return {"id": i, "nombre": n, "descripcion": d}
DISPOSITIVOS = [
  dev("lanzallamas", "Lanzallamas",
    "Una máquina que imita el aliento de un dragón: un depósito de combustible alquímico a la espalda y una boquilla que lo proyecta y enciende en una línea de 40 pies. Una criatura que recibe daño del lanzallamas arde: 1d4 de daño de fuego al inicio de cada uno de sus turnos (no se acumula), hasta que use una acción y supere una prueba de Destreza CD 15 para apagarse.\n"
    "<b>Llamarada (3 Energía).</b> Como acción, disparas un chorro continuo: haz una tirada de ataque a distancia contra cada criatura de la línea; cada impacto causa 1d6 + tu modificador de Inteligencia de daño de fuego (2d6 en el nivel 7, 3d6 en el 13 y 4d6 en el 19).\n"
    "<b>Cortina de humo (2 Energía).</b> Como acción adicional, una nube de brasas de 20 pies de radio a tu alrededor crea una zona muy oscura para todos salvo tú durante 1d6 asaltos, o hasta que un viento fuerte la disperse.\n"
    "<b>Napalm (6 Energía).</b> Lanzas un proyectil a un punto a 60 pies: un área de 20 pies de radio se vuelve terreno difícil y los materiales inflamables que nadie lleve se prenden. Las criaturas del área reciben 1d8 de daño de fuego cada asalto (2d8 en el nivel 7, 3d8 en el 13 y 4d8 en el 19) durante 2 asaltos.\n"
    "<b>Respiradero (4 Energía).</b> Un chorro de vapor empuja a una criatura u objeto 10 pies sin dañarlo (15 en el nivel 7, 20 en el 13 y 25 en el 19). Apaga velas y antorchas, y las llamas protegidas (faroles) tienen un 50 % de probabilidad de apagarse."),
  dev("llave-inglesa-multiple", "Llave inglesa múltiple",
    "Es una llave, un arma y un artefacto. Una gran llave con una carcasa metálica giratoria en la punta que sirve como maza (1d6 de daño contundente) y como herramienta: +2 a las tiradas de ataque y daño con ella, y +2 a las pruebas para construir o reparar algo mientras la llevas.\n"
    "<b>Rebote (2 Energía).</b> Como acción, la lanzas (alcance 20/60): ataque a distancia que causa su daño más 1d4 + tu modificador de Inteligencia de relámpago, y cuenta como mágico para superar resistencias. Vuelve a tu mano, y sin coste puede golpear también a una segunda criatura a 10 pies de la primera. El dado de relámpago sube a 2d4 en el nivel 7, 3d4 en el 13 y 4d4 en el 19.\n"
    "<b>Reparación eficiente.</b> Reparas un objeto dañado de piedra, metal o madera a 30 pies. Como acción adicional, reparas a un constructo a 10 pies (con al menos 1 PG) 1d6 + tu modificador de Inteligencia PG (2d6 en el nivel 7, 3d6 en el 13 y 4d6 en el 19); puedes gastar hasta 4 Energía para sumar 1d6 por punto.\n"
    "<b>Pulso de fuerza (4 Energía).</b> Como acción, cada criatura de tamaño Diminuto a Grande a 10 pies hace una salvación de Fuerza; si falla, queda Ensordecida y Derribada hasta el final de tu siguiente turno. El radio sube a 15 pies en el nivel 7, 20 en el 13 y 25 en el 19.\n"
    "<b>Ganzúa (3 Energía).</b> Intentas abrir una cerradura mecánica o desactivar una trampa mecánica que veas y sumas 1d4 + tu bonificador por competencia a la prueba (2d4 en el nivel 7, 3d4 en el 13 y 4d4 en el 19). Si hay varias cerraduras, solo abre una."),
  dev("omnibaculo-magitecnico", "Omnibáculo magitécnico",
    "Un bastón con un cristal de arcanita que almacena energía. Funciona como bastón (1d6 contundente, versátil 1d8). Sus impactos cuerpo a cuerpo contra constructos u objetos mecánicos causan 1d4 de relámpago adicional. Cuando recibes daño de relámpago, puedes usar tu reacción para recuperar 1d4 Energía (hasta tres veces; se renueva con un descanso corto o largo).\n"
    "<b>Deflector de conjuros (4 Energía).</b> Hasta tu siguiente turno sumas 1d4 a tus salvaciones contra conjuros (2d4 en el nivel 7, 3d4 en el 13 y 4d4 en el 19). Si superas la salvación contra un conjuro que solo te tenía a ti como objetivo, puedes devolverlo a su lanzador con su nivel, CD, bonificador y atributo.\n"
    "<b>Pararrayos (Energía variable).</b> Como acción, gastas hasta tu bonificador por competencia en Energía: cada criatura a 20 pies de ti hace una salvación de Destreza; si falla, recibe 1d4 de relámpago por cada punto gastado (2d4 por punto en el nivel 7, 3d4 en el 13 y 4d4 en el 19); si tiene éxito, no puede realizar reacciones hasta el inicio de su siguiente turno."),
  dev("guantelete-steam", "Guantelete S.T.E.A.M.",
    "Un guante enorme impulsado por vapor (S.T.E.A.M.: «Super Tenaz y Ejemplar Amplificador Mecánico») que cubre tu brazo principal. +2 a las pruebas para forzar puertas atascadas, cerradas o atrancadas. Cuenta como una pieza de armadura pesada parcial. Sus impactos cuerpo a cuerpo causan 1d4 + tu modificador de Fuerza + tu bonificador por competencia de daño de fuerza.\n"
    "<b>Agarre cohete (2 Energía).</b> Como acción, el puño se separa y hace un ataque de agarre a distancia contra una criatura a 10 pies y la atrae hacia ti; mientras no intente escapar, mantienes el agarre sin esfuerzo. También puedes agarrar objetos lejanos y tirar de ti hacia ellos. Alcance: 15 pies en el nivel 7, 20 en el 13 y 25 en el 19.\n"
    "<b>Rompeyelmos (4 Energía).</b> Un ataque que causa 1d6 + tu modificador de Fuerza de daño contundente (2d6 en el nivel 7, 3d6 en el 13 y 4d6 en el 19), empuja al objetivo 5 pies por cada punto de tu modificador de Fuerza y lo deja Derribado.\n"
    "<b>Barrera de vapor (6 Energía).</b> Una barrera semisólida de vapor absorbe 2d8 + tu modificador de Constitución de daño antes de deshacerse (3d8 en el nivel 7, 4d8 en el 13 y 5d8 en el 19). No puedes atacar mientras la mantienes. Como reacción, empujas 5 pies a un enemigo que se acerque; si un enemigo llega a tu alcance, puedes descargar los PG restantes de la barrera como daño contra él."),
  dev("dispositivo-granadas-elixir", "Dispositivo de granadas de elixir (D.G.E.)",
    "Una mochila que es un laboratorio químico móvil: los viales de las correas se rellenan dentro con jeringas de químicos explosivos. Crear una granada es una acción adicional y lanzarla, una acción. Se lanzan a un punto a 20 pies y explotan en un radio de 10 pies (el DM puede permitir lanzarlas por otros medios).\n"
    "<b>Granada elemental.</b> Las criaturas del radio superan una salvación de Destreza o reciben 1d6 de daño; cada punto de Energía gastado añade 1d6 (hasta 3 Energía; 4 en el nivel 7, 5 en el 13 y 6 en el 19). Tipos: <i>ácido</i> (quien falle recibe además daño de ácido igual a tu modificador de Inteligencia al inicio de tu siguiente turno), <i>frío</i> (su velocidad se reduce a la mitad hasta el final de tu siguiente turno, salvo inmunidad al frío), <i>fuego</i> (arde: 1d4 de fuego al inicio de cada turno hasta que se apague) o <i>relámpago</i> (si está a la mitad de sus PG o menos, queda Aturdida 1 asalto).\n"
    "<b>Polvo de destello (3 Energía).</b> Cada criatura en el radio supera una salvación de Constitución o queda Cegada hasta el final de tu siguiente turno. El radio sube a 15 pies en el nivel 7, 20 en el 13 y 25 en el 19.\n"
    "<b>Humo denso (3 Energía).</b> Con una acción lanzas hasta tres granadas de humo; cada nube dura 1d4 asaltos (2d4 en el nivel 7, 3d4 en el 13 y 4d4 en el 19) y ciega a quien empiece su turno dentro.\n"
    "<b>Doble lanzamiento (4 Energía).</b> Creas dos granadas con una acción adicional y las lanzas con una sola acción, a objetivos distintos y con 5 pies más de alcance (10 en el nivel 7, 15 en el 13 y 20 en el 19)."),
]

# ── Nivel 1 y rasgos de clase ────────────────────────────────────────────
ATRIB = (
    "Atributos de clase:\n"
    "❖ Habilidad principal: Inteligencia (luego Constitución o Destreza).\n"
    "❖ Tiradas de Salvación: Destreza e Inteligencia.\n"
    "❖ Puntos de golpe:\n"
    "    :: Dado de golpe: 1d10.\n"
    "    :: Nivel 1: 10 + tu modificador de Constitución.\n"
    "    :: Niveles siguientes: 1d10 (o 6) + tu modificador de Constitución por nivel.\n"
    "❖ Competencias:\n"
    "    :: Armadura: Armadura ligera.\n"
    "    :: Armas: Armas simples y armas de fuego.\n"
    "    :: Herramientas: Herramientas de hojalatero, Herramientas de herrero y Herramientas de armero.\n"
    "    :: Habilidades: elige 4 entre Historia, Investigación, Juego de Manos, Medicina, Percepción y Perspicacia.\n"
    "❖ Equipo inicial (además del de tu trasfondo):\n"
    "    :: Cualquier arma simple cuerpo a cuerpo.\n"
    "    :: Una ballesta ligera y 20 virotes.\n"
    "    :: (a) Paquete de erudito o (b) paquete de explorador.\n"
    "    :: (a) Ropa de mecánico o (b) herramientas de hojalatero.\n"
    "    :: Alternativa: 5d4 × 10 po en lugar del equipo de clase.\n"
    "❖ Ropa de mecánico (10 po, 5 lb): mono o mandil grueso, botas resistentes, guantes gruesos y cinturón de herramientas; suele incluir gafas oscuras y una máscara para nariz y boca.\n"
    "❖ Multiclase: dado de golpe, competencia con Herramientas de hojalatero, una habilidad de la lista del Ingeniero y entrenamiento con armadura ligera.\n"
    "❖ Fuente: «Engineer», de Marc Lee (adaptado para Agarias)."
)
COST_TABLE = table(["Complejidad", "Huecos desde", "Coste", "Tiempo", "Energía al activar"],
    [[k, f"nivel {ACCESS[k]}", COST[k][0], COST[k][1], str(ENERGY[k])] for k in (T, S, A, I)])

ESQUEMAS_TXT = (
    "Sabes construir artefactos mecánicos que cumplen funciones diversas e incorporarlos a tu ropa, armadura, armas y demás equipo. Algunos dan un beneficio continuo mientras están equipados; otros requieren una acción para activarse. Se construyen a partir de esquemas con una complejidad: trivial, simple, avanzada o intrincada.\n"
    "<b>Esquemas conocidos.</b> A nivel 1 conoces 7 esquemas de tu elección (columna «Esquemas conocidos»). Cada vez que subes de nivel puedes sustituir uno por otro. Cada esquema nuevo debe ser de una complejidad que puedas equipar. <i>No hace falta elegirlos al subir de nivel: la pestaña Taller avisa de los que te faltan.</i>\n"
    "<b>Coste.</b> Aprender un esquema y convertirlo en un artefacto que funcione cuesta dinero y tiempo (piezas, prototipos, pruebas y ajustes). Un artefacto perdido o destruido debe reconstruirse por completo.\n"
    + COST_TABLE +
    "\n<b>Equipar artefactos.</b> Mantener los artefactos (engrasar piñones, dar cuerda a muelles, cargar condensadores…) exige trabajo, así que solo puedes tener equipados los que indica la columna «Artefactos equipados» (T · S · A · I). Un artefacto ocupa un hueco de su complejidad o superior y se integra en una prenda o pieza de equipo (varios pueden compartirla). Al terminar un descanso largo puedes cambiar cuáles llevas equipados. Solo quien construyó un artefacto sabe usarlo.\n"
    "<b>Activarlos.</b> No puedes activar dos artefactos de 1 acción en el mismo turno, pero sí combinar uno de 1 acción con otros que solo piden una interacción. Activar un artefacto cuesta la Energía de su complejidad (los continuos no gastan).\n"
    "<b>Ataques y salvaciones.</b> Ataque de artefacto = tu bonificador por competencia + el modificador que indique el artefacto. CD de artefacto = 8 + tu bonificador por competencia + tu modificador de Inteligencia (la ficha la muestra).\n"
    "<b>No son mágicos.</b> Detectar magia, Disipar magia, Contraconjuro o un campo antimagia no los afectan.\n"
    "<b>Hazlos tuyos.</b> Decide con tu DM cómo funciona cada artefacto (una batería química, un cristal raro de las profundidades…): no hay dos ingenieros iguales."
)
N = {str(i): {"infoCubo": cubo(i)} for i in range(1, 21)}
def esq(extra): return {"lista": "esquemas", "cantidad": extra, "rasgo": "Esquemas de artefactos"}

N["1"].update({
    "descripcion": "Inventores que convierten engranajes, vapor y química en artefactos sorprendentes.",
    "descripcionLarga": "No todo erudito o inventor llega a ingeniero. Los ingenieros no solo estudian la ciencia: la convierten en tecnología con aplicaciones prácticas. Algunos se formaron en un gremio; muchos son autodidactas con talento para las máquinas. Saben hacer un poco de todo: sea cual sea el reto, inventan, construyen y adaptan sus artefactos para que sean la herramienta justa.",
    "atributoInicial": ATRIB,
    "infoBlock": blocks(blk("Esquemas de artefactos", ESQUEMAS_TXT, elegir={"lista": "esquemas", "cantidad": 7})),
})
N["2"]["infoBlock"] = blocks(
    blk("Energía", "A nivel 2 obtienes una reserva de Energía igual al doble de tu nivel de Ingeniero (columna «Energía»). Recuperas tanta Energía como tu nivel de Ingeniero al terminar un descanso corto y toda al terminar un descanso largo. Muchos rasgos y artefactos gastan Energía; cuanto más poderoso es el Ingeniero, más puede invertir en ellos. <i>La pestaña Taller lleva la cuenta.</i>"),
    blk("Dispositivo característico",
        "A nivel 2 construyes un arquetipo de invención que es tu aporte a la ciencia: tu dispositivo característico, un arma versátil y personalizable que demuestra tu genialidad. Elige el Lanzallamas, la Llave inglesa múltiple, el Omnibáculo magitécnico, el Guantelete S.T.E.A.M. o el Dispositivo de granadas de elixir (D.G.E.).\n"
        "Si lo pierdes, puedes construir otro en tres días de trabajo (8 horas al día) gastando 100 po en metal y otras materias primas. Repararlo requiere una prueba de Inteligencia CD 15 y la mitad del coste y del tiempo de construirlo. Sus capacidades mejoran a los niveles 7, 13 y 19.",
        elegir={"lista": "dispositivo-caracteristico", "cantidad": 1}),
)
N["2"]["elegir"] = esq(1)
N["3"]["infoBlock"] = blocks(blk("Especialización de Ingeniero",
    "A veces te inspiras en fuentes distintas para tus inventos. Al nivel 3 sigues un campo de estudio, normalmente aprendido en una institución de enseñanza superior: el Mecha de Batalla, el Artilugio, el Tecnoteúrgo, el Mecanicista, el Rompehechizos o el Autómata. Cada uno te da rasgos en niveles posteriores."))
N["3"]["elegir"] = esq(1)
ASI_TXT = "Aumentas en 2 una puntuación de característica o en 1 dos de ellas (máximo 20), o eliges una dote para la que califiques. Vuelves a obtenerla a los niveles 8, 12, 16 y 19."
N["4"]["infoBlock"] = blocks(blk("Mejora de Puntuación de Característica", ASI_TXT))
N["4"]["elegir"] = esq(1)
N["5"]["infoBlock"] = blocks(blk("Alfabetización académica",
    "A nivel 5 eliges dos habilidades basadas en Inteligencia, o una de ellas y unas herramientas con las que tengas competencia. Tu bonificador por competencia se duplica en las pruebas que hagas con ellas.",
    efectos=[{"type": "pericia", "amount": 2}]))
N["5"]["elegir"] = esq(1)
N["6"]["infoBlock"] = blocks(blk("Magia mecánica",
    "Tu ingeniería es tan precisa que atraviesa las defensas sobrenaturales: los ataques de tus artefactos, tu dispositivo característico y tus constructos cuentan como mágicos para superar la resistencia y la inmunidad al daño no mágico (aunque siguen sin ser magia para Disipar magia y similares)."))
N["6"]["elegir"] = esq(1)
N["7"]["infoBlock"] = blocks(
    blk("Pericia de ingeniero",
        "A nivel 7 eliges dos habilidades basadas en Inteligencia, una de ellas y las herramientas de hojalatero, o las herramientas de hojalatero y otras herramientas con las que tengas competencia. Sumas el doble de tu bonificador por competencia a esas pruebas. Además, puedes guardar o desenfundar un arma u objeto como acción adicional.",
        efectos=[{"type": "pericia", "amount": 2}]),
    blk("Mejora del dispositivo", "Las capacidades de tu dispositivo característico mejoran (ver «nivel 7» en su descripción)."),
)
N["7"]["elegir"] = esq(1)
N["8"]["infoBlock"] = blocks(blk("Mejora de Puntuación de Característica", ASI_TXT))
N["8"]["elegir"] = esq(1)
N["9"]["infoBlock"] = blocks(blk("Héroe del desguace",
    "Desde el nivel 9 puedes dedicar tu tiempo libre a rebuscar piezas de repuesto, químicos útiles y materias primas. Debes estar en una ciudad, un desguace u otro lugar donde se encuentren; el DM puede limitar los materiales según el sitio. Por cada hora encuentras materiales por valor de 1d4 po + tu nivel. Sirven para pagar el coste de aprender esquemas, construir o reparar, o como materia prima para fabricar con herramientas con las que tengas competencia. <i>El Taller tiene un botón para tirarlo y añadir la chatarra a tu inventario.</i>"))
N["9"]["elegir"] = esq(1)
N["10"]["elegir"] = esq(1)
N["11"]["infoBlock"] = blocks(blk("Enciclopedia andante",
    "Has leído de todo: sumas la mitad de tu bonificador por competencia (redondeando hacia abajo) a las pruebas de Inteligencia que no lo incluyan ya.",
    efectos=[{"type": "medio_competencia", "atributos": ["inteligencia"]}]))
N["11"]["elegir"] = esq(1)
N["12"]["infoBlock"] = blocks(blk("Mejora de Puntuación de Característica", ASI_TXT))
N["12"]["elegir"] = esq(1)
N["13"]["infoBlock"] = blocks(
    blk("Saboteador",
        "Desde el nivel 13, en cada uno de tus turnos (dentro o fuera de combate) puedes intentar como acción adicional desactivar una trampa o abrir una cerradura con tus herramientas de hojalatero. También puedes bloquear una cerradura (abierta o cerrada), preparar la rueda de un carro para que se suelte o examinar un mecanismo sencillo o pequeño y desactivarlo. Necesitas al menos una herramienta adecuada (ganzúa, palanca, sierra, lima…).\n"
        "La CD depende de lo complicado que sea: 10 para algo sencillo y más para lo intrincado. Si tienes éxito, lo desactivas. Si fallas por 4 o menos, puedes volver a intentarlo. Si fallas por 5 o más, algo sale mal: la trampa se dispara o crees haberlo saboteado, pero sigue funcionando."),
    blk("Mejora del dispositivo", "Las capacidades de tu dispositivo característico mejoran (ver «nivel 13» en su descripción)."),
)
N["13"]["elegir"] = esq(1)
N["14"]["elegir"] = esq(1)
N["15"]["infoBlock"] = blocks(blk("Experiencia de crafteo",
    "Desde el nivel 15 eres un maestro artesano, capaz de trabajar bien, dentro del presupuesto y a tiempo. Cuando fabricas un objeto con herramientas con las que tienes competencia, cada día avanzas 1d6 + tu nivel en po hasta alcanzar el valor de mercado del objeto."))
N["15"]["elegir"] = esq(2)
N["16"]["infoBlock"] = blocks(blk("Mejora de Puntuación de Característica", ASI_TXT))
N["16"]["elegir"] = esq(1)
N["17"]["infoBlock"] = blocks(blk("Maestría en artefactos",
    "Cuando tiras daño con un artefacto o con tu dispositivo característico, puedes volver a tirar los dados que saquen 1 (usas el nuevo resultado). Cuando uno de tus artefactos afecta a un área, puedes elegir un número de criaturas igual a tu modificador de Inteligencia − 2 (mínimo 1) que no se vean afectadas."))
N["18"]["infoBlock"] = blocks(blk("Mente indomable",
    "Si el total de una prueba de Inteligencia es inferior a tu puntuación de Inteligencia, puedes usar tu puntuación en lugar del total."))
N["18"]["elegir"] = esq(1)
N["19"]["infoBlock"] = blocks(
    blk("Mejora de Puntuación de Característica", ASI_TXT),
    blk("Mejora del dispositivo", "Las capacidades de tu dispositivo característico alcanzan su máximo (ver «nivel 19» en su descripción)."),
)
N["19"]["elegir"] = esq(1)
N["20"]["infoBlock"] = blocks(blk("Maestría mecánica",
    "Has llevado la ingeniería más allá de lo que nadie creía posible. <b>Canibalizar.</b> Como acción adicional, desmontas uno de tus artefactos equipados para obtener Energía: queda inutilizado (pierdes sus beneficios) hasta que termines un descanso largo y recuperas Energía según su complejidad: 1 (trivial), 2 (simple), 4 (avanzado) u 6 (intrincado)."))
N["20"]["elegir"] = esq(1)

# ── Especializaciones ────────────────────────────────────────────────────
KNIGHT = table(["Rasgo", "Valor"], [
    ["Tipo", "Constructo Mediano"], ["CA", "15"], ["PG", "25 + 1d4 por cada nivel de Ingeniero por encima del 3"],
    ["Velocidad", "30 pies"], ["Armas", "Armas simples cuerpo a cuerpo y escudos"],
    ["Atributos", "FUE 15 (+2), DES 13 (+1), CON 15 (+2), INT 7 (−2), SAB 10 (+0), CAR 3 (−4)"],
    ["Idiomas", "Entiende los de su creador, pero no habla"], ["VD", "3/4"]])
STALLION = table(["Rasgo", "Valor"], [
    ["Tipo", "Constructo Grande"], ["CA", "18"], ["PG", "50 + 2d4 por cada nivel de Ingeniero por encima del 19"],
    ["Velocidad", "60 pies"], ["Atributos", "FUE 18 (+4), DES 13 (+1), CON 17 (+3), INT 2 (−4), SAB 13 (+1), CAR 6 (−2)"],
    ["Idiomas", "Entiende los de su creador, pero no habla"]])
NOVA_COST = table(["Nivel del efecto", "Energía"], [["Truco", "2"], ["1", "4"], ["2", "6"], ["3", "8"], ["4", "10"]])
NOVA = {
    0: ["Palmada atronadora", "Descarga de Fuego", "Mano de resplandor", "Agarre electrizante", "Rociada venenosa", "Congelación", "Luces danzantes", "Encendido/Apagado"],
    1: ["Alarma", "Manos ardientes", "Catapulta", "Curar heridas", "Temblor de tierra", "Grasa", "Acceso remoto", "Escudo"],
    2: ["Contorno borroso", "Llama permanente", "Pirotecnia", "Detectar trampas", "Calentar metal", "Enfriar metal", "Levitar", "Escritura celeste"],
    3: ["Aura de vitalidad", "Castigo cegador", "Disipar magia", "Tierra erupcionante", "Relámpago", "Don de lenguas", "Protección contra energía", "Patrón hipnótico"],
    4: ["Controlar agua", "Fabricar", "Moldear la piedra", "Sincronicidad"],
}
def nova_list(lv): return ", ".join(NOVA[lv])

SUB = {
  "mecha-batalla": {
    "subNombre": "Discípulo del Mecha de Batalla",
    "subDescripcion": "✦ DISCÍPULO DEL MECHA DE BATALLA ✦\nCrees que tanto lo biológico como lo mecánico pueden mejorarse. Te especializas en la tecnología de combate y construyes una armadura de vapor: tu traje de poder.",
    "efectos": [comp("arma", "Armas marciales"), comp("armadura", "Armadura pesada"), comp("armadura", "Escudos")],
    "subNivel": {
      "3": sub(sblk("Competencias avanzadas", "A nivel 3 obtienes competencia con todas las armas marciales, los escudos y la armadura pesada.")),
      "4": sub(sblk("Traje de poder",
        "A nivel 4 construyes una armadura mecánica impulsada por vapor: tu traje de poder. Funciona como una armadura de placas (CA 18), sin requisito de Fuerza para ti. Tu dispositivo característico y tus artefactos se consideran piezas del traje, así que su peso no te ralentiza.\n"
        "<b>Blindaje adaptativo.</b> Cuando eres objetivo de un ataque, puedes usar tu reacción y gastar 2 Energía para sumar tu modificador de Inteligencia a tu CA contra ese ataque y contra todos los demás durante 1 minuto, incluso si estás desprevenido. <i>(El texto original lo daba gratis todo el combate; se ajustó.)</i>")),
      "6": sub(sblk("Ventaja mecánica",
        "A nivel 6 combinas dispositivos para potenciar aún más el traje. Gastando 1d6 Energía (tira al activarlo), tus ataques cuerpo a cuerpo de ese turno causan daño contundente adicional igual a tu modificador de Fuerza.")),
      "9": sub(sblk("Evasión volátil",
        "Desde el nivel 9, cuando un enemigo que puedes ver te somete a un efecto que permite una salvación para recibir la mitad de daño, no recibes daño si tienes éxito y solo la mitad si fallas. Además, puedes desenfundar un arma en cada uno de tus turnos sin gastar tu interacción.")),
      "12": sub(sblk("Combate energético",
        "Desde el nivel 12 te creces en el fragor del combate: tienes ventaja en las tiradas de iniciativa y, cuando impactas con tu dispositivo característico o con un artefacto, puedes hacer un ataque adicional como acción adicional.")),
      "15": sub(sblk("A todo vapor",
        "Desde el nivel 15, cuando sufres Agotamiento, puedes gastar 5 Energía para recuperar tantos PG como tu nivel y eliminar una condición que te afecte. Se recarga con un descanso corto o largo.")),
      "20": sub(sblk("Sobrecarga",
        "A nivel 20 tu traje vive para la batalla. Como acción, gastas 1d10 Energía y cargas en línea recta hasta tu velocidad contra una criatura: haces un ataque cuerpo a cuerpo con ventaja, sumando al daño la Energía gastada, y el objetivo queda Derribado. Durante la carga cuentas como una categoría de tamaño mayor. Si no tienes Energía suficiente, gastas la que te quede.")),
    },
  },
  "artilugio": {
    "subNombre": "Discípulo del Artilugio",
    "subDescripcion": "✦ DISCÍPULO DEL ARTILUGIO ✦\nEres un inventor diverso: más dispositivos característicos, más esquemas y artefactos más baratos y eficientes.",
    "subNivel": {
      "3": sub(sblk("Inventor polifacético",
        "A nivel 3 eliges un segundo dispositivo característico (distinto del primero). Además, construir artefactos te cuesta la mitad de tiempo y de dinero (el Taller lo aplica)."),
        elegir={"lista": "dispositivo-caracteristico", "cantidad": 1}),
      "5": sub(sblk("Familiaridad con los esquemas",
        "A nivel 5 aprendes 2 esquemas adicionales de tu elección (además de los de la tabla), y otros 2 a los niveles 8, 12 y 15. Deben ser de una complejidad que puedas equipar."),
        elegir={"lista": "esquemas", "cantidad": 2}),
      "7": sub(sblk("Artilugio avanzado",
        "A nivel 7, el coste de Energía de tus artefactos y dispositivos se reduce en 1. Cuando haces una prueba con un artefacto, puedes sumar 1d6 al resultado.")),
      "8": {"elegir": {"lista": "esquemas", "cantidad": 2, "rasgo": "Familiaridad con los esquemas"}},
      "9": sub(sblk("Reconfiguración rápida",
        "Desde el nivel 9, al terminar un descanso corto puedes cambiar hasta tres de tus artefactos equipados por otros esquemas que conozcas, si tienes tus herramientas de hojalatero. Sube a cinco en el nivel 13 y a siete en el 17.")),
      "12": {"elegir": {"lista": "esquemas", "cantidad": 2, "rasgo": "Familiaridad con los esquemas"}},
      "14": sub(sblk("Artesanía experimentada", "A nivel 14 eliges un tercer dispositivo característico (distinto de los dos primeros)."),
        elegir={"lista": "dispositivo-caracteristico", "cantidad": 1}),
      "15": {"elegir": {"lista": "esquemas", "cantidad": 2, "rasgo": "Familiaridad con los esquemas"}},
      "20": sub(sblk("Mente brillante",
        "A nivel 20 dominas por completo tus artefactos. Elige una complejidad: los artefactos de esa complejidad que conoces están siempre equipados y no cuentan para tu máximo. Si uno de ellos necesita un descanso para recargarse, puedes recargarlo con una acción adicional; no puedes volver a hacerlo con el mismo artefacto hasta un descanso largo."),
        elegir={"lista": "complejidad-maestra", "cantidad": 1}),
    },
    "listasDeEleccion": {
      "complejidad-maestra": {"titulo": "Mente brillante: complejidad", "opciones": [
        {"id": k.lower(), "nombre": k, "descripcion": f"Tus artefactos {k.lower()}s siempre están equipados."} for k in (T, S, A, I)]},
    },
  },
  "tecnoteurgo": {
    "subNombre": "Discípulo del Tecnoteúrgo",
    "subDescripcion": "✦ DISCÍPULO DEL TECNOTEÚRGO ✦\nHas aprendido a sacar el máximo partido a la fuente de energía de tus dispositivos. Para ti la magia es solo una ciencia que aún no se entiende del todo: estudias lo arcano y lo tecnológico para fundirlos en un todo.",
    "subNivel": {
      "3": sub(sblk("Guantelete N.O.V.A.",
        "A nivel 3 diseñas el Guantelete N.O.V.A. («No Oficialmente Válido como Arcano»), que replica efectos de conjuros con mejoras arcanas. Conviertes tu Energía en el efecto de un conjuro del nivel correspondiente; sus efectos se consideran no mágicos para superar resistencias e inmunidades y usan tu CD y tu ataque de artefacto (Inteligencia).\n" + NOVA_COST +
        f"\n<b>Efectos disponibles.</b> Desde el nivel 3: trucos ({nova_list(0)}) y de nivel 1 ({nova_list(1)}). Nivel 2 desde el 8, nivel 3 desde el 12 y nivel 4 desde el 16. Aparecen en la pestaña Conjuros como «siempre preparados»; los que aún no están en el catálogo de la app se muestran solo con su nombre.",
        efectos=prep(*NOVA[0], *NOVA[1]))),
      "5": sub(sblk("Batería de maná",
        "A nivel 5, tu reserva máxima de Energía aumenta en tu modificador de Inteligencia; aumenta otra vez lo mismo a los niveles 10 y 15 (el Taller lo calcula).")),
      "8": sub(sblk("Recarga arcana",
        f"A nivel 8 eliges una opción de recarga para los efectos del Guantelete N.O.V.A.; eliges otra a los niveles 12 y 16. Además, el guantelete ya replica efectos de nivel 2: {nova_list(2)}.",
        efectos=prep(*NOVA[2])), elegir={"lista": "recarga-arcana", "cantidad": 1}),
      "12": sub(sblk("Recarga arcana (2)", f"Eliges otra opción de recarga. El guantelete replica efectos de nivel 3: {nova_list(3)}.",
        efectos=prep(*NOVA[3])), elegir={"lista": "recarga-arcana", "cantidad": 1}),
      "14": sub(sblk("Mente intrincada",
        "Desde el nivel 14 entiendes tan bien la magia que improvisas el uso de objetos mágicos no pensados para ti: ignoras los requisitos de clase, raza y nivel para usar objetos mágicos.")),
      "16": sub(sblk("Recarga arcana (3)", f"Eliges otra opción de recarga. El guantelete replica efectos de nivel 4: {nova_list(4)}.",
        efectos=prep(*NOVA[4])), elegir={"lista": "recarga-arcana", "cantidad": 1}),
      "17": sub(sblk("Baluarte adaptativo",
        "A nivel 17, cuando eres objetivo de un conjuro que causa un tipo de daño (ácido, frío, fuego, relámpago, trueno…), obtienes resistencia a ese tipo de daño hasta el final del turno. Se recarga con un descanso corto o largo.")),
      "20": sub(sblk("Tecnomancia de élite", "A nivel 20 tu Inteligencia aumenta en 2 de forma permanente, hasta un máximo de 22.",
        efectos=[{"type": "bono", "target": "atributo:inteligencia", "value": 2, "maximo": 22}])),
    },
    "listasDeEleccion": {
      "recarga-arcana": {"titulo": "Recarga arcana", "opciones": [
        {"id": "carga-distante", "nombre": "Carga distante", "descripcion": "Cuando creas un efecto a distancia, puedes gastar 1 Energía para duplicar su alcance."},
        {"id": "carga-potenciada", "nombre": "Carga potenciada", "descripcion": "Cuando tiras el daño de un efecto, puedes gastar 2 Energía para repetir la tirada y sumar tu modificador de Inteligencia al nuevo resultado."},
        {"id": "carga-prolongada", "nombre": "Carga prolongada", "descripcion": "Cuando creas un efecto que dura un asalto, puedes gastar 3 Energía para duplicar su duración."},
        {"id": "carga-ampliada", "nombre": "Carga ampliada", "descripcion": "Cuando creas un efecto que afecta a un solo objetivo, puedes afectar a un objetivo más por cada punto de Energía que gastes."},
      ]},
    },
  },
  "mecanicista": {
    "subNombre": "Discípulo del Mecanicista",
    "subDescripcion": "✦ DISCÍPULO DEL MECANICISTA ✦\nTe fascinan los mecanismos de relojería y construyes constructos fieles: caballeros de relojería, insectos mensajeros y, al final, un corcel de engranajes.",
    "efectos": [{"type": "habilita", "value": "companero"}],
    "subNivel": {
      "3": sub(sblk("Caballero de relojería",
        "A nivel 3 inventas el constructo más eficiente y versátil: un Caballero de relojería. Construirlo cuesta 4 horas y 100 po en metal, hilos raros y otras materias primas. Regístralo en la pestaña Criaturas.\n" + KNIGHT +
        "\nEs amistoso contigo y tus compañeros y obedece tus órdenes verbales (sin gastar acción). Si no le das órdenes, te protege. Cuando una criatura hostil entra a 10 pies de él en un turno o empieza su turno ahí, hace una salvación de Destreza: 1d6 de daño contundente si falla, la mitad si tiene éxito. A 0 PG deja de funcionar; repararlo cuesta la mitad del tiempo y de los materiales. No necesita respirar, comer, beber ni dormir.")),
      "5": sub(sblk("Insecto mecánico",
        "A nivel 5 construyes un artefacto con forma de insecto Diminuto (escarabajo, cucaracha, mariposa, grillo…) que vuela, tiene 1 PG y no ataca. Como acción, percibes a través de sus sentidos hasta 100 pies. Puedes construir uno tras un descanso corto o largo, y solo puedes tener uno.\n<b>Transmisión (4 Energía).</b> Viaja hasta 24 horas hacia un lugar que hayas visitado o una persona que describas y le entrega un mensaje con tu voz. Si no la encuentra en 24 horas, se destruye.")),
      "10": sub(sblk("Trabajo continuo", "A nivel 10 puedes construir y mantener un segundo Caballero de relojería, con las mismas reglas que el primero.")),
      "13": sub(sblk("Mejora de reconfiguración",
        "A nivel 13 eliges una mejora para un Caballero de relojería: como acción adicional en tu turno, gastando su Energía, se transforma en un nuevo modo de combate. Un mismo caballero solo puede tener una mejora."),
        elegir={"lista": "modo-reconfiguracion", "cantidad": 1}),
      "16": sub(sblk("Activación rápida",
        "A nivel 16 puedes manejar cualquier dispositivo como si lo tuvieras en la mano (no es telequinesis: solo simulas sus funciones manuales), de uno en uno. Como acción adicional, realizas una tarea con un dispositivo que normalmente requeriría una acción.")),
      "19": sub(sblk("Corcel de engranajes",
        "A nivel 19, como acción, tus Caballeros de relojería se fusionan en un caballo de guerra mecánico que te obedece y te sirve de montura dentro y fuera del combate. Mientras lo montas, los efectos que te afectan solo a ti también le afectan a él. Sin órdenes, se protege lo mejor que puede. Como acción, puede desmontarse en dos Caballeros de relojería. Solo puedes tener uno.\n" + STALLION + "\n<i>(El texto original daba CA 30 y modificadores incorrectos; se corrigieron.)</i>")),
    },
    "listasDeEleccion": {
      "modo-reconfiguracion": {"titulo": "Mejora de reconfiguración", "opciones": [
        {"id": "modo-centinela", "nombre": "Modo centinela", "descripcion": "6 Energía: el caballero se transforma en una torreta en un espacio junto a ti y no puede moverse.\n<b>Ataque automatizado.</b> Las criaturas enemigas que entran en un radio de 25 pies de la torreta o empiezan su turno ahí hacen una salvación de Destreza: 1d4 + tu modificador de Inteligencia de daño perforante si fallan, la mitad si tienen éxito (2d4 en el nivel 15, 3d4 en el 17 y 4d4 en el 19)."},
        {"id": "modo-giro", "nombre": "Modo giro", "descripcion": "4 Energía: el caballero se transforma en un dron volador (vuelo 30 pies, +2 a las salvaciones de Destreza y a Sigilo) que no puede alejarse más de 120 pies de ti.\n<b>Guardia aérea.</b> +1d4 a sus pruebas de Percepción, incluso si lo sorprenden o lo ataca alguien invisible (2d4 en el nivel 15, 3d4 en el 17 y 4d4 en el 19); lo pierde si está inmovilizado. Las criaturas enemigas a 25 pies del dron superan una salvación de Destreza o quedan Apresadas por su red y no pueden realizar acciones hasta liberarse."},
      ]},
    },
  },
  "tecnoteurgia": {
    "subNombre": "Discípulo del Rompehechizos",
    "subDescripcion": "✦ DISCÍPULO DEL ROMPEHECHIZOS ✦\nNo lanzas conjuros: los desmontas. Estudias la magia como otra forma de energía, grabas runas en tus circuitos y construyes aparatos que la miden, la desvían y la anulan.",
    "efectos": [comp("habilidad", "Conocimiento Arcano")],
    "subNivel": {
      "3": sub(sblk("Circuitos rúnicos",
        "Al nivel 3 obtienes competencia en Conocimiento Arcano.\n<b>Descarga rúnica (1 Energía).</b> Como acción, haces un ataque a distancia con Inteligencia contra una criatura a 60 pies: 1d6 + tu modificador de Inteligencia de daño de fuerza (1d8 en el nivel 5, 2d6 en el 11 y 2d8 en el 17).\n<b>Sensor taumatúrgico (1 Energía).</b> Como acción, durante 10 minutos percibes la magia a 30 pies y su escuela, como el conjuro Detectar magia (pero no es un conjuro).")),
      "6": sub(sblk("Interferencia arcana",
        "A nivel 6, cuando una criatura que puedes ver a 60 pies lanza un conjuro, puedes usar tu reacción y gastar 3 Energía: hace una salvación de Inteligencia contra tu CD de artefacto. Si falla y el conjuro es de nivel igual o inferior a la mitad de tu nivel de Ingeniero (redondeando hacia abajo), falla y el espacio se gasta. Puedes hacerlo tantas veces como tu modificador de Inteligencia (mínimo 1) por descanso largo.")),
      "10": sub(sblk("Blindaje rúnico", "Desde el nivel 10 tienes resistencia al daño de fuerza y ventaja en las salvaciones contra conjuros.",
        efectos=[{"type": "resistencia", "value": "fuerza"}])),
      "14": sub(sblk("Sobrecarga arcana",
        "Desde el nivel 14, tu Descarga rúnica causa un dado adicional de daño. Una vez por descanso largo, cuando superas una salvación contra un conjuro, recuperas Energía igual al nivel del conjuro × 2.")),
    },
  },
  "automata": {
    "subNombre": "Discípulo del Autómata",
    "subDescripcion": "✦ DISCÍPULO DEL AUTÓMATA ✦\nTu mejor invento camina a tu lado: un autómata leal de metal y vapor que crece contigo.",
    "efectos": [{"type": "habilita", "value": "companero"}],
    "subNivel": {
      "3": sub(sblk("Autómata compañero",
        "Al nivel 3 construyes un autómata Mediano (constructo). Regístralo en la pestaña Criaturas.\n"
        + table(["Rasgo", "Valor"], [
            ["CA", "14 + tu bonificador por competencia"], ["PG", "5 × tu nivel de Ingeniero + su modificador de Constitución"],
            ["Velocidad", "30 pies"], ["Atributos", "FUE 14, DES 12, CON 14, INT 6, SAB 10, CAR 3"],
            ["Golpe", "Tu ataque de artefacto; 1d6 + tu modificador de Inteligencia contundente (1d8 en el nivel 5, 2d6 en el 11, 2d8 en el 17)"],
            ["Inmunidades", "Veneno; Envenenado, Hechizado y Agotamiento"]]) +
        "\nActúa en tu turno; si no le das órdenes (acción adicional), esquiva. A 0 PG lo reparas con 1 hora y 25 po en piezas; si es destruido, reconstruirlo cuesta 8 horas y 100 po.")),
      "6": sub(sblk("Protocolos de combate",
        "A nivel 6 tu autómata ataca dos veces cuando le ordenas atacar y, como reacción, impone desventaja al ataque de una criatura a 5 pies de él contra alguien que no sea él.")),
      "10": sub(sblk("Enlace sensorial",
        "Desde el nivel 10 ves y oyes a través de tu autómata a cualquier distancia en el mismo plano (acción adicional para activarlo o desactivarlo). Como acción, gastando 2 Energía, le reparas 2d8 + tu modificador de Inteligencia PG a 60 pies.")),
      "14": sub(sblk("Autómata de guerra",
        "Desde el nivel 14 tu autómata es Grande, sus golpes causan un dado adicional y tiene resistencia al daño contundente, cortante y perforante no mágico. Una vez por descanso largo, cuando caería a 0 PG, se queda con 1.")),
    },
  },
}
N["3"]["subClase"] = SUB

SKILLS = ["Historia", "Investigación", "Juego de Manos", "Medicina", "Percepción", "Perspicacia"]
cls = {
    "nombre": "Ingeniero",
    "claseName": "ingeniero",
    "seccion": "agarias",
    "icono": "🔧",
    "fuenteReglas": "«Engineer», de Marc Lee (adaptado para Agarias)",
    "dadoDeGolpe": 10,
    "nivelesDeAumento": [4, 8, 12, 16, 19],
    "conjurador": False,
    "attribute": "inteligencia",
    "cdClase": {"nombre": "CD de artefacto", "atributos": ["inteligencia"]},
    "subclaseNombre": "Especialización de Ingeniero",
    "pericias": {"5": 2, "7": 2},
    "taller": True,
    "competencias": {
        "salvaciones": ["destreza", "inteligencia"],
        "armaduras": ["Armadura ligera"],
        "armas": ["Armas simples", "Armas de fuego"],
        "herramientas": ["Herramientas de hojalatero", "Herramientas de herrero", "Herramientas de armero"],
        "habilidades": {"elegir": 4, "de": SKILLS},
    },
    "competenciasMulticlase": {
        "armaduras": ["Armadura ligera"], "armas": [], "herramientas": ["Herramientas de hojalatero"],
        "habilidades": {"elegir": 1, "de": SKILLS},
    },
    "equipoInicial": [
        "Cualquier arma simple cuerpo a cuerpo.",
        "Una ballesta ligera y 20 virotes.",
        "(a) Paquete de erudito o (b) paquete de explorador.",
        "(a) Ropa de mecánico o (b) herramientas de hojalatero.",
    ],
    "oroInicial": "5d4 × 10",
    "listasDeEleccion": {
        "esquemas": {
            "titulo": "Esquemas de artefactos",
            "reemplazarAlSubir": True,
            "diferir": "taller",
            "ayuda": "Triviales y simples desde el nivel 1, avanzados desde el 6 e intrincados desde el 11. Al subir de nivel puedes cambiar uno. No es obligatorio elegirlos al subir: el Taller avisa de los que faltan.",
            "opciones": ESQUEMAS,
        },
        "dispositivo-caracteristico": {
            "titulo": "Dispositivo característico",
            "ayuda": "Sus capacidades mejoran solas a los niveles 7, 13 y 19.",
            "opciones": DISPOSITIVOS,
        },
    },
    "niveles": N,
}
json.dump(cls, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print("ok", len(ESQUEMAS), "esquemas:", {c: sum(1 for x in G if x[2] == c) for c in (T, S, A, I)})
