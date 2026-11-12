/**
 * Dónde está cada comerciante y cuándo atiende.
 *
 * - Fijos: `presence.location`.
 * - Errantes: `presence.route` + `gap`. Su posición se CALCULA a partir de la
 *   semilla del mundo y el día (no se guarda nada): todos los jugadores de la
 *   campaña la ven igual y no hay estado que se desincronice.
 * - Horarios: `schedule.phases` (franjas), `schedule.weekdays` (días de la
 *   semana) y `schedule.events` (sólo durante esos eventos).
 *
 * El jugador también tiene una posición (por personaje) y sólo puede hablar
 * con quien esté en su misma ubicación.
 */

import { createRng } from './rng.js';
import { cloneWorld } from './state.js';
import { activeEvents } from './world-events.js';

const ROUTE_ANCHOR = -60; // las rutas empiezan antes del primer día (el mundo «rueda» al crearse)
const cache = new Map();

export function phaseOf(world, ctx) {
    return ctx.phases[world.phase ?? 0] ?? ctx.phases[0];
}

export function weekdayIndex(day, ctx) {
    const n = ctx.weekdays?.length || 7;
    return (((day - 1) % n) + n) % n;
}

export function weekdayName(day, ctx) {
    return ctx.weekdays?.[weekdayIndex(day, ctx)] ?? `Día ${weekdayIndex(day, ctx) + 1}`;
}

/** Posición de un errante el día `day`: { location|null, next, arrivesIn, leavesIn }. */
export function errantPosition(seed, keeper, day) {
    const route = keeper.presence?.route ?? [];
    if (!route.length) return { location: null };
    const key = `${seed}|${keeper.id}|${day}`;
    if (cache.has(key)) return cache.get(key);
    const [gMin, gMax] = keeper.presence.gap ?? [1, 2];
    let cursor = ROUTE_ANCHOR;
    let idx = createRng(seed, 'errant-start', keeper.id).int(0, route.length - 1);
    let leg = 0;
    let result = null;
    while (!result && leg < 2000) {
        const rng = createRng(seed, 'errant', keeper.id, leg);
        const [sMin, sMax] = route[idx].stay ?? [2, 3];
        const stay = rng.int(sMin, sMax);
        if (day < cursor + stay) {
            result = { location: route[idx].location, leavesIn: cursor + stay - day, next: route[(idx + 1) % route.length].location };
            break;
        }
        cursor += stay;
        const gap = rng.int(gMin, gMax);
        if (day < cursor + gap) {
            result = { location: null, next: route[(idx + 1) % route.length].location, arrivesIn: cursor + gap - day };
            break;
        }
        cursor += gap;
        idx = (idx + 1) % route.length;
        leg += 1;
    }
    result ??= { location: null };
    if (cache.size > 5000) cache.clear();
    cache.set(key, result);
    return result;
}

/** Ubicación del comerciante (hoy): id o null si está de viaje. */
export function keeperLocation(world, ctx, keeper, day = world.day) {
    if (!keeper) return null;
    // Un comerciante contratado y trasladado trabaja donde lo puso quien lo contrató.
    const contract = world.contracts?.[keeper.id];
    if (contract?.status === 'active' && contract.location && ctx.location(contract.location)) return contract.location;
    if (keeper.presence?.route) return errantPosition(world.seed, keeper, day).location;
    if (keeper.presence?.location) return keeper.presence.location;
    return ctx.hasMap ? null : ctx.startLocation;
}

export function regionOfLocation(ctx, locationId) {
    return ctx.location(locationId)?.regionId ?? null;
}

/** Región en la que opera hoy una tienda (la de su comerciante). */
export function shopRegion(world, ctx, shopId, day = world.day) {
    const keeper = ctx.keeperOf(shopId);
    const loc = keeperLocation(world, ctx, keeper, day);
    if (loc) return regionOfLocation(ctx, loc);
    // De viaje: se usa la región del último tramo conocido (la del próximo destino).
    const next = keeper?.presence?.route ? errantPosition(world.seed, keeper, day).next : null;
    return next ? regionOfLocation(ctx, next) : null;
}

function joinLabels(list) {
    return list.length <= 1 ? list.join('') : `${list.slice(0, -1).join(', ')} y ${list[list.length - 1]}`;
}

/**
 * ¿Atiende ahora? { here, open, location, reason, travel }
 *  here: está en esa ubicación hoy (aunque cierre a esta hora)
 *  open: se puede hablar y comerciar ahora mismo
 */
export function availability(world, ctx, keeper, { day = world.day, phase = world.phase ?? 0 } = {}) {
    if (!keeper) return { here: false, open: false, location: null, reason: 'No hay nadie.' };
    const location = keeperLocation(world, ctx, keeper, day);
    const sched = keeper.schedule ?? {};
    const active = activeEvents(world, ctx, day);
    if (sched.events?.length && !active.some((e) => sched.events.includes(e.def.id))) {
        const names = sched.events.map((id) => ctx.events.get(id)?.name ?? id);
        return { here: false, open: false, location, reason: `Sólo viene durante: ${joinLabels(names)}.` };
    }
    if (!location) {
        const pos = keeper.presence?.route ? errantPosition(world.seed, keeper, day) : {};
        const next = pos.next ? ctx.location(pos.next)?.name : null;
        return { here: false, open: false, location: null, travel: pos, reason: next ? `De viaje: llegará a ${next} en ${pos.arrivesIn} día${pos.arrivesIn === 1 ? '' : 's'}.` : 'De viaje.' };
    }
    const shop = ctx.shopOf(keeper.id);
    const closure = shop ? active.find(({ def }) => (def.closes ?? []).includes(shop.id)) : null;
    if (closure) return { here: true, open: false, location, reason: `${closure.def.name}: hoy no abre.` };
    if (sched.weekdays?.length && !sched.weekdays.includes(weekdayIndex(day, ctx))) {
        return { here: true, open: false, location, reason: `Los ${weekdayName(day, ctx)} no abre.` };
    }
    const phaseId = ctx.phases[phase]?.id;
    if (sched.phases?.length && !sched.phases.includes(phaseId)) {
        if (sched.hoursLabel) return { here: true, open: false, location, reason: `Ahora no atiende: abre de ${sched.hoursLabel}.` };
        const labels = sched.phases.map((id) => ctx.phases.find((p) => p.id === id)?.label?.toLowerCase() ?? id);
        return { here: true, open: false, location, reason: `Ahora no atiende: sólo por la ${joinLabels(labels)}.` };
    }
    const travel = keeper.presence?.route ? errantPosition(world.seed, keeper, day) : null;
    return { here: true, open: true, location, travel, reason: null };
}

// ─────────────────────────── el jugador ───────────────────────────

export function playerLocation(world, ctx, charId) {
    const loc = world.positions?.[charId ?? '_'];
    return loc && ctx.location(loc) ? loc : ctx.startLocation;
}

export function discoveredOf(world, charId) {
    return world.discovered?.[charId ?? '_'] ?? { locations: [], keepers: [] };
}

export function isLocationVisible(world, ctx, charId, locationId) {
    const loc = ctx.location(locationId);
    if (!loc) return false;
    return !loc.hidden || discoveredOf(world, charId).locations.includes(locationId);
}

/** Marca como descubierta una ubicación o un comerciante. Muta `world` (clonado). */
export function discover(world, charId, { location = null, keeper = null }) {
    const key = charId ?? '_';
    world.discovered ??= {};
    const d = (world.discovered[key] ??= { locations: [], keepers: [] });
    let changed = false;
    if (location && !d.locations.includes(location)) { d.locations.push(location); changed = true; }
    if (keeper && !d.keepers.includes(keeper)) { d.keepers.push(keeper); changed = true; }
    return changed;
}

/** Mapa visible para el personaje: regiones → ubicaciones (con cuántos comerciantes hay). */
export function visibleMap(world, ctx, charId) {
    const here = playerLocation(world, ctx, charId);
    const out = [];
    for (const region of ctx.regions.values()) {
        const locations = (region.locations ?? [])
            .filter((loc) => isLocationVisible(world, ctx, charId, loc.id))
            .map((loc) => ({ ...loc, regionId: region.id, here: loc.id === here, merchants: merchantsAt(world, ctx, loc.id, charId).filter((m) => m.status.here).length }));
        if (locations.length) out.push({ ...region, locations });
    }
    return out;
}

/** Comerciantes en una ubicación hoy (con su disponibilidad). */
export function merchantsAt(world, ctx, locationId, charId) {
    const out = [];
    for (const keeper of ctx.keepers.values()) {
        if (keeperLocation(world, ctx, keeper) !== locationId) continue;
        // Comerciantes secretos: sólo para quien los descubrió (por un secreto o un rumor).
        if (keeper.secret && !discoveredOf(world, charId).keepers.includes(keeper.id)) continue;
        const status = availability(world, ctx, keeper);
        if (!status.here) continue;
        out.push({ keeper, shop: ctx.shopOf(keeper.id), status });
    }
    return out;
}

/** ¿Puede el personaje viajar a esa ubicación? */
export function canTravel(world, ctx, charId, locationId, { isDm = false } = {}) {
    if (!ctx.location(locationId)) return { ok: false, message: 'Ese lugar no existe.' };
    if (!isLocationVisible(world, ctx, charId, locationId)) return { ok: false, message: 'No conoces ese lugar.' };
    const from = regionOfLocation(ctx, playerLocation(world, ctx, charId));
    const to = regionOfLocation(ctx, locationId);
    if (from !== to && world.settings?.freeTravel === false && !isDm) {
        return { ok: false, message: 'El DM controla los viajes entre regiones en esta campaña.' };
    }
    return { ok: true };
}

/** Mueve al personaje. Devuelve { world } o { error }. */
export function travel(world, ctx, { charId, locationId, isDm = false }) {
    const ok = canTravel(world, ctx, charId, locationId, { isDm });
    if (!ok.ok) return { error: ok.message };
    const next = cloneWorld(world);
    next.positions[charId ?? '_'] = locationId;
    return { world: next };
}
