/**
 * DISPOSICIÓN: el único motor que decide cómo te trata un comerciante.
 *
 *   Raza + Trasfondo + Personalidad + Facción + Región + Historia + Memoria
 *   + Situación del mundo  →  puntuación (−100..100) y nivel de relación
 *
 * De esa puntuación (y de las banderas de personalidad) salen el ajuste de
 * precios, la disposición a regatear, cuánto comparte, qué te reserva y si
 * directamente se niega a comerciar contigo. Precios, regateo, conversación
 * y vista consultan este módulo: no hay reglas de trato repartidas por ahí.
 *
 * Cada componente queda registrado como «razón» con su valor, para que la
 * interfaz pueda explicar el trato (las ocultas aparecen veladas hasta que el
 * jugador las descubre con Perspicacia).
 */

import { getRelation } from './state.js';
import { flagsOf, archetypesOf } from './personality.js';
import { perceivedProfile, matchesWhen } from './profile.js';
import { memoryWeights } from './memory.js';
import { activeEvents } from './world-events.js';
import { keeperLocation, regionOfLocation } from './presence.js';

export const TIERS = Object.freeze([
    { id: 'hostil', label: 'Hostil', icon: '😠', max: -60, color: '#c0392b' },
    { id: 'desconfiado', label: 'Desconfiado', icon: '🤨', max: -20, color: '#d35400' },
    { id: 'neutral', label: 'Neutral', icon: '😐', max: 19, color: '#9a8f7a' },
    { id: 'amistoso', label: 'Amistoso', icon: '🙂', max: 44, color: '#6fbf73' },
    { id: 'favorable', label: 'Favorable', icon: '😊', max: 74, color: '#3fa7a0' },
    { id: 'amigo', label: 'Amigo', icon: '🤝', max: 100, color: '#f2c14e' },
]);
const TIER_INDEX = Object.freeze(Object.fromEntries(TIERS.map((t, i) => [t.id, i])));

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

/**
 * Cómo afecta tu reputación con SU facción a un comerciante. Cada comerciante
 * puede cambiarlo en `keeper.reputation` (umbral de aliado/enemigo, si se niega
 * a comerciar con enemigos, cuánto mejora o empeora el precio).
 */
export const REPUTATION_DEFAULTS = Object.freeze({ weight: 0.3, good: 30, bad: -20, enemy: -60, refuseEnemies: false, goodPct: -0.08, badPct: 0.1 });
const tierKey = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function tierOf(score) {
    return TIERS.find((t) => score <= t.max) ?? TIERS[TIERS.length - 1];
}

/** ¿Alcanza `tier` el mínimo `min`? (acepta «Amistoso» o «amistoso») */
export function tierAtLeast(tier, min) {
    if (!min) return true;
    const need = TIER_INDEX[tierKey(min)];
    return need === undefined || TIER_INDEX[tier.id] >= need;
}

/** ¿Se aplica el filtro de comerciantes de una actitud de evento? */
function keeperFilter(filter, keeper, regionId) {
    if (!filter) return true;
    if (filter.ids && !filter.ids.includes(keeper.id)) return false;
    if (filter.race && keeper.race !== filter.race) return false;
    if (filter.faction && keeper.faction !== filter.faction) return false;
    if (filter.region && regionId !== filter.region) return false;
    return true;
}

function isStranger(rel) {
    return !rel.deals && !Object.keys(rel.memory ?? {}).length && !Object.keys(rel.told ?? {}).length;
}

/**
 * @param {{ keeper: object, charId: string|null, profile?: object|null }} who
 * @returns disposición completa (ver propiedades al final)
 */
export function evaluateDisposition(world, ctx, { keeper, charId = null, profile = null }) {
    const rel = getRelation(world, charId, keeper.id);
    const perceived = perceivedProfile(profile, rel);
    const flags = flagsOf(ctx, keeper);
    const events = activeEvents(world, ctx);
    const activeEventIds = events.map((e) => e.def.id);
    const regionId = regionOfLocation(ctx, keeperLocation(world, ctx, keeper));
    const reasons = [];
    const unlocks = new Set(rel.unlocks ?? []);
    const refusals = [];
    let share = 0;
    const add = (label, value, extra = {}) => { if (value) reasons.push({ label, value: Math.round(value), ...extra }); };

    // 1) Trato acumulado (tratos, charlas, regalos, ofensas…)
    add(rel.rep >= 0 ? 'Vuestro trato hasta ahora' : 'Vuestro trato hasta ahora', rel.rep, { icon: '🤝', source: 'relacion' });

    // 2) Carácter: arquetipos y predisposición propia
    for (const a of archetypesOf(ctx, keeper)) add(a.label, a.disposition ?? 0, { icon: a.icon, source: 'personalidad' });
    if (keeper.disposition) add(keeper.disposition < 0 ? 'Desconfía de todo el mundo' : 'Es afable por naturaleza', keeper.disposition, { icon: '🧭', source: 'personalidad' });
    if (flags.has('strangerWary') && isStranger(rel)) add('No te conoce de nada', -12, { icon: '🤨', source: 'personalidad' });

    // 3) Actitudes del comerciante (raza, clase, trasfondo, facción, origen…)
    (keeper.attitudes ?? []).forEach((att, i) => {
        if (!att || !matchesWhen(att.when, { perceived, rel, world, charId, activeEventIds })) return;
        const key = `att:${keeper.id}:${i}`;
        const hidden = Boolean(att.hidden) && !rel.known?.traits?.includes(key);
        add(att.label ?? 'Actitud', att.value ?? 0, { icon: (att.value ?? 0) >= 0 ? '👍' : '👎', hidden, key, source: 'actitud', realLabel: att.label });
        for (const id of att.effects?.unlock ?? []) unlocks.add(id);
        if (att.effects?.refuse) refusals.push(att.label ?? 'Se niega a tratar contigo');
        share += Number(att.effects?.share) || 0;
    });

    // 4) Facciones: reputación pública y pertenencia percibida
    let reputation = null;
    if (keeper.faction) {
        const fac = ctx.factions?.get(keeper.faction);
        const fname = fac?.name ?? keeper.faction;
        const cfg = { ...REPUTATION_DEFAULTS, ...(keeper.reputation ?? {}) };
        const standing = world.standing?.[charId ?? '_'] ?? {};
        const own = standing[keeper.faction] ?? 0;
        if (own) add(`Tu reputación con ${fname}`, clamp(own * cfg.weight, -30, 30), { icon: fac?.icon ?? '🏳️', source: 'faccion' });
        if (own >= cfg.good) reputation = { ally: true, pct: cfg.goodPct, label: `Buena reputación con ${fname}: mejores condiciones`, icon: fac?.icon ?? '🏳️' };
        else if (own <= cfg.enemy) {
            reputation = { enemy: true, pct: cfg.badPct * 1.5, label: `Eres enemigo de ${fname}`, icon: '⚔️' };
            if (cfg.refuseEnemies) refusals.push(`Eres enemigo de ${fname}: no comercia contigo`);
        } else if (own <= cfg.bad) reputation = { pct: cfg.badPct, label: `Mala reputación con ${fname}: desconfía de ti`, icon: '🤨' };
        if (perceived?.factions.includes(keeper.faction) && !(keeper.attitudes ?? []).some((a) => a?.when?.faction === keeper.faction)) {
            add(`Compartís facción (${fac?.name ?? keeper.faction})`, 10, { icon: fac?.icon ?? '🏳️', source: 'faccion' });
        }
        for (const rival of fac?.rivals ?? []) {
            const rf = ctx.factions.get(rival);
            if (perceived?.factions.includes(rival) && !(keeper.attitudes ?? []).some((a) => a?.when?.faction === rival)) add(`Eres de ${rf?.name ?? rival}, rivales suyos`, -20, { icon: rf?.icon ?? '⚔️', source: 'faccion' });
            if ((standing[rival] ?? 0) > 20) add(`Se sabe que trabajas para ${rf?.name ?? rival}`, -standing[rival] * 0.15, { icon: rf?.icon ?? '⚔️', source: 'faccion' });
        }
    }

    // 5) Territorio: razas predominantes y peligro de la región donde está hoy
    const region = regionId ? ctx.regions.get(regionId) : null;
    if (region && perceived) {
        const danger = Number(region.danger) || 0;
        if (region.races?.length && perceived.race.families.some((f) => region.races.includes(f))) add('Eres de una raza habitual por aquí', 4, { icon: '🏘️', source: 'region' });
        else if (region.races?.length && danger >= 3) add('Forastero en tierra peligrosa', -4, { icon: '🧭', source: 'region' });
        if (danger >= 3 && flags.has('strangerWary') && isStranger(rel)) add('Con tanto peligro, no se fía de nadie nuevo', -(danger - 2) * 3, { icon: '⚠️', source: 'region' });
    }

    // 6) Memoria permanente
    for (const m of memoryWeights(ctx, keeper, rel)) add(m.label, m.value, { icon: m.icon, source: 'memoria' });

    // 7) Situación del mundo (eventos activos)
    for (const { def, intensity } of events) {
        for (const att of def.attitudes ?? []) {
            if (!keeperFilter(att.keepers, keeper, regionId)) continue;
            if (!matchesWhen(att.when, { perceived, rel, world, charId, activeEventIds })) continue;
            add(att.label ?? def.name, (att.value ?? 0) * intensity, { icon: def.icon, source: 'evento' });
        }
    }

    const score = Math.round(clamp(reasons.reduce((s, r) => s + r.value, 0), -100, 100));
    const tier = tierOf(score);

    // ── Consecuencias ──
    if (rel.banUntil >= world.day) refusals.unshift(`Te pilló robando: no quiere verte hasta el día ${rel.banUntil + 1}`);
    if (tier.id === 'hostil' && !flags.has('bribable')) refusals.push('Te tiene verdadera aversión');
    const greedyHostile = tier.id === 'hostil' && flags.has('bribable');

    const buyPct = score >= 0 ? -(score / 100) * 0.12 : (-score / 100) * 0.25 + (greedyHostile ? 0.15 : 0);
    const sellPct = score >= 0 ? (score / 100) * 0.1 : -(-score / 100) * 0.2;

    share += 0.3 + score / 160;
    if (flags.has('gossip')) share += 0.2;
    if (flags.has('strangerWary') && isStranger(rel)) share -= 0.15;

    return {
        keeperId: keeper.id,
        score,
        tier,
        reasons: reasons.sort((a, b) => Math.abs(b.value) - Math.abs(a.value)),
        perceived,
        flags,
        reputation,
        unlocks,
        refuses: refusals.length ? refusals[0] : null,
        price: { buyPct, sellPct, greedyHostile },
        haggle: {
            concession: clamp(score / 100, -1, 1) * 0.06,
            patience: score >= 45 ? 1 : score <= -20 ? -1 : 0,
            mood: clamp(score / 100, -1, 1) * 0.5,
            refuse: tier.id === 'hostil' ? 'Está demasiado molesto contigo para regatear.' : null,
        },
        share: clamp(share, 0, 1),
        regionId,
    };
}

/** Línea de bienvenida según el nivel. */
export function welcomeKey(disposition) {
    if (disposition.refuses) return 'welcome_hostile';
    if (TIER_INDEX[disposition.tier.id] >= TIER_INDEX.favorable) return 'welcome_friend';
    if (TIER_INDEX[disposition.tier.id] <= TIER_INDEX.desconfiado) return 'welcome_cold';
    return 'welcome';
}

/** Comprueba requisitos genéricos { tier, faction, race, unlocked, memory, secret }: basta con UNO. */
export function meetsAny(requires, { disposition, itemId = null, rel = null }) {
    if (!requires) return true;
    const checks = [];
    if (requires.tier) checks.push(tierAtLeast(disposition.tier, requires.tier));
    if (requires.faction) checks.push(disposition.perceived?.factions.includes(requires.faction));
    if (requires.race) checks.push(disposition.perceived?.race.families.includes(requires.race));
    if (requires.unlocked) checks.push(Boolean(itemId && disposition.unlocks.has(itemId)));
    if (requires.memory) checks.push((rel?.memory?.[requires.memory]?.n ?? 0) > 0);
    if (requires.secret) checks.push(Boolean(rel?.secrets?.includes(requires.secret)));
    return !checks.length || checks.some(Boolean);
}

/** Comprueba requisitos que deben cumplirse TODOS (secretos y favores). */
export function meetsAll(requires, { disposition, rel = null, world = null, ctx = null }) {
    if (!requires) return true;
    if (requires.tier && !tierAtLeast(disposition.tier, requires.tier)) return false;
    if (requires.minTier && !tierAtLeast(disposition.tier, requires.minTier)) return false;
    if (requires.memory && !((rel?.memory?.[requires.memory]?.n ?? 0) > 0)) return false;
    if (requires.secret && !rel?.secrets?.includes(requires.secret)) return false;
    if (requires.faction && !disposition.perceived?.factions.includes(requires.faction)) return false;
    if (requires.phase && world && ctx && ctx.phases[world.phase ?? 0]?.id !== requires.phase) return false;
    return true;
}
