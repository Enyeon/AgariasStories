// Inventario avanzado (equipar, sintonizar, usar, carga) y Mundo de campaña.
import { describe, it, expect } from 'vitest';
import { createCharacter, createDocument } from '../src/domain/schema.js';
import { parseDocument } from '../src/domain/validation.js';
import { toggleItemFlag, useItem, inventoryTotals, ATTUNE_LIMIT } from '../src/domain/inventory.js';
import { diffEvents } from '../src/domain/campaign-play.js';
import { normalizeWorldData, questProgress, sortWorld, matchesQuery, relatedTo } from '../src/domain/campaign-world.js';

function hero(items = []) {
  const c = createCharacter();
  c.identity.name = 'Vex';
  c.abilities.fuerza = 12;
  c.equipment.items = items.map((i) => ({ quantity: 1, notes: '', ...i }));
  return c;
}

describe('inventario avanzado', () => {
  it('equipar y sintonizar (máximo 3)', () => {
    let c = hero([{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }]);
    c = toggleItemFlag(c, 0, 'equipped').character;
    expect(c.equipment.items[0].equipped).toBe(true);
    expect(toggleItemFlag(c, 0, 'equipped').character.equipment.items[0]).not.toHaveProperty('equipped');
    for (let i = 0; i < ATTUNE_LIMIT; i++) c = toggleItemFlag(c, i, 'attuned').character;
    expect(toggleItemFlag(c, 3, 'attuned').error).toMatch(/3 objetos sintonizados/);
    expect(toggleItemFlag(c, 0, 'attuned').character.equipment.items[0].attuned).toBeUndefined();
  });

  it('usar resta una unidad, quita la última y prepara la entrada del registro', () => {
    const c = hero([{ name: 'Poción de curación', quantity: 2, consumable: true }]);
    const once = useItem(c, 0);
    expect(once.character.equipment.items[0].quantity).toBe(1);
    expect(once.event).toMatchObject({ kind: 'uso', data: { name: 'Poción de curación', qty: 1 } });
    const twice = useItem(once.character, 0);
    expect(twice.character.equipment.items).toEqual([]);
    expect(twice.left).toBe(0);
  });

  it('el registro no repite lo gastado con «Usar» pero sí lo demás', () => {
    const before = hero([{ name: 'Poción', quantity: 2 }, { name: 'Cuerda', quantity: 1 }]);
    const after = structuredClone(before);
    after.equipment.items = [{ name: 'Poción', quantity: 1, notes: '' }];
    const ev = diffEvents(before, after, { used: [['Poción', 1]] });
    expect(ev.map((e) => e.text)).toEqual(['Ya no tiene: Cuerda.']);
  });

  it('carga: peso de objetos y monedas contra FUE × 15', () => {
    const c = hero([{ name: 'Armadura', weight: 55 }, { name: 'Flechas', quantity: 20, weight: 0.05 }, { name: 'Misterio' }]);
    c.equipment.coins.gp = 100;
    const t = inventoryTotals(c);
    expect(t.weight).toBe(58);
    expect(t.capacity).toBe(180);
    expect(t.unknown).toBe(1);
    expect(t.load).toBe('normal');
    c.equipment.items[0].weight = 150;
    expect(inventoryTotals(c).load).toBe('pesada');
  });

  it('la ficha guarda los campos nuevos sólo si están puestos', () => {
    const c = hero([{ name: 'Espada', equipped: true, attuned: false, weight: '3', consumable: 'sí' }]);
    const back = parseDocument(createDocument(c)).character.equipment.items[0];
    expect(back).toEqual({ name: 'Espada', quantity: 1, notes: '', equipped: true, weight: 3 });
  });
});

describe('Mundo de la campaña', () => {
  it('normaliza misiones, PNJ y etiquetas', () => {
    const q = normalizeWorldData('mision', { summary: ' x ', quest: { status: 'rara', objectives: [{ text: 'Ir', done: true }, { text: '' }, { text: 'Volver' }] }, tags: ['a', 'a', 'b'] });
    expect(q).toEqual({ summary: 'x', details: '', tags: ['a', 'b'], quest: { status: 'activa', objectives: [{ text: 'Ir', done: true }, { text: 'Volver', done: false }], reward: '' } });
    expect(questProgress({ data: q })).toEqual({ done: 1, total: 2 });
    expect(normalizeWorldData('pnj', { attitude: 'malvado', placeId: '<x>' })).toMatchObject({ attitude: 'desconocido' });
    expect(normalizeWorldData('pnj', { placeId: 'abc123' }).placeId).toBe('abc123');
  });

  it('ordena con las misiones activas primero, busca sin acentos y relaciona', () => {
    const place = { entryId: 'lug001', kind: 'lugar', title: 'Torre', data: {} };
    const npc = { entryId: 'pnj001', kind: 'pnj', title: 'Ánika', data: { placeId: 'lug001', role: 'Guardiana' } };
    const done = { entryId: 'mis001', kind: 'mision', title: 'A', data: { quest: { status: 'completada' } } };
    const live = { entryId: 'mis002', kind: 'mision', title: 'B', data: { quest: { status: 'activa' }, giverId: 'pnj001' } };
    expect(sortWorld([npc, place, done, live]).map((e) => e.entryId)).toEqual(['mis002', 'mis001', 'lug001', 'pnj001']);
    expect(matchesQuery(npc, 'anika guardiana')).toBe(true);
    expect(matchesQuery(npc, 'dragón')).toBe(false);
    expect(relatedTo(npc, [place, npc, live]).map((e) => e.entryId)).toEqual(['lug001', 'mis002']);
  });
});
