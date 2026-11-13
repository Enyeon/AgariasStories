/**
 * Empleados del jugador (vendedor, constructor, explorador… y los que vengan).
 *
 *   world.staff[id] = {
 *     id, owner, role, name, skill (0..1), wage (pc por día), period ('dia'|'semana'),
 *     share (0..0.5: parte de las ventas diarias del negocio donde trabaja),
 *     hiredDay, until (día o null = indefinido), status ('active'|'quit'|'ended'),
 *     assignment (plotId | null), task (exploración en curso | null),
 *     satisfaction (0..100), owed (salario pendiente, pc), sickUntil, log[]
 *   }
 *
 * PAGO: el día de cobro (cada día o cada 7) el salario sale de la caja del
 * negocio donde trabaja; si no hay caja o no alcanza, queda como deuda que el
 * jugador paga en persona. Impagos y sobrecarga bajan la satisfacción; por
 * debajo de 15, renuncia.
 *
 * EXPLORACIÓN: el sistema tira un resultado (éxito, fracaso, descubrimiento)
 * pero NO lo entrega al jugador: crea un informe en `world.reports` que el DM
 * confirma o cambia. Sólo entonces lo ve el jugador.
 */

import { cloneWorld } from './state.js';
import { createRng } from './rng.js';
import { regionOfLocation, isLocationVisible, discover } from './presence.js';
import { pay, coinsInCp, formatCp } from '../money.js';

export const PERIODS = Object.freeze({ dia: 'Cada día', semana: 'Cada semana (7 días)' });
const LOG_LIMIT = 15;
const CANDIDATES = 3;
const MAX_STAFF = 12;

const roleOf = (ctx, id) => ctx.estate?.roles?.get(id) ?? null;
const log = (emp, day, text) => { emp.log = [{ day, text }, ...(emp.log ?? [])].slice(0, LOG_LIMIT); };

export function staffOf(world, charId) {
    return Object.values(world.staff ?? {}).filter((s) => s.owner === (charId ?? '_') && s.status === 'active');
}

/**
 * Tablón de empleo de un lugar: candidatos que cambian cada semana (iguales
 * para todos los jugadores, deterministas). Los ya contratados no aparecen.
 */
export function candidatesAt(world, ctx, locationId) {
    const roles = [...(ctx.estate?.roles?.values() ?? [])];
    if (!roles.length) return [];
    const week = Math.floor((world.day - 1) / 7);
    const names = ctx.estate.names ?? ['Anónimo'];
    const surnames = ctx.estate.surnames ?? [''];
    const out = [];
    for (let i = 0; i < CANDIDATES; i++) {
        const key = `${locationId}:${week}:${i}`;
        if (world.staff?.[`emp-${key}`]) continue;
        const rng = createRng(world.seed, 'candidato', key);
        const role = roles[rng.int(0, roles.length - 1)];
        const skill = Math.round(rng.range(0.15, 0.95) * 100) / 100;
        const [min, max] = role.wage ?? [30, 80];
        out.push({ key, role: role.id, roleLabel: role.label, icon: role.icon, name: `${rng.pick(names)} ${rng.pick(surnames)}`.trim(), skill, wage: Math.round(min + (max - min) * skill), location: locationId });
    }
    return out;
}

export function hireStaff(world, ctx, { charId, candidateKey, here, period = 'dia', days = null, share = 0, assignment = null }) {
    const [locationId] = String(candidateKey ?? '').split(':');
    if (here !== undefined && here !== null && here !== locationId) return { error: 'Hay que contratar en persona, en el lugar del tablón.' };
    const cand = candidatesAt(world, ctx, locationId).find((c) => c.key === candidateKey);
    if (!cand) return { error: 'Ese candidato ya no está disponible.' };
    if (staffOf(world, charId).length >= MAX_STAFF) return { error: `Ya tienes ${MAX_STAFF} empleados: despide a alguien antes.` };
    const w = cloneWorld(world);
    w.staff ??= {};
    const id = `emp-${cand.key}`;
    w.staff[id] = {
        id, owner: charId ?? '_', role: cand.role, name: cand.name, skill: cand.skill, wage: cand.wage,
        period: Object.hasOwn(PERIODS, period) ? period : 'dia',
        share: Math.max(0, Math.min(0.5, Number(share) || 0)),
        hiredDay: w.day, until: days ? w.day + Math.max(1, Math.trunc(days)) : null,
        status: 'active', assignment: null, task: null, satisfaction: 60, owed: 0, sickUntil: 0, log: [],
    };
    log(w.staff[id], w.day, `Contratado como ${roleOf(ctx, cand.role)?.label ?? cand.role}.`);
    if (assignment) {
        const res = assignStaff(w, ctx, { charId, staffId: id, plotId: assignment });
        if (res.error) return res;
        return { world: res.world, result: { text: `${cand.name} trabaja para ti desde hoy.`, staffId: id } };
    }
    return { world: w, result: { text: `${cand.name} trabaja para ti desde hoy.`, staffId: id } };
}

function own(world, charId, staffId) {
    const emp = world.staff?.[staffId];
    if (!emp || emp.owner !== (charId ?? '_') || emp.status !== 'active') return null;
    return emp;
}

/** Asignar a una propiedad tuya (vendedor al negocio, constructor a las obras). */
export function assignStaff(world, ctx, { charId, staffId, plotId }) {
    const emp = own(world, charId, staffId);
    if (!emp) return { error: 'Ese empleado no trabaja para ti.' };
    if (plotId && world.estate?.properties?.[plotId]?.owner !== (charId ?? '_')) return { error: 'Esa propiedad no es tuya.' };
    if (emp.task) return { error: `${emp.name} está fuera explorando.` };
    const w = cloneWorld(world);
    w.staff[staffId].assignment = plotId || null;
    log(w.staff[staffId], w.day, plotId ? `Asignado a ${ctx.estate?.plots?.get(plotId)?.name ?? plotId}.` : 'Sin destino fijo.');
    return { world: w };
}

/** Cambiar condiciones (salario, forma de pago, parte de beneficios, duración). */
export function updateTerms(world, ctx, { charId, staffId, wage, period, share, days }) {
    const emp = own(world, charId, staffId);
    if (!emp) return { error: 'Ese empleado no trabaja para ti.' };
    const w = cloneWorld(world);
    const e = w.staff[staffId];
    if (wage !== undefined) {
        const n = Math.max(1, Math.round(Number(wage) || e.wage));
        e.satisfaction = Math.max(0, Math.min(100, e.satisfaction + Math.round(((n - e.wage) / Math.max(1, e.wage)) * 40)));
        e.wage = n;
    }
    if (period !== undefined && Object.hasOwn(PERIODS, period)) e.period = period;
    if (share !== undefined) {
        const s = Math.max(0, Math.min(0.5, Number(share) || 0));
        e.satisfaction = Math.max(0, Math.min(100, e.satisfaction + Math.round((s - e.share) * 60)));
        e.share = s;
    }
    if (days !== undefined) e.until = days ? w.day + Math.max(1, Math.trunc(days)) : null;
    log(e, w.day, `Nuevas condiciones: ${formatCp(e.wage)}/día, ${PERIODS[e.period].toLowerCase()}, ${Math.round(e.share * 100)} % de beneficios.`);
    return { world: w };
}

/** Pagar en persona lo que se le debe. */
export function payStaff(world, ctx, { charId, staffId, character }) {
    const emp = own(world, charId, staffId);
    if (!emp) return { error: 'Ese empleado no trabaja para ti.' };
    if (!emp.owed) return { error: 'No le debes nada.' };
    const res = pay(character.equipment.coins, emp.owed);
    if (!res.ok) return { error: `Le debes ${formatCp(emp.owed)} y no te alcanza (tienes ${formatCp(coinsInCp(character.equipment.coins))}).` };
    const next = structuredClone(character);
    next.equipment.coins = res.coins;
    const w = cloneWorld(world);
    const e = w.staff[staffId];
    log(e, w.day, `Cobra lo que se le debía (${formatCp(e.owed)}).`);
    e.owed = 0;
    e.satisfaction = Math.min(100, e.satisfaction + 8);
    return { world: w, character: next };
}

/** Despedir (la deuda hay que pagarla antes). */
export function dismissStaff(world, ctx, { charId, staffId }) {
    const emp = own(world, charId, staffId);
    if (!emp) return { error: 'Ese empleado no trabaja para ti.' };
    if (emp.owed > 0) return { error: `Antes de despedirle, págale lo que le debes (${formatCp(emp.owed)}).` };
    const w = cloneWorld(world);
    w.staff[staffId].status = 'ended';
    w.staff[staffId].assignment = null;
    log(w.staff[staffId], w.day, 'Despedido.');
    return { world: w };
}

// ─────────────────────────── exploración ───────────────────────────

export function sendExplorer(world, ctx, { charId, staffId, target, objective = '', days = 3 }) {
    const emp = own(world, charId, staffId);
    if (!emp) return { error: 'Ese empleado no trabaja para ti.' };
    if (emp.role !== 'explorador') return { error: 'Sólo un explorador puede salir a explorar.' };
    if (emp.task) return { error: `${emp.name} ya está explorando.` };
    const region = ctx.regions.get(target);
    const loc = ctx.location(target);
    if (!region && !(loc && isLocationVisible(world, ctx, charId, target))) return { error: 'Elige una región o un lugar que conozcas.' };
    const n = Math.max(1, Math.min(30, Math.trunc(Number(days) || 3)));
    const w = cloneWorld(world);
    const e = w.staff[staffId];
    e.task = { type: 'explore', target, objective: String(objective).trim().slice(0, 300), start: w.day, ends: w.day + n };
    e.assignment = null;
    log(e, w.day, `Sale a explorar ${region?.name ?? loc?.name} durante ${n} días.`);
    return { world: w, result: { text: `${e.name} parte hacia ${region?.name ?? loc?.name}. Volverá en ${n} días.` } };
}

function explorationOutcome(world, ctx, emp) {
    const regionId = ctx.regions.get(emp.task.target) ? emp.task.target : regionOfLocation(ctx, emp.task.target);
    const danger = Number(ctx.regions.get(regionId)?.danger) || 0;
    const rng = createRng(world.seed, 'explora', emp.id, emp.task.start);
    const d20 = rng.int(1, 20);
    const total = d20 + Math.round(emp.skill * 8) + Math.min(3, Math.floor((emp.task.ends - emp.task.start) / 3));
    const dc = 10 + danger * 2;
    const outcome = d20 === 20 || total >= dc + 6 ? 'descubrimiento' : total >= dc ? 'exito' : 'fracaso';
    // Sugerencias para el DM: lugares ocultos de la zona que aún no conoce el jugador y rumores de la región.
    const hidden = [...ctx.locations.values()].filter((l) => l.regionId === regionId && l.hidden && !isLocationVisible(world, ctx, emp.owner, l.id)).map((l) => l.id);
    const rumors = [...ctx.rumors.values()].filter((r) => r.region === regionId).map((r) => r.id);
    const hurt = outcome === 'fracaso' && d20 <= 3 && danger >= 3;
    return { outcome, d20, total, dc, regionId, suggestions: { locations: hidden, rumors: rumors.length ? [rumors[rng.int(0, rumors.length - 1)]] : [] }, hurt };
}

const OUTCOME_TEXT = {
    descubrimiento: 'Vuelve entusiasmado: ha encontrado algo importante.',
    exito: 'Vuelve con información útil.',
    fracaso: 'Vuelve con las manos vacías.',
};

/** El DM confirma (o cambia) lo que encontró el explorador. */
export function resolveReport(world, ctx, { reportId, text, outcome = null, revealLocation = null, rumorId = null }) {
    const idx = (world.reports ?? []).findIndex((r) => r.id === reportId);
    if (idx < 0) return { error: 'Ese informe no existe.' };
    if (world.reports[idx].status !== 'pendiente') return { error: 'Ese informe ya está resuelto.' };
    const w = cloneWorld(world);
    const r = w.reports[idx];
    r.status = 'confirmado';
    r.resolvedDay = w.day;
    r.final = { outcome: outcome || r.outcome, text: String(text ?? '').trim().slice(0, 2000) || OUTCOME_TEXT[outcome || r.outcome] };
    if (revealLocation && ctx.location(revealLocation)) {
        discover(w, r.charId === '_' ? null : r.charId, { location: revealLocation });
        r.final.revealed = revealLocation;
    }
    if (rumorId && ctx.rumors.get(rumorId)) {
        const key = r.charId;
        w.journal ??= {};
        const list = (w.journal[key] ??= []);
        if (!list.some((j) => j.rumorId === rumorId)) list.unshift({ rumorId, keeperId: null, day: w.day, age: null, verdict: null, from: r.staffName });
        r.final.rumor = rumorId;
    }
    return { world: w };
}

export function reportsFor(world, charId) {
    return (world.reports ?? []).filter((r) => r.charId === (charId ?? '_'));
}
export function pendingReports(world) {
    return (world.reports ?? []).filter((r) => r.status === 'pendiente');
}

// ─────────────────────────── el día a día ───────────────────────────

const EVENTS = [
    { id: 'sick', chance: 0.02, apply: (e, w, rng) => { e.sickUntil = w.day + rng.int(1, 3); return 'Se pone enfermo y no trabajará unos días.'; } },
    { id: 'raise', chance: 0.015, when: (e) => e.satisfaction < 70, apply: (e) => { e.satisfaction -= 5; return `Pide un aumento de sueldo (cobra ${formatCp(e.wage)}/día).`; } },
    { id: 'great', chance: 0.03, apply: (e) => { e.satisfaction = Math.min(100, e.satisfaction + 4); e.skill = Math.min(1, Math.round((e.skill + 0.02) * 100) / 100); return 'Tiene un gran día y aprende algo del oficio.'; } },
];

/** Simulación diaria de los empleados (la llama advanceDays). */
export function simulateStaff(world, ctx, report) {
    for (const e of Object.values(world.staff ?? {})) {
        if (e.status !== 'active') continue;
        const rng = createRng(world.seed, 'staff', e.id, world.day);
        // Fin de contrato
        if (e.until && world.day > e.until) {
            if (!e.owed) {
                e.status = 'ended';
                e.assignment = null;
                log(e, world.day, 'Termina su contrato.');
                report.push({ type: 'staff-ended', charId: e.owner, staffId: e.id });
                continue;
            }
        }
        // Día de cobro: de la caja del negocio si la hay; si no, deuda.
        const payday = e.period === 'semana' ? (world.day - e.hiredDay) % 7 === 0 : true;
        if (payday && world.day > e.hiredDay) {
            const amount = e.wage * (e.period === 'semana' ? 7 : 1);
            const biz = e.assignment ? world.estate?.properties?.[e.assignment]?.business : null;
            if (biz && biz.cash >= amount + (e.owed ?? 0)) {
                biz.cash -= amount + (e.owed ?? 0);
                if (e.owed) log(e, world.day, `Cobra también lo atrasado (${formatCp(e.owed)}).`);
                e.owed = 0;
                e.satisfaction = Math.min(100, e.satisfaction + 1);
            } else {
                e.owed = (e.owed ?? 0) + amount;
                e.satisfaction = Math.max(0, e.satisfaction - (e.period === 'semana' ? 12 : 3));
                if (e.owed >= amount * (e.period === 'semana' ? 2 : 7)) log(e, world.day, `Se le deben ${formatCp(e.owed)} y empieza a impacientarse.`);
            }
        }
        // Parte de las ventas del día en el negocio donde trabaja (se reparte a diario).
        const shop = e.assignment ? world.estate?.properties?.[e.assignment]?.business : null;
        if (shop && e.share > 0 && shop.lastRevenue > 0) {
            const cut = Math.min(shop.cash, Math.round(shop.lastRevenue * e.share));
            shop.cash -= cut;
            e.earned = (e.earned ?? 0) + cut;
            if (cut > 0) e.satisfaction = Math.min(100, e.satisfaction + 1);
        }
        // Eventos
        for (const ev of EVENTS) {
            if ((!ev.when || ev.when(e)) && rng.chance(ev.chance)) {
                const text = ev.apply(e, world, rng);
                log(e, world.day, text);
                report.push({ type: 'staff-event', charId: e.owner, staffId: e.id, text: `${e.name}: ${text}` });
            }
        }
        // Exploración
        if (e.task?.type === 'explore' && e.task.ends <= world.day) {
            const res = explorationOutcome(world, ctx, e);
            world.reports ??= [];
            world.reports.unshift({
                id: `rep-${e.id}-${e.task.start}`, type: 'exploracion', status: 'pendiente', day: world.day,
                charId: e.owner, staffId: e.id, staffName: e.name, target: e.task.target, objective: e.task.objective,
                outcome: res.outcome, roll: { d20: res.d20, total: res.total, dc: res.dc }, suggestions: res.suggestions, hurt: res.hurt,
                proposal: `${OUTCOME_TEXT[res.outcome]}${res.hurt ? ' Además, vuelve herido.' : ''}`,
            });
            world.reports = world.reports.slice(0, 60);
            if (res.hurt) e.sickUntil = world.day + 3;
            log(e, world.day, 'Vuelve de explorar. El DM revisará su informe.');
            report.push({ type: 'exploration-back', charId: e.owner, staffId: e.id });
            e.task = null;
        }
        // Renuncia
        if (e.satisfaction < 15) {
            e.status = 'quit';
            e.assignment = null;
            log(e, world.day, 'Renuncia: está harto.');
            report.push({ type: 'staff-quit', charId: e.owner, staffId: e.id, text: `${e.name} renuncia.` });
        }
    }
}
