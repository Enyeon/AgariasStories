/**
 * Estado persistente del mercado ("mundo") y acceso seguro a él.
 *
 * El mundo es JSON puro (sin Infinity, sin funciones) para poder guardarlo en
 * IndexedDB, exportarlo o subirlo a Supabase. Todas las mutaciones del dominio
 * reciben un mundo y devuelven uno nuevo (structuredClone): la UI nunca muta.
 */

export const WORLD_FORMAT = 'agarias-shop-world';
export const WORLD_VERSION = 1;
export const LEDGER_LIMIT = 300;
export const HISTORY_DAYS = 14;

export function cloneWorld(world) {
    return structuredClone(world);
}

export function emptyWorld(seed) {
    return {
        format: WORLD_FORMAT,
        version: WORLD_VERSION,
        seed: String(seed),
        day: 1,
        events: [],
        eventsEnded: {},
        shops: {},
        relations: {},
        haggles: {},
        deals: {},
        ledger: [],
    };
}

export function getShopState(world, shopId) {
    return world.shops?.[shopId] ?? null;
}

export function getStockEntry(world, shopId, itemId) {
    return world.shops?.[shopId]?.stock?.[itemId] ?? null;
}

const DEFAULT_RELATION = Object.freeze({ rep: 0, known: { likes: [], dislikes: [], traits: [] }, gainedDay: 0, gainedToday: 0, noHaggleUntil: 0, deals: 0 });

/** Relación de un personaje con un vendedor (solo lectura). */
export function getRelation(world, charId, keeperId) {
    return world.relations?.[charId ?? '_']?.[keeperId] ?? DEFAULT_RELATION;
}

/** Relación editable (la crea si no existe). Usar solo sobre un mundo clonado. */
export function ensureRelation(world, charId, keeperId) {
    const key = charId ?? '_';
    world.relations[key] ??= {};
    world.relations[key][keeperId] ??= structuredClone(DEFAULT_RELATION);
    return world.relations[key][keeperId];
}

/**
 * Cambia la reputación respetando un tope diario de ganancia (evita "farmear"
 * simpatía charlando sin parar). Las pérdidas no tienen tope.
 */
export function changeReputation(world, charId, keeperId, delta, { dailyCap = 6 } = {}) {
    const rel = ensureRelation(world, charId, keeperId);
    if (rel.gainedDay !== world.day) {
        rel.gainedDay = world.day;
        rel.gainedToday = 0;
    }
    let applied = delta;
    if (delta > 0) {
        applied = Math.max(0, Math.min(delta, dailyCap - rel.gainedToday));
        rel.gainedToday += applied;
    }
    rel.rep = Math.max(-100, Math.min(100, rel.rep + applied));
    return applied;
}

export function haggleKey(charId, shopId, itemId, side) {
    return `${charId ?? '_'}|${shopId}|${itemId}|${side}`;
}

/** Trato vigente (precio negociado) para hoy, si queda cantidad pendiente. */
export function getActiveDeal(world, charId, shopId, itemId, side) {
    const deal = world.deals?.[haggleKey(charId, shopId, itemId, side)];
    return deal && deal.day === world.day && deal.qty > 0 ? deal : null;
}

export function pushLedger(world, entry) {
    world.ledger.unshift(entry);
    if (world.ledger.length > LEDGER_LIMIT) world.ledger.length = LEDGER_LIMIT;
}

/**
 * Migra y sanea un mundo cargado de almacenamiento. Devuelve null si no es
 * reconocible (el servicio creará uno nuevo y avisará).
 */
export function migrateWorld(raw) {
    if (!raw || typeof raw !== 'object' || raw.format !== WORLD_FORMAT) return null;
    const world = structuredClone(raw);
    if (!Number.isInteger(world.version) || world.version > WORLD_VERSION) return null;
    // v1 es la versión inicial. Las futuras migraciones se encadenan aquí:
    // if (world.version === 1) { ...; world.version = 2; }
    world.day = Math.max(1, Math.trunc(Number(world.day) || 1));
    world.events = Array.isArray(world.events) ? world.events : [];
    world.eventsEnded ??= {};
    world.shops ??= {};
    world.relations ??= {};
    world.haggles ??= {};
    world.deals ??= {};
    world.ledger = Array.isArray(world.ledger) ? world.ledger.slice(0, LEDGER_LIMIT) : [];
    for (const shop of Object.values(world.shops)) {
        shop.stock ??= {};
        shop.history ??= {};
        for (const entry of Object.values(shop.stock)) {
            entry.qty = Math.max(0, Math.trunc(Number(entry.qty) || 0));
            entry.target = Math.max(0, Math.trunc(Number(entry.target) || 0));
        }
    }
    return world;
}
