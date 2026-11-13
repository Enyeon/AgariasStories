/**
 * Estado persistente del mercado ("mundo") y acceso seguro a él.
 *
 * El mundo es JSON puro (sin Infinity, sin funciones) para poder guardarlo en
 * IndexedDB, exportarlo o subirlo a Supabase. Todas las mutaciones del dominio
 * reciben un mundo y devuelven uno nuevo (structuredClone): la UI nunca muta.
 */

export const WORLD_FORMAT = 'agarias-shop-world';
export const WORLD_VERSION = 2;
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
        // v2: mundo vivo
        phase: 0,
        positions: {},
        discovered: {},
        standing: {},
        journal: {},
        settings: { freeTravel: true },
        contracts: {},
        // Propiedades, empleados, informes para el DM y popularidad
        estate: { properties: {} },
        staff: {},
        reports: [],
        popularity: { products: {}, renown: {} },
    };
}

export function getShopState(world, shopId) {
    return world.shops?.[shopId] ?? null;
}

export function getStockEntry(world, shopId, itemId) {
    return world.shops?.[shopId]?.stock?.[itemId] ?? null;
}

/**
 * Relación de un personaje con un comerciante.
 *  rep: trato acumulado (−100..100) · known: lo que el jugador descubrió de él
 *  memory: { tipo: { n, day } } lo que el comerciante recuerda de ti
 *  told: lo que le contaste de verdad · claims: lo que le contaste mintiendo
 *  secrets: secretos suyos que conoces · unlocks: objetos que te reserva
 *  favors: { id: { status: active|done|failed, day, due } } · rumors: ids ya oídos
 *  discount: { pct, until } recompensa temporal · daily: acciones usadas hoy
 */
const DEFAULT_RELATION = Object.freeze({
    rep: 0,
    known: { likes: [], dislikes: [], traits: [] },
    gainedDay: 0,
    gainedToday: 0,
    noHaggleUntil: 0,
    deals: 0,
    memory: {},
    told: {},
    claims: {},
    secrets: [],
    unlocks: [],
    favors: {},
    rumors: [],
    discount: null,
    banUntil: 0,
    daily: { day: 0, used: [] },
    lastGift: -99,
});

function withDefaults(rel) {
    if (!rel) return DEFAULT_RELATION;
    if (rel.memory && rel.daily) return rel;
    return { ...structuredClone(DEFAULT_RELATION), ...rel, known: { ...DEFAULT_RELATION.known, ...rel.known } };
}

/** Relación de un personaje con un vendedor (solo lectura). */
export function getRelation(world, charId, keeperId) {
    return withDefaults(world.relations?.[charId ?? '_']?.[keeperId]);
}

/** Relación editable (la crea si no existe). Usar solo sobre un mundo clonado. */
export function ensureRelation(world, charId, keeperId) {
    const key = charId ?? '_';
    world.relations[key] ??= {};
    const rel = (world.relations[key][keeperId] = withDefaults(world.relations[key][keeperId]));
    if (rel === DEFAULT_RELATION) return (world.relations[key][keeperId] = structuredClone(DEFAULT_RELATION));
    return rel;
}

/** ¿Ya usó hoy esta acción con este comerciante? */
export function usedToday(rel, action, day) {
    return rel.daily?.day === day && rel.daily.used.includes(action);
}

export function markUsed(rel, action, day) {
    if (rel.daily?.day !== day) rel.daily = { day, used: [] };
    if (!rel.daily.used.includes(action)) rel.daily.used.push(action);
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
    // v1 → v2: mundo vivo (franjas del día, posiciones, descubrimientos,
    // reputación con facciones y diario de rumores). Nada de lo anterior cambia.
    if (world.version === 1) world.version = 2;
    world.day = Math.max(1, Math.trunc(Number(world.day) || 1));
    world.events = Array.isArray(world.events) ? world.events : [];
    world.eventsEnded ??= {};
    world.shops ??= {};
    world.relations ??= {};
    world.haggles ??= {};
    world.deals ??= {};
    world.ledger = Array.isArray(world.ledger) ? world.ledger.slice(0, LEDGER_LIMIT) : [];
    world.phase = Math.max(0, Math.min(3, Math.trunc(Number(world.phase) || 0)));
    world.positions ??= {};
    world.discovered ??= {};
    world.standing ??= {};
    world.journal ??= {};
    world.settings = { freeTravel: true, ...world.settings };
    world.contracts ??= {};
    world.estate ??= { properties: {} };
    world.staff ??= {};
    world.reports ??= [];
    world.popularity ??= { products: {}, renown: {} };
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
