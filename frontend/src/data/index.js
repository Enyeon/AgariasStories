// Punto único de acceso a los datos de juego (razas, clases, dotes...).
// Los JSON se generaron a partir del proyecto original (ver docs/DATOS.md).
// Para añadir una clase nueva basta con soltar un JSON en ./classes/.

import races from './races.json';
import raceCatalog from './race-catalog.json';
import raceTags from './race-tags.json';
import raceBadges from './race-badges.json';
import feats from './feats.json';
import epicBoons from './epic-boons.json';
import languages from './languages.json';
import bloodCreatures from './blood-creatures.json';
import rulesReference from './rules-reference.json';
import backgrounds from './backgrounds.json';
import { engineOf, listEntries } from '../content/registry.js';
import { validateClassData } from '../content/class-data.js';

const classModules = import.meta.glob('./classes/*.json', { eager: true, import: 'default' });

/** @type {Record<string, any>} */
const classes = Object.fromEntries(
  Object.values(classModules).map((cls) => [cls.claseName, cls]),
);

/**
 * Registra una clase en el formato de data/classes/*.json que no está en el
 * repositorio (p. ej. para probar una clase escrita a mano). Se valida antes:
 * si tiene errores no se registra y se devuelven.
 * @returns {{ ok: boolean, errors: string[], warnings: string[] }}
 */
export function registerClassData(cls) {
  const res = validateClassData(cls);
  if (res.ok) classes[cls.claseName] = cls;
  return res;
}

// Razas con el rasgo «Dureza» (+1 PG por nivel). En el original era una lista
// fija en hability--stats.js; se conserva aquí junto a los badges.
const TOUGH_RACES = Object.freeze(Object.keys(raceBadges));

export const data = Object.freeze({
  races,
  raceCatalog,
  raceTags,
  raceBadges,
  feats,
  epicBoons,
  languages,
  bloodCreatures,
  rulesReference,
  backgrounds,
  classes,
});

// Los getters consultan primero los datos oficiales y después el registro de
// Homebrew (content/registry.js). Las claves Homebrew son referencias estables
// («hb:paquete:tipo:id»), así que nunca chocan con una clave oficial.

export function getRace(key) {
  if (!key) return null;
  return Object.hasOwn(races, key) ? races[key] : engineOf('raza', key);
}

/** Nombre visible de una raza (las Homebrew se guardan por referencia). */
export function raceName(key) {
  return getRace(key)?.nombre ?? key ?? '';
}

export function getClass(key) {
  if (!key) return null;
  return Object.hasOwn(classes, key) ? classes[key] : engineOf('clase', key);
}

/** Clases elegibles: oficiales + Homebrew publicado o local. */
export function listClasses() {
  return [...Object.values(classes), ...listEntries('clase').map((e) => e.engine)]
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

export function getFeat(name) {
  if (!name) return null;
  return Object.hasOwn(feats, name) ? feats[name] : engineOf('dote', name);
}

/** Nombre visible de una dote (las Homebrew se guardan por referencia). */
export function featName(key) {
  return getFeat(key)?.nombre ?? key ?? '';
}

/** Dotes elegibles: [clave, definición]. */
export function listFeats() {
  return [...Object.entries(feats), ...listEntries('dote').map((e) => [e.ref, e.engine])];
}

/** Razas Homebrew elegibles: [{ key, race }]. */
export function listHomebrewRaces() {
  return listEntries('raza').map((e) => ({ key: e.ref, race: e.engine, pack: e.packName }));
}

/** Trasfondo oficial o de Agarias por clave (los homebrew viven en el personaje). */
export function getOfficialBackground(key) {
  return key && Object.hasOwn(backgrounds, key) ? backgrounds[key] : null;
}

export function getEpicBoon(name) {
  return name && Object.hasOwn(epicBoons, name) ? epicBoons[name] : null;
}

export function raceHasToughness(raceKey) {
  return Boolean(raceKey) && TOUGH_RACES.includes(raceKey);
}

/** Etiquetas de una raza (p. ej. "Elfo") usadas por los requisitos de dotes. */
export function getRaceTags(raceKey) {
  if (!raceKey) return [];
  return raceTags[raceKey] ?? [];
}

let spellsPromise = null;
/**
 * El catálogo de conjuros (~500 KB) se carga bajo demanda. Se devuelve un
 * objeto nuevo con los hechizos Homebrew del registro añadidos (por nombre;
 * si un Homebrew se llama igual que uno oficial, se distingue con «(HB)»).
 */
export async function loadSpells() {
  spellsPromise ??= import('./spells.json').then((m) => m.default);
  const official = await spellsPromise;
  const homebrew = listEntries('hechizo', { selectable: false });
  if (!homebrew.length) return official;
  const out = { ...official };
  for (const e of homebrew) {
    const name = Object.hasOwn(official, e.engine.nombre) ? `${e.engine.nombre} (HB)` : e.engine.nombre;
    out[name] = { ...e.engine, ref: e.ref };
  }
  return out;
}
