// Extensiones de clase: Homebrew que AMPLÍA una clase existente sin duplicarla.
//
//   CLASE BASE (oficial u Homebrew)
//       ↓
//   EXTENSIONES (content type «extension»)
//       ├─ kind «subclase»: una opción más de subclase, con rasgos por nivel
//       └─ kind «rasgos»: habilidades especiales (bendición, evolución…) por nivel
//       ↓
//   RASGOS ADICIONALES que el motor aplica como cualquier otro (efectos incluidos)
//
// Nada se aplica a todos los personajes de esa clase automáticamente. Cada
// personaje debe tener la extensión ASIGNADA en `character.unlocks`:
//   - acceso «abierta»: el jugador la puede añadir (si la campaña lo permite);
//   - acceso «desbloqueo»: hace falta el código que entrega el DM. El código se
//     guarda en el personaje y el servidor comprueba su hash al publicar.
// Una subclase-extensión, además, se elige como subclase normal.

import { listEntries, getEntry } from '../content/registry.js';
import { permissionsFor } from '../content/rules.js';

/** Formato del código de desbloqueo: «ABCD-EFGH-JKLM». */
export const UNLOCK_CODE_RE = /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin 0/O ni 1/I

export function generateUnlockCode() {
  const bytes = new Uint8Array(12);
  globalThis.crypto.getRandomValues(bytes);
  const chars = [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
  return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}`;
}

export function normalizeUnlockCode(raw) {
  const s = String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return s.length === 12 ? `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}` : null;
}

/** SHA-256 en hexadecimal (el mismo que calcula el servidor). */
export async function hashUnlockCode(code) {
  const data = new TextEncoder().encode(code);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const extensionEntry = (ref) => {
  const e = getEntry(ref);
  return e?.type === 'extension' ? e : null;
};

const unlockedSet = (c) => new Set((c.unlocks ?? []).map((u) => u.ref));

/** Extensiones de una clase (todas, para buscar por código o resolver referencias). */
export function extensionsOfClass(classKey) {
  return listEntries('extension', { selectable: false }).filter((e) => e.item.classKey === classKey);
}

/**
 * Extensiones que el personaje puede AÑADIR ahora mismo sin código:
 * abiertas, publicadas (o locales), de una clase que tiene, permitidas por la campaña.
 */
export function addableExtensions(c) {
  const perms = permissionsFor(c);
  if (!perms.homebrew.extension) return [];
  const classes = new Set(c.levels.map((l) => l.classKey));
  const have = unlockedSet(c);
  return listEntries('extension').filter((e) => e.item.access === 'abierta' && classes.has(e.item.classKey) && !have.has(e.ref));
}

/** Extensiones asignadas al personaje (estén o no ya activas por nivel). */
export function assignedExtensions(c) {
  return (c.unlocks ?? []).map((u) => ({ unlock: u, entry: extensionEntry(u.ref) })).filter((x) => x.entry);
}

/**
 * Opciones de subclase que aporta una extensión para este personaje:
 * sólo las subclases-extensión que tiene asignadas.
 */
export function extensionSubclassOptions(c, classKey) {
  if (!c) return [];
  const toOption = (entry) => ({
    key: entry.ref, name: entry.item.name, description: entry.item.description, homebrew: true, level: entry.item.subclassLevel ?? 3,
  });
  const assigned = assignedExtensions(c).map((x) => x.entry)
    .filter((e) => e.item.kind === 'subclase' && e.item.classKey === classKey);
  // Las abiertas (publicadas y permitidas) se ofrecen directamente al elegir subclase.
  const open = permissionsFor(c).homebrew.extension
    ? listEntries('extension').filter((e) => e.item.kind === 'subclase' && e.item.access === 'abierta' && e.item.classKey === classKey)
    : [];
  const seen = new Set();
  return [...assigned, ...open].filter((e) => !seen.has(e.ref) && seen.add(e.ref)).map(toOption);
}

/** Si la subclase elegida es una extensión, queda asignada al personaje. */
export function ensureSubclassUnlocks(c) {
  for (const ref of Object.values(c.subclasses ?? {})) {
    if (extensionEntry(ref) && !(c.unlocks ?? []).some((u) => u.ref === ref)) {
      c.unlocks = [...(c.unlocks ?? []), { ref, code: null, at: new Date().toISOString() }];
    }
  }
  return c;
}

/**
 * Rasgos de extensión activos para una clase hasta un nivel:
 * - de extensiones «rasgos» asignadas;
 * - de la subclase-extensión elegida.
 * @returns {Array<{ level, title, text, effects, replaces, extension, origin, condition, kind }>}
 */
export function extensionFeatures(c, classKey, upToLevel = 20) {
  const out = [];
  const add = (entry) => {
    for (const f of entry.item.features) {
      if (f.level > upToLevel) continue;
      out.push({
        level: f.level, title: f.name, text: f.text, effects: f.effects, replaces: f.replaces,
        extension: entry.item.name, origin: entry.item.origin, condition: entry.item.condition, kind: entry.item.kind, ref: entry.ref,
      });
    }
  };
  for (const { entry } of assignedExtensions(c)) {
    if (entry.item.classKey === classKey && entry.item.kind === 'rasgos') add(entry);
  }
  const sub = c.subclasses?.[classKey];
  const subEntry = sub ? extensionEntry(sub) : null;
  if (subEntry && subEntry.item.kind === 'subclase' && subEntry.item.classKey === classKey) add(subEntry);
  return out;
}

/** Asigna una extensión (con su código si lo requiere). Devuelve un personaje NUEVO. */
export function addUnlock(c, ref, code = null) {
  const next = structuredClone(c);
  next.unlocks = (next.unlocks ?? []).filter((u) => u.ref !== ref);
  next.unlocks.push({ ref, code: code ?? null, at: new Date().toISOString() });
  return next;
}

/** Quita una extensión; si era la subclase elegida, la subclase queda por elegir. */
export function removeUnlock(c, ref) {
  const next = structuredClone(c);
  next.unlocks = (next.unlocks ?? []).filter((u) => u.ref !== ref);
  for (const [k, v] of Object.entries(next.subclasses)) if (v === ref) delete next.subclasses[k];
  return next;
}

/**
 * Busca la extensión que corresponde a un código (entre todas las conocidas).
 * @returns {Promise<object|null>} la entrada del registro
 */
export async function findByCode(rawCode) {
  const code = normalizeUnlockCode(rawCode);
  if (!code) return null;
  const hash = await hashUnlockCode(code);
  return listEntries('extension', { selectable: false })
    .find((e) => e.origin !== 'snapshot' && e.status !== 'retirado' && e.item.access === 'desbloqueo' && e.item.unlockHash === hash) ?? null;
}
