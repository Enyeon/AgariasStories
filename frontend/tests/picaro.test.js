import { describe, it, expect } from 'vitest';
import { getClass } from '../src/data/index.js';
import { createCharacter } from '../src/domain/schema.js';
import { classFeatures, computeSheet } from '../src/domain/rules.js';
import { applyLevelUps, applyLevelDowns, planLevelUp, setRace } from '../src/domain/progression.js';

// Pícaro transcrito del Manual del Jugador: sube de 1 a 20 con cada subclase.
function rogueTo(n, sub) {
  let c = setRace(createCharacter(), 'Humano');
  for (let i = 0; i < n; i++) {
    const plan = planLevelUp(c, 'picaro');
    const res = applyLevelUps(c, [{
      classKey: 'picaro', hpRoll: 5,
      subclass: plan.needsSubclass ? sub : null,
      improvement: plan.needsImprovement ? { type: 'asi', increases: { destreza: 1, constitucion: 1 } } : null,
      featureChoices: {},
    }]);
    if (res.errors.length) throw new Error(`nivel ${i + 1}: ${res.errors.join(' ')}`);
    c = res.character;
  }
  return c;
}

describe('Pícaro', () => {
  it('conserva las claves de subclase que ya guardan los personajes y añade Soulknife y Espadachín', () => {
    const subs = Object.keys(getClass('picaro').niveles['3'].subClase);
    expect(subs.sort()).toEqual(['asesino', 'embaucador-arcano', 'espadachin', 'ladron', 'soulknife']);
  });

  it('Espadachín: rasgos a los niveles 3, 9, 13 y 17 y Carisma a la iniciativa', () => {
    const sub = getClass('picaro').niveles['3'].subClase.espadachin;
    expect(Object.keys(sub.subNivel)).toEqual(['3', '9', '13', '17']);
    const c = rogueTo(3, 'espadachin');
    c.abilities.carisma = 16;
    const ladron = rogueTo(3, 'ladron');
    ladron.abilities.carisma = 16;
    expect(computeSheet(c).initiative - computeSheet(ladron).initiative).toBe(3);
  });

  for (const sub of ['ladron', 'asesino', 'embaucador-arcano', 'soulknife', 'espadachin']) {
    it(`sube de 1 a 20 como ${sub} y baja a 2`, () => {
      const c = rogueTo(20, sub);
      const f = classFeatures(c)[0];
      expect(f.level).toBe(20);
      expect(f.subclass.key).toBe(sub);
      expect(f.subclass.pending).toBe(false);
      expect(c.levels.filter((l) => l.improvement).length).toBe(5); // 4, 8, 10, 12, 16
      expect(f.table.columns).toEqual(['Ataque Furtivo']);
      // Una fila sólo cuando el Ataque Furtivo cambia (niveles impares): 10 filas.
      expect(f.table.rows.map((r) => r.level)).toEqual([1, 3, 5, 7, 9, 11, 13, 15, 17, 19]);
      expect(f.table.rows.at(-1)).toMatchObject({ 'Ataque Furtivo': '10d6' });
      expect(f.table.currentRow).toBe(19);
      const titles = f.levels.flatMap((l) => l.features.map((x) => x.title));
      expect(titles).toEqual(expect.arrayContaining(['Ataque Furtivo', 'Maestría con Armas', 'Golpe Astuto', 'Mente Escurridiza', 'Bendición Épica', 'Toque de Suerte']));
      expect(titles.join()).not.toMatch(/Faro|Ceniza|Aura|Amanecer|Alba/);
      for (const lv of [3, 9, 13, 17]) expect(f.levels[lv - 1].subFeatures.length).toBeGreaterThan(0);
      const s = computeSheet(c);
      expect(s.saves.filter((x) => x.proficient).map((x) => x.ability).sort()).toEqual(['carisma', 'destreza', 'inteligencia', 'sabiduria']);
      const c2 = applyLevelDowns(c, 2);
      expect(c2.subclasses.picaro).toBeUndefined();
      expect(computeSheet(c2).saves.filter((x) => x.proficient).map((x) => x.ability).sort()).toEqual(['destreza', 'inteligencia']);
    });
  }

  it('aplica sus efectos automáticos', () => {
    const c = rogueTo(15, 'asesino');
    const s = computeSheet(c);
    const json = JSON.stringify(s);
    expect(json).toContain('Jerga de Ladrones');
    expect(json).toContain('Kit de envenenador');
  });
});
