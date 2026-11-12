/**
 * Negociación con el vendedor.
 *
 * Modelo: el vendedor tiene un precio límite OCULTO (lo mínimo que acepta al
 * vender, lo máximo que paga al comprar), un ánimo (−1..1) y una paciencia
 * (rondas). El jugador hace ofertas y usa tácticas; cada táctica tiene una
 * habilidad de D&D, una CD que depende de la personalidad del vendedor y
 * consecuencias reales si sale mal. La personalidad (avaricia, orgullo,
 * paciencia, calidez, astucia, gustos) decide cómo reacciona.
 *
 * Integridad:
 *   - Todo es determinista con semilla (mundo + personaje + tienda + objeto + día):
 *     recargar la página no vuelve a tirar los dados.
 *   - La sesión se guarda en el mundo, así que se puede retomar.
 *   - Un objeto solo se negocia una vez por día; un mal final cierra la puerta.
 *   - El trato resultante queda como precio válido solo hoy.
 */

import { createRng } from './rng.js';
import { formatCp } from '../money.js';
import { RARITY_INDEX } from './catalog.js';
import { quoteBuy, quoteSell, scarcityFactor, marketPrice } from './pricing.js';
import { cloneWorld, getRelation, ensureRelation, changeReputation, haggleKey, getActiveDeal } from './state.js';
import { shopClosure } from './simulation.js';
import { evaluateDisposition } from './disposition.js';
import { availability, shopRegion } from './presence.js';
import { remember } from './memory.js';

export const SKILLS = Object.freeze({
    persuasion: 'Persuasión',
    deception: 'Engaño',
    intimidation: 'Intimidación',
    insight: 'Perspicacia',
    investigation: 'Investigación',
    performance: 'Interpretación',
    sleight: 'Juego de Manos',
});

/** Catálogo de tácticas. La lógica vive en TACTIC_HANDLERS. */
export const TACTICS = Object.freeze([
    { id: 'flatter', label: 'Halagar', icon: '🌹', skill: 'persuasion', hint: 'Elogia su mercancía o su oficio. Funciona mejor con gente orgullosa… hasta que abusas.', maxUses: 2 },
    { id: 'chat', label: 'Charlar', icon: '💬', skill: null, hint: 'Saca un tema de conversación. Si le interesa, se relaja y gana paciencia.', maxUses: 2 },
    { id: 'insight', label: 'Leer al vendedor', icon: '👁️', skill: 'insight', hint: 'Intenta adivinar hasta dónde cedería y cómo es. No consume paciencia.', maxUses: 1, free: true },
    { id: 'flaw', label: 'Señalar defectos', sellLabel: 'Destacar su calidad', icon: '🔍', skill: 'investigation', sellSkill: 'persuasion', hint: 'Argumenta con hechos sobre el objeto. Si fallas, se ofende.', maxUses: 1 },
    { id: 'competition', label: 'Mencionar la competencia', icon: '🏪', skill: 'deception', hint: 'Si otra tienda lo tiene más barato, es verdad y no hace falta tirar. Si no, es un farol.', maxUses: 1 },
    { id: 'bulk', label: 'Trato por cantidad', icon: '📦', skill: null, hint: 'Con 3 o más unidades, mover mercancía le conviene.', maxUses: 1, minQty: 3 },
    { id: 'walk', label: 'Hacer ademán de irte', icon: '🚪', skill: 'deception', hint: 'Puede llamarte de vuelta… o dejarte ir si es orgulloso.', maxUses: 1, risky: true },
    { id: 'intimidate', label: 'Intimidar', icon: '😠', skill: 'intimidation', hint: 'Rápido y eficaz si sale bien. Si falla, se acabó la conversación y lo recordará.', maxUses: 1, risky: true },
]);

const TACTIC_BY_ID = new Map(TACTICS.map((t) => [t.id, t]));

const TRAIT_HINTS = [
    { trait: 'pride', high: true, threshold: 0.65, text: 'Es orgulloso: las ofertas bajas lo ofenden y los halagos le llegan.' },
    { trait: 'greed', high: true, threshold: 0.65, text: 'Le importa mucho el dinero: cederá poco.' },
    { trait: 'greed', high: false, threshold: 0.4, text: 'No es avaricioso: con buenas formas cede bastante.' },
    { trait: 'patience', high: false, threshold: 0.4, text: 'Tiene poca paciencia: no alargues el regateo.' },
    { trait: 'patience', high: true, threshold: 0.7, text: 'Es paciente: puedes tomarte tu tiempo.' },
    { trait: 'shrewdness', high: true, threshold: 0.75, text: 'Es astuto: difícilmente se trague un farol.' },
    { trait: 'warmth', high: true, threshold: 0.65, text: 'Es afable: una buena charla abre puertas.' },
    { trait: 'warmth', high: false, threshold: 0.35, text: 'Es frío y desconfiado: no le gusta perder el tiempo.' },
];

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

/** Por debajo de este total (5 pp) no se regatea. */
export const MIN_HAGGLE_TOTAL = 50;

// ───────────────────────────── utilidades ─────────────────────────────

function favorable(side) {
    // "Mejor para el jugador": comprar más barato, vender más caro.
    return side === 'buy'
        ? { better: (a, b) => a < b, toward: (p, pct) => p * (1 - pct), away: (p, pct) => p * (1 + pct), sign: -1 }
        : { better: (a, b) => a > b, toward: (p, pct) => p * (1 + pct), away: (p, pct) => p * (1 - pct), sign: 1 };
}

const STEPS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000];

/** Paso de regateo: ~1 % del precio, en importes de moneda "redondos". */
export function negotiationStep(session) {
    const target = session.list * 0.012;
    let step = 1;
    for (const s of STEPS) if (s <= target) step = s;
    return step;
}

/** Redondea al paso de regateo y siempre a favor del vendedor (nunca regala por redondeo). */
function roundForKeeper(session, value) {
    const step = negotiationStep(session);
    const fn = session.side === 'buy' ? Math.ceil : Math.floor;
    return Math.max(1, fn(value / step) * step);
}

export function line(ctx, keeper, key, vars, rng) {
    const voices = ctx.dialogue?.voices ?? {};
    const own = keeper.lines?.[key];
    const options = own ?? voices[keeper.voice]?.[key] ?? voices.default?.[key] ?? [`(${key})`];
    const template = Array.isArray(options) ? rng.pick(options) : options;
    return String(template).replace(/\{(\w+)\}/g, (_, name) => (vars[name] ?? `{${name}}`));
}

function money(ctx, amount) {
    return formatCp(amount);
}

function sessionRng(world, session, ...extra) {
    return createRng(world.seed, 'haggle', session.id, session.day, session.round, ...extra);
}

export function rollCheck(rng, modifier, dc, manualRoll) {
    const manual = Number.isInteger(manualRoll) && manualRoll >= 1 && manualRoll <= 20;
    const d20 = manual ? manualRoll : rng.int(1, 20);
    const total = d20 + (Number(modifier) || 0);
    const crit = d20 === 20 ? 'success' : d20 === 1 ? 'fail' : null;
    const success = crit === 'success' ? true : crit === 'fail' ? false : total >= dc;
    return { d20, modifier: Number(modifier) || 0, total, dc, success, crit, manual };
}

export function describeRoll(skillLabel, roll) {
    const mod = roll.modifier >= 0 ? `+${roll.modifier}` : `${roll.modifier}`;
    const verdict = roll.crit === 'success' ? '¡crítico!' : roll.crit === 'fail' ? 'pifia' : roll.success ? 'éxito' : 'fallo';
    return `${skillLabel}: d20 (${roll.d20}) ${mod} = ${roll.total} contra CD ${roll.dc} → ${verdict}`;
}

function vars(ctx, session, keeper, extra = {}) {
    const item = ctx.item(session.itemId);
    const shop = ctx.shop(session.shopId);
    return {
        item: item?.name ?? 'eso',
        price: money(ctx, session.ask),
        name: keeper.short ?? keeper.name,
        shop: shop?.name ?? '',
        ...extra,
    };
}

function log(session, who, text, extra = {}) {
    session.log.push({ who, text, round: session.round, ...extra });
}

function moodLabel(mood) {
    if (mood <= -0.6) return { id: 'furioso', label: 'Furioso', face: '😠' };
    if (mood <= -0.25) return { id: 'molesto', label: 'Molesto', face: '😒' };
    if (mood < 0.2) return { id: 'neutral', label: 'Atento', face: '😐' };
    if (mood < 0.55) return { id: 'complacido', label: 'Complacido', face: '🙂' };
    return { id: 'encantado', label: 'Encantado', face: '😄' };
}

// ───────────────────────────── inicio ─────────────────────────────

/** ¿Se puede negociar? Devuelve { ok, reason, message }. */
export function canNegotiate(world, ctx, { charId, shopId, itemId, side, qty, profile = null, here = undefined }) {
    const keeper = ctx.keeperOf(shopId);
    if (!keeper) return { ok: false, reason: 'no-keeper', message: 'No hay nadie atendiendo.' };
    const closure = shopClosure(world, ctx, shopId);
    if (closure) return { ok: false, reason: 'closed', message: `${closure.name}: la tienda está cerrada.` };
    if (here !== undefined && here !== null) {
        const status = availability(world, ctx, keeper);
        if (status.location !== here) return { ok: false, reason: 'absent', message: `${keeper.short ?? keeper.name} no está aquí.` };
        if (!status.open) return { ok: false, reason: 'closed', message: status.reason };
    }
    const disposition = evaluateDisposition(world, ctx, { keeper, charId, profile });
    if (disposition.refuses) return { ok: false, reason: 'refuses', message: disposition.refuses };
    if (disposition.haggle.refuse) return { ok: false, reason: 'refuses', message: disposition.haggle.refuse };
    // Reglas de negociación del comerciante (configurables por el DM).
    if (keeper.negotiation?.enabled === false) return { ok: false, reason: 'fixed', message: keeper.negotiation.reason || `${keeper.short ?? keeper.name} no regatea: precio fijo.` };
    const rel = getRelation(world, charId, keeper.id);
    if (rel.noHaggleUntil >= world.day) {
        return { ok: false, reason: 'refuses', message: `${keeper.short ?? keeper.name} no quiere regatear contigo por ahora (hasta el día ${rel.noHaggleUntil + 1}).` };
    }
    const key = haggleKey(charId, shopId, itemId, side);
    const previous = world.haggles[key];
    if (previous && previous.day === world.day && previous.outcome !== 'open') {
        const what = previous.outcome === 'deal' ? 'Ya cerraron un trato por esto hoy.' : 'Ya hablaron de esto hoy; mañana quizá cambie de idea.';
        return { ok: false, reason: 'already', message: what };
    }
    if (getActiveDeal(world, charId, shopId, itemId, side)) return { ok: false, reason: 'deal', message: 'Ya tienes un trato vigente por esto.' };
    if (!previous && qty !== undefined) {
        const quote = side === 'buy' ? quoteBuy(world, ctx, { shopId, itemId, charId, profile }) : quoteSell(world, ctx, { shopId, itemId, charId, profile });
        if (quote?.locked) return { ok: false, reason: 'locked', message: quote.locked };
        if (quote?.unit && quote.unit * Math.max(1, qty) < MIN_HAGGLE_TOTAL) {
            return { ok: false, reason: 'too-cheap', message: 'Nadie regatea por un par de monedas de cobre: el precio es el que es.' };
        }
    }
    return { ok: true, resumable: previous?.outcome === 'open' };
}

/**
 * Empieza (o retoma) una negociación.
 * Devuelve { world, session } o { error }.
 */
export function startNegotiation(world, ctx, { charId = null, shopId, itemId, side = 'buy', qty = 1, profile = null, here = undefined }) {
    const check = canNegotiate(world, ctx, { charId, shopId, itemId, side, qty, profile, here });
    if (!check.ok) return { error: check.message, reason: check.reason };
    const key = haggleKey(charId, shopId, itemId, side);
    if (check.resumable) return { world, session: world.haggles[key].session };

    const item = ctx.item(itemId);
    const keeper = ctx.keeperOf(shopId);
    const quote = side === 'buy' ? quoteBuy(world, ctx, { shopId, itemId, charId, profile }) : quoteSell(world, ctx, { shopId, itemId, charId, profile });
    if (!quote || !quote.unit) return { error: 'No le interesa negociar por eso.', reason: 'no-quote' };
    if (side === 'buy' && quote.available < qty) return { error: 'No tiene tantas unidades.', reason: 'stock' };

    const t = keeper.traits;
    const rng = createRng(world.seed, 'haggle-setup', key, world.day);
    const f = favorable(side);
    // La disposición (raza, trasfondo, facción, memoria, eventos…) sustituye a la simple reputación.
    const disposition = evaluateDisposition(world, ctx, { keeper, charId, profile });
    const score = disposition.score;
    const flags = disposition.flags;

    let maxConcession = 0.05 + 0.13 * (1 - t.greed) + 0.05 * (score / 100) + disposition.haggle.concession + rng.range(-0.03, 0.03);
    if (side === 'buy') {
        if (RARITY_INDEX[item.rarity] >= RARITY_INDEX.rare && quote.entry?.target <= 1) maxConcession *= 0.75;
        maxConcession *= 1 - Math.max(0, scarcityFactor(quote.entry));
        // Poco stock: no hay rebaja que valga.
        if (quote.entry && !quote.entry.unlimited && quote.entry.qty <= 1) maxConcession *= 0.4;
        // El avaricioso que te nota desesperado apenas cede.
        if (flags.has('exploitDesperation') && quote.factors.some((x) => x.key === 'desesperacion')) maxConcession *= 0.5;
    }
    maxConcession = clamp(maxConcession, 0.03, 0.3);
    if (Number.isFinite(keeper.negotiation?.maxDiscount)) maxConcession = Math.min(maxConcession, Math.max(0.01, keeper.negotiation.maxDiscount));

    let hardLimit;
    if (side === 'buy') {
        hardLimit = Math.ceil(item.price * 0.55); // nunca vende a pérdida
    } else {
        const market = marketPrice(world, ctx, shopId, itemId) ?? item.price;
        hardLimit = Math.floor(Math.min(market * 0.85, item.price * 0.8));
    }
    let reservation = f.toward(quote.unit, maxConcession);
    reservation = side === 'buy' ? Math.max(reservation, hardLimit) : Math.min(reservation, hardLimit);
    reservation = Math.round(reservation);

    const session = {
        id: key,
        charId,
        shopId,
        itemId,
        keeperId: keeper.id,
        side,
        qty: Math.max(1, Math.trunc(qty)),
        day: world.day,
        list: quote.unit,
        ask: quote.unit,
        reservation,
        hardLimit,
        mood: clamp((t.warmth - 0.5) * 0.4 + disposition.haggle.mood, -0.6, 0.6),
        patience: Number.isFinite(keeper.negotiation?.patience) ? Math.max(1, keeper.negotiation.patience) : Math.max(2, 3 + Math.round(t.patience * 4) + disposition.haggle.patience - (flags.has('proud') ? 1 : 0)),
        disposition: score,
        maxPatience: 0,
        round: 0,
        lastOffer: null,
        used: {},
        topicsTalked: [],
        revealed: { estimate: null },
        status: 'open',
        finalUnit: null,
        log: [],
    };
    session.maxPatience = session.patience;

    const greetKey = score >= 30 ? 'greet_friend' : score <= -25 ? 'greet_cold' : 'greet';
    log(session, 'keeper', line(ctx, keeper, greetKey, vars(ctx, session, keeper), rng));
    log(session, 'keeper', line(ctx, keeper, side === 'buy' ? 'open_buy' : 'open_sell', vars(ctx, session, keeper), rng));

    const next = cloneWorld(world);
    next.haggles[key] = { day: world.day, outcome: 'open', session };
    return { world: next, session };
}

// ───────────────────────────── consulta ─────────────────────────────

export function getSession(world, key) {
    return world.haggles?.[key]?.session ?? null;
}

/** Vista segura para la interfaz: sin el precio límite oculto. */
export function publicSession(session) {
    if (!session) return null;
    const { reservation, hardLimit, ...rest } = session;
    return { ...rest, moodInfo: moodLabel(session.mood) };
}

/** Tácticas disponibles con su modificador y motivo si están bloqueadas. */
export function availableTactics(world, ctx, session, character) {
    const keeper = ctx.keepers.get(session.keeperId);
    const known = getRelation(world, session.charId, keeper.id).known;
    return TACTICS.map((t) => {
        const skill = session.side === 'sell' && t.sellSkill ? t.sellSkill : t.skill;
        const uses = session.used[t.id] ?? 0;
        let disabled = null;
        if (session.status !== 'open') disabled = 'La negociación ya no admite tácticas.';
        else if (uses >= t.maxUses) disabled = 'Ya lo usaste.';
        else if (t.minQty && session.qty < t.minQty) disabled = `Necesitas negociar ${t.minQty} o más unidades.`;
        else if (!t.free && session.patience <= 0) disabled = 'Se le acabó la paciencia.';
        const label = session.side === 'sell' && t.sellLabel ? t.sellLabel : t.label;
        return {
            id: t.id,
            label,
            icon: t.icon,
            hint: t.hint,
            skill,
            skillLabel: skill ? SKILLS[skill] : null,
            modifier: skill ? Number(character?.skills?.[skill] ?? 0) : null,
            risky: Boolean(t.risky),
            free: Boolean(t.free),
            disabled,
            topics: t.id === 'chat' ? chatTopics(world, ctx, session, keeper, known) : undefined,
        };
    });
}

function chatTopics(world, ctx, session, keeper, known) {
    const rng = createRng(world.seed, 'topics', session.id, session.day, session.used.chat ?? 0);
    const all = [...ctx.topics.values()];
    const fresh = (list) => list.filter((t) => !session.topicsTalked.includes(t.id));
    const liked = fresh(all.filter((t) => keeper.likes?.includes(t.id)));
    const disliked = fresh(all.filter((t) => keeper.dislikes?.includes(t.id)));
    const neutral = fresh(all.filter((t) => !keeper.likes?.includes(t.id) && !keeper.dislikes?.includes(t.id)));
    const picks = [rng.pick(liked), rng.pick(disliked.length ? disliked : neutral)];
    const rest = rng.shuffle(neutral).filter((t) => !picks.includes(t));
    while (picks.filter(Boolean).length < 3 && rest.length) picks.push(rest.shift());
    return rng.shuffle(picks.filter(Boolean)).map((t) => ({
        id: t.id,
        label: t.label,
        icon: t.icon,
        known: known.likes.includes(t.id) ? 'like' : known.dislikes.includes(t.id) ? 'dislike' : null,
    }));
}

// ───────────────────────────── acciones ─────────────────────────────

/**
 * Ejecuta una acción del jugador.
 * action: { type: 'offer', amount } | { type: 'tactic', id, topic?, roll? } | { type: 'accept' } | { type: 'leave' }
 * Devuelve { world, session, events } o { error }.
 */
export function act(world, ctx, key, action, character = null) {
    const stored = world.haggles?.[key];
    if (!stored?.session) return { error: 'La negociación no existe o ya terminó.' };
    if (stored.day !== world.day) return { error: 'Ese día ya pasó.' };
    const next = cloneWorld(world);
    const session = next.haggles[key].session;
    if (!['open', 'final'].includes(session.status)) return { error: 'La negociación ya terminó.' };
    const keeper = ctx.keepers.get(session.keeperId);
    session.round += 1;
    const rng = sessionRng(next, session, action.type, action.id ?? '');

    switch (action.type) {
        case 'offer':
            handleOffer(next, ctx, session, keeper, rng, Math.trunc(Number(action.amount)));
            break;
        case 'accept':
            closeDeal(next, ctx, session, keeper, rng, session.ask, 'accept_ask');
            break;
        case 'leave':
            log(session, 'player', 'Te despides y te alejas del mostrador.');
            finish(next, ctx, session, keeper, rng, 'left');
            break;
        case 'tactic':
            if (session.status !== 'open') return { error: 'Ya no puedes usar tácticas: es su última oferta.' };
            handleTactic(next, ctx, session, keeper, rng, action, character);
            break;
        default:
            return { error: 'Acción desconocida.' };
    }

    if (session.status === 'open' && session.mood <= -0.75) {
        log(session, 'keeper', line(ctx, keeper, 'walkout', vars(ctx, session, keeper), rng), { tone: 'bad' });
        finish(next, ctx, session, keeper, rng, 'failed', { angry: true });
    }
    if (session.status === 'open' && session.patience <= 0) {
        session.status = 'final';
        log(session, 'keeper', line(ctx, keeper, 'final_offer', vars(ctx, session, keeper), rng), { tone: 'warn' });
    }
    if (['deal', 'failed', 'left'].includes(session.status)) {
        next.haggles[key] = { day: next.day, outcome: session.status, unit: session.finalUnit };
    }
    return { world: next, session };
}

function handleOffer(world, ctx, session, keeper, rng, amount) {
    const f = favorable(session.side);
    const t = keeper.traits;
    if (!Number.isFinite(amount) || amount <= 0) {
        session.round -= 1;
        return;
    }
    log(session, 'player', session.side === 'buy' ? `Ofreces ${money(ctx, amount)} por unidad.` : `Pides ${money(ctx, amount)} por unidad.`);

    // Ofrecer lo que pide (o algo peor para ti) = aceptar su precio.
    if (!f.better(amount, session.ask)) {
        closeDeal(world, ctx, session, keeper, rng, session.ask, 'accept_ask');
        return;
    }
    if (session.status === 'final') {
        log(session, 'keeper', line(ctx, keeper, 'final_offer', vars(ctx, session, keeper), rng), { tone: 'warn' });
        return;
    }

    session.patience -= 1;
    const repeated = session.lastOffer !== null && !f.better(session.lastOffer, amount);
    // ↑ comprar: no subiste la oferta; vender: no bajaste lo que pides
    session.lastOffer = amount;
    if (repeated) {
        session.patience -= 1;
        session.mood -= 0.08;
        log(session, 'keeper', line(ctx, keeper, 'repeat', vars(ctx, session, keeper, { offer: money(ctx, amount) }), rng), { tone: 'warn' });
        return;
    }

    const insultMargin = 0.12 + 0.18 * (1 - t.pride);
    const insultLine = f.toward(session.reservation, insultMargin);
    const withinLimit = !f.better(amount, session.reservation);
    const insulting = f.better(amount, insultLine);
    const moodNorm = (session.mood + 1) / 2;

    if (insulting) {
        session.mood -= 0.12 + 0.25 * t.pride;
        session.patience -= 1;
        log(session, 'keeper', line(ctx, keeper, 'insulted', vars(ctx, session, keeper, { offer: money(ctx, amount) }), rng), { tone: 'bad' });
        return;
    }

    const gap = Math.abs(session.ask - session.reservation);
    if (withinLimit) {
        const willingness = clamp(0.3 + 0.35 * moodNorm - 0.2 * t.greed, 0.1, 0.75);
        const threshold = session.side === 'buy' ? session.ask - gap * willingness : session.ask + gap * willingness;
        const acceptable = !f.better(amount, threshold) || session.patience <= 1;
        if (acceptable) {
            closeDeal(world, ctx, session, keeper, rng, amount, 'accept_offer');
            return;
        }
        const concession = clamp(0.35 + 0.3 * moodNorm - 0.15 * t.greed, 0.2, 0.7);
        counter(world, ctx, session, keeper, rng, session.ask + (amount - session.ask) * concession, amount);
        return;
    }

    session.mood -= 0.04;
    const concession = clamp(0.35 + 0.3 * moodNorm - 0.15 * t.greed, 0.2, 0.7) * 0.5;
    const target = session.side === 'buy' ? session.ask - gap * concession : session.ask + gap * concession;
    counter(world, ctx, session, keeper, rng, target, amount);
}

function counter(world, ctx, session, keeper, rng, rawAsk, offer) {
    const f = favorable(session.side);
    // Concede al menos un 15 % de lo que le queda de margen: el regateo avanza.
    const minMove = Math.abs(session.ask - session.reservation) * 0.15;
    if (Math.abs(rawAsk - session.ask) < minMove) rawAsk = session.side === 'buy' ? session.ask - minMove : session.ask + minMove;
    let ask = roundForKeeper(session, rawAsk);
    // No cruzar su límite ni empeorar lo que ya ofreció.
    if (f.better(ask, session.reservation)) ask = roundForKeeper(session, session.reservation);
    if (!f.better(ask, session.ask)) ask = session.ask;
    // Si la diferencia ya es mínima, cierra en tu oferta (si está dentro de su límite).
    if (Math.abs(ask - offer) <= negotiationStep(session) && !f.better(offer, session.reservation)) {
        closeDeal(world, ctx, session, keeper, rng, offer, 'accept_offer');
        return;
    }
    session.ask = ask;
    const closeness = Math.abs(ask - offer) / Math.max(1, session.list);
    const key = closeness < 0.07 ? 'counter_near' : 'counter_far';
    log(session, 'keeper', line(ctx, keeper, key, vars(ctx, session, keeper, { offer: money(ctx, offer) }), rng), { tone: 'counter', ask });
}

function closeDeal(world, ctx, session, keeper, rng, unit, lineKey) {
    session.finalUnit = unit;
    session.ask = unit;
    if (lineKey === 'accept_ask') log(session, 'player', `Aceptas: ${money(ctx, unit)} por unidad.`);
    const happy = session.mood > 0.4;
    log(session, 'keeper', line(ctx, keeper, happy ? 'accept_happy' : lineKey, vars(ctx, session, keeper, { price: money(ctx, unit) }), rng), { tone: 'good' });
    world.deals[session.id] = { day: world.day, unit, qty: session.qty, list: session.list };
    finish(world, ctx, session, keeper, rng, 'deal');
}

function finish(world, ctx, session, keeper, rng, status, { angry = false } = {}) {
    session.status = status;
    if (session.round > 0 || status !== 'left') remember(world, ctx, session.charId, keeper, 'haggled');
    const rel = ensureRelation(world, session.charId, keeper.id);
    if (status === 'deal') {
        rel.deals = (rel.deals ?? 0) + 1;
        changeReputation(world, session.charId, keeper.id, session.mood > 0.4 ? 3 : 1);
    } else if (status === 'failed' && angry) {
        changeReputation(world, session.charId, keeper.id, -5);
        rel.noHaggleUntil = Math.max(rel.noHaggleUntil ?? 0, world.day);
    } else if (status === 'left') {
        if (session.mood < -0.4) changeReputation(world, session.charId, keeper.id, -2);
        log(session, 'keeper', line(ctx, keeper, session.mood < -0.2 ? 'leave_bad' : 'leave_good', vars(ctx, session, keeper), rng));
    }
}

function learn(world, session, keeper, kind, value) {
    const rel = ensureRelation(world, session.charId, keeper.id);
    if (!rel.known[kind].includes(value)) rel.known[kind].push(value);
}

function moveToward(session, pctReservation, pctAsk) {
    const f = favorable(session.side);
    if (pctReservation) {
        let r = f.toward(session.reservation, pctReservation);
        r = session.side === 'buy' ? Math.max(r, session.hardLimit) : Math.min(r, session.hardLimit);
        session.reservation = Math.round(r);
    }
    if (pctAsk) {
        let a = roundForKeeper(session, f.toward(session.ask, pctAsk));
        if (f.better(a, session.reservation)) a = roundForKeeper(session, session.reservation);
        if (f.better(a, session.ask)) session.ask = a;
    }
}

function handleTactic(world, ctx, session, keeper, rng, action, character) {
    const def = TACTIC_BY_ID.get(action.id);
    if (!def) return;
    const uses = session.used[def.id] ?? 0;
    if (uses >= def.maxUses) return;
    if (def.minQty && session.qty < def.minQty) return;
    session.used[def.id] = uses + 1;
    if (!def.free) session.patience -= 1;

    const t = keeper.traits;
    const skill = session.side === 'sell' && def.sellSkill ? def.sellSkill : def.skill;
    const modifier = skill ? Number(character?.skills?.[skill] ?? 0) : 0;
    const check = (dc) => {
        const roll = rollCheck(rng, modifier, dc, action.roll);
        session.lastRoll = { ...roll, skill, skillLabel: SKILLS[skill] };
        log(session, 'system', describeRoll(SKILLS[skill], roll), { roll: session.lastRoll, tone: roll.success ? 'good' : 'bad' });
        return roll;
    };
    const say = (key, extra) => log(session, 'keeper', line(ctx, keeper, key, vars(ctx, session, keeper, extra), rng), { tone: extra?.tone });
    const f = favorable(session.side);

    switch (def.id) {
        case 'flatter': {
            log(session, 'player', session.side === 'buy' ? 'Elogias la calidad de su mercancía y su buen ojo.' : 'Elogias su tienda y su reputación.');
            if (uses >= 1 && rng.chance(0.5)) {
                session.mood -= 0.08;
                say('flatter_again', { tone: 'warn' });
                break;
            }
            const roll = check(10 + Math.round(t.shrewdness * 6) - Math.round(t.pride * 4) + uses * 3);
            if (roll.success) {
                const mult = (roll.crit ? 2 : 1) * (uses ? 0.5 : 1);
                session.mood += (0.18 + 0.12 * t.pride) * mult;
                moveToward(session, 0.02 * mult, 0);
                say('flatter_ok', { tone: 'good' });
            } else {
                session.mood -= roll.crit ? 0.18 : 0.06;
                say('flatter_fail', { tone: 'bad' });
            }
            break;
        }
        case 'chat': {
            const topic = ctx.topics.get(action.topic);
            if (!topic) {
                session.used.chat = uses;
                if (!def.free) session.patience += 1;
                session.round -= 1;
                return;
            }
            session.topicsTalked.push(topic.id);
            log(session, 'player', topic.playerLine ?? `Sacas el tema: ${topic.label.toLowerCase()}.`);
            const topicLine = keeper.topicLines?.[topic.id];
            if (keeper.likes?.includes(topic.id)) {
                session.mood += 0.22 + 0.1 * t.warmth;
                session.patience += 2; // compensa la ronda y suma una
                learn(world, session, keeper, 'likes', topic.id);
                changeReputation(world, session.charId, keeper.id, 1);
                log(session, 'keeper', topicLine ?? line(ctx, keeper, 'chat_like', vars(ctx, session, keeper, { topic: topic.label.toLowerCase() }), rng), { tone: 'good' });
            } else if (keeper.dislikes?.includes(topic.id)) {
                session.mood -= 0.18;
                learn(world, session, keeper, 'dislikes', topic.id);
                log(session, 'keeper', line(ctx, keeper, 'chat_dislike', vars(ctx, session, keeper, { topic: topic.label.toLowerCase() }), rng), { tone: 'bad' });
            } else {
                session.mood += 0.04 * (0.5 + t.warmth);
                session.patience += 1; // charla neutra: no gasta paciencia
                log(session, 'keeper', line(ctx, keeper, 'chat_neutral', vars(ctx, session, keeper, { topic: topic.label.toLowerCase() }), rng));
            }
            break;
        }
        case 'insight': {
            log(session, 'player', 'Observas sus gestos mientras habla del precio.');
            const roll = check(10 + Math.round(t.shrewdness * 8));
            if (roll.success) {
                const spread = roll.crit ? 0.01 : 0.04;
                const lo = roundForKeeper(session, session.reservation * (1 - spread));
                const hi = roundForKeeper(session, session.reservation * (1 + spread));
                session.revealed.estimate = [Math.min(lo, hi), Math.max(lo, hi)];
                const rel = getRelation(world, session.charId, keeper.id);
                const hints = TRAIT_HINTS.filter((h) => (h.high ? t[h.trait] >= h.threshold : t[h.trait] <= h.threshold));
                const fresh = hints.filter((h) => !rel.known.traits.includes(h.text));
                const hint = fresh[0] ?? hints[0];
                if (hint) learn(world, session, keeper, 'traits', hint.text);
                const range = session.side === 'buy' ? `podría bajar hasta unos ${money(ctx, session.revealed.estimate[0])}–${money(ctx, session.revealed.estimate[1])}` : `podría pagar hasta unos ${money(ctx, session.revealed.estimate[0])}–${money(ctx, session.revealed.estimate[1])}`;
                log(session, 'system', `Intuyes que ${range}.${hint ? ` ${hint.text}` : ''}`, { tone: 'insight' });
            } else {
                if (roll.crit) {
                    session.mood -= 0.06;
                    say('insight_caught', { tone: 'warn' });
                } else {
                    log(session, 'system', 'No logras leer sus intenciones.');
                }
            }
            break;
        }
        case 'flaw': {
            const buy = session.side === 'buy';
            log(session, 'player', buy ? 'Señalas con calma algunos detalles mejorables del objeto.' : 'Destacas el estado y la calidad del objeto.');
            const item = ctx.item(session.itemId);
            const roll = check(11 + Math.round(t.shrewdness * 6) + (RARITY_INDEX[item.rarity] >= RARITY_INDEX.rare ? 2 : 0));
            if (roll.success) {
                const mult = roll.crit ? 1.6 : 1;
                moveToward(session, 0.05 * mult, 0.04 * mult);
                session.mood -= 0.03;
                say(buy ? 'flaw_ok' : 'quality_ok', { tone: 'good' });
            } else {
                session.mood -= (roll.crit ? 0.25 : 0.12) + 0.1 * t.pride;
                say(buy ? 'flaw_fail' : 'quality_fail', { tone: 'bad' });
            }
            break;
        }
        case 'competition': {
            const rival = findRival(world, ctx, session);
            if (rival) {
                session.patience += 1; // la verdad no cansa
                log(session, 'player', session.side === 'buy' ? `Comentas que en ${rival.shop.name} lo tienen por ${money(ctx, rival.unit)}.` : `Comentas que en ${rival.shop.name} te pagarían ${money(ctx, rival.unit)}.`);
                const target = session.side === 'buy' ? Math.max(session.hardLimit, rival.unit * 0.98) : Math.min(session.hardLimit, rival.unit * 1.02);
                if (f.better(target, session.reservation)) session.reservation = Math.round(target);
                const askTarget = roundForKeeper(session, rival.unit);
                if (f.better(askTarget, session.ask) && !f.better(askTarget, session.reservation)) session.ask = askTarget;
                else if (f.better(askTarget, session.ask)) session.ask = roundForKeeper(session, session.reservation);
                session.mood -= 0.03;
                say('competitor_true', { competitor: rival.shop.name, price: money(ctx, session.ask), tone: 'good' });
            } else {
                log(session, 'player', 'Dejas caer que "en otra tienda" lo tienen mejor.');
                const liedBefore = (getRelation(world, session.charId, keeper.id).memory?.lied?.n ?? 0) > 0;
                const roll = check(10 + Math.round(t.shrewdness * 9) + (liedBefore ? 3 : 0));
                if (roll.success) {
                    moveToward(session, roll.crit ? 0.08 : 0.05, 0.03);
                    say('bluff_ok', { tone: 'good' });
                } else {
                    session.mood -= roll.crit ? 0.3 : 0.2;
                    session.patience -= 1;
                    if (roll.crit) remember(world, ctx, session.charId, keeper, 'lied', { note: 'Le mintió sobre los precios de otra tienda' });
                    say('bluff_fail', { tone: 'bad' });
                }
            }
            break;
        }
        case 'bulk': {
            const pct = Math.min(0.08, 0.015 * (session.qty - 1)) * (0.5 + t.greed);
            log(session, 'player', `Propones cerrar las ${session.qty} unidades juntas.`);
            moveToward(session, pct, pct * 0.8);
            session.mood += 0.05;
            say('bulk', { tone: 'good', price: money(ctx, session.ask) });
            break;
        }
        case 'walk': {
            log(session, 'player', 'Suspiras, te encoges de hombros y haces ademán de irte.');
            const roll = check(9 + Math.round(t.shrewdness * 6) + Math.round(t.pride * 4));
            if (roll.success) {
                const gap = session.ask - session.reservation;
                const a = roundForKeeper(session, session.reservation + gap * (roll.crit ? 0.1 : 0.3));
                if (f.better(a, session.ask)) session.ask = a;
                session.mood -= 0.05;
                say('walk_back', { tone: 'good', price: money(ctx, session.ask) });
            } else if (t.pride > 0.6) {
                say('walk_let_go', { tone: 'bad' });
                finish(world, ctx, session, keeper, rng, 'failed');
            } else {
                session.mood -= 0.15;
                say('walk_shrug', { tone: 'warn' });
            }
            break;
        }
        case 'intimidate': {
            log(session, 'player', 'Te inclinas sobre el mostrador y bajas la voz, amenazante.');
            const roll = check(12 + Math.round(t.pride * 6) + Math.round(t.shrewdness * 3) + (keeper.unafraid ? 5 : 0));
            if (roll.success) {
                moveToward(session, roll.crit ? 0.12 : 0.08, roll.crit ? 0.12 : 0.08);
                session.mood -= 0.35;
                changeReputation(world, session.charId, keeper.id, -6);
                say('intimidate_ok', { tone: 'warn', price: money(ctx, session.ask) });
            } else {
                changeReputation(world, session.charId, keeper.id, -12);
                remember(world, ctx, session.charId, keeper, 'insulted', { note: 'Intentó intimidarle', rep: 0 });
                const rel = ensureRelation(world, session.charId, keeper.id);
                rel.noHaggleUntil = Math.max(rel.noHaggleUntil ?? 0, world.day + 2);
                say('intimidate_fail', { tone: 'bad' });
                finish(world, ctx, session, keeper, rng, 'failed');
            }
            break;
        }
        default:
            break;
    }
    session.mood = clamp(session.mood, -1, 1);
}

/** Otra tienda con el mismo objeto a mejor precio (para el jugador). */
function findRival(world, ctx, session) {
    const f = favorable(session.side);
    let best = null;
    const region = shopRegion(world, ctx, session.shopId);
    for (const shop of ctx.shopList) {
        if (shop.id === session.shopId || shopClosure(world, ctx, shop.id)) continue;
        // Sólo cuentan las tiendas de la misma región que hoy estén abiertas.
        if (shopRegion(world, ctx, shop.id) !== region || !availability(world, ctx, ctx.keeperOf(shop.id)).here) continue;
        const quote = session.side === 'buy'
            ? quoteBuy(world, ctx, { shopId: shop.id, itemId: session.itemId, charId: session.charId })
            : quoteSell(world, ctx, { shopId: shop.id, itemId: session.itemId, charId: session.charId });
        if (!quote?.unit || quote.locked || quote.refused) continue;
        if (session.side === 'buy' && quote.available < session.qty) continue;
        if (f.better(quote.listUnit, session.ask) && (!best || f.better(quote.listUnit, best.unit))) best = { shop, unit: quote.listUnit };
    }
    return best;
}
