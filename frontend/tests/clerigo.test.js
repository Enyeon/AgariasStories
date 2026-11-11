import { describe, it, expect } from 'vitest';
import { getClass } from '../src/data/index.js';
import { createCharacter } from '../src/domain/schema.js';
import { computeSheet, classFeatures } from '../src/domain/rules.js';
import { applyLevelUp, applyLevelDowns, planLevelUp, setRace } from '../src/domain/progression.js';
import { autoChoices } from './helpers/auto-choices.js';

const ASI = { type: 'asi', increases: { sabiduria: 2 } };
function cleric(n, { sub = 'vida', orden = 'protector', golpes = 'golpe-divino' } = {}) {
  let c = setRace(createCharacter(), 'Humano');
  for (let i = 0; i < n; i++) {
    const plan = planLevelUp(c, 'clerigo', { subclass: sub });
    const subclass = plan.needsSubclass ? sub : null;
    const el = autoChoices(c, 'clerigo', subclass);
    if (el['orden-divina']) el['orden-divina'].add = [orden];
    if (el['golpes-benditos']) el['golpes-benditos'].add = [golpes];
    const res = applyLevelUp(c, { classKey: 'clerigo', hpRoll: 5, subclass, improvement: plan.needsImprovement ? ASI : null, featureChoices: { elecciones: el } });
    if (res.errors.length) throw new Error(res.errors.join(' '));
    c = res.character;
  }
  return c;
}
const entry = (c) => computeSheet(c).spellcasting.entries[0];
const prepared = (c) => computeSheet(c).spellcasting.alwaysPrepared.map((x) => x.name);

describe('Clérigo', () => {
  it('lanza con Sabiduría (antes figuraba Inteligencia) y usa la tabla 2024', () => {
    const c = cleric(1);
    expect(entry(c)).toMatchObject({ ability: 'sabiduria', cantrips: 3, prepared: 4 });
    expect(entry(cleric(4))).toMatchObject({ cantrips: 4, prepared: 7 });
    expect(entry(cleric(20))).toMatchObject({ cantrips: 5, prepared: 22 });
  });

  it('el dominio se elige al nivel 3 y conserva las claves guardadas', () => {
    expect(planLevelUp(cleric(1), 'clerigo').needsSubclass).toBe(false);
    expect(planLevelUp(cleric(2), 'clerigo').needsSubclass).toBe(true);
    expect(Object.keys(getClass('clerigo').niveles['3'].subClase)).toEqual(['vida', 'luz', 'engano', 'guerra', 'conocimiento', 'naturaleza', 'tempestad']);
  });

  it('Orden Divina: Protector da armas marciales y armadura pesada', () => {
    const s = computeSheet(cleric(1, { orden: 'protector' }));
    expect(s.proficiencies.armas.map((x) => x.name)).toContain('Armas marciales');
    expect(s.proficiencies.armaduras.map((x) => x.name)).toContain('Armadura pesada');
    expect(entry(cleric(1, { orden: 'protector' })).cantrips).toBe(3);
  });

  it('Orden Divina: Taumaturgo da un truco más y + mod. de Sabiduría (mín. +1) a Arcanos y Religión', () => {
    const c = cleric(1, { orden: 'taumaturgo' });
    const s = computeSheet(c);
    expect(entry(c).cantrips).toBe(4);
    const wis = Math.max(1, s.scores.sabiduria.modifier);
    for (const name of ['Conocimiento Arcano', 'Religión']) {
      const sk = s.skills.find((x) => x.name === name);
      expect(sk.bonus).toBe(s.scores.inteligencia.modifier + (sk.proficient ? s.proficiency : 0) + wis);
    }
    // Con Sabiduría 16 el bono sube a +3.
    const c16 = structuredClone(c); c16.abilities.sabiduria = 16;
    const s16 = computeSheet(c16);
    expect(s16.skills.find((x) => x.name === 'Religión').bonus - s.skills.find((x) => x.name === 'Religión').bonus).toBe(s16.scores.sabiduria.modifier - wis);
  });

  it('Conjuros de dominio siempre preparados según el nivel (y se quitan al bajar)', () => {
    expect(prepared(cleric(3, { sub: 'vida' }))).toEqual(['Auxilio', 'Bendición', 'Curar heridas', 'Restablecimiento menor']);
    const c9 = cleric(9, { sub: 'vida' });
    expect(prepared(c9)).toHaveLength(10);
    expect(prepared(c9)).toContain('Aura de Vida'); // no está en el catálogo, se muestra igual
    expect(prepared(applyLevelDowns(c9, 6))).toHaveLength(6);
    expect(prepared(cleric(9, { sub: 'luz' }))).toEqual(expect.arrayContaining(['Fuego feérico', 'Golpe flamígero', 'Escudriñar']));
    expect(prepared(cleric(9, { sub: 'engano' }))).toEqual(expect.arrayContaining(['Hechizar persona', 'Indetectable', 'Alterar recuerdos']));
    expect(prepared(cleric(9, { sub: 'guerra' }))).toEqual(expect.arrayContaining(['Saeta guiada', 'Espíritus guardianes', 'Inmovilizar monstruo']));
  });

  it('Golpes Benditos (7) se elige y Guerra da resistencias a nivel 17', () => {
    expect(planLevelUp(cleric(6), 'clerigo').choices.map((g) => g.lista)).toEqual(['golpes-benditos']);
    expect(computeSheet(cleric(16, { sub: 'guerra' })).defenses.resistencia).toEqual([]);
    expect(computeSheet(cleric(17, { sub: 'guerra' })).defenses.resistencia.map((r) => r.value).sort()).toEqual(['contundente', 'cortante', 'perforante']);
  });

  for (const sub of ['vida', 'luz', 'engano', 'guerra']) {
    it(`sube a 20 con el ${sub}`, () => {
      const f = classFeatures(cleric(20, { sub }))[0];
      expect(f.subclass.key).toBe(sub);
      for (const lv of [3, 5, 6, 7, 9, 17]) expect(f.levels[lv - 1].subFeatures.length).toBeGreaterThan(0);
      expect(f.table.columns).toEqual(['Canalizar Divinidad', 'Trucos', 'Conjuros preparados', 'Espacios (nv. 1.º–9.º)']);
    });
  }
});
