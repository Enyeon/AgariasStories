// Identidad visual de cada alineamiento (la usa la ficha; ver styles/alignment.css).
// El dato sigue siendo el texto de ALIGNMENTS en identity.alignment: esto sólo
// añade nombre de emblema, icono y lema para decorar.

const STYLES = [
  { name: 'Legal bueno', id: 'lb', icon: '☀️', title: 'Paladín de la luz', motto: 'El deber y la compasión caminan juntos.' },
  { name: 'Neutral bueno', id: 'nb', icon: '🌿', title: 'Corazón generoso', motto: 'Hacer el bien, sin más ley que la bondad.' },
  { name: 'Caótico bueno', id: 'cb', icon: '🕊️', title: 'Espíritu libre', motto: 'La libertad es el mayor bien de todos.' },
  { name: 'Legal neutral', id: 'ln', icon: '⚖️', title: 'Orden inquebrantable', motto: 'La ley y la palabra dada, por encima de todo.' },
  { name: 'Neutral', id: 'nn', icon: '☯️', title: 'Equilibrio', motto: 'Ni luz ni sombra: el fiel de la balanza.' },
  { name: 'Caótico neutral', id: 'cn', icon: '🌀', title: 'Viento indómito', motto: 'Nadie decide mi camino, salvo yo.' },
  { name: 'Legal malo', id: 'lm', icon: '⛓️', title: 'Tiranía de hierro', motto: 'El orden se impone; la piedad, se olvida.' },
  { name: 'Neutral malo', id: 'nm', icon: '🐍', title: 'Ambición fría', motto: 'Todo y todos son un medio para mis fines.' },
  { name: 'Caótico malo', id: 'cm', icon: '🔥', title: 'Furia desatada', motto: 'Que arda el mundo, y yo con él si hace falta.' },
];

const key = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
const BY_NAME = new Map(STYLES.map((s) => [key(s.name), s]));

/** Estilo del alineamiento (tolera mayúsculas/tildes) o null. */
export function alignmentStyle(name) {
  return BY_NAME.get(key(name)) ?? null;
}

export const ALIGNMENT_STYLES = STYLES;
