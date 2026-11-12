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
  trucos: 'Trucos conocidos de la clase',
  ...Object.fromEntries(ABILITY_KEYS.map((k) => [`atributo:${k}`, `Puntuación de ${ABILITY_LABEL[k]}`])),
  ...Object.fromEntries(SKILL_NAMES.map((n) => [`habilidad:${n}`, `Pruebas de ${n}`])),
  // Todas las pruebas de característica de un atributo (p. ej. Glamour de Otro Mundo: Carisma).
  ...Object.fromEntries(ABILITY_KEYS.map((k) => [`pruebas:${k}`, `Todas las pruebas de ${ABILITY_LABEL[k]}`])),
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
  ca_sin_armadura: 'CA sin armadura',
  medio_competencia: 'Mitad de competencia en pruebas',
  conjuro_preparado: 'Conjuro siempre preparado',
  lista_conjuros: 'Lista de conjuros adicional',
  conjuro_libro: 'Conjuro en el libro de conjuros',
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
      // Bono que sale de una columna de la tabla de progresión de la clase
      // (p. ej. «Movimiento sin armadura»). Sólo en datos de clase: el valor se
      // resuelve con el nivel del personaje en effectSources().
      if (target && typeof raw.desdeTabla === 'string' && raw.desdeTabla.trim() && raw.value === undefined) {
        return { type: 'bono', target, desdeTabla: raw.desdeTabla.trim().slice(0, 60) };
      }
      // Bono igual al nivel en la clase que da el rasgo (+ `mas`), p. ej. Resiliencia
      // Dracónica: PG máximos = nivel de Hechicero. Se resuelve en effectSources().
      if (target && raw.desdeNivel === true && raw.value === undefined) {
        const mas = Math.trunc(Number(raw.mas ?? 0));
        return { type: 'bono', target, desdeNivel: true, ...(Number.isFinite(mas) && mas ? { mas } : {}) };
      }
      // Bono igual al modificador de un atributo (con mínimo opcional), p. ej.
      // Taumaturgo: Arcanos y Religión + mod. de Sabiduría (mínimo +1).
      if (target && ABILITY_KEYS.includes(raw.desdeAtributo) && raw.value === undefined) {
        const minimo = raw.minimo === undefined ? null : Math.trunc(Number(raw.minimo));
        return { type: 'bono', target, desdeAtributo: raw.desdeAtributo, ...(Number.isFinite(minimo) ? { minimo } : {}) };
      }
      const value = Math.trunc(Number(raw.value));
      if (!target || !Number.isFinite(value) || value === 0 || Math.abs(value) > 30) return null;
      // Aumento de atributo que también sube su máximo (p. ej. +2 Inteligencia,
      // máximo 22, en un rasgo de subclase). Sólo con `atributo:<clave>`.
      const maximo = Math.trunc(Number(raw.maximo));
      if (target.startsWith('atributo:') && Number.isFinite(maximo) && maximo > 20 && maximo <= 30) return { type: 'bono', target, value, maximo };
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
    case 'medio_competencia': {
      // «Experto en todos los oficios»: mitad del bono (redondeo abajo) en
      // pruebas de característica sin competencia, incluida la iniciativa.
      // Con `atributos`, sólo en las pruebas de esos atributos (Enciclopedia
      // andante del Ingeniero: Inteligencia); la iniciativa, si incluye Destreza.
      const atributos = Array.isArray(raw.atributos) ? [...new Set(raw.atributos.filter((k) => ABILITY_KEYS.includes(k)))] : [];
      return atributos.length ? { type: 'medio_competencia', atributos } : { type: 'medio_competencia' };
    }
    case 'conjuro_preparado': {
      const value = typeof raw.value === 'string' ? raw.value.trim().slice(0, 80) : '';
      return value ? { type: 'conjuro_preparado', value } : null;
    }
    case 'conjuro_libro': {
      const value = typeof raw.value === 'string' ? raw.value.trim().slice(0, 80) : '';
      return value ? { type: 'conjuro_libro', value } : null;
    }
    case 'lista_conjuros': {
      // Clave de clase (p. ej. "clerigo"): sus conjuros cuentan como de la clase.
      const value = typeof raw.value === 'string' ? raw.value.trim().toLowerCase() : '';
      return /^[a-z0-9_-]{2,40}$/.test(value) ? { type: 'lista_conjuros', value } : null;
    }
    case 'ca_sin_armadura': {
      // CA = base + modificadores de los atributos indicados, sin armadura.
      const atributos = [...new Set((Array.isArray(raw.atributos) ? raw.atributos : []).filter((a) => ABILITY_KEYS.includes(a)))].slice(0, 3);
      const base = raw.base === undefined ? 10 : Math.trunc(Number(raw.base));
      if (!atributos.length || !Number.isFinite(base) || base < 0 || base > 30) return null;
      return { type: 'ca_sin_armadura', base, atributos, escudo: raw.escudo === true };
    }
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
    case 'bono': return e.desdeNivel ? `${BONUS_TARGETS[e.target]}: + tu nivel en la clase${e.mas ? ` ${e.mas > 0 ? '+' : '−'} ${Math.abs(e.mas)}` : ''}`
      : e.desdeAtributo ? `${BONUS_TARGETS[e.target]}: + mod. de ${ABILITY_LABEL[e.desdeAtributo]}${e.minimo != null ? ` (mínimo ${e.minimo > 0 ? '+' : ''}${e.minimo})` : ''}`
      : e.desdeTabla ? `${BONUS_TARGETS[e.target]}: según «${e.desdeTabla}»` : `${e.value > 0 ? '+' : ''}${e.value} ${BONUS_TARGETS[e.target]}${e.maximo ? ` (máximo ${e.maximo})` : ''}`;
    case 'resistencia': return `Resistencia: ${DAMAGE_LABEL[e.value]}`;
    case 'inmunidad': return `Inmunidad: ${DAMAGE_LABEL[e.value]}`;
    case 'vulnerabilidad': return `Vulnerabilidad: ${DAMAGE_LABEL[e.value]}`;
    case 'inmunidad_condicion': return `Inmune a la condición ${e.value}`;
    case 'habilita': return RESOURCES[e.value];
    case 'medio_competencia': return `Mitad del bono de competencia en pruebas ${e.atributos?.length ? `de ${e.atributos.map((k) => ABILITY_LABEL[k] ?? k).join(', ')} ` : ''}sin competencia`;
    case 'conjuro_preparado': return `Siempre preparado: ${e.value}`;
    case 'conjuro_libro': return `En tu libro de conjuros: ${e.value}`;
    case 'lista_conjuros': return `Puede preparar conjuros de la lista de ${e.value}`;
    case 'ca_sin_armadura': return `CA sin armadura: ${e.base} + ${e.atributos.map((a) => ABILITY_LABEL[a]).join(' + ')}${e.escudo ? ' (admite escudo)' : ''}`;
    default: return '';
  }
}

/** Suma de bonificaciones `bono` a un destino. */
export function sumBonus(sources, target, scores = null) {
  return sources.reduce((sum, s) => sum + s.effects
    .filter((e) => e.type === 'bono' && e.target === target)
    .reduce((a, e) => a + bonusValue(e, scores), 0), 0);
}

/** Valor de un bono: fijo, o el modificador de un atributo (necesita `scores`). */
export function bonusValue(e, scores = null) {
  if (e.desdeAtributo) {
    const mod = scores?.[e.desdeAtributo]?.modifier;
    if (!Number.isFinite(mod)) return 0;
    return e.minimo != null ? Math.max(e.minimo, mod) : mod;
  }
  return Number.isFinite(e.value) ? e.value : 0;
}

/** Suma de bonos de un destino sólo para los rasgos de una clase (p. ej. trucos). */
export function sumClassBonus(sources, target, classKey, scores = null) {
  return sumBonus(sources.filter((s) => s.classKey === classKey), target, scores);
}
