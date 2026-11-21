import { describe, it, expect } from 'vitest';
import anomalia from '../src/data/classes/anomalia.json';
import spells from '../src/data/spells.json';
import creatures from '../src/data/class-creatures.json';
import pack from '../../docs/homebrew/secretos-del-plano-anomalo.json';
import { createCharacter } from '../src/domain/schema.js';
import { computeSheet } from '../src/domain/rules.js';
import { normalizeEffect } from '../src/domain/effects.js';
import { creatureBlock } from '../src/domain/companions.js';
import { validateClassData } from '../src/content/class-data.js';
import { validateContent } from '../src/content/schema.js';

const anom = (level, { sab = 16, sub = null } = {}) => {
  const c = createCharacter();
  c.abilities.sabiduria = sab;
  c.levels = Array.from({ length: level }, () => ({ classKey: 'anomalia', hpRoll: 4, improvement: null, featureChoices: {} }));
  if (sub) c.subclasses = { anomalia: sub };
  return c;
};
const allText = JSON.stringify(anomalia);
const ownSpells = anomalia.listaConjuros.filter((n) => spells[n].conjuradorTrue?.anomalia);

describe('clase Anomalía (AgSt 1.39)', () => {
  it('los datos de la clase son válidos', () => {
    expect(validateClassData(anomalia).errors ?? []).toEqual([]);
  });

  it('lanza con Sabiduría y prepara nivel + Sabiduría; trucos 2/3/4; espacios de lanzador completo', () => {
    const s = computeSheet(anom(5));
    const e = s.spellcasting.entries[0];
    expect(e).toMatchObject({ ability: 'sabiduria', prepared: 8, cantrips: 3 });
    expect(s.spellcasting.slots.slice(0, 3)).toEqual([4, 3, 2]);
    expect(computeSheet(anom(1)).spellcasting.entries[0].cantrips).toBe(2);
    expect(computeSheet(anom(10)).spellcasting.entries[0].cantrips).toBe(4);
  });

  it('Estabilidad = BC + Sabiduría, sin recuperación en descanso corto', () => {
    const r = computeSheet(anom(5)).resources.find((x) => x.id === 'estabilidad');
    expect(r).toMatchObject({ max: 3 + 3, shortRegain: 0 });
    expect(normalizeEffect({ type: 'recurso', id: 'xx', nombre: 'X', max: { bc: true, atributo: 'sabiduria' } }).max).toEqual({ bc: true, atributo: 'sabiduria', minimo: 0 });
  });

  it('cada rasgo fuerte tiene su límite de usos', () => {
    const ids = computeSheet(anom(20)).resources.map((r) => r.id);
    for (const id of ['conexion-caotica', 'ondas-distorsion', 'reaccion-improbable', 'zona-inestable', 'tormenta-errores', 'portal-anomalo',
      'ayuda-anomala', 'realidad-inestable', 'eco-imposible', 'singularidad', 'avatar-zzeryxia']) expect(ids).toContain(id);
    const para = computeSheet(anom(14, { sub: 'senda1' })).resources.map((r) => r.id);
    expect(para).toEqual(expect.arrayContaining(['espejismo-alterado', 'ciclo-invertido', 'paradox']));
    const virus = computeSheet(anom(14, { sub: 'senda3' })).resources.map((r) => r.id);
    expect(virus).toEqual(expect.arrayContaining(['replicacion', 'devorador-conjuros', 'autopurga']));
  });

  it('Ayuda Anómala (nivel 13) habilita sus manifestaciones, que no ocupan capacidad', () => {
    expect(computeSheet(anom(12)).creatureGroups).not.toContain('anomalia');
    expect(computeSheet(anom(13)).creatureGroups).toContain('anomalia');
    expect(Object.keys(creatures.grupos.anomalia.criaturas)).toHaveLength(3);
    expect(creatureBlock({ creatureRef: 'clase:anomalia:globo-espejos' }, anom(13))).toMatchObject({ capacity: false, ac: 18, hpMax: 59 });
  });

  it('las cuatro Hebras conservan sus claves y la .exe elige Cualidades a nivel 3 y 15', () => {
    const subs = anomalia.niveles['3'].subClase;
    expect(Object.keys(subs)).toEqual(['senda1', 'senda2', 'senda3', 'senda4']);
    expect(Object.values(subs).map((s) => s.subNombre)).toEqual(['Hebra Paradoja', 'Hebra Error', 'Hebra Virus', 'Hebra .exe']);
    for (const s of Object.values(subs)) expect(Object.keys(s.subNivel)).toEqual(expect.arrayContaining(['3', '6', '10', '14']));
    expect(subs.senda4.listasDeEleccion.cualidades.opciones).toHaveLength(12);
    expect(subs.senda4.subNivel['15'].infoSubBlock.subBlockUno.elegir).toEqual({ lista: 'cualidades', cantidad: 2 });
  });

  it('lista de conjuros: todos existen, los de daño lo declaran y los oficiales modificados lo dicen', () => {
    for (const n of anomalia.listaConjuros) expect(spells[n], n).toBeTruthy();
    expect(anomalia.listaConjuros).toEqual(expect.arrayContaining(['Escudo', 'Armadura de mago', 'Perdición', 'Clarividencia', 'Invocar aberración']));
    for (const n of ['Superior Reign', 'Armagedón', 'Poema de la Destrucción']) expect(spells[n]).toBeUndefined();
    for (const n of ownSpells) {
      const d = spells[n].descripcion;
      // Daño a otros (no el que se hace uno mismo, como Rebobinar Destino) ⇒ tipo «Daño», para la Inhibición del Adaptado.
      if (/(recibe|reciben) \d+d\d+[^.]*de daño/.test(d) && n !== 'Rebobinar Destino') expect(spells[n].tipo, n).toContain('Daño');
    }
    for (const n of ['Descarga del caos', 'Brazos de Hadar', 'Bocas Hambrientas de Hadar', 'Contactar otro plano', 'Reparación de código']) {
      expect(spells[n].descripcion, n).toMatch(/Versión de Agarias de «/);
    }
  });

  it('trucos corregidos: Catástrofe pide salvación y no ignora inmunidades; Toque da PG temporales', () => {
    const cat = spells['Catástrofe / Apocalipsis'].descripcion;
    expect(cat).toMatch(/salvación de Constitución/);
    expect(cat).not.toMatch(/inmunidad/i);
    expect(spells['Toque del Anómalo'].descripcion).toMatch(/PG temporales/);
  });

  it('lore: Zzeryxia y Animalía, sin la Deidad Primigenia ni Lord 100; aclaración de Hadar', () => {
    expect(allText).toMatch(/Zzeryxia, la Diosa anómala/);
    expect(allText).toMatch(/Animalía/);
    expect(allText).toMatch(/Umbrael/);
    expect(allText).not.toMatch(/Primigenia|Lord 100|no lanza conjuros/);
    expect(allText).toMatch(/lo que los brujos llaman Hadar es un fragmento del Plano Anómalo/);
    expect(JSON.stringify(spells['Contactar otro plano'])).toMatch(/Zzeryxia/);
  });

  it('los Secretos del Plano Anómalo son extensiones válidas con código del DM', () => {
    expect(pack.format).toBe('agarias-homebrew-pack');
    expect(pack.items).toHaveLength(3);
    for (const it of pack.items) {
      const { item, errors } = validateContent(it.type, it.data);
      expect(errors, it.data.name).toEqual([]);
      expect(item).toMatchObject({ classKey: 'anomalia', kind: 'rasgos', access: 'desbloqueo' });
    }
  });
});
