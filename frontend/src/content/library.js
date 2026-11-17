// Biblioteca de Homebrew reutilizable (AgSt 1.25 · fase 2 de Campañas).
//
// La biblioteca es el Homebrew local del DM («Mi Homebrew»). Cada campaña que
// usa un elemento de la biblioteca guarda su propia copia (los jugadores no
// pueden leer la biblioteca de otro dispositivo) con un vínculo:
//
//   campaña.data.linkedFrom = { id: <id del elemento en la biblioteca>, version: <versión fijada> }
//
// Así:
//   - no hay duplicados: volver a usar el mismo elemento actualiza la copia
//     vinculada en vez de crear otra;
//   - cada campaña queda en la versión que eligió hasta que el DM la actualiza;
//   - cuando la biblioteca tiene una versión más nueva, se avisa.
//
// El vínculo se busca por el id del elemento (no por el id del paquete): una
// biblioteca exportada e importada en otro dispositivo conserva los ids.
//
// Todo aquí es puro: recibe elementos del registro y devuelve datos.

import { parseRef, CONTENT_TYPES } from './schema.js';

/** Id del elemento dentro de su paquete (última parte de la referencia). */
export const itemIdOf = (ref) => parseRef(ref)?.id ?? null;

/** Datos para la copia de campaña: el contenido de la biblioteca + el vínculo. */
export function linkedData(libraryEntry, libraryPackId) {
  const { linkedFrom: _drop, ...data } = libraryEntry.data ?? libraryEntry.item;
  return { ...data, linkedFrom: { id: itemIdOf(libraryEntry.ref), version: libraryEntry.version, pack: libraryPackId } };
}

/** Contenido sin el vínculo (para comparar o para guardar en la biblioteca). */
export function withoutLink(data) {
  const { linkedFrom: _drop, ...rest } = data ?? {};
  return rest;
}

/** Elemento de la campaña vinculado a un elemento de la biblioteca (o null). */
export function findLinked(campaignEntries, libraryRef) {
  const id = itemIdOf(libraryRef);
  const type = parseRef(libraryRef)?.type;
  return campaignEntries.find((e) => e.type === type && e.item.linkedFrom?.id === id) ?? null;
}

/**
 * Estado del vínculo de un elemento de campaña con la biblioteca de este dispositivo.
 * @returns {null | { libraryRef, pinned, latest, state: 'al-dia'|'nueva-version'|'retirado-en-biblioteca'|'otra-biblioteca' }}
 */
export function linkState(campaignEntry, libraryItems) {
  const link = campaignEntry?.item?.linkedFrom;
  if (!link) return null;
  const lib = libraryItems.find((i) => i.type === campaignEntry.type && itemIdOf(i.ref) === link.id);
  if (!lib) return { libraryRef: null, pinned: link.version, latest: null, state: 'otra-biblioteca' };
  const base = { libraryRef: lib.ref, pinned: link.version, latest: lib.version };
  if (lib.status === 'retirado') return { ...base, state: 'retirado-en-biblioteca' };
  return { ...base, state: lib.version > link.version ? 'nueva-version' : 'al-dia' };
}

/**
 * Dónde se usa cada elemento de la biblioteca.
 * @param campaigns [{ id, name, entries }] (sólo campañas en las que eres DM)
 * @returns Map<libraryRef, [{ campaignId, campaignName, ref, status, pinned, outdated }]>
 */
export function libraryUsage(libraryItems, campaigns) {
  const out = new Map(libraryItems.map((i) => [i.ref, []]));
  for (const c of campaigns) {
    for (const e of c.entries) {
      const st = linkState(e, libraryItems);
      if (!st?.libraryRef) continue;
      out.get(st.libraryRef).push({
        campaignId: c.id, campaignName: c.name, ref: e.ref, status: e.status, pinned: st.pinned, outdated: st.state === 'nueva-version',
      });
    }
  }
  return out;
}

/** Cuántas copias de campaña tienen una versión nueva en la biblioteca. */
export function pendingUpdates(usage, campaignId = null) {
  let n = 0;
  for (const uses of usage.values()) for (const u of uses) if (u.outdated && (!campaignId || u.campaignId === campaignId)) n++;
  return n;
}

const FIELD_LABELS = {
  name: 'nombre', description: 'descripción', source: 'fuente', features: 'rasgos', subclasses: 'subclases', traits: 'rasgos',
  effects: 'efectos', abilities: 'atributos', speed: 'velocidad', hitDie: 'dado de golpe', level: 'nivel', school: 'escuela',
  classes: 'clases', price: 'precio', rarity: 'rareza', stats: 'estadísticas', actions: 'acciones', skills: 'habilidades',
  equipment: 'equipo', prerequisites: 'requisitos', unlockHash: 'código de desbloqueo', access: 'acceso', catalog: 'catálogo',
};

/** Qué cambia entre dos versiones (nombres de campo legibles). */
export function changedFields(before, after) {
  const a = withoutLink(before);
  const b = withoutLink(after);
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const out = [];
  for (const k of keys) {
    if (JSON.stringify(a[k] ?? null) !== JSON.stringify(b[k] ?? null)) out.push(FIELD_LABELS[k] ?? k);
  }
  return [...new Set(out)];
}

export const typeLabel = (type) => CONTENT_TYPES[type]?.label ?? type;
