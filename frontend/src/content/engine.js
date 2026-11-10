// Adaptadores: contenido canónico (Homebrew) → forma que lee el motor de reglas.
//
// El motor (domain/rules.js, progression.js…) lee los datos oficiales con su
// formato histórico. En lugar de mantener dos motores, cada elemento Homebrew se
// traduce aquí UNA vez a ese mismo formato. Así oficial y Homebrew pasan por
// exactamente las mismas reglas, validaciones y pantallas.

import { ABILITY_KEYS } from '../domain/constants.js';
import { createBackgroundDefinition } from '../domain/schema.js';

const NUMBER_WORDS = { 0: 'cero', 1: 'una', 2: 'dos', 3: 'tres', 4: 'cuatro', 5: 'cinco', 6: 'seis' };
const ABIL = { fuerza: 'Fuerza', destreza: 'Destreza', constitucion: 'Constitución', inteligencia: 'Inteligencia', sabiduria: 'Sabiduría', carisma: 'Carisma' };
const join = (l) => (l.length ? (l.length === 1 ? l[0] : `${l.slice(0, -1).join(', ')} y ${l.at(-1)}`) : 'Ninguna');

function classStartingText(item) {
  const skills = item.skills.any
    ? `escoge ${NUMBER_WORDS[item.skills.count] ?? item.skills.count} cualesquiera`
    : `escoge ${NUMBER_WORDS[item.skills.count] ?? item.skills.count} de entre ${join(item.skills.options)}`;
  return [
    'Atributos de clase:',
    `❖ Tiradas de Salvación: ${join(item.saves.map((k) => ABIL[k]))}.`,
    '❖ Puntos de golpe:',
    `    :: Dado de golpe: 1d${item.hitDie}.`,
    `    :: Nivel 1: ${item.hitDie} + tu modificador de Constitución.`,
    `    :: Niveles siguientes: 1d${item.hitDie} (o ${item.hitDie / 2 + 1}) + tu modificador de Constitución por nivel.`,
    '❖ Competencias:',
    `    :: Armadura: ${join(item.armor)}.`,
    `    :: Armas: ${join(item.weapons)}.`,
    `    :: Herramientas: ${join(item.tools)}.`,
    `    :: Habilidades: ${skills}.`,
    ...(item.equipment.length ? ['❖ Equipo inicial:', ...item.equipment.map((e) => `    :: ${e}`)] : []),
    ...(item.gold ? [`    :: Alternativa: ${item.gold} po.`] : []),
    '❖ Fuente: Homebrew.',
  ].join('\n');
}

function toClass(item, ref) {
  const niveles = {};
  for (let n = 1; n <= 20; n++) niveles[n] = {};
  niveles[1].descripcion = item.description.split('\n')[0]?.slice(0, 300) ?? '';
  niveles[1].descripcionLarga = item.description;
  niveles[1].atributoInicial = classStartingText(item);
  for (const f of item.features.filter((x) => !x.subclass)) {
    const lvl = niveles[f.level];
    lvl.infoBlock ??= {};
    lvl.infoBlock[`b${Object.keys(lvl.infoBlock).length + 1}`] = { name: f.name, descripcion: f.text };
  }
  if (item.subclasses.length && item.subclassLevel) {
    niveles[item.subclassLevel].subClase = Object.fromEntries(item.subclasses.map((s) => {
      const subNivel = {};
      for (const f of item.features.filter((x) => x.subclass === s.key)) {
        subNivel[f.level] ??= { infoSubBlock: {} };
        const blocks = subNivel[f.level].infoSubBlock;
        blocks[`s${Object.keys(blocks).length + 1}`] = { subName: f.name, subDescripcion: f.text };
      }
      return [s.key, { subNombre: s.name, subDescripcion: s.description, subNivel }];
    }));
  }
  const casterTable = { completo: 'full', medio: 'half', pacto: 'pact' }[item.caster] ?? null;
  return {
    nombre: item.name,
    claseName: ref,
    seccion: 'homebrew',
    homebrew: true,
    dadoDeGolpe: item.hitDie,
    nivelesDeAumento: item.asiLevels,
    conjurador: casterTable ? true : false,
    attribute: item.spellAbility ?? undefined,
    lanzamiento: casterTable ? { progression: casterTable, preparedFrom: casterTable === 'pact' ? null : 'full' } : null,
    subclaseNombre: item.subclassLabel,
    competencias: {
      salvaciones: item.saves,
      armaduras: item.armor,
      armas: item.weapons,
      herramientas: item.tools,
      habilidades: { elegir: item.skills.count, de: item.skills.any ? 'cualquiera' : item.skills.options },
    },
    competenciasMulticlase: { armaduras: item.multiclass.armor, armas: item.multiclass.weapons, herramientas: item.multiclass.tools, habilidades: null },
    equipoInicial: item.equipment,
    oroInicial: item.gold,
    fuenteReglas: item.source || 'Homebrew',
    niveles,
  };
}

function toRace(item) {
  const out = {
    nombre: item.name,
    homebrew: true,
    velocidad: item.speed.walk,
    lenguage: `Idiomas: ${item.languages.join(', ') || 'ninguno'}${item.extraLanguages ? ` y ${item.extraLanguages} a tu elección` : ''}.`,
    yaHabla: item.languages,
    info: [
      item.description,
      item.traits.length ? 'Rasgos de Raza:' : '',
      ...item.traits.map((t) => `♻ ${t.name}. ${t.text}`),
    ].filter(Boolean).join('\n'),
    efectos: item.effects,
  };
  if (item.extraLanguages) out.languageElection = item.extraLanguages;
  if (item.speed.fly) out.fly = item.speed.fly;
  if (item.speed.swim) out.swim = item.speed.swim;
  if (item.speed.climb) out.climb = item.speed.climb;
  for (const k of ABILITY_KEYS) if (item.abilities[k]) out[k] = item.abilities[k];
  if (item.abilityChoice) {
    out.choice = { count: item.abilityChoice.count, bonus: item.abilityChoice.bonus, allowedChoices: item.abilityChoice.allowed };
  }
  if (item.allowsFeat) out.puedeElegirDote = true;
  return out;
}

function toFeat(item) {
  const requisito = { ...item.prerequisites.abilities };
  if (item.prerequisites.level) requisito.niveles = item.prerequisites.level;
  if (item.prerequisites.caster) requisito.conjurador = true;
  return {
    nombre: item.name,
    homebrew: true,
    habilidad: `${item.description}${item.repeatable ? '\nPuedes elegir esta dote varias veces.' : ''}`,
    ...(Object.keys(requisito).length ? { requisito } : {}),
    ...(item.abilityOptions.length ? { aumentarStatOpcional: item.abilityOptions.map((k) => ({ [k]: 1 })) } : {}),
    ...(item.expertise ? { pericias: item.expertise } : {}),
    efectos: item.effects,
  };
}

function toSpell(item) {
  return {
    nombre: item.name,
    homebrew: true,
    tipo: ['Homebrew'],
    escuela: item.school,
    nivel: item.level === 0 ? 'Truco' : String(item.level),
    origen: item.source || 'Homebrew',
    componentes: item.components,
    tiempoLanzamiento: item.castingTime,
    alcance: item.range,
    duracion: `${item.concentration ? 'Concentración, ' : ''}${item.duration}`,
    ...(item.attack ? { ataque: item.attack } : {}),
    listaConjurador: item.classes.length ? 'Homebrew' : 'Cualquier lanzador (si el DM lo permite)',
    conjuradorTrue: Object.fromEntries(item.classes.map((k) => [k, true])),
    descripcion: item.description,
    ...(item.ritual ? { ritual: true } : {}),
  };
}

/**
 * Traduce un elemento canónico a la forma del motor. Los tipos que el motor no
 * lee directamente (objeto, otro) se devuelven tal cual.
 */
export function toEngine(type, item, ref) {
  switch (type) {
    case 'clase': return toClass(item, ref);
    case 'raza': return toRace(item);
    case 'dote': return toFeat(item);
    case 'hechizo': return toSpell(item);
    case 'trasfondo': return createBackgroundDefinition({ ...item, ref });
    default: return { ...item, homebrew: true };
  }
}
