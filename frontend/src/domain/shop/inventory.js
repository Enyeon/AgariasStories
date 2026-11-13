// Puente entre la Tienda y el inventario de la ficha.
//
// La Tienda NO tiene inventario propio: lo comprado va al personaje.
//   - Objetos normales → `equipment.items` (con `ref` al catálogo para apilar
//     y poder venderlos de vuelta).
//   - Materiales del Taller → `workshop.materials`, usando la misma función que
//     el Taller (adjustMaterial).
// Funciones puras: reciben un personaje y devuelven uno NUEVO.

import { createItem } from '../schema.js';
import { adjustMaterial } from '../workshop.js';
import { searchKey } from './catalog.js';

const MAX_QTY = 99_999;

/** Nombre con el que aparece en la ficha (sin el «(20)» de los lotes). */
export function inventoryName(item) {
  return item.bundle ? item.name.replace(/\s*\(\d+\)\s*$/, '') : item.name;
}

/** Notas breves para la ficha: propiedades del catálogo. */
function inventoryNotes(item) {
  return Object.entries(item.props ?? {}).map(([k, v]) => `${k}: ${v}`).join(' · ').slice(0, 2000);
}

/** ¿Esta entrada del inventario es este objeto? Por referencia o, si se escribió a mano, por nombre. */
function matches(entry, item) {
  if (entry.ref) return entry.ref === item.id;
  const name = searchKey(entry.name).trim();
  return name === searchKey(item.name).trim() || name === searchKey(inventoryName(item)).trim();
}

/**
 * Inventos fabricados antes de que el Taller guardara `ref`: se reconocen por
 * su nombre en `workshop.creations`. Devuelve una copia (no se guarda sola).
 */
export function withInventionRefs(character) {
  if (!character?.equipment?.items?.length) return character;
  const byName = new Map((character.workshop?.creations ?? []).map((c) => [c.name, c.recipeId]));
  if (!byName.size) return character;
  let changed = false;
  const items = character.equipment.items.map((it) => {
    if (it.ref || !String(it.notes ?? '').startsWith('Taller · ') || !byName.has(it.name)) return it;
    changed = true;
    return { ...it, ref: `taller-obra-${byName.get(it.name)}` };
  });
  return changed ? { ...character, equipment: { ...character.equipment, items } } : character;
}

/** Unidades de venta que tiene el personaje (un lote de 20 flechas = 1 unidad). */
export function ownedUnits(character, item) {
  if (item.grant?.kind === 'workshop-material') return character.workshop?.materials?.[item.grant.id] ?? 0;
  const pieces = (character.equipment?.items ?? []).filter((e) => matches(e, item)).reduce((t, e) => t + (Number(e.quantity) || 0), 0);
  return Math.floor(pieces / (item.bundle ?? 1));
}

/** Añade `qty` unidades compradas a la ficha. */
export function grantItem(character, item, qty) {
  if (item.grant?.kind === 'workshop-material') return adjustMaterial(character, item.grant.id, qty);
  const out = structuredClone(character);
  const pieces = qty * (item.bundle ?? 1);
  const existing = out.equipment.items.find((e) => e.ref === item.id);
  if (existing) existing.quantity = Math.min(MAX_QTY, (Number(existing.quantity) || 0) + pieces);
  else out.equipment.items.push(createItem({ name: inventoryName(item), quantity: Math.min(MAX_QTY, pieces), notes: inventoryNotes(item), ref: item.id }));
  return out;
}

/** Quita `qty` unidades vendidas. Devuelve { character } o { error }. */
export function takeItem(character, item, qty) {
  if (ownedUnits(character, item) < qty) return { error: 'No tienes tantas unidades.' };
  if (item.grant?.kind === 'workshop-material') return { character: adjustMaterial(character, item.grant.id, -qty) };
  const out = structuredClone(character);
  let left = qty * (item.bundle ?? 1);
  // Primero las entradas de la Tienda (con ref), después las escritas a mano.
  const order = out.equipment.items.map((e, i) => i).sort((a, b) => Number(Boolean(out.equipment.items[b].ref)) - Number(Boolean(out.equipment.items[a].ref)));
  for (const i of order) {
    const e = out.equipment.items[i];
    if (left <= 0 || !matches(e, item)) continue;
    const take = Math.min(Number(e.quantity) || 0, left);
    e.quantity -= take;
    left -= take;
  }
  out.equipment.items = out.equipment.items.filter((e) => !(matches(e, item) && e.quantity <= 0));
  return { character: out };
}

/** Objetos de la ficha que el catálogo reconoce, agrupados: [{ item, units, pieces }]. */
export function recognizedItems(character, catalog) {
  const out = new Map();
  for (const entry of character.equipment?.items ?? []) {
    const item = (entry.ref && catalog.get(entry.ref)) || catalog.list.find((i) => i.grant.kind === 'inventory' && matches(entry, i));
    if (!item || out.has(item.id)) continue;
    out.set(item.id, { item, units: ownedUnits(character, item) });
  }
  for (const [id, qty] of Object.entries(character.workshop?.materials ?? {})) {
    const item = catalog.list.find((i) => i.grant.kind === 'workshop-material' && i.grant.id === id);
    if (item && qty > 0) out.set(item.id, { item, units: qty });
  }
  return [...out.values()];
}

/** Objetos de la ficha que la Tienda no conoce (escritos a mano, de trama…). */
export function unrecognizedItems(character, catalog) {
  return (character.equipment?.items ?? []).filter((entry) => !((entry.ref && catalog.get(entry.ref)) || catalog.list.some((i) => i.grant.kind === 'inventory' && matches(entry, i))));
}
