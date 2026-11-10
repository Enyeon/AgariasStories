// Catálogo cerrado de efectos mecánicos.
//
// Un efecto es un dato, nunca código: `{ type, ... }`. Lo pueden declarar el
// contenido oficial (dotes, rasgos de clase), el Homebrew del DM y los rasgos
// personalizados de un personaje. El motor de reglas sólo sabe aplicar los
// tipos de este catálogo; cualquier otra cosa se rechaza al validar y el texto
// del rasgo queda como descripción, sin automatizar.

import { ABILITY_KEYS, ABILITY_LABEL, SKILL_NAMES } from './constants.js';

export const DAMAGE_TYPES = Object.freeze([
  // 13 tipos oficiales de D&D 5e.
  { key: 'acido', label: 'Ácido', official: true },
  { key: 'contundente', label: 'Contundente', official: true },
  { key: 'cortante', label: 'Cortante', official: true },
  { key: 'frio', label: 'Frío', official: true },
  { key: 'fuego', label: 'Fuego', official: true },
  { key: 'fuerza', label: 'Fuerza (energía)', official: true },
  { key: 'necrotico', label: 'Necrótico', official: true },
  { key: 'perforante', label: 'Perforante', official: true },
  { key: 'psiquico', label: 'Psíquico', official: true },
  { key: 'radiante', label: 'Radiante', official: true },
  { key: 'relampago', label: 'Relámpago', official: true },
  { key: 'trueno', label: 'Trueno', official: true },
  { key: 'veneno', label: 'Veneno', official: true },
  // Tipos propios de Agarias (decisión del DM, noviembre de 2026).
  { key: 'profano', label: 'Profano', official: false },
  { key: 'sagrado', label: 'Sagrado', official: false },
]);
export const DAMAGE_TYPE_KEYS = Object.freeze(DAMAGE_TYPES.map((d) => d.key));
export const DAMAGE_LABEL = Object.freeze(Object.fromEntries(DAMAGE_TYPES.map((d) => [d.key, d.label])));

export const CONDITIONS = Object.freeze([
  'Agarrado', 'Asustado', 'Aturdido', 'Cegado', 'Derribado', 'Ensordecido', 'Envenenado', 'Hechizado',
  'Incapacitado', 'Inconsciente', 'Invisible', 'Paralizado', 'Petrificado', 'Restringido', 'Agotamiento',
]);

/** Categorías de competencia que puede otorgar un efecto. */
export const PROFICIENCY_KINDS = Object.freeze({
  habilidad: 'Habilidad',
  salvacion: 'Salvación',
  armadura: 'Armadura',
  arma: 'Arma',
  herramienta: 'Herramienta',
  idioma: 'Idioma',
});

/** Destinos de una bonificación numérica. */
export const BONUS_TARGETS = Object.freeze({
  pg_por_nivel: 'PG máximos por nivel',
  pg_max: 'PG máximos',
  iniciativa: 'Iniciativa',
  velocidad: 'Velocidad al caminar',
  salvaciones: 'Todas las tiradas de salvación',
  ...Object.fromEntries(ABILITY_KEYS.map((k) => [`atributo:${k}`, `Puntuación de ${ABILITY_LABEL[k]}`])),
});

/** Recursos especiales que un rasgo puede habilitar. */
export const RESOURCES = Object.freeze({
  criaturas_de_sangre: 'Invocación de criaturas de sangre',
  companero: 'Compañero o criatura vinculada',
});

export const EFFECT_TYPES = Object.freeze({
  competencia: 'Competencia',
  pericia: 'Pericia extra',
  bono: 'Bonificación',
  resistencia: 'Resistencia',
  inmunidad: 'Inmunidad (daño)',
  vulnerabilidad: 'Vulnerabilidad',
  inmunidad_condicion: 'Inmunidad (condición)',
  habilita: 'Habilita recurso',
});

const str = (v, max = 80) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/**
 * Normaliza un efecto. Devuelve null si no pertenece al catálogo o es inválido.
 * Es la única puerta de entrada: el motor nunca ve un efecto sin normalizar.
 */
export function normalizeEffect(raw) {
  if (!raw || typeof raw !== 'object') return null;
  switch (raw.type) {
    case 'competencia': {
      const kind = Object.hasOwn(PROFICIENCY_KINDS, raw.kind) ? raw.kind : null;
      if (!kind) return null;
      let value = str(raw.value);
      if (kind === 'habilidad' && !SKILL_NAMES.includes(value)) return null;
      if (kind === 'salvacion' && !ABILITY_KEYS.includes(value)) return null;
      if (!value) return null;
      return { type: 'competencia', kind, value };
    }
    case 'pericia': {
      const amount = Math.trunc(Number(raw.amount ?? 1));
      return amount >= 1 && amount <= 6 ? { type: 'pericia', amount } : null;
    }
    case 'bono': {
      const target = Object.hasOwn(BONUS_TARGETS, raw.target) ? raw.target : null;
      const value = Math.trunc(Number(raw.value));
      if (!target || !Number.isFinite(value) || value === 0 || Math.abs(value) > 30) return null;
      return { type: 'bono', target, value };
    }
    case 'resistencia':
    case 'inmunidad':
    case 'vulnerabilidad':
      return DAMAGE_TYPE_KEYS.includes(raw.value) ? { type: raw.type, value: raw.value } : null;
    case 'inmunidad_condicion':
      return CONDITIONS.includes(raw.value) ? { type: raw.type, value: raw.value } : null;
    case 'habilita':
      return Object.hasOwn(RESOURCES, raw.value) ? { type: 'habilita', value: raw.value } : null;
    default:
      return null;
  }
}

export function normalizeEffects(list, max = 20) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, max).map(normalizeEffect).filter(Boolean);
}

/** Texto corto y legible de un efecto, para mostrarlo en tarjetas. */
export function describeEffect(e) {
  switch (e.type) {
    case 'competencia': return `Competencia: ${e.kind === 'salvacion' ? `salvación de ${e.value}` : e.value}`;
    case 'pericia': return `+${e.amount} pericia${e.amount > 1 ? 's' : ''}`;
    case 'bono': return `${e.value > 0 ? '+' : ''}${e.value} ${BONUS_TARGETS[e.target]}`;
    case 'resistencia': return `Resistencia: ${DAMAGE_LABEL[e.value]}`;
    case 'inmunidad': return `Inmunidad: ${DAMAGE_LABEL[e.value]}`;
    case 'vulnerabilidad': return `Vulnerabilidad: ${DAMAGE_LABEL[e.value]}`;
    case 'inmunidad_condicion': return `Inmune a la condición ${e.value}`;
    case 'habilita': return RESOURCES[e.value];
    default: return '';
  }
}

/** Suma de bonificaciones `bono` a un destino. */
export function sumBonus(sources, target) {
  return sources.reduce((sum, s) => sum + s.effects
    .filter((e) => e.type === 'bono' && e.target === target)
    .reduce((a, e) => a + e.value, 0), 0);
}
