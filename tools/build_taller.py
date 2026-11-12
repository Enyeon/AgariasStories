"""Genera frontend/src/data/taller.json: catálogo del Taller del Ingeniero.

Reglas que sigue (las de la clase): cada receta y módulo tiene una complejidad
(Trivial, Simple, Avanzado, Intrincado) que fija su valor total, su tiempo y el
nivel de Ingeniero que hace falta (avanzado 6, intrincado 11). Los materiales
forman parte de ese valor: el resto se paga en oro (herramientas, combustible,
consumibles). Las armas de fuego siguen las de la Guía del Dungeon Master
(pistola, mosquete, revólver, rifle de caza, rifle automático); el resto es
diseño propio para Agarias.
"""
import json, sys
OUT = sys.argv[1]

MATERIALES = [
    ("chatarra", "Chatarra", 1, "Metal viejo, tornillos y restos aprovechables. Lo que da el Héroe del desguace."),
    ("tela", "Tela técnica y cuero", 2, "Lona encerada, cuero curtido y correas."),
    ("engranajes", "Engranajes y piñones", 2, "Ruedas dentadas de latón y acero de varios tamaños."),
    ("muelles", "Muelles y resortes", 2, "Resortes de compresión, de torsión y ballestas."),
    ("tuberias", "Tubos y válvulas", 3, "Conductos de cobre, juntas y válvulas de presión."),
    ("cableado", "Cableado de cobre", 4, "Bobinas, cable aislado y contactos."),
    ("placas", "Placas de acero", 5, "Chapas templadas para blindajes y carcasas."),
    ("polvora", "Pólvora", 5, "Una carga de pólvora negra (bien seca)."),
    ("lentes", "Lentes y cristales", 10, "Cristal pulido, prismas y lentes de aumento."),
    ("quimicos", "Reactivos alquímicos", 10, "Ácidos, sales y combustibles alquímicos."),
    ("precision", "Piezas de precisión", 15, "Rodamientos, ejes calibrados y mecanismos de relojería."),
    ("nucleo", "Núcleo de energía", 50, "Una batería química o un cristal de arcanita cargado."),
]

CATEGORIAS = [
    ("arma-fuego", "Armas de fuego"), ("arma-mecanica", "Armas mecánicas"),
    ("armadura", "Armaduras"), ("equipo", "Equipo y municiones"),
]
TIPOS = [
    ("canon", "Cañón"), ("mira", "Mira"), ("cargador", "Mecanismo de carga"), ("municion", "Cámara de munición"),
    ("motor", "Motor"), ("filo", "Filo o cabeza"), ("blindaje", "Blindaje"), ("servos", "Servomotores"),
    ("propulsion", "Propulsión"), ("energia", "Energía"), ("sistema", "Sistema auxiliar"),
]
ARMERO, HERRERO, HOJALATERO = "Herramientas de armero", "Herramientas de herrero", "Herramientas de hojalatero"

def receta(i, n, cat, comp, herr, mat, ranuras, res, desc, cantidad=1):
    return {"id": i, "nombre": n, "categoria": cat, "complejidad": comp, "herramientas": herr,
            "materiales": mat, "ranuras": ranuras, "resultado": res, "descripcion": desc, **({"cantidad": cantidad} if cantidad != 1 else {})}
def arma(dado, tipo, prop, comp_arma, cuerpo=False, alcance=None, peso=None):
    r = {"tipo": "arma", "dado": dado, "tipoDano": tipo, "propiedades": prop, "competencia": comp_arma,
         "atributo": "fuerza" if cuerpo else "destreza"}
    if alcance: r["alcance"] = alcance
    if peso: r["peso"] = peso
    return r
def armadura(ca, tipo, extra=""):
    return {"tipo": "armadura", "ca": ca, "tipoArmadura": tipo, **({"nota": extra} if extra else {})}
def objeto(nota): return {"tipo": "objeto", "nota": nota}

RECETAS = [
    # Armas de fuego (Guía del Dungeon Master)
    receta("pistola", "Pistola", "arma-fuego", "Simple", [ARMERO],
        {"placas": 2, "muelles": 1, "engranajes": 1, "polvora": 1}, ["canon", "mira", "cargador", "municion"],
        arma("1d10", "perforante", "Munición, Recarga", "Armas de fuego", alcance="30/90", peso="3 lb"),
        "Un arma de fuego de una mano, de llave de chispa. Tras cada disparo hay que recargarla."),
    receta("mosquete", "Mosquete", "arma-fuego", "Simple", [ARMERO],
        {"placas": 3, "muelles": 1, "engranajes": 1, "polvora": 2}, ["canon", "mira", "cargador", "municion"],
        arma("1d12", "perforante", "Munición, Recarga, A dos manos", "Armas de fuego", alcance="40/120", peso="10 lb"),
        "Arma larga de ánima lisa: potente, lenta de recargar."),
    receta("trabuco", "Trabuco", "arma-fuego", "Simple", [ARMERO],
        {"placas": 2, "tuberias": 1, "chatarra": 4, "polvora": 2}, ["canon", "cargador", "municion"],
        arma("2d6", "perforante", "Munición, Recarga, A dos manos, Dispersión (desventaja más allá de 15 pies)", "Armas de fuego", alcance="15/45", peso="8 lb"),
        "Boca acampanada cargada de metralla. Diseño propio de Agarias."),
    receta("revolver", "Revólver", "arma-fuego", "Avanzado", [ARMERO],
        {"placas": 2, "precision": 2, "muelles": 2, "polvora": 2}, ["canon", "mira", "cargador", "municion"],
        arma("2d8", "perforante", "Munición, Recarga (6 disparos)", "Armas de fuego", alcance="40/120", peso="3 lb"),
        "Un tambor de seis recámaras que gira con cada disparo."),
    receta("rifle-de-caza", "Rifle de caza", "arma-fuego", "Avanzado", [ARMERO],
        {"placas": 3, "precision": 2, "lentes": 1, "polvora": 2}, ["canon", "mira", "cargador", "municion"],
        arma("2d10", "perforante", "Munición, Recarga (5 disparos), A dos manos", "Armas de fuego", alcance="80/240", peso="8 lb"),
        "Cañón estriado y cerrojo: precisión a larga distancia."),
    receta("rifle-automatico", "Rifle de repetición de manivela", "arma-fuego", "Intrincado", [ARMERO],
        {"placas": 4, "precision": 4, "engranajes": 4, "polvora": 4, "nucleo": 1}, ["canon", "mira", "cargador", "municion"],
        arma("2d8", "perforante", "Munición, Recarga (30 disparos), A dos manos, Ráfaga", "Armas de fuego", alcance="80/240", peso="8 lb"),
        "<b>Ráfaga.</b> Como acción, gastas 10 balas para rociar un cubo de 10 pies a su alcance normal: cada criatura del área supera una salvación de Destreza CD 15 o recibe el daño del arma."),
    # Armas mecánicas
    receta("puno-hidraulico", "Puño hidráulico", "arma-mecanica", "Simple", [HERRERO],
        {"placas": 2, "tuberias": 2, "muelles": 1}, ["motor", "filo", "sistema"],
        arma("1d8", "contundente", "Ligera", "Armas simples", cuerpo=True, peso="4 lb"),
        "Un guantelete con pistón que golpea con fuerza de prensa."),
    receta("martillo-neumatico", "Martillo neumático", "arma-mecanica", "Simple", [HERRERO],
        {"placas": 3, "tuberias": 2, "engranajes": 1}, ["motor", "filo", "sistema"],
        arma("1d12", "contundente", "Pesada, A dos manos", "Armas marciales", cuerpo=True, peso="15 lb"),
        "Una maza con cabeza de pistón alimentada por un depósito de aire."),
    receta("lanza-de-vapor", "Lanza de vapor", "arma-mecanica", "Avanzado", [HERRERO],
        {"placas": 2, "tuberias": 3, "precision": 1, "engranajes": 2}, ["motor", "filo", "sistema"],
        arma("1d10", "perforante", "Alcance, A dos manos", "Armas marciales", cuerpo=True, peso="8 lb"),
        "La punta sale disparada por la presión del vapor."),
    receta("hoja-vibratoria", "Hoja vibratoria", "arma-mecanica", "Avanzado", [HERRERO],
        {"placas": 2, "precision": 2, "cableado": 2}, ["motor", "filo", "sistema"],
        arma("1d8", "cortante", "Sutil, Versátil (1d10)", "Armas marciales", cuerpo=True, peso="3 lb"),
        "Una espada cuyo filo vibra miles de veces por segundo."),
    # Armaduras
    receta("chaleco-reforzado", "Chaleco reforzado", "armadura", "Trivial", [HERRERO],
        {"tela": 3, "placas": 1}, ["blindaje", "sistema"],
        armadura("12 + mod. Destreza", "Ligera"), "Cuero y placas cosidas en los puntos vitales."),
    receta("coraza-de-vapor", "Coraza de vapor", "armadura", "Simple", [HERRERO],
        {"placas": 4, "tela": 2, "tuberias": 1}, ["blindaje", "servos", "sistema"],
        armadura("15 + mod. Destreza (máx. 2)", "Media"), "Placas articuladas con un pequeño sistema de ventilación."),
    receta("armadura-segmentada", "Armadura segmentada", "armadura", "Avanzado", [HERRERO],
        {"placas": 8, "engranajes": 2, "tela": 2}, ["blindaje", "servos", "propulsion", "sistema"],
        armadura("18", "Pesada", "Fuerza 15 · Desventaja en Sigilo"), "Una armadura completa de segmentos solapados."),
    receta("exoarmadura", "Exoarmadura futurista", "armadura", "Intrincado", [HERRERO, HOJALATERO],
        {"placas": 8, "precision": 4, "cableado": 4, "nucleo": 1}, ["blindaje", "servos", "propulsion", "energia", "sistema"],
        armadura("19", "Pesada", "Sin requisito de Fuerza (servos integrados) · Desventaja en Sigilo"),
        "Un caparazón motorizado con visor y articulaciones asistidas."),
    receta("escudo-plegable", "Escudo plegable", "armadura", "Simple", [HERRERO],
        {"placas": 2, "muelles": 2, "engranajes": 1}, ["blindaje"],
        armadura("+2", "Escudo", "Se pliega en el antebrazo: ponérselo o quitárselo es una interacción"),
        "Un abanico de láminas que se despliega con un resorte."),
    # Equipo y municiones
    receta("cartuchos", "Balas y cargas (20)", "equipo", "Trivial", [ARMERO],
        {"polvora": 2, "chatarra": 4}, [], objeto("Munición para armas de fuego."), "Veinte balas con su pólvora.", cantidad=20),
    receta("garfio-lanzable", "Garfio lanzable", "equipo", "Trivial", [HOJALATERO],
        {"chatarra": 3, "muelles": 1, "tela": 1}, ["sistema"],
        objeto("Lanza un garfio con 50 pies de cuerda (acción)."), "Un arpón de muelle con cuerda enrollada."),
    receta("granada-de-metralla", "Granada de metralla", "equipo", "Avanzado", [HOJALATERO],
        {"chatarra": 3, "polvora": 2, "placas": 1}, [],
        objeto("Acción: lánzala a 60 pies. Explota en un radio de 20 pies: salvación de Destreza CD 15; 5d6 de daño perforante si falla, la mitad si tiene éxito. Un solo uso."),
        "Como la granada de fragmentación de la Guía del Dungeon Master."),
    receta("velocipedo-de-vapor", "Velocípedo de vapor", "equipo", "Intrincado", [HOJALATERO, HERRERO],
        {"placas": 6, "engranajes": 4, "tuberias": 4, "precision": 2, "nucleo": 1}, ["motor", "blindaje", "sistema"],
        objeto("Vehículo Grande para 2 personas: velocidad 60 pies, CA 15, 40 PG. Consume combustible (1 de Reactivos alquímicos por 8 horas)."),
        "Dos ruedas, una caldera y mucho ruido."),
]

def modulo(i, n, tipo, cats, comp, mat, efecto, **mods):
    return {"id": i, "nombre": n, "tipo": tipo, "categorias": cats, "complejidad": comp, "materiales": mat, "efecto": efecto, **mods}
FUEGO, MEC, ARM = ["arma-fuego"], ["arma-mecanica"], ["armadura"]
TODO = ["arma-fuego", "arma-mecanica", "armadura", "equipo"]
MODULOS = [
    modulo("canon-estriado", "Cañón estriado", "canon", FUEGO, "Simple", {"precision": 1}, "+1 a las tiradas de ataque.", ataque=1),
    modulo("canon-largo", "Cañón largo", "canon", FUEGO, "Simple", {"placas": 1, "tuberias": 1}, "El alcance aumenta a la mitad más (por ejemplo, 30/90 → 45/135)."),
    modulo("silenciador", "Silenciador", "canon", FUEGO, "Simple", {"tuberias": 1, "tela": 1}, "El disparo solo se oye a 10 pies."),
    modulo("canon-doble", "Cañón doble", "canon", FUEGO, "Avanzado", {"placas": 2, "precision": 1}, "Puedes disparar dos veces antes de recargar."),
    modulo("mira-optica", "Mira óptica", "mira", FUEGO, "Simple", {"lentes": 1}, "Sin desventaja al disparar a largo alcance."),
    modulo("mira-nocturna", "Mira nocturna", "mira", FUEGO, "Avanzado", {"lentes": 2, "cableado": 1}, "A través de la mira ves en la oscuridad hasta 60 pies."),
    modulo("carga-rapida", "Carga rápida", "cargador", FUEGO, "Trivial", {"muelles": 1}, "Recargar es una interacción con objeto en lugar de parte de la acción."),
    modulo("tambor", "Tambor de repetición", "cargador", FUEGO, "Avanzado", {"precision": 1, "engranajes": 2}, "El arma pierde la propiedad Recarga: admite 6 disparos antes de recargar."),
    modulo("camara-incendiaria", "Cámara incendiaria", "municion", FUEGO, "Avanzado", {"quimicos": 1, "polvora": 1}, "+1d4 de daño de fuego al impactar.", dano="+1d4 fuego"),
    modulo("camara-electrica", "Cámara eléctrica", "municion", FUEGO, "Avanzado", {"cableado": 2, "nucleo": 1}, "+1d4 de daño de relámpago al impactar.", dano="+1d4 relámpago"),
    modulo("bayoneta", "Bayoneta", "sistema", FUEGO, "Trivial", {"placas": 1}, "Puedes atacar cuerpo a cuerpo con el arma: 1d6 perforante (Fuerza)."),
    modulo("motor-de-vapor", "Motor de vapor", "motor", MEC, "Simple", {"tuberias": 2, "engranajes": 1}, "+1d4 de daño contundente adicional al impactar.", dano="+1d4 contundente"),
    modulo("contrapeso-giroscopico", "Contrapeso giroscópico", "motor", MEC, "Avanzado", {"precision": 1, "engranajes": 2}, "+1 a las tiradas de ataque.", ataque=1),
    modulo("filo-dentado", "Filo dentado", "filo", MEC, "Simple", {"placas": 1, "precision": 1}, "Con un crítico, tira un dado de daño del arma adicional."),
    modulo("cabeza-electrificada", "Cabeza electrificada", "filo", MEC, "Avanzado", {"cableado": 2, "nucleo": 1}, "+1d6 de daño de relámpago al impactar.", dano="+1d6 relámpago"),
    modulo("placas-reactivas", "Placas reactivas", "blindaje", ARM, "Avanzado", {"placas": 3, "polvora": 1}, "+1 a la CA.", ca=1),
    modulo("forro-aislante", "Forro aislante", "blindaje", ARM, "Simple", {"tela": 2, "cableado": 1}, "Ventaja en las salvaciones contra el daño de fuego y de relámpago."),
    modulo("servos-ligeros", "Servos ligeros", "servos", ARM, "Simple", {"engranajes": 2, "muelles": 2}, "La armadura no impone desventaja en Sigilo."),
    modulo("servos-de-fuerza", "Servos de fuerza", "servos", ARM, "Avanzado", {"precision": 2, "tuberias": 2}, "Ventaja en las pruebas de Fuerza (Atletismo); tu capacidad de carga se duplica."),
    modulo("propulsores-de-salto", "Propulsores de salto", "propulsion", ARM, "Avanzado", {"tuberias": 2, "quimicos": 1}, "Tus saltos se triplican y, como reacción al caer, reduces el daño por caída a la mitad."),
    modulo("propulsores-de-vuelo", "Propulsores de vuelo", "propulsion", ARM, "Intrincado", {"tuberias": 3, "quimicos": 2, "nucleo": 1}, "4 Energía: velocidad de vuelo de 30 pies durante 1 minuto."),
    modulo("generador-de-escudo", "Generador de escudo", "energia", ARM, "Intrincado", {"nucleo": 1, "cableado": 2, "precision": 1}, "Reacción, 4 Energía: obtienes 2d10 puntos de golpe temporales."),
    modulo("sello-hermetico", "Sello hermético", "sistema", ARM, "Simple", {"tela": 2, "tuberias": 1}, "Con el casco cerrado respiras durante 1 hora sin aire exterior."),
    modulo("compartimento-oculto", "Compartimento oculto", "sistema", TODO, "Trivial", {"chatarra": 2}, "Un hueco escondido para un objeto pequeño; encontrarlo requiere Investigación CD 15."),
    modulo("refuerzo-estructural", "Refuerzo estructural", "blindaje", ["arma-fuego", "arma-mecanica", "equipo"], "Trivial", {"placas": 1}, "El objeto tiene el doble de puntos de golpe y ventaja contra efectos que lo romperían."),
]

json.dump({
    "complejidades": {
        "Trivial": {"valor": 25, "horas": 2, "nivel": 1}, "Simple": {"valor": 40, "horas": 4, "nivel": 1},
        "Avanzado": {"valor": 75, "horas": 6, "nivel": 6}, "Intrincado": {"valor": 150, "horas": 8, "nivel": 11},
    },
    "materiales": [{"id": i, "nombre": n, "precio": p, "descripcion": d} for i, n, p, d in MATERIALES],
    "categorias": [{"id": i, "nombre": n} for i, n in CATEGORIAS],
    "tiposModulo": [{"id": i, "nombre": n} for i, n in TIPOS],
    "recetas": RECETAS,
    "modulos": MODULOS,
}, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print("ok", len(RECETAS), "recetas,", len(MODULOS), "módulos,", len(MATERIALES), "materiales")
