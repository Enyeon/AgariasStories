// Reglas derivadas: todo lo que se CALCULA a partir del personaje.
// Funciones puras, sin DOM y sin estado global, para poder testearlas y
// reutilizarlas (ficha, vista compartida, futuras exportaciones a PDF...).

import {
  ABILITY_KEYS, SKILLS, SPEEDS, MAX_LEVEL, BASE_ABILITY_CAP, EPIC_ABILITY_CAP, XP_BY_LEVEL,
} from './constants.js';
import { getClass, getRace, getFeat, getEpicBoon, raceHasToughness, getRaceTags, getOfficialBackground, data } from '../data/index.js';
import { createBackgroundDefinition } from './schema.js';
import { castingConfig, computeSpellSlots } from './spellcasting.js';
import {
  proficiencySources, isGranted, effectSources, classChoiceStatus, pendingClassChoices,
} from './proficiencies.js';
import { sumBonus } from './effects.js';
import { permissionsFor } from '../content/rules.js';
import { extensionSubclassOptions, extensionFeatures } from './extensions.js';
import { engineOf } from '../content/registry.js';

// ── Básicos ──────────────────────────────────────────────────────────────

export const abilityModifier = (score) => Math.floor((Number(score) - 10) / 2);

export const formatModifier = (n) => (n >= 0 ? `+${n}` : `${n}`);

export function proficiencyBonus(level) {
  if (level >= 17) return 6;
  if (level >= 13) return 5;
  if (level >= 9) return 4;
  if (level >= 5) return 3;
  return 2;
}

export const totalLevel = (c) => c.levels.length;

/** { classKey: nivel } en el orden en que se tomó cada clase. */
export function classLevels(c) {
  const out = {};
  for (const l of c.levels) out[l.classKey] = (out[l.classKey] ?? 0) + 1;
  return out;
}

/** Nivel de personaje sugerido por la experiencia (tabla del PHB). */
export function levelForExperience(xp) {
  let lvl = 1;
  for (let i = 0; i < XP_BY_LEVEL.length; i++) if (xp >= XP_BY_LEVEL[i]) lvl = i + 1;
  return lvl;
}

// ── Raza ─────────────────────────────────────────────────────────────────

/**
 * Normaliza `choice` (un grupo) y `choices` (varios) de los datos de raza a
 * una lista de grupos { count, bonus, allowed }.
 */
export function raceChoiceGroups(race) {
  if (!race) return [];
  const groups = Array.isArray(race.choices) ? race.choices : race.choice ? [race.choice] : [];
  return groups.map((g) => ({
    count: Number(g.count) || 1,
    bonus: Number(g.bonus) || 0,
    allowed: Array.isArray(g.allowedChoices) && g.allowedChoices.length ? g.allowedChoices : [...ABILITY_KEYS],
  }));
}

/** Bonificaciones raciales fijas + elegidas. */
export function racialBonuses(c) {
  const race = getRace(c.race.key);
  const out = Object.fromEntries(ABILITY_KEYS.map((k) => [k, 0]));
  if (!race) return out;
  for (const k of ABILITY_KEYS) out[k] += Number(race[k]) || 0;
  raceChoiceGroups(race).forEach((group, i) => {
    const chosen = c.race.abilityChoices[i] ?? [];
    for (const k of chosen.slice(0, group.count)) {
      if (group.allowed.includes(k)) out[k] += group.bonus;
    }
  });
  return out;
}

/** ¿Faltan elecciones de bonificación racial? */
export function pendingRaceChoices(c) {
  const groups = raceChoiceGroups(getRace(c.race.key));
  return groups.some((g, i) => (c.race.abilityChoices[i] ?? []).length < g.count);
}

// ── Trasfondo ────────────────────────────────────────────────────────────

/** Definición del trasfondo del personaje (oficial o homebrew), o null. */
export function backgroundDefinition(c) {
  const bg = c.background;
  if (bg?.source === 'official') {
    const def = getOfficialBackground(bg.key);
    return def ? createBackgroundDefinition({ ...def, key: bg.key, official: true }) : null;
  }
  if (bg?.source === 'custom' && bg.custom) return createBackgroundDefinition({ ...bg.custom, official: false });
  return null;
}

/** Aumento de atributos del trasfondo (opcional, reglas 2024). */
export function backgroundAbilityBonus(c) {
  const out = {};
  const def = backgroundDefinition(c);
  const { abilityMode, abilityChoices } = c.background ?? {};
  if (!def || !abilityMode || abilityMode === 'none') return out;
  const valid = abilityChoices.filter((k) => def.abilityOptions.includes(k));
  const amounts = abilityMode === '2-1' ? [2, 1] : [1, 1, 1];
  valid.slice(0, amounts.length).forEach((k, i) => { out[k] = (out[k] ?? 0) + amounts[i]; });
  return out;
}

/** ¿Faltan elecciones del trasfondo? */
export function pendingBackgroundChoices(c) {
  const def = backgroundDefinition(c);
  if (!def) return false;
  const bg = c.background;
  const needed = bg.abilityMode === '2-1' ? 2 : bg.abilityMode === '1-1-1' ? 3 : 0;
  if (needed && bg.abilityChoices.filter((k) => def.abilityOptions.includes(k)).length < needed) return true;
  if (def.feat && featAbilityOptions(getFeat(def.feat)).length && !bg.featAbility) return true;
  return false;
}

// ── Dotes y mejoras ──────────────────────────────────────────────────────

/** Todas las dotes del personaje: [{ name, ability, source, level }] */
export function allFeats(c) {
  const feats = [];
  if (c.race.feat?.name) feats.push({ ...c.race.feat, source: 'raza', level: 1 });
  const bg = backgroundDefinition(c);
  if (bg?.feat) feats.push({ name: bg.feat, ability: c.background.featAbility ?? null, source: 'trasfondo', level: 1 });
  c.levels.forEach((l, i) => {
    if (l.improvement?.type === 'feat') {
      feats.push({ name: l.improvement.name, ability: l.improvement.ability, source: 'nivel', level: i + 1 });
    }
  });
  return feats;
}

/** Opciones de atributo de una dote o bendición (aumentarStatOpcional). */
export function featAbilityOptions(def) {
  const opts = def?.aumentarStatOpcional ?? def?.limitAmountOpcional;
  if (!Array.isArray(opts)) return [];
  return opts.flatMap((o) => Object.keys(o)).filter((k) => ABILITY_KEYS.includes(k));
}

/** Bonificación de atributos que otorga una dote/bendición con la elección hecha. */
export function featAbilityBonus(def, chosenAbility) {
  const out = {};
  if (!def) return out;
  for (const [k, v] of Object.entries(def.aumentarStat ?? {})) {
    if (ABILITY_KEYS.includes(k)) out[k] = (out[k] ?? 0) + Number(v);
  }
  const opts = def.aumentarStatOpcional ?? def.limitAmountOpcional;
  if (Array.isArray(opts) && chosenAbility) {
    const match = opts.find((o) => chosenAbility in o);
    if (match) out[chosenAbility] = (out[chosenAbility] ?? 0) + Number(match[chosenAbility]);
  }
  return out;
}

/** Rasgos `requeridoTrue` de clase alcanzados (p. ej. Bárbaro 19, Shadow Knight 20). */
function reachedClassMilestones(c) {
  const milestones = [];
  const counts = {};
  c.levels.forEach((l, i) => {
    counts[l.classKey] = (counts[l.classKey] ?? 0) + 1;
    const req = getClass(l.classKey)?.niveles?.[counts[l.classKey]]?.requeridoTrue;
    if (req) milestones.push({ classKey: l.classKey, classLevel: counts[l.classKey], levelIndex: i, req, choices: l.featureChoices ?? {} });
  });
  return milestones;
}

/** Suma de todas las mejoras de atributo (ASI, dotes, bendiciones, rasgos de clase). */
export function improvementBonuses(c) {
  const out = Object.fromEntries(ABILITY_KEYS.map((k) => [k, 0]));
  const add = (bonus) => { for (const [k, v] of Object.entries(bonus)) if (k in out) out[k] += v; };

  for (const l of c.levels) {
    if (l.improvement?.type === 'asi') add(l.improvement.increases);
  }
  for (const f of allFeats(c)) add(featAbilityBonus(getFeat(f.name), f.ability));
  add(backgroundAbilityBonus(c));
  for (const b of c.epicBoons) add(featAbilityBonus(getEpicBoon(b.name), b.ability));
  for (const m of reachedClassMilestones(c)) {
    const amount = m.req.statAmount ?? {};
    for (const [k, v] of Object.entries(amount)) {
      if (ABILITY_KEYS.includes(k)) out[k] += Number(v);
    }
    if (amount.choice) {
      for (const k of (m.choices.statAmount ?? []).slice(0, amount.choice.count ?? 1)) {
        if (k in out) out[k] += Number(amount.choice.bonus) || 0;
      }
    }
  }
  return out;
}

/** Límite máximo de cada atributo. */
export function abilityCaps(c) {
  const caps = Object.fromEntries(ABILITY_KEYS.map((k) => [k, BASE_ABILITY_CAP]));
  for (const m of reachedClassMilestones(c)) {
    const statMax = m.req.statMax;
    if (statMax?.stat && Array.isArray(statMax.activos)) {
      for (const k of statMax.activos) if (k in caps) caps[k] = Math.max(caps[k], Number(statMax.stat));
    }
  }
  if (permissionsFor(c).epicBoons && c.epicBoons.length > 0) {
    for (const k of ABILITY_KEYS) caps[k] = Math.max(caps[k], EPIC_ABILITY_CAP);
  }
  return caps;
}

/** Puntuaciones completas: base, racial, mejoras, total, modificador y límite. */
export function abilityScores(c) {
  const racial = racialBonuses(c);
  const improvements = improvementBonuses(c);
  const caps = abilityCaps(c);
  // Bonificaciones «atributo:<clave>» de rasgos, dotes o extensiones (catálogo de efectos).
  const fx = effectSources(c);
  return Object.fromEntries(ABILITY_KEYS.map((k) => {
    const base = c.abilities[k];
    const effects = sumBonus(fx, `atributo:${k}`);
    const total = base + racial[k] + improvements[k] + effects;
    return [k, {
      base, racial: racial[k], improvements: improvements[k], effects, total,
      modifier: abilityModifier(total), cap: caps[k], overCap: total > caps[k],
    }];
  }));
}

// ── Habilidades y salvaciones ────────────────────────────────────────────

function passiveFeatBonus(c, skillName) {
  return allFeats(c).reduce((sum, f) => sum + (Number(getFeat(f.name)?.pasiva?.[skillName]) || 0), 0);
}

/** Habilidades con competencia otorgada por alguna fuente (no se pueden quitar a mano). */
export function grantedSkills(c) {
  return [...proficiencySources(c).skills].filter(([, src]) => isGranted(src)).map(([name]) => name);
}

export function skillBonuses(c, scores, prof, sources = proficiencySources(c)) {
  return SKILLS.map((s) => {
    const src = sources.skills.get(s.name) ?? [];
    const proficient = src.length > 0;
    const granted = isGranted(src);
    const fromBackground = src.some((x) => x.kind === 'trasfondo');
    // La pericia sólo cuenta si hay competencia (regla 5e).
    const expert = proficient && (c.proficiencies.expertise ?? []).includes(s.name);
    const bonus = scores[s.ability].modifier + (expert ? prof * 2 : proficient ? prof : 0);
    return {
      ...s, proficient, expert, granted, fromBackground, sources: src,
      bonus, passive: 10 + bonus + passiveFeatBonus(c, s.name),
    };
  });
}

/**
 * Pericias que otorgan los rasgos conocidos (clase `pericias` por nivel y
 * dotes con `pericias`). Es orientativo: el usuario puede marcar más si su DM
 * lo permite (homebrew, objetos mágicos...).
 */
export function expertiseAllowance(c) {
  const sources = [];
  for (const [classKey, level] of Object.entries(classLevels(c))) {
    const table = getClass(classKey)?.pericias ?? {};
    for (const [lvl, n] of Object.entries(table)) {
      if (level >= Number(lvl)) sources.push({ label: `${getClass(classKey).nombre} ${lvl}`, amount: Number(n) });
    }
  }
  for (const f of allFeats(c)) {
    const n = Number(getFeat(f.name)?.pericias) || 0;
    if (n) sources.push({ label: `Dote: ${f.name}`, amount: n });
  }
  for (const t of c.traits ?? []) {
    if (!t.active) continue;
    const n = (t.effects ?? []).filter((e) => e.type === 'pericia').reduce((a, e) => a + e.amount, 0);
    if (n) sources.push({ label: `Rasgo: ${t.name}`, amount: n });
  }
  return { total: sources.reduce((a, b) => a + b.amount, 0), sources };
}

export function savingThrows(c, scores, prof, sources = proficiencySources(c)) {
  const allBonus = sumBonus(effectSources(c), 'salvaciones');
  const resilient = allFeats(c).filter((f) => getFeat(f.name)?.salvacionDelAtributoElegido && f.ability);
  return ABILITY_KEYS.map((k) => {
    const src = [...(sources.saves.get(k) ?? [])];
    for (const f of resilient) if (f.ability === k) src.push({ kind: 'dote', label: f.name });
    const proficient = src.length > 0;
    return { ability: k, proficient, granted: isGranted(src), sources: src, bonus: scores[k].modifier + (proficient ? prof : 0) + allBonus };
  });
}

// ── Puntos de golpe ──────────────────────────────────────────────────────

export function hitDieFor(classKey) {
  return Number(getClass(classKey)?.dadoDeGolpe) || 8;
}

export function averageHitDieRoll(die) {
  return Math.floor(die / 2) + 1;
}

/**
 * PG máximos. Nivel 1: máximo del dado. Resto: tirada guardada.
 * Se suma el modificador de CON ACTUAL en cada nivel (regla 5e), +1 por nivel
 * con Dureza racial y +2 por nivel con la dote «Duro» (como en el original).
 */
export function hitPoints(c, scores) {
  const conMod = scores.constitucion.modifier;
  const tough = raceHasToughness(c.race.key);
  const fx = effectSources(c);
  const perLevelBonus = sumBonus(fx, 'pg_por_nivel');
  const flatBonus = sumBonus(fx, 'pg_max');
  const bonusLabels = fx.filter((s) => s.effects.some((e) => e.type === 'bono' && (e.target === 'pg_por_nivel' || e.target === 'pg_max'))).map((s) => s.label);
  const perLevel = c.levels.map((l, i) => {
    const die = hitDieFor(l.classKey);
    const roll = i === 0 ? die : Math.min(die, Math.max(1, l.hpRoll));
    const extra = (tough ? 1 : 0) + perLevelBonus;
    return { level: i + 1, classKey: l.classKey, die, roll, conMod, extra, total: Math.max(1, roll + conMod + extra) };
  });
  const max = perLevel.length ? perLevel.reduce((s, p) => s + p.total, 0) + flatBonus : 0;
  return { max, perLevel, tough, flatBonus, bonusLabels, duro: bonusLabels.includes('Duro') };
}

// ── Velocidades ──────────────────────────────────────────────────────────

export function speeds(c) {
  const race = getRace(c.race.key) ?? {};
  const walkBonus = sumBonus(effectSources(c), 'velocidad');
  return SPEEDS.map(({ key, label }) => {
    const fromRace = Number.isFinite(race[key]) ? race[key] : null;
    const override = c.combat.speedOverrides[key] ?? undefined;
    const base = override ?? fromRace ?? (key === 'velocidad' ? 30 : null);
    // Las bonificaciones de rasgos sólo afectan a la velocidad al caminar.
    const value = key === 'velocidad' && base !== null ? base + walkBonus : base;
    return { key, label, value, fromRace, bonus: key === 'velocidad' ? walkBonus : 0, overridden: override !== undefined };
  });
}

// ── Idiomas ──────────────────────────────────────────────────────────────

export function languageInfo(c) {
  const race = getRace(c.race.key);
  const fixed = new Set(Array.isArray(race?.yaHabla) ? race.yaHabla : []);
  let picks = Number(race?.languageElection) || 0;
  const raceOptions = Array.isArray(race?.choiceIdioma) ? race.choiceIdioma : null;
  if (raceOptions && picks === 0) picks = 1;
  picks += Number(backgroundDefinition(c)?.languages) || 0;
  for (const f of allFeats(c)) {
    const def = getFeat(f.name);
    picks += Number(def?.languageElection) || 0;
    if (def?.languageAprender) fixed.add(def.languageAprender);
  }
  const speaksAll = fixed.has('Todos');
  const pool = new Set([...data.languages, ...(raceOptions ?? [])]);
  const options = [...pool].filter((l) => !fixed.has(l)).sort((a, b) => a.localeCompare(b, 'es'));
  return {
    description: race?.lenguage ?? '',
    fixed: [...fixed],
    picks: speaksAll ? 0 : picks,
    raceOptions,
    options,
    chosen: c.race.languages.slice(0, speaksAll ? 0 : picks),
  };
}

// ── Conjuros ─────────────────────────────────────────────────────────────

export function spellcasting(c, scores, prof) {
  const levels = classLevels(c);
  const entries = [];
  const notes = [];
  for (const [classKey, level] of Object.entries(levels)) {
    const cls = getClass(classKey);
    if (!cls?.conjurador) continue;
    if (!ABILITY_KEYS.includes(cls.attribute)) {
      notes.push(`${cls.nombre}: lanzador «${cls.conjurador}» sin atributo de conjuro definido en los datos.`);
      continue;
    }
    const cfg = castingConfig(classKey);
    const mod = scores[cls.attribute].modifier;
    const idx = Math.min(MAX_LEVEL, level) - 1;
    let prepared = null;
    if (cfg?.preparedFrom === 'full') prepared = Math.max(1, mod + level);
    if (cfg?.preparedFrom === 'half') prepared = Math.max(1, mod + Math.floor(level / 2));
    entries.push({
      classKey, className: cls.nombre, level, ability: cls.attribute, modifier: mod,
      attack: mod + prof, dc: 8 + prof + mod,
      cantrips: cfg?.cantripsKnown?.[idx] ?? null,
      known: cfg?.spellsKnown?.[idx] ?? null,
      prepared,
      spellbook: cfg?.spellbook ? cfg.spellbook(level) : null,
    });
  }

  // Dotes que otorgan conjuros (agregado.conjurador). El original usaba INT.
  let featGranted = null;
  if (entries.length === 0) {
    const f = allFeats(c).find((x) => getFeat(x.name)?.agregado?.conjurador);
    if (f) {
      const ability = getFeat(f.name).attribute ?? 'inteligencia';
      const mod = scores[ability].modifier;
      featGranted = { feat: f.name, ability, modifier: mod, attack: mod + prof, dc: 8 + prof + mod };
    }
  }

  const { slots, pactSlots } = computeSpellSlots(entries.map((e) => ({ classKey: e.classKey, level: e.level })));
  return {
    isCaster: entries.length > 0 || Boolean(featGranted),
    entries, featGranted, slots, pactSlots, notes,
    classKeys: entries.map((e) => e.classKey),
  };
}

// ── Requisitos de dotes y bendiciones ────────────────────────────────────

function raceMatches(raceKey, required) {
  if (!raceKey || !required) return false;
  const tags = getRaceTags(raceKey);
  return tags.includes(required) || raceKey.toLowerCase().includes(String(required).toLowerCase());
}

/**
 * Comprueba los requisitos de una dote con el estado actual.
 * @returns {{ ok: boolean, reasons: string[] }}
 */
export function featPrerequisites(c, def, scores, { isCaster } = {}) {
  const reasons = [];
  const req = def?.requisito ?? {};
  for (const [k, v] of Object.entries(req)) {
    if (ABILITY_KEYS.includes(k) && scores[k].total < Number(v)) reasons.push(`Requiere ${k} ${v}`);
    if (k === 'raza' && !raceMatches(c.race.key, v)) reasons.push(`Requiere raza ${v}`);
    if (k === 'conjurador' && v && !isCaster) reasons.push('Requiere poder lanzar conjuros');
    if (k === 'subClase' && !Object.values(c.subclasses).includes(v)) reasons.push('Requiere una subclase concreta');
    if (k === 'niveles' && totalLevel(c) < Number(v)) reasons.push(`Requiere nivel ${v}`);
    if (k === 'claseName' && !(v in classLevels(c))) reasons.push(`Requiere la clase ${getClass(v)?.nombre ?? v}`);
  }
  if (def?.requisitoO) {
    const any = Object.entries(def.requisitoO).some(([k, v]) => ABILITY_KEYS.includes(k) && scores[k].total >= Number(v));
    if (!any) reasons.push(`Requiere ${Object.entries(def.requisitoO).map(([k, v]) => `${k} ${v}`).join(' o ')}`);
  }
  return { ok: reasons.length === 0, reasons };
}

// ── Rasgos de clase ──────────────────────────────────────────────────────

const blocks = (obj, map) => Object.values(obj ?? {}).filter(Boolean).map(map).filter((b) => b.title || b.text);

/** Rasgos de clase/subclase alcanzados, agrupados por clase. */
/**
 * CD propia de una clase homebrew (campo `cdClase` del JSON):
 * 8 + competencia + el mejor modificador entre los atributos indicados.
 */
export function classSaveDc(c, classKey, scores = abilityScores(c)) {
  const cfg = getClass(classKey)?.cdClase;
  const abilities = (cfg?.atributos ?? []).filter((k) => ABILITY_KEYS.includes(k));
  if (!cfg || !abilities.length) return null;
  const best = abilities.reduce((a, b) => (scores[b].modifier > scores[a].modifier ? b : a));
  return { name: cfg.nombre ?? 'CD de clase', ability: best, value: 8 + proficiencyBonus(Math.max(1, totalLevel(c))) + scores[best].modifier };
}

export function classFeatures(c) {
  const scores = abilityScores(c);
  return Object.entries(classLevels(c)).map(([classKey, level]) => {
    const cls = getClass(classKey);
    if (!cls) return { classKey, className: classKey, level, missing: true, levels: [], table: null };
    const subKey = c.subclasses[classKey] ?? null;
    const subLevel = Object.entries(cls.niveles).find(([, l]) => l.subClase)?.[0] ?? subclassInfo(classKey, c)?.level;
    const sub = extensionSubclass(c, classKey) ?? (subKey && subLevel ? cls.niveles[subLevel]?.subClase?.[subKey] : null);
    // Rasgos de extensiones Homebrew (subclase-extensión y habilidades especiales).
    const extFeatures = extensionFeatures(c, classKey, MAX_LEVEL);
    const replaced = new Map(extFeatures.filter((f) => f.replaces && f.level <= level).map((f) => [f.replaces.trim().toLowerCase(), f.title]));
    const definedLevels = Object.keys(cls.niveles).map(Number);
    const out = [];
    const tableCols = [];
    const tableRows = [];
    const featuresAt = (n) => ({
      features: [
        ...blocks(cls.niveles[n]?.infoBlock, (b) => ({
          title: b.name || '', text: b.descripcion || '',
          replacedBy: replaced.get(String(b.name || '').trim().toLowerCase()) ?? null,
        })),
        ...extFeatures.filter((f) => f.level === n && f.kind === 'rasgos').map((f) => ({
          title: f.title, text: f.text, homebrew: true, extension: f.extension, origin: f.origin, condition: f.condition, replaces: f.replaces,
        })),
      ],
      subFeatures: [
        ...(sub && !sub.homebrew ? blocks(sub.subNivel?.[n]?.infoSubBlock, (b) => ({ title: b.subName || '', text: b.subDescripcion || '' })) : []),
        ...extFeatures.filter((f) => f.level === n && f.kind === 'subclase').map((f) => ({
          title: f.title, text: f.text, homebrew: true, extension: f.extension, replaces: f.replaces,
        })),
      ],
    });
    for (let n = 1; n <= level; n++) {
      const l = cls.niveles[n];
      const { features, subFeatures } = featuresAt(n);
      const cube = l?.infoCubo;
      if (cube?.columnas?.some(Boolean)) {
        cube.columnas.forEach((col) => { if (col && !tableCols.includes(col)) tableCols.push(col); });
        const row = { level: n };
        cube.columnas.forEach((col, i) => { if (col) row[col] = cube.filas?.[0]?.[i] ?? ''; });
        tableRows.push(row);
      }
      out.push({ level: n, defined: definedLevels.includes(n), features, subFeatures });
    }
    const next = level < MAX_LEVEL ? { level: level + 1, defined: definedLevels.includes(level + 1), ...featuresAt(level + 1) } : null;
    return {
      classKey, className: cls.nombre, level, hitDie: cls.dadoDeGolpe,
      section: cls.seccion, summary: cls.niveles?.[1]?.descripcion ?? '', caster: Boolean(cls.conjurador),
      subclassLabel: cls.subclaseNombre ?? 'Subclase',
      subclassPending: Boolean(cls.subclasePendiente),
      subclassLevel: subLevel ? Number(subLevel) : null,
      extensions: [...new Set(extFeatures.map((f) => f.ref))],
      classDc: classSaveDc(c, classKey, scores),
      next,
      subclass: sub ? { key: subKey, name: sub.subNombre, description: sub.subDescripcion, pending: Boolean(sub.rasgosPendientes), source: sub.fuente ?? null, homebrew: Boolean(sub.homebrew) } : null,
      startingInfo: cls.niveles?.[1]?.atributoInicial ?? '',
      levels: out,
      table: tableCols.length ? { columns: tableCols, rows: tableRows } : null,
      missingLevels: out.filter((l) => !l.defined).map((l) => l.level),
    };
  });
}

/** Subclase disponible de una clase: { level, options: [{ key, name, description }] } */
export function subclassInfo(classKey, c = null) {
  const cls = getClass(classKey);
  if (!cls) return null;
  const entry = Object.entries(cls.niveles).find(([, l]) => l.subClase);
  // Con un personaje, se añaden las subclases-extensión Homebrew que puede usar.
  const extra = extensionSubclassOptions(c, classKey);
  if (!entry && !extra.length) return null;
  const official = entry ? Object.entries(entry[1].subClase).map(([key, s]) => ({ key, name: s.subNombre, description: s.subDescripcion ?? '' })) : [];
  return {
    level: entry ? Number(entry[0]) : Math.min(...extra.map((o) => o.level)),
    label: cls.subclaseNombre ?? 'Subclase',
    options: [...official, ...extra],
  };
}

/** Subclase-extensión elegida, en la forma de una subclase de los datos. */
function extensionSubclass(c, classKey) {
  const ref = c.subclasses?.[classKey];
  const ext = ref ? engineOf('extension', ref) : null;
  if (!ext || ext.kind !== 'subclase' || ext.classKey !== classKey) return null;
  return { subNombre: ext.name, subDescripcion: ext.description, subNivel: {}, homebrew: true, fuente: 'Homebrew' };
}

/** Recursos habilitados por efectos (p. ej. la Orden del Invocador habilita las criaturas de sangre). */
export function enabledResources(c) {
  return new Set(effectSources(c).flatMap((s) => s.effects.filter((e) => e.type === 'habilita').map((e) => e.value)));
}

/** Criaturas de sangre: lo declara la subclase en sus datos, no el código. */
export function hasBloodSummoning(c) {
  return enabledResources(c).has('criaturas_de_sangre');
}

/** Resistencias, inmunidades y vulnerabilidades declaradas por efectos. */
export function defenses(fx) {
  const out = { resistencia: [], inmunidad: [], vulnerabilidad: [], inmunidad_condicion: [] };
  for (const s of fx) {
    for (const e of s.effects) {
      if (e.type in out && !out[e.type].some((x) => x.value === e.value)) out[e.type].push({ value: e.value, source: s.label });
    }
  }
  return out;
}

// ── Vista completa de la ficha ───────────────────────────────────────────

/** Calcula todos los valores derivados de la ficha de una sola vez. */
export function computeSheet(c) {
  const level = totalLevel(c);
  const prof = proficiencyBonus(Math.max(1, level));
  const scores = abilityScores(c);
  const casting = spellcasting(c, scores, prof);
  const hp = hitPoints(c, scores);
  const sources = proficiencySources(c);
  const skills = skillBonuses(c, scores, prof, sources);
  const allowance = expertiseAllowance(c);
  const fx = effectSources(c);
  return {
    background: backgroundDefinition(c),
    pendingBackground: pendingBackgroundChoices(c),
    expertise: { used: skills.filter((s) => s.expert).length, allowed: allowance.total, sources: allowance.sources },
    level,
    classLevels: classLevels(c),
    proficiency: prof,
    scores,
    skills,
    saves: savingThrows(c, scores, prof, sources),
    initiative: scores.destreza.modifier + sumBonus(fx, 'iniciativa'),
    proficiencies: {
      armaduras: [...sources.armaduras].map(([name, src]) => ({ name, sources: src })),
      armas: [...sources.armas].map(([name, src]) => ({ name, sources: src })),
      herramientas: [...sources.herramientas].map(([name, src]) => ({ name, sources: src })),
      idiomas: [...sources.idiomas].map(([name, src]) => ({ name, sources: src })),
    },
    classChoices: classChoiceStatus(c),
    pendingClassChoices: pendingClassChoices(c),
    defenses: defenses(fx),
    passivePerception: skills.find((s) => s.name === 'Percepción').passive,
    hp,
    speeds: speeds(c),
    languages: languageInfo(c),
    spellcasting: casting,
    feats: allFeats(c),
    bloodSummoning: hasBloodSummoning(c),
    pendingRaceChoices: pendingRaceChoices(c),
    xpLevel: levelForExperience(c.experience),
  };
}
