// Validación y normalización de personajes.
//
// `normalizeCharacter` acepta cualquier valor (un archivo importado, una respuesta
// del servidor, un registro antiguo de IndexedDB...) y devuelve SIEMPRE un
// personaje con la forma de createCharacter(): rellena campos ausentes con sus
// valores predeterminados, corrige tipos, recorta textos y descarta basura.
// Los problemas no fatales se devuelven como `warnings` legibles para el usuario.
// Sólo se lanza error cuando el documento no es un personaje en absoluto.

import { sanitizeStoredChoices } from './class-choices.js';
import { ABILITY_KEYS, SKILL_NAMES, SPEED_KEYS, MAX_LEVEL, MIN_ABILITY_SCORE, MAX_ABILITY_SCORE } from './constants.js';
import {
  createCharacter, createItem, createWeapon, createBackgroundDefinition, BACKGROUND_ABILITY_MODES,
  DOCUMENT_FORMAT, LIMITS, SCHEMA_VERSION, createTrait, createCompanion, TRAIT_ORIGIN_KEYS, BOND_TYPES,
} from './schema.js';
import { normalizeEffects, CONDITIONS } from './effects.js';
import { registerSnapshots, engineOf } from '../content/registry.js';
import { migrateDocument } from './migrations.js';
import { normalizeWorkshop } from './workshop.js';
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
  const classKey = text(value.classKey, 120);
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
    const el = sanitizeStoredChoices(value.featureChoices.elecciones);
    if (Object.keys(el).length) featureChoices.elecciones = el;
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

/** Normaliza un rasgo con origen genérico. Nunca lanza; null si está vacío. */
export function normalizeTrait(raw) {
  if (!isObject(raw)) return null;
  const name = text(raw.name).trim();
  const description = text(raw.description, LIMITS.longText);
  if (!name && !description.trim()) return null;
  const id = text(raw.id, 60);
  return createTrait({
    ...(id ? { id } : {}),
    name: name || 'Rasgo sin nombre',
    description,
    origin: TRAIT_ORIGIN_KEYS.includes(raw.origin) ? raw.origin : 'otro',
    originDetail: text(raw.originDetail, LIMITS.mediumText),
    ref: text(raw.ref, 120) || null,
    effects: normalizeEffects(raw.effects),
    active: raw.active !== false,
  });
}

/** Normaliza un vínculo con una criatura. Nunca lanza. */
export function normalizeCompanion(raw) {
  if (!isObject(raw)) return null;
  const id = text(raw.id, 60);
  const c = createCompanion({
    ...(id ? { id } : {}),
    bond: Object.hasOwn(BOND_TYPES, raw.bond) ? raw.bond : 'companero',
    name: text(raw.name).trim(),
    creatureRef: text(raw.creatureRef, 120) || null,
    currentHp: optionalInt(raw.currentHp, { min: -999, max: 9999 }),
    tempHp: int(raw.tempHp, { min: 0, max: 9999, fallback: 0 }),
    conditions: uniqueStrings(raw.conditions, CONDITIONS),
    present: raw.present !== false,
    origin: TRAIT_ORIGIN_KEYS.includes(raw.origin) ? raw.origin : 'otro',
    originDetail: text(raw.originDetail, LIMITS.mediumText),
    notes: text(raw.notes, LIMITS.longText),
  });
  if (isObject(raw.custom)) {
    c.custom = {
      size: text(raw.custom.size, 40),
      type: text(raw.custom.type, 60),
      ac: optionalInt(raw.custom.ac, { min: 0, max: 99 }),
      hpMax: optionalInt(raw.custom.hpMax, { min: 1, max: 9999 }),
      speed: text(raw.custom.speed, 120),
      text: text(raw.custom.text, LIMITS.longText),
    };
  }
  if (!c.name && !c.creatureRef && !c.custom) return null;
  if (!c.name) c.name = 'Criatura';
  return c;
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
    // Trasfondo de una campaña: referencia + copia (la copia viaja con el personaje).
    if (typeof bg.ref === 'string' && bg.ref.startsWith('hb:')) d.background.ref = text(bg.ref, 120);
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
    for (const [rawClass, sub] of Object.entries(src.subclasses)) {
      const c = text(rawClass, 120);
      const s = text(sub, 120);
      if (!c || !s || !d.levels.some((l) => l.classKey === c)) continue;
      const cls = getClass(c);
      // Subclase-extensión Homebrew: se resuelve por referencia (o su instantánea).
      if (s.startsWith('hb:')) {
        const ext = engineOf('extension', s);
        if (!ext || ext.classKey === c) d.subclasses[c] = s;
        continue;
      }
      const options = cls ? Object.values(cls.niveles ?? {}).find((l) => l.subClase)?.subClase : null;
      if (cls && (!options || !Object.hasOwn(options, s))) {
        // La subclase ya no existe en los datos (p. ej. era un relleno copiado
        // de otra clase): se quita para que se pueda elegir de nuevo al subir.
        warnings.push(`${cls.subclaseNombre ?? 'Subclase'} de ${cls.nombre}: la opción elegida ya no existe en los datos; podrás elegir otra al subir de nivel.`);
        continue;
      }
      d.subclasses[c] = s;
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
    ? createItem({
      name: text(it.name), quantity: int(it.quantity, { min: 0, max: 99_999, fallback: 1 }), notes: text(it.notes, LIMITS.mediumText),
      // (v3.2) Referencia opcional al catálogo de la Tienda: sólo se guarda si existe.
      ...(typeof it.ref === 'string' && /^[\w:.-]{1,120}$/.test(it.ref) ? { ref: it.ref } : {}),
    })
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
      d.notes.classNotes[text(k, 120)] = text(v, LIMITS.longText);
    }
  }

  // Elecciones de clase (sólo para clases que el personaje tiene).
  if (isObject(src.classChoices)) {
    for (const [cls, ch] of Object.entries(src.classChoices).slice(0, 30)) {
      const key = text(cls, 80);
      if (!key || !d.levels.some((l) => l.classKey === key) || !isObject(ch)) continue;
      d.classChoices[key] = { skills: uniqueStrings(ch.skills, SKILL_NAMES).slice(0, 18), saves: uniqueStrings(ch.saves, ABILITY_KEYS).slice(0, 6) };
    }
  }

  d.traits = list(src.traits, (t) => normalizeTrait(t), 100);
  // Extensiones de clase asignadas: { ref, code, at }. El código (si lo hay) se
  // conserva para que el servidor pueda comprobarlo al publicar.
  d.unlocks = list(src.unlocks, (u) => {
    if (!isObject(u)) return null;
    const ref = text(u.ref, 120);
    if (!ref.startsWith('hb:')) return null;
    const code = typeof u.code === 'string' && /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(u.code) ? u.code : null;
    return { ref, code, at: text(u.at, 40) };
  }, 60).filter((u, i, all) => all.findIndex((x) => x.ref === u.ref) === i);
  d.companions = list(src.companions, (x) => normalizeCompanion(x), 30);
  d.workshop = normalizeWorkshop(src.workshop);

  if (isObject(src.campaign) && text(src.campaign.id, 40)) {
    d.campaign = { id: text(src.campaign.id, 40), name: text(src.campaign.name) };
  }

  if (isObject(src.content)) {
    for (const [ref, snap] of Object.entries(src.content).slice(0, 100)) {
      const r = text(ref, 120);
      if (!r.startsWith('hb:') || !isObject(snap) || !isObject(snap.data)) continue;
      d.content[r] = {
        type: text(snap.type, 20),
        version: int(snap.version, { min: 1, max: 1_000_000, fallback: 1 }),
        name: text(snap.name),
        data: snap.data,
      };
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
  // Las instantáneas de Homebrew se registran ANTES de normalizar, para que la
  // validación reconozca la raza, clase o dotes Homebrew del personaje.
  const rawContent = isObject(migrated.character?.content) ? migrated.character.content : {};
  registerSnapshots(Object.fromEntries(Object.entries(rawContent).filter(([, v]) => isObject(v)).slice(0, 100)));
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
