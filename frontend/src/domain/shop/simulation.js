/**
 * Simulación del mercado por días de juego.
 *
 * Cada día, de forma determinista (semilla del mundo + tienda + día):
 *   - empiezan o terminan eventos (que entran y salen gradualmente);
 *   - otros clientes compran (más si hay demanda, menos si está caro);
 *   - los vendedores reponen con plazos realistas según la rareza;
 *   - los objetos excepcionales rotan (llegan, se venden, desaparecen);
 *   - la caja del vendedor se renueva;
 *   - se registra el precio de mercado para el historial.
 *
 * El tiempo lo controla la mesa (DM / botón «Pasar el día»), no el reloj real.
 */

import { createRng } from './rng.js';
import { matchesRule } from './catalog.js';
import { activeEvents, marketPrice } from './pricing.js';
import { cloneWorld, emptyWorld, HISTORY_DAYS } from './state.js';

const DEFAULT_TARGET = { common: 5, uncommon: 2, rare: 1, veryRare: 1, epic: 1, legendary: 1, unique: 1 };
const DAILY_TURNOVER = { common: 0.12, uncommon: 0.07, rare: 0.04, veryRare: 0.03, epic: 0.02, legendary: 0.012, unique: 0.008 };
const RESTOCK_LEAD = { common: [1, 3], uncommon: [2, 5], rare: [4, 9] };
const ROTATION_WEIGHT = { common: 6, uncommon: 5, rare: 3, veryRare: 1.5, epic: 0.6, legendary: 0.25, unique: 0.1 };
const MAX_CONCURRENT_EVENTS = 2;
const EVENT_START_CHANCE = 0.2;

function targetFor(item, rule) {
    if (Number.isInteger(rule.target)) return rule.target;
    if (rule.target && typeof rule.target === 'object') return rule.target[item.rarity] ?? DEFAULT_TARGET[item.rarity];
    return DEFAULT_TARGET[item.rarity] ?? 1;
}

/** Surtido fijo de una tienda: { itemId: { target, unlimited } }. */
export function computeAssortment(shop, ctx) {
    const result = {};
    for (const rule of shop.assortment ?? []) {
        for (const item of ctx.catalog.list) {
            if (!item.forSale || !matchesRule(item, rule)) continue;
            result[item.id] = { target: targetFor(item, rule), unlimited: Boolean(rule.unlimited) };
        }
    }
    return result;
}

/** ¿Está cerrada la tienda hoy (por un evento)? Devuelve el evento o null. */
export function shopClosure(world, ctx, shopId) {
    const found = activeEvents(world, ctx).find(({ def, state }) => (def.closes ?? []).includes(shopId) && world.day >= state.start && world.day <= state.end);
    return found ? found.def : null;
}

/**
 * Sincroniza el estado con los datos actuales: añade tiendas u objetos nuevos
 * (p. ej. Homebrew recién publicado) y retira los que ya no corresponden.
 * Es idempotente y se ejecuta al cargar.
 */
export function reconcileWorld(world, ctx) {
    const next = cloneWorld(world);
    for (const shop of ctx.shopList) {
        const state = (next.shops[shop.id] ??= { stock: {}, history: {}, cash: shop.cash ?? 0 });
        const assortment = computeAssortment(shop, ctx);
        for (const [itemId, spec] of Object.entries(assortment)) {
            const entry = state.stock[itemId];
            if (!entry) {
                state.stock[itemId] = { qty: spec.target, target: spec.target, incoming: null, since: next.day };
                if (spec.unlimited) state.stock[itemId].unlimited = true;
            } else if (!entry.rotating) {
                entry.target = spec.target;
                if (spec.unlimited) entry.unlimited = true;
                else delete entry.unlimited;
                delete entry.consigned;
            }
        }
        for (const [itemId, entry] of Object.entries(state.stock)) {
            const exists = ctx.item(itemId);
            const inAssortment = Boolean(assortment[itemId]);
            if (!exists || (!inAssortment && !entry.rotating && !entry.consigned)) {
                delete state.stock[itemId];
                delete state.history[itemId];
            }
        }
    }
    for (const shopId of Object.keys(next.shops)) {
        if (!ctx.shop(shopId)) delete next.shops[shopId];
    }
    return next;
}

function startEvents(world, ctx, rng, report) {
    const active = world.events.filter((e) => world.day <= e.end);
    if (active.length >= MAX_CONCURRENT_EVENTS || !rng.chance(EVENT_START_CHANCE)) return;
    const candidates = [...ctx.events.values()].filter((def) => {
        if (active.some((e) => e.id === def.id)) return false;
        const lastEnd = world.eventsEnded[def.id];
        return lastEnd === undefined || world.day - lastEnd > (def.cooldown ?? 10);
    });
    const def = rng.weighted(candidates);
    if (!def) return;
    const [min, max] = def.duration ?? [3, 6];
    const state = { id: def.id, start: world.day, end: world.day + rng.int(min, max) - 1 };
    world.events.push(state);
    report.push({ type: 'event-start', eventId: def.id });
}

function endEvents(world, report) {
    world.events = world.events.filter((e) => {
        if (e.end >= world.day) return true;
        world.eventsEnded[e.id] = e.end;
        report.push({ type: 'event-end', eventId: e.id });
        return false;
    });
}

function eventMultiplier(world, ctx, list, item, shopId, field, neutral) {
    let mult = neutral;
    for (const { def, intensity } of activeEvents(world, ctx)) {
        for (const entry of def[list] ?? []) {
            if (entry.shops && !entry.shops.includes(shopId)) continue;
            if (!matchesRule(item, entry.rule)) continue;
            mult *= 1 + ((entry[field] ?? neutral) - 1) * intensity;
        }
    }
    return mult;
}

function simulateShopDay(world, ctx, shop, report) {
    const state = world.shops[shop.id];
    const rng = createRng(world.seed, 'shop', shop.id, world.day);
    const closed = shopClosure(world, ctx, shop.id);

    state.cash = Math.round((shop.cash ?? 0) * rng.range(0.85, 1.15));

    for (const [itemId, entry] of Object.entries(state.stock)) {
        const item = ctx.item(itemId);
        if (!item) continue;

        // 1) Llegada de pedidos
        if (entry.incoming && entry.incoming.day <= world.day) {
            entry.qty += entry.incoming.qty;
            report.push({ type: 'arrival', shopId: shop.id, itemId, qty: entry.incoming.qty });
            entry.incoming = null;
        }
        if (entry.unlimited) continue;

        // 2) Ventas a otros clientes (no si la tienda está cerrada)
        if (!closed && entry.qty > 0) {
            const market = marketPrice(world, ctx, shop.id, itemId) ?? item.price;
            const elasticity = Math.pow(item.price / Math.max(1, market), 1.5);
            const demand = eventMultiplier(world, ctx, 'demand', item, shop.id, 'mult', 1);
            const base = Math.max(entry.target, 1) * (DAILY_TURNOVER[item.rarity] ?? 0.05);
            const sold = Math.min(entry.qty, rng.poisson(base * elasticity * demand));
            if (sold > 0) {
                entry.qty -= sold;
                if (entry.qty === 0) report.push({ type: entry.rotating ? 'gone' : 'sold-out', shopId: shop.id, itemId });
            }
        }

        // 3) Reposición: pide cuando baja a la mitad, con plazo según rareza
        const lead = RESTOCK_LEAD[item.rarity];
        if (!entry.rotating && !entry.consigned && lead && !entry.incoming && entry.qty <= Math.floor(entry.target * 0.5)) {
            const leadMult = eventMultiplier(world, ctx, 'restock', item, shop.id, 'leadMult', 1);
            const days = Math.max(1, Math.round(rng.int(lead[0], lead[1]) * leadMult));
            const qtyMult = eventMultiplier(world, ctx, 'restock', item, shop.id, 'qtyMult', 1);
            const qty = Math.max(1, Math.round((entry.target - entry.qty) * qtyMult));
            entry.incoming = { day: world.day + days, qty };
        }
    }

    // 4) Rotación de objetos excepcionales
    if (shop.rotating) rotate(world, ctx, shop, state, rng, report);

    // 5) Las consignas (lo que vendió el jugador) se retiran al agotarse
    for (const [itemId, entry] of Object.entries(state.stock)) {
        if (entry.consigned && entry.qty === 0) {
            delete state.stock[itemId];
            delete state.history[itemId];
        }
    }
}

function rotate(world, ctx, shop, state, rng, report) {
    const { slots = 2, chance = 0.3, rules = [], stayDays = [8, 16] } = shop.rotating;
    for (const [itemId, entry] of Object.entries(state.stock)) {
        if (!entry.rotating) continue;
        if (entry.qty === 0 || world.day > entry.expires) {
            if (entry.qty > 0) report.push({ type: 'gone', shopId: shop.id, itemId, expired: true });
            delete state.stock[itemId];
            delete state.history[itemId];
        }
    }
    let used = Object.values(state.stock).filter((e) => e.rotating).length;
    while (used < slots && rng.chance(chance)) {
        const pool = ctx.catalog.list.filter((item) => item.forSale && !state.stock[item.id] && rules.some((r) => matchesRule(item, r)));
        const item = rng.weighted(pool, (i) => ROTATION_WEIGHT[i.rarity] ?? 1);
        if (!item) break;
        state.stock[item.id] = { qty: 1, target: 1, rotating: true, incoming: null, since: world.day, expires: world.day + rng.int(stayDays[0], stayDays[1]) };
        report.push({ type: 'new-item', shopId: shop.id, itemId: item.id });
        used += 1;
    }
}

function recordHistory(world, ctx) {
    for (const shop of ctx.shopList) {
        const state = world.shops[shop.id];
        for (const itemId of Object.keys(state.stock)) {
            const price = marketPrice(world, ctx, shop.id, itemId);
            const history = (state.history[itemId] ??= []);
            if (history.length && history[history.length - 1][0] === world.day) history.pop();
            history.push([world.day, price]);
            if (history.length > HISTORY_DAYS) history.splice(0, history.length - HISTORY_DAYS);
        }
    }
}

function purgeDaily(world) {
    for (const [key, deal] of Object.entries(world.deals)) if (deal.day < world.day) delete world.deals[key];
    for (const [key, haggle] of Object.entries(world.haggles)) if (haggle.day < world.day) delete world.haggles[key];
}

/** Avanza `days` días. Devuelve { world, report } con las novedades. */
export function advanceDays(world, ctx, days = 1) {
    let next = cloneWorld(world);
    const report = [];
    const total = Math.max(0, Math.min(60, Math.trunc(days)));
    for (let i = 0; i < total; i += 1) {
        next.day += 1;
        const rng = createRng(next.seed, 'world', next.day);
        endEvents(next, report);
        startEvents(next, ctx, rng, report);
        for (const shop of ctx.shopList) {
            if (next.shops[shop.id]) simulateShopDay(next, ctx, shop, report);
        }
        recordHistory(next, ctx);
        purgeDaily(next);
    }
    next = reconcileWorld(next, ctx);
    return { world: next, report: compactReport(report, next) };
}

/** Quita novedades contradictorias (p. ej. llegó y se agotó el mismo lote). */
function compactReport(report, world) {
    const seen = new Set();
    const result = [];
    for (let i = report.length - 1; i >= 0; i -= 1) {
        const r = report[i];
        const key = `${r.type}|${r.shopId ?? ''}|${r.itemId ?? r.eventId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (r.type === 'new-item' && !world.shops[r.shopId]?.stock[r.itemId]) continue;
        result.unshift(r);
    }
    return result;
}

/** Crea un mundo nuevo, con unos días de "rodaje" para que no empiece todo lleno y plano. */
export function createWorld(ctx, { seed = Date.now().toString(36), warmupDays = 10 } = {}) {
    let world = emptyWorld(seed);
    world.day = 1 - warmupDays;
    world = reconcileWorld(world, ctx);
    for (const shop of ctx.shopList) world.shops[shop.id].cash = shop.cash ?? 0;
    world = advanceDays(world, ctx, warmupDays).world;
    if (!world.events.some((e) => e.end >= world.day) && ctx.events.size) {
        // Un primer evento para que el mercado tenga vida desde el comienzo.
        const rng = createRng(world.seed, 'first-event');
        const def = rng.weighted([...ctx.events.values()].filter((d) => !d.closes?.length));
        if (def) {
            world.events.push({ id: def.id, start: world.day - 1, end: world.day + rng.int(def.duration?.[0] ?? 3, def.duration?.[1] ?? 6) });
            recordHistory(world, ctx);
        }
    }
    world.ledger = [];
    return world;
}

