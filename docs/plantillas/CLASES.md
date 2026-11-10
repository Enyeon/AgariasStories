# Cómo escribir una clase (formato JSON)

La plantilla [`clase-plantilla.json`](clase-plantilla.json) es una clase **completa y
funcional** («Centinela del Alba»): 20 niveles, tabla de progresión, rasgos con y sin
efectos automáticos, dos subclases, mejoras de característica, conjuros y el
aumento de atributos del nivel 20. Las pruebas la cargan y la suben de 1 a 20 y
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
| `lanzamiento` | Para clases nuevas que lanzan conjuros | `{ "progression": "full"\|"half"\|"artificer"\|"pact", "preparedFrom": "full"\|"half"\|null, "cantripsKnown": [20 números], "spellsKnown": [20 números] }` | Espacios de conjuro, trucos y conjuros conocidos/preparados. Las 13 clases oficiales ya tienen su tabla en el código |
| `listaConjuros` | No | Nombres de conjuro de su lista | Filtro «Sólo mis clases» en la pestaña de conjuros |
| `cdClase` | No | `{ "nombre": "CD de Juramento", "atributos": ["sabiduria"] }` | Calcula y muestra 8 + competencia + mejor modificador |
| `subclaseNombre` | No | Cómo se llama la subclase (`"Juramento"`) | Textos del asistente y de la ficha |
| `subclasePendiente` | No | `true` si aún no hay subclases | Muestra un aviso en vez de pedir subclase |
| `pericias` | No | `{ "1": 2, "6": 2 }` | Cuenta de pericias que otorga la clase (orientativa) |

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
| `infoCubo` | Fila de la tabla de progresión: `{ "columnas": ["Furia", "Daño"], "filas": [["2", "+2"]] }` |
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

## Efectos automáticos (`efectos`)

Lo que la ficha **calcula sola**. Todo lo demás se muestra como texto.

| `type` | Campos | Ejemplo |
|---|---|---|
| `competencia` | `kind`: habilidad, salvacion, armadura, arma, herramienta, idioma · `value` | `{ "type": "competencia", "kind": "habilidad", "value": "Percepción" }` |
| `pericia` | `amount` | `{ "type": "pericia", "amount": 2 }` |
| `bono` | `target`: iniciativa, velocidad, pg_por_nivel, pg_max, salvaciones, `atributo:<atributo>` · `value` | `{ "type": "bono", "target": "velocidad", "value": 10 }` |
| `resistencia` / `inmunidad` / `vulnerabilidad` | `value`: tipo de daño (`fuego`, `necrotico`, `profano`…) | `{ "type": "resistencia", "value": "fuego" }` |
| `inmunidad_condicion` | `value`: condición | `{ "type": "inmunidad_condicion", "value": "Asustado" }` |
| `habilita` | `value`: `criaturas_de_sangre`, `companero` | `{ "type": "habilita", "value": "criaturas_de_sangre" }` |

## Qué automatiza hoy el motor

Para la segunda etapa (comparar las clases completas con el motor):

| Mecánica | Estado |
|---|---|
| Dado de golpe, PG por nivel, multiclase | ✅ Implementada |
| Competencias, salvaciones, elección de habilidades, multiclase | ✅ Implementada |
| Mejora de característica / dote por nivel | ✅ Implementada |
| Subclase y su nivel; rasgos por nivel (texto) | ✅ Implementada |
| Espacios de conjuro (completo, medio, artífice, pacto), CD y ataque de conjuro, preparados | ✅ Implementada |
| Aumentos de atributo y máximos (Bárbaro 20, Shadow Knight 20) | ✅ Implementada |
| Competencias, resistencias, inmunidades, bonos a iniciativa/velocidad/PG/salvaciones/atributos | ✅ Implementada (con `efectos`) |
| Tabla de progresión (usos, dados, etc.) | ⚠️ Se muestra, pero no hay contador de usos |
| Ataque extra, Acción adicional, Reacciones | ⚠️ Sólo texto |
| CA (armaduras, Defensa sin armadura) | ⚠️ La CA es manual |
| Recursos con recarga (descanso corto/largo: Furia, Ki, Canalizar divinidad…) | ❌ No implementada |
| Reacciones/acciones con disparador → condición → efecto | ❌ No implementada |
| Daño adicional condicionado (Ataque furtivo, Castigo divino) | ❌ No implementada |

Cuando tengas todas las clases completas, `node tools/check_classes.mjs` dirá cuántos
rasgos de cada clase son «sólo texto»: esa es la lista de trabajo de la segunda etapa.
