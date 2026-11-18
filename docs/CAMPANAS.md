# Campañas con jugadores (AgSt 1.24 · fase 1)

Sección **Campañas** (`/campanas`), separada de **Homebrew** (`/homebrew`, el
contenido reutilizable). Sin cuentas: cada persona tiene una **clave personal**
guardada en su dispositivo; el DM la aprueba o la revoca.

## Flujo

1. El DM crea la campaña (`Campañas → ＋ Crear campaña`) y comparte el enlace de
   invitación (`/unirse#<id>.<código>`).
2. Quien abre el enlace escribe su nombre y elige **Jugador** u **Observador**.
   Recibe una clave personal y queda **pendiente**.
3. Mientras espera, el jugador ya puede **elegir su PJ**: se sube una *copia*.
4. El DM aprueba a la persona y a su PJ (pestaña *Jugadores*). Desde ese momento
   el jugador entra en la campaña y su PJ aparece en *Personajes*.
5. El DM puede expulsar (la clave deja de valer y sus PJ quedan desvinculados,
   sin borrar nada), readmitir, eliminar solicitudes, cambiar el rol y
   desvincular o volver a vincular PJ.

El enlace personal (pestaña *Resumen → 🔑*) sirve para usar el mismo acceso en
otro dispositivo. El enlace de DM, igual.

### Campañas creadas antes de 1.24

La migración deja `open_invite = true` en las campañas existentes: el código de
invitación sigue dando acceso de jugador como antes, así nadie lo pierde. Esos
jugadores ven el aviso «Pedir mi clave personal»; cuando el DM los aprueba,
pasan a su clave. El DM puede cerrar el modo antiguo en *Jugadores → Invitar*.
Las campañas nuevas empiezan cerradas.

## La copia del PJ por campaña

- El personaje original del jugador **no cambia nunca**. La copia vive en el
  servidor (`campaign_characters`) y, en el dispositivo del jugador, como un
  personaje más con id `cp_<campaña>_<pj>` e insignia 🏰 en *Tus personajes*.
- La ficha y la Tienda la abren como cualquier personaje. Cada guardado se sube
  a la campaña con control de revisión; si el DM la cambió a la vez, se combinan
  las dos versiones (misma fusión a tres bandas que entre pestañas).
- Sin conexión, se guarda en el dispositivo y se sube en el siguiente guardado.
- Un PJ de campaña sólo compra en el mercado de **su** campaña, y no si está
  muerto o desvinculado.

## Registro (con privacidad)

Se anota solo, en la misma transacción que el guardado:

| Qué | Cómo se detecta | Visible para |
|---|---|---|
| Compra / venta / servicios de la Tienda, Gremio, Posada, Banco… | Lo anota la Tienda (con el negocio y el importe) | Jugador y DM |
| Dinero y objetos cambiados a mano | Diferencia con la versión anterior | Jugador y DM |
| Nivel y experiencia | Diferencia | Toda la campaña |
| Muerte, regreso a la vida, retiro | Lo anota el servidor al cambiar el estado | Toda la campaña |
| Entradas y salidas de miembros y PJ | Servidor | Toda la campaña |
| Notas, misiones, recompensas, acontecimientos | A mano (DM o jugador) | La que se elija: 🌍 todos · 🔒 jugador y DM · 🎲 sólo DM |

## Herramientas rápidas del DM

Dar objeto · dar/quitar dinero (con las monedas de la bolsa del PJ) · modificar
PG (daño, curación, fijar) · dar PX · autorizar subida de nivel (da la
experiencia justa; el jugador elige clase y mejoras en su ficha) · marcar
muerto / revivir · añadir acontecimiento · ver ficha e inventario. Todo se
aplica a la copia de la campaña y queda en el registro.

## Sesiones

El DM empieza y termina sesiones; lo que se anota mientras tanto queda asociado a
la sesión (`campaign_sessions`, `campaign_events.session_id`). Base para
capítulos (fase 3).

## Fase 2 (AgSt 1.25): Homebrew reutilizable

«Mi Homebrew» pasa a ser **📚 Mi biblioteca**: el contenido reutilizable del DM,
guardado en su dispositivo. No necesita migración de Supabase.

- **Usar en campañas sin duplicar.** Desde la biblioteca (📤 *Usar en
  campaña*) o desde la campaña (📚 *Añadir desde mi biblioteca*). La campaña
  guarda su copia con un vínculo `data.linkedFrom = { id, version }`. Hace
  falta una copia porque los jugadores no pueden leer la biblioteca del
  dispositivo del DM. Volver a usar el mismo elemento actualiza esa copia en
  vez de crear otra.
- **Versión fijada.** Cada campaña sigue con la versión que eligió. Guardar
  en la biblioteca sin cambios no sube la versión.
- **Avisos de versión nueva:**
  - en la biblioteca, junto a cada elemento (`Mesa B v1 → v2`) y arriba con
    «Revisar y actualizar»;
  - en el Homebrew de la campaña;
  - en el resumen de la campaña (DM).

  Antes de actualizar se muestra qué cambia (descripción, rasgos…). Los
  personajes que ya lo usan ven el aviso de versión nueva en su ficha, como
  antes.
- **Editar una copia vinculada.** Se puede editar en la biblioteca
  (recomendado: esta campaña se actualiza al momento y las demás reciben el
  aviso) o sólo en la campaña (la copia se desvincula).
- **Desvincular.** La campaña conserva su copia, pero ya no recibe avisos.
- **📚 A mi biblioteca.** Guarda en la biblioteca un elemento creado en una
  campaña, para reutilizarlo en otras. Si eres el DM, la campaña queda
  vinculada a él. Los jugadores también pueden copiar contenido a su
  biblioteca, salvo las extensiones secretas.
- **Códigos de desbloqueo.** El de una extensión «con código» se copia junto
  con ella entre la biblioteca y la campaña.
- **Exportar e importar.** El archivo de la biblioteca (formato v2) lleva el
  id y la versión de cada elemento:
  - al importarlo en otro dispositivo se reconocen los vínculos con las
    campañas;
  - importarlo otra vez no duplica nada: sólo actualiza lo que tenga una
    versión más nueva;
  - los archivos antiguos se siguen importando.
- **Móvil.** Las reglas de la campaña se ven como tarjetas en vez de tabla.

## Fase 3 (AgSt 1.26): Mundo, sesiones e inventario avanzado

Migración `20261119000000_mundo_sesiones.sql` (aditiva, idempotente).

### 🗺️ Mundo

Pestaña *Mundo* de la campaña: misiones, lugares, PNJ, facciones, pistas y
notas. Se busca sin acentos y se filtra por tipo.

- **Qué se ha descubierto.** Las entradas del DM empiezan *ocultas*. El DM las
  revela a toda la campaña o sólo a algunos jugadores (👁 *Revelar…*). Cada
  descubrimiento queda en el registro (público, o privado para quien lo
  descubre).
- **Notas secretas del DM.** Cada entrada puede llevarlas; el servidor nunca
  se las envía a los jugadores.
- **Misiones.** Tienen estado (activa, en pausa, completada, fallida),
  objetivos que el DM marca desde el detalle, recompensa y quién la encarga.
  Completarla o fallarla se anota en el registro.
- **Relaciones.** Un PNJ o un lugar puede estar en otro lugar; un PNJ puede
  pertenecer a una facción. El detalle enlaza lo relacionado.
- **Notas de los jugadores.** Privadas (sólo su autor; ni el DM las ve) o
  compartidas con la campaña.
- **No es el Mundo de la Tienda.** Las regiones, facciones y eventos
  económicos del Homebrew siguen igual: esto es el mundo narrativo.

### 🎬 Sesiones y capítulos

Pestaña *Sesiones*. El DM crea capítulos y empieza o termina sesiones; una
sesión nueva entra en el último capítulo, o en el que se elija. Cada sesión
tiene:

- un resumen para todos;
- notas del DM, que sólo ve él;
- «lo que pasó»: el registro filtrado por esa sesión, respetando la
  privacidad de cada entrada.

### 🎒 Inventario avanzado (en la ficha, para todos los personajes)

- **Tarjetas en vez de tabla**, con filtros: todo, equipado, sintonizado y
  consumibles.
- **Equipar, sintonizar y consumible.**
  - Sintonizar admite un máximo de 3 objetos a la vez.
  - Los objetos consumibles muestran el botón *Usar*: resta una unidad y, en
    un PJ de campaña, lo anota en el registro sin repetirlo como «Ya no
    tiene…».
- **Carga.** Peso por unidad; lo comprado en la Tienda ya lo trae. Las
  monedas cuentan a razón de 50 por libra. La capacidad es FUE × 15, con
  aviso de carga pesada o de sobrecarga.
- **🤝 Dar** objetos o monedas a otro PJ de la campaña:
  1. se sube lo pendiente;
  2. el servidor cambia las dos fichas a la vez, comprobando la revisión;
  3. queda en el registro de ambos.

  Lo recibido llega sin equipar y se apila con un objeto igual.

### Ficha en móvil

- Las pestañas ocupan una sola fila deslizable; la activa se centra.
- La cabecera es más compacta.
- Las armas se ven con el nombre arriba y el bonificador, el daño y el botón
  de quitar en una fila.

## Lista de comprobación (escritorio y móvil)

Probado en Chrome a 1280×900 y a 375–390 px (móvil, táctil):

- [x] Navegación principal: arriba en escritorio; barra inferior fija en móvil
      (≤ 720 px), sin desbordamiento horizontal.
- [x] Crear campaña → enlace de invitación visible, copiar / compartir.
- [x] Unirse desde el enlace en móvil: nombre + rol, solicitud pendiente.
- [x] Elegir PJ mientras se espera; la copia aparece en *Tus personajes*.
- [x] El DM aprueba persona y PJ; el jugador pulsa «Comprobar ahora» y entra.
- [x] Herramientas del DM (dinero, PG, objeto, muerte) → la ficha del jugador
      lo refleja al abrirla y el registro lo muestra con su privacidad.
- [x] El jugador cambia sus monedas en la ficha → «Guardado en la campaña» y
      entrada privada en el registro.
- [x] Tienda con el PJ de campaña: mercado compartido de la campaña y la compra
      queda en el registro (sin duplicar dinero/objetos).
- [x] Diálogos a pantalla completa en móvil; formularios con campos de 44 px y
      16 px de texto (sin zoom en iOS); tarjetas en vez de tablas.
- [x] Campañas antiguas: el código de invitación sigue funcionando.
- [x] Biblioteca: usar un elemento en dos campañas, editarlo, aviso
      `v1 → v2` en la biblioteca, en el Homebrew de la campaña y en su
      resumen; actualizar una campaña, luego «Actualizar todas».
- [x] Campaña: «A mi biblioteca», «Añadir desde mi biblioteca» (lo que ya
      está al día aparece desactivado) y editar una copia vinculada desde la
      biblioteca.
- [x] Biblioteca y Homebrew de la campaña a 375 px sin desbordamiento horizontal.
- [x] Mundo: el DM crea una misión (pública), un lugar oculto y un PNJ
      revelado sólo a un jugador. El jugador ve sólo lo suyo y nunca las notas
      secretas. La nota privada del jugador no la ve el DM.
- [x] Misión: marcar objetivos y completarla → «Misión completada» en el
      registro.
- [x] Sesiones: capítulo, empezar sesión; el jugador ve la sesión con todo lo
      que pasó (dar objeto del DM, usar poción, dar a otro PJ).
- [x] Inventario en móvil (390 px): consumible, usar, equipar, dar a otro PJ;
      sin desbordamiento horizontal.
