import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { getClass } from '../src/data/index.js';
import { createCharacter } from '../src/domain/schema.js';
import { computeSheet, classFeatures, expertiseAllowance } from '../src/domain/rules.js';
import { applyLevelUp, applyLevelDowns, planLevelUp, setRace } from '../src/domain/progression.js';
import { knownChoices, choiceOptions } from '../src/domain/class-choices.js';
import { autoChoices } from './helpers/auto-choices.js';

const SPELLS = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../src/data/spells.json'), 'utf8'));
const lvl = (n) => Number(SPELLS[n].nivel === 'Truco' ? 0 : SPELLS[n].nivel);
const ASI = { type: 'asi', increases: { fuerza: 1, constitucion: 1 } };
function wizard(n, sub = 'evocacion') {
  let c = setRace(createCharacter(), 'Humano');
  for (let i = 0; i < n; i++) {
    const plan = planLevelUp(c, 'mago', { subclass: sub });
    const subclass = plan.needsSubclass ? sub : null;
    const res = applyLevelUp(c, { classKey: 'mago', hpRoll: 4, subclass, improvement: plan.needsImprovement ? ASI : null, featureChoices: { elecciones: autoChoices(c, 'mago', subclass) } });
    if (res.errors.length) throw new Error(`nivel ${i + 1}: ${res.errors.join(' ')}`);
    c = res.character;
  }
  return c;
}
const sheet = (c) => computeSheet(c);
const book = (c) => knownChoices(c, 'mago')['libro-conjuros'] ?? [];

describe('Mago', () => {
  it('tabla 2024: trucos y preparados (25 al nivel 20)', () => {
    expect(sheet(wizard(1)).spellcasting.entries[0]).toMatchObject({ ability: 'inteligencia', cantrips: 3, prepared: 4 });
    expect(sheet(wizard(20)).spellcasting.entries[0]).toMatchObject({ cantrips: 5, prepared: 25 });
  });

  it('libro de conjuros: 6 de nivel 1 y luego 2 por nivel, del nivel de tus espacios; forman el grimorio', () => {
    const c1 = wizard(1);
    expect(book(c1)).toHaveLength(6);
    expect(book(c1).every((n) => lvl(n) === 1 && SPELLS[n].conjuradorTrue.mago)).toBe(true);
    expect(sheet(c1).spellcasting.bookSpells).toEqual(book(c1));
    expect(book(wizard(5))).toHaveLength(14);
    expect(planLevelUp(wizard(4), 'mago').choices.find((g) => g.lista === 'libro-conjuros')).toMatchObject({ cantidad: 2, nivelMax: 3 });
    expect(book(applyLevelDowns(wizard(5), 2))).toHaveLength(8);
  });

  it('Erudito: una pericia en el nivel 2', () => {
    expect(expertiseAllowance(wizard(1)).total).toBe(0);
    expect(expertiseAllowance(wizard(2)).total).toBe(1);
  });

  it('subclase al nivel 3: Experto en la escuela (2 + 1 por cada nuevo nivel de espacios), filtrado por escuela', () => {
    expect(planLevelUp(wizard(2), 'mago').needsSubclass).toBe(true);
    const def = getClass('mago').niveles['3'].subClase.evocacion.listasDeEleccion['experto-evocacion'];
    const opts = choiceOptions(def, { spells: SPELLS, nivelMax: 2 });
    expect(opts.length).toBeGreaterThan(3);
    expect(opts.every((o) => /evoc/i.test(SPELLS[o.value].escuela) && lvl(o.value) <= 2)).toBe(true);
    const k = (n) => knownChoices(wizard(n), 'mago')['experto-evocacion'] ?? [];
    expect([3, 4, 5, 9, 17].map((n) => k(n).length)).toEqual([2, 2, 3, 5, 9]);
    const c17 = wizard(17);
    expect(sheet(c17).spellcasting.bookSpells).toEqual(expect.arrayContaining(k(17)));
  });

  it('Maestría en Conjuros (18) y Conjuros Característicos (20): siempre preparados', () => {
    const c = wizard(20);
    const kc = knownChoices(c, 'mago');
    expect(lvl(kc['maestria-1'][0])).toBe(1);
    expect(lvl(kc['maestria-2'][0])).toBe(2);
    expect(kc['conjuros-firma'].map(lvl)).toEqual([3, 3]);
    const ap = sheet(c).spellcasting.alwaysPrepared.map((x) => x.name);
    expect(ap).toEqual(expect.arrayContaining([...kc['maestria-1'], ...kc['maestria-2'], ...kc['conjuros-firma']]));
  });

  it('subclases: Rompehechizos, Ilusiones Mejoradas y Criaturas Fantasmales', () => {
    const ap = (c) => sheet(c).spellcasting.alwaysPrepared.map((x) => x.name);
    expect(ap(wizard(10, 'abjuracion'))).toEqual(expect.arrayContaining(['Contraconjuro', 'Disipar magia']));
    expect(ap(wizard(6, 'ilusion'))).toEqual(expect.arrayContaining(['Ilusión menor', 'Invocar bestia', 'Invocar feérico']));
    for (const sub of ['abjuracion', 'adivinacion', 'evocacion', 'ilusion']) {
      const f = classFeatures(wizard(14, sub))[0];
      for (const l of [3, 6, 10, 14]) expect(f.levels[l - 1].subFeatures.length).toBeGreaterThan(0);
    }
  });
});
