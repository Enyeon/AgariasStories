# Datos de juego: origen, formato y puntos a verificar

Los datos de `frontend/src/data/` se generaron **automáticamente** a partir de los
módulos JavaScript del proyecto original (`constantes.js`, `clases_clase/*.js`,
`razas-catalogo.js`, `blood_creatures.js` y el HTML de acciones/condiciones), con
el script `tools/extract_data.mjs`. **No se inventó ni se reescribió contenido de
reglas.** Sólo se hicieron estas correcciones, todas puramente técnicas:

| Corrección | Motivo |
|---|---|
| 12 nombres del catálogo de razas apuntaban a claves inexistentes (p. ej. `Goblins` → `Goblin`, `Oso (Pandaros)` → `Oso (Pandawa)`) | Esas razas no se podían elegir en el original |
| `Cambiante (Cazasalvaje)` aparecía dos veces en el catálogo | Se asignó a `… - Arcano 1` y `… - Arcano 2`, que sí existen en los datos |
| `Jötunn de Piedra (Bergjötunn)` duplicado en el catálogo | Se dejó una sola entrada |
| Criaturas de Sangre: el campo `vida` contenía HTML | Se convirtió en `hpPercent` (50 % / 75 % de los PG del invocador) |
| Artífice (`clase-artifice.js`) existía pero nunca se registraba | Ahora aparece en «Caldero de Tasha» |

## Formato

- `races.json`: claves originales (`velocidad`, `fly`, `choice`, `choices`, `lenguage`,
  `yaHabla`, `languageElection`, `choiceIdioma`, `puedeElegirDote`, `info`…).
- `classes/<clave>.json`: un archivo por clase (`nombre`, `claseName`, `seccion`,
  `dadoDeGolpe`, `nivelesDeAumento`, `conjurador`, `attribute`, `niveles[n]`).
  **Para añadir una clase basta con copiar un JSON aquí**; se registra sola.
- `feats.json`, `epic-boons.json`, `spells.json`, `languages.json`,
  `race-catalog.json`, `race-tags.json`, `race-badges.json`, `blood-creatures.json`,
  `rules-reference.json`.
- Las tablas de espacios de conjuro están en `frontend/src/domain/spellcasting.js`
  (copiadas literalmente de `hechizos.js`).

## Datos añadidos en la v2.1

| Dato | Detalle |
|---|---|
| `backgrounds.json` | Acólito y Criminal con el texto aportado por el autor; Sabio y Soldado con la mecánica del SRD 5.2 (CC-BY-4.0) y descripción breve propia — **marcados «Verificar»**; Solitario y Huérfano (nombres del proyecto original, sin reglas: marcados «Sin reglas aún») |
| `pericias` en `classes/picaro.json` (`{"1":2,"6":2}`) y `classes/bardo.json` (`{"3":2,"10":2}`) | Regla estándar de 5e; los datos de esas clases no tenían el rasgo escrito |
| `pericias: 1` en las dotes «Experto en habilidades» y «Prodigio» | Lo dice su propio texto |

Están los 16 trasfondos del Manual del Jugador 2024 (más Solitario y Huérfano
de Agarias, pendientes de reglas). Las dotes de origen se enlazan con su nombre
en `feats.json` y `featNote` guarda el nombre o la variante del manual:
Iniciado Mágico (Clérigo / Druida / Hechicero), Habilidoso («Experto» /
«Experimentado»), Duro («Robusto»), Curador («Sanador»), Peleador de taberna
(«Luchador de taberna»). Afortunado, Artesano y Músico se añadieron a
`feats.json`. La dote Artesano da un 20 % de descuento en la Tienda en objetos no
mágicos. El equipo usa los nombres del catálogo de la Tienda cuando hay uno
equivalente (ropa fina, palanca, linterna sorda, grilletes…) para que se
reconozca al vender. Las monedas del equipo son po.

### Cómo añadir trasfondos oficiales o de Agarias
Añade una entrada a `backgrounds.json` con una clave única:

```json
"marinero": {
  "name": "Marinero", "source": "Agarias",
  "description": "…",
  "abilityOptions": ["fuerza", "destreza", "sabiduria"],
  "feat": "Nombre exacto de una dote de feats.json (o null)",
  "skills": ["Atletismo", "Percepción"],
  "tools": ["Herramientas de navegante"],
  "languages": 0,
  "equipment": [{ "label": "A", "text": "Cuerda, garfio y 10 po" }, { "label": "B", "text": "50 po" }],
  "feature": { "name": "Rasgo opcional", "text": "…" }
}
```

`source` agrupa en el selector. Opcionales: `verify: true` (muestra «Verificar»)
y `pending: true` (muestra «Sin reglas aún»), `featNote` (variante de la dote). El test `background.test.js`
comprueba que las habilidades y dotes de cada trasfondo existan.

## Shadow Knight (v2.2)

`classes/shadow.json` se regeneró a partir del texto del autor
(`docs/fuentes/shadow-knight.md`) con `tools/homebrewery_class.py`. La versión
anterior está en `docs/historial/shadow-anterior.json`.

- Las 5 **Manifestaciones de la Sombra** son la elección de nivel 3 (como una
  subclase). El campo nuevo `subclaseNombre` hace que la app diga «Manifestación
  de la Sombra» en vez de «Subclase».
- El campo nuevo `cdClase` calcula la **CD de Manifestación** (8 + competencia +
  el mejor modificador entre Carisma y Sabiduría).
- «Intercambio a Larga Distancia» pasa al nivel 7 y «Cualidad adicional» al 12
  (así lo indica el texto). Cada «###» del texto es una tarjeta propia.
- Tabla de progresión: «Invocar/Salvar Sombras» se renombraron a «Sombras
  activas/reservadas» (el texto nuevo las llama así; **valores sin cambios**) y se
  añadió la columna «Radio de presencia».
- **Se conservó** lo que el texto no menciona: dado de golpe d6, atributos
  iniciales, niveles de mejora y el aumento de nivel 20 (CAR +2, +2 a DES o INT,
  máximo 25). **Verificar** si ese aumento sigue vigente con «Dominio del Soberano».
- **Rasgos de la versión anterior que ya no aparecen**: Sombra Viva, Esencia de
  Linaje I y II, El arte de las armas, Esencia de las Sombras y Ataque Crítico.

### Convertir otra clase escrita en Homebrewery
1. Guarda el texto en `docs/fuentes/<clase>.md`.
2. Añade una entrada en `CLASS_CONFIG` de `tools/homebrewery_class.py` (qué
   sección es la subclase, rasgos que cambian de nivel, columnas extra…).
3. Ejecuta `python tools/homebrewery_class.py <clase> docs/fuentes/<clase>.md`.
   Sólo reescribe los rasgos; el resto del JSON se conserva.

## ⚠️ Información que necesita verificación

No se modificó nada de lo siguiente; se deja señalado para que lo revise quien
conozca el diseño de Agarias (puede ser homebrew intencionado).

### Clases
- **Atributo de conjuro distinto del PHB**: Clérigo, Druida y Explorador usan
  *Inteligencia* (PHB: Sabiduría); Paladín y Brujo usan *Sabiduría* (PHB: Carisma).
- **Datos incompletos**: Pícaro y Tiznado sólo tienen los niveles 1-4 definidos.
  La mayoría de clases del Manual (Brujo, Clérigo, Druida, Explorador, Guerrero,
  Hechicero, Mago, Monje, Paladín, Artífice) tienen 17-19 niveles sin rasgos
  descritos. La app lo indica como «Pendiente de datos».
- **Artífice**: dado de golpe d6 (PHB/Tasha: d8) y sólo 1 nivel con rasgos.
- **Bárbaro**: el aumento de FUE/CON +4 (máx. 25) está en el nivel **19**; en el
  PHB «Campeón primitivo» es el nivel 20.
- **Tiznado**: `conjurador: "alternativo"` sin atributo de conjuro, así que no se
  calculan CD ni ataque de conjuros.
- **Anomalía**: es lanzador, pero ningún conjuro la incluye en `conjuradorTrue`,
  por lo que el filtro «Sólo de mis clases» no muestra nada para ella.
- Varias tablas `infoCubo` / `tablaClase` / `informacionNivel` (Vinculador,
  Tiznado…) están vacías (plantillas «✦ ✦»).
- **Brujo**: la tabla de espacios mezcla espacios de pacto y Arcanum Místico
  (p. ej. nivel 11 = 3 de nivel 5 + 1 de nivel 6). En el PHB el Arcanum no son espacios.

### Razas
- `Orco (Eberron)` tiene la clave `Fuerza` en mayúscula (no se suma como bonificación).
- `Tiflin (Alado)` aparece en el catálogo pero no tiene datos: se omitió del selector.
- `Medio Elfo` permite elegir Carisma con su +1 doble (en el PHB se excluye Carisma).
- Rasgo «Dureza» (+1 PG/nivel): sólo 5 razas lo tienen marcado (`race-badges.json`).

### Conjuros (`spells.json`) — erratas que la app normaliza al filtrar
- Escuela: `Trasmutación` (Garrote, Reparar, Hablar con las plantas),
  `Necromancia` (Falsa vida, Infligir heridas), `abjuración` (Armadura de mago),
  `Ilución` (Boca mágica), `Rvocación` (Tormenta de fuego),
  `1 acción` (Nube aniquiladora — campo probablemente desplazado), vacía (Patrón hipnótico).
- Tipo: `Curacuón` (Restablecimiento menor, Curar heridas en masa), `Acido`
  (Flecha ácida de Melf), `Solcial` (Dominar bestia), vacío (Detectar trampas, Hacer añicos).
- Clase: `artífice` (Respirar bajo el agua), `paladín` (Geas).
- El filtro ofrece «Nivel 10 (homebrew)», pero no hay ningún conjuro de nivel 10.

### Dotes y bendiciones
- «Duro» suma +2 PG por nivel (como el original y el PHB). «Bendición épica del
  lanzamiento de hechizos» usa `limitAmountOpcional`; se trata igual que
  `aumentarStatOpcional` (+1 al atributo elegido).
- Los requisitos de raza se comprueban con `race-tags.json` o por nombre parcial
  (p. ej. «Elfo»).

## Datos corregidos en la v3 (noviembre de 2026)

Scripts reproducibles en `tools/` (se pueden volver a ejecutar sin efectos extra):

| Problema | Corrección | Script |
|---|---|---|
| 15 de 18 clases tenían el bloque inicial del Bárbaro (salvaciones FUE/CON, competencias, equipo, «1d12» de PG) | Competencias estructuradas (`competencias`, `competenciasMulticlase`, `equipoInicial`, `oroInicial`) para las 12 clases del Manual, el Artífice (Tasha), el Cazador y el Shadow Knight; el texto de «Atributos de clase» se regenera a partir de esos datos y del `dadoDeGolpe` real | `class_proficiencies.py` |
| 12 clases ofrecían las subclases de la Anomalía («Hebra Paradoja / Error / Virus / .exe») o subclases vacías, siempre a nivel 3 | Subclases oficiales en su nivel correcto (Clérigo, Brujo y Hechicero a nivel 1; Druida y Mago a nivel 2; resto a nivel 3), con descripción breve y `rasgosPendientes: true`. Se conservan las que tenían contenido (Borracho Errante del Monje) | `class_subclasses.py` |
| Condiciones con texto erróneo; tipos de daño mezclados con estados; «Fuerza (Strength)»; faltaban 5 tipos de daño | Referencia nueva con 15 condiciones oficiales, 13 tipos de daño oficiales + Profano y Sagrado (Agarias) y estados de Agarias separados. Copia de la anterior en `docs/historial/rules-reference-v2.json` | `rules_reference.py` |
| La dote «Duro» y la Invocación de sangre estaban escritas en el código | Ahora son efectos en los datos (`efectos` en `feats.json` y en la subclase del Cazador) | — |
| Errata «Inteligrncia» (Cazador) | Corregida al regenerar el texto | `class_proficiencies.py` |

Los textos anteriores de «Atributos de clase» están en
`frontend/src/data/legacy/atributos-iniciales-v2.json`: la migración 2→3 los usa
para sustituir, en personajes guardados, sólo los que el usuario no había editado.

### Pendiente de su autor (marcado en la app como «Pendiente»)

- **Anomalía, Tiznado y Vinculador**: salvaciones, competencias, equipo y
  competencias de multiclase. Sus datos eran una copia del Bárbaro y se retiraron.
- **Subclases de Tiznado y Vinculador**: tenían las «Hebras» de la Anomalía; se
  retiraron y la clase muestra «subclases pendientes». (Las de la Anomalía se conservan.)
- **Multiclase del Cazador y del Shadow Knight**: no está en sus textos originales.
- **Estados de Agarias** (Corrupto, Desgarro, Dolor, Vacío): cómo se aplican y cómo
  terminan. Desgarro y Vacío tienen parte de la mecánica en su texto original;
  falta lo demás (ver la referencia de reglas en la app).
- **Contusionado y Provocado**: se movieron a «condiciones de Agarias». Provocado
  necesita cómo se aplica y cómo termina.
- **Rasgos de nivel de las subclases oficiales**: sólo nombre y resumen.
- **Rasgos por nivel de varias clases oficiales**: los encabezados internos
  (`informacionNivel`) de varias clases siguen siendo los del Bárbaro. La app no
  los muestra, pero conviene limpiarlos al cargar los rasgos reales.

### A revisar

- **Artífice**: en Tasha's el dado de golpe es **d8**; los datos tienen **d6**. No
  se cambió porque modificaría los PG de personajes existentes: confírmalo y,
  si procede, cambia `dadoDeGolpe` en `artifice.json`.
- **Profano y Sagrado**: tipos de daño propios de Agarias (decisión del DM). Una
  resistencia a Necrótico/Radiante NO cubre Profano/Sagrado salvo que se diga.
