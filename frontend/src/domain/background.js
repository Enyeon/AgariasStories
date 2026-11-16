// Operaciones sobre el trasfondo del personaje. Devuelven personajes nuevos.

import { ABILITY_LABEL } from './constants.js';
import { createBackgroundState, createItem } from './schema.js';
import { normalizeBackgroundDefinition } from './validation.js';
import { abilityScores, backgroundDefinition, backgroundSkillPicks } from './rules.js';
import { getBackgroundFeature } from '../data/index.js';
import { currencyOf, receiveCoins, coinsInCp } from './money.js';

const clone = (c) => structuredClone(c);
const capitalize = (s) => (s ? s[0].toLocaleUpperCase('es') + s.slice(1) : s);

/**
 * Elige un trasfondo: { source: 'official', key } o { source: 'custom', custom }.
 * Se reinician las elecciones (atributos, dote, equipo) porque dependen del trasfondo.
 */
export function setBackground(c, choice) {
  const next = clone(c);
  next.background = createBackgroundState();
  if (choice?.source === 'official' && choice.key) {
    Object.assign(next.background, { source: 'official', key: choice.key });
  } else if (choice?.source === 'custom' && choice.custom) {
    Object.assign(next.background, {
      source: 'custom',
      custom: normalizeBackgroundDefinition(choice.custom),
      ref: typeof choice.ref === 'string' && choice.ref.startsWith('hb:') ? choice.ref : null,
    });
  }
  return next;
}

/**
 * Edita el homebrew conservando las elecciones que sigan siendo válidas.
 * Si venía de una campaña, deja de estar vinculado: ahora es del jugador.
 */
export function updateCustomBackground(c, def) {
  const next = clone(c);
  const custom = normalizeBackgroundDefinition(def);
  const prev = next.background;
  next.background = {
    ...createBackgroundState(),
    source: 'custom',
    custom,
    abilityMode: prev.abilityMode,
    abilityChoices: prev.abilityChoices.filter((k) => custom.abilityOptions.includes(k)),
    featAbility: custom.feat === backgroundDefinition(c)?.feat ? prev.featAbility : null,
    equipmentChoice: custom.equipment.some((e) => e.label === prev.equipmentChoice) ? prev.equipmentChoice : null,
    equipmentApplied: prev.equipmentApplied,
    featPick: custom.featOptions.includes(prev.featPick) ? prev.featPick : null,
    skillPicks: backgroundSkillPicks(custom, prev.skillPicks),
    featureAlt: prev.featureAlt,
  };
  if (!custom.abilityOptions.length) Object.assign(next.background, { abilityMode: 'none', abilityChoices: [] });
  return next;
}

/** Copia editable de un trasfondo oficial para personalizarlo. */
export function customizeOfficial(def) {
  const copy = normalizeBackgroundDefinition(def.unresolved ?? def);
  copy.name = `${def.name} (personalizado)`;
  return copy;
}

/**
 * Aumento de atributos del trasfondo.
 * @param {'none'|'2-1'|'1-1-1'} mode
 * @param {string[]} choices  En '2-1', el primero recibe +2 y el segundo +1.
 */
export function setBackgroundAbilities(c, mode, choices) {
  const def = backgroundDefinition(c);
  if (!def) return { character: c, errors: ['Primero elige un trasfondo.'] };
  const next = clone(c);
  next.background.abilityMode = mode;
  const picks = [...choices].filter((k) => k && def.abilityOptions.includes(k));
  const unique = picks.filter((k, i) => picks.indexOf(k) === i);
  next.background.abilityChoices = mode === 'none' ? [] : unique.slice(0, mode === '2-1' ? 2 : 3);
  if (unique.length !== picks.length) return { character: c, errors: ['No puedes elegir el mismo atributo dos veces.'] };

  const errors = [];
  const scores = abilityScores(next);
  for (const k of next.background.abilityChoices) {
    if (scores[k].overCap) errors.push(`${ABILITY_LABEL[k]} superaría su máximo (${scores[k].cap}).`);
  }
  return errors.length ? { character: c, errors } : { character: next, errors: [] };
}

export function setBackgroundFeatAbility(c, ability) {
  const next = clone(c);
  next.background.featAbility = ability || null;
  return next;
}

/** Dote elegida entre las que ofrece el trasfondo (featOptions). */
export function setBackgroundFeatPick(c, name) {
  const def = backgroundDefinition(c);
  if (!def || !def.unresolved.featOptions.includes(name)) return c;
  const next = clone(c);
  if (next.background.featPick !== name) next.background.featAbility = null;
  next.background.featPick = name;
  return next;
}

/** Habilidades elegidas de la lista `index` de skillChoices. */
export function setBackgroundSkillPicks(c, index, skills) {
  const def = backgroundDefinition(c);
  const choice = def?.unresolved.skillChoices[index];
  if (!choice) return c;
  const next = clone(c);
  const picks = def.skillChoices.map((_, i) => (i === index ? [...skills] : [...(next.background.skillPicks[i] ?? [])]));
  next.background.skillPicks = backgroundSkillPicks(def.unresolved, picks);
  return next;
}

/** Rasgo alternativo que sustituye al del trasfondo (null = el original). */
export function setBackgroundFeatureAlt(c, key) {
  const next = clone(c);
  next.background.featureAlt = getBackgroundFeature(key) ? key : null;
  return next;
}

export function setBackgroundEquipmentChoice(c, label) {
  const next = clone(c);
  next.background.equipmentChoice = label || null;
  return next;
}

/**
 * Interpreta una lista de equipo escrita a mano:
 * «2 dagas, herramientas de ladrón, palanqueta y 16 po» →
 * { items: [{name:'Dagas', quantity:2}, ...], coins: { gp: 16 } }
 */
export function parseEquipmentText(text) {
  const coins = { cp: 0, sp: 0, gp: 0, pp: 0 };
  const COIN = { pc: 'cp', pp: 'sp', po: 'gp', ppt: 'pp' };
  const items = [];
  const cleaned = String(text ?? '').replace(/^\s*\(?[A-Z]\)\s*/, '').replace(/\.\s*$/, '');
  // Separa por comas y por la última « y » (sin romper paréntesis).
  const parts = [];
  let depth = 0;
  let current = '';
  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (ch === '(') depth++;
    if (ch === ')') depth = Math.max(0, depth - 1);
    if (depth === 0 && (ch === ',' || ch === ';' || cleaned.startsWith(' y ', i))) {
      parts.push(current);
      current = '';
      if (cleaned.startsWith(' y ', i)) i += 2;
      continue;
    }
    current += ch;
  }
  parts.push(current);

  for (const raw of parts) {
    const part = raw.trim();
    if (!part) continue;
    const money = /^(\d+)\s*(ppt|po|pp|pc)\b\.?$/i.exec(part);
    if (money) {
      coins[COIN[money[2].toLowerCase()]] += Number(money[1]);
      continue;
    }
    const qty = /^(\d+)\s+(.+)$/.exec(part);
    items.push(createItem({ name: capitalize(qty ? qty[2] : part), quantity: qty ? Number(qty[1]) : 1 }));
  }
  return { items, coins };
}

/** Añade al inventario el equipo elegido del trasfondo (una sola vez). */
export function applyBackgroundEquipment(c, label) {
  const def = backgroundDefinition(c);
  const option = def?.equipment.find((e) => e.label === label);
  if (!option) return { character: c, errors: ['Elige una opción de equipo.'] };
  if (c.background.equipmentApplied) {
    return { character: c, errors: ['El equipo del trasfondo ya se añadió al inventario.'] };
  }
  const { items, coins } = parseEquipmentText(option.text);
  const next = clone(c);
  next.equipment.items.push(...items);
  // Los importes del libro están en monedas de D&D: con otro sistema se suma su valor.
  if (currencyOf(next.equipment.coins) === 'dnd') for (const [k, v] of Object.entries(coins)) next.equipment.coins[k] += v;
  else next.equipment.coins = receiveCoins(next.equipment.coins, coinsInCp(coins, 'dnd'));
  next.background.equipmentChoice = label;
  next.background.equipmentApplied = label;
  return { character: next, errors: [], added: { items, coins } };
}
