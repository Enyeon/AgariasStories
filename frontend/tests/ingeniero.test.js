import { describe, it, expect } from 'vitest';
import { getClass } from '../src/data/index.js';
import { createCharacter } from '../src/domain/schema.js';
import { computeSheet } from '../src/domain/rules.js';
import { applyLevelUp, applyLevelDowns, planLevelUp, setRace } from '../src/domain/progression.js';
import { knownChoices, choiceOptions, classChoiceStatus } from '../src/domain/class-choices.js';
import { autoChoices } from './helpers/auto-choices.js';

const ASI = { type: 'asi', increases: { inteligencia: 1, constitucion: 1 } };
function ing(n, sub = 'mecha-batalla', pick = {}) {
  let c = setRace(createCharacter(), 'Humano');
  for (let i = 0; i < n; i++) {
    const plan = planLevelUp(c, 'ingeniero', { subclass: sub });
    const subclass = plan.needsSubclass ? sub : null;
    const el = autoChoices(c, 'ingeniero', subclass);
    for (const [k, v] of Object.entries(pick)) if (el[k] && i + 1 === v.nivel) el[k] = { add: v.add, remove: [] };
    const res = applyLevelUp(c, {
      classKey: 'ingeniero', hpRoll: 5, subclass, improvement: plan.needsImprovement ? ASI : null,
      featureChoices: { elecciones: el, ...(plan.featureChoice ? { statAmount: ['constitucion'] } : {}) },
    });
    if (res.errors.length) throw new Error(`nivel ${i + 1}: ${res.errors.join(' ')}`);
    c = res.character;
  }
  return c;
}
const sheet = (c) => computeSheet(c);

describe('Ingeniero', () => {
  it('no es lanzador: d8, salvaciones de Con e Int, herramientas y CD de artefacto', () => {
    const s = sheet(ing(1));
    expect(s.hp.perLevel[0].die).toBe(8);
    expect(s.spellcasting.isCaster).toBe(false);
    expect(s.proficiencies.herramientas.map((h) => h.name)).toEqual(expect.arrayContaining(['Herramientas de hojalatero', 'Herramientas de herrero']));
    expect(getClass('ingeniero').conjurador).toBe(false);
  });

  it('esquemas conocidos según la tabla y por complejidad', () => {
    expect([1, 2, 3, 9, 20].map((n) => knownChoices(ing(n), 'ingeniero').esquemas.length)).toEqual([2, 3, 6, 14, 22]);
    const def = getClass('ingeniero').listasDeEleccion.esquemas;
    const opts = (nivel) => choiceOptions(def, { known: [], nivel });
    expect(opts(1).find((o) => o.value === 'gancho-propulsado').blocked).toBe(true);
    expect(opts(3).find((o) => o.value === 'gancho-propulsado').blocked).toBe(false);
    expect(opts(10).find((o) => o.value === 'canon-de-rayos').blocked).toBe(true);
    expect(opts(11).find((o) => o.value === 'canon-de-rayos').blocked).toBe(false);
  });

  it('dispositivo característico a nivel 2; el Artilugio elige uno más a los niveles 3 y 14', () => {
    expect(knownChoices(ing(1), 'ingeniero')['dispositivo-caracteristico']).toBeUndefined();
    expect(knownChoices(ing(2), 'ingeniero')['dispositivo-caracteristico']).toHaveLength(1);
    expect(knownChoices(ing(14, 'mecha-batalla'), 'ingeniero')['dispositivo-caracteristico']).toHaveLength(1);
    expect(knownChoices(ing(14, 'artilugio'), 'ingeniero')['dispositivo-caracteristico']).toHaveLength(3);
    expect(knownChoices(ing(14, 'artilugio'), 'ingeniero').esquemas).toHaveLength(17 + 5);
    expect(classChoiceStatus(ing(20, 'artilugio'), 'ingeniero').missing).toEqual([]);
  });

  it('efectos: esquemas con bonos, pericias, Enciclopedia andante sólo en Inteligencia', () => {
    const c = ing(3, 'mecha-batalla', { esquemas: { nivel: 1, add: ['lentes-de-aumento', 'suelas-silenciosas'] } });
    const skill = (s, n) => s.skills.find((x) => x.name === n);
    const s3 = sheet(c);
    expect(skill(s3, 'Sigilo').bonus - s3.scores.destreza.modifier).toBe(1);
    expect(s3.proficiencies.armaduras.map((x) => x.name)).toContain('Armadura pesada');
    const s11 = sheet(ing(11));
    // Mitad de competencia (+2 a nivel 11) en Inteligencia sin competencia, no en Sabiduría.
    const half = Math.floor(s11.proficiency / 2);
    expect(skill(s11, 'Naturaleza')).toMatchObject({ halfProficiency: true, bonus: s11.scores.inteligencia.modifier + half });
    expect(skill(s11, 'Supervivencia').halfProficiency).toBe(false);
    expect(sheet(ing(10)).skills.some((x) => x.halfProficiency)).toBe(false);
  });

  it('subclases: Tecnoteurgia (resistencia a fuerza) y Autómata (compañero)', () => {
    expect(sheet(ing(10, 'tecnoteurgia')).defenses.resistencia.map((r) => r.value)).toContain('fuerza');
    expect(sheet(ing(9, 'tecnoteurgia')).defenses.resistencia.map((r) => r.value)).not.toContain('fuerza');
    expect(Object.keys(getClass('ingeniero').niveles['3'].subClase)).toEqual(['mecha-batalla', 'artilugio', 'tecnoteurgia', 'automata']);
  });

  it('sube de 1 a 20 (Int 22 de máximo) y vuelve a bajar', () => {
    const c = ing(20);
    expect(sheet(c).scores.inteligencia.cap).toBe(22);
    const down = applyLevelDowns(c, 1);
    expect(down.levels).toHaveLength(1);
  });
});
