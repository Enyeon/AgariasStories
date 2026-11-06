# Auditoría del proyecto original (v1.0.11)

Resumen de lo encontrado antes de la refactorización y qué se hizo con cada cosa.

## Estado funcional

| Funcionalidad | Estado original |
|---|---|
| Crear personaje / subir de nivel | **Roto.** Tras elegir raza, el paso «Elegir clase» quedaba vacío; `#btn-confirmar-clase` no existía en el HTML y `ejecutarFlujoPostClase` no estaba definida (ReferenceError). Las versiones 1.0.9/1.0.10 también lanzaban errores. |
| Iniciar sesión / registrarse | **Roto.** `signIn()` usaba una variable `credenciales` inexistente; «Registrarse» llamaba a `signIn`; el modal de login no tenía JS. Además `index.js` (Firebase) sólo se cargaba en el build de webpack, no al abrir `index.html`. |
| Guardar / cargar | **No funcional.** Firestore guardaba sólo 7 campos (la mayoría de textareas no tenían `id`) y dependía del login roto. `personaje-storage.js` usaba variables globales inexistentes y no se importaba. |
| Compartir | Botón sin código. |
| Exportar / importar | Inexistente (había un ejemplo comentado). |
| Bendiciones épicas | `bendicion_epic.js` no se importaba, tenía rutas de import incorrectas, un módulo inexistente (`modal-stats.js`) y **dos funciones con el mismo nombre** (SyntaxError en un módulo). |
| «Permisos del DM» | Botón sin manejador. |
| Inspiración | `inspirate--effect.js` reasignaba una exportación (`estado = 1`) → TypeError; además no se importaba. |
| Avisos al usuario | `#contenedor-avisos-centrales` sí existía, pero muchos avisos usaban `alert()` / `prompt()`. |

## Seguridad
- **Secreto OAuth de Google (`client_secret_*.json`) commiteado** en `txts/` (commits `a566635` y `1b1c996`, subidos a GitHub). Está en el historial aunque luego se añadiera al `.gitignore`. Ver «Acciones pendientes» en el README.
- Configuración de Firebase hardcodeada dos veces (`index.js` y `firebase-config.js`).
- Reglas de Firestore abiertas por fecha (`allow read, write: if request.time < …`).
- `innerHTML` con datos sin escapar en muchos módulos (riesgo de XSS si los datos vinieran del usuario/servidor).

## Arquitectura
- El estado del personaje vivía en el DOM (`input.dataset.base`, `textContent`) y en ~40 variables globales mutables de `constantes.js` (915 KB mezclando estado, datos y lógica).
- Dependencias circulares entre casi todos los módulos de `info--container/`.
- Dos puntos de entrada incompatibles: `index.html` cargaba `src/JS/main.js` como módulo y webpack empaquetaba `src/index.js`; `dist/index.html` referenciaba rutas inexistentes.
- `bajar nivel` intentaba revertir a mano cada efecto (stats, PG, dotes, subclase...), con varios caminos inconsistentes.
- Percepción pasiva e iniciativa ignoraban las bonificaciones raciales con varios grupos; la percepción pasiva leía un `#proficiency` inexistente.
- Los conjuros sólo consideraban la última clase elegida.

## Archivos muertos, duplicados o sobrantes
`dist/` (bundle de 1,7 MB + sourcemap commiteados), `txts/html.txt` y `txts/css.txt` (copias antiguas), `txts/*.txt` vacíos, `desktop.ini`, `src/JS/firebase.js` (sólo comentarios), `class--armor.js`, `cargar__crear--pj.js`, `modal--user.js`, `style--navegacion.css`, `login--user/logi` (vacíos), `src/HTML/login.html`/`registro.html`/`404.html` (no enlazados), `apphosting.yaml` (plantilla sin usar), `.babelrc` + webpack + 7 loaders, Google Fonts externo (Fira Code, no usado en CSS efectivo), favicon de 270 KB.

## Decisión por bloque

| Bloque | Decisión |
|---|---|
| Datos de razas, clases, conjuros, dotes, bendiciones, criaturas, acciones/condiciones | **Conservar** íntegros (extraídos a JSON). |
| Tablas de espacios de conjuro, bonificador de competencia, cálculo de PG, requisitos de dotes, límites de atributos, Dureza/Duro | **Conservar** la regla, **reimplementar** como funciones puras con tests. |
| Flujo de creación por pasos (raza → bonus → idiomas → dote → clase → subclase → mejora) | **Conservar la idea, reemplazar** la implementación (asistente con pasos calculados). |
| Estado en DOM + globales | **Reemplazar** por un modelo de personaje único y versionado. |
| Firebase (auth + Firestore) | **Reemplazar** por FastAPI + SQLite (preferencia de Python; el login nunca funcionó). |
| webpack + babel | **Reemplazar** por Vite (1 dependencia). |
| Interfaz | **Rediseñar** manteniendo secciones y estética oscura. Easter egg «modo matrix» conservado en «Acerca de». |
| Login/registro | **Eliminar** por ahora (estaba roto); el diseño permite añadir cuentas (ver README). |
| Archivos de la lista anterior | **Eliminar**. |
