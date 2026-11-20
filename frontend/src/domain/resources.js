// Recursos con recarga (AgSt 1.34): usos que se gastan y vuelven con los
// descansos (Esencia, Furia, Ki, «tantas veces como tu BC»…).
//
// Hay dos orígenes, con el mismo comportamiento en la ficha:
//  * Declarados en los datos con el efecto `recurso` (clase, subclase, raza,
//    dote, rasgo Homebrew). El máximo se recalcula con el personaje.
//  * Contadores propios del jugador (`character.resources.custom`), para lo
//    que los datos todavía no declaran.
//
// En el personaje sólo se guarda lo gastado: `character.resources.used[id]`.
// Así, si el máximo sube al subir de nivel, los usos nuevos aparecen solos.

import { ABILITY_KEYS, ABILITY_LABEL } from './constants.js';

export const RESOURCE_ID = /^[a-z0-9_-]{2,40}$/;
export const MAX_KINDS = Object.freeze({
  valor: 'Número fijo',
  bc: 'Bonificador de competencia',
  atributo: 'Modificador de atributo',
  nivel: 'Nivel (en la clase, si lo da una clase)',
  tabla: 'Columna de la tabla de la clase',
});
export const SHORT_REST_KINDS = Object.freeze({
  nada: 'No recupera',
  todo: 'Recupera todo',
  valor: 'Recupera una cantidad fija',
  atributo: 'Recupera el modificador de un atributo',
});

const clampInt = (v, min, max) => {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : null;
};

/** Identificador estable a partir de un nombre («Esencia Adaptativa» → «esencia-adaptativa»). */
export function resourceIdFrom(name) {
  return String(name ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}

function normalizeMax(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.valor !== undefined) { const valor = clampInt(raw.valor, 1, 99); return valor ? { valor } : null; }
  if (raw.bc === true) return { bc: true };
  if (ABILITY_KEYS.includes(raw.atributo)) {
    const minimo = raw.minimo === undefined ? 1 : clampInt(raw.minimo, 0, 10);
    return { atributo: raw.atributo, minimo: minimo ?? 1 };
  }
  if (raw.nivel === true) { const mas = clampInt(raw.mas ?? 0, -20, 20) ?? 0; return mas ? { nivel: true, mas } : { nivel: true }; }
  if (typeof raw.tabla === 'string' && raw.tabla.trim()) return { tabla: raw.tabla.trim().slice(0, 60) };
  return null;
}

function normalizeShort(raw) {
  if (raw === 'todo' || raw === 'nada' || raw === undefined) return raw ?? 'nada';
  if (raw && typeof raw === 'object') {
    if (raw.valor !== undefined) { const valor = clampInt(raw.valor, 1, 99); return valor ? { valor } : 'nada'; }
    if (ABILITY_KEYS.includes(raw.atributo)) return { atributo: raw.atributo, minimo: raw.minimo === undefined ? 1 : (clampInt(raw.minimo, 0, 10) ?? 1) };
  }
  return 'nada';
}

/** Normaliza el efecto `recurso` (lo llama domain/effects.js). Devuelve null si no es válido. */
export function normalizeResourceEffect(raw) {
  const nombre = typeof raw.nombre === 'string' ? raw.nombre.trim().slice(0, 60) : '';
  const id = RESOURCE_ID.test(raw.id ?? '') ? raw.id : resourceIdFrom(nombre);
  const max = normalizeMax(raw.max);
  if (!nombre || !RESOURCE_ID.test(id) || !max) return null;
  return { type: 'recurso', id, nombre, max, corto: normalizeShort(raw.corto) };
}

function describeMax(max) {
  if (max.valor) return String(max.valor);
  if (max.bc) return 'tu bonificador de competencia';
  if (max.atributo) return `tu mod. de ${ABILITY_LABEL[max.atributo]}${max.minimo ? ` (mínimo ${max.minimo})` : ''}`;
  if (max.nivel) return `tu nivel${max.mas ? ` ${max.mas > 0 ? '+' : '−'} ${Math.abs(max.mas)}` : ''}`;
  if (max.tabla) return `según «${max.tabla}»`;
  return '?';
}

function describeShort(corto) {
  if (corto === 'todo') return 'todo con un descanso corto';
  if (corto?.valor) return `${corto.valor} con un descanso corto`;
  if (corto?.atributo) return `tu mod. de ${ABILITY_LABEL[corto.atributo]} con un descanso corto`;
  return '';
}

/** Texto para las tarjetas de efectos. */
export function describeResourceEffect(e) {
  const short = describeShort(e.corto);
  return `${e.nombre}: ${describeMax(e.max)} usos; se recupera${short ? ` ${short} y` : ''} todo con un descanso largo`;
}

/**
 * Resuelve las partes que dependen de la clase que da el rasgo (tabla y nivel).
 * La llama effectSources() con la clase y su nivel.
 */
export function resolveClassResource(e, tableValue, classLevel) {
  if (e.max.tabla) {
    const valor = Number(tableValue);
    return Number.isFinite(valor) && valor > 0 ? { ...e, max: { valor: Math.trunc(valor) } } : null;
  }
  if (e.max.nivel) return { ...e, max: { valor: Math.max(1, classLevel + (e.max.mas ?? 0)) } };
  return e;
}

function maxValue(max, { scores, prof, level }) {
  if (max.valor) return max.valor;
  if (max.bc) return prof;
  if (max.atributo) return Math.max(max.minimo ?? 1, scores?.[max.atributo]?.modifier ?? 0);
  if (max.nivel) return Math.max(1, level + (max.mas ?? 0));
  return 0; // Columna de tabla sin clase: no aplica.
}

function shortValue(corto, max, scores) {
  if (corto === 'todo') return max;
  if (corto?.valor) return corto.valor;
  if (corto?.atributo) return Math.max(corto.minimo ?? 1, scores?.[corto.atributo]?.modifier ?? 0);
  return 0;
}

const shortRank = (corto) => (corto === 'todo' ? 3 : corto && typeof corto === 'object' ? 2 : 0);

/** Normaliza un contador propio del jugador. */
export function normalizeCustomResource(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const nombre = typeof raw.nombre === 'string' ? raw.nombre.trim().slice(0, 60) : '';
  const max = clampInt(raw.max, 1, 99);
  if (!nombre || !max) return null;
  const id = RESOURCE_ID.test(raw.id ?? '') && raw.id.startsWith('propio-') ? raw.id : `propio-${resourceIdFrom(nombre) || 'contador'}`.slice(0, 40);
  const corto = raw.corto === 'todo' ? 'todo' : raw.corto && typeof raw.corto === 'object' ? normalizeShort(raw.corto) : 'nada';
  return { id, nombre, max, corto: corto.atributo ? 'nada' : corto };
}

/** Normaliza `character.resources` (lo llama validation.js). */
export function normalizeResourcesState(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const used = {};
  if (src.used && typeof src.used === 'object') {
    for (const [id, n] of Object.entries(src.used)) {
      const v = clampInt(n, 0, 99);
      if (RESOURCE_ID.test(id) && v) used[id] = v;
    }
  }
  const seen = new Set();
  const custom = (Array.isArray(src.custom) ? src.custom : []).slice(0, 20).map(normalizeCustomResource)
    .filter((r) => r && !seen.has(r.id) && seen.add(r.id));
  return { used, custom };
}

/**
 * Recursos del personaje con su máximo actual y lo que queda.
 * Si dos fuentes declaran el mismo `id` (p. ej. multiclase), vale el máximo mayor.
 */
export function computeResources(c, fx, { scores, prof, level }) {
  const byId = new Map();
  for (const s of fx) {
    for (const e of s.effects) {
      if (e.type !== 'recurso') continue;
      const max = maxValue(e.max, { scores, prof, level });
      if (max <= 0) continue;
      const prev = byId.get(e.id);
      // Mismo recurso desde varias fuentes (multiclase, o un rasgo posterior que
      // mejora la recarga, como la Fuente de Inspiración del Bardo): vale el
      // máximo mayor y, a igualdad, la mejor recarga en descanso corto.
      if (!prev || max > prev.max || (max === prev.max && shortRank(e.corto) > shortRank(prev.corto))) byId.set(e.id, { id: e.id, nombre: e.nombre, max, corto: e.corto, source: s.label, custom: false });
    }
  }
  for (const r of c.resources?.custom ?? []) {
    if (!byId.has(r.id)) byId.set(r.id, { ...r, source: 'Contador propio', custom: true });
  }
  return [...byId.values()].map((r) => {
    const used = Math.min(r.max, c.resources?.used?.[r.id] ?? 0);
    return { ...r, used, left: r.max - used, shortRegain: shortValue(r.corto, r.max, scores), shortLabel: describeShort(r.corto) };
  });
}

function ensureState(c) {
  if (!c.resources || typeof c.resources !== 'object') c.resources = { used: {}, custom: [] };
  c.resources.used ??= {};
  c.resources.custom ??= [];
  return c.resources;
}

function setUsed(c, id, n) {
  const st = ensureState(c);
  if (n > 0) st.used[id] = n; else delete st.used[id];
}

/** Gasta (`delta` > 0) o devuelve (`delta` < 0) usos de un recurso. */
export function spendResource(c, resources, id, delta = 1) {
  const r = resources.find((x) => x.id === id);
  if (!r) return false;
  const next = Math.min(r.max, Math.max(0, r.used + delta));
  if (next === r.used) return false;
  setUsed(c, id, next);
  return true;
}

/** Descanso corto: cada recurso recupera lo que diga su regla. */
export function shortRest(c, resources) {
  let changed = false;
  for (const r of resources) {
    if (!r.used || !r.shortRegain) continue;
    setUsed(c, r.id, Math.max(0, r.used - r.shortRegain));
    changed = true;
  }
  return changed;
}

/** Descanso largo: todos los recursos vuelven al máximo. */
export function longRest(c, resources) {
  const changed = resources.some((r) => r.used > 0);
  ensureState(c).used = {};
  return changed;
}

export function addCustomResource(c, raw) {
  const r = normalizeCustomResource(raw);
  if (!r) return null;
  const st = ensureState(c);
  if (st.custom.some((x) => x.id === r.id)) return null;
  st.custom.push(r);
  return r;
}

export function removeCustomResource(c, id) {
  const st = ensureState(c);
  const before = st.custom.length;
  st.custom = st.custom.filter((x) => x.id !== id);
  delete st.used[id];
  return st.custom.length !== before;
}
