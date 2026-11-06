// Validación y normalización de personajes.
//
// `normalizeCharacter` acepta cualquier valor (un archivo importado, una respuesta
// del servidor, un registro antiguo de IndexedDB...) y devuelve SIEMPRE un
// personaje con la forma de createCharacter(): rellena campos ausentes con sus
// valores predeterminados, corrige tipos, recorta textos y descarta basura.
// Los problemas no fatales se devuelven como `warnings` legibles para el usuario.
// Sólo se lanza error cuando el documento no es un personaje en absoluto.

import { ABILITY_KEYS, SKILL_NAMES, SPEED_KEYS, MAX_LEVEL, MIN_ABILITY_SCORE, MAX_ABILITY_SCORE } from './constants.js';
import {
  createCharacter, createItem, createWeapon, createBackgroundDefinition, BACKGROUND_ABILITY_MODES,
  DOCUMENT_FORMAT, LIMITS, SCHEMA_VERSION,
} from './schema.js';
import { migrateDocument } from './migrations.js';
import { getClass, getRace, getFeat, getEpicBoon, getOfficialBackground } from '../data/index.js';

export class InvalidDocumentError extends Error {
  constructor(userMessage, detail) {
    super(userMessage);
    this.name = 'InvalidDocumentError';
    this.userMessage = userMessage;
    this.detail = detail;
  }
}

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function text(value, max = LIMITS.shortText) {
  if (value === null || value === undefined) return '';
  const s = typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '';
  // Elimina caracteres de control (excepto saltos de línea y tabulaciones).
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').slice(0, max);
}

function int(value, { min = -Infinity, max = Infinity, fallback = 0 } = {}) {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

function optionalInt(value, opts) {
  if (value === null || value === undefined || value === '') return null;
  const n = int(value, { ...opts, fallback: NaN });
  return Number.isNaN(n) ? null : n;
}

function list(value, mapItem, max = LIMITS.listItems) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, max).map(mapItem).filter((v) => v !== undefined && v !== null);
}

function uniqueStrings(value, allowed) {
  const out = [];
  for (const v of list(value, (x) => (typeof x === 'string' ? x : null))) {
    if (allowed && !allowed.includes(v)) continue;
    if (!out.includes(v)) out.push(v);
  }
  return out;
}

const PORTRAIT_RE = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/;

function portrait(value, warnings) {
  if (typeof value !== 'string' || value === '') return null;
  if (value.length > LIMITS.portraitBytes * 1.4) {
    warnings.push('El retrato era demasiado grande y se descartó.');
    return null;
  }
  if (!PORTRAIT_RE.test(value)) {
    warnings.push('El retrato no tenía un formato de imagen válido y se descartó.');
    return null;
  }
  return value;
}

function abilityMap(value, { min = 0, max = MAX_ABILITY_SCORE } = {}) {
  const out = {};
  if (!isObject(value)) return out;
  for (const key of ABILITY_KEYS) {
    if (value[key] === undefined) continue;
    const n = int(value[key], { min, max, fallback: 0 });
    if (n) out[key] = n;
  }
  return out;
}

function abilityOrNull(value) {
  return ABILITY_KEYS.includes(value) ? value : null;
}

function improvement(value, warnings, levelNumber) {
  if (!isObject(value)) return null;
  if (value.type === 'asi') {
    const increases = abilityMap(value.increases, { min: 0, max: 2 });
    const total = Object.values(increases).reduce((a, b) => a + b, 0);
    if (total === 0 || total > 2) {
      warnings.push(`La mejora de atributos del nivel ${levelNumber} no era válida y se descartó.`);
      return null;
    }
    return { type: 'asi', increases };
  }
  if (value.type === 'feat') {
    const name = text(value.name);
    if (!name) return null;
    if (!getFeat(name)) warnings.push(`La dote «${name}» no existe en los datos actuales; se conserva sin efectos.`);
    return { type: 'feat', name, ability: abilityOrNull(value.ability) };
  }
  return null;
}

function level(value, index, warnings) {
  if (!isObject(value)) return null;
  const classKey = text(value.classKey, 40);
  if (!classKey) {
    warnings.push(`El nivel ${index + 1} no tenía clase y se descartó (y los siguientes).`);
    return null;
  }
  if (!getClass(classKey)) {
    warnings.push(`La clase «${classKey}» no existe en los datos actuales; se conserva el nivel pero sin rasgos.`);
  }
  const featureChoices = {};
  if (isObject(value.featureChoices)) {
    const sc = uniqueStrings(value.featureChoices.statAmount, ABILITY_KEYS);
    if (sc.length) featureChoices.statAmount = sc;
  }
  return {
    classKey,
    hpRoll: int(value.hpRoll, { min: 1, max: 20, fallback: 1 }),
    improvement: improvement(value.improvement, warnings, index + 1),
    featureChoices,
  };
}

/**
 * Normaliza una definición de trasfondo (oficial u homebrew). Nunca lanza.
 * Es deliberadamente permisiva: el homebrew puede tener cualquier combinación.
 */
export function normalizeBackgroundDefinition(raw) {
  const src = isObject(raw) ? raw : {};
  const def = createBackgroundDefinition();
  def.name = text(src.name).trim();
  def.description = text(src.description, LIMITS.longText);
  def.abilityOptions = uniqueStrings(src.abilityOptions, ABILITY_KEYS);
  def.feat = text(src.feat).trim() || null;
  def.skills = uniqueStrings(src.skills, SKILL_NAMES);
  def.tools = list(src.tools, (t) => text(t).trim() || null, 20);
  def.languages = int(src.languages, { min: 0, max: 10, fallback: 0 });
  def.equipment = list(src.equipment, (e) => {
    if (!isObject(e) || !text(e.text, LIMITS.mediumText).trim()) return null;
    return { label: text(e.label, 20).trim() || '?', text: text(e.text, LIMITS.mediumText).trim() };
  }, 6);
  if (isObject(src.feature) && (text(src.feature.name).trim() || text(src.feature.text).trim())) {
    def.feature = { name: text(src.feature.name).trim(), text: text(src.feature.text, LIMITS.longText) };
  }
  return def;
}

/**
 * Normaliza un objeto «personaje» (sin sobre). Nunca lanza.
 * @returns {{ character: ReturnType<typeof createCharacter>, warnings: string[] }}
 */
export function normalizeCharacter(raw) {
  const warnings = [];
  const d = createCharacter();
  const src = isObject(raw) ? raw : {};

  // Identidad
  const id = isObject(src.identity) ? src.identity : {};
  for (const key of Object.keys(d.identity)) {
    if (key === 'portrait') continue;
    d.identity[key] = text(id[key]);
  }
  d.identity.portrait = portrait(id.portrait, warnings);

  // Raza
  const race = isObject(src.race) ? src.race : {};
  const raceKey = text(race.key);
  if (raceKey) {
    d.race.key = raceKey;
    if (!getRace(raceKey)) warnings.push(`La raza «${raceKey}» no existe en los datos actuales; se conserva sin bonificaciones.`);
  }
  d.race.abilityChoices = list(race.abilityChoices, (g) => uniqueStrings(g, ABILITY_KEYS), 10);
  d.race.languages = uniqueStrings(race.languages).map((l) => text(l)).slice(0, 30);
  if (isObject(race.feat) && text(race.feat.name)) {
    d.race.feat = { name: text(race.feat.name), ability: abilityOrNull(race.feat.ability) };
  }

  // Trasfondo
  const bg = isObject(src.background) ? src.background : {};
  if (bg.source === 'official' && text(bg.key)) {
    d.background.source = 'official';
    d.background.key = text(bg.key);
    if (!getOfficialBackground(d.background.key)) warnings.push(`El trasfondo «${d.background.key}» no existe en los datos actuales.`);
  } else if (bg.source === 'custom' && isObject(bg.custom)) {
    d.background.source = 'custom';
    d.background.custom = normalizeBackgroundDefinition(bg.custom);
    if (!d.background.custom.name) d.background.custom.name = 'Trasfondo propio';
  }
  if (d.background.source) {
    d.background.abilityMode = BACKGROUND_ABILITY_MODES.includes(bg.abilityMode) ? bg.abilityMode : 'none';
    d.background.abilityChoices = d.background.abilityMode === 'none' ? [] : uniqueStrings(bg.abilityChoices, ABILITY_KEYS).slice(0, 3);
    d.background.featAbility = abilityOrNull(bg.featAbility);
    d.background.equipmentChoice = text(bg.equipmentChoice, 20) || null;
    d.background.equipmentApplied = text(bg.equipmentApplied, 20) || null;
  }

  // Atributos base
  const abilities = isObject(src.abilities) ? src.abilities : {};
  for (const key of ABILITY_KEYS) {
    d.abilities[key] = int(abilities[key], { min: MIN_ABILITY_SCORE, max: MAX_ABILITY_SCORE, fallback: 10 });
    const rawValue = Number(abilities[key]);
    if (abilities[key] !== undefined && Number.isFinite(rawValue) && rawValue !== d.abilities[key]) {
      warnings.push(`La puntuación de ${key} (${abilities[key]}) estaba fuera de rango y se ajustó a ${d.abilities[key]}.`);
    }
  }

  // Niveles: si uno es inválido se corta ahí, porque los posteriores dependen de él.
  const levels = Array.isArray(src.levels) ? src.levels.slice(0, MAX_LEVEL) : [];
  if (Array.isArray(src.levels) && src.levels.length > MAX_LEVEL) {
    warnings.push(`El personaje tenía más de ${MAX_LEVEL} niveles; se conservaron los primeros ${MAX_LEVEL}.`);
  }
  for (let i = 0; i < levels.length; i++) {
    const l = level(levels[i], i, warnings);
    if (!l) break;
    d.levels.push(l);
  }

  if (isObject(src.subclasses)) {
    for (const [cls, sub] of Object.entries(src.subclasses)) {
      const c = text(cls, 40);
      const s = text(sub, 40);
      if (c && s && d.levels.some((l) => l.classKey === c)) d.subclasses[c] = s;
    }
  }

  d.epicBoons = list(src.epicBoons, (b) => {
    if (!isObject(b) || !text(b.name)) return null;
    if (!getEpicBoon(text(b.name))) warnings.push(`La bendición «${text(b.name)}» no existe en los datos actuales.`);
    return { name: text(b.name), ability: abilityOrNull(b.ability) };
  }, 20);

  d.experience = int(src.experience, { min: 0, max: 10_000_000, fallback: 0 });

  const prof = isObject(src.proficiencies) ? src.proficiencies : {};
  d.proficiencies.skills = uniqueStrings(prof.skills, SKILL_NAMES);
  d.proficiencies.saves = uniqueStrings(prof.saves, ABILITY_KEYS);
  d.proficiencies.expertise = uniqueStrings(prof.expertise, SKILL_NAMES);

  const combat = isObject(src.combat) ? src.combat : {};
  d.combat.armorClass = int(combat.armorClass, { min: 0, max: 99, fallback: 10 });
  d.combat.armor = text(combat.armor);
  d.combat.inspiration = combat.inspiration === true;
  d.combat.currentHp = optionalInt(combat.currentHp, { min: -999, max: 9999 });
  d.combat.tempHp = int(combat.tempHp, { min: 0, max: 9999, fallback: 0 });
  if (isObject(combat.speedOverrides)) {
    for (const key of SPEED_KEYS) {
      const v = optionalInt(combat.speedOverrides[key], { min: 0, max: 999 });
      if (v !== null) d.combat.speedOverrides[key] = v;
    }
  }

  const eq = isObject(src.equipment) ? src.equipment : {};
  if (Array.isArray(eq.weapons)) {
    d.equipment.weapons = list(eq.weapons, (w) => (isObject(w)
      ? createWeapon({ name: text(w.name), attackBonus: text(w.attackBonus, 20), damage: text(w.damage) })
      : null), 30);
  }
  d.equipment.attacksNotes = text(eq.attacksNotes, LIMITS.longText);
  const coins = isObject(eq.coins) ? eq.coins : {};
  for (const key of Object.keys(d.equipment.coins)) {
    d.equipment.coins[key] = int(coins[key], { min: 0, max: 99_999_999, fallback: 0 });
  }
  d.equipment.items = list(eq.items, (it) => (isObject(it)
    ? createItem({ name: text(it.name), quantity: int(it.quantity, { min: 0, max: 99_999, fallback: 1 }), notes: text(it.notes, LIMITS.mediumText) })
    : null));
  d.equipment.treasure = text(eq.treasure, LIMITS.longText);

  const spells = isObject(src.spells) ? src.spells : {};
  d.spells.known = uniqueStrings(spells.known).map((s) => text(s)).slice(0, 400);
  d.spells.prepared = uniqueStrings(spells.prepared).map((s) => text(s)).slice(0, 400);

  const notes = isObject(src.notes) ? src.notes : {};
  d.notes.languages = text(notes.languages, LIMITS.mediumText);
  d.notes.proficiencies = text(notes.proficiencies, LIMITS.mediumText);
  d.notes.raceTraits = text(notes.raceTraits, LIMITS.longText);
  d.notes.backstory = text(notes.backstory, LIMITS.longText);
  if (isObject(notes.classNotes)) {
    for (const [k, v] of Object.entries(notes.classNotes).slice(0, 30)) {
      d.notes.classNotes[text(k, 40)] = text(v, LIMITS.longText);
    }
  }

  const settings = isObject(src.settings) ? src.settings : {};
  d.settings.allowEpicBoons = settings.allowEpicBoons === true;

  return { character: d, warnings };
}

/**
 * Valida un documento completo (sobre + personaje), aplicando migraciones.
 * Lanza InvalidDocumentError si no es un documento de personaje utilizable.
 */
export function parseDocument(raw) {
  if (!isObject(raw)) {
    throw new InvalidDocumentError('El archivo no contiene un personaje válido.');
  }
  const migrated = migrateDocument(raw);
  if (migrated.format !== DOCUMENT_FORMAT) {
    throw new InvalidDocumentError('El archivo no es un personaje de Stories of Agarias.');
  }
  if (migrated.schemaVersion !== SCHEMA_VERSION) {
    throw new InvalidDocumentError(
      'Este personaje se creó con una versión más nueva de la aplicación. Actualiza la aplicación para abrirlo.',
    );
  }
  const { character, warnings } = normalizeCharacter(migrated.character);
  return { character, warnings: [...(migrated.warnings ?? []), ...warnings] };
}

/** Problemas que impiden considerar «completo» un personaje (no impiden guardar). */
export function findIncompleteFields(character) {
  const issues = [];
  if (!character.identity.name.trim()) issues.push('El personaje no tiene nombre.');
  if (!character.race.key) issues.push('Falta elegir una raza.');
  if (character.levels.length === 0) issues.push('El personaje todavía no tiene nivel (elige una clase).');
  return issues;
}
