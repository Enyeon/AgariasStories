import { describe, it, expect } from 'vitest';
import { createCharacter, createTrait } from '../src/domain/schema.js';
import { computeSheet, hitPoints, abilityScores } from '../src/domain/rules.js';
import { planLevelUp, setRace } from '../src/domain/progression.js';
import { applyLevelUp } from './helpers/auto-choices.js';
import {
  classProficiencies, proficiencySources, setClassSkills, setClassSaves, classChoiceStatus, pendingClassChoices,
} from '../src/domain/proficiencies.js';
import { setBackground } from '../src/domain/background.js';
import { normalizeEffect } from '../src/domain/effects.js';
import { parseDocument, normalizeCharacter } from '../src/domain/validation.js';
import { getClass, listClasses } from '../src/data/index.js';
import legacy from '../src/data/legacy/atributos-iniciales-v2.json';

function levelTo(c, classKey, n) {
  let cur = c;
  for (let i = 0; i < n; i++) {
    const plan = planLevelUp(cur, classKey);
    const { character, errors } = applyLevelUp(cur, { classKey, hpRoll: 4, subclass: plan.needsSubclass ? plan.subclassOptions[0].key : undefined });
    if (errors.length) throw new Error(errors.join('; '));
    cur = character;
  }
  return cur;
}

const base = () => setRace(createCharacter(), 'Humano');

describe('datos de competencias de clase', () => {
  it('ninguna clase oficial conserva las salvaciones copiadas del Bárbaro', () => {
    expect(classProficiencies('mago').salvaciones).toEqual(['inteligencia', 'sabiduria']);
    expect(classProficiencies('picaro').salvaciones).toEqual(['destreza', 'inteligencia']);
    expect(classProficiencies('bardo').skills).toMatchObject({ count: 3, any: true });
    expect(getClass('mago').niveles[1].atributoInicial).not.toContain('Fuerza, Constitución');
  });

  it('todas las clases tienen competencias o están marcadas como pendientes', () => {
    for (const cls of listClasses()) {
      expect(cls.competencias, cls.claseName).toBeTruthy();
      const p = classProficiencies(cls.claseName);
      if (!cls.competencias.pendiente) {
        expect(p.pending).toBe(false);
        expect(p.salvaciones.length + (p.saveChoice?.count ?? 0), cls.claseName).toBe(2);
      }
    }
    expect(classProficiencies('anomalia').pending).toBe(true);
  });

  it('las habilidades de clase existen en la lista de habilidades', () => {
    for (const cls of listClasses()) {
      const p = classProficiencies(cls.claseName);
      if (p.skills && !p.skills.any) {
        const raw = cls.competencias.habilidades.de;
        expect(p.skills.options.length, cls.claseName).toBe(raw.length);
      }
    }
  });
});

describe('fuentes de competencias', () => {
  it('la clase inicial da salvaciones; la multiclase no', () => {
    let c = levelTo(base(), 'mago', 1);
    c = levelTo(c, 'picaro', 1);
    const sheet = computeSheet(c);
    const prof = Object.fromEntries(sheet.saves.map((s) => [s.ability, s.proficient]));
    expect(prof).toMatchObject({ inteligencia: true, sabiduria: true, destreza: false });
    expect(sheet.proficiencies.herramientas.map((t) => t.name)).toContain('Herramientas de ladrón');
    expect(sheet.proficiencies.armaduras.find((a) => a.name === 'Armadura ligera').sources[0].label).toContain('multiclase');
  });

  it('las habilidades elegidas de clase cuentan y no se duplican con las marcadas a mano', () => {
    let c = levelTo(base(), 'mago', 1);
    c.proficiencies.skills.push('Historia');
    c = setClassSkills(c, 'mago', ['Historia', 'Medicina', 'Sigilo']);
    expect(c.classChoices.mago.skills).toEqual(['Historia', 'Medicina']);
    expect(c.proficiencies.skills).not.toContain('Historia');
    const src = proficiencySources(c).skills.get('Historia');
    expect(src).toHaveLength(1);
    expect(src[0]).toMatchObject({ kind: 'clase', label: 'Mago' });
    const skill = computeSheet(c).skills.find((s) => s.name === 'Historia');
    expect(skill).toMatchObject({ proficient: true, granted: true });
  });

  it('avisa si clase y trasfondo dan la misma habilidad', () => {
    let c = levelTo(base(), 'clerigo', 1);
    c = setBackground(c, { source: 'official', key: 'acolito' });
    const bgSkills = computeSheet(c).background.skills;
    c = setClassSkills(c, 'clerigo', [bgSkills.find((s) => classProficiencies('clerigo').skills.options.includes(s)), 'Medicina']);
    const st = classChoiceStatus(c)[0];
    expect(st.duplicates.length).toBe(1);
    expect(pendingClassChoices(c)).toBe(true);
    const src = proficiencySources(c).skills.get(st.duplicates[0]);
    expect(src.map((s) => s.kind).sort()).toEqual(['clase', 'trasfondo']);
  });

  it('salvación a elegir (Shadow Knight)', () => {
    let c = levelTo(base(), 'shadow', 1);
    expect(classChoiceStatus(c)[0].savesRemaining).toBe(1);
    c = setClassSaves(c, 'shadow', ['inteligencia', 'carisma']);
    expect(c.classChoices.shadow.saves).toEqual(['inteligencia']);
    const prof = computeSheet(c).saves.filter((s) => s.proficient).map((s) => s.ability).sort();
    expect(prof).toEqual(['carisma', 'inteligencia']);
  });
});

describe('efectos', () => {
  it('rechaza efectos fuera del catálogo', () => {
    expect(normalizeEffect({ type: 'ejecutar', code: 'alert(1)' })).toBeNull();
    expect(normalizeEffect({ type: 'bono', target: 'ca', value: 1 })).toBeNull();
    expect(normalizeEffect({ type: 'competencia', kind: 'habilidad', value: 'Volar' })).toBeNull();
    expect(normalizeEffect({ type: 'resistencia', value: 'profano' })).toEqual({ type: 'resistencia', value: 'profano' });
  });

  it('la dote Duro funciona por datos (+2 PG por nivel)', () => {
    const c = levelTo(base(), 'guerrero', 2);
    const before = hitPoints(c, abilityScores(c)).max;
    c.race.feat = { name: 'Duro', ability: null };
    const after = hitPoints(c, abilityScores(c));
    expect(after.max - before).toBe(4);
    expect(after.duro).toBe(true);
  });

  it('un rasgo activo aplica sus efectos y uno inactivo no', () => {
    let c = levelTo(base(), 'guerrero', 1);
    const plain = computeSheet(c);
    c.traits.push(createTrait({
      name: 'Marca del Pacto', origin: 'evento',
      effects: [{ type: 'bono', target: 'iniciativa', value: 2 }, { type: 'competencia', kind: 'habilidad', value: 'Arcanos' }, { type: 'competencia', kind: 'habilidad', value: 'Sigilo' }, { type: 'resistencia', value: 'necrotico' }],
    }));
    c = normalizeCharacter(c).character;
    expect(c.traits[0].effects).toHaveLength(3); // «Arcanos» no es una habilidad válida
    const sheet = computeSheet(c);
    expect(sheet.initiative).toBe(plain.initiative + 2);
    expect(sheet.skills.find((s) => s.name === 'Sigilo').sources[0]).toMatchObject({ kind: 'otros', label: 'Marca del Pacto' });
    expect(sheet.defenses.resistencia).toEqual([{ value: 'necrotico', source: 'Marca del Pacto' }]);
    c.traits[0].active = false;
    expect(computeSheet(c).initiative).toBe(plain.initiative);
  });
});

describe('migración 2 → 3', () => {
  it('sustituye los atributos de clase copiados del Bárbaro si no se editaron', () => {
    const doc = {
      format: 'agarias-dnd-character', schemaVersion: 2,
      character: {
        race: { key: 'Humano' }, levels: [{ classKey: 'mago', hpRoll: 6 }],
        notes: { classNotes: { mago: legacy.mago } },
      },
    };
    const { character, warnings } = parseDocument(doc);
    expect(character.notes.classNotes.mago).toBe(getClass('mago').niveles[1].atributoInicial);
    expect(warnings.join(' ')).toContain('Mago');
    expect(character.traits).toEqual([]);
    expect(character.classChoices).toEqual({});
  });

  it('conserva las notas que el usuario editó', () => {
    const doc = {
      format: 'agarias-dnd-character', schemaVersion: 2,
      character: { levels: [{ classKey: 'mago', hpRoll: 6 }], notes: { classNotes: { mago: 'Mis notas' } } },
    };
    expect(parseDocument(doc).character.notes.classNotes.mago).toBe('Mis notas');
  });
});

describe('subclases de relleno retiradas', () => {
  it('ninguna clase oficial ofrece las «Hebras» de la Anomalía', () => {
    for (const key of ['guerrero', 'mago', 'clerigo', 'picaro', 'artifice']) {
      const lvl = Object.values(getClass(key).niveles).find((l) => l.subClase);
      const names = Object.values(lvl.subClase).map((s) => s.subNombre);
      expect(names.some((n) => n.startsWith('Hebra') || !n), key).toBe(false);
    }
    expect(Object.values(getClass('anomalia').niveles).find((l) => l.subClase)).toBeTruthy();
  });

  it('al abrir un personaje con una subclase retirada, se quita y se avisa', () => {
    const doc = {
      format: 'agarias-dnd-character', schemaVersion: 2,
      character: { race: { key: 'Humano' }, levels: [1, 2, 3].map(() => ({ classKey: 'guerrero', hpRoll: 6 })), subclasses: { guerrero: 'senda1' } },
    };
    const { character, warnings } = parseDocument(doc);
    expect(character.subclasses.guerrero).toBeUndefined();
    expect(warnings.join(' ')).toContain('Arquetipo marcial');
  });
});

describe('bonificación de atributo por efectos', () => {
  it('un rasgo con «atributo:fuerza» suma a la puntuación', () => {
    const c = normalizeCharacter({ ...createCharacter(), traits: [{ name: 'Fuerza del gigante', origin: 'objeto', effects: [{ type: 'bono', target: 'atributo:fuerza', value: 2 }] }] }).character;
    const s = computeSheet(c);
    expect(s.scores.fuerza).toMatchObject({ effects: 2, total: 12 });
  });
});
