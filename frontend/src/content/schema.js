// Formato canónico del contenido Homebrew y su validación.
//
// Todo el contenido creado en la app (o recibido de una campaña, o leído de la
// instantánea guardada en un personaje) pasa por `validateContent` antes de
// entrar en el registro. Un objeto que no valida no llega nunca al motor.
// Para añadir un tipo nuevo: define aquí sus campos y su normalizador; el
// editor genérico y el registro lo recogen sin más cambios.

import { ABILITY_KEYS, SKILL_NAMES } from '../domain/constants.js';
import { normalizeEffects, DAMAGE_TYPE_KEYS, CONDITIONS } from '../domain/effects.js';
import { normalizeBackgroundDefinition } from '../domain/validation.js';
import { normalizeMerchant, normalizeRegion, normalizeFaction, normalizeEvent } from './world-schema.js';
export { WORLD_TYPES } from './world-schema.js';

export const CONTENT_TYPES = Object.freeze({
  clase: { label: 'Clase', plural: 'Clases', icon: '⚔️' },
  raza: { label: 'Raza', plural: 'Razas', icon: '🧬' },
  hechizo: { label: 'Hechizo', plural: 'Hechizos', icon: '✨' },
  dote: { label: 'Dote', plural: 'Dotes', icon: '✦' },
  trasfondo: { label: 'Trasfondo', plural: 'Trasfondos', icon: '📜' },
  objeto: { label: 'Objeto', plural: 'Objetos', icon: '🗝️' },
  criatura: { label: 'Criatura', plural: 'Criaturas', icon: '🐺' },
  rasgo: { label: 'Rasgo', plural: 'Rasgos', icon: '✧' },
  extension: { label: 'Extensión de clase', plural: 'Extensiones de clase', icon: '⚜️' },
  // Mundo de la Tienda: exclusivo del DM (dmOnly), nunca propuestas de jugadores.
  mercader: { label: 'Comerciante', plural: 'Comerciantes', icon: '🧑‍💼', dmOnly: true },
  region: { label: 'Región', plural: 'Regiones', icon: '🗺️', dmOnly: true },
  faccion: { label: 'Facción', plural: 'Facciones', icon: '🏳️', dmOnly: true },
  evento: { label: 'Evento del mundo', plural: 'Eventos del mundo', icon: '📰', dmOnly: true },
  otro: { label: 'Otro', plural: 'Otros', icon: '📎' },
});
export const CONTENT_TYPE_KEYS = Object.freeze(Object.keys(CONTENT_TYPES));

/** Estados de publicación de un elemento Homebrew dentro de una campaña. */
export const CONTENT_STATUS = Object.freeze({
  borrador: 'Borrador',
  propuesto: 'Propuesto',
  publicado: 'Publicado',
  oculto: 'Oculto',
  retirado: 'Retirado',
});

export const CASTER_KINDS = Object.freeze({
  ninguno: 'No lanza conjuros',
  completo: 'Lanzador completo (como el Mago)',
  medio: 'Medio lanzador (como el Paladín)',
  pacto: 'Magia de pacto (como el Brujo)',
});

/** Cómo se obtiene una extensión de clase. */
export const EXTENSION_ACCESS = Object.freeze({
  abierta: 'Abierta: cualquier jugador de esa clase puede añadirla (si la campaña lo permite)',
  desbloqueo: 'Con código: sólo quien reciba el código del DM',
});
export const EXTENSION_KINDS = Object.freeze({
  subclase: 'Nueva subclase para la clase',
  rasgos: 'Rasgos o habilidades especiales',
});
const ORIGIN_KEYS = ['dm', 'campana', 'evento', 'objeto', 'bendicion', 'maldicion', 'otro'];

export const MAX_CONTENT_BYTES = 200_000;

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function str(v, max = 120) {
  if (typeof v !== 'string' && typeof v !== 'number') return '';
  // eslint-disable-next-line no-control-regex
  return String(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);
}
const longText = (v) => str(v, 20_000);
function int(v, min, max, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.trunc(n))) : fallback;
}
function strList(v, maxItems = 30, maxLen = 120) {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.map((x) => str(x, maxLen)).filter(Boolean))].slice(0, maxItems);
}
const pick = (v, allowed) => strList(v, allowed.length).filter((x) => allowed.includes(x));
function named(v, max = 40) {
  if (!Array.isArray(v)) return [];
  return v.slice(0, max).map((x) => (isObject(x) ? { name: str(x.name), text: longText(x.text) } : null)).filter((x) => x && (x.name || x.text));
}
function abilityNumbers(v, min, max) {
  const out = {};
  if (!isObject(v)) return out;
  for (const k of ABILITY_KEYS) {
    const n = int(v[k], min, max, 0);
    if (n) out[k] = n;
  }
  return out;
}
const slug = (s) => str(s, 60).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// ── Normalizadores por tipo ──────────────────────────────────────────────

const NORMALIZERS = {
  clase(src, errors) {
    const hitDie = [6, 8, 10, 12].includes(Number(src.hitDie)) ? Number(src.hitDie) : null;
    if (!hitDie) errors.push('El dado de golpe debe ser d6, d8, d10 o d12.');
    const caster = Object.hasOwn(CASTER_KINDS, src.caster) ? src.caster : 'ninguno';
    const spellAbility = ABILITY_KEYS.includes(src.spellAbility) ? src.spellAbility : null;
    if (caster !== 'ninguno' && !spellAbility) errors.push('Un lanzador de conjuros necesita un atributo de lanzamiento.');
    const saves = pick(src.saves, ABILITY_KEYS).slice(0, 2);
    const skillsAny = src.skills?.any === true;
    const subclasses = (Array.isArray(src.subclasses) ? src.subclasses : []).slice(0, 20)
      .map((s, i) => (isObject(s) && str(s.name) ? { key: slug(s.key || s.name) || `sub${i + 1}`, name: str(s.name), description: longText(s.description) } : null))
      .filter(Boolean);
    const features = (Array.isArray(src.features) ? src.features : []).slice(0, 200)
      .map((f) => (isObject(f) && (str(f.name) || str(f.text, 50)) ? {
        level: int(f.level, 1, 20, 1), name: str(f.name), text: longText(f.text), subclass: str(f.subclass, 60) || null,
      } : null))
      .filter(Boolean)
      .sort((a, b) => a.level - b.level);
    return {
      hitDie: hitDie ?? 8,
      caster,
      spellAbility,
      asiLevels: [...new Set((Array.isArray(src.asiLevels) ? src.asiLevels : [4, 8, 12, 16, 19]).map((n) => int(n, 1, 20, 0)).filter(Boolean))].sort((a, b) => a - b),
      saves,
      armor: strList(src.armor, 10),
      weapons: strList(src.weapons, 20),
      tools: strList(src.tools, 10),
      skills: {
        count: int(src.skills?.count, 0, 18, 2),
        any: skillsAny,
        options: skillsAny ? [] : pick(src.skills?.options, SKILL_NAMES),
      },
      multiclass: {
        armor: strList(src.multiclass?.armor, 10),
        weapons: strList(src.multiclass?.weapons, 20),
        tools: strList(src.multiclass?.tools, 10),
      },
      equipment: strList(src.equipment, 10, 500),
      gold: str(src.gold, 40),
      subclassLabel: str(src.subclassLabel, 60) || 'Subclase',
      subclassLevel: subclasses.length ? int(src.subclassLevel, 1, 20, 3) : null,
      subclasses,
      features,
    };
  },

  raza(src) {
    const speed = isObject(src.speed) ? src.speed : {};
    const choiceCount = int(src.abilityChoice?.count, 0, 6, 0);
    return {
      speed: {
        walk: int(speed.walk, 0, 200, 30),
        fly: int(speed.fly, 0, 200, 0) || null,
        swim: int(speed.swim, 0, 200, 0) || null,
        climb: int(speed.climb, 0, 200, 0) || null,
      },
      abilities: abilityNumbers(src.abilities, -4, 4),
      abilityChoice: choiceCount ? {
        count: choiceCount,
        bonus: int(src.abilityChoice?.bonus, 1, 2, 1),
        allowed: pick(src.abilityChoice?.allowed, ABILITY_KEYS),
      } : null,
      languages: strList(src.languages, 10, 60),
      extraLanguages: int(src.extraLanguages, 0, 5, 0),
      traits: named(src.traits),
      effects: normalizeEffects(src.effects),
      allowsFeat: src.allowsFeat === true,
    };
  },

  dote(src) {
    return {
      prerequisites: {
        abilities: abilityNumbers(src.prerequisites?.abilities, 1, 30),
        level: int(src.prerequisites?.level, 0, 20, 0) || null,
        caster: src.prerequisites?.caster === true,
      },
      abilityOptions: pick(src.abilityOptions, ABILITY_KEYS),
      expertise: int(src.expertise, 0, 6, 0),
      repeatable: src.repeatable === true,
      effects: normalizeEffects(src.effects),
    };
  },

  hechizo(src, errors) {
    const level = int(src.level, 0, 9, -1);
    if (level < 0) errors.push('El nivel del hechizo debe estar entre 0 (truco) y 9.');
    return {
      level: Math.max(0, level),
      school: str(src.school, 40),
      castingTime: str(src.castingTime, 80) || '1 acción',
      range: str(src.range, 80),
      components: str(src.components, 200),
      duration: str(src.duration, 80),
      concentration: src.concentration === true,
      ritual: src.ritual === true,
      attack: str(src.attack, 120),
      classes: strList(src.classes, 30, 120),
    };
  },

  trasfondo(src) {
    const def = normalizeBackgroundDefinition({ ...src, name: src.name, description: src.description });
    delete def.name;
    delete def.description;
    return def;
  },

  objeto(src) {
    return {
      kind: str(src.kind, 60),
      rarity: str(src.rarity, 40),
      attunement: src.attunement === true,
      weight: str(src.weight, 40),
      cost: str(src.cost, 40),
      effects: normalizeEffects(src.effects),
    };
  },

  criatura(src) {
    return {
      size: str(src.size, 40),
      creatureType: str(src.creatureType, 60),
      alignment: str(src.alignment, 60),
      ac: int(src.ac, 0, 40, 10),
      hp: int(src.hp, 1, 2000, 1),
      hitDice: str(src.hitDice, 40),
      speed: str(src.speed, 120),
      abilities: Object.fromEntries(ABILITY_KEYS.map((k) => [k, int(src.abilities?.[k], 1, 30, 10)])),
      saves: str(src.saves, 200),
      skills: str(src.skills, 300),
      senses: str(src.senses, 200),
      languages: str(src.languages, 200),
      challenge: str(src.challenge, 20),
      resistances: pick(src.resistances, DAMAGE_TYPE_KEYS),
      immunities: pick(src.immunities, DAMAGE_TYPE_KEYS),
      vulnerabilities: pick(src.vulnerabilities, DAMAGE_TYPE_KEYS),
      conditionImmunities: pick(src.conditionImmunities, CONDITIONS),
      traits: named(src.traits),
      actions: named(src.actions),
      reactions: named(src.reactions),
    };
  },

  rasgo(src) {
    return { effects: normalizeEffects(src.effects) };
  },

  /**
   * Extensión de una clase existente (oficial u Homebrew), sin duplicarla:
   * una subclase nueva o rasgos especiales (bendiciones, evoluciones…).
   */
  extension(src, errors) {
    const classKey = str(src.classKey, 120);
    if (!classKey) errors.push('Elige la clase a la que se añade.');
    const kind = Object.hasOwn(EXTENSION_KINDS, src.kind) ? src.kind : 'rasgos';
    const features = (Array.isArray(src.features) ? src.features : []).slice(0, 60)
      .map((f) => (isObject(f) && (str(f.name) || str(f.text, 50)) ? {
        level: int(f.level, 1, 20, 1),
        name: str(f.name),
        text: longText(f.text),
        replaces: str(f.replaces, 120) || null,
        effects: normalizeEffects(f.effects),
      } : null))
      .filter(Boolean)
      .sort((a, b) => a.level - b.level);
    if (!features.length) errors.push('Añade al menos un rasgo con su nivel.');
    const hash = typeof src.unlockHash === 'string' && /^[a-f0-9]{64}$/.test(src.unlockHash) ? src.unlockHash : null;
    const access = src.access === 'desbloqueo' ? 'desbloqueo' : 'abierta';
    return {
      classKey,
      kind,
      access,
      unlockHash: access === 'desbloqueo' ? hash : null,
      subclassLevel: kind === 'subclase' ? int(src.subclassLevel, 1, 20, 3) : null,
      origin: ORIGIN_KEYS.includes(src.origin) ? src.origin : 'dm',
      condition: str(src.condition, 500),
      features,
    };
  },

  // Mundo de la Tienda (sólo el DM): ver content/world-schema.js
  mercader: normalizeMerchant,
  region: normalizeRegion,
  faccion: normalizeFaction,
  evento: normalizeEvent,

  otro() {
    return {};
  },
};

/**
 * Valida y normaliza un elemento de contenido.
 * @returns {{ item: object|null, errors: string[] }}
 */
export function validateContent(type, raw) {
  const errors = [];
  if (!Object.hasOwn(NORMALIZERS, type)) return { item: null, errors: ['Tipo de contenido desconocido.'] };
  if (!isObject(raw)) return { item: null, errors: ['El contenido no es un objeto válido.'] };
  let size = 0;
  try { size = JSON.stringify(raw).length; } catch { return { item: null, errors: ['El contenido no se puede leer.'] }; }
  if (size > MAX_CONTENT_BYTES) return { item: null, errors: ['El contenido es demasiado grande.'] };
  const name = str(raw.name);
  if (!name) errors.push('Falta el nombre.');
  const item = {
    name,
    description: longText(raw.description),
    source: str(raw.source, 120),
    ...NORMALIZERS[type](raw, errors),
  };
  return { item: errors.length ? null : item, errors };
}

/** Elemento vacío de un tipo, para el formulario de creación. */
export function emptyContent(type) {
  const base = { name: '', description: '', source: '' };
  switch (type) {
    case 'clase': return { ...base, hitDie: 8, caster: 'ninguno', spellAbility: null, asiLevels: [4, 8, 12, 16, 19], saves: [], armor: [], weapons: [], tools: [], skills: { count: 2, any: false, options: [] }, multiclass: { armor: [], weapons: [], tools: [] }, equipment: [], gold: '', subclassLabel: 'Subclase', subclassLevel: 3, subclasses: [], features: [] };
    case 'raza': return { ...base, speed: { walk: 30 }, abilities: {}, abilityChoice: null, languages: ['Común'], extraLanguages: 0, traits: [], effects: [], allowsFeat: false };
    case 'dote': return { ...base, prerequisites: { abilities: {}, level: null, caster: false }, abilityOptions: [], expertise: 0, repeatable: false, effects: [] };
    case 'hechizo': return { ...base, level: 1, school: '', castingTime: '1 acción', range: '', components: 'V, S', duration: 'Instantáneo', concentration: false, ritual: false, attack: '', classes: [] };
    case 'extension': return { ...base, classKey: '', kind: 'rasgos', access: 'desbloqueo', unlockHash: null, subclassLevel: 3, origin: 'bendicion', condition: '', features: [] };
    case 'mercader': return { ...base, ...normalizeMerchant({ location: '', catalogMode: 'auto' }, []), location: '' };
    case 'region': return { ...base, ...normalizeRegion({}) };
    case 'faccion': return { ...base, ...normalizeFaction({}) };
    case 'evento': return { ...base, ...normalizeEvent({}, []) };
    case 'criatura': return { ...base, size: 'Mediana', creatureType: 'Bestia', alignment: '', ac: 12, hp: 10, hitDice: '', speed: '30 pies', abilities: Object.fromEntries(ABILITY_KEYS.map((k) => [k, 10])), challenge: '1/4', resistances: [], immunities: [], vulnerabilities: [], conditionImmunities: [], traits: [], actions: [], reactions: [] };
    default: return { ...base };
  }
}

// ── Referencias ──────────────────────────────────────────────────────────

const REF_RE = /^hb:([a-z0-9-]{1,40}):([a-z]{3,10}):([a-z0-9-]{1,40})$/;

/** Referencia estable: no depende del nombre, así el DM puede renombrar. */
export function makeRef(packId, type, id) {
  return `hb:${packId}:${type}:${id}`;
}

export function parseRef(ref) {
  const m = typeof ref === 'string' ? REF_RE.exec(ref) : null;
  return m && Object.hasOwn(CONTENT_TYPES, m[2]) ? { packId: m[1], type: m[2], id: m[3] } : null;
}

export const isHomebrewRef = (ref) => parseRef(ref) !== null;

export function randomId(len = 10) {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(len);
  globalThis.crypto.getRandomValues(bytes);
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join('');
}
