// Opciones de los datos de la Tienda para formularios y validación
// (comerciantes Homebrew, Historia). Un único sitio que lee los JSON.

import world from './world.json';
import factions from './factions.json';
import personalities from './personalities.json';
import races from './races.json';
import topics from './topics.json';
import dialogue from './dialogue.json';

const map = (list, label = (x) => x.label ?? x.name) => Object.fromEntries(list.map((x) => [x.id, label(x)]));

export const REGION_OPTIONS = map(world.regions, (r) => `${r.icon} ${r.name}`);
export const LOCATION_OPTIONS = Object.fromEntries(world.regions.flatMap((r) => r.locations.filter((l) => !l.hidden).map((l) => [l.id, `${r.name} · ${l.name}`])));
export const LOCATION_REGION = Object.fromEntries(world.regions.flatMap((r) => r.locations.map((l) => [l.id, r.id])));
export const PHASE_OPTIONS = map(world.phases, (p) => `${p.icon} ${p.label}`);
export const FACTION_OPTIONS = map(factions.factions, (f) => `${f.icon} ${f.name}`);
export const ARCHETYPE_OPTIONS = map(personalities.archetypes, (a) => `${a.icon} ${a.label}`);
export const RACE_FAMILY_OPTIONS = map(races.families);
export const TOPIC_OPTIONS = map(topics.topics, (t) => `${t.icon ?? ''} ${t.label}`.trim());
export const VOICE_OPTIONS = { default: 'Neutra', 'gruñon': 'Gruñona', campechana: 'Campechana', erudito: 'Erudita', firme: 'Firme', sombrio: 'Sombría' };
export const RUMOR_TOPIC_OPTIONS = { lugares: 'Lugares', personas: 'Personas', peligros: 'Peligros', rutas: 'Rutas', eventos: 'Sucesos', facciones: 'Facciones' };
export const ATTITUDE_KINDS = { race: 'Raza (familia)', class: 'Clase', background: 'Trasfondo', faction: 'Facción', origin: 'Región de origen', alignment: 'Alineamiento (legal, caotico, bueno, malvado…)' };
export const VOICES = Object.keys(dialogue.voices);
