import { describe, it, expect } from 'vitest';
import { feetLabel, withCells } from '../src/domain/units.js';
import races from '../src/data/races.json';
import { createCharacter } from '../src/domain/schema.js';
import { computeSheet } from '../src/domain/rules.js';

const dataFiles = import.meta.glob('../src/data/**/*.json', { eager: true, import: 'default' });

describe('pies y casillas (AgSt 1.38)', () => {
  it('feetLabel y withCells', () => {
    expect(feetLabel(30)).toBe('30 pies (6 casillas)');
    expect(feetLabel(5)).toBe('5 pies (1 casilla)');
    expect(feetLabel(2)).toBe('2 pies');
    expect(withCells('a 30 pies de ti')).toBe('a 30 pies (6 casillas) de ti');
    expect(withCells('alcance 60/120 pies')).toBe('alcance 60/120 pies (12/24 casillas)');
    expect(withCells('15 × 5 pies')).toBe('15 × 5 pies (3 × 1 casillas)');
    expect(withCells('20 pies (6m)')).toBe('20 pies (4 casillas) (6m)');
    for (const s of ['a 5 pies (1 casilla)', '1 pie cúbico', '2 pies por cada pie', '20.000 pies']) expect(withCells(s)).toBe(s);
    expect(withCells(withCells('a 30 pies de ti'))).toBe('a 30 pies (6 casillas) de ti');
  });

  it('todos los datos llevan casillas en las distancias de pies múltiplos de 5', () => {
    const missing = [];
    for (const [file, json] of Object.entries(dataFiles)) {
      const text = JSON.stringify(json);
      for (const m of text.matchAll(/(?<![\d.,/×x])(\d+)\s+pies?\b(?!\s*\(|\s+c[úu]bic|\s+cuadrad)/g)) {
        if (Number(m[1]) % 5 === 0 && Number(m[1]) > 0) missing.push(`${file}: ${text.slice(Math.max(0, m.index - 30), m.index + 15)}`);
      }
    }
    expect(missing).toEqual([]);
  });
});

describe('Verdan (IA) y Selenko (AgSt 1.38)', () => {
  it('Verdan (IA): Persuasión con pericia automática', () => {
    const c = createCharacter();
    c.race.key = 'Verdan (IA)';
    const s = computeSheet(c).skills.find((x) => x.name === 'Persuasión');
    expect(s).toMatchObject({ proficient: true, expert: true });
    expect(races['Verdan (IA)'].info).toMatch(/Persuasión \(Pericia\)/);
    expect(computeSheet(c).expertise.used).toBe(0);
  });

  it('el Selenko ya no copia al kobold de Monstruos del Multiverso', () => {
    const r = races['Selenko (Kobold del Vacío)'];
    expect(r.doteOpciones).toBeUndefined();
    expect(r.info).not.toMatch(/Grito Dracónico|Legado Kobold|Monstruos del Multiverso/);
    expect(r.efectos).toContainEqual({ type: 'resistencia', value: 'vacio' });
  });
});
