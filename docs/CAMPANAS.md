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

## Fases siguientes

- **Fase 2:** Homebrew como biblioteca reutilizable; las campañas eligen
  elementos con versión fijada y avisos de actualización, sin duplicarlos.
- **Fase 3:** Mundo (lugares, PNJ, facciones, misiones, notas, información
  descubierta), sesiones y capítulos con su vista, inventario avanzado
  (equipar, transferir, usar).

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
