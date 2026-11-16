// Monedas del personaje: el ÚNICO sistema de dinero de la app.
//
// Las monedas viven en la ficha (`character.equipment.coins`, ver schema.js):
// no hay otra billetera. Este módulo las cuenta, paga con cambio y da formato;
// lo usan la Tienda y el Taller del Ingeniero. Importes internos en piezas de
// cobre (pc), siempre enteros.

import { COINS } from './constants.js';

/**
 * Dos sistemas monetarios. Todos los importes internos (precios, salarios,
 * recompensas…) se guardan en piezas de COBRE, que valen lo mismo en ambos:
 * lo que cambia es cuánto vale cada moneda. Así un precio nunca «ignora» el
 * sistema: es un valor, y se muestra con las monedas del sistema activo.
 *
 *   D&D       10 pc = 1 pp · 10 pp = 1 po · 10 po = 1 ppt   (el de siempre)
 *   Lord 100  10 pc = 1 pp · 100 pp = 1 po · 100 po = 1 ppt
 *
 * Las monedas de una ficha llevan su sistema en `coins.system` (por defecto
 * 'dnd'). Cambiar de sistema convierte el saldo sin perder ni crear valor
 * (`convertCoins`).
 */
export const CURRENCIES = Object.freeze({
  dnd: Object.freeze({ id: 'dnd', label: 'Monedas de D&D', values: Object.freeze({ cp: 1, sp: 10, gp: 100, pp: 1000 }) }),
  lord100: Object.freeze({ id: 'lord100', label: 'Monedas de Lord 100', values: Object.freeze({ cp: 1, sp: 10, gp: 1000, pp: 100000 }) }),
});
export const DEFAULT_CURRENCY = 'dnd';
export const currencyId = (id) => (Object.hasOwn(CURRENCIES, id ?? '') ? id : DEFAULT_CURRENCY);
export const currencyOf = (coins) => currencyId(coins?.system);
/** Valor en pc de cada moneda en un sistema. */
export const coinValues = (system) => CURRENCIES[currencyId(system)].values;

/** Valor en pc de cada moneda de D&D (compatibilidad: el sistema de siempre). */
export const COIN_VALUE = CURRENCIES.dnd.values;
/** Abreviaturas en español (pc, pp, po, ppt). */
export const COIN_SHORT = Object.freeze({ cp: 'pc', sp: 'pp', gp: 'po', pp: 'ppt' });
const KEYS = COINS.map((c) => c.key);
/** Monedas con las que pagan y dan cambio los comerciantes. */
const CHANGE = ['gp', 'sp', 'cp'];
const desc = (system) => KEYS.slice().sort((a, b) => coinValues(system)[b] - coinValues(system)[a]);

// Sistema con el que se MUESTRAN los importes (la Tienda lo fija según la
// campaña; la ficha, según sus monedas). Sólo afecta al texto, nunca al valor.
let displaySystem = DEFAULT_CURRENCY;
export function setDisplayCurrency(system) {
  displaySystem = currencyId(system);
}
export const displayCurrency = () => displaySystem;

const toInt = (v) => {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** Bolsa con todas las monedas de la ficha como enteros ≥ 0 (sin el sistema). */
export function normalizeCoins(coins) {
  return Object.fromEntries(KEYS.map((k) => [k, toInt(coins?.[k])]));
}

/** Total de la bolsa en pc (según el sistema de la propia bolsa, o el indicado). */
export const coinsInCp = (coins, system = currencyOf(coins)) => KEYS.reduce((t, k) => t + toInt(coins?.[k]) * coinValues(system)[k], 0);

/** Descompone un importe en oro, plata y cobre del sistema indicado. */
export function splitCp(amount, system = displaySystem) {
  const values = coinValues(system);
  let rest = toInt(amount);
  const out = {};
  for (const k of CHANGE) {
    out[k] = Math.floor(rest / values[k]);
    rest -= out[k] * values[k];
  }
  return out;
}

/**
 * Paga `cost` pc. Usa primero las monedas más grandes que caben sin pasarse y,
 * si falta, rompe UNA moneda (la más pequeña que cubra el resto) y recibe el
 * cambio en oro/plata/cobre. Conserva la distribución de monedas del jugador.
 * Cuenta con el sistema de la bolsa. Devuelve { ok, coins }.
 */
export function pay(coins, cost) {
  const system = currencyOf(coins);
  const values = coinValues(system);
  const amount = toInt(cost);
  const c = normalizeCoins(coins);
  if (coinsInCp(c, system) < amount) return { ok: false, coins: { ...coins, ...c } };
  let rest = amount;
  const order = desc(system);
  for (const k of order) {
    const use = Math.min(c[k], Math.floor(rest / values[k]));
    c[k] -= use;
    rest -= use * values[k];
  }
  if (rest > 0) {
    const coin = order.slice().reverse().find((k) => c[k] > 0 && values[k] >= rest);
    c[coin] -= 1;
    for (const [k, n] of Object.entries(splitCp(values[coin] - rest, system))) c[k] += n;
  }
  return { ok: true, coins: { ...coins, ...c } };
}

/** Igual que pay, pero devuelve las monedas o null si no alcanza (API del Taller). */
export function payCoins(coins, cost) {
  const res = pay(coins, cost);
  return res.ok ? res.coins : null;
}

/** Suma un importe a la bolsa, en oro, plata y cobre (de su sistema). */
export function receiveCoins(coins, amount) {
  const c = normalizeCoins(coins);
  for (const [k, n] of Object.entries(splitCp(amount, currencyOf(coins)))) c[k] += n;
  return { ...coins, ...c };
}

/**
 * Pasa una bolsa a otro sistema SIN perder ni crear valor: el total en pc es
 * el mismo, expresado con las monedas del nuevo sistema. El cobre y la plata
 * valen igual en ambos y se conservan; el oro y el platino se recalculan.
 * Devuelve { coins, before, after, total } para mostrarlo antes de confirmar.
 */
export function convertCoins(coins, to) {
  const from = currencyOf(coins);
  const target = currencyId(to);
  const c = normalizeCoins(coins);
  const total = coinsInCp(c, from);
  if (from === target) return { coins: { ...coins, ...c, system: target }, before: c, after: c, total, changed: false };
  const values = coinValues(target);
  // Plata y cobre se quedan como están; el resto del valor, en platino y oro.
  const keep = c.cp * values.cp + c.sp * values.sp;
  let rest = total - keep;
  const out = { cp: c.cp, sp: c.sp, gp: 0, pp: 0 };
  for (const k of ['pp', 'gp', 'sp', 'cp']) {
    const n = Math.floor(rest / values[k]);
    out[k] += n;
    rest -= n * values[k];
  }
  return { coins: { ...coins, ...out, system: target }, before: c, after: out, total, changed: true };
}

/** «2 ppt 5 po» — una bolsa tal cual (sin convertir). */
export function formatBag(bag) {
  const c = normalizeCoins(bag);
  const parts = desc(currencyOf(bag)).filter((k) => c[k] > 0).map((k) => `${fmt.format(c[k])} ${COIN_SHORT[k]}`);
  return parts.length ? parts.join(' ') : '0 po';
}

const fmt = new Intl.NumberFormat('es-AR');

/**
 * 1450 → "14 po 5 pp" (D&D) o "1 po 45 pp" (Lord 100). Con { parts: true } →
 * [{ code, short, amount }]. Usa el sistema que se muestra (o `system`).
 */
export function formatCp(amount, { parts = false, system = displaySystem } = {}) {
  const values = coinValues(system);
  // En Lord 100 el platino vale 100 po: se muestra si el importe llega.
  const keys = currencyId(system) === 'lord100' ? ['pp', ...CHANGE] : CHANGE;
  let rest = toInt(amount);
  const split = {};
  for (const k of keys) { split[k] = Math.floor(rest / values[k]); rest -= split[k] * values[k]; }
  let entries = keys.map((k) => ({ code: k, short: COIN_SHORT[k], amount: split[k] })).filter((e) => e.amount > 0);
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
