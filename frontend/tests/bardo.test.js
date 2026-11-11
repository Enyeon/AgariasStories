import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { getClass } from '../src/data/index.js';
import { createCharacter } from '../src/domain/schema.js';
import { computeSheet, classFeatures, expertiseAllowance } from '../src/domain/rules.js';
import { applyLevelUp, applyLevelDowns, planLevelUp, setRace } from '../src/domain/progression.js';
import { knownChoices, choiceOptions } from '../src/domain/class-choices.js';
import { filterSpells } from '../src/views/sheet/spells.js';
import { setClassSkills } from '../src/domain/proficiencies.js';
import { autoChoices } from './helpers/auto-choices.js';

const SPELLS = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../src/data/spells.json'), 'utf8'));
const ASI = { type: 'asi', increases: { carisma: 2 } };

function levelUp(c, classKey, sub, elecciones) {
  const plan = planLevelUp(c, classKey, { subclass: sub });
  const subclass = plan.needsSubclass ? sub : null;
  const res = applyLevelUp(c, { classKey, hpRoll: 5, subclass, improvement: plan.needsImprovement ? ASI : null,
    featureChoices: { elecciones: elecciones ?? autoChoices(c, classKey, subclass) } });
  if (res.errors.length) throw new Error(res.errors.join(' '));
  return res.character;
}
function bard(n, sub = 'valor') {
  let c = setRace(createCharacter(), 'Humano');
  for (let i = 0; i < n; i++) c = levelUp(c, 'bardo', sub);
  return c;
}
const entry = (c) => computeSheet(c).spellcasting.entries.find((e) => e.classKey === 'bardo');

describe('Bardo', () => {
  it('conserva las subclases que ya guardan los personajes y añade Danza y Glamour', () => {
    expect(Object.keys(getClass('bardo').niveles['3'].subClase)).toEqual(['danza', 'glamour', 'conocimiento', 'valor']);
  });

  it('tabla de lanzamiento 2024 declarada en el JSON: trucos y conjuros preparados', () => {
    expect(entry(bard(1))).toMatchObject({ cantrips: 2, prepared: 4, known: null });
    expect(entry(bard(5))).toMatchObject({ cantrips: 3, prepared: 9 });
    expect(entry(bard(20))).toMatchObject({ cantrips: 4, prepared: 22 });
    expect(computeSheet(bard(20)).spellcasting.slots).toEqual([4, 3, 3, 3, 3, 2, 2, 1, 1]);
  });

  it('instrumentos: 3 como clase inicial, 1 como multiclase (y el Monje multiclase no elige herramienta)', () => {
    expect(planLevelUp(setRace(createCharacter(), 'Humano'), 'bardo').choices[0]).toMatchObject({ lista: 'instrumentos-bardo', cantidad: 3 });
    let f = levelUp(setRace(createCharacter(), 'Humano'), 'guerrero', null);
    expect(planLevelUp(f, 'bardo').choices.find((g) => g.lista === 'instrumentos-bardo').cantidad).toBe(1);
    expect(planLevelUp(f, 'monje').choices.find((g) => g.lista === 'herramienta-monje')).toBeUndefined();
    f = levelUp(f, 'bardo', null);
    expect(knownChoices(f, 'bardo')['instrumentos-bardo']).toHaveLength(1);
    expect(computeSheet(bard(1)).proficiencies.herramientas).toHaveLength(3);
  });

  it('Mano para Todo: mitad del bono en pruebas sin competencia e iniciativa (desde nivel 2)', () => {
    const s1 = computeSheet(bard(1));
    const s2 = computeSheet(bard(2));
    const skill = (s) => s.skills.find((x) => !x.proficient && x.name === 'Atletismo') ?? s.skills.find((x) => !x.proficient);
    expect(skill(s2).bonus - skill(s1).bonus).toBe(1); // bono +2 → mitad 1
    expect(skill(s2).halfProficiency).toBe(true);
    expect(s2.initiative - s1.initiative).toBe(1);
    const s2b = computeSheet(setClassSkills(bard(2), 'bardo', ['Persuasión', 'Historia', 'Sigilo']));
    const prof = s2b.skills.find((x) => x.name === 'Persuasión');
    expect(prof.proficient).toBe(true);
    expect(prof.halfProficiency).toBe(false);
    expect(prof.bonus).toBe(s2b.scores[prof.ability].modifier + 2); // no se suma a lo que ya tiene competencia
  });

  it('Pericia en los niveles 2 y 9', () => {
    expect(expertiseAllowance(bard(1)).total).toBe(0);
    expect(expertiseAllowance(bard(2)).total).toBe(2);
    expect(expertiseAllowance(bard(9)).total).toBe(4);
  });

  it('Secretos Mágicos (10): listas de Clérigo, Druida y Mago en la biblioteca', () => {
    expect(computeSheet(bard(9)).spellcasting.extraLists).toEqual([]);
    const sc = computeSheet(bard(10)).spellcasting;
    expect(sc.extraLists).toEqual(['clerigo', 'druida', 'mago']);
    const clericOnly = Object.entries(SPELLS).find(([, s]) => s.conjuradorTrue.clerigo && !s.conjuradorTrue.bardo)[0];
    const mine = (keys) => filterSpells(SPELLS, { query: clericOnly, onlyMine: true }, keys).map(([n]) => n);
    expect(mine(sc.classKeys)).not.toContain(clericOnly);
    expect(mine([...sc.classKeys, ...sc.extraLists])).toContain(clericOnly);
  });

  it('Glamour y Palabras de Creación: conjuros siempre preparados', () => {
    const names = (c) => computeSheet(c).spellcasting.alwaysPrepared.map((x) => x.name);
    expect(names(bard(3, 'glamour'))).toEqual(['Hechizar persona', 'Imagen múltiple']);
    expect(names(bard(6, 'glamour'))).toContain('Orden imperiosa');
    expect(names(bard(20, 'valor'))).toEqual(['Palabra de poder: curar', 'Palabra de poder: matar']);
  });

  it('Colegio de Sabiduría: 3 habilidades y 2 Descubrimientos Mágicos siempre preparados', () => {
    const c3 = bard(3, 'conocimiento');
    expect(knownChoices(c3, 'bardo')['habilidades-sabiduria']).toHaveLength(3);
    const c5 = bard(5, 'conocimiento');
    const g = planLevelUp(c5, 'bardo').choices.find((x) => x.lista === 'descubrimientos-magicos');
    expect(g).toMatchObject({ cantidad: 2, nivelMax: 3 }); // un Bardo 6 tiene espacios de nivel 3
    const opts = choiceOptions(g.def, { nivelMax: g.nivelMax, spells: SPELLS });
    expect(opts.every((o) => ['clerigo', 'druida', 'mago'].some((k) => SPELLS[o.value].conjuradorTrue[k]))).toBe(true);
    expect(opts.some((o) => SPELLS[o.value].nivel === 4)).toBe(false);
    const c6 = bard(6, 'conocimiento');
    const picked = knownChoices(c6, 'bardo')['descubrimientos-magicos'];
    expect(computeSheet(c6).spellcasting.alwaysPrepared.map((x) => x.name)).toEqual(picked);
    // Al subir a 7 se puede cambiar uno, ya con conjuros de nivel 4.
    expect(planLevelUp(c6, 'bardo').choices.find((x) => x.lista === 'descubrimientos-magicos')).toMatchObject({ cantidad: 0, reemplazar: 1, nivelMax: 4 });
    // Bajar a 5 los quita.
    expect(computeSheet(applyLevelDowns(c6, 5)).spellcasting.alwaysPrepared).toEqual([]);
  });

  it('Valor da armas marciales, armadura media y escudos; Danza, Defensa sin Armadura con Carisma', () => {
    const s = computeSheet(bard(3, 'valor'));
    expect(s.proficiencies.armas.map((x) => x.name)).toContain('Armas marciales');
    expect(s.proficiencies.armaduras.map((x) => x.name)).toEqual(expect.arrayContaining(['Armadura media', 'Escudos']));
    const d = computeSheet(bard(3, 'danza'));
    expect(d.unarmoredDefense[0]).toMatchObject({ atributos: ['destreza', 'carisma'], value: 10 + d.scores.destreza.modifier + d.scores.carisma.modifier });
  });

  for (const sub of ['danza', 'glamour', 'conocimiento', 'valor']) {
    it(`sube a 20 como ${sub}`, () => {
      const f = classFeatures(bard(20, sub))[0];
      expect(f.subclass.key).toBe(sub);
      for (const lv of [3, 6, 14]) expect(f.levels[lv - 1].subFeatures.length).toBeGreaterThan(0);
      expect(f.table.columns).toEqual(['Dado Bárdico', 'Trucos', 'Conjuros preparados', 'Espacios (nv. 1.º–9.º)']);
    });
  }
});
