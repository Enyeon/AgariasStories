import { describe, it, expect } from 'vitest';
import { getClass } from '../src/data/index.js';
import { createCharacter } from '../src/domain/schema.js';
import { computeSheet, classFeatures, expertiseAllowance } from '../src/domain/rules.js';
import { applyLevelUp, applyLevelDowns, planLevelUp, setRace } from '../src/domain/progression.js';
import { knownChoices, replaceChoice } from '../src/domain/class-choices.js';
import { autoChoices } from './helpers/auto-choices.js';

const ASI = { type: 'asi', increases: { fuerza: 1, constitucion: 1 } };
function ranger(n, { sub = 'cazador', wis = 14, pick = {} } = {}) {
  let c = setRace(createCharacter(), 'Humano');
  c.abilities.sabiduria = wis;
  for (let i = 0; i < n; i++) {
    const plan = planLevelUp(c, 'explorador', { subclass: sub });
    const subclass = plan.needsSubclass ? sub : null;
    const el = autoChoices(c, 'explorador', subclass);
    if (el['estilo-combate-explorador'] && pick['estilo-combate-explorador']) {
      delete el['dote-estilo-combate']; delete el['trucos-guerrero-druidico'];
      for (const k of ['estilo-combate-explorador', 'trucos-guerrero-druidico', 'dote-estilo-combate']) if (pick[k]) el[k] = { add: pick[k], remove: [] };
    }
    for (const [k, v] of Object.entries(pick)) if (el[k]) el[k] = { add: v, remove: [] };
    const res = applyLevelUp(c, { classKey: 'explorador', hpRoll: 6, subclass, improvement: plan.needsImprovement ? ASI : null, featureChoices: { elecciones: el } });
    if (res.errors.length) throw new Error(`nivel ${i + 1}: ${res.errors.join(' ')}`);
    c = res.character;
  }
  return c;
}
const sheet = (c) => computeSheet(c);
const prepared = (c) => sheet(c).spellcasting.alwaysPrepared.map((x) => x.name);
const walk = (c) => sheet(c).speeds.find((s) => s.key === 'velocidad').value;

describe('Explorador', () => {
  it('lanza con Sabiduría (antes figuraba Inteligencia), espacios desde el nivel 1, sin trucos propios', () => {
    expect(sheet(ranger(1)).spellcasting.entries[0]).toMatchObject({ ability: 'sabiduria', prepared: 2, cantrips: null, known: null });
    expect(sheet(ranger(1)).spellcasting.slots[0]).toBe(2);
    expect(sheet(ranger(20)).spellcasting.slots.slice(0, 5)).toEqual([4, 3, 3, 3, 2]);
  });

  it('Enemigo Favorito: Marca del cazador siempre preparada; maestría en 2 armas', () => {
    expect(prepared(ranger(1))).toContain('Marca del cazador');
    expect(knownChoices(ranger(1), 'explorador')['maestria-armas']).toHaveLength(2);
  });

  it('Explorador Hábil: 2 idiomas como competencia y pericias 1 (nivel 2) + 2 (nivel 9)', () => {
    const c = ranger(2, { pick: { 'idiomas-explorador': ['Élfico', 'Silvano'] } });
    expect(sheet(c).proficiencies.idiomas.map((x) => x.name)).toEqual(expect.arrayContaining(['Élfico', 'Silvano']));
    expect(expertiseAllowance(ranger(1)).total).toBe(0);
    expect(expertiseAllowance(ranger(2)).total).toBe(1);
    expect(expertiseAllowance(ranger(9)).total).toBe(3);
  });

  it('Guerrero Druídico abre 2 trucos de Druida siempre preparados', () => {
    const c = ranger(2, { pick: { 'estilo-combate-explorador': ['guerrero-druidico'], 'trucos-guerrero-druidico': ['Guía', 'Saber druídico'] } });
    expect(prepared(c)).toEqual(expect.arrayContaining(['Guía', 'Saber druídico']));
  });

  it('Errante (6): +10 de velocidad', () => {
    expect(walk(ranger(5)) + 10).toBe(walk(ranger(6)));
  });

  it('Errante Feérico: + Sab a pruebas de Carisma, habilidad elegida y conjuros por nivel', () => {
    const c = ranger(3, { sub: 'errante-feerico', wis: 16, pick: { 'glamour-habilidad': ['Persuasión'] } });
    const s = sheet(c);
    const wis = s.scores.sabiduria.modifier;
    for (const name of ['Engaño', 'Intimidación', 'Interpretación']) {
      const sk = s.skills.find((x) => x.name === name);
      expect(sk.bonus).toBe(s.scores.carisma.modifier + (sk.proficient ? s.proficiency : 0) + wis);
    }
    expect(s.skills.find((x) => x.name === 'Persuasión').proficient).toBe(true);
    expect(prepared(c)).toContain('Hechizar persona');
    expect(prepared(ranger(13, { sub: 'errante-feerico' }))).toEqual(expect.arrayContaining(['Paso brumoso', 'Invocar feérico', 'Puerta dimensional']));
    expect(knownChoices(c, 'explorador')['regalo-feerico']).toHaveLength(1);
  });

  it('Acechador: + Sabiduría a la iniciativa, conjuros por nivel y Mente de Hierro (7)', () => {
    const base = sheet(ranger(2, { wis: 16 }));
    const s = sheet(ranger(3, { sub: 'acechador-penumbra', wis: 16 }));
    expect(s.initiative - base.initiative).toBe(s.scores.sabiduria.modifier);
    expect(prepared(ranger(17, { sub: 'acechador-penumbra' }))).toEqual(expect.arrayContaining(['Disfrazarse', 'Truco de la cuerda', 'Miedo', 'Invisibilidad mejorada', 'Apariencia']));
    const saves = (c) => sheet(c).saves.filter((x) => x.proficient).map((x) => x.ability).sort();
    expect(saves(ranger(6, { sub: 'acechador-penumbra' }))).toEqual(['destreza', 'fuerza']);
    expect(saves(ranger(7, { sub: 'acechador-penumbra' }))).toEqual(['destreza', 'fuerza', 'sabiduria']);
    expect(classFeatures(ranger(3, { sub: 'acechador-penumbra' }))[0].subclass.pending).toBe(false);
  });

  it('Cazador y Maestro de Bestias: elecciones cambiables tras descanso', () => {
    const c = ranger(7, { sub: 'cazador', pick: { 'presa-cazador': ['asesino-colosos'] } });
    expect(knownChoices(c, 'explorador')).toMatchObject({ 'presa-cazador': ['asesino-colosos'] });
    expect(knownChoices(c, 'explorador')['tacticas-defensivas']).toHaveLength(1);
    expect(knownChoices(replaceChoice(c, 'explorador', 'presa-cazador', 'asesino-colosos', 'rompehuespedes').character, 'explorador')['presa-cazador']).toEqual(['rompehuespedes']);
    const b = ranger(3, { sub: 'senor-bestias', pick: { 'bestia-primigenia': ['cielo'] } });
    expect(knownChoices(replaceChoice(b, 'explorador', 'bestia-primigenia', 'cielo', 'mar').character, 'explorador')['bestia-primigenia']).toEqual(['mar']);
  });

  it('conserva las claves guardadas y añade Errante Feérico y Acechador', () => {
    expect(Object.keys(getClass('explorador').niveles['3'].subClase)).toEqual(['senor-bestias', 'errante-feerico', 'acechador-penumbra', 'cazador']);
    for (const sub of ['senor-bestias', 'errante-feerico', 'acechador-penumbra', 'cazador']) {
      const f = classFeatures(ranger(20, { sub }))[0];
      for (const lv of [3, 7, 11, 15]) expect(f.levels[lv - 1].subFeatures.length).toBeGreaterThan(0);
    }
    expect(applyLevelDowns(ranger(6), 2).levels).toHaveLength(2);
  });
});
