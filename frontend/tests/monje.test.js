import { describe, it, expect } from 'vitest';
import { getClass } from '../src/data/index.js';
import { createCharacter } from '../src/domain/schema.js';
import { computeSheet, classFeatures } from '../src/domain/rules.js';
import { applyLevelUp, applyLevelDowns, planLevelUp, setRace } from '../src/domain/progression.js';
import { autoChoices } from './helpers/auto-choices.js';

/** Sube un Monje humano (DES y SAB base 10 → +1 racial del humano) hasta `n`. */
function monk(n, sub = 'misericordia') {
  let c = setRace(createCharacter(), 'Humano');
  for (let i = 0; i < n; i++) {
    const plan = planLevelUp(c, 'monje', { subclass: sub });
    const subclass = plan.needsSubclass ? sub : null;
    const res = applyLevelUp(c, {
      classKey: 'monje', hpRoll: 5, subclass,
      improvement: plan.needsImprovement ? { type: 'asi', increases: { destreza: 1, sabiduria: 1 } } : null,
      featureChoices: { elecciones: i === 0 ? { 'herramienta-monje': { add: ['Flauta'] } } : autoChoices(c, 'monje', subclass) },
    });
    if (res.errors.length) throw new Error(`nivel ${i + 1}: ${res.errors.join(' ')}`);
    c = res.character;
  }
  return c;
}
const walk = (c) => computeSheet(c).speeds.find((s) => s.key === 'velocidad').value;

describe('Monje', () => {
  it('conserva las subclases que ya guardan los personajes y añade Misericordia', () => {
    expect(Object.keys(getClass('monje').niveles['3'].subClase)).toEqual(['misericordia', 'sombra', 'cuatro-elementos', 'mano-abierta', 'senda5']);
  });

  it('nivel 1: pide la herramienta (artesano o instrumento) y la da como competencia', () => {
    const plan = planLevelUp(setRace(createCharacter(), 'Humano'), 'monje');
    expect(plan.choices.map((g) => [g.lista, g.cantidad])).toEqual([['herramienta-monje', 1]]);
    const s = computeSheet(monk(1));
    expect(s.proficiencies.herramientas.map((h) => h.name)).toEqual(['Flauta']);
    expect(s.proficiencies.armas.map((a) => a.name)).toContain('Armas marciales con la propiedad Ligera');
  });

  it('Defensa sin Armadura: 10 + DES + SAB (sin escudo)', () => {
    const s = computeSheet(monk(1));
    expect(s.unarmoredDefense).toEqual([expect.objectContaining({ label: 'Defensa sin Armadura', escudo: false,
      value: 10 + s.scores.destreza.modifier + s.scores.sabiduria.modifier })]);
  });

  it('Movimiento sin Armadura sigue la tabla y se deshace al bajar de nivel', () => {
    expect(walk(monk(1))).toBe(30);
    expect(walk(monk(2))).toBe(40);
    expect(walk(monk(6))).toBe(45);
    expect(walk(monk(10))).toBe(50);
    expect(walk(monk(14))).toBe(55);
    const c18 = monk(18);
    expect(walk(c18)).toBe(60);
    expect(walk(applyLevelDowns(c18, 5))).toBe(40);
  });

  it('Superviviente Disciplinado (14): competencia en todas las salvaciones', () => {
    const prof = (c) => computeSheet(c).saves.filter((x) => x.proficient).map((x) => x.ability).sort();
    expect(prof(monk(13))).toEqual(['destreza', 'fuerza']);
    expect(prof(monk(14))).toEqual(['carisma', 'constitucion', 'destreza', 'fuerza', 'inteligencia', 'sabiduria']);
  });

  it('Cuerpo y Mente (20): +4 a DES y SAB con máximo 25; tabla y CD de Enfoque', () => {
    const c19 = monk(19);
    const c20 = monk(20);
    const s19 = computeSheet(c19).scores;
    const s20 = computeSheet(c20).scores;
    expect(s20.destreza.total).toBe(Math.min(25, s19.destreza.total + 4));
    expect(s20.sabiduria.cap).toBe(25);
    const f = classFeatures(c20)[0];
    expect(f.table.columns).toEqual(['Artes Marciales', 'Puntos de Enfoque', 'Movimiento sin Armadura']);
    expect(f.table.rows[19]).toMatchObject({ 'Artes Marciales': '1d12', 'Puntos de Enfoque': '20', 'Movimiento sin Armadura': '+30 pies' });
    expect(f.classDc.name).toBe('CD de Enfoque');
    expect(c20.levels.filter((l) => l.improvement).length).toBe(4); // 4, 8, 12, 16 (19 es Hito Épico)
  });

  for (const sub of ['misericordia', 'sombra', 'cuatro-elementos', 'mano-abierta', 'senda5']) {
    it(`sube a 20 como ${sub} con sus rasgos de subclase`, () => {
      const f = classFeatures(monk(20, sub))[0];
      expect(f.subclass.key).toBe(sub);
      for (const lv of [3, 6, 11, 17]) expect(f.levels[lv - 1].subFeatures.length).toBeGreaterThan(0);
    });
  }

  it('Misericordia da Perspicacia, Medicina y el kit de herbalismo; el Borracho, inmunidad a Envenenado (11)', () => {
    const s = computeSheet(monk(3, 'misericordia'));
    expect(['Perspicacia', 'Medicina'].every((n) => s.skills.find((x) => x.name === n).proficient)).toBe(true);
    expect(s.proficiencies.herramientas.map((h) => h.name)).toContain('Kit de herbalismo');
    expect(computeSheet(monk(10, 'senda5')).defenses.inmunidad_condicion).toEqual([]);
    expect(computeSheet(monk(11, 'senda5')).defenses.inmunidad_condicion.map((x) => x.value)).toEqual(['Envenenado']);
  });
});
