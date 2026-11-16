# Tienda

Ruta `/tienda` (y `/tienda/<personaje>`), entre «Personajes» y «Homebrew» en la barra.

## Dónde vive cada dato (sin duplicados)

| Dato | Dónde | Quién lo usa |
|---|---|---|
| Monedas | `character.equipment.coins` (ficha) | Tienda, Taller y pestaña Equipo, con `domain/money.js` (único módulo de dinero) |
| Objetos comprados | `character.equipment.items` (`ref` opcional al catálogo) | Pestaña Equipo; la Tienda los reconoce para venderlos |
| Materiales del Ingeniero | `character.workshop.materials` | Pestaña Taller (fabricar); se compran en la Tienda |
| Catálogo | `data/shop/items.json` + materiales de `data/taller.json` + objetos Homebrew con coste | `domain/shop/sources.js` (lee las fuentes, no las copia) |
| Mercado (existencias, eventos, día y franja, posiciones, relaciones, memoria, reputación con facciones, diario de rumores, registro) | Campaña: Supabase `agarias.shop_markets` (JSON del mundo, v2). Sin campaña: este dispositivo | `services/shop-market.js` |
| Origen y facciones del personaje | `character.affiliations` (opcional; se omite si está vacío) | Historia (lo elige el jugador); los comerciantes lo tienen en cuenta si se lo cuentas |
| Comerciantes, mapa, facciones, arquetipos, razas, rumores | `data/shop/*.json` + Homebrew «Comerciante» (`mercader`) | `services/shop.js → buildShopContext` |

## Flujo de una compra

Personaje → Tienda → objeto → se paga con `equipment.coins` → se guarda el mercado (Supabase con
revisión, si es de campaña) → se guarda la ficha (IndexedDB) → si la ficha está compartida, se publica
su copia en línea → la ficha muestra el objeto en Equipo (o en Taller › Materiales).

Si la ficha no se puede guardar, se deshace el cambio del mercado. Si otro jugador compró a la vez
(`conflict`), se recarga el mercado y se repite la operación con datos frescos.

## Ficha y Tienda abiertas a la vez (AgSt 1.17)

Las monedas, el inventario y los materiales viven sólo en la ficha. Cuando una
pestaña guarda un personaje, avisa a las demás (`BroadcastChannel`
`agarias:characters`, en `services/characters.js`):

- La **Tienda** relee la ficha y actualiza la bolsa al instante (también al volver
  a su pestaña). Así se ven las monedas que el jugador suma por un regalo del DM.
- La **ficha** se recarga si no tiene cambios sin guardar. Si los tiene, al guardar
  combina las dos versiones (`domain/merge.js`): las monedas suman las dos
  diferencias (regalo + compra), las listas suman altas y bajas de ambos lados y,
  si el mismo dato cambió en los dos, gana la pestaña que guarda. Nunca pisa una
  compra hecha en la otra pestaña.

## Código

- `domain/money.js`: monedas de la ficha (pagar con cambio, cobrar, formato).
- `domain/shop/`: catálogo, precios, simulación por días, negociación, transacciones e
  `inventory.js` (puente con la ficha).
- `services/shop.js`: une personajes, Homebrew/campañas y mercado. `services/shop-market.js`: persistencia.
- `views/shop/`: interfaz (carga diferida desde `main.js`).
- Pruebas: `tests/shop.test.js`, `tests/merchants.test.js` y `supabase/tests/test_rpc.py` (`test_shop_market_per_campaign`, `test_merchant_content_type`).

## Ámbito del mercado

Un personaje de una campaña de la que este dispositivo es miembro usa el mercado de esa campaña.
Lo ven todos los jugadores y solo el DM pasa los días. Un personaje sin campaña usa el mercado local.

## Comerciantes como PNJ (mundo vivo)

Una sola regla de diseño: **Raza + Trasfondo + Personalidad + Facción + Región + Historia + Memoria +
Situación del mundo → Disposición → Precios, regateo, información, inventario, ofertas y diálogo.**
Todo sale de `domain/shop/disposition.js`; no hay reglas de trato repartidas por el código.

| Capa | Módulo | Datos |
|---|---|---|
| Comerciante (quién es) | `personality.js` (arquetipos y banderas de comportamiento de un catálogo cerrado) | `keepers.json`, `personalities.json` |
| Ubicación y horarios | `presence.js` (fijos, errantes calculados por semilla, franjas, días, sólo en eventos, lugares ocultos) | `world.json` |
| Inventario | `simulation.js` (+ objetos reservados `requires`, mercancía de eventos) | `shops.json` |
| Jugador | `profile.js` (lo que se ve a simple vista y lo que sólo cuenta si se lo dices o le mientes) | ficha |
| Economía | `pricing.js` (región, eventos con región, factores personales) | `world.json`, `events.json` |
| Relación | `disposition.js` (−100..100 → Hostil / Desconfiado / Neutral / Amistoso / Favorable / Amigo) | mundo |
| Memoria | `memory.js` (compras, regateos, mentiras, robos, favores, regalos, promesas…) | mundo |
| Conversación | `talk.js` (contar, mentir, historias, leerle, rumores, rondas, regalos, favores, secretos, robar) | `rumors.json`, `dialogue.json` |
| Eventos | `world-events.js` + `simulation.js` (`triggerEvent`, `endEvent`, actitudes y stock de eventos) | `events.json` |

**Añadir un comerciante** es configurar datos: una entrada en `keepers.json` (o un Homebrew de tipo
«Comerciante») y su tienda en `shops.json`. Las actitudes (`attitudes`) son condiciones
`{race|class|background|faction|origin|alignment|event|memory}` → valor, con `hidden` para prejuicios
ocultos (se descubren con Perspicacia) y efectos (`refuse`, `unlock`, `share`). Los arquetipos combinan
comportamientos: rebajas espontáneas, regalos, subir el precio al desesperado, exigir garantías,
vender información, mentir en los rumores, beber, rencor…

**Presencia.** Sólo se comercia con quien está en tu ubicación y atiende en esa franja (el dominio lo
comprueba en compras, ventas, regateo y conversación). El DM pasa las franjas; tras la noche amanece
y corre la simulación diaria. Los errantes no guardan estado: su ruta sale de la semilla del mundo.

**Herramientas del DM** (botón «🎲 DM»): siguiente franja, lanzar/terminar eventos (también los
`manual`), viajes libres entre regiones o no, reputación con facciones y registrar sucesos en la
memoria de un comerciante (le salvaste a un familiar, le insultaste…). Los favores de tipo «tarea»
los da por cumplidos el DM.

## Mundo configurable por el DM

El DM construye el mundo desde la Tienda (botón **🌍 Mundo**) o desde Homebrew. Cuatro tipos Homebrew,
**exclusivos del DM** (el cliente no los ofrece a jugadores y el servidor rechaza cualquier intento):

| Tipo | Qué define | Cómo influye |
|---|---|---|
| Región (`region`) | tipo, peligro 0-5, facciones presentes, razas predominantes, recursos, productos comunes y escasos, reglas económicas, demanda, lugares, rumores | `compile.js` lo convierte en modificadores de precio, reposición y demanda; peligro → lo que protege vale más y desconfían de forasteros; razas → los locales caen mejor |
| Facción (`faccion`) | ideología, regiones, aliados, rivales, mercancías, eventos | mercancías = especialidad de sus comerciantes y precio de aliado; rivales → desconfianza |
| Comerciante (`mercader`) | todo: profesión, lugar o ruta, horario por horas o franjas, días, eventos, secreto, raza, facción, personalidad, afinidades y prejuicios (con efectos), reputación de facción, negociación, contratación, catálogo, objetos que añade o quita, precios propios, diálogos, rumores, secretos, favores | se convierte en vendedor + tienda con el formato oficial |
| Evento (`evento`) | regiones, precios, demanda, actitudes, cierres, mercancía, duración, manual | igual que los oficiales; el DM puede lanzarlo |

- **Editar lo oficial**: con `base`, la entrada sustituye a la oficial **conservando su id** (relaciones,
  memoria y existencias siguen intactas). El editor se abre con los datos actuales (`merchantToEditor`…).
  Para volver al original basta con retirar la entrada.
- **Profesiones** (`data/shop/professions.json`): tabernero, panadero, carnicero, alquimista, herrero,
  armero, telas, joyero, librero, mágico, tecnológico, materiales, establero, perista, general. Cada una es
  una plantilla de catálogo + comportamientos; añadir otra es añadir datos.
- **Ámbito**: un mercado de campaña sólo usa el Homebrew publicado de esa campaña; el local, el de este
  dispositivo. (Antes el Homebrew local de un jugador podía colarse en el mercado compartido.)

## Contratación (primera versión)

`domain/shop/hiring.js`. El contrato vive en `world.contracts[keeperId]` (un patrón por comerciante).
Como las fichas viven en el dispositivo de cada jugador, el mercado no toca la bolsa en su ausencia: cada
día el contrato suma beneficios (ventas × margen × parte del patrón) y resta salario y local; el jugador
liquida al visitar a su empleado. Si la deuda crece, renuncia (y lo recuerda). El contrato puede
trasladarle (si acepta mudarse) y pedirle productos extra. Extensiones previstas: `employer.type`
(facción u organización), lugar = propiedad del jugador, gastos y catálogos más finos.

## Lord 100 (la Torre)

Mundo de la Tienda alternativo. Lo elige el DM en la ficha de la campaña («Mundo de la Tienda») o, sin campaña, cada dispositivo en ⚙ Opciones (cada mundo guarda su propio mercado).

**No es un sistema aparte**: `content/lord100.js` genera, a partir de `data/shop/lord100.json`, las mismas regiones y comerciantes que crea el DM en Homebrew, y todo lo demás (pisos, viajar, economía, inventarios, campañas) funciona igual.

- **Datos compactos** (`lord100.json`, PROPUESTA editable): 20 tramos con sus pisos (1–5 Tierra Salvaje … 96–99 El Trono del Olvido), cada uno con sus zonas en orden, criaturas, razas y negocios especiales; y un catálogo de ~100 biomas (zona) con recursos abundantes/normales/escasos, criaturas y negocios típicos.
- **Piso N** = región `hb-l100-pN` (gran región = tramo). **Zona** = lugar. En cada tramo, el 1.er piso tiene 1 zona y cada piso añade la siguiente (hasta 5).
- **Economía estricta** (`region.strict`): la materia prima sólo existe si el piso la produce o le llega (abunda −30 % y más stock · normal · escasea +40 %, poco stock y más demanda). Lo que no figura, no se encuentra. Las criaturas del tramo traen sus materiales (con poco stock).
- **Negocios**: la zona nueva trae sus dos negocios típicos; las anteriores, uno (rotando); un comerciante general por piso; posada al principio y al final del tramo. Los **especiales** piden un requisito (jefe, misión…) y guardan lo **exclusivo** (legendario): nunca aparece en tiendas normales.
- **Viajar**: Piso → Zona (con sus negocios, los bloqueados con 🔒 y el motivo) → ir.
- **Materias primas** (`materias`): metales, menas y minerales, gemas, madera, plantas, partes animales, partes de monstruo y materiales mágicos. Profesiones: Tienda de minerales, Comerciante de materiales (ampliado), Herbolario, Curtidor, Mercader de monstruos.
- **Comercio entre pisos**: la materia prima se revende al 65 % (no al 50 %), así que comprar donde abunda y vender donde escasea deja algo; lo limitan el stock, la caja del comerciante y la demanda.
- **Tamaño**: los negocios de pisos no alcanzados no se guardan; sólo los pisos cercanos al actual guardan el gráfico de precios. La Torre entera ronda 1 MB (límite del servidor: 1,5 MB).
- **Condiciones de un negocio** (se suman): campaña (sólo existe en su mundo/paquete) + piso + zona + requisito + reputación mínima (`minReputation`: con su facción o la fama del personaje en la región).

## Sistema monetario (AgSt 1.20)

Hay dos sistemas (`domain/money.js`):

| | 10 pc | pp → po | po → ppt |
|---|---|---|---|
| Monedas de D&D (el de siempre) | 1 pp | 10 pp = 1 po | 10 po = 1 ppt |
| Monedas de Lord 100 | 1 pp | 100 pp = 1 po | 100 po = 1 ppt |

- **Los importes se guardan en piezas de cobre**, que valen lo mismo en los dos
  sistemas. Por eso ningún precio «ignora» el sistema: es un valor y se muestra con
  las monedas activas (una espada de 1500 pc es «15 po» en D&D y «1 po 50 pp» en
  Lord 100). El poder adquisitivo es el mismo: el oro y el platino de Lord 100 valen
  más.
- **Sistema de la campaña:** ⚙ Opciones → «Sistema monetario». Puede ser
  *automático* (por defecto: Monedas de Lord 100 si está activa «Usar progresión por
  pisos en esta campaña», y de D&D si no lo está), D&D o Lord 100. Se guarda en
  `world.progress.currency`, que sólo cambia el DM (el servidor ya lo protege: no hace
  falta migración). El sistema activo se ve en la cabecera de la Tienda (🪙).
- **Las monedas de cada ficha llevan su sistema** (`equipment.coins.system`; las
  antiguas son de D&D). Si no coincide con el de la campaña, la Tienda NO cobra:
  enseña cómo quedan los fondos («2 ppt 120 po → 14 po») y el jugador confirma.
  La conversión (`convertCoins`) conserva el valor exacto: no se pierde ni se
  duplica dinero. En la ficha (Equipo → Monedas) también se puede pasar de un
  sistema a otro, con la misma vista previa.
- Los campos donde se escriben importes «en po» (negocio propio, salarios,
  recompensas del Gremio) usan el po del sistema activo.

## Establecimientos (AgSt 1.20)

En la Tienda, los letreros se agrupan en **Esenciales** (posada, comercio general,
Gremio), **Comercios** y **Especiales**.

- **Lord 100:** en TODOS los pisos hay posada, comercio general y Gremio. Cada
  zona nueva aporta además un negocio variable propio de su tipo (`extras` en
  `lord100.json`: un puerto puede traer cambista, exóticos o mueblería; una capilla,
  templo; un bosque, flechero o carpintero…). Cada tramo tiene una tienda de
  **Productos regionales**. Los negocios que ya existían no cambian. Desde el piso 40
  los artesanos ofrecen calidad fina y desde el 75 obra maestra.
- **Profesiones nuevas:** lutier (instrumentos y juegos), templo, cambista,
  flechero, carpintero y carretero, escriba de conjuros, muebles y decoración,
  mercado agrícola, objetos exóticos, casa de lujo y productos regionales.
- **Agarias:** se suman a la Plaza y la Puerta Este una alquimista, un lutier, el
  templo, un cambista, una flechera, un carpintero, un escriba y una mueblería.
- **Pestañas propias:** 🛏️ Hospedaje (tabernas y posadas fijas), 🤝 Servicios
  (templo, escriba, carpintero, lutier, flechero: se pagan por adelantado y los narra
  el DM), 💱 Cambio y banco (cambiar monedas con un 2 % de comisión y guardar dinero
  en el banco de la campaña; sin intereses ni préstamos).

## Hospedaje (AgSt 1.20)

`data/shop/lodging.json` + `domain/shop/lodging.js`. Seis habitaciones (Básica,
Económica, Estándar, Cómoda, Premium y Lujo). La básica cuesta 1 pp al día en las
dos monedas. Cada posada tiene su categoría:

| Categoría | Habitaciones | Precio | Si te vas antes |
|---|---|---|---|
| Posada humilde | Básica → Estándar | ×0,8 | No se devuelve |
| Posada | Básica → Premium | ×1 | La mitad de los días sin usar |
| Hotel de lujo | Estándar → Lujo | ×1,5 | Los días sin usar |

En Lord 100 el precio sube un 1 % por piso, los pisos 1–9 no tienen hoteles de lujo
y las zonas ricas (puertos, ciudades, cortes) suben de categoría. Antes de pagar se
enseñan las comodidades, los días y el total. La estancia (`world.lodging[charId]`)
se descuenta sola con el calendario del mundo. Quien puede pasar el tiempo (el DM,
o el jugador sin campaña) puede marcar «Pasar estos días ahora». Al terminar el
plazo hay que renovar (si alcanza el dinero) o dejar la habitación.

## Muebles y decoración (AgSt 1.20)

Categoría `hogar`: muebles **funcionales** (camas, mesas, escritorios, armarios,
banco de trabajo… tienen un uso) y **decorativos** (alfombras, cuadros,
candelabros…). Se compran en carpinterías, mueblerías y otros negocios, se guardan
en el inventario y se colocan (🏠 Propiedades → 🪑 Muebles) en:

- la habitación alquilada (huecos según la habitación); al dejarla, vuelven solos;
- una propiedad con 🏠 Vivienda (6, 10 o 16 huecos según el tamaño); al venderla,
  vuelven al inventario.

## Caja de las tiendas (AgSt 1.21)

Todo lo que paga un jugador entra en la caja de quien cobra, y todo lo que recibe
sale de ella (`addShopCash` en `domain/shop/state.js`):

- compras y ventas, rumores pagados, rondas, primas de contratación;
- hospedaje (y su reembolso si te vas antes), servicios, comisiones del cambista;
- comisiones y tasas del Gremio y los servicios contratados allí;
- liquidar a un comerciante contratado: los beneficios salen de su caja (si hoy no
  tiene tanto, cobras lo que haya y el resto queda pendiente) y lo que le debes
  entra en ella.

Las recompensas de misiones PJ quedan en depósito en el Gremio; el banco guarda su
saldo aparte. `tests/money-audit.test.js` comprueba en los dos sistemas monetarios
que en cada operación no se pierde ni se crea dinero.

## Formato compacto del mercado (AgSt 1.20)

Con la Torre entera abierta el mercado se acercaba al límite del servidor (1,5 MB).
Al guardar, `domain/shop/pack.js` compacta las existencias y el historial de precios
(la mitad de tamaño). `migrateWorld` lo despliega al cargar y acepta también el
formato anterior, así que no hace falta migración.

## Gremio de aventureros (Lord 100, AgSt 1.18)

Cada piso de la Torre tiene un Gremio: un comerciante oficial más (profesión
`gremio`, en la primera zona del piso), con su propia pestaña «🛡️ Gremio». Vende
suministros básicos y compra partes de criaturas. Su tamaño depende del piso
(`guildProfile` en `content/lord100.js`):

| Prestigio | Dónde | Tablón | Servicios | Comisión |
|---|---|---|---|---|
| Gran Sede | pisos 1, 10, 20 … 90, 99 | 7 | 7 + 1 | 10 % |
| Sede | inicio y fin de cada tramo | 5 | 5 + 1 | 8 % |
| Puesto | el resto | 3 | 3 | 5 % |

Los rangos habituales del tablón suben un escalón cada 11 pisos (F abajo, SSS en
89–99). Las criaturas, materiales, zonas y razas salen del propio piso. Todo el
texto está en `data/shop/guild.json`, que se puede editar sin tocar código.

- **Tablón** (`domain/shop/guild.js`): las misiones del Gremio se generan por piso
  y semana y no ocupan espacio hasta que alguien las acepta. Las misiones PJ las
  publica un jugador: paga la recompensa en depósito más la comisión (mínimo: el 10 % de la recompensa habitual del rango; el formulario la propone y avisa antes de publicar). Aceptar una
  misión exige una licencia de su rango (las F no la piden). Una misión PJ la
  cierra quien la publicó (o el DM); las del Gremio, sólo el DM. Cada
  aventurero cobra su parte en el Gremio (la ficha de otro jugador no está en tu
  dispositivo). Si la retiras sin aventureros o vence, recuperas el depósito; la
  comisión no se devuelve.
- **Licencias F → SSS**: examen con 2 preguntas, 2 pruebas de habilidad y una
  situación (aprueba con 1/2 y 2/3), nivel mínimo y tasa. Si suspendes, debes
  esperar 7 días para repetirlo. La primera licencia puede ser de cualquier rango
  que permita tu nivel; después se asciende de uno en uno, con misiones
  completadas. El DM puede conceder o retirar rangos.
- **Reputación**: puntos por misión completada según el rango (−1 por
  abandonar).
- **Servicios**: profesionales del piso (mercenarios, guías, curanderos,
  alquimistas, expertos en las criaturas, materiales o zonas del piso…) que
  rotan cada semana. Se pagan por adelantado y lo que hacen lo narra el DM.
- `world.guild` = `{ quests, licenses, hires }`, podado (150 misiones, 100
  contratos). No hace falta migración: el servidor sólo limita el tamaño. Como el
  resto de la Tienda, las licencias se controlan en el cliente: no hay cuentas.
- El Gremio vive en su piso: no da acceso a otros pisos (eso lo decide la
  progresión de la Torre).

## Calidad (además de la rareza)

`domain/shop/quality.js`. Armas (salvo munición), armaduras y herramientas existen en cuatro calidades: 🪵 Tosca (×0,6), Estándar (×1), ✨ Fina (×1,75) y 🏅 Obra maestra (×4). La **rareza** fija el precio base y lo difícil que es encontrarlo; la **calidad** lo multiplica y da un efecto pequeño no mágico (se ve en la ficha del objeto y queda en las notas del inventario).

- Cada calidad es una variante del catálogo (`<objeto>~fina`): stock, precio, venta e inventario funcionan igual.
- Una tienda sólo las ofrece si su ficha lo dice (`qualities`; en el formulario del comerciante, «Calidades que ofrece»), o si lo dice su profesión (herrero: tosca y fina; armero: fina y obra maestra). Cada tienda tiene una selección fija de qué objetos tiene en cada calidad, con menos unidades cuanto mejor; la obra maestra no aparece sola en objetos muy raros o más.
- Las «Novedades por piso» pueden añadir variantes concretas (p. ej. una espada de obra maestra al llegar al piso 30).

## Progresión por pisos (Lord 100)

Para mundos que se abren piso a piso. Se activa en «🌍 Mundo → 🏰 Pisos» (sólo el DM) y se guarda en `world.progress` (`domain/shop/floors.js`); la migración `20261117` impide que un jugador lo cambie.

- **Piso de cada negocio**: campo «Piso» del comerciante o, si no tiene, el de su región (campo «Piso» de la región: sus lugares tampoco se ven ni se viaja a ellos hasta llegar). Sin piso, existe siempre.
- **«⬆️ Llegaron al piso N»**: abre todo lo de ese piso. Los pisos anteriores siguen abiertos. El aviso dice qué negocios se abrieron y cuáles piden algo más.
- **Estados**: 🟢 desbloqueado · ⭐ especial/temporal · 🔒 en el piso pero con requisito pendiente (se ve, no atiende) · ⛔ piso superior (los jugadores sólo ven cuántos hay) · ✖ cerrado.
- **Requisito**: texto en la ficha («Completar la misión X»); el DM lo marca como cumplido en la pestaña Pisos.
- **Excepciones del DM**: forzar abierto (lore, recompensa) o forzar cerrado (el negocio cerró en el mundo).
- **Temporales**: «Negocio especial» + «Cierra después del piso N».
- **Novedades por piso**: productos que un comerciante suma al surtido al llegar a un piso.
- **Viajar entre pisos**: con la progresión activa, la Tienda muestra «🏰 Mercado por pisos» con un botón por cada piso alcanzado. Cada piso es un lugar: la región del DM con ese piso o, si no hay, un lugar «Piso N» automático donde se ubican los comerciantes con ese piso (`placeOnFloors` en `context.js`).
- «🏪 Negocios» muestra a los jugadores qué hay disponible y qué pide algo más.

## Carpeta del DM (tiendas propias por campaña)

En «🌍 Mundo → 📁 Carpeta del DM» hay una carpeta por cada campaña en la que eres DM (y otra para este dispositivo). Cada tienda que crees ahí es un comerciante Homebrew **nuevo** en el paquete de esa campaña: no sustituye nada oficial y sólo existe en esa campaña.

- **➕ Nueva tienda**: comerciante y tienda desde cero (profesión, categorías, objetos sueltos, precios propios…).
- **📄 Copiar una tienda oficial**: crea una tienda nueva (`copyOf`) que parte del catálogo de la oficial, sin sustituirla. Puedes cambiar nombre, lugar, productos y precios.
- **Modificar lo oficial** sigue en la pestaña «Comerciantes» (capa `base` encima del original); la carpeta las muestra aparte.
- **🏪 Abrir su mercado**: el DM entra al mercado de esa campaña sin personaje. También está en el selector de personaje («Como DM»).

## Propiedades, negocios y empleados

Todo vive en el JSON del mercado (`world.estate`, `world.staff`, `world.reports`, `world.popularity`); los datos base están en `data/shop/estate.json` (terrenos, mejoras, roles, nombres).

- **Terrenos** (`domain/shop/estate.js`): se compran en persona. Las **mejoras** (local, almacén, escaparate, taller, vivienda) cuestan dinero y días, tienen requisitos y suben el valor. Al vender recuperas el 80 % (lo construido se queda en el terreno).
- **Negocio**: necesita un local. Pones productos de tu inventario a la venta con tu precio; **sólo vende si hay un vendedor asignado**. La venta diaria depende de la popularidad del producto en la región, la del negocio, la habilidad del vendedor, tu fama y el precio frente al de referencia.
- **Caja**: ahí entran las ventas y de ahí salen mantenimiento, salarios y comisiones. **Nada llega solo a la bolsa del personaje**: el dueño retira en persona lo que no esté reservado para salarios pendientes.
- **Empleados** (`domain/shop/staff.js`): tablón semanal determinista por lugar. Roles: vendedor, constructor (acelera obras), explorador. Condiciones: salario diario, pago diario o semanal, % de las ventas, duración. Sin caja, el salario queda como deuda; impagos bajan el ánimo y por debajo de 15 renuncian. Eventos: enfermedad, pide aumento, buen día. Añadir roles = datos + una rama en la simulación.
- **Exploradores**: al volver crean un **informe pendiente** con resultado sugerido (éxito / fracaso / descubrimiento), tirada y sugerencias (lugares ocultos, rumores). El DM lo confirma o cambia en «📨 Informes»; sólo entonces lo ve el jugador (y se revela el lugar o el rumor). La migración `20261116` impide que un jugador cree o confirme informes desde su cliente.
- **Popularidad** (`domain/shop/popularity.js`): por producto y región, fama del personaje por región y del negocio. Sube con ventas y promociones, se desgasta con el tiempo. Más fama = más demanda y mejor precio de venta (hasta +30 %).
- **Inventos del Taller**: cada receta es un producto del catálogo (`taller-obra-<receta>`, no se vende en tiendas). Lo fabricado guarda `ref`; los inventos viejos se reconocen por nombre. Progresión deducida del mundo: inventor → vendedor ocasional → comerciante → dueño de negocio → empresario reconocido.

## Aspecto
El tema de la Tienda (madera, latón y pergamino) vive en `views/shop/shop.css`, dentro de `.shop-root`, así que no afecta al resto de la app. Las tipografías (Cinzel y Alegreya Sans) están incluidas en el proyecto (`views/shop/fonts/`, licencia OFL), porque la CSP no permite fuentes externas. Solo se cargan al entrar en `/tienda`.
