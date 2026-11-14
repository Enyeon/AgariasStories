/**
 * Progresión por pisos (p. ej. Lord 100): el mundo económico se abre a medida
 * que los jugadores suben.
 *
 * `world.progress = { enabled, current, done: {keeperId: true}, overrides: {keeperId: 'open'|'closed'}, log }`
 * (sólo el DM lo cambia; el servidor lo hace cumplir).
 *
 * Cada comerciante pertenece a un piso: el suyo (`keeper.floor`) o el de la
 * región donde está (`region.floor`). Sin piso, existe siempre. Llegar a un
 * piso abre su CONTENIDO, pero cada negocio puede pedir además un requisito
 * (`keeper.requirement`) que el DM marca como cumplido. Los pisos anteriores
 * siguen abiertos salvo que el DM cierre un negocio o tenga `untilFloor`.
 *
 * Estados de un negocio:
 *   abierto      🟢 piso alcanzado y sin requisitos pendientes
 *   especial     ⭐ negocio especial/temporal disponible
 *   condicionado 🔒 piso alcanzado, requisito pendiente (se ve, no atiende)
 *   bloqueado    ⛔ piso superior (no se ve)
 *   cerrado      ✖ cerrado por el DM o porque ya pasó su piso
 */

import { cloneWorld } from './state.js';

export const STATES = Object.freeze({
    abierto: { icon: '🟢', label: 'Desbloqueado' },
    especial: { icon: '⭐', label: 'Especial' },
    condicionado: { icon: '🔒', label: 'Requisito pendiente' },
    bloqueado: { icon: '⛔', label: 'Bloqueado' },
    cerrado: { icon: '✖', label: 'Cerrado' },
});

const EMPTY = Object.freeze({ enabled: false, current: 1, done: {}, overrides: {}, log: [] });

export function progressOf(world) {
    return { ...EMPTY, ...(world?.progress ?? {}) };
}

/** Piso vigente para el mundo (Infinity si la progresión está apagada: todo existe). */
export function currentFloor(world) {
    const p = progressOf(world);
    return p.enabled ? p.current : Infinity;
}

/** Piso de una región (o null). */
export const regionFloor = (ctx, regionId) => ctx.regions.get(regionId)?.floor ?? null;

/** Piso de una ubicación: el de su región. */
export function locationFloor(ctx, locationId) {
    const r = ctx.location(locationId)?.regionId ?? null;
    return r ? regionFloor(ctx, r) : null;
}

/** Piso de un comerciante: el suyo o el de su lugar habitual (los errantes, el de su primera parada). */
export function keeperFloor(ctx, keeper) {
    if (keeper?.floor) return keeper.floor;
    const home = keeper?.presence?.location ?? keeper?.presence?.route?.[0]?.location;
    return home ? locationFloor(ctx, home) : null;
}

/** ¿Está ya disponible esa ubicación? (los pisos superiores no se ven ni se viaja a ellos) */
export function locationUnlocked(world, ctx, locationId) {
    const f = locationFloor(ctx, locationId);
    return !f || f <= currentFloor(world);
}

/** Estado de un negocio según el piso, su requisito y lo que haya decidido el DM. */
export function businessStatus(world, ctx, keeper) {
    const p = progressOf(world);
    const floor = keeperFloor(ctx, keeper);
    const requirement = keeper?.requirement ? { text: keeper.requirement, done: Boolean(p.done?.[keeper.id]) } : null;
    const base = { floor, requirement, special: Boolean(keeper?.special), untilFloor: keeper?.untilFloor ?? null, forced: null };
    const out = (state, reason = null) => ({ ...base, state, reason, ...STATES[state], open: state === 'abierto' || state === 'especial' });
    const override = p.overrides?.[keeper?.id];
    if (override === 'closed') return { ...out('cerrado', 'Cerrado por el DM.'), forced: 'closed' };
    if (override === 'open') return { ...out(keeper?.special ? 'especial' : 'abierto'), forced: 'open' };
    if (!p.enabled) return out(keeper?.special ? 'especial' : 'abierto');
    if (floor && floor > p.current) return out('bloqueado', `Aparece en el piso ${floor}.`);
    if (base.untilFloor && p.current > base.untilFloor) return out('cerrado', `Sólo estaba hasta el piso ${base.untilFloor}.`);
    if (requirement && !requirement.done) return out('condicionado', `Requisito: ${requirement.text}`);
    return out(keeper?.special ? 'especial' : 'abierto');
}

/** Todos los negocios agrupados por estado (para el DM y para el panel del jugador). */
export function businessesByState(world, ctx) {
    const groups = { abierto: [], especial: [], condicionado: [], bloqueado: [], cerrado: [] };
    for (const keeper of ctx.keepers.values()) {
        const status = businessStatus(world, ctx, keeper);
        groups[status.state].push({ keeper, shop: ctx.shopOf(keeper.id), status });
    }
    const byFloor = (a, b) => (a.status.floor ?? 0) - (b.status.floor ?? 0) || a.keeper.name.localeCompare(b.keeper.name, 'es');
    for (const list of Object.values(groups)) list.sort(byFloor);
    return groups;
}

/** Pisos con contenido definido (comerciantes o regiones), ordenados. */
export function definedFloors(ctx) {
    const set = new Set();
    for (const k of ctx.keepers.values()) { const f = keeperFloor(ctx, k); if (f) set.add(f); }
    for (const r of ctx.regions.values()) if (r.floor) set.add(r.floor);
    return [...set].sort((a, b) => a - b);
}

function mutate(world, fn) {
    const next = cloneWorld(world);
    next.progress = { ...progressOf(world), done: { ...(world.progress?.done ?? {}) }, overrides: { ...(world.progress?.overrides ?? {}) }, log: [...(world.progress?.log ?? [])] };
    fn(next.progress, next);
    return next;
}

export function setProgressEnabled(world, enabled) {
    return { world: mutate(world, (p) => { p.enabled = Boolean(enabled); }) };
}

/**
 * «Los jugadores llegaron al piso N». Devuelve qué negocios pasaron a estar
 * abiertos o condicionados (para avisar), sin tocar los de pisos anteriores.
 */
export function setFloor(world, ctx, floor) {
    const to = Math.max(1, Math.min(999, Math.round(Number(floor) || 1)));
    const before = new Map([...ctx.keepers.values()].map((k) => [k.id, businessStatus(world, ctx, k).state]));
    const next = mutate(world, (p, w) => {
        p.enabled = true;
        if (p.current !== to) p.log.unshift({ day: w.day, from: p.current, to });
        p.log = p.log.slice(0, 50);
        p.current = to;
    });
    const opened = [];
    const conditioned = [];
    for (const keeper of ctx.keepers.values()) {
        const now = businessStatus(next, ctx, keeper).state;
        if (before.get(keeper.id) !== 'bloqueado') continue;
        if (now === 'abierto' || now === 'especial') opened.push(keeper);
        else if (now === 'condicionado') conditioned.push(keeper);
    }
    return { world: next, result: { floor: to, opened, conditioned } };
}

/** El DM marca un requisito como cumplido (o lo vuelve a dejar pendiente). */
export function setRequirementDone(world, keeperId, done = true) {
    return { world: mutate(world, (p) => { if (done) p.done[keeperId] = true; else delete p.done[keeperId]; }) };
}

/** Excepción del DM: forzar abierto, forzar cerrado o volver a lo automático (null). */
export function setOverride(world, keeperId, mode) {
    return { world: mutate(world, (p) => { if (mode === 'open' || mode === 'closed') p.overrides[keeperId] = mode; else delete p.overrides[keeperId]; }) };
}
