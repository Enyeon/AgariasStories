import { describe, it, expect } from 'vitest';
import { createCharacter } from '../src/domain/schema.js';
import { computeSheet } from '../src/domain/rules.js';
import { applyLevelUp, planLevelUp, levelNeedsDecisions, setRace } from '../src/domain/progression.js';
import { pendingSpellChoices, fillMissingChoices, levelUpVisibleChoices, knownChoices } from '../src/domain/class-choices.js';
import fs from 'node:fs';
import path from 'node:path';
import { spellAllowance } from '../src/views/sheet/spells.js';

const SPELLS = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../src/data/spells.json'), 'utf8'));
const loadSpells = async () => SPELLS;

function mago(levels) {
  let c = setRace(createCharacter({ name: 'Elminster' }), 'Humano');
  for (let i = 0; i < levels; i++) {
    const r = applyLevelUp(c, { classKey: 'mago', hpRoll: 4 });
    expect(r.errors).toEqual([]);
    c = r.character;
  }
  return c;
}

describe('los conjuros se eligen después, en la pestaña Conjuros', () => {
  it('subir de nivel no obliga a elegir conjuros', () => {
    const c = mago(1);
    expect(levelNeedsDecisions(c, 'mago')).toBe(false);
    const plan = planLevelUp(c, 'mago');
    expect(plan.deferredSpells).toEqual([expect.objectContaining({ lista: 'libro-conjuros', cantidad: 2 })]);
    expect(levelUpVisibleChoices(plan.choices).some((g) => g.lista === 'libro-conjuros')).toBe(false);
  });

  it('lo no elegido queda pendiente y se puede completar por partes', async () => {
    const spells = await loadSpells();
    const c = mago(2);
    expect(pendingSpellChoices(c, 'mago').reduce((t, m) => t + m.cantidad, 0)).toBe(8);
    const first = pendingSpellChoices(c, 'mago')[0];
    const lvl1 = Object.entries(spells).filter(([, s]) => String(s.nivel) === '1' && s.conjuradorTrue?.mago).map(([n]) => n);
    const res = fillMissingChoices(c, 'mago', { [`${first.level}:libro-conjuros`]: lvl1.slice(0, 3) }, { spells });
    expect(res.errors).toEqual([]);
    expect(knownChoices(res.character, 'mago')['libro-conjuros']).toHaveLength(3);
    expect(pendingSpellChoices(res.character, 'mago').reduce((t, m) => t + m.cantidad, 0)).toBe(5);
    // No se aceptan más de los que faltan.
    const over = fillMissingChoices(c, 'mago', { [`${first.level}:libro-conjuros`]: lvl1.slice(0, 7) }, { spells });
    expect(over.errors.join(' ')).toMatch(/como mucho 6/);
  });

  it('la pestaña Conjuros resume lo que aún se puede elegir', async () => {
    const spells = await loadSpells();
    const c = mago(1);
    const a = spellAllowance({ character: c, sheet: computeSheet(c), spells });
    expect(a.choices).toEqual([expect.objectContaining({ classKey: 'mago', titulo: 'Libro de conjuros', cantidad: 6 })]);
    expect(a.cantrips).toBe(3);
    expect(a.prepared).toBeGreaterThan(0);
    expect(a.total).toBe(6 + 3 + a.prepared);
  });
});
