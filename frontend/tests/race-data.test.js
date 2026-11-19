// Datos de razas, historia (lore) y anatomía de los dracónidos (AgSt 1.30).
import { describe, it, expect } from 'vitest';
import races from '../src/data/races.json';
import catalog from '../src/data/race-catalog.json';
import lore from '../src/data/race-lore.json';
import { validateRaceData } from '../src/content/race-data.js';
import { getRaceLore, raceHasDraconicAnatomy, raceProfile } from '../src/data/index.js';
import { createCharacter, createDocument } from '../src/domain/schema.js';
import { parseDocument } from '../src/domain/validation.js';
import { anatomyTraits } from '../src/domain/race-anatomy.js';
import { setRace } from '../src/domain/progression.js';

describe('datos de razas', () => {
  it('no tienen errores (el catálogo, las razas y la historia encajan)', () => {
    const { errors } = validateRaceData({ races, catalog, lore });
    expect(errors).toEqual([]);
  });

  it('el catálogo de Agarias tiene Pt. V: Aliens y Pt. VI: Extra\'s', () => {
    const names = catalog.map((g) => g.source).filter((s) => s.startsWith('Razas de Agarias'));
    expect(names.slice(-2)).toEqual(['Razas de Agarias Pt. V: Aliens', "Razas de Agarias Pt. VI: Extra's"]);
    const aliens = catalog.find((g) => g.source.endsWith('Aliens')).races;
    expect(aliens).toEqual(expect.arrayContaining(['Dracónido Erudito (Vacío)', 'Dracónido Superviviente (Vacío)']));
    expect(catalog.find((g) => g.source.startsWith('Razas de Agarias Pt. I')).races).not.toContain('Dracónido Erudito (Vacío)');
  });

  it('el validador detecta errores típicos', () => {
    const bad = validateRaceData({
      races: { X: { info: 'a', tamano: 'Gigantesco', linaje: 'Con Espacios', fuerza: '2' } },
      catalog: [{ source: 'G', races: ['X', 'Y'] }],
      lore: { $comment: '', huerfano: { nombre: 'H', secciones: [{ titulo: 't', texto: '' }] } },
    });
    expect(bad.errors.join('\n')).toMatch(/Y.*no existe/);
    expect(bad.errors.join('\n')).toMatch(/tamaño/);
    expect(bad.errors.join('\n')).toMatch(/linaje/);
    expect(bad.errors.join('\n')).toMatch(/fuerza/);
    expect(bad.errors.join('\n')).toMatch(/sección sin texto/);
  });
});

describe('alas y cola de los dracónidos', () => {
  it('sólo las 15 razas «Dracónido…» las tienen', () => {
    const drac = Object.keys(races).filter((k) => raceHasDraconicAnatomy(k));
    expect(drac).toHaveLength(15);
    expect(drac.every((k) => k.startsWith('Dracónido'))).toBe(true);
    expect(raceHasDraconicAnatomy('Albertina')).toBe(false);
  });

  it('se guardan sólo si hay alguna, y cambiar de raza las borra', () => {
    const c = createCharacter();
    c.race.key = 'Dracónido (Fuego)';
    expect(parseDocument(createDocument(c)).character.race).not.toHaveProperty('anatomy');
    c.race.anatomy = { alas: true, cola: false };
    expect(parseDocument(createDocument(c)).character.race.anatomy).toEqual({ alas: true, cola: false });
    expect(setRace(c, 'Alto Elfo').race).not.toHaveProperty('anatomy');
  });

  it('con alas aparece el Vuelo dracónico, disponible desde el nivel 5', () => {
    const c = createCharacter();
    c.race.key = 'Dracónido (Fuego)';
    c.race.anatomy = { alas: true, cola: true };
    const low = anatomyTraits(c, 3);
    expect(low.map((t) => t.name)).toEqual(['Vuelo dracónico', 'Cola']);
    expect(low[0].available).toBe(false);
    expect(anatomyTraits(c, 5)[0].available).toBe(true);
    c.race.key = 'Alto Elfo';
    expect(anatomyTraits(c, 5)).toEqual([]);
  });
});

describe('historia de las razas', () => {
  it('sin entrada en race-lore.json no hay historia', () => {
    expect(getRaceLore('Alto Elfo')).toBeNull();
    expect(raceProfile('Alto Elfo')).toMatchObject({ tipo: null, tamano: null });
  });
});
