import { describe, it, expect } from 'vitest';
import { createCharacter, createDocument } from '../src/domain/schema.js';
import { parseDocument } from '../src/domain/validation.js';
import { normalizeEffect, describeEffect } from '../src/domain/effects.js';
import {
  computeResources, spendResource, shortRest, longRest, addCustomResource, removeCustomResource, normalizeResourcesState,
} from '../src/domain/resources.js';
import { hitPoints, abilityScores, computeSheet } from '../src/domain/rules.js';

const scores = { sabiduria: { modifier: 3 }, carisma: { modifier: -1 } };
const src = (effects) => [{ label: 'Rasgo', effects: effects.map(normalizeEffect) }];

describe('efecto recurso', () => {
  it('normaliza y describe', () => {
    const e = normalizeEffect({ type: 'recurso', nombre: 'Esencia Adaptativa', max: { valor: 4 }, corto: { atributo: 'sabiduria' } });
    expect(e).toEqual({ type: 'recurso', id: 'esencia-adaptativa', nombre: 'Esencia Adaptativa', max: { valor: 4 }, corto: { atributo: 'sabiduria', minimo: 1 } });
    expect(describeEffect(e)).toMatch(/Esencia Adaptativa: 4 usos; se recupera tu mod. de Sabiduría/);
    expect(normalizeEffect({ type: 'recurso', nombre: '', max: { valor: 2 } })).toBeNull();
    expect(normalizeEffect({ type: 'recurso', nombre: 'X', max: {} })).toBeNull();
  });

  it('calcula máximos (fijo, BC, atributo con mínimo) y gasta/recupera', () => {
    const c = createCharacter();
    const fx = src([
      { type: 'recurso', id: 'esencia', nombre: 'Esencia', max: { valor: 4 }, corto: { atributo: 'sabiduria' } },
      { type: 'recurso', id: 'grito', nombre: 'Grito', max: { bc: true } },
      { type: 'recurso', id: 'encanto', nombre: 'Encanto', max: { atributo: 'carisma' }, corto: 'todo' },
    ]);
    let rs = computeResources(c, fx, { scores, prof: 3, level: 5 });
    expect(rs.map((r) => [r.id, r.max])).toEqual([['esencia', 4], ['grito', 3], ['encanto', 1]]);
    spendResource(c, rs, 'esencia', 4); spendResource(c, rs, 'grito', 2); spendResource(c, rs, 'encanto', 1);
    rs = computeResources(c, fx, { scores, prof: 3, level: 5 });
    expect(rs.map((r) => r.left)).toEqual([0, 1, 0]);
    expect(spendResource(c, rs, 'esencia', 1)).toBe(false); // no baja de 0
    shortRest(c, rs);
    rs = computeResources(c, fx, { scores, prof: 3, level: 5 });
    expect(rs.map((r) => r.left)).toEqual([3, 1, 1]);
    longRest(c, rs);
    rs = computeResources(c, fx, { scores, prof: 3, level: 5 });
    expect(rs.every((r) => r.left === r.max)).toBe(true);
  });

  it('contadores propios: añadir, persistir y quitar', () => {
    const c = createCharacter();
    expect(addCustomResource(c, { nombre: 'Furia', max: 3, corto: { valor: 1 } }).id).toBe('propio-furia');
    expect(addCustomResource(c, { nombre: 'Furia', max: 3 })).toBeNull();
    let rs = computeResources(c, [], { scores, prof: 2, level: 1 });
    spendResource(c, rs, 'propio-furia', 2);
    c.combat.hpMaxReduction = 4;
    const back = parseDocument(JSON.parse(JSON.stringify(createDocument(c)))).character;
    expect(back.resources).toEqual({ used: { 'propio-furia': 2 }, custom: [{ id: 'propio-furia', nombre: 'Furia', max: 3, corto: { valor: 1 } }] });
    expect(back.combat.hpMaxReduction).toBe(4);
    expect(removeCustomResource(c, 'propio-furia')).toBe(true);
    expect(c.resources).toEqual({ used: {}, custom: [] });
  });
});

describe('PG máximos drenados', () => {
  it('reduce el máximo pero nunca por debajo de 1', () => {
    const c = createCharacter();
    c.levels = [{ classKey: 'guerrero', hpRoll: 10, improvement: null, featureChoices: {} }];
    const s = abilityScores(c);
    const full = hitPoints(c, s).max;
    c.combat.hpMaxReduction = 3;
    expect(hitPoints(c, s)).toMatchObject({ max: full - 3, full, reduction: 3 });
    c.combat.hpMaxReduction = 999;
    expect(hitPoints(c, s).max).toBe(1);
    expect(computeSheet(c).resources).toEqual([]);
  });
});

describe('recursos de clases oficiales', () => {
  const at = (classKey, n, extra = {}) => {
    const c = createCharacter();
    c.abilities.carisma = 16;
    c.levels = Array.from({ length: n }, () => ({ classKey, hpRoll: 5, improvement: null, featureChoices: {} }));
    Object.assign(c, extra);
    return computeSheet(c).resources;
  };
  it('Furia del Bárbaro sale de su tabla y recupera 1 con descanso corto', () => {
    expect(at('barbaro', 3)).toMatchObject([{ id: 'furia', max: 3, shortRegain: 1 }]);
  });
  it('Inspiración Bárdica: mod. de Carisma; desde nivel 5, todo con descanso corto', () => {
    expect(at('bardo', 1)).toMatchObject([{ id: 'inspiracion-bardica', max: 3, shortRegain: 0 }]);
    expect(at('bardo', 5)).toMatchObject([{ id: 'inspiracion-bardica', max: 3, shortRegain: 3 }]);
  });
  it('Puntos de Hechicería y de Enfoque aparecen en nivel 2', () => {
    expect(at('hechicero', 1)).toEqual([]);
    expect(at('hechicero', 2)).toMatchObject([{ id: 'puntos-de-hechiceria', max: 2 }]);
    expect(at('monje', 2)).toMatchObject([{ id: 'puntos-de-enfoque', max: 2, shortRegain: 2 }]);
  });
});
