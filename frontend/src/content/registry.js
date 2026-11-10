// Registro de contenido Homebrew.
//
// Guarda en memoria los «paquetes» activos: el Homebrew local del usuario, el de
// cada campaña a la que pertenece y las instantáneas que traen los personajes
// abiertos. data/index.js lo consulta después de los datos oficiales, así que
// todo el código que ya usa getClass/getRace/getFeat ve el Homebrew sin cambios.
//
// Prioridad cuando la misma referencia llega por varias vías:
//   campaña o local (fuente de la verdad)  >  instantánea guardada en un personaje.

import { validateContent, parseRef, makeRef } from './schema.js';
import { toEngine } from './engine.js';

/** @type {Map<string, { ref, type, packId, version, status, item, engine, origin, packName }>} */
const entries = new Map();
/** @type {Map<string, { id, name, kind, campaignId?, rules? }>} */
const packs = new Map();
const listeners = new Set();
let version = 0;

function notify() {
  version++;
  for (const fn of listeners) {
    try { fn(version); } catch { /* un oyente roto no debe romper el registro */ }
  }
}

export function onRegistryChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const registryVersion = () => version;

/**
 * Valida y registra un elemento. Devuelve los errores (vacío si entró).
 * @param {{ ref: string, type: string, version?: number, status?: string, data: object }} raw
 */
function putEntry(raw, { packId, packName, origin }) {
  const parsed = parseRef(raw?.ref);
  if (!parsed || parsed.type !== raw.type) return ['Referencia de contenido no válida.'];
  const { item, errors } = validateContent(raw.type, raw.data);
  if (!item) return errors;
  const current = entries.get(raw.ref);
  // Una instantánea nunca sustituye a la fuente de la verdad.
  if (current && current.origin !== 'snapshot' && origin === 'snapshot') return [];
  entries.set(raw.ref, {
    ref: raw.ref,
    type: raw.type,
    packId,
    packName,
    version: Number(raw.version) || 1,
    status: raw.status ?? 'publicado',
    item,
    engine: toEngine(raw.type, item, raw.ref),
    origin,
  });
  return [];
}

/**
 * Instala (o reemplaza) un paquete completo.
 * @param {{ id: string, name: string, kind: 'local'|'campaign', campaignId?: string, rules?: object, items: Array }} pack
 * @returns {{ rejected: Array<{ ref, errors }> }}
 */
export function installPack(pack) {
  for (const [ref, e] of entries) if (e.packId === pack.id && e.origin !== 'snapshot') entries.delete(ref);
  packs.set(pack.id, { id: pack.id, name: pack.name, kind: pack.kind, campaignId: pack.campaignId ?? null, rules: pack.rules ?? null, role: pack.role ?? null });
  const rejected = [];
  for (const raw of pack.items ?? []) {
    const errors = putEntry(raw, { packId: pack.id, packName: pack.name, origin: pack.kind });
    if (errors.length) rejected.push({ ref: raw?.ref, errors });
  }
  notify();
  return { rejected };
}

export function uninstallPack(packId) {
  packs.delete(packId);
  for (const [ref, e] of entries) if (e.packId === packId && e.origin !== 'snapshot') entries.delete(ref);
  notify();
}

export function getPack(packId) {
  return packs.get(packId) ?? null;
}

export function listPacks() {
  return [...packs.values()];
}

/** Registra las instantáneas de un personaje si su contenido no está disponible. */
export function registerSnapshots(content) {
  let added = 0;
  for (const [ref, snap] of Object.entries(content ?? {})) {
    if (entries.has(ref)) continue;
    const parsed = parseRef(ref);
    if (!parsed) continue;
    const errors = putEntry({ ref, type: snap.type, version: snap.version, status: 'instantanea', data: { ...snap.data, name: snap.data?.name ?? snap.name } }, {
      packId: parsed.packId, packName: 'Instantánea', origin: 'snapshot',
    });
    if (!errors.length) added++;
  }
  if (added) notify();
  return added;
}

export function getEntry(ref) {
  return entries.get(ref) ?? null;
}

/** Forma del motor de un elemento Homebrew (o null). */
export function engineOf(type, ref) {
  const e = entries.get(ref);
  return e && e.type === type ? e.engine : null;
}

/**
 * Elementos de un tipo. Por defecto sólo los que se pueden elegir: publicados
 * (o de paquetes locales). Las instantáneas y lo oculto/retirado no se ofrecen,
 * pero siguen resolviéndose para los personajes que ya los usan.
 */
export function listEntries(type, { selectable = true, packId = null } = {}) {
  return [...entries.values()].filter((e) => (!type || e.type === type)
    && (!packId || e.packId === packId)
    && (!selectable || (e.origin !== 'snapshot' && (e.origin === 'local' || e.status === 'publicado'))))
    .sort((a, b) => a.item.name.localeCompare(b.item.name, 'es'));
}

export function newRef(packId, type, id) {
  return makeRef(packId, type, id);
}

/** Sólo para pruebas. */
export function resetRegistry() {
  entries.clear();
  packs.clear();
  notify();
}
