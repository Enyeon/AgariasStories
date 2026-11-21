import { describe, it, expect } from 'vitest';
import races from '../src/data/races.json';
import catalog from '../src/data/race-catalog.json';
import lore from '../src/data/race-lore.json';
import creatures from '../src/data/class-creatures.json';
import spells from '../src/data/spells.json';
import adaptado from '../src/data/classes/adaptado.json';
import { createCharacter, createDocument } from '../src/domain/schema.js';
import { parseDocument } from '../src/domain/validation.js';
import { computeSheet } from '../src/domain/rules.js';
import { creatureOptions, creatureBlock } from '../src/domain/companions.js';
import { validateClassData } from '../src/content/class-data.js';

const EXP = (s) => `Experimento 043 (${s})`;
const exp = (level, { race = EXP('Conejo') } = {}) => {
  const c = createCharacter();
  c.race.key = race;
  c.abilities.sabiduria = 16;
  c.levels = Array.from({ length: level }, () => ({ classKey: 'adaptado', hpRoll: 5, improvement: null, featureChoices: {} }));
  return c;
};

describe('raza Experimento 043', () => {
  const keys = Object.keys(races).filter((k) => k.startsWith('Experimento 043'));

  it('una entrada por Sujeto de origen, en Pt. V, con su tamaño (hasta Grande)', () => {
    expect(keys).toEqual(['Conejo', 'Gato', 'Perro', 'Cuervo', 'Búho', 'Serpiente', 'Oso', 'Ciervo'].map(EXP));
    expect(catalog.find((g) => g.source === 'Razas de Agarias Pt. V: Aliens').races).toEqual(expect.arrayContaining(keys));
    expect(races[EXP('Conejo')].tamano).toBe('Pequeño');
    expect(races[EXP('Oso')].tamano).toBe('Grande');
    for (const k of keys) expect(races[k]).toMatchObject({ linaje: 'experimento-043', claseRecomendada: 'adaptado', tipo: 'Aberración' });
    expect(races.INK).toBeUndefined();
  });

  it('la clave vieja «INK» se abre como Experimento 043 (Conejo)', () => {
    const c = createCharacter();
    c.race.key = 'INK';
    expect(parseDocument(JSON.parse(JSON.stringify(createDocument(c)))).character.race.key).toBe(EXP('Conejo'));
  });

  it('lore corregido: decenas, 43 experimentos, sin «millones» ni «escaparon/liberados», sin nombrar a Vacío', () => {
    const text = lore['experimento-043'].secciones.map((s) => s.texto).join(' ');
    expect(text).toMatch(/43 experimentos/);
    expect(text).toMatch(/decenas/i);
    expect(text).toMatch(/«Sram»/);
    expect(text).not.toMatch(/millones|liberados|siguen naciendo|reconocimiento e infiltración|048/);
    expect(JSON.stringify(races[EXP('Conejo')])).not.toMatch(/Expresividad/);
  });

  it('cada Sujeto es sólo de su raza, no ocupa capacidad y hace algo distinto', () => {
    const c = exp(1, { race: EXP('Gato') });
    const s = computeSheet(c);
    expect(s.creatureGroups.sort()).toEqual(['ink', 'sujetos']);
    const opts = creatureOptions({ groups: s.creatureGroups, raceKey: c.race.key }).map((o) => o.ref);
    expect(opts.filter((r) => r.startsWith('clase:sujetos'))).toEqual(['clase:sujetos:gato']);
    const names = Object.values(creatures.grupos.sujetos.criaturas).map((x) => x.name);
    const repertoire = Object.values(creatures.grupos.ink.criaturas).map((x) => x.name);
    expect(names.filter((n) => repertoire.includes(n))).toEqual([]);
    expect(creatureBlock({ creatureRef: 'clase:sujetos:conejo' }, exp(5))).toMatchObject({ capacity: false, ac: 15 });
  });
});

describe('clase Adaptado', () => {
  it('es válida, sin armas, con hechizos por puntos de Esencia en la pestaña Conjuros', () => {
    expect(validateClassData(adaptado).errors ?? []).toEqual([]);
    expect(adaptado.competencias.armas).toEqual([]);
    expect(adaptado.lanzamiento).toMatchObject({ progression: 'puntos', puntos: 'Esencia' });
    const sc = computeSheet(exp(9)).spellcasting;
    expect(sc.isCaster).toBe(true);
    expect(sc.entries[0]).toMatchObject({ classKey: 'adaptado', maxSpellLevel: 3, points: 'Esencia', cantrips: 3, known: 7 });
    expect(sc.slots.every((n) => n === 0)).toBe(true);
    // Ya no se eligen en la subida de nivel.
    expect(JSON.stringify(adaptado.niveles)).not.toMatch(/hechizos-ink|trucos-ink/);
    for (const n of adaptado.listaConjuros) expect(spells[n], n).toBeTruthy();
  });

  it('Inhibición, Esencia y Capacidad de Manifestación según el nivel', () => {
    const at = (n) => computeSheet(exp(n));
    expect(at(1)).toMatchObject({ inhibited: true, summonCapacity: 0 });
    expect(at(1).resources.find((r) => r.id === 'esencia')).toMatchObject({ max: 4, shortRegain: 3 });
    expect(at(3).summonCapacity).toBe(1);
    expect(at(7).summonCapacity).toBe(2);
    expect(at(13).summonCapacity).toBe(3);
  });

  it('Curas elementales a nivel 5 (sin Sendas): 14 elementos, Tinta incluida, sin daño', () => {
    expect(adaptado.niveles['3'].subClase).toBeUndefined();
    const subs = adaptado.niveles['5'].subClase;
    expect(Object.keys(subs)).toEqual(['acido', 'frio', 'fuego', 'fuerza', 'necrotico', 'psiquico', 'radiante', 'relampago', 'trueno', 'veneno', 'profano', 'sagrado', 'vacio', 'tinta']);
    expect(subs.fuerza.subNivel['5'].infoSubBlock.subBlockDos.subDescripcion).toMatch(/doble de tu nivel/);
    expect(adaptado.niveles['5'].infoBlock.blockUno.descripcion).toMatch(/Habla con tu DM/);
  });

  it('repertorio: tres a nivel 3 y cambios en 7, 11 y 15', () => {
    expect(adaptado.niveles['3'].infoBlock.blockUno.elegir).toEqual({ lista: 'repertorio', cantidad: 3 });
    for (const lv of ['7', '11', '15']) expect(adaptado.niveles[lv].infoBlock.blockUno.elegir).toMatchObject({ cantidad: 0, reemplazar: 1 });
  });

  it('ninguna invocación, Sujeto, Cura ni hechizo hace daño', () => {
    const texts = [
      ...['ink', 'sujetos'].flatMap((g) => Object.values(creatures.grupos[g].criaturas)).flatMap((b) => [...(b.actions ?? []), ...(b.reactions ?? []), ...(b.traits ?? [])].map((t) => t.text)),
      ...Object.values(adaptado.niveles['5'].subClase).flatMap((s) => Object.values(s.subNivel).flatMap((n) => Object.values(n.infoSubBlock).map((b) => b.subDescripcion))),
      ...adaptado.listaConjuros.map((n) => spells[n].origen === 'Agarias' ? spells[n].descripcion : ''),
    ];
    for (const t of texts) expect(t).not.toMatch(/\d+d\d+[^.]*de daño (contundente|perforante|cortante|de fuego|de frío|de ácido|de veneno|de rayo|de relámpago|de trueno|necrótico|psíquico|radiante|de fuerza)/);
  });
});
