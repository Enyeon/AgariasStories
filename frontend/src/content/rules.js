// Reglas de una campaña: qué contenido se permite y quién puede crear Homebrew.
//
// Es el ÚNICO sistema de permisos de la app (sustituye a la casilla
// «allowEpicBoons» de cada ficha cuando el personaje pertenece a una campaña).
// La interfaz lo usa para ocultar opciones; el servidor (Supabase) aplica las
// mismas reglas al crear contenido y al publicar personajes.

import { CONTENT_TYPE_KEYS, CONTENT_TYPES } from './schema.js';

/** El mundo de la Tienda (comerciantes, regiones, facciones, eventos) es exclusivo del DM. */
const isDmOnly = (t) => CONTENT_TYPES[t]?.dmOnly === true;
import { getPack } from './registry.js';

/** Quién puede crear Homebrew de un tipo. */
export const HOMEBREW_MODES = Object.freeze({
  no: 'No se permite',
  dm: 'Sólo el DM',
  propuestas: 'El DM y propuestas de jugadores',
});

/** Tipos con contenido oficial que se puede restringir. */
export const OFFICIAL_TYPES = Object.freeze(['clase', 'raza', 'hechizo', 'dote', 'trasfondo']);

export function defaultRules() {
  return {
    official: Object.fromEntries(OFFICIAL_TYPES.map((t) => [t, true])),
    homebrew: Object.fromEntries(CONTENT_TYPE_KEYS.map((t) => [t, 'dm'])),
    epicBoons: false,
    traitEffects: 'todos',
  };
}

/** Normaliza unas reglas recibidas (del servidor o de un archivo). */
export function normalizeRules(raw) {
  const d = defaultRules();
  const src = raw && typeof raw === 'object' ? raw : {};
  for (const t of OFFICIAL_TYPES) if (typeof src.official?.[t] === 'boolean') d.official[t] = src.official[t];
  for (const t of CONTENT_TYPE_KEYS) if (!isDmOnly(t) && Object.hasOwn(HOMEBREW_MODES, src.homebrew?.[t])) d.homebrew[t] = src.homebrew[t];
  d.epicBoons = src.epicBoons === true;
  d.traitEffects = src.traitEffects === 'dm' ? 'dm' : 'todos';
  return d;
}

/**
 * Permisos efectivos para un personaje.
 * Sin campaña: todo permitido salvo los dones épicos, que siguen la casilla de la ficha.
 */
export function permissionsFor(character) {
  const pack = character?.campaign?.id ? getPack(character.campaign.id) : null;
  if (!pack) {
    return {
      campaign: null,
      role: null,
      official: Object.fromEntries(OFFICIAL_TYPES.map((t) => [t, true])),
      homebrew: Object.fromEntries(CONTENT_TYPE_KEYS.map((t) => [t, true])),
      epicBoons: character?.settings?.allowEpicBoons === true,
      traitEffects: true,
      linked: Boolean(character?.campaign?.id),
    };
  }
  const rules = normalizeRules(pack.rules);
  return {
    campaign: { id: pack.id, name: pack.name },
    role: pack.role,
    official: rules.official,
    homebrew: Object.fromEntries(CONTENT_TYPE_KEYS.map((t) => [t, isDmOnly(t) ? pack.role === 'dm' : rules.homebrew[t] !== 'no'])),
    epicBoons: rules.epicBoons,
    traitEffects: rules.traitEffects === 'todos' || pack.role === 'dm',
    linked: true,
    rules,
  };
}
