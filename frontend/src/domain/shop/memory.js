/**
 * Memoria de los comerciantes: lo que recuerdan de cada personaje.
 *
 * Cada tipo de recuerdo tiene:
 *  - rep: cambio inmediato del trato al ocurrir (una vez);
 *  - lasting: peso permanente en la disposición (por cada vez, con tope `cap`);
 *  - hidden: el jugador no lo ve en la lista (p. ej. un robo que nadie notó).
 * Los rencorosos duplican lo negativo; los indulgentes lo reducen a la mitad.
 *
 * Se guarda agregado por tipo ({ n, day, note }) para que el mundo no crezca
 * sin límite, más un pequeño diario de los momentos importantes.
 */

import { ensureRelation, changeReputation } from './state.js';
import { hasFlag } from './personality.js';

export const MEMORY_TYPES = Object.freeze({
    bought: { label: 'Te ha comprado', icon: '🛒', rep: 0, lasting: 0.6, cap: 10, count: true },
    sold: { label: 'Te ha vendido mercancía', icon: '📦', rep: 0, lasting: 0.3, cap: 5, count: true },
    haggled: { label: 'Regatea siempre', icon: '🗣️', rep: 0, lasting: -0.5, cap: -6, count: true },
    overpaid: { label: 'Pagó de más sin rechistar', icon: '💰', rep: 1, lasting: 1, cap: 6 },
    lied: { label: 'Le mentiste', icon: '🤥', rep: -8, lasting: -6, cap: -24 },
    stole: { label: 'Te pilló robando', icon: '🧤', rep: -35, lasting: -15, cap: -45 },
    'stole-unnoticed': { label: 'Le robaste (no lo sabe)', icon: '🤫', rep: 0, lasting: 0, cap: 0, hidden: true },
    helped: { label: 'Le ayudaste', icon: '🛡️', rep: 10, lasting: 6, cap: 18 },
    favor: { label: 'Le hiciste un favor', icon: '🤝', rep: 0, lasting: 4, cap: 16 },
    gift: { label: 'Le hiciste un regalo', icon: '🎁', rep: 0, lasting: 1.5, cap: 9 },
    'promise-kept': { label: 'Cumpliste tu palabra', icon: '✅', rep: 3, lasting: 3, cap: 12 },
    'promise-broken': { label: 'Rompiste tu palabra', icon: '❌', rep: -10, lasting: -6, cap: -24 },
    insulted: { label: 'Le faltaste al respeto', icon: '😤', rep: -6, lasting: -3, cap: -15 },
    'saved-relative': { label: 'Salvaste a un ser querido suyo', icon: '💖', rep: 25, lasting: 20, cap: 20 },
    'told-story': { label: 'Le contaste una gran historia', icon: '📖', rep: 0, lasting: 1, cap: 4 },
    drank: { label: 'Compartisteis unas jarras', icon: '🍺', rep: 0, lasting: 1, cap: 6 },
    hired: { label: 'Le diste trabajo', icon: '📜', rep: 5, lasting: 4, cap: 4 },
    'paid-round': { label: 'Pagaste la ronda antes que él', icon: '🍻', rep: 4, lasting: 2, cap: 6 },
});

/** Tipos que el DM puede registrar a mano (sucesos de la partida). */
export const DM_MEMORY_TYPES = Object.freeze(['helped', 'favor', 'saved-relative', 'told-story', 'insulted', 'lied', 'stole', 'promise-kept', 'promise-broken', 'gift']);

const JOURNAL_LIMIT = 12;

function scale(ctx, keeper, value) {
    if (value >= 0) return value;
    if (hasFlag(ctx, keeper, 'grudges')) return value * 2;
    if (hasFlag(ctx, keeper, 'forgiving')) return value / 2;
    return value;
}

/**
 * Registra un recuerdo. Muta `world` (clonado). Devuelve el cambio de trato aplicado.
 * @param {{ note?: string, rep?: number }} opts  rep sustituye al valor del catálogo
 */
export function remember(world, ctx, charId, keeper, type, { note = '', rep = undefined } = {}) {
    const def = MEMORY_TYPES[type];
    if (!def || !keeper) return 0;
    const rel = ensureRelation(world, charId, keeper.id);
    const m = (rel.memory[type] ??= { n: 0, day: world.day });
    m.n += 1;
    m.day = world.day;
    if (note) m.note = String(note).slice(0, 140);
    const delta = scale(ctx, keeper, rep ?? def.rep);
    let applied = 0;
    if (delta) applied = changeReputation(world, charId, keeper.id, Math.round(delta), { dailyCap: Math.max(6, Math.abs(delta)) });
    if (!def.count || m.n === 1 || m.n % 5 === 0) {
        rel.log = [{ type, day: world.day, note: note || '' }, ...(rel.log ?? [])].slice(0, JOURNAL_LIMIT);
    }
    return applied;
}

/** Peso permanente de la memoria en la disposición: [{ type, label, value }]. */
export function memoryWeights(ctx, keeper, rel) {
    const out = [];
    for (const [type, m] of Object.entries(rel?.memory ?? {})) {
        const def = MEMORY_TYPES[type];
        if (!def || !def.lasting || !m?.n) continue;
        let value = def.count ? def.lasting * Math.floor(m.n / 3) : def.lasting * m.n;
        value = def.cap >= 0 ? Math.min(value, def.cap) : Math.max(value, def.cap);
        value = Math.round(scale(ctx, keeper, value));
        if (value) out.push({ type, label: def.label, icon: def.icon, value });
    }
    return out;
}

/** Recuerdos visibles para el jugador (lo que el comerciante «te recuerda»). */
export function visibleMemories(rel) {
    return Object.entries(rel?.memory ?? {})
        .filter(([type, m]) => MEMORY_TYPES[type] && !MEMORY_TYPES[type].hidden && m.n > 0)
        .map(([type, m]) => ({ type, ...MEMORY_TYPES[type], n: m.n, day: m.day, note: m.note ?? '' }))
        .sort((a, b) => b.day - a.day);
}
