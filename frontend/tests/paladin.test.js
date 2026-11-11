import { describe, it, expect } from 'vitest';
import { getClass } from '../src/data/index.js';
import { createCharacter } from '../src/domain/schema.js';
import { computeSheet, classFeatures } from '../src/domain/rules.js';
import { computeSpellSlots } from '../src/domain/spellcasting.js';
import { applyLevelUp, applyLevelDowns, planLevelUp, setRace } from '../src/domain/progression.js';
import { knownChoices } from '../src/domain/class-choices.js';
import { autoChoices } from './helpers/auto-choices.js';

const ASI = { type: 'asi', increases: { carisma: 2 } };
function paladin(n, { sub = 'devocion', estilo = 'dote', cha = 10 } = {}) {
  let c = setRace(createCharacter(), 'Humano');
  c.abilities.carisma = cha;
  for (let i = 0; i < n; i++) {
    const plan = planLevelUp(c, 'paladin', { subclass: sub });
    const subclass = plan.needsSubclass ? sub : null;
    let el = autoChoices(c, 'paladin', subclass);
    if (el['estilo-combate-paladin']) {
      el = { ...el, 'estilo-combate-paladin': { add: [estilo], remove: [] } };
      delete el['dote-estilo-combate']; delete el['trucos-guerrero-bendito'];
      if (estilo === 'dote') el['dote-estilo-combate'] = { add: ['Defensa'], remove: [] };
      else el['trucos-guerrero-bendito'] = { add: ['Guía', 'Llama sagrada'], remove: [] };
    }
    const res = applyLevelUp(c, { classKey: 'paladin', hpRoll: 6, subclass, improvement: plan.needsImprovement ? ASI : null, featureChoices: { elecciones: el } });
    if (res.errors.length) throw new Error(`nivel ${i + 1}: ${res.errors.join(' ')}`);
    c = res.character;
  }
  return c;
}
const sheet = (c) => computeSheet(c);
const prepared = (c) => sheet(c).spellcasting.alwaysPrepared.map((x) => x.name);

describe('Paladín', () => {
  it('lanza con Carisma (antes figuraba Sabiduría), con espacios desde el nivel 1 y preparados por tabla', () => {
    const e1 = sheet(paladin(1)).spellcasting;
    expect(e1.entries[0]).toMatchObject({ ability: 'carisma', prepared: 2, cantrips: null });
    expect(e1.slots.slice(0, 2)).toEqual([2, 0]);
    expect(sheet(paladin(5)).spellcasting.slots.slice(0, 2)).toEqual([4, 2]);
    expect(sheet(paladin(20)).spellcasting).toMatchObject({ slots: [4, 3, 3, 3, 2, 0, 0, 0, 0] });
    expect(sheet(paladin(20)).spellcasting.entries[0].prepared).toBe(15);
  });

  it('multiclase 2024: los lanzadores medios redondean hacia arriba', () => {
    // Paladín 3 + Mago 1 → nivel de lanzador 2 + 1 = 3.
    expect(computeSpellSlots([{ classKey: 'paladin', level: 3 }, { classKey: 'mago', level: 1 }]).slots.slice(0, 2)).toEqual([4, 2]);
  });

  it('Estilo de Combate: dote (se escribe) o Guerrero Bendito (abre la elección de 2 trucos de Clérigo)', () => {
    const plan = planLevelUp(paladin(1), 'paladin');
    expect(plan.choices.map((g) => g.lista)).toEqual(['estilo-combate-paladin']);
    // Sin los trucos, Guerrero Bendito no deja continuar.
    const bad = applyLevelUp(paladin(1), { classKey: 'paladin', hpRoll: 6, featureChoices: { elecciones: { 'estilo-combate-paladin': { add: ['guerrero-bendito'] } } } });
    expect(bad.errors.join(' ')).toMatch(/Trucos de Guerrero Bendito: elige 2/);
    const gb = paladin(2, { estilo: 'guerrero-bendito' });
    expect(prepared(gb)).toEqual(expect.arrayContaining(['Guía', 'Llama sagrada']));
    expect(knownChoices(gb, 'paladin')['dote-estilo-combate']).toBeUndefined();
    const dote = paladin(2, { estilo: 'dote' });
    expect(knownChoices(dote, 'paladin')['dote-estilo-combate']).toEqual(['Defensa']);
    // Al nivel 3 se ofrece cambiar un truco de Guerrero Bendito (opcional).
    expect(planLevelUp(gb, 'paladin').choices.find((g) => g.lista === 'trucos-guerrero-bendito')).toMatchObject({ cantidad: 0, reemplazar: 1 });
  });

  it('Golpe Divino y Encontrar Corcel siempre preparados; maestría en 2 armas', () => {
    expect(prepared(paladin(2))).toContain('Golpe Divino');
    expect(prepared(paladin(5))).toContain('Hallar corcel');
    expect(knownChoices(paladin(1), 'paladin')['maestria-armas']).toHaveLength(2);
  });

  it('Aura de Protección (6): + Carisma (mín. +1) a todas las salvaciones', () => {
    const s5 = sheet(paladin(5, { cha: 16 }));
    const s6 = sheet(paladin(6, { cha: 16 }));
    const cha = s6.scores.carisma.modifier;
    expect(cha).toBeGreaterThan(1);
    for (const k of ['fuerza', 'destreza', 'sabiduria']) {
      expect(s6.saves.find((x) => x.ability === k).bonus - s5.saves.find((x) => x.ability === k).bonus).toBe(cha);
    }
    const low = sheet(paladin(6, { cha: 8 }));
    const lowPrev = sheet(paladin(5, { cha: 8 }));
    expect(low.saves[0].bonus - lowPrev.saves[0].bonus).toBe(1); // mínimo +1
  });

  it('Aura de Coraje (10), Devoción (7) y Ancianos (7)', () => {
    expect(sheet(paladin(10)).defenses.inmunidad_condicion.map((x) => x.value)).toEqual(expect.arrayContaining(['Asustado', 'Hechizado']));
    expect(sheet(paladin(7, { sub: 'antiguos' })).defenses.resistencia.map((r) => r.value).sort()).toEqual(['necrotico', 'psiquico', 'radiante']);
  });

  it('conserva las claves de juramento y añade Gloria; sólo Devoción queda incompleto', () => {
    expect(Object.keys(getClass('paladin').niveles['3'].subClase)).toEqual(['devocion', 'gloria', 'antiguos', 'venganza']);
    expect(classFeatures(paladin(20, { sub: 'venganza' }))[0].subclass).toMatchObject({ key: 'venganza', pending: false });
    expect(classFeatures(paladin(20, { sub: 'devocion' }))[0].subclass.pending).toBe(true);
    expect(applyLevelDowns(paladin(10), 5).levels).toHaveLength(5);
  });

  it('hechizos de juramento siempre preparados por nivel', () => {
    expect(prepared(paladin(3, { sub: 'venganza' }))).toEqual(expect.arrayContaining(['Perdición', 'Marca del cazador']));
    expect(prepared(paladin(17, { sub: 'venganza' }))).toEqual(expect.arrayContaining(['Acelerar', 'Destierro', 'Inmovilizar monstruo', 'Escudriñar']));
    expect(prepared(paladin(9, { sub: 'antiguos' }))).toEqual(expect.arrayContaining(['Hablar con los animales', 'Rayo de luna', 'Crecimiento vegetal']));
    expect(prepared(paladin(4, { sub: 'gloria' }))).toEqual(expect.arrayContaining(['Saeta guiada', 'Heroísmo']));
    expect(prepared(paladin(4, { sub: 'gloria' }))).not.toContain('Arma mágica');
  });

  it('Gloria: Aura de Agilidad (+10 pies de velocidad al nivel 7)', () => {
    const walk = (c) => sheet(c).speeds.find((x) => x.key === 'velocidad').value;
    expect(walk(paladin(7, { sub: 'gloria' })) - walk(paladin(6, { sub: 'gloria' }))).toBe(10);
  });
});
