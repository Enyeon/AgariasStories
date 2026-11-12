// Características del personaje: rasgos de personalidad, ideal, vínculo,
// defecto y las tablas propias de cada trasfondo (especialidad, origen…).
//
// Cada elemento se define de tres formas:
//   - 'custom' → lo escribe el jugador;
//   - 'random' → se tira el dado de la tabla;
//   - 'list'   → se elige una opción de la tabla.
// El texto elegido se COPIA en la ficha: viaja al exportar/compartir y se
// puede retocar sin depender de los datos.
//
// Formato (opcional en el documento; sólo existe si hay algo definido):
//   character.personality = {
//     set: 'acolito' | null,          // tablas usadas (null = las del trasfondo)
//     traits: [Entry, Entry],         // dos rasgos de personalidad
//     ideal: Entry, bond: Entry, flaw: Entry,
//     extras: { [tablaId]: Entry },
//   }
//   Entry = { mode: 'custom'|'random'|'list', text: string, index: number|null }

import traitData from '../data/background-traits.json';

export const PERSONALITY_MODES = Object.freeze(['custom', 'random', 'list']);
export const TRAIT_SETS = traitData.sets;
const MAX_TEXT = 1000;

/** Huecos fijos, en orden de presentación. */
export const PERSONALITY_SLOTS = Object.freeze([
  { id: 'trait1', label: 'Rasgo de personalidad', table: 'personality', die: 'd8' },
  { id: 'trait2', label: 'Segundo rasgo de personalidad', table: 'personality', die: 'd8' },
  { id: 'ideal', label: 'Ideal', table: 'ideals', die: 'd6' },
  { id: 'bond', label: 'Vínculo', table: 'bonds', die: 'd6' },
  { id: 'flaw', label: 'Defecto', table: 'flaws', die: 'd6' },
]);

export const emptyEntry = () => ({ mode: 'custom', text: '', index: null });

export function emptyPersonality() {
  return { set: null, traits: [emptyEntry(), emptyEntry()], ideal: emptyEntry(), bond: emptyEntry(), flaw: emptyEntry(), extras: {} };
}

function normalizeEntry(src) {
  if (!src || typeof src !== 'object') return emptyEntry();
  const mode = PERSONALITY_MODES.includes(src.mode) ? src.mode : 'custom';
  const text = typeof src.text === 'string' ? src.text.slice(0, MAX_TEXT) : '';
  const index = Number.isInteger(src.index) && src.index >= 0 && src.index < 30 ? src.index : null;
  return { mode, text, index: mode === 'custom' ? null : index };
}

const isBlank = (e) => !e.text && e.index === null && e.mode === 'custom';

/** Normaliza; devuelve null si no hay nada definido (así no cambia la huella de fichas viejas). */
export function normalizePersonality(src) {
  if (!src || typeof src !== 'object') return null;
  const p = emptyPersonality();
  p.set = typeof src.set === 'string' && TRAIT_SETS[src.set] ? src.set : null;
  p.traits = [0, 1].map((i) => normalizeEntry(Array.isArray(src.traits) ? src.traits[i] : null));
  p.ideal = normalizeEntry(src.ideal);
  p.bond = normalizeEntry(src.bond);
  p.flaw = normalizeEntry(src.flaw);
  if (src.extras && typeof src.extras === 'object') {
    for (const [id, e] of Object.entries(src.extras).slice(0, 10)) {
      if (/^[a-z-]{1,40}$/.test(id)) {
        const entry = normalizeEntry(e);
        if (!isBlank(entry)) p.extras[id] = entry;
      }
    }
  }
  const empty = !p.set && [...p.traits, p.ideal, p.bond, p.flaw].every(isBlank) && !Object.keys(p.extras).length;
  return empty ? null : p;
}

/** Clave de las tablas que usa el personaje: la elegida o la de su trasfondo. */
export function traitSetKey(character) {
  const chosen = character.personality?.set;
  if (chosen && TRAIT_SETS[chosen]) return chosen;
  const bg = character.background;
  if (bg?.source === 'official' && bg.key) return traitData.map[bg.key] ?? null;
  return null;
}

/** Huecos que muestra la ficha: los fijos + las tablas propias del trasfondo. */
export function slotsFor(setKey) {
  const set = TRAIT_SETS[setKey];
  const extras = (set?.extras ?? []).map((t) => ({ id: `extra:${t.id}`, label: t.label, table: t.id, die: t.die, extra: true }));
  return [...PERSONALITY_SLOTS, ...extras];
}

/** Opciones de la tabla de un hueco: [{ text, alignment? }]. */
export function optionsFor(setKey, slot) {
  const set = TRAIT_SETS[setKey];
  if (!set) return [];
  if (slot.extra) return (set.extras.find((t) => t.id === slot.table)?.options ?? []).map((text) => ({ text }));
  if (slot.table === 'ideals') return set.ideals;
  return (set[slot.table] ?? []).map((text) => ({ text }));
}

export function getEntry(character, slotId) {
  const p = character.personality;
  if (!p) return emptyEntry();
  if (slotId === 'trait1') return p.traits?.[0] ?? emptyEntry();
  if (slotId === 'trait2') return p.traits?.[1] ?? emptyEntry();
  if (slotId.startsWith('extra:')) return p.extras?.[slotId.slice(6)] ?? emptyEntry();
  return p[slotId] ?? emptyEntry();
}

/** Ruta de enlace del texto (para el campo «Personalizado»). */
export function entryPath(slotId) {
  if (slotId === 'trait1') return 'personality.traits.0.text';
  if (slotId === 'trait2') return 'personality.traits.1.text';
  if (slotId.startsWith('extra:')) return `personality.extras.${slotId.slice(6)}.text`;
  return `personality.${slotId}.text`;
}

/** Escribe una entrada (muta `character`, creando la estructura si falta). */
export function setEntry(character, slotId, entry) {
  character.personality = character.personality ?? emptyPersonality();
  const p = character.personality;
  p.traits = p.traits ?? [emptyEntry(), emptyEntry()];
  p.extras = p.extras ?? {};
  if (slotId === 'trait1') p.traits[0] = entry;
  else if (slotId === 'trait2') p.traits[1] = entry;
  else if (slotId.startsWith('extra:')) p.extras[slotId.slice(6)] = entry;
  else p[slotId] = entry;
}

/**
 * Tira el dado de la tabla. Los dos rasgos de personalidad no se repiten.
 * @param {() => number} random generador [0, 1)
 */
export function rollEntry(character, slot, setKey, random = Math.random) {
  const options = optionsFor(setKey, slot);
  if (!options.length) return null;
  const taken = slot.id === 'trait1' ? getEntry(character, 'trait2') : slot.id === 'trait2' ? getEntry(character, 'trait1') : null;
  const avoid = taken && taken.mode !== 'custom' ? taken.index : null;
  let index = Math.floor(random() * options.length);
  if (index === avoid && options.length > 1) index = (index + 1 + Math.floor(random() * (options.length - 1))) % options.length;
  return { mode: 'random', text: options[index].text, index };
}

export function pickEntry(setKey, slot, index) {
  const option = optionsFor(setKey, slot)[index];
  return option ? { mode: 'list', text: option.text, index } : null;
}
