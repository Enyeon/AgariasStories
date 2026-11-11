import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { validateClassData } from '../src/content/class-data.js';
import { registerClassData, getClass, listClasses } from '../src/data/index.js';
import { createCharacter } from '../src/domain/schema.js';
import { computeSheet, classFeatures } from '../src/domain/rules.js';
import { applyLevelUps, applyLevelDowns, planLevelUp, setRace } from '../src/domain/progression.js';
import { classProficiencies, setClassSkills } from '../src/domain/proficiencies.js';
import { filterSpells } from '../src/views/sheet/spells.js';
import { autoChoices } from './helpers/auto-choices.js';
import { knownChoices } from '../src/domain/class-choices.js';

const TEMPLATE = path.resolve(__dirname, '../../docs/plantillas/clase-plantilla.json');
const template = JSON.parse(fs.readFileSync(TEMPLATE, 'utf8'));
const KEY = template.claseName;

function levelTo(n, sub = 'faro') {
  let c = setRace(createCharacter(), 'Humano');
  const list = [];
  for (let i = 0; i < n; i++) {
    const plan = planLevelUp(c, KEY);
    const ch = {
      classKey: KEY,
      hpRoll: 6,
      subclass: plan.needsSubclass ? sub : null,
      improvement: plan.needsImprovement ? { type: 'asi', increases: plan.newClassLevel === 19 ? { sabiduria: 1, fuerza: 1 } : { sabiduria: 2 } } : null,
      featureChoices: {
        ...(plan.featureChoice ? { statAmount: ['constitucion'] } : {}),
        elecciones: autoChoices(c, KEY, plan.needsSubclass ? sub : null),
      },
    };
    list.push(ch);
    const res = applyLevelUps(c, [ch]);
    if (res.errors.length) throw new Error(`nivel ${i + 1}: ${res.errors.join(" ")}`);
    c = res.character;
  }
  return c;
}

describe('formato JSON de clases', () => {
  it('todas las clases del proyecto pasan el validador (sin errores)', () => {
    const dir = path.resolve(__dirname, '../src/data/classes');
    for (const f of fs.readdirSync(dir)) {
      const res = validateClassData(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')), { file: f });
      expect(res.errors, f).toEqual([]);
    }
  });

  it('detecta errores típicos', () => {
    const bad = structuredClone(template);
    bad.claseName = 'Con Espacios';
    bad.dadoDeGolpe = 'd10';
    bad.niveles['6'].infoBlock.blockUno.efectos = [{ type: 'magia', value: 1 }];
    bad.competencias.habilidades.de = ['Arcanos'];
    const { ok, errors } = validateClassData(bad);
    expect(ok).toBe(false);
    expect(errors.join('\n')).toMatch(/claseName[\s\S]*dadoDeGolpe[\s\S]*habilidades\.de[\s\S]*efecto no válido/);
  });

  it('la plantilla es válida y se carga en el motor', () => {
    const res = registerClassData(template);
    expect(res.errors).toEqual([]);
    expect(getClass(KEY).nombre).toBe(template.nombre);
    expect(listClasses().some((c) => c.claseName === KEY)).toBe(true);
    expect(classProficiencies(KEY)).toMatchObject({ salvaciones: ['sabiduria', 'carisma'], skills: { count: 2 } });
  });

  it('la plantilla genera la progresión esperada (1 → 20 y vuelta)', () => {
    registerClassData(template);
    const c20 = levelTo(20);
    const sheet = computeSheet(c20);
    const f = classFeatures(c20)[0];
    // Subclase al nivel 3, mejoras en 4/8/12/16/19 y rasgo de nivel 20 con elección.
    expect(f.subclassLabel).toBe('Juramento');
    expect(f.subclass.name).toBe('Juramento del Faro');
    expect(c20.levels.filter((l) => l.improvement).length).toBe(5);
    expect(sheet.scores.sabiduria.total).toBe(22); // 11 (humano) + 2×4 + 1 = 20 → +2 del nivel 20 (máximo 22)
    expect(sheet.scores.constitucion.total).toBe(13); // 11 + 2 por la elección del nivel 20
    // Tabla de progresión y rasgos por nivel.
    expect(f.table.columns).toEqual(['Luz del alba', 'Daño radiante', 'Paso del alba']);
    // Bono desde la tabla (+10 al nivel 20) + Paso del amanecer (+10 fijo): 30 + 20.
    expect(sheet.speeds.find((x) => x.key === 'velocidad').value).toBe(50);
    // Lanzamiento declarado en el JSON: trucos y preparados por tabla (nivel 20: 3 y 15).
    expect(sheet.spellcasting.entries[0]).toMatchObject({ cantrips: 4, prepared: 15, known: null }); // 3 + 1 (Saber del vigía)
    // «pruebas:carisma» suma a todas las habilidades de Carisma; la iniciativa suma Sabiduría.
    const wisB = Math.max(1, sheet.scores.sabiduria.modifier);
    const persu = sheet.skills.find((x) => x.name === 'Persuasión');
    expect(persu.bonus).toBe(sheet.scores.carisma.modifier + (persu.proficient ? sheet.proficiency : Math.floor(sheet.proficiency / 2)) + wisB);
    expect(sheet.initiative).toBe(sheet.scores.destreza.modifier + Math.floor(sheet.proficiency / 2) + sheet.scores.sabiduria.modifier);
    const hist = sheet.skills.find((x) => x.name === 'Historia');
    expect(hist.bonus).toBe(sheet.scores.inteligencia.modifier + (hist.proficient ? (hist.expert ? 2 : 1) * sheet.proficiency : Math.floor(sheet.proficiency / 2)) + Math.max(1, sheet.scores.sabiduria.modifier));
    // Siempre preparados: Luz (Faro) + el secreto del alba elegido; lista de Clérigo y mitad de competencia.
    expect(sheet.spellcasting.alwaysPrepared.map((x) => x.name)).toContain('Luz');
    expect(sheet.spellcasting.alwaysPrepared).toHaveLength(2);
    expect(sheet.spellcasting.extraLists).toEqual(['clerigo']);
    expect(sheet.skills.find((x) => !x.proficient).halfProficiency).toBe(true);
    // CA sin armadura: 10 + DES + SAB, admite escudo.
    expect(sheet.unarmoredDefense[0]).toMatchObject({ value: 10 + sheet.scores.destreza.modifier + sheet.scores.sabiduria.modifier, escudo: true });
    expect(f.table.rows[19]).toMatchObject({ 'Daño radiante': '2d8' });
    expect(f.levels[4].features.map((x) => x.title)).toEqual(['Ataque extra', 'Tomo del alba']);
    // Efectos automáticos de rasgos de clase y subclase.
    expect(sheet.skills.find((s) => s.name === 'Percepción').sources[0]).toMatchObject({ kind: 'clase', label: 'Vigilia' });
    expect(sheet.defenses.inmunidad_condicion[0].value).toBe('Asustado');
    expect(sheet.defenses.resistencia.map((x) => x.value)).toEqual(['necrotico', 'frio']); // frío: voto de vigilia desde el nivel 15
    expect(sheet.proficiencies.armaduras.map((a) => a.name)).toContain('Armadura pesada');
    // Elecciones: oficio (libre con efecto), votos (opciones con efectos) y habilidad del faro.
    expect(sheet.proficiencies.herramientas.map((a) => a.name)).toContain('Oficio del alba 1');
    expect(sheet.skills.find((s) => s.name === 'Medicina').proficient).toBe(true); // 2.º voto (nivel 9)
    expect(sheet.skills.find((s) => s.name === 'Historia').proficient).toBe(true); // Saber del faro
    expect(sheet.saves.find((s) => s.ability === 'destreza').bonus).toBe(computeSheet(levelTo(5)).scores.destreza.modifier + 1);
    // Conjuros: medio lanzador, Sabiduría, prepara mod + nivel/2, CD de clase.
    expect(sheet.spellcasting.entries[0]).toMatchObject({ ability: 'sabiduria' });
    expect(sheet.spellcasting.slots.slice(0, 5)).toEqual([4, 3, 3, 3, 2]);
    // Bajar 20 → 2 retira la subclase y los efectos ligados a niveles altos.
    const c2 = applyLevelDowns(c20, 2);
    const s2 = computeSheet(c2);
    // «elegir» dentro de una opción: el voto de misericordia (nivel 9) da otra Arma del alba.
    expect(knownChoices(c20, KEY)['arma-del-alba']).toHaveLength(2);
    expect(knownChoices(c2, KEY)['arma-del-alba']).toHaveLength(1);
    // desdeNivel: Vigor del alba suma el nivel de la clase (20) a los PG máximos desde el 14.
    expect(computeSheet(c20).hp.flatBonus).toBe(20);
    expect(computeSheet(applyLevelDowns(c20, 13)).hp.flatBonus).toBe(0);
    // escuela + libroConjuros: el Tomo del alba añade un conjuro de Abjuración al libro.
    const tomo = knownChoices(c20, KEY)['tomo-alba'];
    expect(tomo).toHaveLength(1);
    expect(computeSheet(c20).spellcasting.bookSpells).toEqual(tomo);
    // half_up: espacios desde el nivel 1.
    expect(computeSheet(c2).spellcasting.slots[0]).toBeGreaterThan(0);
    // Efecto con «nivel» dentro de una opción elegida: resistencia al frío del voto de vigilia sólo desde el nivel 15.
    expect(sheet.defenses.resistencia.map((r) => r.value)).toContain('frio');
    expect(s2.defenses.resistencia.map((r) => r.value)).not.toContain('frio');
    expect(c2.subclasses[KEY]).toBeUndefined();
    expect(s2.defenses.inmunidad_condicion).toEqual([]);
    expect(s2.skills.find((s) => s.name === 'Percepción').proficient).toBe(true); // Vigilia es de nivel 1
    expect(setClassSkills(c2, KEY, ['Medicina', 'Religión']).classChoices[KEY].skills).toEqual(['Medicina', 'Religión']);
  });

  it('listaConjuros: la clase declara sus conjuros', () => {
    registerClassData(template);
    const spells = { Luz: { nivel: 'Truco' }, 'Bola de fuego': { nivel: '3' } };
    const mine = filterSpells(spells, { query: '', onlyMine: true }, [KEY]).map(([n]) => n);
    expect(mine).toEqual(['Luz']);
  });
});
