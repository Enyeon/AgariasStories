import { describe, it, expect } from 'vitest';
import { getClass } from '../src/data/index.js';
import { createCharacter } from '../src/domain/schema.js';
import { computeSheet, classFeatures } from '../src/domain/rules.js';
import { applyLevelUp, applyLevelDowns, planLevelUp, setRace } from '../src/domain/progression.js';
import { knownChoices } from '../src/domain/class-choices.js';
import { autoChoices } from './helpers/auto-choices.js';

const ASI = { type: 'asi', increases: { fuerza: 1, constitucion: 1 } };
function levelUp(c, classKey, sub, pick = {}) {
  const plan = planLevelUp(c, classKey, { subclass: sub });
  const subclass = plan.needsSubclass ? sub : null;
  const el = autoChoices(c, classKey, subclass);
  for (const [k, v] of Object.entries(pick)) if (el[k]) el[k] = { add: v, remove: [] };
  const res = applyLevelUp(c, { classKey, hpRoll: 4, subclass, improvement: plan.needsImprovement ? ASI : null, featureChoices: { elecciones: el } });
  if (res.errors.length) throw new Error(res.errors.join(' '));
  return res.character;
}
function sorc(n, sub = 'draconico', pick = {}) {
  let c = setRace(createCharacter(), 'Humano');
  for (let i = 0; i < n; i++) c = levelUp(c, 'hechicero', sub, pick);
  return c;
}
const sheet = (c) => computeSheet(c);
const prepared = (c) => sheet(c).spellcasting.alwaysPrepared.map((x) => x.name);

describe('Hechicero', () => {
  it('tabla 2024: trucos y conjuros preparados (antes eran conocidos)', () => {
    expect(sheet(sorc(1)).spellcasting.entries[0]).toMatchObject({ ability: 'carisma', cantrips: 4, prepared: 2, known: null });
    expect(sheet(sorc(10)).spellcasting.entries[0]).toMatchObject({ cantrips: 6, prepared: 15 });
  });

  it('Metamagia: 2 en el nivel 2, +2 en el 10 y +2 en el 17; cambiable al subir', () => {
    expect(planLevelUp(sorc(1), 'hechicero').choices.map((g) => [g.lista, g.cantidad])).toEqual([['metamagia', 2]]);
    expect(knownChoices(sorc(9), 'hechicero').metamagia).toHaveLength(2);
    expect(knownChoices(sorc(10), 'hechicero').metamagia).toHaveLength(4);
    expect(knownChoices(sorc(17), 'hechicero').metamagia).toHaveLength(6);
    expect(planLevelUp(sorc(3), 'hechicero').choices.find((g) => g.lista === 'metamagia')).toMatchObject({ cantidad: 0, reemplazar: 1 });
  });

  it('la subclase se elige al nivel 3 y conserva las claves guardadas', () => {
    expect(planLevelUp(sorc(1), 'hechicero').needsSubclass).toBe(false);
    expect(planLevelUp(sorc(2), 'hechicero').needsSubclass).toBe(true);
    expect(Object.keys(getClass('hechicero').niveles['3'].subClase)).toEqual(['aberrante', 'relojeria', 'draconico', 'magia-salvaje']);
  });

  it('Resiliencia Dracónica: PG = nivel de Hechicero (también en multiclase) y CA 10 + DES + CAR', () => {
    expect(sheet(sorc(2)).hp.flatBonus).toBe(0);
    expect(sheet(sorc(3)).hp.flatBonus).toBe(3);
    expect(sheet(sorc(8)).hp.flatBonus).toBe(8);
    const multi = levelUp(sorc(3), 'guerrero', null);
    expect(sheet(multi).hp.flatBonus).toBe(3); // el nivel de Guerrero no cuenta
    const s = sheet(sorc(3));
    expect(s.unarmoredDefense[0]).toMatchObject({ atributos: ['destreza', 'carisma'], value: 10 + s.scores.destreza.modifier + s.scores.carisma.modifier });
    expect(sheet(applyLevelDowns(sorc(5), 2)).hp.flatBonus).toBe(0);
  });

  it('Afinidad Elemental (6) da la resistencia elegida', () => {
    const c = sorc(6, 'draconico', { 'afinidad-elemental': ['relampago'] });
    expect(sheet(c).defenses.resistencia.map((r) => r.value)).toEqual(['relampago']);
    expect(sheet(sorc(5)).defenses.resistencia).toEqual([]);
  });

  it('conjuros de subclase siempre preparados y Defensas Psíquicas', () => {
    expect(prepared(sorc(9, 'aberrante'))).toEqual(expect.arrayContaining(['Calmar emociones', 'Detectar pensamientos', 'Tentáculos negros de Evard', 'Telequinesis']));
    expect(prepared(sorc(9, 'relojeria'))).toEqual(expect.arrayContaining(['Auxilio', 'Disipar magia', 'Invocar autómata', 'Muro de fuerza']));
    expect(prepared(sorc(5, 'draconico'))).toEqual(expect.arrayContaining(['Orden imperiosa', 'Volar']));
    expect(sheet(sorc(6, 'aberrante')).defenses.resistencia.map((r) => r.value)).toEqual(['psiquico']);
  });

  for (const sub of ['aberrante', 'relojeria', 'draconico', 'magia-salvaje']) {
    it(`sube a 20 con ${sub}`, () => {
      const f = classFeatures(sorc(20, sub))[0];
      expect(f.subclass.key).toBe(sub);
      for (const lv of [3, 6, 14, 18]) expect(f.levels[lv - 1].subFeatures.length).toBeGreaterThan(0);
      expect(f.table.columns).toEqual(['Puntos de Hechicería', 'Trucos', 'Conjuros preparados', 'Espacios (nv. 1.º–9.º)']);
    });
  }
});
