import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createCharacter, createDocument } from '../src/domain/schema.js';
import { parseDocument } from '../src/domain/validation.js';
import { computeSheet } from '../src/domain/rules.js';
import { data } from '../src/data/index.js';
import {
  createCandy, recoverCeded, eatCandy, endCandy, drainTick, cureDrain,
} from '../src/domain/candy.js';
import {
  creatureOptions, creatureBlock, addCompanion, summonUsage, canManifest, updateCompanion,
} from '../src/domain/companions.js';

const base = () => {
  const c = createCharacter();
  c.abilities.fuerza = 14;
  c.levels = [{ classKey: 'guerrero', hpRoll: 10, improvement: null, featureChoices: {} }];
  return c;
};

describe('caramelos de atributo', () => {
  it('el creador cede 1 punto y el caramelo va al inventario (hasta su BC)', () => {
    let c = base();
    const before = computeSheet(c).scores.fuerza.total;
    c = createCandy(c, 'fuerza', { limit: 2 }).character;
    c = createCandy(c, 'fuerza', { limit: 2 }).character;
    expect(createCandy(c, 'fuerza', { limit: 2 }).error).toMatch(/Ya tienes 2/);
    expect(computeSheet(c).scores.fuerza.total).toBe(before - 2);
    expect(c.equipment.items.find((i) => i.candy === 'fuerza')).toMatchObject({ name: 'Caramelo de Fuerza', quantity: 2, consumable: true });
    c = recoverCeded(c, c.candy.ceded[0].id).character;
    expect(computeSheet(c).scores.fuerza.total).toBe(before - 1);
  });

  it('comer: +1 durante la hora; el drenaje empieza con el segundo y se triplica de golpe', () => {
    let c = base();
    c.equipment.items.push({ name: 'Caramelo de Fuerza', quantity: 4, notes: '', consumable: true, candy: 'fuerza' });
    const idx = c.equipment.items.length - 1;
    const hp = computeSheet(c).hp.max;
    let r = eatCandy(c, idx, { count: 1 });
    expect(r.drainRate).toBe(0);
    c = r.character;
    expect(computeSheet(c).scores.fuerza.total).toBe(15);
    r = eatCandy(c, idx, { count: 1, earlierToday: true });
    c = r.character;
    expect(c.candy.drain).toEqual({ rate: 1, amount: 0 });
    r = eatCandy(c, idx, { count: 2 });
    c = r.character;
    expect(c.candy.drain.rate).toBe(3);
    expect(c.equipment.items.some((i) => i.candy)).toBe(false); // se acabaron
    c = drainTick(drainTick(c).character).character;
    expect(computeSheet(c).hp).toMatchObject({ max: Math.max(1, hp - 6), drained: 6 });
    // Nunca baja de 1 (no mata).
    for (let i = 0; i < 20; i++) c = drainTick(c).character;
    expect(computeSheet(c).hp.max).toBe(1);
    c = cureDrain(c).character;
    expect(computeSheet(c).hp.max).toBe(hp);
    c = endCandy(c, c.candy.active[0].id).character;
    expect(c.candy.active).toHaveLength(3);
  });

  it('el estado y el objeto caramelo sobreviven a guardar y abrir', () => {
    let c = base();
    c = createCandy(c, 'sabiduria', { limit: 2 }).character;
    c = eatCandy(c, c.equipment.items.findIndex((i) => i.candy), { count: 1, earlierToday: true }).character;
    const back = parseDocument(JSON.parse(JSON.stringify(createDocument(c)))).character;
    expect(back.candy.ceded.map((x) => x.attr)).toEqual(['sabiduria']);
    expect(back.candy.active.map((x) => x.attr)).toEqual(['sabiduria']);
    expect(back.candy.drain).toEqual({ rate: 1, amount: 0 });
  });
});

describe('invocaciones de clase y Capacidad de Manifestación', () => {
  beforeAll(() => {
    data.classCreatures.prueba = { nombre: 'Invocaciones de prueba', criaturas: {
      golem: { name: 'Golem', ac: { base: 13, bc: true }, hp: { base: 20, porNivel: 5 }, traits: [{ name: 'Firme', text: '…' }], mejoras: [{ nivel: 5, texto: 'Más fuerte' }] },
      ruleta: { name: 'Ruleta', capacidad: false },
    } };
  });
  afterAll(() => { delete data.classCreatures.prueba; });

  it('ofrece el catálogo del grupo y calcula su bloque con el nivel del dueño', () => {
    expect(creatureOptions({ groups: ['prueba'] }).map((o) => o.ref)).toEqual(['clase:prueba:golem', 'clase:prueba:ruleta']);
    const c = base();
    const b = creatureBlock({ creatureRef: 'clase:prueba:golem', name: '' }, c);
    expect(b).toMatchObject({ name: 'Golem', ac: 15, hpMax: 25, capacity: true });
    expect(b.traits.map((t) => t.name)).toEqual(['Firme']);
    c.levels = Array.from({ length: 5 }, () => c.levels[0]);
    expect(creatureBlock({ creatureRef: 'clase:prueba:golem', name: '' }, c).traits).toHaveLength(2);
  });

  it('cuenta sólo las invocaciones fuera que ocupan capacidad', () => {
    let c = base();
    c = addCompanion(c, { bond: 'invocacion', name: 'G1', creatureRef: 'clase:prueba:golem' }).character;
    c = addCompanion(c, { bond: 'invocacion', name: 'Ruleta', creatureRef: 'clase:prueba:ruleta' }).character;
    c = addCompanion(c, { bond: 'invocacion', name: 'G2', creatureRef: 'clase:prueba:golem', present: false }).character;
    expect(summonUsage(c, 1)).toEqual({ used: 1, capacity: 1, over: false });
    const g2 = c.companions.find((x) => x.name === 'G2').id;
    expect(canManifest(c, g2, 1)).toBe(false);
    expect(canManifest(c, g2, 2)).toBe(true);
    c = updateCompanion(c, g2, { present: true }).character;
    expect(summonUsage(c, 1).over).toBe(true);
  });

  it('la ficha habilita grupos, capacidad, caramelos e Inhibición desde efectos', () => {
    const c = base();
    c.traits = [{ id: 'r1', name: 'Prueba', description: '', origin: 'dm', originDetail: '', ref: null, active: true, effects: [
      { type: 'habilita', value: 'caramelos' }, { type: 'habilita', value: 'inhibicion' }, { type: 'bono', target: 'invocaciones', value: 2 },
    ] }];
    const s = computeSheet(c);
    expect(s).toMatchObject({ candyMaker: true, inhibited: true, summonCapacity: 2 });
  });
});
