// Progresión del personaje: raza, subida y bajada de nivel.
// Todas las funciones devuelven un personaje NUEVO (no mutan el recibido).

import { pendingChoices, knownChoices, validateChoices, hasRequiredChoices, expandGrants, deferSpellChoices } from './class-choices.js';
import { ABILITY_KEYS, MAX_LEVEL, ABILITY_LABEL } from './constants.js';
import { getClass, getRace, getFeat, getEpicBoon } from '../data/index.js';
import { permissionsFor } from '../content/rules.js';
import { ensureSubclassUnlocks } from './extensions.js';
import {
  abilityScores, classLevels, featAbilityOptions, featAbilityBonus, featPrerequisites,
  hitDieFor, raceChoiceGroups, spellcasting, proficiencyBonus, subclassInfo, totalLevel,
  hitPoints, classFeatures,
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
  const race = getRace(c.race.key);
  return Boolean(race?.puedeElegirDote || race?.doteOpciones?.length);
}

/** Dotes entre las que la raza deja elegir (p. ej. los legados kobold), o null si vale cualquiera. */
export function raceFeatOptions(c) {
  const opts = getRace(c.race.key)?.doteOpciones;
  return Array.isArray(opts) && opts.length ? opts : null;
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
export function planLevelUp(c, classKey, { subclass = null } = {}) {
  const cls = getClass(classKey);
  if (!cls) throw new Error(`Clase desconocida: ${classKey}`);
  const newClassLevel = (classLevels(c)[classKey] ?? 0) + 1;
  const newTotalLevel = totalLevel(c) + 1;
  const sub = subclassInfo(classKey, c);
  const milestone = cls.niveles?.[newClassLevel]?.requeridoTrue ?? null;
  const choice = milestone?.statAmount?.choice;
  const needsSubclass = Boolean(sub && newClassLevel >= sub.level && !c.subclasses[classKey]);
  // Las elecciones de la subclase dependen de cuál se elija en este mismo nivel.
  const subKey = c.subclasses[classKey] ?? (needsSubclass ? subclass : null);
  return {
    classKey,
    className: cls.nombre,
    newClassLevel,
    newTotalLevel,
    hitDie: hitDieFor(classKey),
    isFirstLevel: newTotalLevel === 1,
    needsSubclass,
    subclassOptions: sub?.options ?? [],
    subclassLabel: sub?.label ?? 'Subclase',
    needsImprovement: Array.isArray(cls.nivelesDeAumento) && cls.nivelesDeAumento.includes(newClassLevel),
    milestone,
    featureChoice: choice
      ? { count: Number(choice.count) || 1, bonus: Number(choice.bonus) || 0, allowed: choice.allowedChoices ?? [...ABILITY_KEYS] }
      : null,
    // Los conjuros se eligen después, desde la pestaña Conjuros.
    ...(() => {
      const { groups, deferred } = deferSpellChoices(pendingChoices(c, classKey, newClassLevel, subKey));
      return { choices: groups, deferredSpells: deferred };
    })(),
  };
}

function canTakeFeatTwice(def) {
  return /varias veces/i.test(def?.habilidad ?? '');
}

/** Errores de una mejora (ASI o dote) aplicada sobre `c`. */
export function validateImprovement(c, improvement, { racial = false } = {}) {
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
    // Las dotes «sólo de raza» (legados) no se eligen al subir de nivel.
    if (def.soloRaza && !racial) return ['Esa dote sólo la da tu raza.'];
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
  const plan = planLevelUp(c, choices.classKey, { subclass: choices.subclass });
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
  const subKey = c.subclasses[plan.classKey] ?? (plan.needsSubclass ? choices.subclass : null);
  const grants = deferSpellChoices(expandGrants(plan.classKey, subKey, plan.choices, choices.featureChoices?.elecciones)).groups;
  const picked = validateChoices(knownChoices(c, plan.classKey), grants, choices.featureChoices?.elecciones, { spells: choices.spells ?? null });
  errors.push(...picked.errors);
  if (errors.length) return { character: c, errors };

  const next = clone(c);
  next.levels.push({
    classKey: plan.classKey,
    hpRoll,
    improvement: plan.needsImprovement ? structuredClone(choices.improvement) : null,
    featureChoices: {
      ...(statAmountChoice.length ? { statAmount: statAmountChoice } : {}),
      ...(Object.keys(picked.elecciones).length ? { elecciones: picked.elecciones } : {}),
    },
  });
  if (plan.needsSubclass) {
    next.subclasses[plan.classKey] = choices.subclass;
    ensureSubclassUnlocks(next);
  }
  if (plan.newClassLevel === 1 && !next.notes.classNotes[plan.classKey]) {
    next.notes.classNotes[plan.classKey] = getClass(plan.classKey)?.niveles?.[1]?.atributoInicial ?? '';
  }
  return { character: next, errors: [] };
}

/**
 * Elige la subclase de una clase que ya alcanzó su nivel (p. ej. si la elección
 * anterior se retiró de los datos). Devuelve un personaje NUEVO.
 */
export function setSubclass(c, classKey, subKey) {
  const sub = subclassInfo(classKey, c);
  const level = classLevels(c)[classKey] ?? 0;
  if (!sub || level < sub.level) return { character: c, errors: ['Esta clase todavía no elige subclase.'] };
  if (!sub.options.some((o) => o.key === subKey)) return { character: c, errors: ['Elige una opción válida.'] };
  const next = clone(c);
  next.subclasses[classKey] = subKey;
  ensureSubclassUnlocks(next);
  return { character: next, errors: [] };
}

// ── Varios niveles de una vez ────────────────────────────────────────────

/**
 * Aplica varias subidas de nivel en orden, cada una sobre el resultado de la
 * anterior (exactamente igual que subir de una en una). Es atómica: si alguna
 * falla, devuelve el personaje original sin cambios y el nivel que falló.
 * @param {object} c
 * @param {Array<Parameters<typeof applyLevelUp>[1]>} choicesList
 */
export function applyLevelUps(c, choicesList) {
  let current = c;
  for (let i = 0; i < choicesList.length; i++) {
    const res = applyLevelUp(current, choicesList[i]);
    if (res.errors.length) {
      return { character: c, errors: res.errors, failedAt: totalLevel(c) + i + 1 };
    }
    current = res.character;
  }
  return { character: current, errors: [], failedAt: null };
}

/** ¿El siguiente nivel en esta clase requiere alguna decisión del jugador? */
export function levelNeedsDecisions(c, classKey) {
  const plan = planLevelUp(c, classKey);
  return plan.needsSubclass || plan.needsImprovement || Boolean(plan.featureChoice) || hasRequiredChoices(plan.choices);
}

/** Quita el último nivel y todo lo que dependía de él. */
export function applyLevelDown(c) {
  if (c.levels.length === 0) return c;
  const next = clone(c);
  const removed = next.levels.pop();
  const remaining = classLevels(next)[removed.classKey] ?? 0;
  const sub = subclassInfo(removed.classKey, next);
  if (remaining === 0 || (sub && remaining < sub.level)) delete next.subclasses[removed.classKey];
  if (remaining === 0 && next.classChoices) delete next.classChoices[removed.classKey];
  if (remaining === 0 && next.notes.classNotes[removed.classKey] === (getClass(removed.classKey)?.niveles?.[1]?.atributoInicial ?? '')) {
    delete next.notes.classNotes[removed.classKey];
  }
  if (next.levels.length < MAX_LEVEL) next.epicBoons = [];
  // Los PG actuales no pueden quedar por encima del nuevo máximo.
  if (next.combat?.currentHp !== null && next.combat?.currentHp !== undefined) {
    const max = hitPoints(next, abilityScores(next)).max;
    if (next.combat.currentHp > max) next.combat.currentHp = max;
  }
  return next;
}

/**
 * Baja varios niveles quitando uno a uno (10 → 9 → … → 5) con applyLevelDown,
 * igual que si se bajara de uno en uno. Lo que no depende del nivel (raza,
 * trasfondo, rasgos con origen, criaturas, equipo, notas) se conserva.
 * @param {object} c
 * @param {number} targetLevel 0…nivel actual
 */
export function applyLevelDowns(c, targetLevel) {
  const target = Math.max(0, Math.min(c.levels.length, Math.trunc(Number(targetLevel))));
  let current = c;
  while (current.levels.length > target) current = applyLevelDown(current);
  return current;
}

/**
 * Qué se pierde al bajar a `targetLevel`, para enseñarlo antes de confirmar.
 * `spells` (opcional): catálogo de conjuros, para avisar de los conocidos de un
 * nivel que ya no se puede lanzar.
 */
export function levelDownPreview(c, targetLevel, spells = null) {
  const after = applyLevelDowns(c, targetLevel);
  const levels = c.levels.slice(after.levels.length).map((l, i) => ({
    level: after.levels.length + i + 1,
    classKey: l.classKey,
    className: getClass(l.classKey)?.nombre ?? l.classKey,
    hpRoll: l.hpRoll,
    improvement: l.improvement,
  })).reverse();
  const beforeFx = classFeatures(c);
  const afterLevels = classLevels(after);
  const features = [];
  for (const f of beforeFx) {
    const keep = afterLevels[f.classKey] ?? 0;
    for (const lvl of f.levels.filter((x) => x.level > keep)) {
      for (const x of [...lvl.features, ...lvl.subFeatures]) if (x.title) features.push({ className: f.className, level: lvl.level, title: x.title });
    }
  }
  const subclasses = Object.keys(c.subclasses).filter((k) => !after.subclasses[k])
    .map((k) => ({ classKey: k, className: getClass(k)?.nombre ?? k, name: subclassInfo(k, c)?.options.find((o) => o.key === c.subclasses[k])?.name ?? c.subclasses[k] }));
  const classesLost = Object.keys(classLevels(c)).filter((k) => !afterLevels[k]).map((k) => getClass(k)?.nombre ?? k);
  const topLevel = (arr) => (arr ?? []).reduce((m, n, i) => (n > 0 ? i + 1 : m), 0);
  const maxSpellLevel = (sc) => Math.max(topLevel(sc.slots), topLevel(sc.pactSlots));
  let spellsAbove = [];
  if (spells && c.spells.known.length) {
    const newMax = maxSpellLevel(spellcasting(after, abilityScores(after)));
    spellsAbove = c.spells.known.filter((name) => {
      const lvl = spells[name]?.nivel;
      const n = lvl === 'Truco' ? 0 : Number(lvl);
      return Number.isFinite(n) && n > newMax;
    });
  }
  const scoresBefore = abilityScores(c);
  const scoresAfter = abilityScores(after);
  return {
    from: c.levels.length,
    to: after.levels.length,
    character: after,
    levels,
    features,
    subclasses,
    classesLost,
    epicBoons: after.epicBoons.length < c.epicBoons.length ? c.epicBoons.map((b) => b.name) : [],
    abilities: ABILITY_KEYS.filter((k) => scoresBefore[k].total !== scoresAfter[k].total)
      .map((k) => ({ ability: k, before: scoresBefore[k].total, after: scoresAfter[k].total })),
    hp: { before: hitPoints(c, scoresBefore).max, after: hitPoints(after, scoresAfter).max },
    spellsAbove,
  };
}

/** Quita de los conocidos los conjuros indicados (y de los preparados). */
export function forgetSpells(c, names) {
  const drop = new Set(names);
  const next = clone(c);
  next.spells.known = next.spells.known.filter((n) => !drop.has(n));
  next.spells.prepared = next.spells.prepared.filter((n) => !drop.has(n));
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
  const only = raceFeatOptions(c);
  if (only && !only.includes(feat.name)) return { character: c, errors: [`Tu raza sólo deja elegir: ${only.join(', ')}.`] };
  const base = clone(c);
  base.race.feat = null;
  const errors = validateImprovement(base, { type: 'feat', ...feat }, { racial: true });
  if (errors.length) return { character: c, errors };
  base.race.feat = { name: feat.name, ability: feat.ability ?? null };
  return { character: base, errors: [] };
}

export function canAddEpicBoon(c) {
  const perms = permissionsFor(c);
  if (!perms.epicBoons) {
    return { ok: false, reason: perms.campaign ? `La campaña «${perms.campaign.name}» no permite bendiciones épicas.` : 'Necesitas el permiso del DM (pestaña «DM»).' };
  }
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
