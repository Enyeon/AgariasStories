import { describe, it, expect, beforeEach } from 'vitest';
import { createCharacter } from '../src/domain/schema.js';
import { computeSheet, classFeatures } from '../src/domain/rules.js';
import { applyLevelUp, applyLevelUps, planLevelUp, setRace } from '../src/domain/progression.js';
import { parseDocument } from '../src/domain/validation.js';
import { createDocument } from '../src/services/characters.js';
import { installPack, resetRegistry, getEntry } from '../src/content/registry.js';
import { validateContent, makeRef, parseRef } from '../src/content/schema.js';
import { contentStatus } from '../src/content/snapshots.js';
import { getClass, getRace, getFeat, listClasses, raceName, loadSpells } from '../src/data/index.js';

const P = 'mesa1';
const CLASS = makeRef(P, 'clase', 'tejedor');
const RACE = makeRef(P, 'raza', 'umbrio');
const FEAT = makeRef(P, 'dote', 'pacto');
const SPELL = makeRef(P, 'hechizo', 'eco');

const items = (overrides = {}) => [
  { ref: CLASS, type: 'clase', version: 1, status: 'publicado', data: {
    name: 'Tejedor de Sombras', description: 'Manipula hilos de sombra.', hitDie: 8, caster: 'completo', spellAbility: 'carisma',
    saves: ['destreza', 'carisma'], armor: ['Armadura ligera'], weapons: ['Armas simples'], tools: [],
    skills: { count: 2, options: ['Sigilo', 'Engaño', 'Arcanos'] }, asiLevels: [4, 8],
    subclassLabel: 'Telar', subclassLevel: 2, subclasses: [{ name: 'Telar Hueco', description: 'Vacío.' }],
    features: [{ level: 1, name: 'Hilo', text: 'Tiras un hilo.' }, { level: 2, name: 'Nudo', text: 'Atas.', subclass: 'telar-hueco' }],
  } },
  { ref: RACE, type: 'raza', version: 1, status: 'publicado', data: {
    name: 'Umbrío', speed: { walk: 35 }, abilities: { destreza: 2 }, languages: ['Común', 'Umbrío'],
    traits: [{ name: 'Visión umbría', text: 'Ves en la oscuridad.' }], effects: [{ type: 'resistencia', value: 'necrotico' }],
  } },
  { ref: FEAT, type: 'dote', version: 1, status: 'publicado', data: {
    name: 'Pacto de Hilo', description: 'Te vuelves más duro.', abilityOptions: ['constitucion'], effects: [{ type: 'bono', target: 'pg_por_nivel', value: 1 }],
  } },
  { ref: SPELL, type: 'hechizo', version: 1, status: 'publicado', data: { name: 'Eco umbrío', level: 1, classes: [CLASS], description: 'Un eco.' } },
  ...(overrides.extra ?? []),
];

function hero() {
  let c = setRace(createCharacter(), RACE);
  c = applyLevelUp(c, { classKey: CLASS }).character;
  const plan = planLevelUp(c, CLASS);
  c = applyLevelUps(c, [{ classKey: CLASS, hpRoll: 5, subclass: plan.subclassOptions[0].key }, { classKey: CLASS, hpRoll: 5 }, { classKey: CLASS, hpRoll: 5, improvement: { type: 'feat', name: FEAT, ability: 'constitucion' } }]).character;
  c.spells.known = ['Eco umbrío'];
  return c;
}

beforeEach(() => {
  resetRegistry();
  installPack({ id: P, name: 'Mesa de prueba', kind: 'campaign', items: items() });
});

describe('contenido Homebrew en el mismo motor', () => {
  it('valida y rechaza contenido mal formado', () => {
    expect(validateContent('clase', { name: 'X', hitDie: 7 }).errors[0]).toMatch(/dado de golpe/);
    expect(validateContent('raza', { name: '' }).errors).toContain('Falta el nombre.');
    expect(validateContent('dote', { name: 'D', effects: [{ type: 'ejecutar' }] }).item.effects).toEqual([]);
    expect(validateContent('ninguno', {}).item).toBeNull();
    const res = installPack({ id: 'malo', name: 'Malo', kind: 'local', items: [{ ref: 'hb:malo:clase:x', type: 'clase', data: { name: 'Sin dado' } }, { ref: 'otro', type: 'raza', data: {} }] });
    expect(res.rejected).toHaveLength(2);
    expect(parseRef('hb:../x:clase:a')).toBeNull();
  });

  it('una clase, raza, dote y hechizo Homebrew funcionan con las reglas normales', async () => {
    expect(listClasses().some((k) => k.claseName === CLASS)).toBe(true);
    const c = hero();
    const sheet = computeSheet(c);
    expect(sheet.level).toBe(4);
    expect(raceName(c.race.key)).toBe('Umbrío');
    expect(sheet.scores.destreza.racial).toBe(2);
    expect(sheet.speeds.find((s) => s.key === 'velocidad').value).toBe(35);
    expect(sheet.saves.filter((s) => s.proficient).map((s) => s.ability).sort()).toEqual(['carisma', 'destreza']);
    expect(sheet.defenses.resistencia[0]).toMatchObject({ value: 'necrotico', source: 'Umbrío' });
    expect(sheet.hp.perLevel.every((p) => p.extra === 1)).toBe(true); // +1 PG por nivel de la dote
    expect(sheet.spellcasting.entries[0]).toMatchObject({ ability: 'carisma' });
    expect(sheet.spellcasting.slots[0]).toBeGreaterThan(0);
    const [f] = classFeatures(c);
    expect(f.subclassLabel).toBe('Telar');
    expect(f.levels[1].subFeatures.map((x) => x.title)).toContain('Nudo');
    const spells = await loadSpells();
    expect(spells['Eco umbrío'].conjuradorTrue[CLASS]).toBe(true);
    // «Arcanos» no es una habilidad válida: se descarta al validar.
    expect(getClass(CLASS).competencias.habilidades.de).toEqual(['Sigilo', 'Engaño']);
  });

  it('exportar incluye instantáneas y el archivo se abre sin la campaña', () => {
    const doc = JSON.parse(JSON.stringify(createDocument(hero())));
    expect(Object.keys(doc.character.content).sort()).toEqual([CLASS, FEAT, RACE, SPELL].sort());
    resetRegistry();
    expect(getClass(CLASS)).toBeNull();
    const { character, warnings } = parseDocument(doc);
    expect(warnings).toEqual([]);
    expect(getRace(RACE).nombre).toBe('Umbrío');
    expect(getEntry(CLASS).origin).toBe('snapshot');
    expect(computeSheet(character).level).toBe(4);
    expect(contentStatus(character).every((s) => s.state === 'instantanea')).toBe(true);
  });

  it('una instantánea no pisa la versión de la campaña y se detectan actualizaciones', () => {
    const doc = createDocument(hero());
    const v2 = items();
    v2[2] = { ...v2[2], version: 2, data: { ...v2[2].data, name: 'Pacto de Hilo Mayor' } };
    installPack({ id: P, name: 'Mesa de prueba', kind: 'campaign', items: v2 });
    const { character } = parseDocument(doc);
    expect(getFeat(FEAT).nombre).toBe('Pacto de Hilo Mayor');
    expect(contentStatus(character).find((s) => s.ref === FEAT).state).toBe('actualizado');
  });

  it('el contenido retirado sigue funcionando para quien ya lo usa, pero no se ofrece', () => {
    const v2 = items().map((x) => (x.ref === CLASS ? { ...x, status: 'retirado' } : x));
    installPack({ id: P, name: 'Mesa de prueba', kind: 'campaign', items: v2 });
    expect(listClasses().some((k) => k.claseName === CLASS)).toBe(false);
    const c = hero();
    expect(computeSheet(c).level).toBe(4);
    expect(contentStatus(c).find((s) => s.ref === CLASS).state).toBe('retirado');
  });
});
