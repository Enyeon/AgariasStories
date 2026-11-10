# Stories of Agarias · Personajes D&D 5e

Aplicación web para **crear, editar, guardar, exportar, importar y compartir**
personajes de Dungeons & Dragons 5e, con el contenido oficial y el material propio
del mundo de Agarias (197 razas, 18 clases, 339 conjuros, 74 dotes, bendiciones
épicas y Criaturas de Sangre).

- Funciona **sin conexión**: los personajes se guardan solos en el navegador.
- **Exporta/importa** cada personaje como un archivo `.json` versionado.
- **Comparte** con un enlace de sólo lectura (`/personaje/<id>`); sólo el navegador
  que lo creó puede actualizarlo.
- **Homebrew y campañas**: crea clases, razas, hechizos, dotes, trasfondos, objetos,
  criaturas y rasgos propios. En una campaña, el DM decide qué contenido se
  permite y publica su Homebrew; los jugadores lo usan en sus fichas. Todo pasa
  por el mismo motor de reglas que el contenido oficial.
- **Extensiones de clase**: subclases Homebrew y habilidades especiales
  (bendiciones, evoluciones, subclases secretas) sobre una clase existente, sin
  duplicarla; se asignan a cada personaje (abiertas o con un código del DM).
- **Criaturas vinculadas** (mascota, compañero, familiar, montura, invocación…),
  **subir y bajar varios niveles** de una vez, **competencias de clase** con su
  origen y **rasgos con origen** (DM, evento, objeto…).

---

## Arquitectura

```text
Navegador ──────────────────────────────┐
  Frontend (HTML/CSS/JS + Vite)         │
   ├─ domain/   reglas puras + formato   │   IndexedDB (personajes locales,
   ├─ services/ almacenamiento, API ─────┼─► guardado automático, offline)
   └─ views/    interfaz                 │
                    │ RPC                │
                    ▼                    │
  Supabase (PostgreSQL) — opción recomendada para publicar:
   ├─ personajes compartidos             │
   └─ campañas, reglas y Homebrew del DM │
  ó Backend FastAPI (Python) ──► SQLite (sólo compartir; para servidor propio)
```

**Contenido.** Todo el contenido (oficial o Homebrew) se lee a través de
`data/index.js`. El Homebrew vive en un registro (`content/registry.js`) que se
consulta después de los datos oficiales; cada elemento se valida
(`content/schema.js`) y se traduce una vez a la forma que lee el motor
(`content/engine.js`). No hay código especial por tipo: una clase Homebrew usa
las mismas reglas, pantallas y validaciones que una oficial.

| Tecnología | Por qué |
|---|---|
| **JavaScript moderno sin framework** (módulos ES) | La app es una ficha con muchos formularios; un modelo de datos único + renderizado por plantillas escapadas basta y mantiene el proyecto accesible para quien lo empezó en JS puro. |
| **Vite** | Servidor de desarrollo y build de producción con una sola dependencia (sustituye a webpack + babel + 5 loaders). |
| **IndexedDB** | Guardado local fiable y sin límite de 5 MB (retratos), con respaldo automático en `localStorage`. |
| **FastAPI + SQLite** (Python) | API pequeña y validada para compartir. SQLite no necesita servidor; el SQL está aislado en `repository.py` para migrar a PostgreSQL si hiciera falta. |
| **Vitest / pytest / Playwright** | Tests de reglas, persistencia y API; pruebas de extremo a extremo en navegador real. |

Dependencias de ejecución: `fastapi`, `uvicorn`. Dependencias de desarrollo del
frontend: `vite`, `vitest`, `jsdom`, `fake-indexeddb`. Nada más.

## Estructura

```text
├── backend/
│   ├── app/
│   │   ├── main.py         # create_app(): middlewares, errores, sirve el frontend
│   │   ├── api.py          # endpoints /api/characters
│   │   ├── repository.py   # único módulo con SQL
│   │   ├── db.py           # conexión y migraciones del esquema SQLite
│   │   ├── validation.py   # validación del documento en servidor
│   │   ├── security.py     # IDs, tokens, límite de tamaño, rate limit, cabeceras
│   │   └── config.py       # variables de entorno
│   ├── tests/              # pytest (24 tests)
│   ├── requirements.txt / requirements-dev.txt
│   └── .env.example
├── frontend/
│   ├── index.html
│   ├── public/             # favicon, logo, imágenes de clase
│   ├── src/
│   │   ├── data/           # datos de juego en JSON (+ index.js para acceder)
│   │   │   └── classes/    # un JSON por clase → añadir clase = añadir archivo
│   │   ├── content/        # Homebrew: esquemas, validación, registro, adaptadores,
│   │   │                   #   instantáneas y reglas/permisos de campaña
│   │   ├── domain/         # SIN DOM: esquema, validación, migraciones, reglas, progresión,
│   │   │                   #   competencias, efectos, criaturas
│   │   ├── services/       # local-store (IndexedDB), api, characters, file-transfer, image
│   │   ├── ui/             # dom (escape/plantillas), router, toasts y diálogos
│   │   ├── views/          # páginas + sheet/ (pestañas de la ficha)
│   │   └── styles/         # tokens, base, componentes, ficha
│   ├── tests/              # vitest (118 tests)
│   └── .env.example
├── docs/
│   ├── plantillas/         # clase-plantilla.json (clase completa de ejemplo) y CLASES.md
│   ├── AUDITORIA.md        # estado del proyecto original y decisiones
│   └── DATOS.md            # origen de los datos y lo que necesita verificación
├── supabase/
│   ├── migrations/         # tablas + funciones RPC (compartir, campañas, Homebrew)
│   └── tests/              # pytest contra PostgreSQL local (6 tests)
├── netlify.toml            # despliegue del frontend en Netlify
├── docs/fuentes/           # textos originales de clases homebrew (Homebrewery)
└── tools/
    ├── extract_data.mjs        # migración única de los datos antiguos a JSON
    ├── homebrewery_class.py    # convierte una clase de Homebrewery a su JSON
    ├── class_proficiencies.py  # competencias/equipo de las clases (corrige las copias del Bárbaro)
    ├── class_subclasses.py     # subclases oficiales (retira las «Hebras» copiadas)
    ├── rules_reference.py      # referencia: condiciones, tipos de daño, estados de Agarias
    └── check_classes.mjs       # valida JSON de clases (node tools/check_classes.mjs [archivos])
```

## Puesta en marcha

Requisitos: **Node.js ≥ 20** y **Python ≥ 3.10**.

> **Importante:** el backend y el frontend son dos carpetas hermanas. Cada comando
> se ejecuta **dentro de su carpeta** (`backend/` o `frontend/`), no en la raíz.

### 1. Instalar (sólo la primera vez)

**Windows (PowerShell)** — ejecuta las líneas de una en una (PowerShell 5 no admite `&&`):

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1     # si da error de scripts: Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
pip install -r requirements-dev.txt
cd ..\frontend
npm install
```

**Linux / macOS:**

```bash
cd backend && python -m venv .venv && source .venv/bin/activate && pip install -r requirements-dev.txt
cd ../frontend && npm install
```

`backend/.env` es opcional (copia `.env.example` si quieres cambiar algo).

### 2. Desarrollo: dos terminales abiertas a la vez

| Terminal | Carpeta | Comando |
|---|---|---|
| 1 · API | `backend/` (con el `.venv` activado) | `uvicorn app.main:create_app --factory --reload` |
| 2 · Web | `frontend/` | `npm run dev` |

Abre la aplicación en **http://localhost:5173**. El puerto 8000 es sólo la API:
si lo abres sin haber hecho `npm run build`, verás una página que lo explica.

Sin backend la aplicación funciona igual (crear, guardar, exportar, importar);
sólo «Compartir» y abrir enlaces compartidos necesitan la API.

### 3. Producción (un solo proceso)

```bash
cd frontend && npm run build                     # genera frontend/dist
cd ../backend
APP_ENV=production uvicorn app.main:create_app --factory --host 0.0.0.0 --port 8000
```

El backend sirve `frontend/dist` y la API en el mismo origen (sin CORS). Ponlo
detrás de un proxy HTTPS (Caddy, Nginx…) y, si ese proxy fija `X-Forwarded-For`,
activa `TRUST_PROXY_HEADERS=true`. Haz copia de seguridad del archivo SQLite
(`DATABASE_PATH`).

## Publicar en Internet

### Frontend en Netlify (gratis)
Netlify sólo sirve archivos estáticos: la aplicación funciona entera (crear,
guardar, exportar, importar) excepto **Compartir**, que necesita el backend.

**Opción A — desde GitHub (recomendada, se actualiza sola con cada `git push`):**
1. Sube el proyecto a GitHub (sin `node_modules`, `.venv` ni `dist`: ya están en `.gitignore`).
2. En Netlify: *Site configuration → Build & deploy → Link repository* (o *Add new site → Import an existing project*) y elige el repositorio.
3. Netlify lee `netlify.toml`: carpeta base `frontend`, comando `npm run build`, publicación `dist`. No hay que tocar nada más.

**Opción B — arrastrando la carpeta:**
1. `cd frontend` y `npm run build`.
2. En Netlify: *Deploys* → arrastra la carpeta **`frontend/dist`** (no la del proyecto entero).

En ambos casos `frontend/public/_redirects` hace que los enlaces `/personaje/...`
y `/editar/...` funcionen al recargar, y `_headers` añade las cabeceras de seguridad.

### Servidor con Supabase (Compartir + Campañas) — recomendado
Sin servidor propio y con plan gratuito. Ver [`docs/SUPABASE.md`](docs/SUPABASE.md):
1. Crea un proyecto en Supabase y ejecuta `supabase/migrations/*.sql` (SQL Editor).
2. En Netlify → *Site configuration → Environment variables*:
   `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` (la clave «anon/publishable»: es
   pública por diseño; las tablas no son accesibles con ella, sólo las funciones).
3. Vuelve a publicar. Compartir y Campañas pasan a usar Supabase.

### Backend propio (alternativa, sólo Compartir)
El backend necesita un servidor Python **con disco persistente**: en los planes
gratuitos que borran el disco (p. ej. Render Free) la base SQLite se perdería.
Sirven Render (plan de pago + disco), Railway o Fly.io con un volumen.

1. Despliega la carpeta `backend/` con su `Dockerfile` y monta un disco/volumen en **`/data`**.
2. Variables: `APP_ENV=production`, `TRUST_PROXY_HEADERS=true` (el resto tiene valores por defecto).
3. Comprueba `https://TU-BACKEND/api/health` → `{"status":"ok"}`.
4. En `frontend/public/_redirects`, borra la línea de `api-no-disponible` y descomenta
   la de `/api/*` poniendo la URL de tu backend. Vuelve a publicar el frontend.

Netlify reenvía `/api` al backend, así que el navegador ve un único origen y no
hace falta configurar CORS.

## Configuración

`backend/.env` (ver `backend/.env.example`):

| Variable | Predeterminado | Uso |
|---|---|---|
| `APP_ENV` | `development` | `production` activa HSTS y oculta `/api/docs` |
| `DATABASE_PATH` | `data/agarias.db` | Archivo SQLite |
| `FRONTEND_DIST` | `../frontend/dist` | Build que sirve el backend (si existe) |
| `CORS_ORIGINS` | vacío | Orígenes permitidos si frontend y API van en dominios distintos |
| `MAX_BODY_BYTES` | `1500000` | Tamaño máximo de una petición |
| `RATE_LIMIT_WRITES` / `RATE_LIMIT_WINDOW_SECONDS` | `60` / `300` | Escrituras por IP y ventana |
| `TRUST_PROXY_HEADERS` | `false` | Usar `X-Forwarded-For` para el rate limit |
| `ENABLE_API_DOCS` | según `APP_ENV` | Documentación OpenAPI en `/api/docs` |

`frontend/.env` (opcional): `VITE_DEV_API_PROXY` (destino del proxy de desarrollo),
`VITE_API_BASE_URL` (API en otro dominio), `VITE_SUPABASE_URL` y
`VITE_SUPABASE_ANON_KEY` (si están, Compartir y Campañas usan Supabase).

**No hay secretos que configurar**: los tokens de edición son aleatorios
(256 bits) y se guardan como hash SHA-256. Nunca subas archivos `.env`.

## Cómo funciona

### Formato del personaje

Todo personaje se guarda, exporta y comparte como el mismo documento:

```json
{
  "format": "agarias-dnd-character",
  "schemaVersion": 3,
  "character": {
    "identity":      { "name": "…", "alignment": "…", "portrait": "data:image/webp;base64,…", "…": "…" },
    "race":          { "key": "Medio Elfo", "abilityChoices": [["fuerza","constitucion"]], "languages": ["Enano"], "feat": null },
    "background":    { "source": "official", "key": "criminal", "custom": null, "abilityMode": "2-1",
                       "abilityChoices": ["destreza","constitucion"], "featAbility": null,
                       "equipmentChoice": "A", "equipmentApplied": "A" },
    "abilities":     { "fuerza": 15, "destreza": 12, "…": 10 },
    "levels":        [{ "classKey": "barbaro", "hpRoll": 12, "improvement": null, "featureChoices": {} }],
    "subclasses":    { "barbaro": "senda1" },
    "classChoices":  { "barbaro": { "skills": ["Atletismo", "Percepción"], "saves": [] } },
    "traits":        [{ "id": "…", "name": "Marca del Pacto", "origin": "evento", "originDetail": "Sesión 14",
                        "description": "…", "effects": [{ "type": "bono", "target": "iniciativa", "value": 2 }],
                        "ref": null, "active": true }],
    "companions":    [{ "id": "…", "bond": "familiar", "name": "Sombra", "creatureRef": "hb:abc:criatura:lobo",
                        "custom": null, "currentHp": 7, "tempHp": 0, "conditions": ["Asustado"], "present": true,
                        "origin": "dm", "originDetail": "", "notes": "" }],
    "campaign":      { "id": "abc", "name": "Las Torres Grises" },
    "content":       { "hb:abc:criatura:lobo": { "type": "criatura", "version": 2, "name": "Lobo", "data": { "…": "…" } } },
    "epicBoons": [], "experience": 0,
    "proficiencies": { "skills": ["Atletismo"], "saves": ["fuerza"], "expertise": ["Sigilo"] },
    "combat":        { "armorClass": 16, "inspiration": false, "currentHp": null, "tempHp": 0, "speedOverrides": {} },
    "equipment":     { "weapons": [], "attacksNotes": "", "coins": {"cp":0,"sp":0,"gp":35,"pp":0}, "items": [], "treasure": "" },
    "spells":        { "known": [], "prepared": [] },
    "notes":         { "languages": "", "proficiencies": "", "raceTraits": "", "classNotes": {}, "backstory": "" },
    "settings":      { "allowEpicBoons": false }
  }
}
```

- Sólo se guarda lo que introduce el usuario; modificadores, PG máximos, CD de
  conjuros, etc. se **calculan** (`domain/rules.js`) y nunca se desincronizan.
- Los niveles son un **historial**: bajar de nivel = quitar el último, con su
  tirada de PG, su mejora y (si procede) la subclase.
- **Validación** (`domain/validation.js`): todo documento que entra (archivo,
  servidor, IndexedDB) se normaliza: valores predeterminados para campos
  ausentes, tipos corregidos, rangos limitados, textos recortados, retratos
  comprobados. Los problemas se muestran al usuario como avisos comprensibles.
- **Migraciones** (`domain/migrations.js`): si cambia el formato, se sube
  `SCHEMA_VERSION` y se añade una función de migración; los archivos antiguos se
  siguen abriendo. Migraciones actuales: 0→1 (formatos de la versión anterior:
  Firestore y `localStorage`), 1→2 (el trasfondo de texto libre pasa a ser un
  trasfondo oficial u homebrew; aparece la pericia) y 2→3 (elecciones de clase,
  rasgos, criaturas, campaña e instantáneas; se sustituyen los «Atributos de
  clase» copiados del Bárbaro si no se habían editado).

### Homebrew, campañas y permisos
- **Referencias estables**: el Homebrew se identifica con `hb:<paquete>:<tipo>:<id>`;
  el id no depende del nombre (se puede renombrar). El contenido oficial conserva
  sus claves de siempre.
- **Instantáneas**: el personaje guarda referencias, y al guardar/exportar/compartir
  adjunta una copia del Homebrew que usa (`content`). Si el DM lo retira, si se
  abre fuera de la campaña o sin conexión, la ficha usa la copia; nunca sustituye
  al original. La pestaña «Campaña» avisa si algo se actualizó, ocultó o retiró.
- **Estados**: borrador → propuesto → publicado → oculto → retirado. Borrar algo
  publicado sólo lo retira: ningún personaje se rompe por una acción del DM.
- **Reglas de campaña** (un único sistema de permisos): por tipo de contenido, si
  se permite el oficial y quién crea Homebrew (nadie / sólo el DM / propuestas de
  jugadores); bendiciones épicas; quién añade rasgos con efectos. La interfaz las
  aplica y el servidor las vuelve a comprobar (crear contenido, cambiar estados y
  publicar un personaje con contenido no autorizado).
- **Identidad sin cuentas**: el DM recibe una clave secreta; los jugadores, un
  enlace de invitación (el código va tras `#`, no llega a ningún registro de
  servidor). Ambos se guardan en el servidor sólo como hash.
- **Efectos**: lo automatizable se declara como datos de un catálogo cerrado
  (`domain/effects.js`: competencias, pericia, bonificaciones, resistencias,
  inmunidades, habilitar recursos). Nada de código arbitrario en el Homebrew.
- **Extensiones de clase** (`domain/extensions.js`): una subclase nueva o rasgos
  especiales para una clase existente, con nivel requerido, condición narrativa,
  origen y, opcionalmente, qué rasgo oficial sustituyen. Nunca se aplican a todos
  los personajes de esa clase: cada personaje las tiene asignadas en `unlocks`.
  Las «abiertas» las añade el jugador (si la campaña lo permite); las «con código»
  necesitan el código que genera el DM (`ABCD-EFGH-JKLM`); el servidor sólo guarda
  su SHA-256 y lo comprueba al publicar el personaje.
- **Sin servidor** («Mi Homebrew»): todo funciona en el dispositivo y se puede
  exportar como paquete `.json`; no hay permisos reales sin servidor.

### Trasfondos
- **Oficiales y de Agarias** en `frontend/src/data/backgrounds.json`. Todos usan el
  mismo formato: `abilityOptions`, `feat`, `skills`, `tools`, `languages`,
  `equipment` (opciones A/B escritas como en el manual) y `feature` opcional
  (rasgo estilo 2014). Añadir uno = añadir una entrada al JSON.
- **Homebrew**: el editor de la app permite crear uno desde cero o «Personalizar»
  uno oficial. Se guarda **dentro del personaje**, así que viaja al exportar,
  importar y compartir; los homebrew de tus otros personajes aparecen en el
  selector para reutilizarlos. Todo es opcional salvo el nombre.
- Concede automáticamente: competencias en habilidades (bloqueadas mientras dure
  el trasfondo), la dote (cuenta para PG, conjuros, idiomas...), idiomas extra y,
  si se elige, el aumento de puntuaciones (+2/+1 o +1/+1/+1 entre sus atributos).
  Ese aumento es **opcional** porque en las reglas 2024 sustituye al racial.
- El equipo elegido se añade al inventario (objetos y monedas) con un botón, una sola vez.

### Clases: formato JSON
Ver [`docs/plantillas/CLASES.md`](docs/plantillas/CLASES.md) y la plantilla
[`clase-plantilla.json`](docs/plantillas/clase-plantilla.json) (clase completa y
probada). Comprueba una clase con `node tools/check_classes.mjs <archivo>`.

### Diálogos y formularios largos
Los diálogos grandes no se cierran con un clic fuera y, si hay cambios, preguntan
antes de cerrarse («Continuar editando / Salir sin guardar»). El editor de
Homebrew guarda un borrador mientras escribes: si la página se cierra o recarga,
al volver a abrir el mismo formulario ofrece recuperarlo.

### Pericia (competencia experta)
Cada habilidad con competencia tiene un botón ★ que duplica el bonificador de
competencia (también en la puntuación pasiva). La ficha muestra cuántas pericias
otorgan tus rasgos (`pericias` en los JSON de clase y dote: Pícaro 1/6, Bardo
3/10, dotes «Experto en habilidades» y «Prodigio»), pero no bloquea marcar más:
el DM manda.

### Almacenamiento local
Guardado automático 0,7 s después de cada cambio (y con `Ctrl+S`), con estado
visible: «Cambios sin guardar… / Guardando personaje… / Guardado / No se pudo
guardar (Reintentar)». También se guarda al ocultar la pestaña y se avisa al
cerrarla con cambios pendientes. Se solicita almacenamiento persistente al navegador.

### Exportar / importar
«Exportar» descarga `nombre-del-personaje.json` (el documento + `exportedAt` y
`appVersion`). «Importar» (botón o arrastrar el archivo a la biblioteca) valida,
migra y crea un personaje nuevo. Se rechazan con mensaje claro: JSON dañado,
archivos que no son personajes, versiones más nuevas y archivos > 2 MB.

### Compartir

| Método | Ruta | Acceso |
|---|---|---|
| `POST` | `/api/characters` | Crea la copia; devuelve `id` y `editToken` (sólo una vez) |
| `GET` | `/api/characters/{id}` | Público (quien tenga el enlace) |
| `PUT` | `/api/characters/{id}` | `Authorization: Bearer <editToken>`; `revision` para detectar conflictos (409) |
| `DELETE` | `/api/characters/{id}` | `Authorization: Bearer <editToken>` |

- IDs de 96 bits aleatorios (no enumerables). El token de edición se queda en el
  IndexedDB de quien compartió; el servidor sólo guarda su hash.
- La ficha muestra si la copia en línea está al día («Publicar cambios»).
- Quien abre el enlace ve la ficha en sólo lectura y puede **guardar una copia** o exportarla.
- «Dejar de compartir» borra la copia del servidor.

### Seguridad
Validación en cliente y servidor (estructura, profundidad, longitudes, rangos,
formato de imagen), límite de tamaño también para cuerpos sin `Content-Length`,
rate limit de escrituras, comparación de tokens en tiempo constante, cabeceras
CSP/`nosniff`/`frame-ancestors`/HSTS, sin detalles técnicos en las respuestas,
SPA servida sin path traversal. En la interfaz todo el HTML se genera con
plantillas que escapan los valores, y el texto enriquecido de los datos pasa por
una lista blanca de etiquetas.

## Pruebas

```bash
cd frontend && npm test                          # 118 tests: reglas, competencias, efectos, Homebrew,
                                                 # extensiones, plantilla de clase, subir/bajar varios niveles…
cd backend && python -m pytest                   # 24 tests: API, auth, conflictos, límites, SPA
AGARIAS_TEST_PG="-h /tmp -p 5432 -U postgres" python -m pytest supabase/tests
                                                 # 6 tests: permisos de campaña, códigos y RLS en PostgreSQL
```

Además se verificó en Chrome (Playwright) el recorrido completo: crear → editar →
guardar → cerrar el navegador → reabrir → modificar → guardar → exportar →
importar (datos idénticos) → compartir → abrir el enlace en otro navegador
(documento idéntico en el servidor) → publicar cambios → guardar copia; además de
archivos dañados/ajenos/de versión futura y la interfaz a 390, 820 y 1366 px.

## Acciones pendientes (fuera del código)

1. **Rotar el secreto OAuth filtrado** (`client_secret_363442238713-…json`) en
   Google Cloud y eliminarlo del historial de GitHub (`git filter-repo` o BFG).
   Sigue en los commits `a566635` y `1b1c996` aunque ya no esté en el proyecto.
2. Si había personajes en Firestore (`usuarios/{uid}/personajes`), exportarlos
   desde la consola de Firebase como JSON: la app los importa con la migración 0→1.
   Después, cerrar el proyecto de Firebase o dejar sus reglas en `allow read, write: if false`.
3. Revisar los datos marcados en [`docs/DATOS.md`](docs/DATOS.md), en especial:
   competencias y subclases de **Anomalía, Tiznado y Vinculador**, y cómo se
   aplican y terminan los **estados de Agarias** (aparecen como «Pendiente»).

## Próximos pasos posibles
- **Cuentas de usuario**: añadir una tabla `users` y una columna `owner_id` en
  `characters`; el token de edición seguiría valiendo para enlaces anónimos.
- **Sincronización** entre dispositivos para usuarios registrados (la revisión y
  el 409 ya existentes sirven de base).
- **Otras ediciones/reglas**: `data/` y `domain/rules.js` están separados; una
  edición nueva puede tener su propio paquete de datos y reglas, y `schemaVersion`
  permite añadir el campo de sistema de reglas con una migración.
- Completar los niveles de clase pendientes y exportar la ficha a PDF.

## Mejoras futuras (anotadas, no implementadas)
- **Recursos con recarga** (Furia, Ki, usos por descanso): contador en la ficha y
  descanso corto/largo; la tabla `infoCubo` ya tiene los números por nivel.
- **Acciones y reacciones** como datos (disparador → condición → efecto), para
  automatizar rasgos como «Reducción de daño como reacción».
- **CA calculada** a partir de la armadura equipada y efectos.
- **Códigos de desbloqueo por personaje** (hoy un código sirve para cualquier
  personaje de la campaña que lo reciba).
