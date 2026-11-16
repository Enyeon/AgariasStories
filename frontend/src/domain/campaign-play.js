// PJ de una campaña: resumen público, registro automático y herramientas del DM.
//
// Todo es puro (no toca red ni almacenamiento): recibe personajes y devuelve
// personajes nuevos y los acontecimientos que hay que anotar en el registro.
//
// Privacidad por defecto de lo que se anota solo:
//   - dinero, objetos y compras → «privado» (el jugador dueño y el DM);
//   - nivel, experiencia, muerte y regreso a la vida → «publico».

import { XP_BY_LEVEL } from './constants.js';
import { abilityScores, hitPoints } from './rules.js';
import { coinsInCp, currencyOf, formatCp, pay, receiveCoins, CURRENCIES } from './money.js';
import { createItem } from './schema.js';
import { raceName, getClass } from '../data/index.js';

export const VISIBILITY = Object.freeze({
  publico: { label: 'Toda la campaña', icon: '🌍' },
  privado: { label: 'Sólo el jugador y el DM', icon: '🔒' },
  dm: { label: 'Sólo el DM', icon: '🎲' },
});

export const PC_PRIVACY = Object.freeze({
  publico: { label: 'Ficha visible para la campaña', short: 'Ficha pública' },
  resumen: { label: 'Los demás sólo ven el resumen (nivel, clase, estado)', short: 'Sólo resumen' },
  privado: { label: 'Los demás sólo ven el nombre', short: 'Privada' },
});

export const PC_STATE = Object.freeze({
  vivo: { label: 'Vivo', icon: '❤' },
  muerto: { label: 'Muerto', icon: '💀' },
  retirado: { label: 'Retirado', icon: '🏳' },
});

export const EVENT_KINDS = Object.freeze({
  compra: '🛒', venta: '💰', dinero: '🪙', objeto: '🎒', nivel: '⬆', experiencia: '✨', vida: '❤',
  muerte: '💀', revivir: '🌅', retiro: '🏳', mision: '📜', recompensa: '🏆', nota: '📝', sesion: '🎬',
  pj: '🧝', miembro: '👤', tienda: '🏪', gremio: '⚔', posada: '🛏', acontecimiento: '📌',
});

const MAX_TEXT = 480;
const cut = (s) => (s.length > MAX_TEXT ? `${s.slice(0, MAX_TEXT - 1)}…` : s);
const plural = (n, word) => `${n > 1 ? `${n}× ` : ''}${word}`;

/** Resumen que ven los demás (sin retrato: el servidor limita su tamaño). */
export function pcSummary(character) {
  const c = character;
  let maxHp = null;
  try { maxHp = hitPoints(c, abilityScores(c)).max || null; } catch { /* ficha incompleta */ }
  const counts = {};
  for (const l of c.levels ?? []) counts[l.classKey] = (counts[l.classKey] ?? 0) + 1;
  return {
    name: String(c.identity?.name ?? '').trim().slice(0, 80) || 'Personaje sin nombre',
    player: String(c.identity?.player ?? '').trim().slice(0, 60),
    race: c.race?.key ? raceName(c.race.key) : '',
    classes: Object.entries(counts).map(([k, n]) => `${getClass(k)?.nombre ?? k} ${n}`).join(' / ').slice(0, 120),
    level: c.levels?.length ?? 0,
    hp: c.combat?.currentHp ?? maxHp,
    maxHp,
  };
}

function itemCounts(character) {
  const out = new Map();
  for (const it of character?.equipment?.items ?? []) {
    const name = String(it?.name ?? '').trim();
    if (!name) continue;
    out.set(name, (out.get(name) ?? 0) + Math.max(1, Math.trunc(Number(it.quantity) || 1)));
  }
  return out;
}

/** Diferencias de inventario por nombre: { added: [[nombre, n]], removed: [[nombre, n]] }. */
export function itemChanges(before, after) {
  const a = itemCounts(before);
  const b = itemCounts(after);
  const added = [];
  const removed = [];
  for (const [name, n] of b) { const d = n - (a.get(name) ?? 0); if (d > 0) added.push([name, d]); }
  for (const [name, n] of a) { const d = n - (b.get(name) ?? 0); if (d > 0) removed.push([name, d]); }
  return { added, removed };
}

const money = (amount, coins) => formatCp(Math.abs(amount), { system: currencyOf(coins) });

/**
 * Acontecimientos que se deducen de comparar dos versiones de la ficha.
 * `skip`: tipos que ya anotó quien hizo el cambio (p. ej. la Tienda anota la
 * compra con el vendedor y el precio; no hace falta repetir «−5 po» y «+cuerda»).
 */
export function diffEvents(before, after, { skip = [] } = {}) {
  if (!before || !after) return [];
  const out = [];
  const skipping = new Set(skip);
  const lv0 = before.levels?.length ?? 0;
  const lv1 = after.levels?.length ?? 0;
  if (lv1 > lv0 && !skipping.has('nivel')) {
    const cls = getClass(after.levels[lv1 - 1]?.classKey)?.nombre;
    out.push({ kind: 'nivel', text: `Sube a nivel ${lv1}${cls ? ` (${cls})` : ''}.`, visibility: 'publico', data: { from: lv0, to: lv1 } });
  } else if (lv1 < lv0 && !skipping.has('nivel')) {
    out.push({ kind: 'nivel', text: `Pasa de nivel ${lv0} a nivel ${lv1}.`, visibility: 'privado', data: { from: lv0, to: lv1 } });
  }
  const xp = (after.experience ?? 0) - (before.experience ?? 0);
  if (xp !== 0 && !skipping.has('experiencia')) {
    out.push({ kind: 'experiencia', text: `${xp > 0 ? '+' : '−'}${Math.abs(xp)} PX (total ${after.experience}).`, visibility: 'publico', data: { delta: xp } });
  }
  if (!skipping.has('dinero')) {
    const c0 = before.equipment?.coins;
    const c1 = after.equipment?.coins;
    if (currencyOf(c0) !== currencyOf(c1)) {
      out.push({ kind: 'dinero', text: `Cambia sus monedas a ${CURRENCIES[currencyOf(c1)].label}.`, visibility: 'privado' });
    } else {
      const d = coinsInCp(c1) - coinsInCp(c0);
      if (d !== 0) out.push({ kind: 'dinero', text: `${d > 0 ? 'Recibe' : 'Gasta'} ${money(d, c1)}.`, visibility: 'privado', data: { delta: d } });
    }
  }
  if (!skipping.has('objeto')) {
    const { added, removed } = itemChanges(before, after);
    const parts = [];
    if (added.length) parts.push(`Consigue: ${added.map(([n, q]) => plural(q, n)).join(', ')}.`);
    if (removed.length) parts.push(`Ya no tiene: ${removed.map(([n, q]) => plural(q, n)).join(', ')}.`);
    if (parts.length) out.push({ kind: 'objeto', text: cut(parts.join(' ')), visibility: 'privado' });
  }
  return out;
}

// ── Herramientas rápidas del DM ─────────────────────────────────────────────
// Cada una devuelve { character, events } o { error }.

const clone = (c) => structuredClone(c);

export function dmGiveItem(character, { name, quantity = 1, notes = '' }) {
  const clean = String(name ?? '').trim().slice(0, 120);
  const qty = Math.max(1, Math.min(9999, Math.trunc(Number(quantity) || 1)));
  if (!clean) return { error: 'Escribe el nombre del objeto.' };
  const c = clone(character);
  const same = c.equipment.items.find((i) => i.name.trim().toLowerCase() === clean.toLowerCase() && !i.ref);
  if (same) same.quantity = (Number(same.quantity) || 1) + qty;
  else c.equipment.items.push(createItem({ name: clean, quantity: qty, notes: String(notes ?? '').slice(0, 500) }));
  return { character: c, events: [{ kind: 'objeto', text: `El DM le da ${plural(qty, clean)}.`, visibility: 'privado', data: { name: clean, quantity: qty } }] };
}

/** Suma (amount > 0) o quita (amount < 0) dinero, en pc. Quitar más de lo que tiene falla. */
export function dmMoney(character, amount, reason = '') {
  const delta = Math.trunc(Number(amount) || 0);
  if (!delta) return { error: 'Indica una cantidad.' };
  const c = clone(character);
  const bag = c.equipment.coins;
  const why = String(reason ?? '').trim().slice(0, 120);
  if (delta > 0) {
    c.equipment.coins = receiveCoins(bag, delta);
  } else {
    const res = pay(bag, -delta);
    if (!res.ok) return { error: `No tiene tanto dinero (tiene ${formatCp(coinsInCp(bag), { system: currencyOf(bag) })}).` };
    c.equipment.coins = res.coins;
  }
  const text = `${delta > 0 ? 'El DM le da' : 'El DM le quita'} ${money(delta, bag)}${why ? ` (${why})` : ''}.`;
  return { character: c, events: [{ kind: delta > 0 ? 'recompensa' : 'dinero', text, visibility: 'privado', data: { delta } }] };
}

/** Fija los PG actuales (o los cambia en ±n con `relative`). */
export function dmSetHp(character, value, { relative = false } = {}) {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n)) return { error: 'Indica los puntos de golpe.' };
  const c = clone(character);
  let max = null;
  try { max = hitPoints(c, abilityScores(c)).max || null; } catch { /* sin niveles */ }
  const current = c.combat.currentHp ?? max ?? 0;
  let next = relative ? current + n : n;
  next = Math.max(0, Math.min(max ?? 9999, next));
  c.combat.currentHp = next;
  const text = relative ? `${n >= 0 ? 'Recupera' : 'Pierde'} ${Math.abs(n)} PG (${next}${max ? `/${max}` : ''}).` : `PG fijados en ${next}${max ? `/${max}` : ''} por el DM.`;
  return { character: c, events: [{ kind: 'vida', text, visibility: 'publico', data: { hp: next, max } }] };
}

/** Experiencia necesaria para el siguiente nivel (null si ya está al máximo). */
export function nextLevelXp(character) {
  const lv = character.levels?.length ?? 0;
  return lv > 0 && lv < XP_BY_LEVEL.length ? XP_BY_LEVEL[lv] : null;
}

/**
 * El DM autoriza subir de nivel: le da la experiencia justa para el siguiente.
 * La subida en sí (clase, PG, elecciones) la hace el jugador en su ficha.
 */
export function dmLevelUp(character) {
  const need = nextLevelXp(character);
  if (need == null) return { error: (character.levels?.length ?? 0) === 0 ? 'El personaje todavía no tiene nivel 1.' : 'Ya está en el nivel máximo.' };
  const c = clone(character);
  const lv = c.levels.length;
  c.experience = Math.max(c.experience ?? 0, need);
  return { character: c, events: [{ kind: 'nivel', text: `El DM autoriza subir a nivel ${lv + 1}.`, visibility: 'publico', data: { to: lv + 1 } }] };
}

export function dmGrantXp(character, amount) {
  const n = Math.trunc(Number(amount) || 0);
  if (n <= 0) return { error: 'Indica cuánta experiencia.' };
  const c = clone(character);
  c.experience = Math.min(10_000_000, (c.experience ?? 0) + n);
  return { character: c, events: [{ kind: 'experiencia', text: `Gana ${n} PX (total ${c.experience}).`, visibility: 'publico', data: { delta: n } }] };
}
