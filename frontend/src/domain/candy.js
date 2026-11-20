// Caramelos de atributo (AgSt 1.35): la «enfermedad de las estadísticas» de
// los INK, decidida por el autor el 19-nov-2026.
//
//  * Quien tiene el rasgo (efecto `habilita: caramelos`) se quita 1 punto de
//    un atributo y crea un caramelo que lo replica. Tiene como máximo tantos
//    cedidos como su bonificador de competencia. El punto vuelve cuando el
//    jugador lo marca («Recuperar»: el caramelo se comió hace más de 1 hora o
//    se perdió).
//  * Quien se come un caramelo gana +1 a ese atributo, sin límite de tiempo
//    (sin pasar de 20; la app avisa si se pasa).
//  * Efecto secundario: desde el segundo caramelo en 24 horas, quien los come
//    pierde 1 PG máximo cada 10 minutos; si se come dos o más de golpe, 3.
//    No es daño (no rompe la Inhibición ni «la raza no puede dañarte»): reduce
//    los PG máximos, nunca por debajo de 1.
//  * Cualquier curación (AgSt 1.37, decisión del autor) se lo lleva todo: el
//    drenaje, lo drenado y los puntos ganados. «Nada se queda».
//
// La app no lleva el reloj de la partida: el jugador marca cuándo pasan los 10
// minutos o la hora. Todo es puro: devuelve personajes nuevos.

import { ABILITY_KEYS, ABILITY_LABEL } from './constants.js';
import { localId } from './schema.js';

export const CANDY_LIMITS = Object.freeze({ ceded: 6, active: 12, drain: 999 });

const clone = (c) => structuredClone(c);

export function emptyCandy() {
  return { ceded: [], active: [], drain: null };
}

/** Normaliza `character.candy` (lo llama validation.js). */
export function normalizeCandyState(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const entries = (list, max) => (Array.isArray(list) ? list : []).slice(0, max)
    .filter((x) => x && ABILITY_KEYS.includes(x.attr))
    .map((x) => ({ id: typeof x.id === 'string' && /^[\w-]{1,60}$/.test(x.id) ? x.id : localId('caramelo'), attr: x.attr }));
  const rate = Number(src.drain?.rate);
  const amount = Math.trunc(Number(src.drain?.amount));
  const drain = src.drain && (rate === 1 || rate === 3)
    ? { rate, amount: Number.isFinite(amount) ? Math.min(CANDY_LIMITS.drain, Math.max(0, amount)) : 0 }
    : null;
  return { ceded: entries(src.ceded, CANDY_LIMITS.ceded), active: entries(src.active, CANDY_LIMITS.active), drain };
}

const state = (c) => {
  c.candy = c.candy && typeof c.candy === 'object' ? c.candy : emptyCandy();
  c.candy.ceded ??= [];
  c.candy.active ??= [];
  c.candy.drain ??= null;
  return c.candy;
};

export const candyName = (attr) => `Caramelo de ${ABILITY_LABEL[attr]}`;

/** Fuentes de efectos de los caramelos, para effectSources(). */
export function candyEffectSources(c) {
  const st = c.candy;
  if (!st) return [];
  const out = [];
  for (const x of st.ceded ?? []) out.push({ kind: 'otros', label: `${ABILITY_LABEL[x.attr]} cedida a un caramelo`, effects: [{ type: 'bono', target: `atributo:${x.attr}`, value: -1 }] });
  for (const x of st.active ?? []) out.push({ kind: 'otros', label: candyName(x.attr), effects: [{ type: 'bono', target: `atributo:${x.attr}`, value: 1 }] });
  return out;
}

/** PG máximos que se lleva el drenaje de los caramelos. */
export const candyDrain = (c) => c.candy?.drain?.amount ?? 0;

/** Crea un caramelo: −1 al atributo del creador y un objeto consumible en su inventario. */
export function createCandy(character, attr, { limit }) {
  if (!ABILITY_KEYS.includes(attr)) return { error: 'Elige un atributo.' };
  if ((character.candy?.ceded?.length ?? 0) >= limit) return { error: `Ya tienes ${limit} caramelos cedidos (tu bonificador de competencia). Recupera alguno antes.` };
  const c = clone(character);
  state(c).ceded.push({ id: localId('caramelo'), attr });
  const items = c.equipment.items;
  const same = items.find((i) => i.candy === attr && !i.equipped);
  if (same) same.quantity = (Number(same.quantity) || 0) + 1;
  else {
    items.push({
      name: candyName(attr), quantity: 1, consumable: true, candy: attr, weight: 0.01,
      notes: `+1 a ${ABILITY_LABEL[attr]} sin límite de tiempo (sin pasar de 20). Desde el segundo caramelo en 24 horas drena la vida de quien lo come. Cualquier curación quita el drenaje y el punto.`,
    });
  }
  return { character: c };
}

/** El creador recupera el punto cedido (el caramelo se comió hace más de 1 hora o se perdió). */
export function recoverCeded(character, id) {
  const c = clone(character);
  const st = state(c);
  const before = st.ceded.length;
  st.ceded = st.ceded.filter((x) => x.id !== id);
  return st.ceded.length === before ? { error: 'Ese caramelo ya no está cedido.' } : { character: c };
}

/**
 * Comer caramelos de un objeto del inventario.
 * @param {{ count?: number, earlierToday?: boolean }} opts  count ≥ 2 = «de golpe».
 */
export function eatCandy(character, index, { count = 1, earlierToday = false } = {}) {
  const item = character.equipment.items[index];
  if (!item?.candy) return { error: 'Eso no es un caramelo.' };
  const n = Math.max(1, Math.trunc(count));
  if ((Number(item.quantity) || 0) < n) return { error: `No te quedan ${n} ${n > 1 ? 'caramelos' : 'caramelo'} de ese tipo.` };
  const c = clone(character);
  const it = c.equipment.items[index];
  it.quantity -= n;
  if (it.quantity <= 0) c.equipment.items.splice(index, 1);
  const st = state(c);
  for (let i = 0; i < n && st.active.length < CANDY_LIMITS.active; i++) st.active.push({ id: localId('caramelo'), attr: item.candy });
  const rate = n >= 2 ? 3 : earlierToday ? 1 : 0;
  if (rate) st.drain = { rate: Math.max(rate, st.drain?.rate ?? 0), amount: st.drain?.amount ?? 0 };
  const label = ABILITY_LABEL[item.candy];
  return {
    character: c,
    drainRate: st.drain?.rate ?? 0,
    event: { kind: 'uso', text: `Come ${n > 1 ? `${n} caramelos` : 'un caramelo'} de ${label}.`, visibility: 'privado', data: { name: item.name, qty: n } },
  };
}

/** Quita a mano el efecto de un caramelo comido (p. ej. lo decidió el DM). */
export function endCandy(character, id) {
  const c = clone(character);
  const st = state(c);
  st.active = st.active.filter((x) => x.id !== id);
  return { character: c };
}

/** Pasan 10 minutos con el drenaje activo. */
export function drainTick(character) {
  if (!character.candy?.drain) return { error: 'No hay drenaje activo.' };
  const c = clone(character);
  const d = state(c).drain;
  d.amount = Math.min(CANDY_LIMITS.drain, d.amount + d.rate);
  return { character: c };
}

/**
 * Cualquier curación: se pierden el drenaje (y se devuelve lo drenado) y los
 * puntos ganados con caramelos. Los puntos cedidos por el creador no cambian.
 */
export function healCandy(character) {
  const st = character.candy;
  if (!st?.drain && !st?.active?.length) return { error: 'No tienes efectos de caramelos.' };
  const c = clone(character);
  const s = state(c);
  s.drain = null;
  s.active = [];
  return { character: c };
}

/** @deprecated Usa healCandy (desde 1.37 cualquier curación lo quita todo). */
export const cureDrain = healCandy;
