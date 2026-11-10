import { describe, it, expect } from 'vitest';
import { createCharacter, createDocument, SCHEMA_VERSION } from '../src/domain/schema.js';
import { parseDocument, normalizeCharacter } from '../src/domain/validation.js';
import { abilityScores, computeSheet, allFeats, languageInfo } from '../src/domain/rules.js';
import {
  setBackground, setBackgroundAbilities, parseEquipmentText, applyBackgroundEquipment,
  updateCustomBackground, customizeOfficial, setBackgroundFeatAbility,
} from '../src/domain/background.js';
import { applyLevelUp, setRace } from '../src/domain/progression.js';
import { data } from '../src/data/index.js';

const base = () => setRace(createCharacter(), 'Medio Elfo');

describe('trasfondos oficiales', () => {
  it('otorga habilidades, dote y opciones de atributo', () => {
    const c = setBackground(base(), { source: 'official', key: 'criminal' });
    const sheet = computeSheet(c);
    const sigilo = sheet.skills.find((s) => s.name === 'Sigilo');
    expect(sigilo.proficient).toBe(true);
    expect(sigilo.fromBackground).toBe(true);
    expect(allFeats(c).some((f) => f.name === 'Alerta' && f.source === 'trasfondo')).toBe(true);
    expect(sheet.background.tools).toEqual(['Herramientas de ladrón']);
  });

  it('aplica +2/+1 o +1/+1/+1 sólo entre los atributos del trasfondo', () => {
    let c = setBackground(base(), { source: 'official', key: 'acolito' });
    const before = abilityScores(c);
    ({ character: c } = setBackgroundAbilities(c, '2-1', ['sabiduria', 'inteligencia']));
    const after = abilityScores(c);
    expect(after.sabiduria.total - before.sabiduria.total).toBe(2);
    expect(after.inteligencia.total - before.inteligencia.total).toBe(1);

    const bad = setBackgroundAbilities(c, '1-1-1', ['fuerza', 'carisma', 'sabiduria']);
    expect(bad.character.background.abilityChoices).toEqual(['carisma', 'sabiduria']);
    expect(setBackgroundAbilities(c, '2-1', ['carisma', 'carisma']).errors[0]).toMatch(/mismo atributo/);
  });

  it('el aumento es opcional (modo none por defecto)', () => {
    const c = setBackground(base(), { source: 'official', key: 'acolito' });
    expect(c.background.abilityMode).toBe('none');
    expect(computeSheet(c).pendingBackground).toBe(false);
  });

  it('todos los trasfondos de datos usan habilidades y dotes existentes', () => {
    const skills = new Set(computeSheet(createCharacter()).skills.map((s) => s.name));
    for (const [key, bg] of Object.entries(data.backgrounds)) {
      for (const s of bg.skills) expect(skills.has(s), `${key}: ${s}`).toBe(true);
      if (bg.feat) expect(data.feats[bg.feat], `${key}: ${bg.feat}`).toBeTruthy();
    }
  });
});

describe('equipo del trasfondo', () => {
  it('interpreta cantidades, paréntesis y monedas', () => {
    const r = parseEquipmentText('2 dagas, herramientas de ladrón, 2 bolsas, palanqueta, ropas de viaje y 16 po');
    expect(r.items.map((i) => [i.name, i.quantity])).toEqual([
      ['Dagas', 2], ['Herramientas de ladrón', 1], ['Bolsas', 2], ['Palanqueta', 1], ['Ropas de viaje', 1],
    ]);
    expect(r.coins.gp).toBe(16);
    const a = parseEquipmentText('Suministros de calígrafo, libro (de oraciones, rezos), pergamino (10 hojas), símbolo sagrado, túnica y 8 po');
    expect(a.items.map((i) => i.name)).toContain('Libro (de oraciones, rezos)');
    expect(parseEquipmentText('50 po')).toEqual({ items: [], coins: { cp: 0, sp: 0, gp: 50, pp: 0 } });
  });

  it('añade el equipo una sola vez', () => {
    let c = setBackground(base(), { source: 'official', key: 'criminal' });
    const r = applyBackgroundEquipment(c, 'A');
    expect(r.errors).toEqual([]);
    c = r.character;
    expect(c.equipment.items).toHaveLength(5);
    expect(c.equipment.coins.gp).toBe(16);
    expect(applyBackgroundEquipment(c, 'B').errors[0]).toMatch(/ya se añadió/);
  });
});

describe('trasfondos homebrew', () => {
  const homebrew = {
    name: 'Herrero de Agarias',
    description: 'Forjaste armas para la guardia.',
    abilityOptions: ['fuerza', 'constitucion', 'sabiduria'],
    feat: 'Duro',
    skills: ['Atletismo', 'Inventada'],
    tools: ['Herramientas de herrero'],
    languages: 1,
    equipment: [{ label: 'A', text: 'Martillo, yunque portátil y 10 po' }],
    feature: { name: 'Contactos gremiales', text: 'Los herreros te dan alojamiento.' },
  };

  it('se guarda dentro del personaje y otorga lo definido', () => {
    const c = setBackground(base(), { source: 'custom', custom: homebrew });
    expect(c.background.custom.skills).toEqual(['Atletismo']); // se descarta lo no válido
    const sheet = computeSheet(c);
    expect(sheet.skills.find((s) => s.name === 'Atletismo').fromBackground).toBe(true);
    expect(sheet.hp.duro).toBe(true); // la dote del trasfondo cuenta (+2 PG/nivel)
    expect(languageInfo(c).picks).toBe(2); // 1 de la raza + 1 del trasfondo
  });

  it('viaja intacto al exportar e importar', () => {
    let c = setBackground(base(), { source: 'custom', custom: homebrew });
    ({ character: c } = setBackgroundAbilities(c, '1-1-1', ['fuerza', 'constitucion', 'sabiduria']));
    const { character, warnings } = parseDocument(JSON.parse(JSON.stringify(createDocument(c))));
    expect(character.background).toEqual(c.background);
    expect(warnings).toEqual([]);
  });

  it('al editarlo conserva las elecciones que siguen siendo válidas', () => {
    let c = setBackground(base(), { source: 'custom', custom: homebrew });
    ({ character: c } = setBackgroundAbilities(c, '2-1', ['fuerza', 'sabiduria']));
    c = updateCustomBackground(c, { ...homebrew, abilityOptions: ['fuerza', 'destreza'] });
    expect(c.background.abilityChoices).toEqual(['fuerza']);
    c = updateCustomBackground(c, { ...homebrew, abilityOptions: [] });
    expect(c.background.abilityMode).toBe('none');
  });

  it('personalizar uno oficial conserva las elecciones válidas', () => {
    let c = setBackground(base(), { source: 'official', key: 'criminal' });
    ({ character: c } = setBackgroundAbilities(c, '2-1', ['destreza', 'constitucion']));
    ({ character: c } = applyBackgroundEquipment(c, 'A'));
    c = updateCustomBackground(c, customizeOfficial(data.backgrounds.criminal));
    expect(c.background.source).toBe('custom');
    expect(c.background.abilityChoices).toEqual(['destreza', 'constitucion']);
    expect(c.background.equipmentApplied).toBe('A');
  });

  it('se puede partir de uno oficial', () => {
    const copy = customizeOfficial(data.backgrounds.acolito);
    expect(copy.name).toBe('Acólito (personalizado)');
    expect(copy.skills).toEqual(['Perspicacia', 'Religión']);
  });

  it('la dote del trasfondo con atributo opcional pide elección', () => {
    let c = setBackground(base(), { source: 'custom', custom: { ...homebrew, feat: 'Resiliente' } });
    expect(computeSheet(c).pendingBackground).toBe(true);
    c = setBackgroundFeatAbility(c, 'constitucion');
    expect(computeSheet(c).pendingBackground).toBe(false);
  });
});

describe('pericia (competencia experta)', () => {
  it('duplica el bonificador sólo con competencia', () => {
    const c = base();
    c.proficiencies.skills = ['Sigilo'];
    c.proficiencies.expertise = ['Sigilo', 'Historia'];
    const s = computeSheet(c);
    const sigilo = s.skills.find((x) => x.name === 'Sigilo');
    const historia = s.skills.find((x) => x.name === 'Historia');
    expect(sigilo.expert).toBe(true);
    expect(sigilo.bonus).toBe(s.scores.destreza.modifier + 4);
    expect(historia.expert).toBe(false); // sin competencia no cuenta
    expect(historia.bonus).toBe(s.scores.inteligencia.modifier);
  });

  it('calcula pericias disponibles por clase y dote', () => {
    let c = base();
    ({ character: c } = applyLevelUp(c, { classKey: 'picaro' }));
    expect(computeSheet(c).expertise.allowed).toBe(2);
    c.levels.push({ classKey: 'mago', hpRoll: 3, improvement: { type: 'feat', name: 'Experto en habilidades', ability: 'destreza' }, featureChoices: {} });
    expect(computeSheet(c).expertise.allowed).toBe(3);
  });
});

describe('migración 1 → 2', () => {
  it('convierte el trasfondo de texto en oficial o homebrew', () => {
    const v1 = (bg) => ({ format: 'agarias-dnd-character', schemaVersion: 1, character: { identity: { name: 'X', background: bg } } });
    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(2);
    const official = parseDocument(v1('criminal')).character;
    expect(official.background).toMatchObject({ source: 'official', key: 'criminal' });
    expect(official.identity.background).toBeUndefined();
    const custom = parseDocument(v1('Pirata del Vacío')).character;
    expect(custom.background.source).toBe('custom');
    expect(custom.background.custom.name).toBe('Pirata del Vacío');
    expect(parseDocument(v1('')).character.background.source).toBeNull();
  });

  it('un personaje vacío normalizado no tiene trasfondo ni pericias', () => {
    const { character } = normalizeCharacter({});
    expect(character.background.source).toBeNull();
    expect(character.proficiencies.expertise).toEqual([]);
  });
});
