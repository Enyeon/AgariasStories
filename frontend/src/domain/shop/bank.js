/**
 * Cambista y banco (profesiones con `exchange: true`).
 *
 *  - Cambio de monedas: rompe o junta monedas (p. ej. 1 ppt → po) cobrando una
 *    pequeña comisión. Funciona con el sistema monetario de la bolsa.
 *  - Depósito: guarda dinero en el banco del mundo (`world.bank[charId]`) y lo
 *    retiras en cualquier cambista de la campaña. No hay intereses ni préstamos.
 *
 * Todo en pc enteros: nunca se pierde ni se crea dinero salvo la comisión.
 */

import { cloneWorld } from './state.js';
import { availability } from './presence.js';
import { coinValues, currencyOf, normalizeCoins, formatCp, receiveCoins, pay, coinsInCp, COIN_SHORT } from '../money.js';

export const EXCHANGE_FEE = 0.02;
const LOG_LIMIT = 20;
const DENOMS = ['cp', 'sp', 'gp', 'pp'];

export function isExchange(ctx, shopId) {
    const keeper = ctx.keeperOf(shopId);
    return Boolean(keeper && ctx.professions?.get(keeper.profession)?.exchange);
}

function atDesk(world, ctx, shopId, here) {
    if (!isExchange(ctx, shopId)) return 'Aquí no hay cambista.';
    if (here === undefined) return null;
    const status = availability(world, ctx, ctx.keeperOf(shopId));
    if (!status.open) return status.reason ?? 'El cambista está cerrado.';
    if (status.location !== here) return 'Tienes que estar en la casa de cambio.';
    return null;
}

/** Vista previa de un cambio: cuántas monedas recibes y la comisión. */
export function quoteExchange(coins, { from, to, count }) {
    if (!DENOMS.includes(from) || !DENOMS.includes(to) || from === to) return { error: 'Elige dos monedas distintas.' };
    const n = Math.trunc(Number(count));
    if (!Number.isFinite(n) || n < 1) return { error: 'Indica cuántas monedas cambias.' };
    const bag = normalizeCoins(coins);
    if (bag[from] < n) return { error: `Sólo tienes ${bag[from]} ${COIN_SHORT[from]}.` };
    const values = coinValues(currencyOf(coins));
    const value = n * values[from];
    const fee = Math.max(1, Math.ceil(value * EXCHANGE_FEE));
    const net = value - fee;
    const got = Math.floor(net / values[to]);
    const rest = net - got * values[to];
    if (got < 1) return { error: `Con ${n} ${COIN_SHORT[from]} no llega ni a 1 ${COIN_SHORT[to]} (tras la comisión).` };
    return { from, to, count: n, value, fee, got, rest };
}

/** Cambiar monedas. */
export function exchangeCoins(world, ctx, { shopId, character, from, to, count, here = undefined }) {
    if (!character) return { error: 'Elige un personaje.' };
    const closed = atDesk(world, ctx, shopId, here);
    if (closed) return { error: closed };
    const q = quoteExchange(character.equipment.coins, { from, to, count });
    if (q.error) return q;
    const next = structuredClone(character);
    const c = next.equipment.coins;
    c[from] -= q.count;
    c[to] = (Number(c[to]) || 0) + q.got;
    next.equipment.coins = q.rest ? receiveCoins(c, q.rest) : c;
    return { world, character: next, message: `Cambias ${q.count} ${COIN_SHORT[from]} por ${q.got} ${COIN_SHORT[to]}${q.rest ? ` y ${formatCp(q.rest)} de cambio` : ''} (comisión: ${formatCp(q.fee)}).` };
}

/** Saldo en el banco de la campaña. */
export function bankOf(world, charId) {
    const b = world.bank?.[charId ?? '_'];
    return { balance: b?.balance ?? 0, log: b?.log ?? [] };
}

function entry(w, charId, charName) {
    w.bank ??= {};
    const b = (w.bank[charId] ??= { balance: 0, log: [] });
    if (charName) b.name = charName;
    return b;
}

/** Depositar dinero de la bolsa en el banco. */
export function deposit(world, ctx, { shopId, charId, charName, character, amount, here = undefined }) {
    if (!character || !charId) return { error: 'Elige un personaje.' };
    const closed = atDesk(world, ctx, shopId, here);
    if (closed) return { error: closed };
    const n = Math.trunc(Number(amount));
    if (!Number.isFinite(n) || n < 1) return { error: 'Indica cuánto depositas.' };
    const paid = pay(character.equipment.coins, n);
    if (!paid.ok) return { error: `No llevas tanto: tienes ${formatCp(coinsInCp(character.equipment.coins))}.` };
    const w = cloneWorld(world);
    const b = entry(w, charId, charName);
    b.balance += n;
    b.log = [{ day: w.day, amount: n, shopId }, ...b.log].slice(0, LOG_LIMIT);
    const next = structuredClone(character);
    next.equipment.coins = paid.coins;
    return { world: w, character: next, message: `Depositas ${formatCp(n)}. Saldo: ${formatCp(b.balance)}.` };
}

/** Retirar dinero del banco (en cualquier cambista de la campaña). */
export function withdraw(world, ctx, { shopId, charId, character, amount, here = undefined }) {
    if (!character || !charId) return { error: 'Elige un personaje.' };
    const closed = atDesk(world, ctx, shopId, here);
    if (closed) return { error: closed };
    const { balance } = bankOf(world, charId);
    const n = amount === null || amount === undefined || amount === '' ? balance : Math.trunc(Number(amount));
    if (!Number.isFinite(n) || n < 1) return { error: 'Indica cuánto retiras.' };
    if (n > balance) return { error: `Tu saldo es de ${formatCp(balance)}.` };
    const w = cloneWorld(world);
    const b = entry(w, charId);
    b.balance -= n;
    b.log = [{ day: w.day, amount: -n, shopId }, ...b.log].slice(0, LOG_LIMIT);
    const next = structuredClone(character);
    next.equipment.coins = receiveCoins(next.equipment.coins, n);
    return { world: w, character: next, message: `Retiras ${formatCp(n)}. Saldo: ${formatCp(b.balance)}.` };
}
