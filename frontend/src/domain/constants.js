// Reglas y catálogos fijos del sistema (D&D 5e). No contienen datos de campaña:
// esos viven en src/data/*.json.

export const ABILITIES = Object.freeze([
  { key: 'fuerza', short: 'FUE', label: 'Fuerza' },
  { key: 'destreza', short: 'DES', label: 'Destreza' },
  { key: 'constitucion', short: 'CON', label: 'Constitución' },
  { key: 'inteligencia', short: 'INT', label: 'Inteligencia' },
  { key: 'sabiduria', short: 'SAB', label: 'Sabiduría' },
  { key: 'carisma', short: 'CAR', label: 'Carisma' },
]);

export const ABILITY_KEYS = Object.freeze(ABILITIES.map((a) => a.key));

export const ABILITY_LABEL = Object.freeze(
  Object.fromEntries(ABILITIES.map((a) => [a.key, a.label])),
);

export const ABILITY_DESCRIPTIONS = Object.freeze({
  fuerza: 'Potencia física, entrenamiento atlético y fuerza bruta.',
  destreza: 'Agilidad, reflejos y equilibrio.',
  constitucion: 'Resistencia, salud y vigor.',
  inteligencia: 'Agudeza mental, memoria y capacidad de razonar.',
  sabiduria: 'Perspicacia, percepción e intuición.',
  carisma: 'Capacidad de influir en otros: confianza, elocuencia y presencia.',
});

export const SKILLS = Object.freeze([
  { name: 'Acrobacias', ability: 'destreza' },
  { name: 'Atletismo', ability: 'fuerza' },
  { name: 'Conocimiento Arcano', ability: 'inteligencia' },
  { name: 'Engaño', ability: 'carisma' },
  { name: 'Historia', ability: 'inteligencia' },
  { name: 'Interpretación', ability: 'carisma' },
  { name: 'Intimidación', ability: 'carisma' },
  { name: 'Investigación', ability: 'inteligencia' },
  { name: 'Juego de Manos', ability: 'destreza' },
  { name: 'Medicina', ability: 'sabiduria' },
  { name: 'Naturaleza', ability: 'inteligencia' },
  { name: 'Percepción', ability: 'sabiduria' },
  { name: 'Perspicacia', ability: 'sabiduria' },
  { name: 'Persuasión', ability: 'carisma' },
  { name: 'Religión', ability: 'inteligencia' },
  { name: 'Sigilo', ability: 'destreza' },
  { name: 'Supervivencia', ability: 'sabiduria' },
  { name: 'Trato con Animales', ability: 'sabiduria' },
]);

export const SKILL_NAMES = Object.freeze(SKILLS.map((s) => s.name));

export const ALIGNMENTS = Object.freeze([
  'Legal bueno', 'Neutral bueno', 'Caótico bueno',
  'Legal neutral', 'Neutral', 'Caótico neutral',
  'Legal malo', 'Neutral malo', 'Caótico malo',
]);

// El proyecto original sólo definía estos dos trasfondos. Se permite texto libre
// además de las sugerencias (ver UI), así que la lista puede ampliarse sin migrar.
export const BACKGROUND_SUGGESTIONS = Object.freeze(['Solitario', 'Huérfano']);

/** Claves de velocidad usadas por los datos de razas. */
export const SPEEDS = Object.freeze([
  { key: 'velocidad', label: 'Caminar' },
  { key: 'fly', label: 'Vuelo' },
  { key: 'swim', label: 'Nado' },
  { key: 'climb', label: 'Escalada' },
  { key: 'dig', label: 'Excavación' },
  { key: 'dash', label: 'Carrera' },
  { key: 'jump', label: 'Salto' },
  { key: 'four', label: 'Cuadrúpedo' },
  { key: 'tp', label: 'Teletransporte' },
  { key: 'tra', label: 'Transformación' },
]);
export const SPEED_KEYS = Object.freeze(SPEEDS.map((s) => s.key));

export const COINS = Object.freeze([
  { key: 'cp', label: 'PC', title: 'Piezas de cobre' },
  { key: 'sp', label: 'PP', title: 'Piezas de plata' },
  { key: 'gp', label: 'PO', title: 'Piezas de oro' },
  { key: 'pp', label: 'PPT', title: 'Piezas de platino' },
]);

export const MAX_LEVEL = 20;
export const BASE_ABILITY_CAP = 20;
export const EPIC_ABILITY_CAP = 30;
export const MIN_ABILITY_SCORE = 1;
export const MAX_ABILITY_SCORE = 30;

/** Nivel en el que las clases del proyecto eligen subclase. */
export const XP_BY_LEVEL = Object.freeze([
  0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000,
  85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000,
]);

export const CLASS_SECTIONS = Object.freeze({
  manual: 'Manual del Jugador',
  tasha: 'Caldero de Tasha',
  agarias: 'Agarias Stories',
});

/** Iconos de clase (los del Manual vienen del proyecto original). */
export const CLASS_ICONS = Object.freeze({
  barbaro: '🪓', guerrero: '⚔️', mago: '🔮', clerigo: '✨', druida: '🌿', paladin: '🛡️',
  picaro: '🗡️', monje: '🥋', hechicero: '🧬', brujo: '🕯️', explorador: '🏹', bardo: '🎼',
  artifice: '⚙️', anomalia: '🌀', cazador: '🩸', shadow: '🌑', tiznado: '🔥', vinculador: '🔗',
});
