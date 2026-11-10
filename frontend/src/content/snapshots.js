// Instantáneas del contenido Homebrew dentro de cada personaje.
//
// El personaje guarda referencias («hb:…»), no copias. Pero si se exporta, se
// comparte fuera de la campaña o el DM retira algo, la referencia sola no
// bastaría para abrir la ficha. Por eso, al guardar, se adjunta una copia del
// contenido usado (`character.content`) y, al abrir, se registra si el
// contenido original no está disponible. La copia nunca sustituye al original.

import { getEntry, listEntries, registerSnapshots } from './registry.js';
import { isHomebrewRef } from './schema.js';

/** Referencias Homebrew que usa un personaje. */
export function usedRefs(c) {
  const refs = new Set();
  const add = (r) => { if (isHomebrewRef(r)) refs.add(r); };
  add(c.race?.key);
  add(c.race?.feat?.name);
  for (const l of c.levels ?? []) {
    add(l.classKey);
    if (l.improvement?.type === 'feat') add(l.improvement.name);
  }
  add(c.background?.ref);
  add(c.background?.custom?.feat);
  for (const t of c.traits ?? []) add(t.ref);
  for (const u of c.unlocks ?? []) add(u.ref);
  for (const s of Object.values(c.subclasses ?? {})) add(s);
  for (const x of c.companions ?? []) add(x.creatureRef);
  const known = new Set(c.spells?.known ?? []);
  if (known.size) {
    for (const e of listEntries('hechizo', { selectable: false })) {
      if (known.has(e.item.name) || known.has(`${e.item.name} (HB)`)) refs.add(e.ref);
    }
  }
  return refs;
}

/** Devuelve el personaje con `content` actualizado a lo que usa ahora. */
export function syncSnapshots(c) {
  const content = {};
  for (const ref of usedRefs(c)) {
    const e = getEntry(ref);
    if (e) content[ref] = { type: e.type, version: e.version, name: e.item.name, data: e.item };
    else if (c.content?.[ref]) content[ref] = c.content[ref];
  }
  return { ...c, content };
}

/** Registra las instantáneas de un personaje recién abierto. */
export function hydrateSnapshots(c) {
  return registerSnapshots(c?.content);
}

/**
 * Estado del contenido Homebrew que usa un personaje, para avisos en la ficha:
 * [{ ref, name, type, state: 'ok'|'actualizado'|'oculto'|'retirado'|'instantanea' }]
 */
export function contentStatus(c) {
  return [...usedRefs(c)].map((ref) => {
    const e = getEntry(ref);
    const snap = c.content?.[ref];
    if (!e) return { ref, name: snap?.name ?? ref, type: snap?.type ?? '', state: 'desconocido' };
    let state = 'ok';
    if (e.origin === 'snapshot') state = 'instantanea';
    else if (e.status === 'retirado') state = 'retirado';
    else if (e.status === 'oculto') state = 'oculto';
    else if (snap && snap.version < e.version) state = 'actualizado';
    return { ref, name: e.item.name, type: e.type, state, pack: e.packName };
  });
}
