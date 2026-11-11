import { describe, it, expect } from 'vitest';
import { getClass } from '../src/data/index.js';
import { createCharacter } from '../src/domain/schema.js';
import { computeSheet, classFeatures } from '../src/domain/rules.js';
import { applyLevelUp, applyLevelDowns, planLevelUp, setRace } from '../src/domain/progression.js';
import { knownChoices, replaceChoice } from '../src/domain/class-choices.js';
import { autoChoices } from './helpers/auto-choices.js';

const ASI = { type: 'asi', increases: { sabiduria: 2 } };
function druid(n, { sub = 'luna', orden = 'guardian', terreno = 'arido' } = {}) {
  let c = setRace(createCharacter(), 'Humano');
  for (let i = 0; i < n; i++) {
    const plan = planLevelUp(c, 'druida', { subclass: sub });
    const subclass = plan.needsSubclass ? sub : null;
    const el = autoChoices(c, 'druida', subclass);
    if (el['orden-primal']) el['orden-primal'].add = [orden];
    if (el['terreno-circulo']) el['terreno-circulo'].add = [terreno];
    const res = applyLevelUp(c, { classKey: 'druida', hpRoll: 5, subclass, improvement: plan.needsImprovement ? ASI : null, featureChoices: { elecciones: el } });
    if (res.errors.length) throw new Error(res.errors.join(' '));
    c = res.character;
  }
  return c;
}
const sheet = (c) => computeSheet(c);
const prepared = (c) => sheet(c).spellcasting.alwaysPrepared.map((x) => x.name);
const resist = (c) => sheet(c).defenses.resistencia.map((r) => r.value);

describe('Druida', () => {
  it('lanza con Sabiduría (antes figuraba Inteligencia) y usa la tabla 2024', () => {
    expect(sheet(druid(1)).spellcasting.entries[0]).toMatchObject({ ability: 'sabiduria', cantrips: 2, prepared: 4 });
    expect(sheet(druid(10)).spellcasting.entries[0]).toMatchObject({ cantrips: 4, prepared: 15 });
  });

  it('Druídico: idioma y Hablar con los animales siempre preparado', () => {
    const s = sheet(druid(1));
    expect(s.proficiencies.idiomas.map((x) => x.name)).toContain('Druídico');
    expect(prepared(druid(1))).toContain('Hablar con los animales');
    expect(s.proficiencies.herramientas.map((x) => x.name)).toContain('Kit de herbalismo');
  });

  it('Orden Primal: Mago (truco extra, + Sab a Arcano y Naturaleza) o Guardián (marciales, armadura media)', () => {
    const m = sheet(druid(1, { orden: 'mago' }));
    expect(m.spellcasting.entries[0].cantrips).toBe(3);
    const nat = m.skills.find((x) => x.name === 'Naturaleza');
    expect(nat.bonus).toBe(m.scores.inteligencia.modifier + (nat.proficient ? m.proficiency : 0) + Math.max(1, m.scores.sabiduria.modifier));
    const g = sheet(druid(1, { orden: 'guardian' }));
    expect(g.proficiencies.armas.map((x) => x.name)).toContain('Armas marciales');
    expect(g.proficiencies.armaduras.map((x) => x.name)).toContain('Armadura media');
  });

  it('Formas conocidas: 4 → 6 → 8, cambiables tras un descanso largo', () => {
    expect(knownChoices(druid(2), 'druida')['formas-conocidas']).toHaveLength(4);
    expect(knownChoices(druid(4), 'druida')['formas-conocidas']).toHaveLength(6);
    const c8 = druid(8);
    const formas = knownChoices(c8, 'druida')['formas-conocidas'];
    expect(formas).toHaveLength(8);
    const res = replaceChoice(c8, 'druida', 'formas-conocidas', formas[0], 'Águila');
    expect(res.errors).toEqual([]);
    expect(knownChoices(res.character, 'druida')['formas-conocidas']).toContain('Águila');
  });

  it('el círculo se elige al nivel 3 y conserva las claves guardadas', () => {
    expect(planLevelUp(druid(1), 'druida').needsSubclass).toBe(false);
    expect(planLevelUp(druid(2), 'druida').needsSubclass).toBe(true);
    expect(Object.keys(getClass('druida').niveles['3'].subClase)).toEqual(['tierra', 'luna', 'mar', 'estrellas']);
  });

  it('Círculo de la Tierra: el terreno da conjuros por nivel y la resistencia desde el 10; se puede cambiar', () => {
    expect(prepared(druid(3, { sub: 'tierra', terreno: 'arido' }))).toEqual(expect.arrayContaining(['Contorno borroso', 'Manos ardientes', 'Descarga de Fuego']));
    expect(prepared(druid(3, { sub: 'tierra' }))).not.toContain('Bola de Fuego');
    const c10 = druid(10, { sub: 'tierra', terreno: 'arido' });
    expect(prepared(c10)).toEqual(expect.arrayContaining(['Bola de Fuego', 'Marchitar', 'Muro de piedra']));
    expect(resist(c10)).toEqual(['fuego']);
    expect(sheet(c10).defenses.inmunidad_condicion.map((x) => x.value)).toEqual(['Envenenado']);
    expect(resist(druid(9, { sub: 'tierra' }))).toEqual([]);
    // Cambio de terreno tras un descanso largo: cambian conjuros y resistencia.
    const polar = replaceChoice(c10, 'druida', 'terreno-circulo', 'arido', 'polar').character;
    expect(resist(polar)).toEqual(['frio']);
    expect(prepared(polar)).toEqual(expect.arrayContaining(['Inmovilizar persona', 'Cono de frío']));
    expect(prepared(polar)).not.toContain('Bola de Fuego');
    // Bajar a 6 quita lo de los niveles 7+.
    expect(prepared(applyLevelDowns(c10, 6))).not.toContain('Marchitar');
  });

  it('Luna, Mar y Estrellas: conjuros siempre preparados', () => {
    expect(prepared(druid(9, { sub: 'luna' }))).toEqual(expect.arrayContaining(['Curar heridas', 'Rayo de luna', 'Conjurar animales', 'Curar heridas en masa']));
    expect(prepared(druid(9, { sub: 'mar' }))).toEqual(expect.arrayContaining(['Ola atronadora', 'Ráfaga de viento', 'Relámpago', 'Inmovilizar monstruo']));
    expect(prepared(druid(3, { sub: 'estrellas' }))).toEqual(expect.arrayContaining(['Guía', 'Saeta guiada']));
  });

  for (const sub of ['tierra', 'luna', 'mar', 'estrellas']) {
    it(`sube a 20 con el ${sub}`, () => {
      const f = classFeatures(druid(20, { sub }))[0];
      expect(f.subclass.key).toBe(sub);
      for (const lv of [3, 6, 10, 14]) expect(f.levels[lv - 1].subFeatures.length).toBeGreaterThan(0);
      expect(f.table.columns).toEqual(['Forma Salvaje', 'Trucos', 'Conjuros preparados', 'Espacios (nv. 1.º–9.º)']);
    });
  }
});
