// Migraciones de documentos de personaje.
//
// Cada vez que cambie la forma de `character` de forma incompatible:
//   1. Sube SCHEMA_VERSION en schema.js.
//   2. Añade aquí una función MIGRATIONS[versiónAnterior] que transforme un
//      documento de esa versión al de la siguiente.
// migrateDocument aplica la cadena completa, así que un archivo exportado hoy
// seguirá abriéndose dentro de varias versiones.

import { ABILITY_KEYS } from './constants.js';
import { DOCUMENT_FORMAT, SCHEMA_VERSION, createBackgroundState, createBackgroundDefinition } from './schema.js';
import { getClass, data } from '../data/index.js';

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** @type {Record<number, (doc: any) => any>} */
export const MIGRATIONS = {
  // 0 → 1: formatos de la versión original (Firestore / localStorage).
  0: (doc) => {
    const { warnings, character } = legacyToV1(doc.character);
    return {
      format: DOCUMENT_FORMAT,
      schemaVersion: 1,
      character,
      warnings: [...(doc.warnings ?? []), ...warnings],
    };
  },
  // 1 → 2: el trasfondo deja de ser texto libre (identity.background) y pasa a
  // ser un objeto `background` que puede apuntar a un trasfondo oficial o
  // contener uno homebrew. También aparece proficiencies.expertise (vacío).
  1: (doc) => {
    const character = { ...(isObject(doc.character) ? doc.character : {}) };
    const identity = isObject(character.identity) ? { ...character.identity } : {};
    const text = typeof identity.background === 'string' ? identity.background.trim() : '';
    delete identity.background;
    character.identity = identity;
    if (!isObject(character.background)) {
      const background = createBackgroundState();
      if (text) {
        const norm = (v) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        const key = Object.keys(data.backgrounds).find((k) => norm(data.backgrounds[k].name) === norm(text));
        if (key) Object.assign(background, { source: 'official', key });
        else Object.assign(background, { source: 'custom', custom: createBackgroundDefinition({ name: text }) });
      }
      character.background = background;
    }
    return { ...doc, schemaVersion: 2, character };
  },
};

/** Detecta los formatos sin sobre que guardaba la aplicación original. */
function looksLegacy(raw) {
  return isObject(raw) && !('format' in raw) && (isObject(raw.stats) || 'nombre' in raw || 'raza' in raw);
}

export function migrateDocument(raw) {
  let doc = raw;
  if (looksLegacy(raw)) {
    doc = { format: DOCUMENT_FORMAT, schemaVersion: 0, character: raw, warnings: [] };
  }
  if (!isObject(doc) || typeof doc.schemaVersion !== 'number') return { ...doc };

  let current = { ...doc };
  while (current.schemaVersion < SCHEMA_VERSION) {
    const step = MIGRATIONS[current.schemaVersion];
    if (!step) break;
    current = step(current);
  }
  return current;
}

/**
 * Convierte los datos de la app original:
 *  - Firestore: { nombre, raza, trasfondo, alineamiento, imagenSrc, stats, ... }
 *  - localStorage: { stats, raza, clases: {clase: niveles}, nivel, mejoras }
 */
function legacyToV1(old = {}) {
  const warnings = [
    'Personaje importado desde el formato de la versión anterior. Revisa los niveles y los puntos de golpe.',
  ];
  const stats = isObject(old.stats) ? old.stats : {};
  const abilities = {};
  for (const key of ABILITY_KEYS) abilities[key] = Number(stats[key]) || 10;

  // Las mejoras ya estaban sumadas a las puntuaciones: se restan para obtener la base.
  const levels = [];
  const improvementsByLevel = {};
  if (isObject(old.mejoras)) {
    for (const [lvl, entries] of Object.entries(old.mejoras)) {
      if (!Array.isArray(entries)) continue;
      const increases = {};
      for (const e of entries) {
        if (ABILITY_KEYS.includes(e?.stat) && Number(e.value)) {
          increases[e.stat] = (increases[e.stat] ?? 0) + Number(e.value);
          abilities[e.stat] -= Number(e.value);
        }
      }
      if (Object.keys(increases).length) improvementsByLevel[Number(lvl)] = { type: 'asi', increases };
    }
  }
  if (isObject(old.clases)) {
    for (const [classKey, count] of Object.entries(old.clases)) {
      const die = getClass(classKey)?.dadoDeGolpe ?? 8;
      for (let i = 0; i < Number(count) && levels.length < 20; i++) {
        const n = levels.length + 1;
        levels.push({
          classKey,
          hpRoll: n === 1 ? die : Math.floor(die / 2) + 1,
          improvement: improvementsByLevel[n] ?? null,
        });
      }
    }
  }

  const character = {
    identity: {
      name: old.nombre ?? '',
      alignment: old.alineamiento ?? '',
      background: old.trasfondo ?? '',
      portrait: typeof old.imagenSrc === 'string' && old.imagenSrc.startsWith('data:image/') ? old.imagenSrc : null,
    },
    race: { key: typeof old.raza === 'string' && old.raza ? old.raza : null },
    abilities,
    levels,
  };
  return { character, warnings };
}
