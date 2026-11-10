import { describe, it, expect } from 'vitest';
import { createCharacter } from '../src/domain/schema.js';
import { computeSheet } from '../src/domain/rules.js';
import {
  applyLevelUp, applyLevelUps, applyLevelDown, applyLevelDowns, levelDownPreview, forgetSpells,
  levelNeedsDecisions, planLevelUp, setRace,
} from '../src/domain/progression.js';
import { normalizeCharacter } from '../src/domain/validation.js';
import { setClassSkills } from '../src/domain/proficiencies.js';

function choicesFor(c, classKey, n) {
  // Decisiones deterministas para cada nivel: subclase = primera opción,
  // mejora = +1 FUE / +1 CON (o +2 FUE si CON está al máximo).
  const list = [];
  let cur = c;
  for (let i = 0; i < n; i++) {
    const plan = planLevelUp(cur, classKey);
    const ch = {
      classKey,
      hpRoll: Math.floor(plan.hitDie / 2) + 1,
      subclass: plan.needsSubclass ? plan.subclassOptions[0].key : null,
      improvement: plan.needsImprovement ? { type: 'asi', increases: { fuerza: 1, constitucion: 1 } } : null,
      featureChoices: plan.featureChoice ? { statAmount: plan.featureChoice.allowed.slice(0, plan.featureChoice.count) } : {},
    };
    list.push(ch);
    const res = applyLevelUp(cur, ch);
    if (res.errors.length) throw new Error(res.errors.join(' '));
    cur = res.character;
  }
  return list;
}

const base = () => {
  const c = setRace(createCharacter(), 'Humano');
  return c;
};

describe('subida de varios niveles', () => {
  for (const classKey of ['guerrero', 'mago', 'picaro', 'shadow', 'cazador', 'barbaro']) {
    it(`3 → 8 de una vez equivale a nivel a nivel (${classKey})`, () => {
      const at3 = applyLevelUps(base(), choicesFor(base(), classKey, 3)).character;
      const choices = choicesFor(at3, classKey, 5);
      let stepwise = at3;
      for (const ch of choices) stepwise = applyLevelUp(stepwise, ch).character;
      const batch = applyLevelUps(at3, choices);
      expect(batch.errors).toEqual([]);
      expect(batch.character).toEqual(stepwise);
      expect(computeSheet(batch.character)).toEqual(computeSheet(stepwise));
      expect(batch.character.levels).toHaveLength(8);
    });
  }

  it('es atómica: si un nivel falla no cambia nada', () => {
    const c = applyLevelUps(base(), choicesFor(base(), 'guerrero', 2)).character;
    const choices = choicesFor(c, 'guerrero', 3);
    choices[0] = { ...choices[0], subclass: 'no-existe' }; // nivel 3 necesita subclase válida
    const res = applyLevelUps(c, choices);
    expect(res.errors.length).toBeGreaterThan(0);
    expect(res.failedAt).toBe(3);
    expect(res.character).toBe(c);
  });

  it('detecta los niveles con decisiones', () => {
    const c = applyLevelUps(base(), choicesFor(base(), 'guerrero', 2)).character;
    expect(levelNeedsDecisions(c, 'guerrero')).toBe(true); // nivel 3: arquetipo
    const c3 = applyLevelUps(c, choicesFor(c, 'guerrero', 1)).character;
    expect(levelNeedsDecisions(c3, 'guerrero')).toBe(true); // nivel 4: mejora
    const c4 = applyLevelUps(c3, choicesFor(c3, 'guerrero', 1)).character;
    expect(levelNeedsDecisions(c4, 'guerrero')).toBe(false);
  });

  it('bajar de nivel borra las elecciones de una clase abandonada', () => {
    let c = applyLevelUps(base(), choicesFor(base(), 'guerrero', 1)).character;
    c = applyLevelUp(c, { classKey: 'picaro', hpRoll: 5 }).character;
    c = setClassSkills(c, 'picaro', ['Sigilo']);
    expect(c.classChoices.picaro).toBeTruthy();
    c = applyLevelDown(c);
    expect(c.classChoices.picaro).toBeUndefined();
  });
});

describe('bajar varios niveles', () => {
  const build = (classKey, n) => {
    const b = setRace(createCharacter(), 'Humano');
    return applyLevelUps(b, choicesFor(b, classKey, n)).character;
  };

  for (const [classKey, from, to] of [['guerrero', 20, 10], ['mago', 10, 5], ['picaro', 5, 1], ['clerigo', 20, 1], ['barbaro', 8, 0]]) {
    it(`${from} → ${to} equivale a bajar de uno en uno (${classKey})`, () => {
      const c = build(classKey, from);
      let stepwise = c;
      for (let i = from; i > to; i--) stepwise = applyLevelDown(stepwise);
      const batch = applyLevelDowns(c, to);
      expect(batch).toEqual(stepwise);
      expect(batch.levels).toHaveLength(to);
      expect(computeSheet(batch)).toEqual(computeSheet(stepwise));
    });
  }

  it('subir 1→5→10→20 y bajar 20→10→5→1 deja el mismo personaje que subir directamente', () => {
    const b = setRace(createCharacter(), 'Humano');
    const all = choicesFor(b, 'guerrero', 20);
    const at = (n) => applyLevelUps(b, all.slice(0, n)).character;
    const at20 = applyLevelUps(applyLevelUps(applyLevelUps(at(1), all.slice(1, 5)).character, all.slice(5, 10)).character, all.slice(10, 20)).character;
    expect(at20).toEqual(at(20));
    expect(applyLevelDowns(at20, 10)).toEqual(at(10));
    expect(applyLevelDowns(applyLevelDowns(at20, 10), 5)).toEqual(at(5));
    expect(applyLevelDowns(at20, 1)).toEqual(at(1));
  });

  it('retira lo que depende del nivel y conserva lo que no', () => {
    let c = build('shadow', 8);
    c.traits.push({ id: 't1', name: 'Bendición', description: '', origin: 'bendicion', originDetail: '', ref: null, effects: [], active: true });
    c.combat.currentHp = 999;
    c = normalizeCharacter(c).character;
    const p = levelDownPreview(c, 2);
    expect(p.levels.map((l) => l.level)).toEqual([8, 7, 6, 5, 4, 3]);
    expect(p.subclasses).toHaveLength(1); // el arquetipo se elige a nivel 3
    expect(p.features.length).toBeGreaterThan(0);
    expect(p.abilities.length).toBeGreaterThan(0); // mejoras de los niveles 4 y 6/8
    const after = p.character;
    expect(after.subclasses.guerrero).toBeUndefined();
    expect(after.levels.every((l) => !l.improvement)).toBe(true);
    expect(after.traits).toHaveLength(1);
    expect(after.race.key).toBe('Humano');
    expect(after.combat.currentHp).toBe(computeSheet(after).hp.max);
  });

  it('avisa de los conjuros conocidos de un nivel que ya no se puede lanzar', () => {
    const c = { ...build('mago', 5), spells: { known: ['Bola de fuego', 'Proyectil mágico'], prepared: ['Bola de fuego'] } };
    const catalog = { 'Bola de fuego': { nivel: '3' }, 'Proyectil mágico': { nivel: '1' } };
    const p = levelDownPreview(c, 3, catalog);
    expect(p.spellsAbove).toEqual(['Bola de fuego']);
    expect(forgetSpells(p.character, p.spellsAbove).spells).toEqual({ known: ['Proyectil mágico'], prepared: [] });
  });
});
