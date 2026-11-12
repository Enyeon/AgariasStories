// Personalidad del trasfondo (Historia) y estilos de alineamiento.
import { describe, it, expect } from 'vitest';
import { createCharacter, createDocument } from '../src/domain/schema.js';
import { parseDocument } from '../src/domain/validation.js';
import { fingerprint } from '../src/services/characters.js';
import {
  TRAIT_SETS, normalizePersonality, traitSetKey, slotsFor, optionsFor, setEntry, getEntry, rollEntry, pickEntry,
} from '../src/domain/personality.js';
import { alignmentStyle, ALIGNMENT_STYLES } from '../src/domain/alignment.js';
import { ALIGNMENTS } from '../src/domain/constants.js';

describe('Personalidad del trasfondo', () => {
  it('cada trasfondo trae 8 rasgos, 6 ideales, 6 vínculos y 6 defectos', () => {
    expect(Object.keys(TRAIT_SETS)).toHaveLength(13);
    for (const set of Object.values(TRAIT_SETS)) {
      expect([set.personality.length, set.ideals.length, set.bonds.length, set.flaws.length]).toEqual([8, 6, 6, 6]);
      for (const e of set.extras) expect(e.options.length).toBe(Number(e.die.slice(1)));
    }
  });

  it('usa las tablas del trasfondo oficial (Solitario → Ermitaño) o las elegidas', () => {
    const c = createCharacter();
    expect(traitSetKey(c)).toBeNull();
    c.background.source = 'official';
    c.background.key = 'solitario';
    expect(traitSetKey(c)).toBe('ermitano');
    expect(slotsFor('ermitano').map((s) => s.id)).toContain('extra:vida-de-reclusion');
    setEntry(c, 'trait1', { mode: 'custom', text: 'x', index: null });
    c.personality.set = 'noble';
    expect(traitSetKey(c)).toBe('noble');
  });

  it('una ficha sin personalidad no cambia (ni su huella)', () => {
    const c = createCharacter();
    const before = fingerprint(c);
    const { character } = parseDocument(createDocument({ ...c, personality: { traits: [{ text: '' }] } }));
    expect(character.personality).toBeUndefined();
    expect(fingerprint(character)).toBe(before);
  });

  it('elegir, tirar y escribir se guardan y sobreviven a exportar', () => {
    const c = createCharacter();
    const [trait1, trait2, ideal] = slotsFor('acolito');
    setEntry(c, 'ideal', pickEntry('acolito', ideal, 1));
    setEntry(c, 'trait1', rollEntry(c, trait1, 'acolito', () => 0));
    // El segundo rasgo nunca repite el primero.
    const second = rollEntry(c, trait2, 'acolito', () => 0);
    expect(second.index).not.toBe(getEntry(c, 'trait1').index);
    setEntry(c, 'trait2', second);
    setEntry(c, 'flaw', { mode: 'custom', text: 'Odio las coles.', index: null });
    const { character } = parseDocument(createDocument(c));
    expect(getEntry(character, 'ideal')).toEqual({ mode: 'list', text: optionsFor('acolito', ideal)[1].text, index: 1 });
    expect(getEntry(character, 'trait1').mode).toBe('random');
    expect(getEntry(character, 'flaw').text).toBe('Odio las coles.');
  });

  it('normaliza datos dañados sin romperse', () => {
    expect(normalizePersonality('x')).toBeNull();
    const p = normalizePersonality({ set: 'inexistente', ideal: { mode: 'raro', text: 5, index: 99 }, extras: { 'MAL ID': { text: 'a' }, origen: { mode: 'list', text: 'Guía', index: 3 } } });
    expect(p.set).toBeNull();
    expect(p.ideal).toEqual({ mode: 'custom', text: '', index: null });
    expect(Object.keys(p.extras)).toEqual(['origen']);
  });
});

describe('Alineamientos', () => {
  it('cada alineamiento tiene su identidad visual', () => {
    expect(ALIGNMENT_STYLES).toHaveLength(9);
    for (const name of ALIGNMENTS) expect(alignmentStyle(name)).toBeTruthy();
    expect(alignmentStyle('CAOTICO BUENO').id).toBe('cb');
    expect(alignmentStyle('')).toBeNull();
  });
});
