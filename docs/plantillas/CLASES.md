# Cómo escribir una clase (formato JSON)

La plantilla [`clase-plantilla.json`](clase-plantilla.json) es una clase **completa y
funcional** («Centinela del Alba»): 20 niveles, tabla de progresión, rasgos con y sin
efectos automáticos, dos subclases, mejoras de característica, conjuros, el
aumento de atributos del nivel 20, **Defensa sin armadura**, un **bono que sale de la
tabla** y **elecciones** (votos, arma, oficio, trucos y
habilidad de subclase) con los cuatro tipos de lista. Las pruebas la cargan y la suben de 1 a 20 y
de 20 a 2 (`frontend/tests/class-data.test.js`).

Es **el mismo formato** que usan los archivos de `frontend/src/data/classes/`. No hay
una estructura paralela.

## Pasos para completar una clase

1. Abre el archivo existente de la clase (por ejemplo `guerrero.json`). **No cambies
   su `claseName`** (`"guerrero"`): es lo que guardan los personajes. Si creas un
   archivo nuevo para una clase que ya existe, se usará el último que se cargue y
   puede haber confusión: mejor edita el existente.
2. Copia de la plantilla las partes que necesites (niveles, rasgos, subclases…).
3. Comprueba el archivo:
   ```bash
   node tools/check_classes.mjs frontend/src/data/classes/guerrero.json
   ```
   `✓` sin errores · `⚠` con avisos (funciona, pero falta algo) · `✗` con errores (no se cargaría bien).
4. `cd frontend && npm test` y abre la app: la clase aparece al subir de nivel.

Para una clase **nueva** (que no existe todavía), copia la plantilla con otro nombre
de archivo y pon un `claseName` nuevo en minúsculas y sin espacios.

## Campos de la clase

| Campo | Obligatorio | Qué es | Qué hace el motor |
|---|---|---|---|
| `nombre` | Sí | Nombre visible | — |
| `claseName` | Sí | Identificador estable (`"guerrero"`) | Es la clave que guardan los personajes |
| `seccion` | Sí | `manual`, `tasha`, `agarias` u `homebrew` | Agrupa la clase al elegirla |
| `icono` | No | Emoji (`"🌅"`) | Icono en la ficha (las oficiales ya tienen uno) |
| `fuenteReglas` | No | Libro o autor | Se muestra junto a las competencias |
| `dadoDeGolpe` | Sí | `6`, `8`, `10` o `12` | PG por nivel (máximo a nivel 1, tirada o media después) |
| `nivelesDeAumento` | Sí | Niveles con «Mejora de característica o dote» | El asistente de nivel pide +2/+1+1 o una dote |
| `competencias` | Sí | Ver abajo; `{ "pendiente": true }` si no se sabe | Salvaciones, armaduras, armas, herramientas y elección de habilidades |
| `competenciasMulticlase` | Sí | Lo que da al entrar por multiclase | Se aplica si no es la primera clase |
| `equipoInicial` | No | Lista de líneas | Se muestra en «Fundamentos» |
| `oroInicial` | No | `"5d4 × 10"` | Se muestra en «Fundamentos» |
| `conjurador` | No | `true` si lanza conjuros | Activa la pestaña de conjuros |
| `attribute` | Si `conjurador` | Atributo de lanzamiento | CD y ataque de conjuro |
| `lanzamiento` | Si la clase lanza conjuros (obligatorio en clases nuevas) | `{ "progression": "full"\|"half"\|"half_up"\|"artificer"\|"pact", "cantripsKnown": [20], "preparedTable": [20] }` o, en vez de `preparedTable`, `"preparedFrom": "full"\|"half"\|null` / `"spellsKnown": [20]` | Espacios, trucos y conjuros preparados. **Lo que declara el JSON manda sobre la tabla del código**: así una clase oficial puede pasar a las tablas 2024 (ej. `bardo.json`) |

**`half_up`** (reglas 2024, Paladín y Explorador): lanzador «medio» con espacios desde el
nivel 1; en multiclase cuenta la mitad de sus niveles **redondeando hacia arriba**.
(`half` es la regla anterior: sin espacios a nivel 1 y redondeo hacia abajo.)

**`espaciosPacto`** (Magia del Pacto 2024, con `"progression": "pact"`): 20 pares
`[cantidad, nivel]`, uno por nivel; todos los espacios son del mismo nivel. Ej. Brujo:
`[[1, 1], [2, 1], [2, 2], …, [4, 5]]`. Sustituye a la tabla antigua del código, que mezclaba
el Arcanum Místico con los espacios.

**`preparedTable`** (reglas 2024): número fijo de conjuros preparados por nivel (columna
«Conjuros preparados» de la tabla de la clase). Sustituye a `preparedFrom` (modificador +
nivel) y a `spellsKnown`; no se pueden combinar.
| `listaConjuros` | No | Nombres de conjuro de su lista | Filtro «Sólo mis clases» en la pestaña de conjuros |
| `cdClase` | No | `{ "nombre": "CD de Juramento", "atributos": ["sabiduria"] }` | Calcula y muestra 8 + competencia + mejor modificador |
| `subclaseNombre` | No | Cómo se llama la subclase (`"Juramento"`) | Textos del asistente y de la ficha |
| `subclasePendiente` | No | `true` si aún no hay subclases | Muestra un aviso en vez de pedir subclase |
| `pericias` | No | `{ "1": 2, "6": 2 }` | Cuenta de pericias que otorga la clase (orientativa) |
| `taller` | No | `true` | Activa la pestaña **Taller** (Ingeniero): Energía (2 × nivel), artefactos equipados según la columna «Artefactos equipados (T · S · A · I)», inventario de materiales y construcción con módulos. El catálogo está en `frontend/src/data/taller.json` (generado por `tools/build_taller.py`); la lógica, en `domain/workshop.js`. Las listas con `"diferir": "taller"` se eligen desde esa pestaña |

### `competencias`

```json
{
  "salvaciones": ["sabiduria", "carisma"],
  "salvacionesElegir": { "elegir": 1, "de": ["destreza", "inteligencia"] },
  "armaduras": ["Armadura ligera", "Escudos"],
  "armas": ["Armas simples", "Armas marciales"],
  "herramientas": [],
  "habilidades": { "elegir": 2, "de": ["Atletismo", "Medicina"] },
  "notaArmadura": "Texto opcional"
}
```
`habilidades.de` puede ser `"cualquiera"`. Los nombres de habilidad deben ser los de la
app (`Conocimiento Arcano`, `Trato con Animales`, `Juego de Manos`…). Atributos:
`fuerza`, `destreza`, `constitucion`, `inteligencia`, `sabiduria`, `carisma`.

## Niveles (`niveles`)

Un objeto con las claves `"1"` a `"20"`. Cada nivel puede tener:

| Campo | Qué es |
|---|---|
| `descripcion` (nivel 1) | Resumen de una línea |
| `descripcionLarga` (nivel 1) | Presentación de la clase |
| `atributoInicial` (nivel 1) | Texto de «Atributos de clase» que se copia a las notas del personaje (formato `❖ Título:` y `    :: línea`) |
| `infoCubo` | Fila de la tabla de progresión: `{ "columnas": ["Furia", "Daño"], "filas": [["2", "+2"]] }`. **Sólo en los niveles donde algo cambia**: los niveles sin `infoCubo` heredan la última tabla declarada (la app no repite filas iguales). `python3 tools/class_tables.py` quita las repetidas. |
| `infoBlock` | Rasgos que se obtienen en ese nivel: `{ "blockUno": { "name", "titleName", "descripcion", "efectos" } }` |
| `subClase` | **Sólo en el nivel en que se elige la subclase.** Ver abajo |
| `requeridoTrue` | Aumentos fijos de atributos (p. ej. nivel 20): `{ "statAmount": { "fuerza": 4, "choice": { "count": 1, "bonus": 2, "allowedChoices": [...] } }, "statMax": { "activos": ["fuerza"], "stat": 24 } }` |

La descripción admite HTML sencillo (`<b>`, `<i>`, `<br>`, listas y tablas).

### Subclases (`subClase`)

```json
"subClase": {
  "faro": {
    "subNombre": "Juramento del Faro",
    "subDescripcion": "…",
    "efectos": [ { "type": "competencia", "kind": "armadura", "value": "Armadura pesada" } ],
    "subNivel": {
      "3": { "infoSubBlock": { "subBlockUno": { "subName": "…", "subDescripcion": "…", "efectos": [] } } },
      "7": { "infoSubBlock": { … } }
    }
  }
}
```
La clave (`"faro"`) se guarda en el personaje: en minúsculas, sin espacios, y no la
cambies después. `efectos` de la subclase se aplican desde que se elige; los de cada
rasgo, desde su nivel.

## Elecciones (`listasDeEleccion` y `elegir`)

Para todo rasgo que diga «elige N de…» (maniobras, estilos de combate, trucos,
herramientas, maestrías…). Al subir de nivel aparece el paso **Elecciones** del
asistente; la ficha muestra lo elegido en la pestaña «Rasgos» y avisa si falta algo
(por ejemplo, personajes creados antes de que la clase declarase sus elecciones).

**1. Declara la lista** en `listasDeEleccion`, en la raíz de la clase (sirve para la
clase y todas sus subclases) o dentro de una subclase (sólo para esa subclase):

```json
"listasDeEleccion": {
  "maniobras": {
    "titulo": "Maniobras",
    "ayuda": "Texto de ayuda opcional bajo el título.",
    "opciones": [
      { "id": "parada", "nombre": "Parada", "descripcion": "…", "efectos": [] }
    ]
  }
}
```

| Tipo de lista | Cómo se declara | Qué se guarda | Efectos automáticos |
|---|---|---|---|
| Opciones propias | `"opciones": [{ "id", "nombre", "descripcion", "efectos"? }]` | el `id` | los `efectos` de la opción; un efecto con `"nivel": N` sólo se aplica desde el nivel N de la clase |
| Habilidades | `"desde": "habilidades", "de": [...]` (o `"cualquiera"`) | el nombre | competencia en la habilidad |
| Conjuros del catálogo | `"desde": "conjuros", "clase": "mago"` (o `["clerigo", "druida", "mago"]`), `"niveles": [0]` (0 = trucos) | el nombre | con `"siemprePreparados": true`, el conjuro queda siempre preparado |

> **Las listas de conjuros no se piden al subir de nivel.** Se pueden elegir de 0 a
> `cantidad` en ese momento (la interfaz no las muestra; sólo ofrece el cambio
> opcional de `reemplazarAlSubir`). Lo que falta queda pendiente: la pestaña
> Conjuros lo avisa («Aún puedes elegir X conjuros») junto con los trucos y
> conjuros preparados libres, y deja completarlo por partes. Ver
> `deferSpellChoices` y `pendingSpellChoices` en `domain/class-choices.js`.
| Libre (se escribe) | `"libre": true`, opcional `"placeholder"` y `"efectoLibre"` | el texto | `efectoLibre` con el texto como valor (p. ej. `{ "type": "competencia", "kind": "herramienta" }`) |

**Elecciones dentro de una opción** (`"elegir"` en una opción): al marcar esa opción
aparecen sus elecciones en el mismo paso. Ej. del Paladín: Estilo de Combate → «Dote»
abre «Dote de Estilo de Combate» (1) y «Guerrero Bendito» abre 2 trucos de Clérigo.
La lista que abre debe existir en `listasDeEleccion` de la clase (o de la subclase):

```json
{ "id": "guerrero-bendito", "nombre": "Guerrero Bendito", "descripcion": "…",
  "elegir": { "lista": "trucos-guerrero-bendito", "cantidad": 2 } }
```

**Requisitos y opciones repetibles** (invocaciones del Brujo):

```json
{ "id": "golpe-arcano", "nombre": "Golpe Arcano", "descripcion": "…",
  "requisitos": { "nivel": 5, "opcion": "pacto-espada" } },
{ "id": "explosion-agonizante", "nombre": "Explosión Agonizante", "descripcion": "…",
  "requisitos": { "nivel": 2 }, "repetible": true }
```

- `requisitos.nivel`: nivel mínimo **de la clase** en el que se elige.
- `requisitos.opcion`: id (o lista de ids) de otra opción de la misma lista que hay que
  tener, ya conocida o marcada en el mismo paso.
- Las opciones que no cumplen aparecen deshabilitadas con su requisito; el motor también
  lo valida. No se puede reemplazar una opción que es requisito de otra que se conserva.
- `repetible: true`: se puede elegir otra vez; la copia se guarda como `id~2`, `id~3`…
  y se muestra como «Nombre (2)». No uses `~` en los ids.

**Efectos por nivel dentro de una opción** (`"nivel"`): cuando lo elegido da cosas
distintas según el nivel. Ej. del Círculo de la Tierra: el terreno elegido deja
preparados unos conjuros a nivel 3, más a los niveles 5, 7 y 9, y da una resistencia
desde el 10. Combinado con `cambiable`, al cambiar de terreno cambia todo a la vez:

```json
{ "id": "polar", "nombre": "Terreno Polar", "efectos": [
  { "type": "conjuro_preparado", "value": "Rayo de escarcha" },
  { "type": "conjuro_preparado", "value": "Cono de frío", "nivel": 9 },
  { "type": "resistencia", "value": "frio", "nivel": 10 } ] }
```

Usa **libre** cuando las opciones no están en los datos de la app (p. ej. las dotes
de Estilo de Combate): no inventes la lista.

Opciones de la lista:

| Campo | Qué hace |
|---|---|
| `escuela: "Evocación"` | (listas de conjuros) Sólo conjuros de esa escuela. Ej.: Experto en Evocación |
| `libroConjuros: true` | (listas de conjuros) Lo elegido se añade al libro de conjuros: aparece en «Mi grimorio» (con la marca «En tu libro») y se prepara desde ahí. Ej.: libro del Mago, Experto en Abjuración |
| `siemprePreparados: true` | (listas de conjuros) Lo elegido aparece en «Siempre preparados» de la pestaña Conjuros y no cuenta para el límite. Ej.: Descubrimientos Mágicos |
| `nivelMax: "espacios"` | (listas de conjuros) El nivel máximo es el de los espacios de conjuro de la clase en cada momento, también en los cambios. Ej.: Descubrimientos Mágicos |
| `reemplazarAlSubir: true` | Cada vez que se sube en la clase, se ofrece cambiar una elección (opcional). Ej.: estilos de combate, trucos y hechizos del Caballero Arcano |
| `cambiable: true` | Se puede cambiar en cualquier momento desde la ficha (botón «Cambiar»). Ej.: maestría en armas tras un descanso largo |
| `diferir: true` o `diferir: "taller"` | No se pide al subir de nivel: se puede elegir de 0 a `cantidad` y lo que falte queda pendiente en la pestaña indicada (`true` = Rasgos; `"taller"` = Taller del Ingeniero). Las listas de conjuros ya se comportan así (pestaña Conjuros). Ej.: esquemas del Ingeniero |

**2. Concede elecciones** con `elegir` en el rasgo que las da (`infoBlock` o
`infoSubBlock`), o en el propio nivel (`niveles.N.elegir` o `subNivel.N.elegir`)
cuando ese nivel no tiene un rasgo propio:

```json
"elegir": { "lista": "maniobras", "cantidad": 2, "reemplazar": 1 }
```

| Campo | Qué es |
|---|---|
| `lista` | id de la lista (de la clase o de la subclase) |
| `cantidad` | cuántas se eligen en este nivel (0 = sólo cambio) |
| `reemplazar` | cuántas ya conocidas se pueden cambiar al elegir (opcional) |
| `nivelMax` | en listas de conjuros: nivel de conjuro máximo de esta elección |
| `rasgo` | (sólo en `elegir` de nivel) nombre que se muestra como origen |
| `multiclase` | (nivel 1) cuántas se eligen si la clase **no** es la primera del personaje. Ej.: Bardo 3 instrumentos, multiclase 1; herramienta del Monje, multiclase 0 |

`nivelMax` en una concesión también admite `"espacios"`.

Puede ser un objeto o una lista de objetos (varias elecciones en el mismo rasgo).

Cómo se guarda: en el nivel del personaje en que se eligió
(`levels[i].featureChoices.elecciones`). Bajar de nivel deshace esas elecciones
sin más. Los ids de las listas y de las opciones se guardan en las fichas: **no los
cambies** una vez publicada la clase.

Ejemplo completo: `frontend/src/data/classes/guerrero.json` (estilo de combate,
maestría en armas, maniobras, herramienta + habilidad del Maestro de Batalla, y
trucos y hechizos del Caballero Arcano según su tabla).

## Efectos automáticos (`efectos`)

Lo que la ficha **calcula sola**. Todo lo demás se muestra como texto.

| `type` | Campos | Ejemplo |
|---|---|---|
| `competencia` | `kind`: habilidad, salvacion, armadura, arma, herramienta, idioma · `value` | `{ "type": "competencia", "kind": "habilidad", "value": "Percepción" }` |
| `pericia` | `amount` | `{ "type": "pericia", "amount": 2 }` |
| `bono` | `target`: iniciativa, velocidad, pg_por_nivel, pg_max, salvaciones, `atributo:<atributo>`, `habilidad:<habilidad>`, `pruebas:<atributo>`, `trucos` · `value` (o `desdeTabla`, `desdeNivel` + `mas`, o `desdeAtributo` + `minimo`) | `{ "type": "bono", "target": "velocidad", "value": 10 }` |
| `resistencia` / `inmunidad` / `vulnerabilidad` | `value`: tipo de daño (`fuego`, `necrotico`, `profano`…) | `{ "type": "resistencia", "value": "fuego" }` |
| `inmunidad_condicion` | `value`: condición | `{ "type": "inmunidad_condicion", "value": "Asustado" }` |
| `habilita` | `value`: `criaturas_de_sangre`, `companero` | `{ "type": "habilita", "value": "criaturas_de_sangre" }` |
| `medio_competencia` | `atributos` (opcional) | `{ "type": "medio_competencia" }` (Experto en todos los oficios / Mano para Todo: mitad del bono en pruebas sin competencia e iniciativa; la ficha marca «½»). Con `"atributos": ["inteligencia"]`, sólo en las pruebas de esos atributos (Enciclopedia andante del Ingeniero); la iniciativa, si incluye `destreza` |
| `conjuro_preparado` | `value`: nombre del conjuro **como en el catálogo** | `{ "type": "conjuro_preparado", "value": "Hechizar persona" }` (si no está en el catálogo se muestra igual, marcado «No está en el catálogo») |
| `lista_conjuros` | `value`: clave de clase | `{ "type": "lista_conjuros", "value": "clerigo" }` (Secretos Mágicos: la biblioteca, con «Sólo de mis clases», incluye esa lista) |
| `ca_sin_armadura` | `atributos` (1–3), `base` (10 por defecto), `escudo` (si admite escudo) | `{ "type": "ca_sin_armadura", "base": 10, "atributos": ["destreza", "sabiduria"], "escudo": false }` |

**`ca_sin_armadura`** (Defensa sin Armadura del Monje o del Bárbaro): la ficha calcula
esa CA y la muestra bajo «Clase de armadura» con un botón «Usar». La CA sigue siendo
manual porque la app no sabe qué armadura llevas.

**`trucos`**: trucos conocidos extra **de la clase que tiene el rasgo** (Orden Divina:
Taumaturgo). **`habilidad:<nombre>`**: bono a las pruebas de una habilidad, con el nombre
como en la app (p. ej. `habilidad:Conocimiento Arcano`).

**`pruebas:<atributo>`**: bono a **todas** las pruebas de un atributo (todas sus
habilidades; con `pruebas:destreza`, también la iniciativa). Ej. Glamour de Otro Mundo:
`{ "type": "bono", "target": "pruebas:carisma", "desdeAtributo": "sabiduria", "minimo": 1 }`.

**Bono igual a un modificador** (`desdeAtributo`, `minimo` opcional): en vez de `value`,
el bono vale el modificador del atributo, con un mínimo. Sirve para habilidades, `pruebas:…`, `iniciativa` (Acechador en la Penumbra) y
`salvaciones` (Aura de Protección del Paladín: + Carisma, mínimo +1). Ej. del Taumaturgo:
`{ "type": "bono", "target": "habilidad:Religión", "desdeAtributo": "sabiduria", "minimo": 1 }`.

**Aumento de atributo con máximo** (`maximo`, sólo con `atributo:<clave>`): sube la puntuación y también su límite. Ej. Tecnomancia de élite (Ingeniero Tecnoteúrgo 20): `{ "type": "bono", "target": "atributo:inteligencia", "value": 2, "maximo": 22 }`. Sirve en rasgos de subclase, donde no existe `requeridoTrue`.

**Bono igual a tu nivel en la clase** (`desdeNivel: true`, `mas` opcional): cuenta solo los
niveles de la clase que da el rasgo, también en multiclase. Ej. Resiliencia Dracónica (PG
máximos + nivel de Hechicero): `{ "type": "bono", "target": "pg_max", "desdeNivel": true }`.

**Bono que sale de la tabla** (`desdeTabla`): en lugar de un `value` fijo, un `bono` puede
leer una columna de la tabla de progresión (`infoCubo`) al nivel actual de la clase. Se
toma el número del texto («+15 pies» → 15; «-» → 0). Ej. del Monje:
`{ "type": "bono", "target": "velocidad", "desdeTabla": "Movimiento sin Armadura" }`.
Sólo funciona en rasgos de clase y subclase; el validador comprueba que la columna exista.

## Qué automatiza hoy el motor

Para la segunda etapa (comparar las clases completas con el motor):

| Mecánica | Estado |
|---|---|
| Dado de golpe, PG por nivel, multiclase | ✅ Implementada |
| Competencias, salvaciones, elección de habilidades, multiclase | ✅ Implementada |
| Mejora de característica / dote por nivel | ✅ Implementada |
| Subclase y su nivel; rasgos por nivel (texto) | ✅ Implementada |
| Elecciones de rasgos («elige N»: maniobras, estilos, trucos, herramientas…) | ✅ Implementada (con `listasDeEleccion` y `elegir`) |
| Espacios de conjuro (completo, medio, artífice, pacto), CD y ataque de conjuro, preparados | ✅ Implementada |
| Aumentos de atributo y máximos (Bárbaro 20, Shadow Knight 20) | ✅ Implementada |
| Competencias, resistencias, inmunidades, bonos a iniciativa/velocidad/PG/salvaciones/atributos | ✅ Implementada (con `efectos`) |
| Tablas de lanzamiento 2024 (trucos y preparados fijos por nivel) | ✅ Implementada (`lanzamiento.preparedTable`) |
| Conjuros siempre preparados por rasgos | ✅ Implementada (`conjuro_preparado` y listas con `siemprePreparados`) |
| Listas de conjuros de otras clases (Secretos Mágicos) | ✅ Implementada (`lista_conjuros`) |
| Trucos extra y bonos a habilidades iguales a un modificador (Orden Divina) | ✅ Implementada (`bono` a `trucos` y a `habilidad:…` con `desdeAtributo`) |
| Elecciones con efectos que dependen del nivel (terreno del Círculo de la Tierra) | ✅ Implementada (`"nivel"` en los efectos de una opción) |
| Lanzador medio 2024 (espacios a nivel 1, multiclase redondeando arriba) | ✅ Implementada (`progression: "half_up"`) |
| Elecciones que abre una opción (Guerrero Bendito) | ✅ Implementada (`"elegir"` dentro de una opción) |
| Bono a salvaciones igual a un modificador (Aura de Protección) | ✅ Implementada (`bono` a `salvaciones` con `desdeAtributo`) |
| Bono a todas las pruebas de un atributo e iniciativa + modificador (Errante Feérico, Acechador) | ✅ Implementada (`pruebas:<atributo>`, `iniciativa` con `desdeAtributo`) |
| Bonos que valen el nivel en la clase (Resiliencia Dracónica) | ✅ Implementada (`bono` con `desdeNivel`) |
| Opciones con requisitos de nivel u otra opción, y repetibles (invocaciones) | ✅ Implementada (`requisitos`, `repetible`) |
| Magia del Pacto 2024 (espacios del mismo nivel) | ✅ Implementada (`lanzamiento.espaciosPacto`) |
| Libro de conjuros y conjuros por escuela (Mago) | ✅ Implementada (`libroConjuros`, `escuela` en listas de conjuros) |
| Mitad de competencia (Experto en todos los oficios), también sólo para unos atributos (Enciclopedia andante) | ✅ Implementada (`medio_competencia`, con `atributos` opcional) |
| Conjuros de una subclase (Caballero Arcano, Embaucador Arcano) | ⚠️ Los trucos y hechizos se eligen y se guardan (elecciones); los espacios se muestran como tabla en el rasgo, sin pestaña de conjuros propia |
| Tabla de progresión (usos, dados, etc.) | ⚠️ Se muestra, pero no hay contador de usos |
| Ataque extra, Acción adicional, Reacciones | ⚠️ Sólo texto |
| CA (armaduras, Defensa sin armadura) | ⚠️ La CA es manual; la Defensa sin armadura se calcula y se ofrece (`ca_sin_armadura`) |
| Bonos que crecen con la tabla (Movimiento sin armadura) | ✅ Implementada (`bono` con `desdeTabla`) |
| Recursos con recarga (descanso corto/largo: Furia, Ki, Canalizar divinidad…) | ❌ No implementada |
| Reacciones/acciones con disparador → condición → efecto | ❌ No implementada |
| Daño adicional condicionado (Ataque furtivo, Castigo divino) | ❌ No implementada |

Cuando tengas todas las clases completas, `node tools/check_classes.mjs` dirá cuántos
rasgos de cada clase son «sólo texto»: esa es la lista de trabajo de la segunda etapa.
