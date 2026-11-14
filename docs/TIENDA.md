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

## Progresión por pisos (Lord 100)

Para mundos que se abren piso a piso. Se activa en «🌍 Mundo → 🏰 Pisos» (sólo el DM) y se guarda en `world.progress` (`domain/shop/floors.js`); la migración `20261117` impide que un jugador lo cambie.

- **Piso de cada negocio**: campo «Piso» del comerciante o, si no tiene, el de su región (campo «Piso» de la región: sus lugares tampoco se ven ni se viaja a ellos hasta llegar). Sin piso, existe siempre.
- **«⬆️ Llegaron al piso N»**: abre todo lo de ese piso. Los pisos anteriores siguen abiertos. El aviso dice qué negocios se abrieron y cuáles piden algo más.
- **Estados**: 🟢 desbloqueado · ⭐ especial/temporal · 🔒 en el piso pero con requisito pendiente (se ve, no atiende) · ⛔ piso superior (los jugadores sólo ven cuántos hay) · ✖ cerrado.
- **Requisito**: texto en la ficha («Completar la misión X»); el DM lo marca como cumplido en la pestaña Pisos.
- **Excepciones del DM**: forzar abierto (lore, recompensa) o forzar cerrado (el negocio cerró en el mundo).
- **Temporales**: «Negocio especial» + «Cierra después del piso N».
- **Novedades por piso**: productos que un comerciante suma al surtido al llegar a un piso.
- Los jugadores ven «🏰 Piso N» en la Tienda con los negocios disponibles.

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
