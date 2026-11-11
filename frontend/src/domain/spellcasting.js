// Tablas de lanzamiento de conjuros. Copiadas tal cual de hechizos.js del
// proyecto original. Ver docs/DATOS.md para los valores que necesitan revisión
// (p. ej. la tabla del Brujo mezcla espacios de pacto y Arcanum Místico).

import { getClass } from '../data/index.js';

const FULL = [
  null,
  [2, 0, 0, 0, 0, 0, 0, 0, 0],
  [3, 0, 0, 0, 0, 0, 0, 0, 0],
  [4, 2, 0, 0, 0, 0, 0, 0, 0],
  [4, 3, 0, 0, 0, 0, 0, 0, 0],
  [4, 3, 2, 0, 0, 0, 0, 0, 0],
  [4, 3, 3, 0, 0, 0, 0, 0, 0],
  [4, 3, 3, 1, 0, 0, 0, 0, 0],
  [4, 3, 3, 2, 0, 0, 0, 0, 0],
  [4, 3, 3, 3, 1, 0, 0, 0, 0],
  [4, 3, 3, 3, 2, 0, 0, 0, 0],
  [4, 3, 3, 3, 2, 1, 0, 0, 0],
  [4, 3, 3, 3, 2, 1, 0, 0, 0],
  [4, 3, 3, 3, 2, 1, 1, 0, 0],
  [4, 3, 3, 3, 2, 1, 1, 0, 0],
  [4, 3, 3, 3, 2, 1, 1, 1, 0],
  [4, 3, 3, 3, 2, 1, 1, 1, 0],
  [4, 3, 3, 3, 2, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 2, 1, 1],
];

const HALF = [
  null,
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
  [2, 0, 0, 0, 0, 0, 0, 0, 0],
  [3, 0, 0, 0, 0, 0, 0, 0, 0],
  [3, 0, 0, 0, 0, 0, 0, 0, 0],
  [4, 2, 0, 0, 0, 0, 0, 0, 0],
  [4, 2, 0, 0, 0, 0, 0, 0, 0],
  [4, 3, 0, 0, 0, 0, 0, 0, 0],
  [4, 3, 0, 0, 0, 0, 0, 0, 0],
  [4, 3, 2, 0, 0, 0, 0, 0, 0],
  [4, 3, 2, 0, 0, 0, 0, 0, 0],
  [4, 3, 3, 0, 0, 0, 0, 0, 0],
  [4, 3, 3, 0, 0, 0, 0, 0, 0],
  [4, 3, 3, 1, 0, 0, 0, 0, 0],
  [4, 3, 3, 1, 0, 0, 0, 0, 0],
  [4, 3, 3, 2, 0, 0, 0, 0, 0],
  [4, 3, 3, 2, 0, 0, 0, 0, 0],
  [4, 3, 3, 3, 1, 0, 0, 0, 0],
  [4, 3, 3, 3, 1, 0, 0, 0, 0],
  [4, 3, 3, 3, 2, 0, 0, 0, 0],
  [4, 3, 3, 3, 2, 0, 0, 0, 0],
];

const ARTIFICER = [null, [2, 0, 0, 0, 0, 0, 0, 0, 0], ...HALF.slice(2)];

const WARLOCK = [
  null,
  [1, 0, 0, 0, 0, 0, 0, 0, 0],
  [2, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 2, 0, 0, 0, 0, 0, 0, 0],
  [0, 2, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 2, 0, 0, 0, 0, 0, 0],
  [0, 0, 2, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 2, 0, 0, 0, 0, 0],
  [0, 0, 0, 2, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 2, 0, 0, 0, 0],
  [0, 0, 0, 0, 2, 0, 0, 0, 0],
  [0, 0, 0, 0, 3, 1, 0, 0, 0],
  [0, 0, 0, 0, 3, 1, 0, 0, 0],
  [0, 0, 0, 0, 3, 1, 1, 0, 0],
  [0, 0, 0, 0, 3, 1, 1, 0, 0],
  [0, 0, 0, 0, 3, 1, 1, 1, 0],
  [0, 0, 0, 0, 3, 1, 1, 1, 0],
  [0, 0, 0, 0, 4, 1, 1, 1, 1],
  [0, 0, 0, 0, 4, 1, 1, 1, 1],
  [0, 0, 0, 0, 4, 1, 1, 1, 1],
  [0, 0, 0, 0, 4, 1, 1, 1, 1],
];

const CANTRIPS_2 = [2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4];

/**
 * progression: cómo cuenta la clase para el nivel de lanzador multiclase
 *   full = nivel completo, half = mitad (redondeo abajo), artificer = mitad
 *   (redondeo arriba), pact = espacios de pacto separados.
 * preparedFrom: 'full' → mod + nivel; 'half' → mod + nivel/2; null → no prepara.
 */
export const SPELLCASTING_BY_CLASS = Object.freeze({
  bardo: { progression: 'full', table: FULL, cantripsKnown: [2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4], spellsKnown: [4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 15, 16, 18, 19, 19, 20, 22, 22, 22], preparedFrom: null },
  clerigo: { progression: 'full', table: FULL, cantripsKnown: [3, 3, 3, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5], preparedFrom: 'full' },
  druida: { progression: 'full', table: FULL, cantripsKnown: CANTRIPS_2, preparedFrom: 'full' },
  hechicero: { progression: 'full', table: FULL, cantripsKnown: [4, 4, 4, 5, 5, 5, 5, 5, 5, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6], spellsKnown: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 12, 13, 13, 14, 14, 15, 15, 15, 15], preparedFrom: null },
  mago: { progression: 'full', table: FULL, cantripsKnown: [3, 3, 3, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5], preparedFrom: 'full', spellbook: (lvl) => 6 + Math.max(0, (lvl - 1) * 2) },
  paladin: { progression: 'half', table: HALF, preparedFrom: 'half' },
  explorador: { progression: 'half', table: HALF, spellsKnown: [0, 0, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11], preparedFrom: null },
  artifice: { progression: 'artificer', table: ARTIFICER, cantripsKnown: [2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3], preparedFrom: 'half' },
  brujo: { progression: 'pact', table: WARLOCK, cantripsKnown: CANTRIPS_2, spellsKnown: [2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 11, 11, 12, 12, 13, 13, 14, 14, 15, 15], preparedFrom: null },
  vinculador: { progression: 'full', table: FULL, cantripsKnown: CANTRIPS_2, preparedFrom: null },
  anomalia: { progression: 'full', table: FULL, cantripsKnown: CANTRIPS_2, preparedFrom: null },
});

const EMPTY_SLOTS = Object.freeze([0, 0, 0, 0, 0, 0, 0, 0, 0]);

// half_up: lanzador «medio» de las reglas 2024 (Paladín, Explorador): espacios desde
// el nivel 1 (misma tabla que el Artífice) y, en multiclase, nivel/2 redondeando arriba.
const TABLE_BY_PROGRESSION = { full: FULL, half: HALF, half_up: ARTIFICER, artificer: ARTIFICER, pact: WARLOCK };

/**
 * Configuración de lanzamiento de una clase: la tabla oficial si existe o, si
 * no, la que declare la propia clase (`lanzamiento`, p. ej. una clase Homebrew).
 */
export function castingConfig(classKey) {
  const official = Object.hasOwn(SPELLCASTING_BY_CLASS, classKey) ? SPELLCASTING_BY_CLASS[classKey] : null;
  const decl = getClass(classKey)?.lanzamiento;
  // Sin declaración en el JSON se usa la tabla del código (clases oficiales).
  if (!decl) return official;
  // `espaciosPacto`: 20 pares [cantidad, nivel] (Magia del Pacto 2024: todos los
  // espacios son del mismo nivel). Sustituye a la tabla del código.
  const pact = Array.isArray(decl.espaciosPacto) && decl.espaciosPacto.length === 20
    && decl.espaciosPacto.every((p) => Array.isArray(p) && Number.isInteger(p[0]) && Number.isInteger(p[1]) && p[1] >= 1 && p[1] <= 9)
    ? [null, ...decl.espaciosPacto.map(([n, lvl]) => Array.from({ length: 9 }, (_, i) => (i === lvl - 1 ? n : 0)))]
    : null;
  const table = pact ?? TABLE_BY_PROGRESSION[decl.progression] ?? official?.table;
  if (!table) return null;
  const perLevel = (arr) => (Array.isArray(arr) && arr.length === 20 && arr.every((n) => Number.isInteger(n) && n >= 0) ? arr : null);
  // Lo que declara el JSON de la clase manda (p. ej. tablas 2024); lo que no
  // declara se toma de la tabla oficial del código, si la hay.
  const preparedTable = perLevel(decl.preparedTable);
  return {
    progression: TABLE_BY_PROGRESSION[decl.progression] ? decl.progression : official.progression,
    table,
    // Sin tabla de trucos: la oficial (el Paladín no tiene) o, en una clase nueva, la estándar.
    cantripsKnown: perLevel(decl.cantripsKnown) ?? (official ? official.cantripsKnown : CANTRIPS_2),
    spellsKnown: preparedTable ? undefined : (perLevel(decl.spellsKnown) ?? official?.spellsKnown),
    preparedTable: preparedTable ?? undefined,
    preparedFrom: preparedTable ? null : (['full', 'half'].includes(decl.preparedFrom) ? decl.preparedFrom : decl.preparedFrom === null ? null : official?.preparedFrom ?? null),
    spellbook: official?.spellbook,
  };
}

/**
 * Espacios de conjuro para el conjunto de niveles de clase lanzadora.
 * Con una única clase se usa su propia tabla (comportamiento original).
 * Con varias se aplica la regla de multiclase de 5e: se suma el nivel de
 * lanzador y se usa la tabla completa; los espacios de pacto van aparte.
 * @param {Array<{classKey: string, level: number}>} casters
 */
export function computeSpellSlots(casters) {
  const withTable = casters.filter((c) => castingConfig(c.classKey));
  if (withTable.length === 0) return { slots: [...EMPTY_SLOTS], pactSlots: null };

  if (withTable.length === 1) {
    const { classKey, level } = withTable[0];
    const cfg = castingConfig(classKey);
    const row = cfg.table[Math.min(20, Math.max(1, level))] ?? EMPTY_SLOTS;
    return cfg.progression === 'pact'
      ? { slots: [...EMPTY_SLOTS], pactSlots: [...row] }
      : { slots: [...row], pactSlots: null };
  }

  let casterLevel = 0;
  let pactSlots = null;
  for (const { classKey, level } of withTable) {
    const cfg = castingConfig(classKey);
    if (cfg.progression === 'full') casterLevel += level;
    else if (cfg.progression === 'half') casterLevel += Math.floor(level / 2);
    else if (cfg.progression === 'artificer' || cfg.progression === 'half_up') casterLevel += Math.ceil(level / 2);
    else if (cfg.progression === 'pact') pactSlots = [...(cfg.table[Math.min(20, level)] ?? EMPTY_SLOTS)];
  }
  const slots = casterLevel > 0 ? [...FULL[Math.min(20, casterLevel)]] : [...EMPTY_SLOTS];
  return { slots, pactSlots };
}
