// Progresión del personaje: raza, subida y bajada de nivel.
// Todas las funciones devuelven un personaje NUEVO (no mutan el recibido).

import { ABILITY_KEYS, MAX_LEVEL, ABILITY_LABEL } from './constants.js';
import { getClass, getRace, getFeat, getEpicBoon } from '../data/index.js';
import {
  abilityScores, classLevels, featAbilityOptions, featAbilityBonus, featPrerequisites,
  hitDieFor, raceChoiceGroups, spellcasting, proficiencyBonus, subclassInfo, totalLevel,
} from './rules.js';

const clone = (c) => structuredClone(c);

// ── Dados ────────────────────────────────────────────────────────────────

export function rollDie(sides, rng = Math.random) {
  return Math.floor(rng() * sides) + 1;
}

/** 4d6 descartando el menor (método estándar del PHB). */
export function rollAbilityScore(rng = Math.random) {
  const dice = [rollDie(6, rng), rollDie(6, rng), rollDie(6, rng), rollDie(6, rng)].sort((a, b) => a - b);
  return dice[1] + dice[2] + dice[3];
}

// ── Raza ─────────────────────────────────────────────────────────────────

export function setRace(c, raceKey) {
  const next = clone(c);
  if (next.race.key === raceKey) return next;
  const previousInfo = getRace(next.race.key)?.info ?? '';
  next.race = { key: raceKey || null, abilityChoices: [], languages: [], feat: null };
  next.combat.speedOverrides = {};
  // Copia los rasgos raciales al bloc de notas si el usuario no lo había editado.
  const notes = next.notes.raceTraits.trim();
  if (!notes || notes === previousInfo.trim()) next.notes.raceTraits = getRace(raceKey)?.info ?? '';
  return next;
}

export function setRaceAbilityChoice(c, groupIndex, abilities) {
  const groups = raceChoiceGroups(getRace(c.race.key));
  const group = groups[groupIndex];
  if (!group) return c;
  const next = clone(c);
  // Un mismo atributo no puede recibir bonificación de dos grupos distintos.
  const takenElsewhere = new Set(next.race.abilityChoices.flatMap((g, i) => (i === groupIndex ? [] : g)));
  const valid = [...new Set(abilities)].filter((a) => group.allowed.includes(a) && !takenElsewhere.has(a)).slice(0, group.count);
  while (next.race.abilityChoices.length < groups.length) next.race.abilityChoices.push([]);
  next.race.abilityChoices[groupIndex] = valid;
  return next;
}

export function setRaceLanguages(c, languages, maxPicks) {
  const next = clone(c);
  next.race.languages = [...new Set(languages)].slice(0, maxPicks);
  return next;
}

export function raceAllowsFeat(c) {
  return Boolean(getRace(c.race.key)?.puedeElegirDote);
}

// ── Subida de nivel ──────────────────────────────────────────────────────

export function canLevelUp(c) {
  if (!c.race.key) return { ok: false, reason: 'Elige una raza antes de subir de nivel.' };
  if (totalLevel(c) >= MAX_LEVEL) return { ok: false, reason: `Ya estás en el nivel máximo (${MAX_LEVEL}).` };
  return { ok: true, reason: '' };
}

/**
 * Qué decisiones requiere subir un nivel en `classKey`.
 */
export function planLevelUp(c, classKey) {
  const cls = getClass(classKey);
  if (!cls) throw new Error(`Clase desconocida: ${classKey}`);
  const newClassLevel = (classLevels(c)[classKey] ?? 0) + 1;
  const newTotalLevel = totalLevel(c) + 1;
  const sub = subclassInfo(classKey);
  const milestone = cls.niveles?.[newClassLevel]?.requeridoTrue ?? null;
  const choice = milestone?.statAmount?.choice;
  return {
    classKey,
    className: cls.nombre,
    newClassLevel,
    newTotalLevel,
    hitDie: hitDieFor(classKey),
    isFirstLevel: newTotalLevel === 1,
    needsSubclass: Boolean(sub && newClassLevel >= sub.level && !c.subclasses[classKey]),
    subclassOptions: sub?.options ?? [],
    subclassLabel: sub?.label ?? 'Subclase',
    needsImprovement: Array.isArray(cls.nivelesDeAumento) && cls.nivelesDeAumento.includes(newClassLevel),
    milestone,
    featureChoice: choice
      ? { count: Number(choice.count) || 1, bonus: Number(choice.bonus) || 0, allowed: choice.allowedChoices ?? [...ABILITY_KEYS] }
      : null,
  };
}

function canTakeFeatTwice(def) {
  return /varias veces/i.test(def?.habilidad ?? '');
}

/** Errores de una mejora (ASI o dote) aplicada sobre `c`. */
export function validateImprovement(c, improvement) {
  const errors = [];
  const scores = abilityScores(c);
  if (!improvement) return ['Elige una mejora de atributos o una dote.'];

  if (improvement.type === 'asi') {
    const entries = Object.entries(improvement.increases ?? {}).filter(([, v]) => v > 0);
    const total = entries.reduce((s, [, v]) => s + v, 0);
    if (total !== 2 || entries.some(([k, v]) => !ABILITY_KEYS.includes(k) || v > 2)) {
      errors.push('Debes repartir exactamente 2 puntos: +2 a un atributo o +1 a dos atributos.');
    }
    for (const [k, v] of entries) {
      if (scores[k] && scores[k].total + v > scores[k].cap) {
        errors.push(`${ABILITY_LABEL[k]} no puede superar ${scores[k].cap}.`);
      }
    }
    return errors;
  }

  if (improvement.type === 'feat') {
    const def = getFeat(improvement.name);
    if (!def) return ['Elige una dote válida.'];
    const prof = proficiencyBonus(Math.max(1, totalLevel(c)));
    const { isCaster } = spellcasting(c, scores, prof);
    const pre = featPrerequisites(c, def, scores, { isCaster });
    if (!pre.ok) errors.push(...pre.reasons);
    const already = c.levels.some((l) => l.improvement?.type === 'feat' && l.improvement.name === improvement.name)
      || c.race.feat?.name === improvement.name;
    if (already && !canTakeFeatTwice(def)) errors.push('Ya tienes esta dote.');
    const options = featAbilityOptions(def);
    if (options.length && !options.includes(improvement.ability)) errors.push('Elige qué atributo aumenta la dote.');
    for (const [k, v] of Object.entries(featAbilityBonus(def, improvement.ability))) {
      if (scores[k].total + v > scores[k].cap) errors.push(`${ABILITY_LABEL[k]} no puede superar ${scores[k].cap}.`);
    }
    return errors;
  }
  return ['Tipo de mejora desconocido.'];
}

/**
 * Aplica una subida de nivel ya decidida.
 * @param {object} c
 * @param {{ classKey: string, hpRoll?: number, improvement?: object, subclass?: string, featureChoices?: object }} choices
 * @returns {{ character: object, errors: string[] }}
 */
export function applyLevelUp(c, choices) {
  const gate = canLevelUp(c);
  if (!gate.ok) return { character: c, errors: [gate.reason] };
  const plan = planLevelUp(c, choices.classKey);
  const errors = [];

  const hpRoll = plan.isFirstLevel ? plan.hitDie : Number(choices.hpRoll);
  if (!Number.isInteger(hpRoll) || hpRoll < 1 || hpRoll > plan.hitDie) {
    errors.push(`Tira el dado de golpe (d${plan.hitDie}) o usa el promedio.`);
  }
  if (plan.needsSubclass && !plan.subclassOptions.some((o) => o.key === choices.subclass)) {
    errors.push('Elige una subclase.');
  }
  if (plan.needsImprovement) errors.push(...validateImprovement(c, choices.improvement));
  let statAmountChoice = [];
  if (plan.featureChoice) {
    statAmountChoice = [...new Set(choices.featureChoices?.statAmount ?? [])]
      .filter((k) => plan.featureChoice.allowed.includes(k));
    if (statAmountChoice.length !== plan.featureChoice.count) {
      errors.push(`Elige ${plan.featureChoice.count} atributo(s) para el rasgo de clase.`);
    }
  }
  if (errors.length) return { character: c, errors };

  const next = clone(c);
  next.levels.push({
    classKey: plan.classKey,
    hpRoll,
    improvement: plan.needsImprovement ? structuredClone(choices.improvement) : null,
    featureChoices: statAmountChoice.length ? { statAmount: statAmountChoice } : {},
  });
  if (plan.needsSubclass) next.subclasses[plan.classKey] = choices.subclass;
  if (plan.newClassLevel === 1 && !next.notes.classNotes[plan.classKey]) {
    next.notes.classNotes[plan.classKey] = getClass(plan.classKey)?.niveles?.[1]?.atributoInicial ?? '';
  }
  return { character: next, errors: [] };
}

/** Quita el último nivel y todo lo que dependía de él. */
export function applyLevelDown(c) {
  if (c.levels.length === 0) return c;
  const next = clone(c);
  const removed = next.levels.pop();
  const remaining = classLevels(next)[removed.classKey] ?? 0;
  const sub = subclassInfo(removed.classKey);
  if (remaining === 0 || (sub && remaining < sub.level)) delete next.subclasses[removed.classKey];
  if (remaining === 0 && next.notes.classNotes[removed.classKey] === (getClass(removed.classKey)?.niveles?.[1]?.atributoInicial ?? '')) {
    delete next.notes.classNotes[removed.classKey];
  }
  if (next.levels.length < MAX_LEVEL) next.epicBoons = [];
  return next;
}

// ── Dote racial y bendiciones épicas ─────────────────────────────────────

export function setRaceFeat(c, feat) {
  if (!raceAllowsFeat(c)) return { character: c, errors: ['Tu raza no permite elegir una dote.'] };
  if (!feat) {
    const next = clone(c);
    next.race.feat = null;
    return { character: next, errors: [] };
  }
  const base = clone(c);
  base.race.feat = null;
  const errors = validateImprovement(base, { type: 'feat', ...feat });
  if (errors.length) return { character: c, errors };
  base.race.feat = { name: feat.name, ability: feat.ability ?? null };
  return { character: base, errors: [] };
}

export function canAddEpicBoon(c) {
  if (!c.settings.allowEpicBoons) return { ok: false, reason: 'Necesitas el permiso del DM (pestaña «DM»).' };
  if (totalLevel(c) < MAX_LEVEL) return { ok: false, reason: `Las bendiciones épicas requieren nivel ${MAX_LEVEL}.` };
  return { ok: true, reason: '' };
}

export function addEpicBoon(c, boon) {
  const gate = canAddEpicBoon(c);
  if (!gate.ok) return { character: c, errors: [gate.reason] };
  const def = getEpicBoon(boon?.name);
  if (!def) return { character: c, errors: ['Elige una bendición épica.'] };
  const errors = [];
  // Con la primera bendición el límite pasa a 30; se valida con ese límite.
  const probe = clone(c);
  probe.epicBoons.push({ name: boon.name, ability: null });
  const scores = abilityScores(probe);
  const pre = featPrerequisites(c, def, scores);
  if (!pre.ok) errors.push(...pre.reasons);
  const options = featAbilityOptions(def);
  if (options.length && !options.includes(boon.ability)) errors.push('Elige el atributo que aumenta la bendición.');
  const max = Number(def.maxStatAmount) || 30;
  for (const [k, v] of Object.entries(featAbilityBonus(def, boon.ability))) {
    if (scores[k].total + v > max) errors.push(`${ABILITY_LABEL[k]} no puede superar ${max}.`);
  }
  if (errors.length) return { character: c, errors };
  const next = clone(c);
  next.epicBoons.push({ name: boon.name, ability: options.length ? boon.ability : null });
  return { character: next, errors: [] };
}

export function removeEpicBoon(c, index) {
  const next = clone(c);
  next.epicBoons.splice(index, 1);
  return next;
}
