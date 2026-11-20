import { describe, it, expect } from 'vitest';
import races from '../src/data/races.json';
import catalog from '../src/data/race-catalog.json';
import lore from '../src/data/race-lore.json';
import creatures from '../src/data/class-creatures.json';
import adaptado from '../src/data/classes/adaptado.json';
import { createCharacter } from '../src/domain/schema.js';
import { computeSheet } from '../src/domain/rules.js';
import { creatureOptions, creatureBlock } from '../src/domain/companions.js';
import { validateClassData } from '../src/content/class-data.js';

const ink = (level, { race = 'INK', sub = null } = {}) => {
  const c = createCharacter();
  c.race.key = race;
  c.abilities.sabiduria = 16;
  c.levels = Array.from({ length: level }, () => ({ classKey: 'adaptado', hpRoll: 5, improvement: null, featureChoices: {} }));
  if (sub) c.subclasses = { adaptado: sub };
  return c;
};

describe('raza INK', () => {
  it('está en Pt. V con su historia y recomienda la clase Adaptado', () => {
    expect(catalog.find((g) => g.source === 'Razas de Agarias Pt. V: Aliens').races).toContain('INK');
    expect(races.INK).toMatchObject({ linaje: 'ink', claseRecomendada: 'adaptado', tipo: 'Aberración', tamano: 'Mediano' });
    expect(lore.ink.secciones.length).toBeGreaterThanOrEqual(3);
  });

  it('el lore público no revela el secreto de Vacío (Experimento 048): la cura es sólo un rumor', () => {
    const text = JSON.stringify([lore.ink, races.INK, adaptado, creatures.grupos.ink]);
    expect(text).not.toMatch(/048|Experimento 0|Vacío consigue|cero cuarenta/i);
    expect(lore.ink.secciones.map((s) => s.texto).join(' ')).toMatch(/rumor[\s\S]*cura/);
  });

  it('sin clase: Conejo, caramelos, Poliforme y Contracción; sin Inhibición', () => {
    const c = createCharacter();
    c.race.key = 'INK';
    c.levels = [{ classKey: 'guerrero', hpRoll: 10, improvement: null, featureChoices: {} }];
    const s = computeSheet(c);
    expect(s).toMatchObject({ candyMaker: true, inhibited: false, creatureGroups: ['ink'] });
    expect(s.resources.map((r) => r.id)).toEqual(['poliforme', 'contraccion-defensiva']);
  });
});

describe('clase Adaptado', () => {
  it('es válida y no da armas', () => {
    expect(validateClassData(adaptado).errors ?? []).toEqual([]);
    expect(adaptado.competencias.armas).toEqual([]);
    expect(adaptado.razaRecomendada).toEqual(['INK']);
  });

  it('Inhibición, Esencia y Capacidad de Manifestación según el nivel', () => {
    const at = (n) => computeSheet(ink(n));
    expect(at(1)).toMatchObject({ inhibited: true, summonCapacity: 0 });
    expect(at(1).resources.find((r) => r.id === 'esencia')).toMatchObject({ max: 4, shortRegain: 3 });
    expect(at(3).summonCapacity).toBe(1);
    expect(at(7).summonCapacity).toBe(2);
    expect(at(13).summonCapacity).toBe(3);
    expect(at(20).resources.find((r) => r.id === 'esencia').max).toBe(20);
  });

  it('otra raza con la clase: invocaciones por el Injerto Sram (el Conejo es racial, sólo en el texto)', () => {
    const s = computeSheet(ink(3, { race: 'Humano' }));
    expect(s.creatureGroups).toEqual(['ink']);
    expect(s.candyMaker).toBe(false);
  });

  it('repertorio: 10 invocaciones + Conejo; Conejo y Ruleta no ocupan capacidad; escalan con el nivel', () => {
    const refs = creatureOptions({ groups: ['ink'] }).map((o) => o.ref.split(':').at(-1));
    expect(refs).toEqual(['conejo', 'golem', 'loro', 'ruleta', 'topo', 'pulpo', 'polilla', 'montura', 'esponja', 'arana', 'luciernaga']);
    const c = ink(5);
    expect(creatureBlock({ creatureRef: 'clase:ink:conejo' }, c)).toMatchObject({ capacity: false, ac: 15, hpMax: 13 });
    expect(creatureBlock({ creatureRef: 'clase:ink:ruleta' }, c).capacity).toBe(false);
    expect(creatureBlock({ creatureRef: 'clase:ink:golem' }, c)).toMatchObject({ capacity: true, hpMax: 45 });
  });

  it('ninguna invocación ni hechizo hace daño', () => {
    const texts = [
      ...Object.values(creatures.grupos.ink.criaturas).flatMap((b) => [...(b.actions ?? []), ...(b.reactions ?? []), ...(b.traits ?? [])].map((t) => t.text)),
      ...Object.values(adaptado.listasDeEleccion).flatMap((l) => l.opciones.map((o) => o.descripcion)),
    ];
    for (const t of texts) expect(t).not.toMatch(/\d+d\d+[^.]*de daño (contundente|perforante|cortante|de fuego|de frío|de ácido|de veneno|de rayo|de trueno|necrótico|psíquico|radiante|de fuerza)/);
  });

  it('cada Senda da su invocación o deja elegir una más (tres en total)', () => {
    const subs = adaptado.niveles['3'].subClase;
    const picks = Object.fromEntries(Object.entries(subs).map(([k, s]) => [k, s.subNivel['3'].infoSubBlock.subBlockUno.elegir.cantidad]));
    expect(picks).toEqual({ refugio: 2, insulto: 2, espejo: 3, azar: 2, enjambre: 3 });
    expect(subs.refugio.listasDeEleccion.repertorio.opciones.map((o) => o.id)).not.toContain('golem');
    for (const s of Object.values(subs)) for (const lv of ['7', '11', '15']) expect(s.subNivel[lv].elegir).toMatchObject({ cantidad: 0, reemplazar: 1 });
  });
});
