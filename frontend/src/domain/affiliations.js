// Origen y facciones del personaje (campo opcional `character.affiliations`).
//
//   affiliations: { origin: 'valle' | null, factions: [{ id }] }
//
// Es la PERTENENCIA (de dónde es, a qué facciones pertenece): la decide el
// jugador en su ficha. La REPUTACIÓN con cada facción no vive aquí, sino en el
// mercado de la campaña (la ajusta el DM y los favores), porque es algo que el
// mundo piensa de ti, no algo que tú declaras.
// Se omite del documento si está vacío: así las fichas ya compartidas no
// aparecen como «con cambios sin publicar».

const ID = /^[a-z0-9-]{1,60}$/; // oficiales («clan-yunque») y Homebrew del DM («hb-…»)
export const MAX_FACTIONS = 12;

export function normalizeAffiliations(src) {
  if (!src || typeof src !== 'object') return null;
  const origin = typeof src.origin === 'string' && ID.test(src.origin) ? src.origin : null;
  const seen = new Set();
  const factions = [];
  for (const f of Array.isArray(src.factions) ? src.factions : []) {
    const id = typeof f === 'string' ? f : f?.id;
    if (typeof id !== 'string' || !ID.test(id) || seen.has(id)) continue;
    seen.add(id);
    factions.push({ id });
    if (factions.length >= MAX_FACTIONS) break;
  }
  if (!origin && !factions.length) return null;
  return { origin, factions };
}

export function setOrigin(character, origin) {
  const next = normalizeAffiliations({ ...(character.affiliations ?? {}), origin: origin || null });
  if (next) character.affiliations = next;
  else delete character.affiliations;
}

export function toggleFaction(character, id, on) {
  const current = character.affiliations?.factions ?? [];
  const factions = on ? [...current, { id }] : current.filter((f) => f.id !== id);
  const next = normalizeAffiliations({ ...(character.affiliations ?? {}), factions });
  if (next) character.affiliations = next;
  else delete character.affiliations;
}
