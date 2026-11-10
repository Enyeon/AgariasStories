import { describe, it, expect, beforeEach } from 'vitest';
import { createCharacter } from '../src/domain/schema.js';
import { computeSheet } from '../src/domain/rules.js';
import { applyLevelUps, planLevelUp, applyLevelUp, setRace } from '../src/domain/progression.js';
import { addCompanion, updateCompanion, damageCompanion, creatureBlock, removeCompanion } from '../src/domain/companions.js';
import { parseDocument, normalizeCharacter } from '../src/domain/validation.js';
import { createDocument } from '../src/services/characters.js';
import { installPack, resetRegistry } from '../src/content/registry.js';

const WOLF = 'hb:mesa:criatura:lobo';

beforeEach(() => {
  resetRegistry();
  installPack({ id: 'mesa', name: 'Mesa', kind: 'campaign', items: [{ ref: WOLF, type: 'criatura', version: 1, status: 'publicado', data: { name: 'Lobo', ac: 13, hp: 11, resistances: ['frio'], actions: [{ name: 'Mordisco', text: '+4, 2d4+2' }] } }] });
});

function hunter(subclass) {
  let c = setRace(createCharacter(), 'Humano');
  for (let i = 0; i < 3; i++) {
    const plan = planLevelUp(c, 'cazador');
    c = applyLevelUp(c, { classKey: 'cazador', hpRoll: 6, subclass: plan.needsSubclass ? subclass : undefined }).character;
  }
  return c;
}

describe('criaturas y vínculos', () => {
  it('la invocación de sangre la habilita la subclase por datos', () => {
    expect(computeSheet(hunter('senda1')).bloodSummoning).toBe(true);
    expect(computeSheet(hunter('senda2')).bloodSummoning).toBe(false);
  });

  it('separa criatura (registro) y vínculo (personaje)', () => {
    let c = createCharacter();
    const res = addCompanion(c, { bond: 'mascota', name: 'Sombra', creatureRef: WOLF });
    expect(res.errors).toEqual([]);
    c = res.character;
    const comp = c.companions[0];
    expect(comp).toMatchObject({ bond: 'mascota', name: 'Sombra', creatureRef: WOLF, currentHp: null, present: true });
    const b = creatureBlock(comp, c);
    expect(b).toMatchObject({ name: 'Lobo', ac: 13, hpMax: 11, resistances: ['frio'] });
    // El mismo lobo puede ser la montura de otro personaje con otro estado.
    const other = addCompanion(createCharacter(), { bond: 'montura', creatureRef: WOLF }).character;
    expect(other.companions[0].name).toBe('Criatura');
  });

  it('daño y curación respetan PG temporales, 0 y el máximo', () => {
    let c = addCompanion(createCharacter(), { name: 'Sombra', creatureRef: WOLF }).character;
    const id = c.companions[0].id;
    const b = creatureBlock(c.companions[0], c);
    c = updateCompanion(c, id, { tempHp: 3 }).character;
    c = damageCompanion(c, id, 5, b);
    expect(c.companions[0]).toMatchObject({ currentHp: 9, tempHp: 0 });
    c = damageCompanion(c, id, 50, b);
    expect(c.companions[0].currentHp).toBe(0);
    c = damageCompanion(c, id, -100, b);
    expect(c.companions[0].currentHp).toBe(11);
  });

  it('criatura de sangre: PG según el invocador; bloque propio sin catálogo', () => {
    let c = hunter('senda1');
    c = addCompanion(c, { bond: 'invocacion', creatureRef: 'sangre:latigo_sangriento' }).character;
    const b = creatureBlock(c.companions[0], c);
    expect(b.hpMax).toBe(Math.floor(computeSheet(c).hp.max / 2));
    const own = addCompanion(createCharacter(), { name: 'Cuervo', custom: { ac: 12, hpMax: 1, text: 'Vuela.' } }).character;
    expect(creatureBlock(own.companions[0], own)).toMatchObject({ ac: 12, hpMax: 1, source: 'Bloque propio' });
  });

  it('valida condiciones, viaja con instantánea y se puede quitar', () => {
    let c = addCompanion(createCharacter(), { name: 'Sombra', creatureRef: WOLF, conditions: ['Asustado', 'Inventada'] }).character;
    expect(c.companions[0].conditions).toEqual(['Asustado']);
    const doc = JSON.parse(JSON.stringify(createDocument(c)));
    expect(doc.character.content[WOLF].data.name).toBe('Lobo');
    resetRegistry();
    const { character } = parseDocument(doc);
    expect(creatureBlock(character.companions[0], character).name).toBe('Lobo');
    expect(removeCompanion(character, character.companions[0].id).companions).toEqual([]);
    expect(normalizeCharacter({ companions: [{}] }).character.companions).toEqual([]);
  });
});
