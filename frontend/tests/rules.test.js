import { describe, it, expect } from 'vitest';
import { createCharacter } from '../src/domain/schema.js';
import {
  abilityModifier, proficiencyBonus, racialBonuses, abilityScores, computeSheet,
  hitPoints, featPrerequisites, classFeatures, spellcasting, languageInfo,
} from '../src/domain/rules.js';
import { computeSpellSlots } from '../src/domain/spellcasting.js';
import { planLevelUp, setRace, setRaceAbilityChoice } from '../src/domain/progression.js';
import { applyLevelUp } from './helpers/auto-choices.js';
import { getFeat } from '../src/data/index.js';

function levelTo(c, classKey, n, extra = () => ({})) {
  let cur = c;
  for (let i = 0; i < n; i++) {
    const plan = planLevelUp(cur, classKey);
    const { character, errors } = applyLevelUp(cur, { classKey, hpRoll: 5, subclass: plan.needsSubclass ? plan.subclassOptions[0].key : undefined, ...extra(cur) });
    if (errors.length) throw new Error(errors.join('; '));
    cur = character;
  }
  return cur;
}

describe('reglas básicas', () => {
  it('calcula modificadores de atributo', () => {
    expect(abilityModifier(10)).toBe(0);
    expect(abilityModifier(11)).toBe(0);
    expect(abilityModifier(8)).toBe(-1);
    expect(abilityModifier(1)).toBe(-5);
    expect(abilityModifier(20)).toBe(5);
  });

  it('calcula el bonificador de competencia por nivel', () => {
    expect([1, 4, 5, 8, 9, 13, 17, 20].map(proficiencyBonus)).toEqual([2, 2, 3, 3, 4, 5, 6, 6]);
  });
});

describe('bonificaciones raciales', () => {
  it('suma bonificaciones fijas', () => {
    const c = setRace(createCharacter(), 'Enano de las Colinas');
    const r = racialBonuses(c);
    expect(r.constitucion).toBeGreaterThan(0);
  });

  it('aplica elecciones de un grupo (choice) y respeta el número permitido', () => {
    let c = setRace(createCharacter(), 'Medio Elfo');
    c = setRaceAbilityChoice(c, 0, ['fuerza', 'destreza', 'sabiduria']);
    expect(c.race.abilityChoices[0]).toEqual(['fuerza', 'destreza']);
    const r = racialBonuses(c);
    expect(r.fuerza).toBe(1);
    expect(r.destreza).toBe(1);
    expect(r.sabiduria).toBe(0);
  });

  it('no permite repetir atributo entre grupos (choices)', () => {
    let c = setRace(createCharacter(), 'Gato Ancestral');
    c = setRaceAbilityChoice(c, 0, ['destreza']);
    c = setRaceAbilityChoice(c, 1, ['destreza']);
    expect(c.race.abilityChoices[1]).toEqual([]);
    c = setRaceAbilityChoice(c, 1, ['carisma']);
    const r = racialBonuses(c);
    expect(r.destreza).toBe(2);
    expect(r.carisma).toBe(1);
  });

  it('respeta allowedChoices', () => {
    let c = setRace(createCharacter(), 'Jötunn de Piedra (Bergjötunn)');
    c = setRaceAbilityChoice(c, 0, ['carisma']);
    expect(c.race.abilityChoices[0]).toEqual([]);
  });

  it('copia los rasgos raciales a las notas y los reemplaza al cambiar de raza', () => {
    let c = setRace(createCharacter(), 'Medio Elfo');
    expect(c.notes.raceTraits).toContain('Rasgos');
    c = setRace(c, 'Enano de las Colinas');
    expect(c.notes.raceTraits).not.toEqual('');
    c.notes.raceTraits = 'Mis notas';
    c = setRace(c, 'Medio Elfo');
    expect(c.notes.raceTraits).toBe('Mis notas');
  });
});

describe('puntos de golpe', () => {
  it('nivel 1 usa el máximo del dado + CON; el resto la tirada', () => {
    let c = setRace(createCharacter(), 'Medio Elfo');
    c.abilities.constitucion = 14; // +2
    c = levelTo(c, 'barbaro', 3, (cur) => (cur.levels.length === 2 ? { subclass: 'senda1' } : {}));
    const hp = hitPoints(c, abilityScores(c));
    expect(hp.perLevel.map((p) => p.total)).toEqual([14, 7, 7]);
    expect(hp.max).toBe(28);
  });

  it('suma Dureza racial (+1 por nivel)', () => {
    let c = setRace(createCharacter(), 'Enano de las Colinas');
    c = levelTo(c, 'guerrero', 2);
    const hp = hitPoints(c, abilityScores(c));
    expect(hp.tough).toBe(true);
    expect(hp.perLevel.every((p) => p.extra === 1)).toBe(true);
  });

  it('nunca da menos de 1 PG por nivel', () => {
    let c = setRace(createCharacter(), 'Medio Elfo');
    c.abilities.constitucion = 1; // -5
    c = levelTo(c, 'mago', 2);
    expect(hitPoints(c, abilityScores(c)).perLevel.every((p) => p.total >= 1)).toBe(true);
  });
});

describe('conjuros', () => {
  it('calcula CD y ataque del atributo de la clase', () => {
    let c = setRace(createCharacter(), 'Medio Elfo');
    c.abilities.carisma = 14; // 14 + 2 racial = 16 → +3
    c = levelTo(c, 'bardo', 1);
    const sheet = computeSheet(c);
    const e = sheet.spellcasting.entries[0];
    expect(e.ability).toBe('carisma');
    expect(e.dc).toBe(8 + 2 + 3);
    expect(e.attack).toBe(5);
    expect(sheet.spellcasting.slots[0]).toBe(2);
  });

  it('multiclase suma niveles de lanzador (completo + medio)', () => {
    const r = computeSpellSlots([{ classKey: 'mago', level: 3 }, { classKey: 'paladin', level: 4 }]);
    // nivel de lanzador 3 + 2 = 5
    expect(r.slots.slice(0, 3)).toEqual([4, 3, 2]);
  });

  it('los no lanzadores no tienen conjuros', () => {
    let c = setRace(createCharacter(), 'Medio Elfo');
    c = levelTo(c, 'guerrero', 2);
    const s = spellcasting(c, abilityScores(c), 2);
    expect(s.isCaster).toBe(false);
  });
});

describe('requisitos de dotes', () => {
  it('comprueba puntuación mínima', () => {
    const c = setRace(createCharacter(), 'Medio Elfo');
    const def = getFeat('Acechador');
    expect(featPrerequisites(c, def, abilityScores(c)).ok).toBe(false);
    c.abilities.destreza = 13;
    expect(featPrerequisites(c, def, abilityScores(c)).ok).toBe(true);
  });

  it('comprueba raza mediante etiquetas', () => {
    const c = setRace(createCharacter(), 'Alto Elfo');
    expect(featPrerequisites(c, getFeat('Precisión élfica'), abilityScores(c)).ok).toBe(true);
    const d = setRace(createCharacter(), 'Enano de las Colinas');
    expect(featPrerequisites(d, getFeat('Precisión élfica'), abilityScores(d)).ok).toBe(false);
  });
});

describe('rasgos de clase e idiomas', () => {
  it('lista rasgos hasta el nivel actual y marca niveles sin datos', () => {
    let c = setRace(createCharacter(), 'Medio Elfo');
    c = levelTo(c, 'picaro', 3, (cur) => (cur.levels.length === 2 ? { subclass: 'ladron' } : {}));
    const [f] = classFeatures(c);
    expect(f.levels).toHaveLength(3);
    expect(f.subclass?.key).toBe('ladron');
  });

  it('calcula idiomas elegibles de la raza', () => {
    const c = setRace(createCharacter(), 'Medio Elfo');
    const info = languageInfo(c);
    expect(info.picks).toBe(1);
    expect(info.options).not.toContain('Común');
  });
});

describe('Shadow Knight (texto de Homebrewery convertido)', () => {
  const shadowTo = (n, sub = 'senda5') => {
    let c = setRace(createCharacter(), 'Medio Elfo');
    c.abilities.carisma = 14; // 14 + 2 racial = 16 → +3
    c.abilities.sabiduria = 12; // +1
    return levelTo(c, 'shadow', n, (cur) => {
      const extra = {};
      if (cur.levels.length === 2) extra.subclass = sub;
      if ([3, 7].includes(cur.levels.length)) extra.improvement = { type: 'asi', increases: { destreza: 1, constitucion: 1 } };
      return extra;
    });
  };

  it('elige «Manifestación de la Sombra» a nivel 3 entre 5 opciones', async () => {
    const { planLevelUp } = await import('../src/domain/progression.js');
    const c = shadowTo(2);
    const plan = planLevelUp(c, 'shadow');
    expect(plan.needsSubclass).toBe(true);
    expect(plan.subclassLabel).toBe('Manifestación de la Sombra');
    expect(plan.subclassOptions.map((o) => o.name)).toEqual(['Sombra Lejana', 'Sombra Ágil', 'Sombra Pesada', 'Sombra Vacía', 'Sombra Guardiana']);
  });

  it('calcula la CD de Manifestación con el mejor entre CAR y SAB', () => {
    const [f] = classFeatures(shadowTo(3));
    expect(f.classDc).toEqual({ name: 'CD de Manifestación', ability: 'carisma', value: 8 + 2 + 3 });
    expect(f.subclass.name).toBe('Sombra Guardiana');
    expect(f.levels[2].subFeatures[0].title).toBe('Sombra Guardiana');
  });

  it('muestra los rasgos en su nivel y la tabla con el radio de presencia', () => {
    const [f] = classFeatures(shadowTo(8));
    const titles = (n) => f.levels[n - 1].features.map((x) => x.title);
    expect(titles(1)).toContain('Reanimar Sombras');
    expect(titles(1)).toContain('Calidad de las Sombras');
    expect(titles(7)).toEqual(['Intercambio a Larga Distancia']);
    expect(f.table.columns).toEqual(['Sombras activas', 'Sombras reservadas', 'Radio de presencia']);
    expect(f.table.rows.at(-1)['Radio de presencia']).toBe('5 km');
    expect(f.missingLevels).toEqual([]);
  });
});

describe('referencia de reglas', () => {
  it('tiene las 15 condiciones oficiales y los 13 tipos de daño oficiales', async () => {
    const { data } = await import('../src/data/index.js');
    const items = data.rulesReference.flatMap((g) => g.items);
    expect(items.filter((i) => i.kind === 'condicion' && i.origin === 'oficial')).toHaveLength(15);
    expect(items.filter((i) => i.kind === 'danio' && i.origin === 'oficial')).toHaveLength(13);
    const { CONDITIONS, DAMAGE_TYPES } = await import('../src/domain/effects.js');
    const names = new Set(items.map((i) => i.name));
    for (const c of CONDITIONS) expect(names.has(c), c).toBe(true);
    for (const d of DAMAGE_TYPES) expect(items.some((i) => i.id === `danio-${d.key}`), d.key).toBe(true);
  });

  it('los conceptos de Agarias no inventan cómo se aplican ni cómo terminan', async () => {
    const { data } = await import('../src/data/index.js');
    const states = data.rulesReference.find((g) => g.kind === 'estado').items;
    for (const s of states) {
      expect(s.origin).toBe('agarias');
      expect(s.applies).toBeNull();
      expect(s.ends).toBeNull();
    }
  });
});
