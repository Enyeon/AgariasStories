/**
 * Gremio de aventureros (Lord 100): un establecimiento oficial en cada piso.
 *
 * Tres funciones:
 *  1. Tablón de misiones: las del Gremio (generadas por piso y semana, sin
 *     ocupar espacio hasta que alguien las acepta) y las que publican los
 *     jugadores (misiones PJ). Aceptar exige una licencia de rango suficiente.
 *  2. Licencias F → SSS: se obtienen con una evaluación (preguntas, pruebas de
 *     habilidad y una situación). Ascender pide misiones completadas.
 *  3. Servicios: profesionales que buscan clientes (mercenarios, guías,
 *     alquimistas, expertos…), distintos en cada piso.
 *
 * Por qué funciona así:
 *  - Las fichas viven en el dispositivo de cada jugador. Quien publica una
 *    misión deja la recompensa EN DEPÓSITO en el Gremio (se le cobra al
 *    publicar), y cada aventurero cobra su parte cuando vuelve al Gremio
 *    (igual que el saldo de los empleados). Así nadie depende de que el otro
 *    esté conectado y nadie puede prometer dinero que no tiene.
 *  - Todo vive en `world.guild` (misiones, licencias, contratos) y se poda:
 *    el mercado tiene un tamaño máximo.
 *  - El tamaño, los rangos habituales, las criaturas, los materiales y las
 *    normas de cada Gremio salen del piso (ctx.guild.profile(floor)).
 *  - Abrir un Gremio no da acceso a otros pisos: el Gremio vive en su piso y
 *    sigue las reglas de progresión de la Torre (domain/shop/floors.js).
 *
 * Funciones puras: reciben un mundo y devuelven uno nuevo.
 */

import { cloneWorld } from './state.js';
import { createRng } from './rng.js';
import { availability } from './presence.js';
import { rollCheck, describeRoll } from './negotiation.js';
import { pay, receiveCoins, coinsInCp, formatCp, niceRound } from '../money.js';

export const QUEST_LIMIT = 150;
export const HIRE_LIMIT = 100;
export const EVAL_COOLDOWN = 7;
const KEEP_DAYS = 30;
const FINAL = new Set(['completada', 'fallida', 'cancelada']);

const week = (day) => Math.floor((Math.max(1, day) - 1) / 7);
const clampInt = (v, min, max, fallback = min) => {
    const n = Math.trunc(Number(v));
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const text = (v, max) => String(v ?? '').replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, max);
const fill = (tpl, vars) => String(tpl).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
const lower = (s) => (s ? s[0].toLocaleLowerCase('es') + s.slice(1) : s);

// ── Datos y rangos ───────────────────────────────────────────────────────

export const guildData = (ctx) => ctx.guild?.data ?? null;
export const ranks = (ctx) => guildData(ctx)?.ranks ?? [];
export const rankIndex = (ctx, id) => ranks(ctx).findIndex((r) => r.id === id);
export const rankOf = (ctx, id) => ranks(ctx).find((r) => r.id === id) ?? null;

/** Nombre de la reputación según los puntos acumulados. */
export function reputationLabel(points = 0) {
    if (points >= 150) return 'Leyenda de la Torre';
    if (points >= 60) return 'Renombrado';
    if (points >= 20) return 'Respetado';
    if (points >= 5) return 'Conocido';
    return 'Recién llegado';
}

/** Gremio de una tienda (o null si esa tienda no es un Gremio). */
export function guildOfShop(ctx, shopId) {
    if (!ctx.guild) return null;
    const keeper = ctx.keeperOf(shopId);
    if (!keeper || keeper.profession !== 'gremio' || !keeper.floor) return null;
    const profile = ctx.guild.profile(keeper.floor);
    if (!profile) return null;
    const prestige = guildData(ctx).prestige.find((p) => p.id === profile.prestige) ?? guildData(ctx).prestige[0];
    const rng = createRng('guild-norms', keeper.floor);
    const norms = rng.shuffle(guildData(ctx).norms).slice(0, 2 + profile.prestige);
    return { shopId, keeper, floor: keeper.floor, profile, prestige, norms, name: ctx.shop(shopId)?.name ?? prestige.label };
}

/** El Gremio del piso indicado. */
export function guildOnFloor(ctx, floor) {
    for (const shop of ctx.shopList ?? []) {
        const g = guildOfShop(ctx, shop.id);
        if (g?.floor === floor) return g;
    }
    return null;
}

function ensure(w) {
    w.guild ??= {};
    w.guild.quests = Array.isArray(w.guild.quests) ? w.guild.quests : [];
    w.guild.licenses ??= {};
    w.guild.hires = Array.isArray(w.guild.hires) ? w.guild.hires : [];
    return w.guild;
}

/** Licencia y reputación de un personaje (aunque aún no tenga rango). */
export function licenseOf(world, charId) {
    const l = world.guild?.licenses?.[charId ?? '_'];
    return {
        rank: l?.rank ?? null,
        since: l?.since ?? null,
        floor: l?.floor ?? null,
        points: l?.points ?? 0,
        completed: l?.completed ?? 0,
        byRank: l?.byRank ?? {},
        attempts: l?.attempts ?? {},
        history: l?.history ?? [],
        name: l?.name ?? null,
        reputation: reputationLabel(l?.points ?? 0),
    };
}

function licenseEntry(g, charId, charName) {
    const l = (g.licenses[charId] ??= { rank: null, points: 0, completed: 0, byRank: {}, attempts: {}, history: [] });
    if (charName) l.name = charName;
    return l;
}

/** ¿Puede este rango de licencia aceptar una misión de este rango? (F no pide licencia). */
export function canTakeRank(ctx, licenseRank, questRank) {
    const q = rankIndex(ctx, questRank);
    if (q <= 0) return true;
    const l = licenseRank ? rankIndex(ctx, licenseRank) : -1;
    return l >= q;
}

/** Hay que estar en el Gremio, y que esté abierto. */
function atGuild(world, ctx, guild, here) {
    if (here === undefined) return null;
    const status = availability(world, ctx, guild.keeper);
    if (!status.open) return status.reason ?? 'El Gremio está cerrado ahora.';
    if (status.location !== here) return 'Tienes que estar en el Gremio para hacerlo.';
    return null;
}

function prune(world) {
    const g = ensure(world);
    const old = (q) => FINAL.has(q.status) && (q.resolvedDay ?? q.postedDay) < world.day - KEEP_DAYS && !pendingClaims(q).length;
    g.quests = g.quests.filter((q) => !old(q));
    if (g.quests.length > QUEST_LIMIT) {
        const finals = g.quests.filter((q) => FINAL.has(q.status) && !pendingClaims(q).length);
        const drop = new Set(finals.slice(0, g.quests.length - QUEST_LIMIT).map((q) => q.id));
        g.quests = g.quests.filter((q) => !drop.has(q.id));
    }
    g.hires = g.hires.filter((h) => h.until >= world.day - KEEP_DAYS).slice(-HIRE_LIMIT);
}

// ── Misiones ─────────────────────────────────────────────────────────────

/** Misiones del Gremio de este piso para la semana actual (no se guardan hasta aceptarlas). */
export function generatedQuests(world, ctx, guild) {
    const G = guildData(ctx);
    const { profile } = guild;
    const wk = week(world.day);
    const rng = createRng(world.seed, 'guild-board', guild.floor, wk);
    const count = guild.prestige.board;
    const templates = rng.shuffle(G.board); // sin repetir encargo en el mismo tablón
    const out = [];
    for (let i = 0; i < count; i++) {
        const rIdx = rng.int(profile.rankMin, profile.rankMax);
        const rank = G.ranks[rIdx];
        const tpl = templates[i % templates.length];
        const vars = {
            zona: rng.pick(profile.zones),
            criatura: lower(rng.pick(profile.creatures.length ? profile.creatures : ['criaturas'])),
            material: rng.pick(profile.materials.length ? profile.materials : ['materiales raros']),
            persona: rng.pick(G.people),
            objeto: rng.pick(G.objects),
            piso: guild.floor,
        };
        const deadline = rng.pick([null, 3, 5, 7, 10]);
        const reward = niceRound(rank.reward * (1 + 0.1 * (profile.danger - 1)) * rng.range(0.8, 1.25));
        out.push({
            id: `npc-${guild.floor}-${wk}-${i}`,
            source: 'gremio',
            floor: guild.floor,
            kind: tpl.kind,
            rank: rank.id,
            title: fill(tpl.title, vars).replace(/^./, (c) => c.toLocaleUpperCase('es')),
            description: fill(tpl.text, vars),
            requirements: fill(tpl.requirements, vars),
            conditions: [fill(tpl.conditions, vars), G.conditionsByRank[rank.id]].filter(Boolean).join(' '),
            reward,
            rewardItems: '',
            maxTakers: tpl.kind === 'escoltar' ? 4 : rng.int(1, 4),
            deadlineDays: deadline,
            postedDay: wk * 7 + 1,
            posterId: null,
            posterName: guild.name,
            status: 'abierta',
            takers: [],
        });
    }
    return out;
}

/** Estado visible de una misión (las que pasan el plazo quedan «vencidas»). */
export function questStatus(world, q) {
    if (!FINAL.has(q.status) && q.deadlineDays && world.day > q.postedDay + q.deadlineDays) return 'vencida';
    return q.status;
}

/** Cobros pendientes de una misión: partes de la recompensa y devoluciones. */
export function pendingClaims(q) {
    const out = [];
    if (q.status === 'completada') for (const t of q.takers) if (!t.claimed) out.push({ charId: t.charId, amount: t.share ?? 0, kind: 'recompensa' });
    if (q.refund && !q.refund.claimed) out.push({ charId: q.posterId, amount: q.refund.amount, kind: 'devolución' });
    return out;
}

/** Tablón de un Gremio: generadas + publicadas en este piso, con lo que puede hacer `charId`. */
export function board(world, ctx, guild, { charId = null, isDm = false } = {}) {
    const g = world.guild ?? { quests: [] };
    const stored = new Map((g.quests ?? []).filter((q) => q.floor === guild.floor).map((q) => [q.id, q]));
    const list = [...generatedQuests(world, ctx, guild).filter((q) => !stored.has(q.id)), ...stored.values()];
    const license = licenseOf(world, charId);
    return list
        .map((q) => {
            const status = questStatus(world, q);
            const mine = q.posterId && q.posterId === charId;
            const taken = q.takers.some((t) => t.charId === charId);
            const claims = pendingClaims(q).filter((c) => c.charId === charId);
            const canTake = !mine && !taken && ['abierta', 'aceptada'].includes(status) && q.takers.length < q.maxTakers;
            return {
                ...q,
                status,
                mine,
                taken,
                claims,
                canTake: canTake && canTakeRank(ctx, license.rank, q.rank),
                blockedBy: canTake && !canTakeRank(ctx, license.rank, q.rank) ? `Necesitas licencia de ${rankOf(ctx, q.rank)?.label ?? q.rank} o superior.` : null,
                canResolve: (isDm || mine) && q.takers.length > 0 && ['aceptada', 'vencida'].includes(status),
                canCancel: (isDm || mine) && q.source === 'pj' && !FINAL.has(q.status) && (q.takers.length === 0 || status === 'vencida'),
            };
        })
        .filter((q) => !FINAL.has(q.status) || q.mine || q.taken || q.claims.length || isDm)
        .sort((a, b) => (a.claims.length ? -1 : 0) - (b.claims.length ? -1 : 0) || rankIndex(ctx, a.rank) - rankIndex(ctx, b.rank));
}

/** Recompensa mínima que el Gremio acepta publicar para un rango. */
export function minReward(ctx, rankId) {
    return Math.max(10, Math.round((rankOf(ctx, rankId)?.reward ?? 0) * 0.25));
}

/** Publicar una misión PJ: la recompensa queda en depósito y el Gremio cobra su comisión. */
export function publishQuest(world, ctx, { shopId, charId, charName, character, form = {}, here = undefined }) {
    const guild = guildOfShop(ctx, shopId);
    if (!guild) return { error: 'Aquí no hay un Gremio.' };
    if (!character) return { error: 'Elige un personaje.' };
    const closed = atGuild(world, ctx, guild, here);
    if (closed) return { error: closed };
    const G = guildData(ctx);
    const title = text(form.title, 80);
    if (title.length < 3) return { error: 'Ponle un título a la misión.' };
    const kind = G.kinds.some((k) => k.id === form.kind) ? form.kind : 'otro';
    const rank = rankOf(ctx, form.rank);
    if (!rank) return { error: 'Elige el rango de la misión.' };
    const reward = clampInt(form.reward, 0, 100_000_000, 0);
    const min = minReward(ctx, rank.id);
    if (reward < min) return { error: `El Gremio no publica misiones de ${rank.label} por menos de ${formatCp(min)}.` };
    const commission = Math.ceil(reward * guild.prestige.commission);
    const paid = pay(character.equipment.coins, reward + commission);
    if (!paid.ok) return { error: `Necesitas ${formatCp(reward + commission)} (recompensa + comisión del ${Math.round(guild.prestige.commission * 100)} %). Tienes ${formatCp(coinsInCp(character.equipment.coins))}.` };
    const w = cloneWorld(world);
    const g = ensure(w);
    const quest = {
        id: `pj-${w.day}-${String(charId).slice(0, 8)}-${g.quests.length}-${Math.abs(title.length * 7919 + reward) % 10000}`,
        source: 'pj',
        floor: guild.floor,
        kind,
        rank: rank.id,
        title,
        description: text(form.description, 1500),
        requirements: text(form.requirements, 400),
        conditions: text(form.conditions, 400),
        reward,
        rewardItems: text(form.rewardItems, 300),
        maxTakers: clampInt(form.maxTakers, 1, 6, 1),
        deadlineDays: clampInt(form.deadlineDays, 0, 90, 0) || null,
        postedDay: w.day,
        posterId: charId,
        posterName: charName,
        status: 'abierta',
        takers: [],
        commission,
    };
    if (g.quests.some((q) => q.id === quest.id)) quest.id += `-${g.quests.length}`;
    g.quests.push(quest);
    prune(w);
    const next = structuredClone(character);
    next.equipment.coins = paid.coins;
    return { world: w, character: next, quest, message: `Misión publicada. Depositaste ${formatCp(reward)} y el Gremio cobró ${formatCp(commission)} de comisión.` };
}

function findQuest(world, ctx, guild, questId) {
    const stored = world.guild?.quests?.find((q) => q.id === questId);
    if (stored) return { quest: stored, stored: true };
    const gen = guild ? generatedQuests(world, ctx, guild).find((q) => q.id === questId) : null;
    return gen ? { quest: gen, stored: false } : null;
}

/** Aceptar una misión del tablón. */
export function acceptQuest(world, ctx, { shopId, questId, charId, charName, here = undefined }) {
    const guild = guildOfShop(ctx, shopId);
    if (!guild) return { error: 'Aquí no hay un Gremio.' };
    if (!charId) return { error: 'Elige un personaje.' };
    const closed = atGuild(world, ctx, guild, here);
    if (closed) return { error: closed };
    const found = findQuest(world, ctx, guild, questId);
    if (!found || found.quest.floor !== guild.floor) return { error: 'Esa misión no está en este tablón.' };
    const q = found.quest;
    const status = questStatus(world, q);
    if (!['abierta', 'aceptada'].includes(status)) return { error: `La misión está ${status}.` };
    if (q.posterId === charId) return { error: 'No puedes aceptar tu propia misión.' };
    if (q.takers.some((t) => t.charId === charId)) return { error: 'Ya la aceptaste.' };
    if (q.takers.length >= q.maxTakers) return { error: 'Ya no admite más aventureros.' };
    const license = licenseOf(world, charId);
    if (!canTakeRank(ctx, license.rank, q.rank)) return { error: `Necesitas licencia de ${rankOf(ctx, q.rank)?.label ?? q.rank} o superior (tienes ${license.rank ? rankOf(ctx, license.rank).label : 'ninguna'}).` };
    const w = cloneWorld(world);
    const g = ensure(w);
    let quest = g.quests.find((x) => x.id === q.id);
    if (!quest) { quest = structuredClone(q); g.quests.push(quest); }
    quest.takers.push({ charId, name: charName, day: w.day });
    quest.status = 'aceptada';
    licenseEntry(g, charId, charName);
    prune(w);
    return { world: w, message: `Aceptaste «${quest.title}». Avisa en el mostrador antes de partir.` };
}

/** Abandonar una misión aceptada (cuesta 1 punto de reputación). */
export function abandonQuest(world, ctx, { questId, charId }) {
    const w = cloneWorld(world);
    const g = ensure(w);
    const quest = g.quests.find((q) => q.id === questId);
    if (!quest || !quest.takers.some((t) => t.charId === charId)) return { error: 'No participas en esa misión.' };
    if (FINAL.has(quest.status)) return { error: 'La misión ya terminó.' };
    quest.takers = quest.takers.filter((t) => t.charId !== charId);
    if (!quest.takers.length) quest.status = 'abierta';
    const l = licenseEntry(g, charId);
    l.points = Math.max(0, (l.points ?? 0) - 1);
    return { world: w, message: 'Abandonaste la misión (−1 de reputación en el Gremio).' };
}

/**
 * Cerrar una misión: completada (cada aventurero cobra su parte al volver) o
 * fallida (si era PJ, el que la publicó recupera el depósito). Lo decide quien
 * la publicó o el DM; las del Gremio, sólo el DM.
 */
export function resolveQuest(world, ctx, { questId, outcome, charId, isDm = false }) {
    if (!['completada', 'fallida'].includes(outcome)) return { error: 'Resultado no válido.' };
    const w = cloneWorld(world);
    const g = ensure(w);
    const quest = g.quests.find((q) => q.id === questId);
    if (!quest) return { error: 'Esa misión no existe.' };
    if (!isDm && !(quest.source === 'pj' && quest.posterId === charId)) return { error: quest.source === 'pj' ? 'Sólo quien la publicó (o el DM) puede cerrarla.' : 'Las misiones del Gremio las da por cumplidas el DM.' };
    if (FINAL.has(quest.status)) return { error: 'La misión ya estaba cerrada.' };
    if (!quest.takers.length) return { error: 'Nadie aceptó la misión todavía.' };
    quest.status = outcome;
    quest.resolvedDay = w.day;
    if (outcome === 'completada') {
        const share = Math.floor(quest.reward / quest.takers.length);
        for (const t of quest.takers) { t.share = share; t.claimed = false; }
    } else if (quest.source === 'pj' && quest.reward) {
        quest.refund = { amount: quest.reward, claimed: false };
    }
    return { world: w, message: outcome === 'completada' ? `Misión completada: cada aventurero cobra ${formatCp(Math.floor(quest.reward / quest.takers.length))} en el Gremio.` : 'Misión marcada como fallida.' };
}

/** Retirar una misión PJ sin aventureros (o vencida): se devuelve el depósito. */
export function cancelQuest(world, ctx, { questId, charId, character = null, isDm = false }) {
    const w = cloneWorld(world);
    const g = ensure(w);
    const quest = g.quests.find((q) => q.id === questId);
    if (!quest || quest.source !== 'pj') return { error: 'Sólo se pueden retirar misiones publicadas por jugadores.' };
    if (!isDm && quest.posterId !== charId) return { error: 'Sólo quien la publicó puede retirarla.' };
    if (FINAL.has(quest.status)) return { error: 'La misión ya estaba cerrada.' };
    if (quest.takers.length && questStatus(w, quest) !== 'vencida') return { error: 'Ya hay aventureros en ella: ciérrala como completada o fallida.' };
    quest.status = 'cancelada';
    quest.resolvedDay = w.day;
    // Si la retira su autor, cobra en el acto; si la retira el DM, queda para cuando vuelva.
    if (character && quest.posterId === charId) {
        const next = structuredClone(character);
        next.equipment.coins = receiveCoins(next.equipment.coins, quest.reward);
        quest.refund = { amount: quest.reward, claimed: true };
        return { world: w, character: next, message: `Misión retirada. Recuperaste ${formatCp(quest.reward)} (la comisión no se devuelve).` };
    }
    quest.refund = { amount: quest.reward, claimed: false };
    return { world: w, message: 'Misión retirada. Su autor recuperará el depósito en el Gremio.' };
}

/** Cobrar en el Gremio: tu parte de una misión completada o la devolución de un depósito. */
export function claimQuest(world, ctx, { questId, charId, charName, character }) {
    if (!character) return { error: 'Elige un personaje.' };
    const w = cloneWorld(world);
    const g = ensure(w);
    const quest = g.quests.find((q) => q.id === questId);
    if (!quest) return { error: 'Esa misión no existe.' };
    let amount = 0;
    let reward = false;
    const taker = quest.status === 'completada' ? quest.takers.find((t) => t.charId === charId && !t.claimed) : null;
    if (taker) {
        taker.claimed = true;
        amount += taker.share ?? 0;
        reward = true;
        const l = licenseEntry(g, charId, charName);
        l.completed = (l.completed ?? 0) + 1;
        l.byRank = { ...l.byRank, [quest.rank]: (l.byRank?.[quest.rank] ?? 0) + 1 };
        l.points = (l.points ?? 0) + (rankOf(ctx, quest.rank)?.points ?? 1);
    }
    if (quest.refund && !quest.refund.claimed && quest.posterId === charId) {
        quest.refund.claimed = true;
        amount += quest.refund.amount;
    }
    if (!amount && !reward) return { error: 'No tienes nada que cobrar de esta misión.' };
    const next = structuredClone(character);
    next.equipment.coins = receiveCoins(next.equipment.coins, amount);
    prune(w);
    return { world: w, character: next, message: reward ? `Cobraste ${formatCp(amount)} y sumaste reputación en el Gremio.` : `Recuperaste ${formatCp(amount)}.` };
}

// ── Licencias ────────────────────────────────────────────────────────────

/** Misiones completadas de un rango o superior. */
const completedFrom = (ctx, license, rankId) => Object.entries(license.byRank ?? {})
    .filter(([r]) => rankIndex(ctx, r) >= rankIndex(ctx, rankId)).reduce((n, [, v]) => n + v, 0);

/** ¿Puede examinarse de este rango? { ok, reason } */
export function evaluationEligibility(world, ctx, { charId, rankId, level }) {
    const rank = rankOf(ctx, rankId);
    if (!rank) return { ok: false, reason: 'Rango desconocido.' };
    const license = licenseOf(world, charId);
    const target = rankIndex(ctx, rankId);
    const current = license.rank ? rankIndex(ctx, license.rank) : -1;
    if (current >= target) return { ok: false, reason: 'Ya tienes este rango o uno superior.' };
    if (level < rank.minLevel) return { ok: false, reason: `Hace falta nivel ${rank.minLevel} para examinarse de ${rank.label}.` };
    if (current >= 0) {
        if (target !== current + 1) return { ok: false, reason: `Asciende de uno en uno: tu próximo examen es de ${ranks(ctx)[current + 1].label}.` };
        const done = completedFrom(ctx, license, license.rank);
        if (done < rank.promotion) return { ok: false, reason: `Para ascender a ${rank.label} necesitas ${rank.promotion} misiones completadas de ${rankOf(ctx, license.rank).label} o superior (llevas ${done}).` };
    }
    const last = license.attempts?.[rankId];
    if (last && !last.passed && world.day < last.day + EVAL_COOLDOWN) return { ok: false, reason: `Suspendiste hace poco: podrás repetir el examen el día ${last.day + EVAL_COOLDOWN}.` };
    return { ok: true, reason: null, first: current < 0 };
}

const tierOf = (idx) => (idx <= 2 ? 0 : idx <= 5 ? 1 : 2);

/** Examen de un rango: dos preguntas, dos pruebas y una situación (igual todo el día). */
export function evaluationFor(world, ctx, { charId, rankId }) {
    const G = guildData(ctx);
    const rank = rankOf(ctx, rankId);
    if (!rank) return null;
    const tier = tierOf(rankIndex(ctx, rankId));
    const rng = createRng(world.seed, 'guild-eval', charId ?? '_', rankId, world.day);
    const pool = (list) => {
        const same = list.filter((x) => x.tier === tier);
        return same.length ? same : list.filter((x) => x.tier <= tier);
    };
    const questions = rng.shuffle(pool(G.evaluation.questions)).slice(0, 2).map((q) => ({ text: q.text, options: q.options }));
    const situation = rng.pick(pool(G.evaluation.situations));
    const skills = rng.shuffle(G.evaluation.skills[rankId] ?? ['Percepción', 'Atletismo']).slice(0, 2);
    return {
        rank: rankId,
        dc: rank.dc,
        fee: rank.fee,
        questions,
        situation: { text: situation.text, options: situation.options.map((o) => ({ label: o.label, skill: o.skill, dc: rank.dc + (o.dc ?? 0) })) },
        tests: skills.map((s) => ({ skill: s, dc: rank.dc })),
    };
}

function answerKey(world, ctx, { charId, rankId }) {
    const G = guildData(ctx);
    const exam = evaluationFor(world, ctx, { charId, rankId });
    return exam.questions.map((q) => G.evaluation.questions.find((x) => x.text === q.text)?.best ?? -1);
}

/**
 * Presentarse al examen. Aprueba con al menos 1 de 2 preguntas bien y 2 de 3
 * tiradas superadas (las dos pruebas y el enfoque elegido en la situación).
 * @param {{ answers: number[], approach: number, rolls?: number[], skills: Record<string, number>, level: number }} params
 */
export function takeEvaluation(world, ctx, { shopId, charId, charName, character, rankId, answers = [], approach = 0, rolls = [], skills = {}, level = 0, here = undefined }) {
    const guild = guildOfShop(ctx, shopId);
    if (!guild) return { error: 'Aquí no hay un Gremio.' };
    if (!character) return { error: 'Elige un personaje.' };
    const closed = atGuild(world, ctx, guild, here);
    if (closed) return { error: closed };
    const elig = evaluationEligibility(world, ctx, { charId, rankId, level });
    if (!elig.ok) return { error: elig.reason };
    const exam = evaluationFor(world, ctx, { charId, rankId });
    const paid = pay(character.equipment.coins, exam.fee);
    if (!paid.ok) return { error: `La tasa del examen es ${formatCp(exam.fee)} y no te alcanza.` };
    const key = answerKey(world, ctx, { charId, rankId });
    const correct = key.filter((best, i) => Number(answers[i]) === best).length;
    const rng = createRng(world.seed, 'guild-eval-roll', charId ?? '_', rankId, world.day);
    const opt = exam.situation.options[clampInt(approach, 0, exam.situation.options.length - 1, 0)];
    const checks = [...exam.tests, { skill: opt.skill, dc: opt.dc, label: opt.label }].map((t, i) => {
        const r = rollCheck(rng, Number(skills[t.skill] ?? 0), t.dc, Number.isInteger(rolls[i]) ? rolls[i] : undefined);
        return { ...t, roll: r, text: describeRoll(t.label ? `${t.label} (${t.skill})` : t.skill, r) };
    });
    const successes = checks.filter((c) => c.roll.success).length;
    const passed = correct >= 1 && successes >= 2;
    const w = cloneWorld(world);
    const g = ensure(w);
    const l = licenseEntry(g, charId, charName);
    l.attempts = { ...l.attempts, [rankId]: { day: w.day, passed, correct, successes } };
    if (passed) {
        l.rank = rankId;
        l.since = w.day;
        l.floor = guild.floor;
        l.history = [...(l.history ?? []), { rank: rankId, day: w.day, floor: guild.floor, by: 'examen' }].slice(-20);
    }
    const next = structuredClone(character);
    next.equipment.coins = paid.coins;
    const rank = rankOf(ctx, rankId);
    return {
        world: w,
        character: next,
        result: { passed, correct, successes, checks, rank: rankId },
        message: passed ? `¡Aprobado! Ya tienes la licencia de ${rank.label}.` : `Suspendido (${correct}/2 preguntas, ${successes}/3 pruebas). Podrás repetirlo en ${EVAL_COOLDOWN} días.`,
    };
}

/** El DM fija (o retira, con null) el rango de un aventurero. */
export function setLicenseRank(world, ctx, { charId, rankId, charName = null, floor = null }) {
    if (!charId) return { error: 'Falta el aventurero.' };
    if (rankId !== null && !rankOf(ctx, rankId)) return { error: 'Rango desconocido.' };
    const w = cloneWorld(world);
    const g = ensure(w);
    const l = licenseEntry(g, charId, charName);
    l.rank = rankId;
    l.since = rankId ? w.day : null;
    if (floor) l.floor = floor;
    l.history = [...(l.history ?? []), { rank: rankId, day: w.day, floor, by: 'DM' }].slice(-20);
    return { world: w, message: rankId ? `Licencia de ${rankOf(ctx, rankId).label} concedida.` : 'Licencia retirada.' };
}

/** Aventureros con licencia o historial en el Gremio (para el DM). */
export function licenseHolders(world) {
    return Object.entries(world.guild?.licenses ?? {}).map(([charId, l]) => ({ charId, ...licenseOf(world, charId), name: l.name ?? 'Aventurero' }));
}

// ── Servicios ────────────────────────────────────────────────────────────

/** Profesionales que buscan clientes en este Gremio esta semana. */
export function serviceOffers(world, ctx, guild) {
    const G = guildData(ctx);
    const { profile } = guild;
    const wk = week(world.day);
    const rng = createRng(world.seed, 'guild-svc', guild.floor, wk);
    const eligible = G.services.filter((s) => (s.minFloor ?? 1) <= guild.floor && (s.danger ?? 1) <= profile.danger);
    // Los básicos (mercenario, curandero, guía) casi siempre están; el resto rota.
    const core = eligible.filter((s) => ['mercenario', 'curandero', 'guia'].includes(s.id));
    const rest = rng.shuffle(eligible.filter((s) => !core.includes(s)));
    const chosen = [...core, ...rest].slice(0, guild.prestige.services + (guild.prestige.id > 1 ? 1 : 0));
    const names = ctx.estate?.names?.length ? ctx.estate.names : ['Aldo'];
    const surnames = ctx.estate?.surnames?.length ? ctx.estate.surnames : ['Caminante'];
    return chosen.map((s) => {
        const vars = {
            zona: rng.pick(profile.zones),
            criatura: lower(rng.pick(profile.creatures.length ? profile.creatures : ['criaturas'])),
            material: rng.pick(profile.materials.length ? profile.materials : ['materiales raros']),
        };
        const rIdx = rng.int(profile.rankMin, profile.rankMax);
        const price = niceRound(s.price * (1 + guild.floor / 25) * (1 + 0.15 * (profile.danger - 1)) * rng.range(0.85, 1.2));
        return {
            id: `${guild.floor}-${wk}-${s.id}`,
            serviceId: s.id,
            icon: s.icon,
            label: fill(s.label, vars),
            text: fill(s.text, vars),
            npc: `${rng.pick(names)} ${rng.pick(surnames)}`,
            race: rng.pick(profile.races ?? ['humano']),
            rank: G.ranks[rIdx].id,
            price,
            unit: s.unit,
        };
    });
}

/** Contratar un servicio: se paga por adelantado (días o encargos). */
export function hireService(world, ctx, { shopId, offerId, units = 1, charId, charName, character, here = undefined }) {
    const guild = guildOfShop(ctx, shopId);
    if (!guild) return { error: 'Aquí no hay un Gremio.' };
    if (!character) return { error: 'Elige un personaje.' };
    const closed = atGuild(world, ctx, guild, here);
    if (closed) return { error: closed };
    const offer = serviceOffers(world, ctx, guild).find((o) => o.id === offerId);
    if (!offer) return { error: 'Ese profesional ya no busca clientes aquí.' };
    const n = clampInt(units, 1, 30, 1);
    const total = offer.price * n;
    const paid = pay(character.equipment.coins, total);
    if (!paid.ok) return { error: `Cuesta ${formatCp(total)} y tienes ${formatCp(coinsInCp(character.equipment.coins))}.` };
    const w = cloneWorld(world);
    const g = ensure(w);
    const days = offer.unit === 'día' ? n : 1;
    g.hires.push({ id: `${offer.id}-${charId}-${w.day}-${g.hires.length}`, charId, charName, floor: guild.floor, offerId, label: offer.label, npc: offer.npc, units: n, unit: offer.unit, total, start: w.day, until: w.day + days - 1 });
    prune(w);
    const next = structuredClone(character);
    next.equipment.coins = paid.coins;
    return { world: w, character: next, message: `${offer.npc} (${offer.label}) trabajará para ti: ${n} ${offer.unit}${n === 1 ? '' : 's'} por ${formatCp(total)}.` };
}

/** Contrataciones de un personaje (activas primero). */
export function hiresOf(world, charId) {
    return (world.guild?.hires ?? []).filter((h) => h.charId === charId).map((h) => ({ ...h, active: h.until >= world.day })).reverse();
}
