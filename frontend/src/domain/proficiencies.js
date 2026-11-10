// Competencias y efectos del personaje, con su procedencia.
//
// Todas las competencias pasan por `proficiencySources`, que devuelve cada una
// con TODAS sus fuentes (Clase, Raza, Trasfondo, Dote, Otros). La ficha usa ese
// resultado para calcular bonificadores, mostrar de dónde viene cada cosa y
// detectar duplicados, sin contar nada dos veces.

import { ABILITY_KEYS, ABILITY_LABEL, SKILL_NAMES } from './constants.js';
import { getClass, getFeat, getRace } from '../data/index.js';
import { normalizeEffects } from './effects.js';
import { allFeats, backgroundDefinition, classLevels } from './rules.js';
import { extensionFeatures } from './extensions.js';

export const SOURCE_KINDS = Object.freeze({
  clase: 'Clase',
  raza: 'Raza',
  trasfondo: 'Trasfondo',
  dote: 'Dote',
  otros: 'Otros',
});

export const TRAIT_ORIGINS = Object.freeze({
  dm: 'Otorgado por el DM',
  campana: 'Campaña',
  evento: 'Evento',
  objeto: 'Objeto',
  bendicion: 'Bendición',
  maldicion: 'Maldición',
  otro: 'Otro',
});

// ── Competencias de clase ────────────────────────────────────────────────

const EMPTY = Object.freeze({ armaduras: [], armas: [], herramientas: [], salvaciones: [], habilidades: null });

/**
 * Competencias declaradas por una clase, normalizadas.
 * `primary`: la primera clase del personaje recibe las completas; las demás,
 * las de multiclase (regla oficial).
 */
export function classProficiencies(classKey, { primary = true } = {}) {
  const cls = getClass(classKey);
  const block = primary ? cls?.competencias : cls?.competenciasMulticlase;
  if (!cls || !block || block.pendiente) {
    return { classKey, className: cls?.nombre ?? classKey, primary, pending: true, ...EMPTY, saveChoice: null, skills: null };
  }
  const sk = block.habilidades;
  return {
    classKey,
    className: cls.nombre,
    primary,
    pending: false,
    source: cls.fuenteReglas ?? null,
    armaduras: block.armaduras ?? [],
    armas: block.armas ?? [],
    herramientas: block.herramientas ?? [],
    salvaciones: primary ? (block.salvaciones ?? []) : [],
    saveChoice: primary && block.salvacionesElegir ? {
      count: Number(block.salvacionesElegir.elegir) || 1,
      options: block.salvacionesElegir.de.filter((a) => ABILITY_KEYS.includes(a)),
    } : null,
    armorNote: block.notaArmadura ?? null,
    skills: sk ? {
      count: Number(sk.elegir) || 0,
      options: sk.de === 'cualquiera' ? [...SKILL_NAMES] : sk.de.filter((s) => SKILL_NAMES.includes(s)),
      any: sk.de === 'cualquiera',
    } : null,
  };
}

/** Clase con la que empezó el personaje (la del nivel 1). */
export const primaryClassKey = (c) => c.levels[0]?.classKey ?? null;

/** Competencias de todas las clases del personaje, en orden de adquisición. */
export function characterClassProficiencies(c) {
  const primary = primaryClassKey(c);
  return Object.keys(classLevels(c)).map((key) => classProficiencies(key, { primary: key === primary }));
}

export function classChoices(c, classKey) {
  const ch = c.classChoices?.[classKey];
  return { skills: ch?.skills ?? [], saves: ch?.saves ?? [] };
}

// ── Efectos de dotes y rasgos ────────────────────────────────────────────

/**
 * Todas las fuentes de efectos activas: [{ kind, label, effects }].
 * Hoy: dotes con `efectos` en sus datos y rasgos personalizados activos.
 */
export function effectSources(c) {
  const out = [];
  const race = getRace(c.race?.key);
  const raceFx = normalizeEffects(race?.efectos);
  if (raceFx.length) out.push({ kind: 'raza', label: race.nombre ?? c.race.key, effects: raceFx });
  for (const [classKey, subKey] of Object.entries(c.subclasses ?? {})) {
    const cls = getClass(classKey);
    const sub = Object.values(cls?.niveles ?? {}).find((l) => l.subClase)?.subClase?.[subKey];
    const fx = normalizeEffects(sub?.efectos);
    if (fx.length) out.push({ kind: 'clase', label: sub.subNombre ?? subKey, effects: fx });
  }
  // Rasgos de clase y de subclase con `efectos` en los datos (blocks de cada
  // nivel alcanzado). Así una clase declara su mecánica sin código propio.
  for (const [classKey, level] of Object.entries(classLevels(c))) {
    const cls = getClass(classKey);
    const subKey = c.subclasses?.[classKey];
    const sub = subKey ? Object.values(cls?.niveles ?? {}).find((l) => l.subClase)?.subClase?.[subKey] : null;
    for (let n = 1; n <= level; n++) {
      for (const b of Object.values(cls?.niveles?.[n]?.infoBlock ?? {})) {
        const fx = normalizeEffects(b?.efectos);
        if (fx.length) out.push({ kind: 'clase', label: b.name || cls.nombre, effects: fx });
      }
      for (const b of Object.values(sub?.subNivel?.[n]?.infoSubBlock ?? {})) {
        const fx = normalizeEffects(b?.efectos);
        if (fx.length) out.push({ kind: 'clase', label: b.subName || sub.subNombre, effects: fx });
      }
    }
  }
  // Rasgos de extensiones Homebrew alcanzados por nivel.
  for (const [classKey, level] of Object.entries(classLevels(c))) {
    for (const f of extensionFeatures(c, classKey, level)) {
      if (f.effects?.length) out.push({ kind: 'clase', label: f.title, effects: f.effects });
    }
  }
  for (const f of allFeats(c)) {
    const effects = normalizeEffects(getFeat(f.name)?.efectos);
    if (effects.length) out.push({ kind: 'dote', label: getFeat(f.name)?.nombre ?? f.name, effects });
  }
  for (const t of c.traits ?? []) {
    if (!t.active || !t.effects?.length) continue;
    out.push({ kind: 'otros', label: t.name || 'Rasgo', origin: t.origin, effects: t.effects });
  }
  return out;
}

// ── Fuentes de competencias ──────────────────────────────────────────────

function addTo(map, key, source) {
  if (!key) return;
  const list = map.get(key) ?? [];
  if (!list.some((s) => s.kind === source.kind && s.label === source.label)) list.push(source);
  map.set(key, list);
}

/**
 * Cada competencia con todas sus fuentes.
 * @returns {{ skills: Map, saves: Map, armaduras: Map, armas: Map, herramientas: Map, idiomas: Map }}
 */
export function proficiencySources(c) {
  const res = {
    skills: new Map(), saves: new Map(), armaduras: new Map(), armas: new Map(), herramientas: new Map(), idiomas: new Map(),
  };

  for (const p of characterClassProficiencies(c)) {
    const src = { kind: 'clase', label: p.primary ? p.className : `${p.className} (multiclase)` };
    p.armaduras.forEach((x) => addTo(res.armaduras, x, src));
    p.armas.forEach((x) => addTo(res.armas, x, src));
    p.herramientas.forEach((x) => addTo(res.herramientas, x, src));
    p.salvaciones.forEach((x) => addTo(res.saves, x, src));
    const chosen = classChoices(c, p.classKey);
    if (p.saveChoice) chosen.saves.filter((a) => p.saveChoice.options.includes(a)).slice(0, p.saveChoice.count).forEach((x) => addTo(res.saves, x, src));
    if (p.skills) chosen.skills.filter((s) => p.skills.options.includes(s)).slice(0, p.skills.count).forEach((x) => addTo(res.skills, x, src));
  }

  const bg = backgroundDefinition(c);
  if (bg) {
    const src = { kind: 'trasfondo', label: bg.name || 'Trasfondo' };
    bg.skills.forEach((x) => addTo(res.skills, x, src));
    bg.tools.forEach((x) => addTo(res.herramientas, x, src));
  }

  for (const s of effectSources(c)) {
    for (const e of s.effects) {
      if (e.type !== 'competencia') continue;
      const src = { kind: s.kind, label: s.label };
      const target = { habilidad: res.skills, salvacion: res.saves, armadura: res.armaduras, arma: res.armas, herramienta: res.herramientas, idioma: res.idiomas }[e.kind];
      addTo(target, e.value, src);
    }
  }

  const manual = { kind: 'otros', label: 'Marcada a mano' };
  (c.proficiencies?.skills ?? []).forEach((x) => addTo(res.skills, x, manual));
  (c.proficiencies?.saves ?? []).forEach((x) => addTo(res.saves, x, manual));
  return res;
}

/** ¿Alguna fuente que no sea la marca manual? (las otorgadas no se pueden quitar a mano) */
export const isGranted = (sources = []) => sources.some((s) => !(s.kind === 'otros' && s.label === 'Marcada a mano'));

/** Texto «Clase · Trasfondo» para una lista de fuentes. */
export function sourcesLabel(sources = []) {
  return sources.map((s) => (s.kind === 'otros' && s.label === 'Marcada a mano' ? 'a mano' : `${SOURCE_KINDS[s.kind]}: ${s.label}`)).join(' · ');
}

// ── Elecciones de clase pendientes y duplicados ──────────────────────────

/**
 * Estado de las elecciones de cada clase: cuántas habilidades/salvaciones
 * faltan y qué habilidades elegidas coinciden con otra fuente (regla oficial:
 * si dos fuentes dan la misma competencia, puedes elegir otra).
 */
export function classChoiceStatus(c) {
  const bg = backgroundDefinition(c);
  const bgSkills = new Set(bg?.skills ?? []);
  return characterClassProficiencies(c).map((p) => {
    const chosen = classChoices(c, p.classKey);
    const skills = p.skills ? chosen.skills.filter((s) => p.skills.options.includes(s)).slice(0, p.skills.count) : [];
    const saves = p.saveChoice ? chosen.saves.filter((a) => p.saveChoice.options.includes(a)).slice(0, p.saveChoice.count) : [];
    return {
      ...p,
      chosenSkills: skills,
      chosenSaves: saves,
      skillsRemaining: p.skills ? Math.max(0, p.skills.count - skills.length) : 0,
      savesRemaining: p.saveChoice ? Math.max(0, p.saveChoice.count - saves.length) : 0,
      duplicates: skills.filter((s) => bgSkills.has(s)),
      blockedByBackground: [...bgSkills],
    };
  });
}

export function pendingClassChoices(c) {
  return classChoiceStatus(c).some((s) => s.skillsRemaining > 0 || s.savesRemaining > 0 || s.duplicates.length > 0);
}

/** Devuelve un personaje NUEVO con las habilidades elegidas para una clase. */
export function setClassSkills(c, classKey, skills) {
  const p = classProficiencies(classKey, { primary: primaryClassKey(c) === classKey });
  const next = structuredClone(c);
  next.classChoices ??= {};
  const prev = next.classChoices[classKey] ?? { skills: [], saves: [] };
  const valid = p.skills ? [...new Set(skills)].filter((s) => p.skills.options.includes(s)).slice(0, p.skills.count) : [];
  next.classChoices[classKey] = { ...prev, skills: valid };
  // Si la habilidad estaba marcada a mano, ahora la da la clase: se quita la marca
  // para no contarla dos veces ni dejar una marca huérfana al cambiar de clase.
  next.proficiencies.skills = next.proficiencies.skills.filter((s) => !valid.includes(s));
  return next;
}

export function setClassSaves(c, classKey, saves) {
  const p = classProficiencies(classKey, { primary: primaryClassKey(c) === classKey });
  const next = structuredClone(c);
  next.classChoices ??= {};
  const prev = next.classChoices[classKey] ?? { skills: [], saves: [] };
  const valid = p.saveChoice ? [...new Set(saves)].filter((a) => p.saveChoice.options.includes(a)).slice(0, p.saveChoice.count) : [];
  next.classChoices[classKey] = { ...prev, saves: valid };
  return next;
}

export const abilityLabel = (k) => ABILITY_LABEL[k] ?? k;
