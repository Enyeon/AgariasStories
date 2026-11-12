import { describe, it, expect } from 'vitest';
import { getClass } from '../src/data/index.js';
import { createCharacter } from '../src/domain/schema.js';
import { computeSheet } from '../src/domain/rules.js';
import { applyLevelUp, applyLevelDowns, planLevelUp, setRace, levelNeedsDecisions } from '../src/domain/progression.js';
import { knownChoices, choiceOptions, classChoiceStatus, pendingDeferredChoices } from '../src/domain/class-choices.js';
import { autoChoices } from './helpers/auto-choices.js';

const ASI = { type: 'asi', increases: { inteligencia: 1, constitucion: 1 } };
/** Sube al Ingeniero eligiendo todo (o, con `skipEsquemas`, dejando los esquemas para el Taller). */
function ing(n, sub = 'mecha-batalla', { pick = {}, skipEsquemas = false } = {}) {
  let c = setRace(createCharacter(), 'Humano');
  for (let i = 0; i < n; i++) {
    const plan = planLevelUp(c, 'ingeniero', { subclass: sub });
    const subclass = plan.needsSubclass ? sub : null;
    const el = autoChoices(c, 'ingeniero', subclass);
    if (skipEsquemas) delete el.esquemas;
    for (const [k, v] of Object.entries(pick)) if (i + 1 === v.nivel) el[k] = { add: v.add, remove: [] };
    const res = applyLevelUp(c, {
      classKey: 'ingeniero', hpRoll: 6, subclass, improvement: plan.needsImprovement ? ASI : null,
      featureChoices: { elecciones: el },
    });
    if (res.errors.length) throw new Error(`nivel ${i + 1}: ${res.errors.join(' ')}`);
    c = res.character;
  }
  return c;
}
const sheet = (c) => computeSheet(c);
const skill = (s, n) => s.skills.find((x) => x.name === n);

describe('Ingeniero (texto «Engineer»)', () => {
  it('no es lanzador: d10, salvaciones de Des e Int, armas de fuego y tres herramientas', () => {
    const s = sheet(ing(1));
    expect(s.hp.perLevel[0].die).toBe(10);
    expect(s.spellcasting.isCaster).toBe(false);
    expect(s.saves.filter((x) => x.proficient).map((x) => x.key ?? x.ability).sort()).toEqual(['destreza', 'inteligencia']);
    expect(s.proficiencies.armas.map((x) => x.name)).toContain('Armas de fuego');
    expect(s.proficiencies.herramientas.map((h) => h.name)).toEqual(expect.arrayContaining(['Herramientas de hojalatero', 'Herramientas de herrero', 'Herramientas de armero']));
    expect(getClass('ingeniero').nivelesDeAumento).toEqual([4, 8, 12, 16, 19]);
  });

  it('esquemas conocidos según la tabla del texto y por complejidad', () => {
    expect([1, 2, 14, 15, 17, 20].map((n) => knownChoices(ing(n), 'ingeniero').esquemas.length)).toEqual([7, 8, 20, 22, 23, 26]);
    const def = getClass('ingeniero').listasDeEleccion.esquemas;
    expect(def.opciones).toHaveLength(50);
    const opts = (nivel) => choiceOptions(def, { known: [], nivel });
    expect(opts(1).find((o) => o.value === 'capa-camaleon').blocked).toBe(false);
    expect(opts(5).find((o) => o.value === 'mira-telescopica').blocked).toBe(true);
    expect(opts(6).find((o) => o.value === 'mira-telescopica').blocked).toBe(false);
    expect(opts(10).find((o) => o.value === 'mochila-propulsora').blocked).toBe(true);
    expect(opts(11).find((o) => o.value === 'mochila-propulsora').blocked).toBe(false);
  });

  it('los esquemas no son obligatorios al subir: quedan pendientes para el Taller', () => {
    expect(levelNeedsDecisions(ing(4, 'mecha-batalla', { skipEsquemas: true }), 'ingeniero')).toBe(false); // nivel 5: sólo esquemas
    const c = ing(3, 'mecha-batalla', { skipEsquemas: true });
    expect(pendingDeferredChoices(c, 'taller').reduce((t, m) => t + m.cantidad, 0)).toBe(9);
    expect(knownChoices(c, 'ingeniero')['dispositivo-caracteristico']).toHaveLength(1);
  });

  it('dispositivo a nivel 2; el Artilugio elige otro a los niveles 3 y 14 y +2 esquemas a los 5, 8, 12 y 15', () => {
    expect(knownChoices(ing(1), 'ingeniero')['dispositivo-caracteristico']).toBeUndefined();
    expect(knownChoices(ing(14, 'mecha-batalla'), 'ingeniero')['dispositivo-caracteristico']).toHaveLength(1);
    const art = ing(15, 'artilugio');
    expect(knownChoices(art, 'ingeniero')['dispositivo-caracteristico']).toHaveLength(3);
    expect(knownChoices(art, 'ingeniero').esquemas).toHaveLength(22 + 8);
    expect(classChoiceStatus(ing(20, 'artilugio'), 'ingeniero').missing).toEqual([]);
  });

  it('efectos: Lente de águila (+Int a Percepción), Enciclopedia andante sólo en Inteligencia', () => {
    const s = sheet(ing(1, 'mecha-batalla', { pick: { esquemas: { nivel: 1, add: ['lente-de-aguila', 'lampara-frontal', 'extintor', 'magitector', 'alcoholimetro', 'pluma-retractil', 'capa-camaleon'] } } }));
    const p = skill(s, 'Percepción');
    expect(p.bonus).toBe(s.scores.sabiduria.modifier + (p.proficient ? s.proficiency : 0) + Math.max(1, s.scores.inteligencia.modifier));
    const s11 = sheet(ing(11));
    const half = Math.floor(s11.proficiency / 2);
    expect(skill(s11, 'Naturaleza')).toMatchObject({ halfProficiency: true, bonus: s11.scores.inteligencia.modifier + half });
    expect(skill(s11, 'Supervivencia').halfProficiency).toBe(false);
  });

  it('seis especializaciones con sus niveles del texto', () => {
    const subs = getClass('ingeniero').niveles['3'].subClase;
    expect(Object.keys(subs)).toEqual(['mecha-batalla', 'artilugio', 'tecnoteurgo', 'mecanicista', 'tecnoteurgia', 'automata']);
    expect(Object.keys(subs['mecha-batalla'].subNivel)).toEqual(['3', '4', '6', '9', '12', '15', '20']);
    expect(sheet(ing(3)).proficiencies.armaduras.map((x) => x.name)).toContain('Armadura pesada');
  });

  it('Tecnoteúrgo: efectos del Guantelete N.O.V.A. por nivel y +2 Int hasta 22 a nivel 20', () => {
    const prepared = (c) => sheet(c).spellcasting.alwaysPrepared.map((x) => x.name);
    expect(prepared(ing(3, 'tecnoteurgo'))).toEqual(expect.arrayContaining(['Agarre electrizante', 'Escudo', 'Manos ardientes']));
    expect(prepared(ing(7, 'tecnoteurgo'))).not.toContain('Levitar');
    expect(prepared(ing(8, 'tecnoteurgo'))).toContain('Levitar');
    expect(knownChoices(ing(16, 'tecnoteurgo'), 'ingeniero')['recarga-arcana']).toHaveLength(3);
    const s20 = sheet(ing(20, 'tecnoteurgo'));
    expect(s20.scores.inteligencia.cap).toBe(22);
    expect(s20.scores.inteligencia.effects).toBe(2);
    expect(sheet(ing(20, 'mecha-batalla')).scores.inteligencia.cap).toBe(20);
  });

  it('Rompehechizos (resistencia a fuerza), Mecanicista y Autómata (compañero)', () => {
    expect(sheet(ing(10, 'tecnoteurgia')).defenses.resistencia.map((r) => r.value)).toContain('fuerza');
    expect(knownChoices(ing(13, 'mecanicista'), 'ingeniero')['modo-reconfiguracion']).toHaveLength(1);
  });

  it('sube de 1 a 20 y vuelve a bajar', () => {
    const c = ing(20, 'mecanicista');
    expect(c.levels).toHaveLength(20);
    expect(applyLevelDowns(c, 1).levels).toHaveLength(1);
  });
});
