import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { getClass } from '../src/data/index.js';
import { createCharacter } from '../src/domain/schema.js';
import { computeSheet, classFeatures } from '../src/domain/rules.js';
import { computeSpellSlots } from '../src/domain/spellcasting.js';
import { applyLevelUp, applyLevelDowns, planLevelUp, setRace } from '../src/domain/progression.js';
import { knownChoices, choiceOptions, choiceLabel, replaceChoice } from '../src/domain/class-choices.js';
import { autoChoices } from './helpers/auto-choices.js';

const SPELLS = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../src/data/spells.json'), 'utf8'));
const ASI = { type: 'asi', increases: { fuerza: 1, constitucion: 1 } };
function up(c, sub, pick) {
  const plan = planLevelUp(c, 'brujo', { subclass: sub });
  const subclass = plan.needsSubclass ? sub : null;
  const el = pick?.(plan.newClassLevel, c) ?? autoChoices(c, 'brujo', subclass);
  return applyLevelUp(c, { classKey: 'brujo', hpRoll: 5, subclass, improvement: plan.needsImprovement ? ASI : null, featureChoices: { elecciones: el } });
}
function warlock(n, sub = 'infernal', pick) {
  let c = setRace(createCharacter(), 'Humano');
  for (let i = 0; i < n; i++) {
    const res = up(c, sub, pick);
    if (res.errors.length) throw new Error(`nivel ${i + 1}: ${res.errors.join(' ')}`);
    c = res.character;
  }
  return c;
}
const sheet = (c) => computeSheet(c);
const prepared = (c) => sheet(c).spellcasting.alwaysPrepared.map((x) => x.name);
const inv = (c) => knownChoices(c, 'brujo').invocaciones ?? [];

describe('Brujo', () => {
  it('Carisma (antes figuraba Sabiduría), trucos y preparados por tabla', () => {
    expect(sheet(warlock(1)).spellcasting.entries[0]).toMatchObject({ ability: 'carisma', cantrips: 2, prepared: 2, known: null });
    expect(sheet(warlock(10)).spellcasting.entries[0]).toMatchObject({ cantrips: 4, prepared: 10 });
  });

  it('Magia del Pacto: espacios todos del mismo nivel según la tabla (sin mezclar el Arcanum)', () => {
    const pact = (n) => sheet(warlock(n)).spellcasting.pactSlots;
    expect(pact(1)).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(pact(5)).toEqual([0, 0, 2, 0, 0, 0, 0, 0, 0]);
    expect(pact(11)).toEqual([0, 0, 0, 0, 3, 0, 0, 0, 0]);
    expect(pact(20)).toEqual([0, 0, 0, 0, 4, 0, 0, 0, 0]);
    // Multiclase: los espacios de pacto van aparte.
    expect(computeSpellSlots([{ classKey: 'brujo', level: 3 }, { classKey: 'mago', level: 2 }])).toMatchObject({ slots: [3, 0, 0, 0, 0, 0, 0, 0, 0], pactSlots: [0, 2, 0, 0, 0, 0, 0, 0, 0] });
  });

  it('invocaciones según la tabla: 1, 3, 5, 6, 7, 8, 9, 10', () => {
    expect([1, 2, 5, 7, 9, 12, 15, 18].map((n) => inv(warlock(n)).length)).toEqual([1, 3, 5, 6, 7, 8, 9, 10]);
  });

  it('requisitos de nivel y de otra invocación', () => {
    const def = getClass('brujo').listasDeEleccion.invocaciones;
    const opts = choiceOptions(def, { known: [], pool: [], nivel: 1 });
    expect(opts.find((o) => o.value === 'armadura-sombras').blocked).toBe(false);
    expect(opts.find((o) => o.value === 'paso-ascendente')).toMatchObject({ blocked: true, meta: 'Nivel 5+' });
    expect(opts.find((o) => o.value === 'golpe-arcano').meta).toBe('Nivel 5+ · Requiere: Pacto de la Espada');
    // Nivel 1: una invocación de nivel 5 no se puede elegir.
    const c0 = setRace(createCharacter(), 'Humano');
    expect(applyLevelUp(c0, { classKey: 'brujo', featureChoices: { elecciones: { invocaciones: { add: ['paso-ascendente'] } } } }).errors.join(' ')).toMatch(/no cumple su requisito/);
    // Nivel 5 sin Pacto de la Espada: Golpe Arcano bloqueado; con el pacto en el mismo paso, permitido.
    const c4 = warlock(4, 'infernal', (lvl) => (lvl === 1 ? { invocaciones: { add: ['armadura-sombras'] } } : lvl === 2 ? { invocaciones: { add: ['mente-arcana', 'vision-infernal'] } } : null));
    expect(up(c4, null, () => ({ invocaciones: { add: ['golpe-arcano', 'paso-ascendente'] } })).errors.join(' ')).toMatch(/Golpe Arcano.*no cumple/);
    const ok = up(c4, null, () => ({ invocaciones: { add: ['pacto-espada', 'golpe-arcano'] } }));
    expect(ok.errors).toEqual([]);
    // No se puede reemplazar un requisito de otra invocación que se conserva.
    const c5 = ok.character;
    expect(up(c5, null, () => ({ invocaciones: { add: ['susurros-tumba', 'mil-formas'], remove: ['pacto-espada'] } })).errors.join(' ')).toMatch(/es requisito de «Golpe Arcano»/);
  });

  it('invocaciones repetibles (Explosión Agonizante dos veces) y Lecciones abre la dote de origen', () => {
    const c = warlock(2, 'infernal', (lvl) => (lvl === 1 ? { invocaciones: { add: ['mente-arcana'] } }
      : { invocaciones: { add: ['explosion-agonizante', 'lecciones-primeros'] }, 'dote-origen': { add: ['Alerta'] } }));
    expect(inv(c)).toEqual(['mente-arcana', 'explosion-agonizante', 'lecciones-primeros']);
    expect(knownChoices(c, 'brujo')['dote-origen']).toEqual(['Alerta']);
    const def = getClass('brujo').listasDeEleccion.invocaciones;
    const again = choiceOptions(def, { known: inv(c), nivel: 3 }).find((o) => o.value.startsWith('explosion-agonizante'));
    expect(again).toMatchObject({ value: 'explosion-agonizante~2', label: 'Explosión Agonizante (2)' });
    expect(choiceLabel(def, 'explosion-agonizante~2')).toBe('Explosión Agonizante (2)');
    const res = up(warlock(4, 'infernal', (lvl) => (lvl === 1 ? { invocaciones: { add: ['mente-arcana'] } } : lvl === 2 ? { invocaciones: { add: ['explosion-agonizante', 'vision-infernal'] } } : null)), null,
      () => ({ invocaciones: { add: ['explosion-agonizante~2', 'mil-formas'] } }));
    expect(res.errors).toEqual([]);
    expect(inv(res.character)).toContain('explosion-agonizante~2');
  });

  it('Pacto de la Cadena: Encontrar familiar; Contacto con el Patrón (9); Arcanum Místico', () => {
    const c = warlock(1, 'infernal', () => ({ invocaciones: { add: ['pacto-cadena'] } }));
    expect(prepared(c)).toContain('Encontrar familiar');
    expect(prepared(warlock(9))).toContain('Contactar con otro plano');
    const c17 = warlock(17);
    const k = knownChoices(c17, 'brujo');
    for (const lvl of [6, 7, 8, 9]) {
      expect(k[`arcanum-${lvl}`]).toHaveLength(1);
      expect(Number(SPELLS[k[`arcanum-${lvl}`][0]].nivel)).toBe(lvl);
    }
    expect(applyLevelDowns(c17, 12).levels).toHaveLength(12);
    expect(knownChoices(applyLevelDowns(c17, 12), 'brujo')['arcanum-7']).toBeUndefined();
  });

  it('patrones: conjuros, resistencias e inmunidad', () => {
    expect(prepared(warlock(9, 'archihada'))).toEqual(expect.arrayContaining(['Calmar emociones', 'Paso brumoso', 'Dominar persona', 'Apariencia']));
    expect(sheet(warlock(10, 'archihada')).defenses.inmunidad_condicion.map((x) => x.value)).toEqual(['Hechizado']);
    expect(sheet(warlock(6, 'celestial')).defenses.resistencia.map((r) => r.value)).toEqual(['radiante']);
    expect(sheet(warlock(10, 'primigenio')).defenses.resistencia.map((r) => r.value)).toEqual(['psiquico']);
    expect(prepared(warlock(10, 'primigenio'))).toContain('Maldición');
    const inf = warlock(10, 'infernal', (lvl, c) => {
      const el = autoChoices(c, 'brujo', null);
      if (el['resiliencia-infernal']) el['resiliencia-infernal'] = { add: ['fuego'], remove: [] };
      return el;
    });
    expect(sheet(inf).defenses.resistencia.map((r) => r.value)).toEqual(['fuego']);
    expect(sheet(replaceChoice(inf, 'brujo', 'resiliencia-infernal', 'fuego', 'necrotico').character).defenses.resistencia.map((r) => r.value)).toEqual(['necrotico']);
  });

  it('el patrón se elige al nivel 3 y conserva las claves guardadas', () => {
    expect(planLevelUp(warlock(2), 'brujo').needsSubclass).toBe(true);
    expect(Object.keys(getClass('brujo').niveles['3'].subClase)).toEqual(['archihada', 'celestial', 'infernal', 'primigenio']);
    for (const sub of ['archihada', 'celestial', 'infernal', 'primigenio']) {
      const f = classFeatures(warlock(20, sub))[0];
      for (const lv of [3, 6, 10, 14]) expect(f.levels[lv - 1].subFeatures.length).toBeGreaterThan(0);
    }
  });
});
