/**
 * Conversación con un comerciante (fuera del regateo).
 *
 * Cada acción recibe el mundo y devuelve { world, character?, result } o
 * { error }. `result.lines` es el diálogo para la interfaz. Todas las tiradas
 * son deterministas (semilla + personaje + comerciante + día) y la mayoría de
 * acciones se pueden hacer UNA vez por día y comerciante, para que el trato se
 * construya jugando y no pulsando botones.
 *
 * Acciones: contar algo de ti (verdad o mentira), contar una historia, leerle
 * (Perspicacia), pedir rumores (gratis o pagando), invitar/aceptar una ronda,
 * regalar, favores, secretos, robar y aceptar sus pequeños regalos.
 */

import { createRng } from './rng.js';
import { cloneWorld, ensureRelation, getRelation, changeReputation, usedToday, markUsed } from './state.js';
import { evaluateDisposition, tierAtLeast, meetsAll } from './disposition.js';
import { perceivedProfile, tellableTopics } from './profile.js';
import { remember } from './memory.js';
import { availability, discover, keeperLocation } from './presence.js';
import { displayKeeper, archetypesOf } from './personality.js';
import { activeEvents } from './world-events.js';
import { line, rollCheck, describeRoll, SKILLS } from './negotiation.js';
import { matchesRule, RARITY_INDEX } from './catalog.js';
import { pay, receiveCoins, coinsInCp, formatCp } from '../money.js';
import { grantItem, takeItem, ownedUnits, recognizedItems } from './inventory.js';
import { hireTerms, contractOf } from './hiring.js';

export const DRINK_COST = 20; // 2 pp: una ronda de jarras
export const RUMOR_PRICES = Object.freeze({ comun: 100, valioso: 500, secreto: 2000 });
const RUMOR_SHARE = Object.freeze({ comun: 0.25, valioso: 0.55, secreto: 0.8 });
const VALUE_ORDER = Object.freeze({ comun: 0, valioso: 1, secreto: 2 });
const GIFT_COOLDOWN = 7;
const STEAL_MAX_PRICE = 5000;
const RUMOR_HINTS = Object.freeze({
    cierto: 'Todo encaja: parece cierto.',
    parcial: 'Hay algo de verdad, pero no es toda la historia.',
    exagerado: 'Suena muy exagerado.',
    falso: 'Huele a cuento: probablemente sea falso.',
});

// ─────────────────────────── utilidades ───────────────────────────

const who = (keeper) => keeper.short ?? keeper.name;

function prepare(world, ctx, { charId, keeperId, profile, here }) {
    const keeper = ctx.keepers.get(keeperId);
    if (!keeper) return { error: 'Ese comerciante no existe.' };
    if (here !== undefined && here !== null) {
        const status = availability(world, ctx, keeper);
        if (status.location !== here) return { error: `${who(keeper)} no está aquí.` };
        if (!status.open) return { error: status.reason ?? 'Ahora no atiende.' };
    }
    const before = evaluateDisposition(world, ctx, { keeper, charId, profile });
    const w = cloneWorld(world);
    const rel = ensureRelation(w, charId, keeper.id);
    const lines = [];
    const rng = (...extra) => createRng(world.seed, 'talk', charId ?? '_', keeper.id, world.day, ...extra);
    const say = (key, vars = {}, tone) => lines.push({ who: 'keeper', text: line(ctx, keeper, key, { name: who(keeper), ...vars }, rng(key, lines.length)), tone });
    const me = (text) => lines.push({ who: 'player', text });
    const note = (text, tone = 'info') => lines.push({ who: 'narrator', text, tone });
    return { keeper, before, w, rel, lines, rng, say, me, note };
}

function finish(p, ctx, { charId, profile }, extra = {}) {
    const after = evaluateDisposition(p.w, ctx, { keeper: p.keeper, charId, profile });
    return { world: p.w, ...extra, result: { lines: p.lines, before: p.before.score, after: after.score, tier: after.tier, ...extra.result } };
}

function check(p, character, skill, dc, action, manualRoll) {
    const modifier = Number(character?.skills?.[skill] ?? 0);
    const roll = rollCheck(p.rng('roll', action), modifier, dc, manualRoll);
    p.note(describeRoll(SKILLS[skill] ?? skill, roll), roll.success ? 'good' : 'bad');
    return { ...roll, skill, skillLabel: SKILLS[skill] };
}

function onceADay(p, action, world) {
    if (usedToday(p.rel, action, world.day)) return `Ya lo intentaste hoy con ${who(p.keeper)}. Mañana será otro día.`;
    markUsed(p.rel, action, world.day);
    return null;
}

function payFrom(character, amount) {
    if (!character) return { error: 'Elige un personaje.' };
    const res = pay(character.equipment.coins, amount);
    if (!res.ok) return { error: `No te alcanza: necesitas ${formatCp(amount)} (tienes ${formatCp(coinsInCp(character.equipment.coins))}).` };
    const next = structuredClone(character);
    next.equipment.coins = res.coins;
    return { character: next };
}

// ─────────────────────────── consultas ───────────────────────────

/** Valor (1 = normal) de un regalo para este comerciante. */
export function giftAppeal(keeper, item) {
    let mult = 1;
    let matched = false;
    for (const g of keeper.gifts ?? []) {
        if (!matchesRule(item, g.rule)) continue;
        mult = matched ? Math.max(mult, g.mult ?? 1) : g.mult ?? 1;
        matched = true;
    }
    return mult;
}

/** Rumores que este comerciante conoce y aún no te contó. */
export function rumorPool(world, ctx, keeper, rel) {
    const knows = keeper.knows ?? {};
    const active = new Set(activeEvents(world, ctx).map((e) => e.def.id));
    const flags = new Set(archetypesOf(ctx, keeper).flatMap((a) => a.flags ?? []));
    return [...ctx.rumors.values()].filter((r) => {
        if (rel?.rumors?.includes(r.id)) return false;
        const topical = (knows.topics ?? []).includes(r.topic) && (!r.region || (knows.regions ?? []).includes(r.region));
        if (!topical && !(knows.rumors ?? []).includes(r.id)) return false;
        if (r.event && !active.has(r.event) && world.eventsEnded?.[r.event] === undefined) return false;
        if (flags.has('truthful') && (r.truth === 'falso' || r.truth === 'exagerado')) return false;
        return true;
    });
}

function rumorAge(world, ctx, rumor) {
    if (!rumor.event) return null;
    return activeEvents(world, ctx).some((e) => e.def.id === rumor.event) ? 'reciente' : 'viejo';
}

/** Favores del comerciante con su estado para este personaje. */
export function favorsFor(world, ctx, keeper, charId, disposition) {
    const rel = getRelation(world, charId, keeper.id);
    return (keeper.favors ?? []).map((f) => {
        const state = rel.favors?.[f.id] ?? null;
        const open = !state || (f.repeatable && state.status !== 'active');
        return { ...f, state, available: open && tierAtLeast(disposition.tier, f.minTier ?? 'neutral'), lockedByTier: open && !tierAtLeast(disposition.tier, f.minTier ?? 'neutral') };
    });
}

/** Secretos: conocidos, listos para escuchar o con pista de cómo conseguirlos. */
export function secretsFor(world, ctx, keeper, charId, disposition) {
    const rel = getRelation(world, charId, keeper.id);
    return (keeper.secrets ?? []).map((s) => {
        const known = rel.secrets.includes(s.id);
        const reqOk = meetsAll(s.requires, { disposition, rel, world, ctx });
        const how = s.how ?? 'trust';
        const hint = how === 'investigate' ? `Quizá con ${SKILLS[s.requires?.check?.skill] ?? 'Investigación'} descubras algo.` : how === 'drink' ? 'Con unas jarras de por medio, quizá se le suelte la lengua.' : 'Te lo contará cuando confíe en ti.';
        return { id: s.id, title: known ? s.title : 'Algo que no cuenta', text: known ? s.text : '', known, how, ready: !known && reqOk, hint };
    });
}

/** Ofertas espontáneas del comerciante (invitarte, regalarte algo, pedirte un favor). */
export function merchantOffers(world, ctx, keeper, charId, disposition) {
    const rel = getRelation(world, charId, keeper.id);
    const flags = disposition.flags;
    const offers = [];
    const evening = (world.phase ?? 0) >= 2;
    if (flags.has('drinks') && evening && tierAtLeast(disposition.tier, 'amistoso') && !usedToday(rel, 'drink', world.day)
        && createRng(world.seed, 'invite', keeper.id, charId ?? '_', world.day).chance(0.7)) {
        offers.push({ id: 'drink-invite', icon: '🍺', label: `${who(keeper)} te invita a una jarra cuando cierre` });
    }
    if (flags.has('smallGifts') && tierAtLeast(disposition.tier, 'amistoso') && world.day - (rel.lastGift ?? -99) >= GIFT_COOLDOWN && smallGiftItem(world, ctx, keeper)) {
        offers.push({ id: 'small-gift', icon: '🎁', label: `${who(keeper)} tiene un detalle para ti` });
    }
    const favor = favorsFor(world, ctx, keeper, charId, disposition).find((f) => f.available);
    if (favor) offers.push({ id: 'favor', icon: '🤝', label: `${who(keeper)} necesita ayuda: «${favor.title}»`, favorId: favor.id });
    const secret = secretsFor(world, ctx, keeper, charId, disposition).find((s) => s.ready && s.how === 'trust');
    if (secret) offers.push({ id: 'secret', icon: '🤫', label: `${who(keeper)} quiere contarte algo en confianza`, secretId: secret.id });
    return offers;
}

function smallGiftItem(world, ctx, keeper) {
    const shop = ctx.shopOf(keeper.id);
    const stock = world.shops?.[shop?.id]?.stock ?? {};
    let best = null;
    for (const [itemId, entry] of Object.entries(stock)) {
        const item = ctx.item(itemId);
        if (!item || entry.requires || (!entry.unlimited && entry.qty <= 0) || item.price > 200) continue;
        if (!best || item.price > best.price) best = item;
    }
    return best;
}

/** Resumen completo para la ficha del comerciante en la interfaz. */
export function merchantSummary(world, ctx, { keeperId, charId, profile }) {
    const keeper = ctx.keepers.get(keeperId);
    if (!keeper) return null;
    const rel = getRelation(world, charId, keeper.id);
    const disposition = evaluateDisposition(world, ctx, { keeper, charId, profile });
    const known = new Set(rel.known?.traits ?? []);
    const shop = ctx.shopOf(keeper.id);
    const stock = world.shops?.[shop?.id]?.stock ?? {};
    const lockedCount = Object.values(stock).filter((e) => e.requires).length;
    return {
        keeper: displayKeeper(keeper, rel),
        shop,
        status: availability(world, ctx, keeper),
        location: ctx.location(keeperLocation(world, ctx, keeper)),
        disposition,
        reasons: disposition.reasons.map((r) => (r.hidden ? { ...r, label: r.value > 0 ? 'Algo en ti le agrada' : 'Algo en ti le incomoda', masked: true } : r)),
        archetypes: archetypesOf(ctx, keeper).map((a) => ({ ...a, known: known.has(`arch:${a.id}`) })),
        faction: keeper.faction ? ctx.factions.get(keeper.faction) ?? null : null,
        relation: rel,
        offers: merchantOffers(world, ctx, keeper, charId, disposition),
        favors: favorsFor(world, ctx, keeper, charId, disposition),
        secrets: secretsFor(world, ctx, keeper, charId, disposition),
        tellable: tellableTopics(profile, ctx.factions, ctx.regions).filter((t) => !isTold(rel, t.id)),
        lockedCount,
        rumorsLeft: rumorPool(world, ctx, keeper, rel).length,
        usedToday: rel.daily?.day === world.day ? rel.daily.used : [],
        perceived: perceivedProfile(profile, rel),
        profession: ctx.professions?.get(keeper.profession) ?? null,
        hire: hireTerms(world, ctx, { keeper, charId, profile }),
        contract: contractOf(world, keeper.id)?.charId === (charId ?? '_') ? contractOf(world, keeper.id) : null,
    };
}

function isTold(rel, topic) {
    if (topic.startsWith('faction:')) return (rel.told?.factions ?? []).includes(topic.slice(8));
    return Boolean(rel.told?.[topic]);
}

// ─────────────────────────── acciones ───────────────────────────

/** Contarle algo verdadero de ti. */
export function tell(world, ctx, opts) {
    const { topic } = opts;
    const p = prepare(world, ctx, opts);
    if (p.error) return p;
    const topics = tellableTopics(opts.profile, ctx.factions, ctx.regions);
    const t = topics.find((x) => x.id === topic);
    if (!t) return { error: 'No hay nada que contar sobre eso.' };
    if (isTold(p.rel, topic)) return { error: 'Ya se lo contaste.' };
    if (topic.startsWith('faction:')) (p.rel.told.factions ??= []).push(topic.slice(8));
    else p.rel.told[topic] = true;
    // Si le habías mentido sobre lo mismo, la verdad sustituye a la mentira.
    if (topic === 'background' || topic === 'origin') delete p.rel.claims[topic];
    p.me(`Le cuentas ${t.label.charAt(0).toLowerCase()}${t.label.slice(1)}.${t.detail ? ` «${t.detail}»` : ''}`);
    const after = evaluateDisposition(p.w, ctx, { keeper: p.keeper, charId: opts.charId, profile: opts.profile });
    const delta = after.score - p.before.score;
    if (delta > 2) p.say('tell_like', {}, 'good');
    else if (delta < -2) p.say('tell_dislike', {}, 'bad');
    else p.say('tell_neutral');
    if (delta >= 0) changeReputation(p.w, opts.charId, p.keeper.id, 1);
    return finish(p, ctx, opts);
}

/** Contarle una historia de tus aventuras (Interpretación o Persuasión). */
export function story(world, ctx, opts) {
    const p = prepare(world, ctx, opts);
    if (p.error) return p;
    const used = onceADay(p, 'story', world);
    if (used) return { error: used };
    const skill = Number(opts.character?.skills?.performance ?? -99) >= Number(opts.character?.skills?.persuasion ?? -99) ? 'performance' : 'persuasion';
    p.me('Le cuentas una de tus aventuras.');
    const loves = p.before.flags.has('lovesStories');
    const roll = check(p, opts.character, skill, loves ? 11 : 13, 'story', opts.roll);
    if (roll.success) {
        changeReputation(p.w, opts.charId, p.keeper.id, loves ? 6 : 3);
        if (loves || roll.crit) remember(p.w, ctx, opts.charId, p.keeper, 'told-story', { note: opts.note ?? '' });
        p.say('story_good', {}, 'good');
    } else {
        p.say('story_meh');
    }
    return finish(p, ctx, opts, { result: { roll } });
}

/** Mentirle sobre tu trasfondo, origen o facción (Engaño). */
export function lie(world, ctx, opts) {
    const { topic, value } = opts;
    if (!['background', 'origin', 'faction'].includes(topic) || !value) return { error: 'Elige qué quieres hacerle creer.' };
    const p = prepare(world, ctx, opts);
    if (p.error) return p;
    const used = onceADay(p, 'lie', world);
    if (used) return { error: used };
    const label = topic === 'faction' ? ctx.factions.get(value)?.name ?? value : topic === 'origin' ? ctx.regions.get(value)?.name ?? value : value;
    p.me(topic === 'faction' ? `Le aseguras que eres de ${label}.` : topic === 'origin' ? `Le dices que vienes de ${label}.` : `Le cuentas que eres ${label}.`);
    const t = p.keeper.traits;
    const liedBefore = (p.rel.memory?.lied?.n ?? 0) > 0;
    const dc = 10 + Math.round(t.shrewdness * 8) + (liedBefore ? 3 : 0) + (p.before.flags.has('hatesLiars') ? 2 : 0);
    const roll = check(p, opts.character, 'deception', dc, 'lie', opts.roll);
    if (roll.success) {
        if (topic === 'faction') p.rel.claims.factions = [...new Set([...(p.rel.claims.factions ?? []), value])];
        else p.rel.claims[topic] = value;
        p.say('lie_ok', {}, 'good');
    } else {
        remember(p.w, ctx, opts.charId, p.keeper, 'lied', { note: `Dijo ser ${label}`, rep: p.before.flags.has('hatesLiars') ? -16 : undefined });
        p.say('lie_caught', {}, 'bad');
    }
    return finish(p, ctx, opts, { result: { roll } });
}

/** Leerle (Perspicacia): descubre sus prejuicios ocultos y su carácter. */
export function read(world, ctx, opts) {
    const p = prepare(world, ctx, opts);
    if (p.error) return p;
    const used = onceADay(p, 'read', world);
    if (used) return { error: used };
    p.me(`Observas con atención a ${who(p.keeper)} mientras habla.`);
    const roll = check(p, opts.character, 'insight', 10 + Math.round(p.keeper.traits.shrewdness * 6), 'read', opts.roll);
    const learned = [];
    if (roll.success) {
        for (const r of p.before.reasons) {
            if (r.hidden && r.key && !p.rel.known.traits.includes(r.key)) {
                p.rel.known.traits.push(r.key);
                learned.push(r.realLabel ?? r.label);
            }
        }
        for (const a of archetypesOf(ctx, p.keeper)) {
            const key = `arch:${a.id}`;
            if (!p.rel.known.traits.includes(key) && (learned.length < 3 || roll.crit)) {
                p.rel.known.traits.push(key);
                learned.push(`${a.icon} ${a.label}: ${a.description}`);
                if (!roll.crit) break;
            }
        }
        if (learned.length) learned.forEach((l) => p.note(`Descubres: ${l}`, 'good'));
        else p.note('No notas nada que no supieras ya.');
    } else {
        p.note('No logras leer qué piensa de verdad.');
    }
    return finish(p, ctx, opts, { result: { roll, learned } });
}

/** Pedir rumores. Si no confía lo bastante y vende información, `pay: true` paga el precio. */
export function askRumor(world, ctx, opts) {
    const p = prepare(world, ctx, opts);
    if (p.error) return p;
    const pool = rumorPool(world, ctx, p.keeper, p.rel);
    p.me(opts.pay ? 'Pones unas monedas sobre el mostrador: «¿Qué se cuenta por ahí?»' : '«¿Qué se cuenta por ahí?»');
    if (!pool.length) {
        p.say('rumor_none');
        return finish(p, ctx, opts);
    }
    const share = p.before.share;
    const free = pool.filter((r) => share >= RUMOR_SHARE[r.value ?? 'comun']);
    let rumor = null;
    let character = null;
    if (opts.pay) {
        if (!p.before.flags.has('sellsInformation') && !p.before.flags.has('bribable')) return { error: `${who(p.keeper)} no vende lo que sabe.` };
        if (usedToday(p.rel, 'rumor-paid', world.day)) return { error: 'Por hoy ya te contó lo que sabía.' };
        rumor = pool.sort((a, b) => VALUE_ORDER[b.value ?? 'comun'] - VALUE_ORDER[a.value ?? 'comun'])[0];
        const price = RUMOR_PRICES[rumor.value ?? 'comun'];
        const paid = payFrom(opts.character, price);
        if (paid.error) return paid;
        character = paid.character;
        markUsed(p.rel, 'rumor-paid', world.day);
        p.say('rumor_price', { price: formatCp(price) });
    } else {
        const used = onceADay(p, 'rumor', world);
        if (used) return { error: used };
        if (!free.length) {
            const sells = p.before.flags.has('sellsInformation') || p.before.flags.has('bribable');
            const cheapest = pool.reduce((m, r) => Math.min(m, RUMOR_PRICES[r.value ?? 'comun']), Infinity);
            p.say(sells ? 'rumor_price' : 'rumor_refuse', { price: formatCp(cheapest) }, sells ? undefined : 'bad');
            return finish(p, ctx, opts, { result: { canPay: sells, price: sells ? cheapest : null } });
        }
        rumor = p.rng('pick').pick(free.sort((a, b) => VALUE_ORDER[b.value ?? 'comun'] - VALUE_ORDER[a.value ?? 'comun']).slice(0, 3));
    }
    learnRumor(p.w, ctx, opts.charId, p.keeper, rumor);
    p.rel.rumors.push(rumor.id);
    p.say('rumor_share');
    p.lines.push({ who: 'keeper', text: `«${rumor.text}»`, tone: 'rumor' });
    if (p.before.flags.has('truthful')) p.note(`${who(p.keeper)} no es de los que mienten.`);
    if (rumor.reveals && ctx.location(rumor.reveals)) p.note(`Nuevo lugar en tu mapa: ${ctx.location(rumor.reveals).name}`, 'good');
    return finish(p, ctx, opts, { character, result: { rumor: rumor.id } });
}

/** Apunta un rumor en el diario del personaje (y descubre lo que revele). */
export function learnRumor(world, ctx, charId, keeper, rumor) {
    const key = charId ?? '_';
    world.journal ??= {};
    const list = (world.journal[key] ??= []);
    if (!list.some((j) => j.rumorId === rumor.id)) list.unshift({ rumorId: rumor.id, keeperId: keeper?.id ?? null, day: world.day, age: rumorAge(world, ctx, rumor), verdict: null });
    if (rumor.reveals) {
        if (ctx.location(rumor.reveals)) discover(world, charId, { location: rumor.reveals });
        else if (ctx.keepers.get(rumor.reveals)) discover(world, charId, { keeper: rumor.reveals });
    }
}

/** Diario de rumores del personaje. */
export function journalOf(world, ctx, charId) {
    return (world.journal?.[charId ?? '_'] ?? []).map((j) => {
        const rumor = ctx.rumors.get(j.rumorId);
        const keeper = ctx.keepers.get(j.keeperId);
        return rumor ? { ...j, rumor, from: keeper ? displayKeeper(keeper, getRelation(world, charId, keeper.id)).short : null, hint: j.verdict ? RUMOR_HINTS[j.verdict] : null } : null;
    }).filter(Boolean);
}

/** Valorar un rumor del diario (Perspicacia, una vez por rumor). */
export function verifyRumor(world, ctx, { charId, rumorId, character, roll: manual }) {
    const rumor = ctx.rumors.get(rumorId);
    const list = world.journal?.[charId ?? '_'] ?? [];
    const idx = list.findIndex((j) => j.rumorId === rumorId);
    if (!rumor || idx < 0) return { error: 'No conoces ese rumor.' };
    if (list[idx].checked) return { error: 'Ya le diste vueltas a ese rumor.' };
    const w = cloneWorld(world);
    const entry = w.journal[charId ?? '_'][idx];
    entry.checked = true;
    const modifier = Number(character?.skills?.insight ?? 0);
    const roll = rollCheck(createRng(world.seed, 'verify', charId ?? '_', rumorId), modifier, 13, manual);
    if (roll.success) entry.verdict = rumor.truth;
    return { world: w, result: { roll, text: describeRoll(SKILLS.insight, roll), hint: roll.success ? RUMOR_HINTS[rumor.truth] : 'No sabrías decir si es verdad.' } };
}

/**
 * Tomar algo juntos. `accept`: aceptas SU invitación; `payFirst`: pagas tú la
 * ronda antes de que él saque la bolsa (le gana el corazón).
 */
export function drink(world, ctx, opts) {
    const p = prepare(world, ctx, opts);
    if (p.error) return p;
    if (usedToday(p.rel, 'drink', world.day)) return { error: 'Ya bebisteis juntos hoy.' };
    const invited = opts.accept && merchantOffers(world, ctx, p.keeper, opts.charId, p.before).some((o) => o.id === 'drink-invite');
    if (opts.accept && !invited) return { error: 'No te ha invitado.' };
    let character = null;
    const likes = p.before.flags.has('drinks');
    if (!invited) {
        p.me('«¿Te apetece una jarra? Invito yo.»');
        const willing = likes ? tierAtLeast(p.before.tier, 'neutral') : tierAtLeast(p.before.tier, 'amistoso') || (tierAtLeast(p.before.tier, 'neutral') && p.rng('drink').chance(p.keeper.traits.warmth));
        markUsed(p.rel, 'drink', world.day);
        if (!willing) {
            p.say('drink_decline', {}, 'bad');
            return finish(p, ctx, opts);
        }
    } else {
        p.me(opts.payFirst ? 'Aceptas… y pagas la ronda antes de que pueda sacar la bolsa.' : 'Aceptas su invitación.');
        markUsed(p.rel, 'drink', world.day);
    }
    if (!invited || opts.payFirst) {
        const paid = payFrom(opts.character, DRINK_COST);
        if (paid.error) return paid;
        character = paid.character;
    }
    p.say(invited && opts.payFirst ? 'drink_paid_first' : 'drink_accept', {}, 'good');
    changeReputation(p.w, opts.charId, p.keeper.id, (likes ? 4 : 2) + (invited ? 1 : 0), { dailyCap: 10 });
    remember(p.w, ctx, opts.charId, p.keeper, 'drank');
    if (invited && opts.payFirst) remember(p.w, ctx, opts.charId, p.keeper, 'paid-round');
    // Con la jarra en la mano se le suelta la lengua: secretos «de taberna» y un rumor.
    const disp = evaluateDisposition(p.w, ctx, { keeper: p.keeper, charId: opts.charId, profile: opts.profile });
    for (const s of p.keeper.secrets ?? []) {
        if (s.how === 'drink' && !p.rel.secrets.includes(s.id) && meetsAll(s.requires, { disposition: disp, rel: p.rel, world: p.w, ctx })) revealSecret(p, ctx, opts, s);
    }
    const pool = rumorPool(p.w, ctx, p.keeper, p.rel).filter((r) => disp.share + 0.2 >= RUMOR_SHARE[r.value ?? 'comun']);
    if (pool.length) {
        const rumor = p.rng('drink-rumor').pick(pool);
        learnRumor(p.w, ctx, opts.charId, p.keeper, rumor);
        p.rel.rumors.push(rumor.id);
        p.lines.push({ who: 'keeper', text: `Entre trago y trago: «${rumor.text}»`, tone: 'rumor' });
    }
    return finish(p, ctx, opts, { character });
}

/** Regalarle un objeto de tu inventario. */
export function gift(world, ctx, opts) {
    const p = prepare(world, ctx, opts);
    if (p.error) return p;
    const item = ctx.item(opts.itemId);
    if (!item || !opts.character || ownedUnits(opts.character, item) < 1) return { error: 'No tienes ese objeto.' };
    const used = onceADay(p, 'gift', world);
    if (used) return { error: used };
    const taken = takeItem(opts.character, item, 1);
    if (taken.error) return taken;
    p.me(`Le regalas ${item.name}.`);
    const appeal = giftAppeal(p.keeper, item);
    const base = Math.log10(item.price / 10 + 1) * 3;
    const delta = Math.round(base * appeal);
    if (appeal < 0.6) p.say('gift_bad', {}, 'bad');
    else if (appeal < 0.9 || delta < 2) p.say('gift_meh');
    else if (appeal >= 1.3) p.say('gift_love', {}, 'good');
    else p.say('gift_ok', {}, 'good');
    if (appeal >= 0.6 && delta > 0) {
        changeReputation(p.w, opts.charId, p.keeper.id, delta, { dailyCap: 15 });
        remember(p.w, ctx, opts.charId, p.keeper, 'gift', { note: item.name });
        if (appeal >= 1.3) p.note(`A ${who(p.keeper)} le encantan este tipo de regalos.`, 'good');
    }
    return finish(p, ctx, opts, { character: taken.character, result: { appeal } });
}

/** Aceptar su pequeño regalo (comerciantes generosos). */
export function claimGift(world, ctx, opts) {
    const p = prepare(world, ctx, opts);
    if (p.error) return p;
    if (!merchantOffers(world, ctx, p.keeper, opts.charId, p.before).some((o) => o.id === 'small-gift')) return { error: 'No tiene nada para ti ahora.' };
    const item = smallGiftItem(p.w, ctx, p.keeper);
    if (!item || !opts.character) return { error: 'No tiene nada para ti ahora.' };
    const shop = ctx.shopOf(p.keeper.id);
    const entry = p.w.shops[shop.id].stock[item.id];
    if (!entry.unlimited) entry.qty -= 1;
    p.rel.lastGift = world.day;
    p.say('small_gift', {}, 'good');
    p.note(`Recibes: ${item.name}.`, 'good');
    return finish(p, ctx, opts, { character: grantItem(opts.character, item, 1), result: { itemId: item.id } });
}

function revealSecret(p, ctx, opts, secret) {
    p.rel.secrets.push(secret.id);
    p.say('secret_reveal', {}, 'good');
    p.lines.push({ who: 'keeper', text: secret.text, tone: 'secret' });
    const r = secret.reward ?? {};
    if (r.rep) changeReputation(p.w, opts.charId, p.keeper.id, r.rep, { dailyCap: Math.max(6, Math.abs(r.rep)) });
    for (const id of r.unlock ?? []) {
        if (!p.rel.unlocks.includes(id)) p.rel.unlocks.push(id);
        p.note(`${who(p.keeper)} te reservará: ${ctx.item(id)?.name ?? id}.`, 'good');
    }
    if (r.reveals) {
        if (ctx.location(r.reveals)) discover(p.w, opts.charId, { location: r.reveals });
        else discover(p.w, opts.charId, { keeper: r.reveals });
        p.note(`Nuevo lugar en tu mapa: ${ctx.location(r.reveals)?.name ?? r.reveals}.`, 'good');
    }
    if (r.rumor && ctx.rumors.get(r.rumor)) {
        learnRumor(p.w, ctx, opts.charId, p.keeper, ctx.rumors.get(r.rumor));
        if (!p.rel.rumors.includes(r.rumor)) p.rel.rumors.push(r.rumor);
    }
    if (p.keeper.disguise?.revealedBy === secret.id) p.note(`Ahora sabes quién es: ${p.keeper.name}.`, 'good');
}

/** Escuchar o descubrir un secreto (confianza o investigación). */
export function secret(world, ctx, opts) {
    const p = prepare(world, ctx, opts);
    if (p.error) return p;
    const s = (p.keeper.secrets ?? []).find((x) => x.id === opts.secretId);
    if (!s) return { error: 'No hay nada que descubrir ahí.' };
    if (p.rel.secrets.includes(s.id)) return { error: 'Eso ya lo sabes.' };
    const how = s.how ?? 'trust';
    if (how === 'drink') return { error: 'Eso sólo lo contaría con unas jarras de por medio.' };
    const { check: req, ...rest } = s.requires ?? {};
    if (!meetsAll(rest, { disposition: p.before, rel: p.rel, world, ctx })) {
        p.say('secret_fail');
        return finish(p, ctx, opts);
    }
    if (how === 'investigate') {
        const used = onceADay(p, `secret:${s.id}`, world);
        if (used) return { error: used };
        p.me('Haces preguntas discretas y te fijas en los detalles.');
        const roll = check(p, opts.character, req?.skill ?? 'investigation', req?.dc ?? 14, `secret:${s.id}`, opts.roll);
        if (!roll.success) {
            p.say('secret_fail');
            return finish(p, ctx, opts, { result: { roll } });
        }
        revealSecret(p, ctx, opts, s);
        return finish(p, ctx, opts, { result: { roll } });
    }
    revealSecret(p, ctx, opts, s);
    return finish(p, ctx, opts);
}

/** Aceptar un favor. */
export function acceptFavor(world, ctx, opts) {
    const p = prepare(world, ctx, opts);
    if (p.error) return p;
    const f = favorsFor(world, ctx, p.keeper, opts.charId, p.before).find((x) => x.id === opts.favorId);
    if (!f) return { error: 'Ese favor no existe.' };
    if (!f.available) return { error: f.lockedByTier ? 'Todavía no confía lo bastante en ti para pedírtelo.' : 'Ese favor ya está en marcha o resuelto.' };
    p.rel.favors[f.id] = { status: 'active', day: world.day, due: f.days ? world.day + f.days : null };
    p.say('favor_ask');
    p.lines.push({ who: 'keeper', text: f.text });
    p.say('favor_accept', {}, 'good');
    if (f.days) p.note(`Tienes ${f.days} días (hasta el día ${world.day + f.days}). Romper tu palabra tiene consecuencias.`, 'warn');
    return finish(p, ctx, opts);
}

function rewardFavor(p, ctx, opts, f, character) {
    const state = p.rel.favors[f.id];
    const onTime = state?.due ? opts.world.day <= state.due : false;
    p.rel.favors[f.id] = { ...state, status: 'done', doneDay: opts.world.day };
    remember(p.w, ctx, opts.charId, p.keeper, 'favor', { note: f.title });
    if (onTime) remember(p.w, ctx, opts.charId, p.keeper, 'promise-kept');
    const r = f.reward ?? {};
    if (r.rep) changeReputation(p.w, opts.charId, p.keeper.id, r.rep, { dailyCap: Math.max(6, r.rep) });
    if (r.memory) remember(p.w, ctx, opts.charId, p.keeper, r.memory, { note: f.title });
    let next = character;
    if (r.coins && next) {
        next = structuredClone(next);
        next.equipment.coins = receiveCoins(next.equipment.coins, r.coins);
        p.note(`Recibes ${formatCp(r.coins)}.`, 'good');
    }
    if (r.discount) {
        p.rel.discount = { pct: r.discount.pct, until: opts.world.day + (r.discount.days ?? 7) };
        p.note(`Descuento del ${Math.round(r.discount.pct * 100)} % durante ${r.discount.days ?? 7} días.`, 'good');
    }
    for (const id of r.unlock ?? []) {
        if (!p.rel.unlocks.includes(id)) p.rel.unlocks.push(id);
        p.note(`Te reservará: ${ctx.item(id)?.name ?? id}.`, 'good');
    }
    if (r.standing?.faction) {
        const key = opts.charId ?? '_';
        p.w.standing[key] ??= {};
        p.w.standing[key][r.standing.faction] = Math.max(-100, Math.min(100, (p.w.standing[key][r.standing.faction] ?? 0) + (r.standing.value ?? 0)));
        p.note(`Tu reputación con ${ctx.factions.get(r.standing.faction)?.name ?? r.standing.faction} mejora.`, 'good');
    }
    if (r.secret) {
        const s = (p.keeper.secrets ?? []).find((x) => x.id === r.secret);
        if (s && !p.rel.secrets.includes(s.id)) revealSecret(p, ctx, opts, s);
    }
    p.say('favor_done', {}, 'good');
    return next;
}

/** Entregar lo que pidió (favores de tipo «deliver»). */
export function deliverFavor(world, ctx, opts) {
    const p = prepare(world, ctx, opts);
    if (p.error) return p;
    const f = (p.keeper.favors ?? []).find((x) => x.id === opts.favorId);
    if (!f || f.kind !== 'deliver') return { error: 'Ese favor no se resuelve con una entrega.' };
    if (p.rel.favors[f.id]?.status !== 'active') return { error: 'No tienes ese favor en marcha.' };
    const item = ctx.item(f.item);
    const qty = f.qty ?? 1;
    if (!item || !opts.character || ownedUnits(opts.character, item) < qty) return { error: `Necesitas ${qty} × ${item?.name ?? f.item}.` };
    const taken = takeItem(opts.character, item, qty);
    if (taken.error) return taken;
    p.me(`Le entregas ${qty} × ${item.name}.`);
    const character = rewardFavor(p, ctx, { ...opts, world }, f, taken.character);
    return finish(p, ctx, opts, { character });
}

/** El DM da por cumplido un favor de tipo «task». */
export function completeFavor(world, ctx, opts) {
    const keeper = ctx.keepers.get(opts.keeperId);
    if (!keeper) return { error: 'Ese comerciante no existe.' };
    const p = prepare(world, ctx, { ...opts, here: null });
    const f = (keeper.favors ?? []).find((x) => x.id === opts.favorId);
    if (!f) return { error: 'Ese favor no existe.' };
    if (p.rel.favors[f.id]?.status !== 'active') return { error: 'Ese favor no está en marcha.' };
    p.note(`El DM confirma: «${f.title}» cumplido.`, 'good');
    const character = rewardFavor(p, ctx, { ...opts, world }, f, opts.character);
    return finish(p, ctx, opts, { character });
}

/** Renunciar a un favor aceptado (es romper tu palabra). */
export function abandonFavor(world, ctx, opts) {
    const p = prepare(world, ctx, { ...opts, here: null });
    if (p.error) return p;
    const state = p.rel.favors[opts.favorId];
    if (state?.status !== 'active') return { error: 'No tienes ese favor en marcha.' };
    p.rel.favors[opts.favorId] = { ...state, status: 'failed' };
    remember(p.w, ctx, opts.charId, p.keeper, 'promise-broken', { note: (p.keeper.favors ?? []).find((x) => x.id === opts.favorId)?.title ?? '' });
    p.say('favor_late', {}, 'bad');
    return finish(p, ctx, opts);
}

/** Robar algo del mostrador (Juego de Manos). Si te pillan, lo recordará. */
export function steal(world, ctx, opts) {
    const p = prepare(world, ctx, opts);
    if (p.error) return p;
    const shop = ctx.shopOf(p.keeper.id);
    const item = ctx.item(opts.itemId);
    const entry = p.w.shops?.[shop?.id]?.stock?.[opts.itemId];
    if (!item || !entry || (!entry.unlimited && entry.qty < 1)) return { error: 'Eso no está al alcance.' };
    if (entry.requires) return { error: 'Lo guarda bajo llave.' };
    if (item.price > STEAL_MAX_PRICE || RARITY_INDEX[item.rarity] > RARITY_INDEX.uncommon) return { error: 'Demasiado vigilado para intentarlo.' };
    if (!opts.character) return { error: 'Elige un personaje.' };
    const used = onceADay(p, 'steal', world);
    if (used) return { error: used };
    p.me(`Intentas deslizar ${item.name} en tu bolsa sin que te vea.`);
    const night = (world.phase ?? 0) >= 3 ? -2 : 0;
    const dc = 10 + Math.round(p.keeper.traits.shrewdness * 8) + RARITY_INDEX[item.rarity] * 3 + night;
    const roll = check(p, opts.character, 'sleight', dc, 'steal', opts.roll);
    if (roll.success) {
        if (!entry.unlimited) entry.qty -= 1;
        remember(p.w, ctx, opts.charId, p.keeper, 'stole-unnoticed', { note: item.name });
        p.note(`Nadie se ha dado cuenta. Te llevas ${item.name}.`, 'good');
        return finish(p, ctx, opts, { character: grantItem(opts.character, item, 1), result: { roll, stolen: item.id } });
    }
    remember(p.w, ctx, opts.charId, p.keeper, 'stole', { note: item.name });
    p.rel.banUntil = world.day + 6;
    p.say('steal_caught', {}, 'bad');
    p.note(`${who(p.keeper)} no querrá comerciar contigo durante una semana.`, 'bad');
    return finish(p, ctx, opts, { result: { roll } });
}

/** Objetos de tu inventario que podrías regalarle (con su atractivo). */
export function giftable(ctx, keeper, character) {
    if (!character) return [];
    return recognizedItems(character, ctx.catalog).map(({ item, units }) => ({ item, units, appeal: giftAppeal(keeper, item) }));
}

// ─────────────────────────── herramientas del DM ───────────────────────────

/** El DM registra un suceso de la partida en la memoria del comerciante. */
export function dmRemember(world, ctx, { charId, keeperId, type, note = '' }) {
    const keeper = ctx.keepers.get(keeperId);
    if (!keeper) return { error: 'Ese comerciante no existe.' };
    const w = cloneWorld(world);
    const applied = remember(w, ctx, charId, keeper, type, { note });
    return { world: w, result: { applied } };
}

/** El DM fija la reputación del personaje con una facción (−100..100). */
export function setStanding(world, ctx, { charId, factionId, value }) {
    if (!ctx.factions.get(factionId)) return { error: 'Esa facción no existe.' };
    const w = cloneWorld(world);
    const key = charId ?? '_';
    w.standing[key] ??= {};
    w.standing[key][factionId] = Math.max(-100, Math.min(100, Math.round(Number(value) || 0)));
    return { world: w };
}
