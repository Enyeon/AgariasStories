// Formato canónico de un personaje.
//
// Un personaje se guarda/exporta/comparte siempre como un «documento»:
//   { format, schemaVersion, character }
// - `format` identifica el tipo de archivo (para rechazar JSON ajenos).
// - `schemaVersion` permite migrar documentos antiguos (ver migrations.js).
// - `character` contiene SOLO datos introducidos por el usuario. Todo lo que se
//   puede calcular (modificadores, PG máximos, CD de conjuros...) se deriva en
//   rules.js y nunca se persiste, para que no pueda quedar desincronizado.

import { ABILITY_KEYS } from './constants.js';

export const DOCUMENT_FORMAT = 'agarias-dnd-character';
export const SCHEMA_VERSION = 3;

export const LIMITS = Object.freeze({
  shortText: 120,
  mediumText: 2_000,
  longText: 20_000,
  listItems: 200,
  /** Retrato ya redimensionado (data URL). */
  portraitBytes: 400_000,
  /** Archivo JSON importado. */
  importBytes: 2_000_000,
});

export function createWeapon(overrides = {}) {
  return { name: '', attackBonus: '', damage: '', ...overrides };
}

/**
 * Objeto del inventario. `ref` (opcional, v3.2) enlaza con el catálogo de la
 * Tienda (id del catálogo o «hb:…»): permite apilar compras y vender de vuelta.
 * Los objetos escritos a mano no lo llevan.
 */
export function createItem(overrides = {}) {
  return { name: '', quantity: 1, notes: '', ...overrides };
}

export const BACKGROUND_ABILITY_MODES = Object.freeze(['none', '2-1', '1-1-1']);

export function createBackgroundState() {
  return {
    source: null,
    key: null,
    custom: null,
    /** Si el trasfondo propio viene de una campaña: su referencia («hb:…»). */
    ref: null,
    /** 'none' | '2-1' (+2 y +1) | '1-1-1' (+1 a tres) — opcional, decide el DM. */
    abilityMode: 'none',
    /** Atributos elegidos en orden: en '2-1' el primero recibe +2. */
    abilityChoices: [],
    /** Atributo elegido si la dote del trasfondo lo permite. */
    featAbility: null,
    /** Opción de equipo elegida ('A', 'B'...) y si ya se añadió al inventario. */
    equipmentChoice: null,
    equipmentApplied: null,
  };
}

/** Definición de trasfondo (formato común para oficiales y homebrew). */
export function createBackgroundDefinition(overrides = {}) {
  return {
    name: '',
    description: '',
    abilityOptions: [],
    feat: null,
    skills: [],
    tools: [],
    languages: 0,
    equipment: [],
    feature: null,
    ...overrides,
  };
}

/** Personaje vacío con todos los valores predeterminados. */
export function createCharacter() {
  return {
    identity: {
      name: '',
      player: '',
      alignment: '',
      age: '',
      height: '',
      weight: '',
      eyes: '',
      skin: '',
      hair: '',
      portrait: null,
    },
    race: {
      key: null,
      /** Una lista de atributos elegidos por cada grupo de bonificación racial. */
      abilityChoices: [],
      /** Idiomas elegidos además de los que la raza ya otorga. */
      languages: [],
      /** Dote racial (p. ej. Humano Variante): { name, ability } */
      feat: null,
    },
    /**
     * Trasfondo. `source` = 'official' (datos de la app, por `key`) o 'custom'
     * (homebrew guardado DENTRO del personaje, así viaja al exportar/compartir).
     */
    background: createBackgroundState(),
    /** Puntuaciones base, antes de bonificaciones raciales y mejoras. */
    abilities: Object.fromEntries(ABILITY_KEYS.map((k) => [k, 10])),
    /**
     * Historial de niveles en orden. Cada entrada es un nivel de personaje:
     * { classKey, hpRoll, improvement, featureChoices }
     *  - hpRoll: resultado del dado de golpe (en nivel 1 es el máximo del dado).
     *  - improvement: null | { type: 'asi', increases: {attr: n} }
     *                       | { type: 'feat', name, ability }
     *  - featureChoices: elecciones de rasgos de clase (p. ej. statAmount.choice).
     * Bajar de nivel = quitar la última entrada; así nada queda «colgado».
     */
    levels: [],
    /** { [classKey]: subclassKey } */
    subclasses: {},
    /** Bendiciones épicas (requieren permiso del DM): [{ name, ability }] */
    epicBoons: [],
    experience: 0,
    /**
     * Elecciones hechas dentro de las competencias de cada clase:
     * { [classKey]: { skills: [], saves: [] } }
     */
    classChoices: {},
    /** Rasgos con origen genérico (DM, campaña, evento, objeto...). Ver createTrait. */
    traits: [],
    /** Extensiones de clase asignadas (subclases secretas, bendiciones…): [{ ref, code, at }]. */
    unlocks: [],
    /** Vínculos con criaturas (mascota, familiar, montura...). Ver createCompanion. */
    companions: [],
    /**
     * Taller del Ingeniero (ver domain/workshop.js): Energía actual (null = llena),
     * artefactos equipados, materiales { id: cantidad }, creaciones y diseños propios.
     */
    workshop: { energy: null, equipped: [], materials: {}, creations: [], designs: [] },
    /**
     * Campaña a la que pertenece el personaje: null | { id, name }.
     * El token de jugador NO se guarda aquí (no debe viajar al exportar).
     */
    campaign: null,
    /**
     * Instantáneas del contenido Homebrew que usa el personaje, por referencia:
     * { [ref]: { type, version, name, data } }. Son un respaldo para abrir la
     * ficha si el contenido se retira o fuera de la campaña; la fuente de la
     * verdad es el registro de contenido.
     */
    content: {},
    proficiencies: {
      skills: [],
      saves: [],
      /** Pericia (competencia experta): duplica el bonificador de competencia. */
      expertise: [],
    },
    combat: {
      armorClass: 10,
      armor: '',
      inspiration: false,
      currentHp: null,
      tempHp: 0,
      /** Sobrescrituras manuales de velocidades de la raza: { fly: 60, ... } */
      speedOverrides: {},
    },
    equipment: {
      weapons: [createWeapon(), createWeapon(), createWeapon()],
      attacksNotes: '',
      coins: { cp: 0, sp: 0, gp: 0, pp: 0 },
      items: [],
      treasure: '',
    },
    spells: {
      known: [],
      prepared: [],
    },
    notes: {
      languages: '',
      proficiencies: '',
      raceTraits: '',
      /** { [classKey]: texto } — se inicializa con los atributos de clase. */
      classNotes: {},
      backstory: '',
    },
    settings: {
      /** Permiso del DM para bendiciones épicas y puntuaciones > 20. */
      allowEpicBoons: false,
    },
  };
}

let idCounter = 0;
/** Identificador local corto y único (no criptográfico). */
export function localId(prefix = 'id') {
  idCounter = (idCounter + 1) % 1e6;
  return `${prefix}-${Date.now().toString(36)}-${idCounter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export const TRAIT_ORIGIN_KEYS = Object.freeze(['dm', 'campana', 'evento', 'objeto', 'bendicion', 'maldicion', 'otro']);

/** Rasgo con origen genérico. `effects` usa el catálogo de effects.js. */
export function createTrait(overrides = {}) {
  return {
    id: localId('rasgo'),
    name: '',
    description: '',
    origin: 'dm',
    originDetail: '',
    /** Referencia opcional a contenido del registro (p. ej. un rasgo Homebrew del DM). */
    ref: null,
    effects: [],
    active: true,
    ...overrides,
  };
}

export const BOND_TYPES = Object.freeze({
  mascota: 'Mascota',
  companero: 'Compañero',
  familiar: 'Familiar',
  montura: 'Montura',
  invocacion: 'Invocación',
  vinculada: 'Criatura vinculada',
});

/**
 * Vínculo con una criatura: la relación vive en el personaje; las estadísticas
 * de la criatura, en el registro (`creatureRef`) o en un bloque propio.
 */
export function createCompanion(overrides = {}) {
  return {
    id: localId('vinculo'),
    bond: 'companero',
    name: '',
    /** Criatura del registro (p. ej. 'sangre:Lobo de sangre' o 'hb:…'). */
    creatureRef: null,
    /** Bloque propio si la criatura no está en el registro: { size, type, ac, hpMax, speed, text }. */
    custom: null,
    currentHp: null,
    tempHp: 0,
    conditions: [],
    present: true,
    origin: 'dm',
    originDetail: '',
    notes: '',
    ...overrides,
  };
}

export function createDocument(character) {
  return { format: DOCUMENT_FORMAT, schemaVersion: SCHEMA_VERSION, character };
}
