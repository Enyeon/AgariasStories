/**
 * Formato compacto del mercado para guardarlo (Supabase / navegador).
 *
 * Con la Torre entera abierta (99 pisos, ~800 negocios) el mundo se acercaba
 * al límite del servidor (1,5 MB). El 90 % del peso son las existencias y el
 * historial de precios, con claves repetidas miles de veces. Aquí se guardan
 * en listas:
 *
 *   stock    { qty, target, since, incoming: { day, qty } }  →  [qty, target, since, day, qty]
 *   history  [[d, p], [d+1, p'], …] (días seguidos)          →  { d, p: [p, p', …] }
 *
 * Las entradas con otros campos (consignas, rotativas, de evento…) se quedan
 * como objeto. `unpackWorld` deja el mundo EXACTAMENTE como estaba, y acepta
 * mundos sin empaquetar (los de antes), así que no hace falta migrar nada.
 * Funciones puras.
 */

const PACKABLE = new Set(['qty', 'target', 'since', 'incoming']);

function packStockEntry(e) {
    if (!e || typeof e !== 'object' || Array.isArray(e)) return e;
    if (!Object.keys(e).every((k) => PACKABLE.has(k))) return e;
    if (![e.qty, e.target, e.since].every(Number.isFinite)) return e;
    if (e.incoming === undefined || e.incoming === null) return e.incoming === null ? e : [e.qty, e.target, e.since];
    const inc = e.incoming;
    if (Object.keys(inc).length !== 2 || !Number.isFinite(inc.day) || !Number.isFinite(inc.qty)) return e;
    return [e.qty, e.target, e.since, inc.day, inc.qty];
}

function unpackStockEntry(e) {
    if (!Array.isArray(e)) return e;
    const out = { qty: e[0], target: e[1], since: e[2] };
    if (e.length >= 5) out.incoming = { day: e[3], qty: e[4] };
    return out;
}

function packHistory(list) {
    if (!Array.isArray(list) || list.length < 2) return list;
    const ok = list.every((x, i) => Array.isArray(x) && x.length === 2 && Number.isFinite(x[0]) && Number.isFinite(x[1]) && (i === 0 || x[0] === list[i - 1][0] + 1));
    return ok ? { d: list[0][0], p: list.map((x) => x[1]) } : list;
}

function unpackHistory(h) {
    if (Array.isArray(h)) return h;
    if (h && Number.isFinite(h.d) && Array.isArray(h.p)) return h.p.map((p, i) => [h.d + i, p]);
    return []; // dato roto: se empieza de cero (sólo es el gráfico de precios)
}

const mapValues = (obj, fn) => Object.fromEntries(Object.entries(obj ?? {}).map(([k, v]) => [k, fn(v)]));

/** Mundo listo para guardar (más pequeño). No modifica el original. */
export function packWorld(world) {
    if (!world?.shops) return world;
    const shops = mapValues(world.shops, (s) => ({ ...s, stock: mapValues(s.stock, packStockEntry), history: mapValues(s.history, packHistory) }));
    return { ...world, shops, packed: 1 };
}

/**
 * Deshace packWorld (y deja igual un mundo sin empaquetar). Despliega SIEMPRE,
 * aunque falte la marca `packed`: así un mundo guardado a medias o por otra
 * versión de la página nunca deja listas compactas sueltas.
 */
export function unpackWorld(world) {
    if (!world?.shops || typeof world.shops !== 'object') return world;
    const { packed, ...rest } = world;
    const shops = mapValues(world.shops, (s) => ({ ...s, stock: mapValues(s.stock, unpackStockEntry), history: mapValues(s.history, unpackHistory) }));
    return { ...rest, shops };
}
