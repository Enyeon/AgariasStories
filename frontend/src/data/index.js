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

const classModules = import.meta.glob('./classes/*.json', { eager: true, import: 'default' });

/** @type {Record<string, any>} */
const classes = Object.fromEntries(
  Object.values(classModules).map((cls) => [cls.claseName, cls]),
);

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

export function getRace(key) {
  return key && Object.hasOwn(races, key) ? races[key] : null;
}

export function getClass(key) {
  return key && Object.hasOwn(classes, key) ? classes[key] : null;
}

export function listClasses() {
  return Object.values(classes).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

export function getFeat(name) {
  return name && Object.hasOwn(feats, name) ? feats[name] : null;
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
/** El catálogo de conjuros (~500 KB) se carga bajo demanda. */
export function loadSpells() {
  spellsPromise ??= import('./spells.json').then((m) => m.default);
  return spellsPromise;
}
