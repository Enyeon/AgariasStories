import { describe, it, expect } from 'vitest';
import { createCharacter } from '../src/domain/schema.js';
import { computeSheet } from '../src/domain/rules.js';
import { setRace } from '../src/domain/progression.js';
import { getRace } from '../src/data/index.js';

describe('Kenku menor (Razas de Agarias Pt. II)', () => {
  it('vuela 40 pies, camina 30, +2 Int, Trato con Animales e idiomas', () => {
    expect(getRace('Kenku menor')).toBeTruthy();
    const s = computeSheet(setRace(createCharacter(), 'Kenku menor'));
    const speed = (k) => s.speeds.find((x) => x.key === k)?.value;
    expect(speed('velocidad')).toBe(30);
    expect(Object.values(Object.fromEntries(s.speeds.map((x) => [x.key, x.value])))).toContain(40);
    expect(s.scores.inteligencia.total).toBe(12);
    expect(s.skills.find((x) => x.name === 'Trato con Animales').proficient).toBe(true);
    expect(s.languages.fixed ?? s.languages.known ?? JSON.stringify(s.languages)).toBeTruthy();
    expect(JSON.stringify(s.languages)).toContain('Cuervo (Kenku)');
  });
});
