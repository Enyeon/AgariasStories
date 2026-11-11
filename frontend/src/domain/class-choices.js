// Elecciones de rasgos de clase: maniobras, estilos de combate, trucos,
// herramientas… Todo lo que un rasgo dice «elige N de…».
//
// Los datos de la clase declaran:
//   - `listasDeEleccion` (en la clase o en una subclase): de qué se elige.
//   - `elegir` (en un nivel o en un rasgo de ese nivel): cuántas se eligen.
// Formato documentado en docs/plantillas/CLASES.md («Elecciones»).
//
// Lo elegido se guarda en el nivel del personaje en que se ganó:
//   levels[i].featureChoices.elecciones = { [lista]: { add: [...], remove: [...] } }
// Así, bajar de nivel deshace las elecciones de ese nivel sin código extra, y
// lo que se conoce de una lista es la suma de esos cambios en orden.

import { getClass } from '../data/index.js';
import { castingConfig } from './spellcasting.js';
import { SKILL_NAMES } from './constants.js';
import { normalizeEffects } from './effects.js';
import { listSource } from '../content/class-choices-format.js';

export { listSource };

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const MAX_TEXT = 80;

function subclassData(cls, subKey) {
  if (!cls || !subKey) return null;
  return Object.values(cls.niveles ?? {}).find((l) => l?.subClase)?.subClase?.[subKey] ?? null;
}

/** Definición de una lista: primero la de la subclase, después la de la clase. */
export function choiceListDef(classKey, subKey, listId) {
  const cls = getClass(classKey);
  return subclassData(cls, subKey)?.listasDeEleccion?.[listId] ?? cls?.listasDeEleccion?.[listId] ?? null;
}

const asList = (v) => (Array.isArray(v) ? v : v ? [v] : []);

/**
 * Concesiones («elige N») de un nivel de la clase, sumadas por lista.
 * @returns {Array<{ lista, cantidad, reemplazar, nivelMax, features: string[] }>}
 */
export function grantsAt(classKey, level, subKey) {
  const cls = getClass(classKey);
  if (!cls) return [];
  const raw = [];
  const lvl = cls.niveles?.[level];
  for (const g of asList(lvl?.elegir)) raw.push({ g, feature: g?.rasgo ?? '' });
  for (const b of Object.values(lvl?.infoBlock ?? {})) for (const g of asList(b?.elegir)) raw.push({ g, feature: b.name ?? '' });
  const sub = subclassData(cls, subKey);
  for (const g of asList(sub?.subNivel?.[level]?.elegir)) raw.push({ g, feature: g?.rasgo ?? sub?.subNombre ?? '' });
  for (const b of Object.values(sub?.subNivel?.[level]?.infoSubBlock ?? {})) for (const g of asList(b?.elegir)) raw.push({ g, feature: b.subName ?? '' });
  const byList = new Map();
  for (const { g, feature } of raw) {
    if (!isObject(g) || typeof g.lista !== 'string') continue;
    const cur = byList.get(g.lista) ?? { lista: g.lista, cantidad: 0, cantidadMulticlase: 0, reemplazar: 0, nivelMax: null, features: [] };
    const n = Math.max(0, Math.trunc(Number(g.cantidad) || 0));
    cur.cantidad += n;
    // `multiclase`: cuántas se eligen si la clase NO es la primera del personaje.
    cur.cantidadMulticlase += g.multiclase === undefined ? n : Math.max(0, Math.trunc(Number(g.multiclase) || 0));
    cur.reemplazar = Math.max(cur.reemplazar, Math.max(0, Math.trunc(Number(g.reemplazar) || 0)));
    if (Number.isInteger(g.nivelMax)) cur.nivelMax = Math.max(cur.nivelMax ?? 0, g.nivelMax);
    // "espacios": el nivel de conjuro más alto con espacios de la clase a ese nivel.
    else if (g.nivelMax === 'espacios') cur.nivelMax = Math.max(cur.nivelMax ?? 0, highestSlotLevel(classKey, level));
    if (feature && !cur.features.includes(feature)) cur.features.push(feature);
    byList.set(g.lista, cur);
  }
  return [...byList.values()];
}

/** Nivel de conjuro más alto con espacios para la clase a un nivel dado (0 si ninguno). */
function highestSlotLevel(classKey, level) {
  const row = castingConfig(classKey)?.table?.[Math.min(20, Math.max(1, level))] ?? [];
  let max = 0;
  row.forEach((n, i) => { if (n > 0) max = i + 1; });
  return max;
}

/** Lista con `"nivelMax": "espacios"`: el máximo lo dan los espacios de la clase a ese nivel. */
const listMaxLevel = (def, classKey, level) => (def?.nivelMax === 'espacios' ? highestSlotLevel(classKey, level) : null);

/** ¿Es `classKey` la primera clase del personaje (la de nivel 1)? */
const isStartingClass = (c, classKey) => !c.levels.length || c.levels[0].classKey === classKey;

/** Aplica la cantidad de multiclase a las concesiones del nivel 1 de una clase secundaria. */
function forCharacter(c, classKey, level, grants) {
  if (level !== 1 || isStartingClass(c, classKey)) return grants;
  return grants.map((g) => ({ ...g, cantidad: g.cantidadMulticlase }));
}

/** Índices (en c.levels) de cada nivel de la clase: [índice del nivel 1, del 2, …]. */
function classLevelIndexes(levels, classKey) {
  const out = [];
  levels.forEach((l, i) => { if (l.classKey === classKey) out.push(i); });
  return out;
}

/** Lo que se conoce de cada lista de la clase (suma ordenada de añadidos y retiradas). */
export function knownChoices(c, classKey, levels = c.levels) {
  const known = {};
  for (const l of levels) {
    if (l.classKey !== classKey) continue;
    for (const [lista, ch] of Object.entries(l.featureChoices?.elecciones ?? {})) {
      const set = new Set(known[lista] ?? []);
      for (const v of ch.remove ?? []) set.delete(v);
      for (const v of ch.add ?? []) set.add(v);
      known[lista] = [...set];
    }
  }
  return known;
}

/** Nivel de conjuro máximo concedido hasta `level` para una lista (para los reemplazos). */
function maxSpellLevelUpTo(classKey, level, subKey, lista) {
  let max = null;
  for (let n = 1; n <= level; n++) {
    const g = grantsAt(classKey, n, subKey).find((x) => x.lista === lista);
    if (g?.nivelMax != null) max = Math.max(max ?? 0, g.nivelMax);
  }
  return max;
}

/**
 * Elecciones que corresponden al subir a `newLevel` de la clase: las concesiones
 * de ese nivel y, para las listas con `reemplazarAlSubir`, un cambio opcional.
 * @param {object} c  personaje ANTES de subir
 * @param {string|null} subKey  subclase (la ya elegida o la que se elige en este nivel)
 */
export function pendingChoices(c, classKey, newLevel, subKey) {
  const known = knownChoices(c, classKey);
  const out = [];
  for (const g of forCharacter(c, classKey, newLevel, grantsAt(classKey, newLevel, subKey))) {
    const def = choiceListDef(classKey, subKey, g.lista);
    if (!def) continue;
    const reemplazar = (known[g.lista]?.length ? g.reemplazar : 0) || (def.reemplazarAlSubir && known[g.lista]?.length ? 1 : 0);
    if (!g.cantidad && !reemplazar) continue;
    out.push({ ...g, reemplazar, def, level: newLevel, nivelMax: listMaxLevel(def, classKey, newLevel) ?? g.nivelMax ?? maxSpellLevelUpTo(classKey, newLevel, subKey, g.lista) });
  }
  // Listas que permiten cambiar una elección cada vez que se sube en la clase.
  const lists = { ...(getClass(classKey)?.listasDeEleccion ?? {}), ...(subclassData(getClass(classKey), subKey)?.listasDeEleccion ?? {}) };
  for (const [lista, def] of Object.entries(lists)) {
    if (!def?.reemplazarAlSubir || !known[lista]?.length || out.some((g) => g.lista === lista)) continue;
    out.push({ lista, cantidad: 0, reemplazar: 1, nivelMax: listMaxLevel(def, classKey, newLevel) ?? maxSpellLevelUpTo(classKey, newLevel, subKey, lista), features: [], def, level: newLevel });
  }
  return out;
}

/**
 * Añade las elecciones que da una opción elegida (`opciones[].elegir`). Ej.: el
 * Estilo de Combate «Guerrero Bendito» del Paladín da a elegir 2 trucos.
 * @param {object} elecciones  { [lista]: { add, remove } } de ese nivel
 */
export function expandGrants(classKey, subKey, grants, elecciones = {}) {
  const out = grants.map((g) => ({ ...g }));
  for (const g of grants) {
    if (listSource(g.def) !== 'opciones') continue;
    for (const v of elecciones?.[g.lista]?.add ?? []) {
      const opt = optionOf(g.def, v);
      for (const x of asList(opt?.elegir)) {
        const def = isObject(x) ? choiceListDef(classKey, subKey, x.lista) : null;
        if (!def) continue;
        const n = Math.max(0, Math.trunc(Number(x.cantidad) || 0));
        const cur = out.find((y) => y.lista === x.lista);
        if (cur) { cur.cantidad += n; continue; }
        out.push({ lista: x.lista, cantidad: n, cantidadMulticlase: n, reemplazar: 0, def, level: g.level,
          nivelMax: listMaxLevel(def, classKey, g.level ?? 1) ?? (Number.isInteger(x.nivelMax) ? x.nivelMax : null), features: [opt.nombre] });
      }
    }
  }
  return out;
}

/**
 * Las elecciones de conjuros no son obligatorias al subir de nivel: se pueden
 * hacer después, con calma, desde la pestaña Conjuros (lo no elegido queda
 * pendiente en classChoiceStatus). Se marcan `opcional`: se acepta elegir de 0
 * a `cantidad`. `deferred` resume lo que este nivel da para elegir.
 * @returns {{ groups: Array, deferred: Array<{ lista, titulo, cantidad }> }}
 */
export function deferSpellChoices(groups) {
  const deferred = [];
  const out = groups.map((g) => {
    if (listSource(g.def) !== 'conjuros') return g;
    if (g.cantidad > 0) deferred.push({ lista: g.lista, titulo: g.def.titulo ?? g.lista, cantidad: g.cantidad });
    return { ...g, opcional: true };
  });
  return { groups: out, deferred };
}

/** Lo que se muestra al subir: de las listas opcionales, sólo su cambio opcional. */
export const levelUpVisibleChoices = (groups) => groups
  .filter((g) => !g.opcional || g.reemplazar > 0)
  .map((g) => (g.opcional ? { ...g, cantidad: 0, cantidadMulticlase: 0 } : g));

/** Elecciones de conjuros que faltan en los niveles ya alcanzados. */
export function pendingSpellChoices(c, classKey) {
  return classChoiceStatus(c, classKey).missing.filter((m) => listSource(m.def) === 'conjuros');
}

/** ¿Hay que decidir algo obligatoriamente? (los cambios opcionales no cuentan) */
export const hasRequiredChoices = (pending) => pending.some((g) => g.cantidad > 0 && !g.opcional);

// Escuela normalizada (el catálogo tiene erratas: «Trasmutación», «Necromancia»…).
const SCHOOL_FIX = { trasmutacion: 'transmutacion', necromancia: 'nigromancia', ilucion: 'ilusion', rvocacion: 'evocacion' };
const schoolKey = (x) => { const k = String(x ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase(); return SCHOOL_FIX[k] ?? k; };
const spellLevel = (s) => (s?.nivel === 'Truco' ? 0 : Number(s?.nivel));

/**
 * Opciones de una lista. Devuelve null en las listas `libre` (se escribe el valor)
 * y en las de conjuros mientras el catálogo no esté cargado.
 * @returns {Array<{ value, label, description, effects }>|null}
 */
/** «explosion-agonizante~2» → «explosion-agonizante» (opciones repetibles). */
export const baseId = (v) => String(v).split('~')[0];
const optionOf = (def, v) => (def.opciones ?? []).find((o) => String(o.id) === baseId(v));
const optionName = (def, id) => (def.opciones ?? []).find((o) => String(o.id) === id)?.nombre ?? id;

/**
 * Requisito de una opción («Nivel 5+», «Requiere: Pacto de la Espada») y si se
 * cumple. `nivel`: nivel de la clase en que se elige; `pool`: lo que ya se
 * conoce más lo elegido en el mismo paso.
 */
function requirement(def, o, nivel, pool) {
  const r = isObject(o.requisitos) ? o.requisitos : null;
  if (!r) return { text: '', ok: true };
  const parts = [];
  let ok = true;
  if (Number.isInteger(r.nivel)) {
    parts.push(`Nivel ${r.nivel}+`);
    if (nivel != null && nivel < r.nivel) ok = false;
  }
  for (const id of asList(r.opcion)) {
    parts.push(`Requiere: ${optionName(def, id)}`);
    if (pool && !pool.some((v) => baseId(v) === id)) ok = false;
  }
  return { text: parts.join(' · '), ok };
}

/**
 * @param {object} def
 * @param {{ nivelMax?, spells?, known?: string[], pool?: string[], nivel?: number }} [ctx]
 *   known: lo ya conocido (numera las opciones repetibles); pool: known + lo marcado
 *   en este paso (requisitos de otra opción); nivel: nivel de clase (requisito de nivel).
 */
export function choiceOptions(def, { nivelMax = null, spells = null, known = null, pool = null, nivel = null } = {}) {
  switch (listSource(def)) {
    case 'libre': return null;
    case 'habilidades': {
      const names = def.de === 'cualquiera' || !Array.isArray(def.de) ? SKILL_NAMES : def.de.filter((s) => SKILL_NAMES.includes(s));
      return names.map((n) => ({ value: n, label: n, description: '', effects: [{ type: 'competencia', kind: 'habilidad', value: n }] }));
    }
    case 'conjuros': {
      if (!spells) return null;
      const niveles = Array.isArray(def.niveles) ? def.niveles : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
      const classes = (Array.isArray(def.clase) ? def.clase : [def.clase]).filter(Boolean).map((x) => String(x).toLowerCase());
      return Object.entries(spells)
        .filter(([, s]) => (!classes.length || classes.some((k) => s.conjuradorTrue?.[k])) && niveles.includes(spellLevel(s)) && (nivelMax == null || spellLevel(s) <= nivelMax)
          && (!def.escuela || schoolKey(s.escuela) === schoolKey(def.escuela)))
        .sort(([a, sa], [b, sb]) => spellLevel(sa) - spellLevel(sb) || a.localeCompare(b, 'es'))
        .map(([name, s]) => ({ value: name, label: name, description: s.descripcion ?? '', meta: spellLevel(s) === 0 ? 'Truco' : `Nivel ${spellLevel(s)}`, effects: [] }));
    }
    default:
      return (def.opciones ?? []).filter((o) => isObject(o) && o.id && o.nombre).map((o) => {
        const id = String(o.id);
        // Repetible: si ya se conoce, se ofrece otra copia («id~2», «id~3»…).
        const times = o.repetible && known ? known.filter((v) => baseId(v) === id).length : 0;
        const req = requirement(def, o, nivel, pool ?? known);
        return {
          value: times ? `${id}~${times + 1}` : id,
          label: times ? `${o.nombre} (${times + 1})` : o.nombre,
          description: o.descripcion ?? '', effects: normalizeEffects(o.efectos),
          meta: [req.text, o.repetible ? 'Repetible' : ''].filter(Boolean).join(' · '),
          blocked: !req.ok,
        };
      });
  }
}

/** Nombre visible de un valor elegido. */
export function choiceLabel(def, value) {
  if (listSource(def) === 'opciones') {
    const n = optionOf(def, value)?.nombre ?? value;
    const copy = String(value).split('~')[1];
    return copy ? `${n} (${copy})` : n;
  }
  return value;
}

/**
 * Efectos automáticos de un valor elegido. En las opciones propias, un efecto
 * con `"nivel": N` sólo se aplica desde el nivel N de la clase (p. ej. el
 * terreno del Círculo de la Tierra: conjuros a los niveles 3, 5, 7 y 9).
 */
function valueEffects(def, value, classLevel = 20) {
  switch (listSource(def)) {
    case 'habilidades': return SKILL_NAMES.includes(value) ? [{ type: 'competencia', kind: 'habilidad', value }] : [];
    case 'libre': return isObject(def.efectoLibre) ? normalizeEffects([{ ...def.efectoLibre, value }]) : [];
    case 'opciones': {
      const raw = optionOf(def, value)?.efectos;
      return normalizeEffects((Array.isArray(raw) ? raw : []).filter((e) => !(Number(e?.nivel) > classLevel)));
    }
    case 'conjuros': return normalizeEffects([
      ...(def.siemprePreparados ? [{ type: 'conjuro_preparado', value }] : []),
      ...(def.libroConjuros ? [{ type: 'conjuro_libro', value }] : []),
    ]);
    default: return [];
  }
}

const cleanList = (v) => [...new Set((Array.isArray(v) ? v : []).map((x) => (typeof x === 'string' ? x.trim().slice(0, MAX_TEXT) : '')).filter(Boolean))];

/**
 * Comprueba las elecciones de un nivel y las devuelve normalizadas.
 * Reglas por lista: se retiran como mucho `reemplazar` valores conocidos y se
 * añaden exactamente `cantidad` + los retirados, sin repetir lo que ya se conoce.
 * @param {object} known  knownChoices() antes del nivel
 * @param {Array} pending pendingChoices()
 * @param {object} input  { [lista]: { add, remove } }
 * @param {{ spells?: object }} [opts] con el catálogo, se comprueban también los conjuros
 */
export function validateChoices(known, pending, input = {}, { spells = null } = {}) {
  const errors = [];
  const out = {};
  for (const g of pending) {
    const title = g.def.titulo ?? g.lista;
    const add = cleanList(input?.[g.lista]?.add);
    const remove = cleanList(input?.[g.lista]?.remove);
    const have = known[g.lista] ?? [];
    if (remove.length > g.reemplazar) errors.push(`${title}: sólo puedes reemplazar ${g.reemplazar}.`);
    if (remove.some((v) => !have.includes(v))) errors.push(`${title}: sólo puedes reemplazar algo que ya conozcas.`);
    const need = g.cantidad + remove.length;
    if (g.opcional ? add.length > need : add.length !== need) {
      if (g.opcional) errors.push(`${title}: elige como mucho ${need}.`);
      else if (g.cantidad > 0 || remove.length) errors.push(`${title}: elige ${need}${remove.length ? ` (incluye ${remove.length} por el reemplazo)` : ''}.`);
    }
    const stillKnown = have.filter((v) => !remove.includes(v));
    if (add.some((v) => stillKnown.includes(v))) errors.push(`${title}: ya conoces alguna de las opciones elegidas.`);
    const options = choiceOptions(g.def, { nivelMax: g.nivelMax, spells, known: stillKnown, pool: [...stillKnown, ...add], nivel: g.level ?? null });
    if (options) {
      const byValue = new Map(options.map((o) => [o.value, o]));
      if (add.some((v) => !byValue.has(v))) errors.push(`${title}: hay opciones que no pertenecen a la lista.`);
      for (const v of add) {
        const o = byValue.get(v);
        if (o?.blocked) errors.push(`${title}: «${o.label}» no cumple su requisito (${o.meta}).`);
      }
      // No se puede retirar algo que es requisito de otra opción que se conserva.
      if (listSource(g.def) === 'opciones' && remove.length) {
        const keep = [...stillKnown, ...add];
        for (const r of remove) {
          const dependent = keep.find((v) => asList(optionOf(g.def, v)?.requisitos?.opcion).includes(baseId(r)) && !keep.some((x) => x !== r && baseId(x) === baseId(r)));
          if (dependent) errors.push(`${title}: no puedes reemplazar «${choiceLabel(g.def, r)}», es requisito de «${choiceLabel(g.def, dependent)}».`);
        }
      }
    }
    if (add.length || remove.length) out[g.lista] = { add, remove };
  }
  return { errors, elecciones: out };
}

/** Normaliza lo guardado en una ficha importada (sin conocer la clase). */
export function sanitizeStoredChoices(value) {
  if (!isObject(value)) return {};
  const out = {};
  for (const [lista, ch] of Object.entries(value).slice(0, 40)) {
    if (!/^[a-z0-9_-]{1,60}$/.test(lista) || !isObject(ch)) continue;
    const add = cleanList(ch.add).slice(0, 40);
    const remove = cleanList(ch.remove).slice(0, 40);
    if (add.length || remove.length) out[lista] = { add, remove };
  }
  return out;
}

/** Fuentes de efectos de lo elegido (para competencias, etc.). */
export function choiceEffectSources(c) {
  const out = [];
  const classes = [...new Set(c.levels.map((l) => l.classKey))];
  for (const classKey of classes) {
    const subKey = c.subclasses?.[classKey] ?? null;
    const classLevel = c.levels.filter((l) => l.classKey === classKey).length;
    for (const [lista, values] of Object.entries(knownChoices(c, classKey))) {
      const def = choiceListDef(classKey, subKey, lista);
      if (!def) continue;
      for (const v of values) {
        const effects = valueEffects(def, v, classLevel);
        if (effects.length) out.push({ kind: 'clase', classKey, label: `${def.titulo ?? lista}: ${choiceLabel(def, v)}`, effects });
      }
    }
  }
  return out;
}

/**
 * Estado de las elecciones de una clase para la ficha: lo conocido por lista y
 * lo que falta por elegir en cada nivel ya alcanzado (personajes creados antes
 * de que la clase declarase sus elecciones, o subclase elegida más tarde).
 */
export function classChoiceStatus(c, classKey, { spells = null } = {}) {
  const subKey = c.subclasses?.[classKey] ?? null;
  const idx = classLevelIndexes(c.levels, classKey);
  const known = knownChoices(c, classKey);
  const lists = new Map();
  const missing = [];
  idx.forEach((levelIndex, i) => {
    const level = i + 1;
    const base = forCharacter(c, classKey, level, grantsAt(classKey, level, subKey))
      .map((g) => ({ ...g, level, def: choiceListDef(classKey, subKey, g.lista) })).filter((g) => g.def);
    for (const g of expandGrants(classKey, subKey, base, c.levels[levelIndex].featureChoices?.elecciones)) {
      const def = g.def;
      if (!lists.has(g.lista)) lists.set(g.lista, { lista: g.lista, def, granted: 0 });
      lists.get(g.lista).granted += g.cantidad;
      const ch = c.levels[levelIndex].featureChoices?.elecciones?.[g.lista];
      const done = (ch?.add?.length ?? 0) - (ch?.remove?.length ?? 0);
      if (done < g.cantidad) {
        missing.push({ ...g, cantidad: g.cantidad - Math.max(0, done), reemplazar: 0, def, level, levelIndex, nivelMax: listMaxLevel(def, classKey, level) ?? g.nivelMax ?? maxSpellLevelUpTo(classKey, level, subKey, g.lista) });
      }
    }
  });
  return {
    lists: [...lists.values()].map((l) => ({
      ...l,
      values: (known[l.lista] ?? []).map((v) => {
        const opt = choiceOptions(l.def, { spells })?.find((o) => o.value === v || o.value === baseId(v));
        return { value: v, label: choiceLabel(l.def, v), description: opt?.description ?? '', meta: opt?.meta ?? '' };
      }),
    })),
    missing,
    known,
  };
}

/** Añade las elecciones que faltaban en los niveles indicados. Devuelve un personaje NUEVO. */
export function fillMissingChoices(c, classKey, picks, { spells = null } = {}) {
  const status = classChoiceStatus(c, classKey);
  const next = structuredClone(c);
  const errors = [];
  for (const m of status.missing) {
    const key = `${m.level}:${m.lista}`;
    const add = cleanList(picks?.[key]);
    if (!add.length) continue;
    // Se puede completar por partes: lo que falte sigue pendiente.
    if (add.length > m.cantidad) { errors.push(`${m.def.titulo ?? m.lista}: elige como mucho ${m.cantidad}.`); continue; }
    const known = knownChoices(next, classKey);
    const res = validateChoices(known, [{ ...m, cantidad: add.length }], { [m.lista]: { add, remove: [] } }, { spells });
    if (res.errors.length) { errors.push(...res.errors); continue; }
    const entry = next.levels[m.levelIndex];
    entry.featureChoices ??= {};
    entry.featureChoices.elecciones ??= {};
    const cur = entry.featureChoices.elecciones[m.lista] ?? { add: [], remove: [] };
    cur.add = [...cur.add, ...add];
    entry.featureChoices.elecciones[m.lista] = cur;
  }
  return { character: errors.length ? c : next, errors };
}

/**
 * Cambia un valor ya elegido por otro (listas `cambiable`, p. ej. la maestría
 * en armas tras un descanso largo). Se edita en el nivel en que se eligió.
 */
export function replaceChoice(c, classKey, lista, oldValue, newValue, { spells = null } = {}) {
  const subKey = c.subclasses?.[classKey] ?? null;
  const def = choiceListDef(classKey, subKey, lista);
  if (!def?.cambiable) return { character: c, errors: ['Esta elección no se puede cambiar fuera de la subida de nivel.'] };
  const value = typeof newValue === 'string' ? newValue.trim().slice(0, MAX_TEXT) : '';
  const known = knownChoices(c, classKey);
  if (!value) return { character: c, errors: ['Elige o escribe la nueva opción.'] };
  if (!known[lista]?.includes(oldValue)) return { character: c, errors: ['Esa opción ya no está elegida.'] };
  if (known[lista].includes(value)) return { character: c, errors: ['Ya tienes esa opción.'] };
  const options = choiceOptions(def, { spells });
  if (options && !options.some((o) => o.value === value)) return { character: c, errors: ['Esa opción no pertenece a la lista.'] };
  const next = structuredClone(c);
  // El último nivel que añadió el valor es el que lo mantiene vigente.
  for (let i = next.levels.length - 1; i >= 0; i--) {
    const ch = next.levels[i].classKey === classKey ? next.levels[i].featureChoices?.elecciones?.[lista] : null;
    if (ch?.add?.includes(oldValue)) {
      ch.add = ch.add.map((v) => (v === oldValue ? value : v));
      return { character: next, errors: [] };
    }
  }
  return { character: c, errors: ['No se encontró el nivel de esa elección.'] };
}
