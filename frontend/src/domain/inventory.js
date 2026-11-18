// Inventario avanzado: equipar, sintonizar, usar consumibles y carga.
//
// Campos opcionales de cada objeto (equipment.items[i]); sólo se guardan si
// están puestos (ver domain/validation.js):
//   equipped: true    lo lleva puesto / en la mano
//   attuned: true     sintonizado (máximo 3 a la vez, regla de D&D 5e)
//   consumable: true  se gasta al usarlo (pociones, raciones, munición…)
//   weight: n         peso por unidad, en libras
//
// Todo es puro: devuelve personajes nuevos.

import { abilityScores } from './rules.js';
import { coinsInCp } from './money.js';

export const ATTUNE_LIMIT = 3;
/** 50 monedas pesan 1 libra (PHB). */
const COINS_PER_LB = 50;

const clone = (c) => structuredClone(c);

export function attunedCount(character) {
  return (character.equipment.items ?? []).filter((i) => i.attuned).length;
}

/** Equipar / sintonizar / marcar como consumible. Devuelve { character } o { error }. */
export function toggleItemFlag(character, index, flag) {
  if (!['equipped', 'attuned', 'consumable'].includes(flag)) return { error: 'Opción desconocida.' };
  const item = character.equipment.items[index];
  if (!item) return { error: 'Ese objeto ya no está en el inventario.' };
  if (flag === 'attuned' && !item.attuned && attunedCount(character) >= ATTUNE_LIMIT) {
    return { error: `Ya tienes ${ATTUNE_LIMIT} objetos sintonizados. Quita la sintonía de uno antes.` };
  }
  const c = clone(character);
  const it = c.equipment.items[index];
  if (it[flag]) delete it[flag];
  else it[flag] = true;
  return { character: c };
}

/**
 * Usa una unidad: resta 1 y, si era la última, quita la línea.
 * Devuelve { character, event } (el evento es para el registro de la campaña).
 */
export function useItem(character, index) {
  const item = character.equipment.items[index];
  if (!item) return { error: 'Ese objeto ya no está en el inventario.' };
  if ((Number(item.quantity) || 0) < 1) return { error: `No te quedan unidades de ${item.name || 'ese objeto'}.` };
  const c = clone(character);
  const it = c.equipment.items[index];
  it.quantity = (Number(it.quantity) || 1) - 1;
  if (it.quantity <= 0) c.equipment.items.splice(index, 1);
  const name = item.name.trim() || 'un objeto';
  return {
    character: c,
    left: Math.max(0, it.quantity),
    event: { kind: 'uso', text: `Usa ${name}.`, visibility: 'privado', data: { name, qty: 1 } },
  };
}

/** Peso total, capacidad de carga (FUE × 15) y contadores. */
export function inventoryTotals(character) {
  const items = character.equipment.items ?? [];
  let itemsWeight = 0;
  let unknown = 0;
  for (const it of items) {
    if (it.weight) itemsWeight += it.weight * (Number(it.quantity) || 0);
    else if (it.name?.trim()) unknown++;
  }
  const coins = ['cp', 'sp', 'gp', 'pp'].reduce((n, k) => n + (Number(character.equipment.coins?.[k]) || 0), 0);
  const coinsWeight = coins / COINS_PER_LB;
  let strength = 10;
  try { strength = abilityScores(character).fuerza.total; } catch { /* ficha incompleta */ }
  const weight = Math.round((itemsWeight + coinsWeight) * 10) / 10;
  const capacity = strength * 15;
  return {
    weight,
    coinsWeight: Math.round(coinsWeight * 10) / 10,
    capacity,
    load: weight > capacity ? 'excedida' : weight > capacity * (2 / 3) ? 'pesada' : 'normal',
    unknown,
    equipped: items.filter((i) => i.equipped).length,
    attuned: attunedCount(character),
    wealthCp: coinsInCp(character.equipment.coins),
  };
}

/** Filtros del inventario. */
export const INVENTORY_FILTERS = Object.freeze({
  todo: { label: 'Todo', test: () => true },
  equipado: { label: 'Equipado', test: (i) => i.equipped },
  sintonizado: { label: 'Sintonizado', test: (i) => i.attuned },
  consumibles: { label: 'Consumibles', test: (i) => i.consumable },
});
