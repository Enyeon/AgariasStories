# Tienda

Ruta `/tienda` (y `/tienda/<personaje>`), entre «Personajes» y «Homebrew» en la barra.

## Dónde vive cada dato (sin duplicados)

| Dato | Dónde | Quién lo usa |
|---|---|---|
| Monedas | `character.equipment.coins` (ficha) | Tienda, Taller y pestaña Equipo, con `domain/money.js` (único módulo de dinero) |
| Objetos comprados | `character.equipment.items` (`ref` opcional al catálogo) | Pestaña Equipo; la Tienda los reconoce para venderlos |
| Materiales del Ingeniero | `character.workshop.materials` | Pestaña Taller (fabricar); se compran en la Tienda |
| Catálogo | `data/shop/items.json` + materiales de `data/taller.json` + objetos Homebrew con coste | `domain/shop/sources.js` (lee las fuentes, no las copia) |
| Mercado (existencias, eventos, día, relaciones, registro de compras) | Campaña: Supabase `agarias.shop_markets`. Sin campaña: este dispositivo | `services/shop-market.js` |

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
- Pruebas: `tests/shop.test.js` y `supabase/tests/test_rpc.py::test_shop_market_per_campaign`.

## Ámbito del mercado

Un personaje de una campaña de la que este dispositivo es miembro usa el mercado de esa campaña.
Lo ven todos los jugadores y solo el DM pasa los días. Un personaje sin campaña usa el mercado local.

## Aspecto
El tema de la Tienda (madera, latón y pergamino) vive en `views/shop/shop.css`, dentro de `.shop-root`, así que no afecta al resto de la app. Las tipografías (Cinzel y Alegreya Sans) se sirven desde la propia app con `@fontsource`, porque la CSP no permite fuentes externas. Solo se cargan al entrar en `/tienda`.
