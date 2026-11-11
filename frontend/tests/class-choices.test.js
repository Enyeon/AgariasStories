import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createCharacter } from '../src/domain/schema.js';
import { computeSheet, classFeatures } from '../src/domain/rules.js';
import { applyLevelUp, applyLevelDowns, planLevelUp, setRace, levelNeedsDecisions } from '../src/domain/progression.js';
import {
  knownChoices, classChoiceStatus, fillMissingChoices, replaceChoice, choiceOptions, pendingChoices,
} from '../src/domain/class-choices.js';
import { normalizeCharacter } from '../src/domain/validation.js';
import { autoChoices } from './helpers/auto-choices.js';

const SPELLS = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../src/data/spells.json'), 'utf8'));
const human = () => setRace(createCharacter(), 'Humano');
const ASI = { type: 'asi', increases: { fuerza: 1, constitucion: 1 } };

/** Sube un Guerrero eligiendo `pick(level, plan)` (o lo automático) en cada nivel. */
function fighter(n, sub = 'maestro-batalla', pick = () => null) {
  let c = human();
  for (let i = 0; i < n; i++) {
    const plan = planLevelUp(c, 'guerrero', { subclass: sub });
    const subclass = plan.needsSubclass ? sub : null;
    const elecciones = pick(plan.newClassLevel, plan, c) ?? autoChoices(c, 'guerrero', subclass);
    const res = applyLevelUp(c, { classKey: 'guerrero', hpRoll: 6, subclass, improvement: plan.needsImprovement ? ASI : null, featureChoices: { elecciones } });
    if (res.errors.length) throw new Error(`nivel ${i + 1}: ${res.errors.join(' ')}`);
    c = res.character;
  }
  return c;
}

describe('elecciones de rasgos (Guerrero)', () => {
  it('el nivel 1 pide estilo de combate y 3 maestrías en armas, y no deja continuar sin ellas', () => {
    const plan = planLevelUp(human(), 'guerrero');
    expect(plan.choices.map((g) => [g.lista, g.cantidad])).toEqual([['estilo-combate', 1], ['maestria-armas', 3]]);
    expect(levelNeedsDecisions(human(), 'guerrero')).toBe(true);
    const res = applyLevelUp(human(), { classKey: 'guerrero', featureChoices: { elecciones: { 'maestria-armas': { add: ['Espada larga'] } } } });
    expect(res.errors.join(' ')).toMatch(/Estilo de combate: elige 1/);
    expect(res.errors.join(' ')).toMatch(/Maestría en armas: elige 3/);
    const ok = applyLevelUp(human(), { classKey: 'guerrero', featureChoices: { elecciones: {
      'estilo-combate': { add: ['Defensa'] }, 'maestria-armas': { add: ['Espada larga', 'Arco largo', 'Lanza'] },
    } } });
    expect(ok.errors).toEqual([]);
    expect(knownChoices(ok.character, 'guerrero')).toEqual({ 'estilo-combate': ['Defensa'], 'maestria-armas': ['Espada larga', 'Arco largo', 'Lanza'] });
  });

  it('maestría en armas crece con la tabla (3 → 4 → 5 → 6) y se puede cambiar desde la ficha', () => {
    const c = fighter(16, 'campeon');
    expect(knownChoices(c, 'guerrero')['maestria-armas']).toHaveLength(6);
    const old = knownChoices(c, 'guerrero')['maestria-armas'][0];
    const res = replaceChoice(c, 'guerrero', 'maestria-armas', old, 'Hacha de guerra');
    expect(res.errors).toEqual([]);
    expect(knownChoices(res.character, 'guerrero')['maestria-armas']).toContain('Hacha de guerra');
    expect(knownChoices(res.character, 'guerrero')['maestria-armas']).not.toContain(old);
    // Las maniobras no son «cambiables» fuera de la subida de nivel.
    expect(replaceChoice(c, 'guerrero', 'estilo-combate', 'x', 'y').errors[0]).toMatch(/no se puede cambiar/);
  });

  it('Maestro de Batalla: 3 maniobras + herramienta + habilidad, con sus competencias', () => {
    const c = fighter(3, 'maestro-batalla', (lvl, plan) => (lvl === 3 ? {
      maniobras: { add: ['parada', 'riposte', 'ataque-preciso'] },
      'herramienta-artesano': { add: ['Herramientas de herrero'] },
      'habilidad-estudiante': { add: ['Persuasión'] },
    } : null));
    const s = computeSheet(c);
    expect(s.proficiencies.herramientas.map((h) => h.name)).toContain('Herramientas de herrero');
    expect(s.skills.find((x) => x.name === 'Persuasión').proficient).toBe(true);
    expect(classChoiceStatus(c, 'guerrero').missing).toEqual([]);
  });

  it('rechaza opciones repetidas, ajenas a la lista o ya conocidas', () => {
    const c = fighter(6);
    const known = knownChoices(c, 'guerrero').maniobras;
    const base = { classKey: 'guerrero', hpRoll: 6 };
    const bad = (add, remove = []) => applyLevelUp(c, { ...base, featureChoices: { elecciones: { maniobras: { add, remove } } } }).errors.join(' ');
    expect(bad(['inventada', 'parada'])).toMatch(/no pertenecen/);
    expect(bad([known[0], 'rally'])).toMatch(/ya conoces/);
    expect(bad(['rally', 'riposte'], ['inventada'])).toMatch(/sólo puedes reemplazar algo que ya conozcas/);
  });

  it('nivel 7: 2 maniobras más y puede reemplazar una (opcional)', () => {
    const c6 = fighter(6);
    const before = knownChoices(c6, 'guerrero').maniobras;
    const g = planLevelUp(c6, 'guerrero').choices.find((x) => x.lista === 'maniobras');
    expect(g).toMatchObject({ cantidad: 2, reemplazar: 1 });
    const fresh = choiceOptions(g.def).map((o) => o.value).filter((v) => !before.includes(v));
    const res = applyLevelUp(c6, { classKey: 'guerrero', hpRoll: 6, featureChoices: { elecciones: {
      ...autoChoices(c6, 'guerrero'),
      maniobras: { add: fresh.slice(0, 3), remove: [before[0]] }, // reemplaza 1 → elige 2 + 1
    } } });
    expect(res.errors).toEqual([]);
    const after = knownChoices(res.character, 'guerrero').maniobras;
    expect(after).toHaveLength(5);
    expect(after).not.toContain(before[0]);
  });

  it('bajar de nivel deshace las elecciones de esos niveles', () => {
    const c = fighter(10);
    expect(knownChoices(c, 'guerrero').maniobras).toHaveLength(7);
    const c3 = applyLevelDowns(c, 3);
    expect(knownChoices(c3, 'guerrero').maniobras).toHaveLength(3);
    expect(knownChoices(c3, 'guerrero')['maestria-armas']).toHaveLength(3);
    const c2 = applyLevelDowns(c, 2);
    expect(knownChoices(c2, 'guerrero').maniobras).toBeUndefined();
    expect(computeSheet(c2).proficiencies.herramientas).toEqual([]);
  });

  it('Caballero Arcano: trucos y hechizos de Mago, con el nivel máximo según la tabla', () => {
    const c3 = fighter(3, 'caballero-arcano', (lvl, plan, c) => (lvl === 3 ? null : null));
    const known = knownChoices(c3, 'guerrero');
    expect(known['trucos-mago']).toHaveLength(2);
    expect(known['hechizos-mago']).toHaveLength(3);
    expect(known['hechizos-mago'].every((n) => SPELLS[n].nivel === 1)).toBe(true);
    // Nivel 4: un hechizo más (nivel 1) y cambios opcionales de truco/hechizo.
    const p4 = planLevelUp(c3, 'guerrero').choices;
    expect(p4.find((g) => g.lista === 'hechizos-mago')).toMatchObject({ cantidad: 1, nivelMax: 1, reemplazar: 1 });
    expect(p4.find((g) => g.lista === 'trucos-mago')).toMatchObject({ cantidad: 0, reemplazar: 1 });
    // Nivel 7: hechizos de hasta nivel 2.
    const c6 = fighter(6, 'caballero-arcano');
    expect(planLevelUp(c6, 'guerrero').choices.find((g) => g.lista === 'hechizos-mago').nivelMax).toBe(2);
    // Total al nivel 20 = columna «Hechizos preparados» (13) y 3 trucos.
    const c20 = fighter(20, 'caballero-arcano');
    expect(knownChoices(c20, 'guerrero')['hechizos-mago']).toHaveLength(13);
    expect(knownChoices(c20, 'guerrero')['trucos-mago']).toHaveLength(3);
    // Nivel 10: un truco nuevo + un cambio opcional (se eligen 2 y se olvida 1).
    const c9 = fighter(9, 'caballero-arcano');
    const conocidos = knownChoices(c9, 'guerrero')['trucos-mago'];
    const g10 = planLevelUp(c9, 'guerrero').choices.find((g) => g.lista === 'trucos-mago');
    expect(g10).toMatchObject({ cantidad: 1, reemplazar: 1 });
    const libres = choiceOptions(g10.def, { spells: SPELLS }).map((o) => o.value).filter((v) => !conocidos.includes(v));
    const res = applyLevelUp(c9, { classKey: 'guerrero', hpRoll: 6, featureChoices: { elecciones: {
      ...autoChoices(c9, 'guerrero'), 'trucos-mago': { add: libres.slice(0, 2), remove: [conocidos[0]] },
    } } });
    expect(res.errors.join(' ')).toBe('');
    const ahora = knownChoices(res.character, 'guerrero')['trucos-mago'];
    expect(ahora).toHaveLength(3);
    expect(ahora).not.toContain(conocidos[0]);
  });

  it('Guerrero Psíquico: Mente Protegida da resistencia psíquica desde el nivel 10', () => {
    expect(computeSheet(fighter(9, 'guerrero-psiquico')).defenses.resistencia).toEqual([]);
    expect(computeSheet(fighter(10, 'guerrero-psiquico')).defenses.resistencia.map((r) => r.value)).toEqual(['psiquico']);
  });

  it('personajes antiguos: la ficha detecta lo que falta y lo guarda en su nivel', () => {
    // Guerrero 7 creado antes de que la clase declarase elecciones.
    let c = fighter(7);
    for (const l of c.levels) l.featureChoices = {};
    const st = classChoiceStatus(c, 'guerrero');
    const want = Object.fromEntries(['estilo-combate', 'maestria-armas', 'maniobras', 'herramienta-artesano', 'habilidad-estudiante'].map((k) => [k, st.missing.filter((m) => m.lista === k).reduce((n, m) => n + m.cantidad, 0)]));
    expect(want).toEqual({ 'estilo-combate': 1, 'maestria-armas': 4, maniobras: 5, 'herramienta-artesano': 1, 'habilidad-estudiante': 1 });
    const picks = {};
    let n = 0;
    for (const m of st.missing) {
      const opts = choiceOptions(m.def);
      picks[`${m.level}:${m.lista}`] = opts ? opts.map((o) => o.value).filter((v) => !Object.values(picks).flat().includes(v)).slice(0, m.cantidad) : Array.from({ length: m.cantidad }, () => `Valor ${++n}`);
    }
    const res = fillMissingChoices(c, 'guerrero', picks);
    expect(res.errors).toEqual([]);
    expect(classChoiceStatus(res.character, 'guerrero').missing).toEqual([]);
    // Se guardó en el nivel correcto: al bajar a 6 desaparecen las maniobras del nivel 7.
    expect(knownChoices(applyLevelDowns(res.character, 6), 'guerrero').maniobras).toHaveLength(3);
  });

  it('sobrevive a guardar y cargar (normalizeCharacter)', () => {
    const c = fighter(4);
    const { character } = normalizeCharacter(JSON.parse(JSON.stringify(c)));
    expect(knownChoices(character, 'guerrero')).toEqual(knownChoices(c, 'guerrero'));
  });

  it('las elecciones de la subclase dependen de la subclase elegida en ese nivel', () => {
    const c2 = fighter(2);
    // El Campeón no elige nada al nivel 3 (sólo el cambio opcional de estilo de combate).
    expect(pendingChoices(c2, 'guerrero', 3, 'campeon').filter((g) => g.cantidad > 0)).toEqual([]);
    expect(planLevelUp(c2, 'guerrero', { subclass: 'maestro-batalla' }).choices.filter((g) => g.cantidad > 0).map((g) => g.lista)).toEqual(['maniobras', 'herramienta-artesano', 'habilidad-estudiante']);
    expect(classFeatures(fighter(3, 'campeon'))[0].subclass.key).toBe('campeon');
  });
});
