// Monedas del personaje: el ÚNICO sistema de dinero de la app.
//
// Las monedas viven en la ficha (`character.equipment.coins`, ver schema.js):
// no hay otra billetera. Este módulo las cuenta, paga con cambio y da formato;
// lo usan la Tienda y el Taller del Ingeniero. Importes internos en piezas de
// cobre (pc), siempre enteros.

import { COINS } from './constants.js';

/** Valor en pc de cada moneda de la ficha. */
export const COIN_VALUE = Object.freeze({ cp: 1, sp: 10, gp: 100, pp: 1000 });
/** Abreviaturas en español (pc, pp, po, ppt). */
export const COIN_SHORT = Object.freeze({ cp: 'pc', sp: 'pp', gp: 'po', pp: 'ppt' });
const KEYS = COINS.map((c) => c.key);
/** Monedas con las que pagan y dan cambio los comerciantes. */
const CHANGE = ['gp', 'sp', 'cp'];
const DESC = KEYS.slice().sort((a, b) => COIN_VALUE[b] - COIN_VALUE[a]);

const toInt = (v) => {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** Bolsa con todas las monedas de la ficha como enteros ≥ 0. */
export function normalizeCoins(coins) {
  return Object.fromEntries(KEYS.map((k) => [k, toInt(coins?.[k])]));
}

/** Total de la bolsa en pc. */
export const coinsInCp = (coins) => KEYS.reduce((t, k) => t + toInt(coins?.[k]) * COIN_VALUE[k], 0);

/** Descompone un importe en oro, plata y cobre. */
export function splitCp(amount) {
  let rest = toInt(amount);
  const out = {};
  for (const k of CHANGE) {
    out[k] = Math.floor(rest / COIN_VALUE[k]);
    rest -= out[k] * COIN_VALUE[k];
  }
  return out;
}

/**
 * Paga `cost` pc. Usa primero las monedas más grandes que caben sin pasarse y,
 * si falta, rompe UNA moneda (la más pequeña que cubra el resto) y recibe el
 * cambio en oro/plata/cobre. Conserva la distribución de monedas del jugador.
 * Devuelve { ok, coins }.
 */
export function pay(coins, cost) {
  const amount = toInt(cost);
  const c = normalizeCoins(coins);
  if (coinsInCp(c) < amount) return { ok: false, coins: c };
  let rest = amount;
  for (const k of DESC) {
    const use = Math.min(c[k], Math.floor(rest / COIN_VALUE[k]));
    c[k] -= use;
    rest -= use * COIN_VALUE[k];
  }
  if (rest > 0) {
    const coin = DESC.slice().reverse().find((k) => c[k] > 0 && COIN_VALUE[k] >= rest);
    c[coin] -= 1;
    for (const [k, n] of Object.entries(splitCp(COIN_VALUE[coin] - rest))) c[k] += n;
  }
  return { ok: true, coins: { ...coins, ...c } };
}

/** Igual que pay, pero devuelve las monedas o null si no alcanza (API del Taller). */
export function payCoins(coins, cost) {
  const res = pay(coins, cost);
  return res.ok ? res.coins : null;
}

/** Suma un importe a la bolsa, en oro, plata y cobre. */
export function receiveCoins(coins, amount) {
  const c = normalizeCoins(coins);
  for (const [k, n] of Object.entries(splitCp(amount))) c[k] += n;
  return { ...coins, ...c };
}

const fmt = new Intl.NumberFormat('es-AR');

/** 1450 → "14 po 5 pp". Con { parts: true } → [{ code, short, amount }]. */
export function formatCp(amount, { parts = false } = {}) {
  const split = splitCp(amount);
  let entries = CHANGE.map((k) => ({ code: k, short: COIN_SHORT[k], amount: split[k] })).filter((e) => e.amount > 0);
  if (!entries.length) entries = [{ code: 'cp', short: 'pc', amount: 0 }];
  return parts ? entries : entries.map((e) => `${fmt.format(e.amount)} ${e.short}`).join(' ');
}

/** Redondeo "de tienda": cuanto más caro, más grueso (evita precios como 1473 pc). */
export function niceRound(amount, mode = 'nearest') {
  const v = Math.max(0, Number(amount) || 0);
  const step = v < 20 ? 1 : v < 200 ? 5 : v < 1000 ? 10 : v < 5000 ? 50 : v < 20000 ? 100 : v < 200000 ? 500 : 5000;
  const fn = mode === 'up' ? Math.ceil : mode === 'down' ? Math.floor : Math.round;
  return Math.max(v > 0 ? 1 : 0, fn(v / step) * step);
}
