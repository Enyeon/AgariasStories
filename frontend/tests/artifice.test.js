import { describe, it, expect } from 'vitest';
import { getClass } from '../src/data/index.js';
import { createCharacter } from '../src/domain/schema.js';
import { computeSheet, classFeatures } from '../src/domain/rules.js';
import { applyLevelUp, planLevelUp, setRace } from '../src/domain/progression.js';
import { knownChoices, choiceOptions } from '../src/domain/class-choices.js';
import { autoChoices } from './helpers/auto-choices.js';

const ASI = { type: 'asi', increases: { fuerza: 1, constitucion: 1 } };
function art(n, sub = 'armero', pick = {}) {
  let c = setRace(createCharacter(), 'Humano');
  for (let i = 0; i < n; i++) {
    const plan = planLevelUp(c, 'artifice', { subclass: sub });
    const subclass = plan.needsSubclass ? sub : null;
    const el = autoChoices(c, 'artifice', subclass);
    for (const [k, v] of Object.entries(pick)) if (el[k]) el[k] = { add: v, remove: [] };
    const res = applyLevelUp(c, { classKey: 'artifice', hpRoll: 5, subclass, improvement: plan.needsImprovement ? ASI : null, featureChoices: { elecciones: el } });
    if (res.errors.length) throw new Error(`nivel ${i + 1}: ${res.errors.join(' ')}`);
    c = res.character;
  }
  return c;
}
const sheet = (c) => computeSheet(c);
const prepared = (c) => sheet(c).spellcasting.alwaysPrepared.map((x) => x.name);

describe('Artífice', () => {
  it('d8, Inteligencia, espacios desde el nivel 1 y tabla de preparados', () => {
    const s = sheet(art(1));
    expect(s.hp.perLevel[0].die).toBe(8);
    expect(s.spellcasting.entries[0]).toMatchObject({ ability: 'inteligencia', cantrips: 2, prepared: 2 });
    expect(s.spellcasting.slots[0]).toBe(2);
    expect(sheet(art(14)).spellcasting.entries[0]).toMatchObject({ cantrips: 4, prepared: 11 });
    expect(prepared(art(1))).toContain('Reparar');
  });

  it('herramienta de artesano a elegir (no en multiclase) y planes según la tabla', () => {
    expect(sheet(art(1, 'armero', { 'herramienta-artesano': ['Herramientas de carpintero'] })).proficiencies.herramientas.map((h) => h.name))
      .toEqual(expect.arrayContaining(['Herramientas de ladrón', 'Herramientas de hojalatero', 'Herramientas de carpintero']));
    expect([2, 6, 10, 14, 18].map((n) => knownChoices(art(n, 'alquimista'), 'artifice').planes.length)).toEqual([4, 5, 6, 7, 8]);
    const def = getClass('artifice').listasDeEleccion.planes;
    const opts = choiceOptions(def, { known: [], nivel: 2 });
    expect(opts.find((o) => o.value === 'armadura-1').blocked).toBe(true);
    expect(opts.find((o) => o.value === 'bolsa-de-contencion').blocked).toBe(false);
  });

  it('subclases: competencias, conjuros siempre preparados y defensas', () => {
    const arm = sheet(art(3, 'armero'));
    expect(arm.proficiencies.armaduras.map((x) => x.name)).toContain('Armadura pesada');
    expect(prepared(art(17, 'armero'))).toEqual(expect.arrayContaining(['Ola atronadora', 'Imagen múltiple', 'Muro de fuerza']));
    expect(sheet(art(3, 'artillero')).proficiencies.armas.map((x) => x.name)).toContain('Armas marciales a distancia');
    expect(sheet(art(3, 'herrero-batalla')).proficiencies.armas.map((x) => x.name)).toContain('Armas marciales');
    const alq = sheet(art(15, 'alquimista'));
    expect(alq.defenses.resistencia.map((r) => r.value).sort()).toEqual(['acido', 'veneno']);
    expect(alq.defenses.inmunidad_condicion.map((x) => x.value)).toEqual(['Envenenado']);
    const walk = (c) => sheet(c).speeds.find((x) => x.key === 'velocidad').value;
    expect(walk(art(3, 'armero', { 'modelo-armadura': ['infiltrador'] })) - walk(art(3, 'armero', { 'modelo-armadura': ['guardian'] }))).toBe(5);
  });

  it('conserva las claves y añade Cartógrafo y Reanimador', () => {
    expect(Object.keys(getClass('artifice').niveles['3'].subClase)).toEqual(['alquimista', 'armero', 'artillero', 'herrero-batalla', 'cartografo', 'reanimador']);
    for (const sub of ['alquimista', 'armero', 'artillero', 'herrero-batalla', 'cartografo', 'reanimador']) {
      const f = classFeatures(art(15, sub))[0];
      for (const l of [3, 5, 9, 15]) expect(f.levels[l - 1].subFeatures.length).toBeGreaterThan(0);
    }
  });
});
