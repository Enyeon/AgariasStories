// Anatomía de los dracónidos (AgSt 1.30): alas y cola, a elegir por el jugador.
//
// «No todos los dracónidos tienen alas y cola»: es una elección sutil de la
// ficha (`character.race.anatomy = { alas, cola }`), sólo en las razas con
// `anatomiaDraconica: true` (races.json). La cola es descriptiva; las alas
// muestran la regla oficial de vuelo de los dracónidos.

import { raceHasDraconicAnatomy } from '../data/index.js';

/** Regla oficial (Manual del Jugador 2024, Dracónido): redactada con nuestras palabras. */
export const DRACONIC_FLIGHT = Object.freeze({
  name: 'Vuelo dracónico',
  source: 'Regla oficial de los dracónidos (Manual del Jugador, 2024)',
  level: 5,
  text: 'A partir del nivel 5 de personaje puedes usar una acción adicional para desplegar tus alas. Durante 10 minutos, o hasta que las repliegues (sin gastar acción) o tengas la condición Incapacitado, tienes una velocidad de vuelo igual a tu velocidad. Cuando usas este rasgo, no puedes volver a usarlo hasta que termines un descanso largo.',
});

/** Rasgos que añade la anatomía elegida (para la pestaña Rasgos). */
export function anatomyTraits(character, level) {
  const anat = character.race?.anatomy;
  if (!raceHasDraconicAnatomy(character.race?.key) || !anat) return [];
  const out = [];
  if (anat.alas) {
    out.push({ ...DRACONIC_FLIGHT, available: level >= DRACONIC_FLIGHT.level });
  }
  if (anat.cola) {
    out.push({ name: 'Cola', source: 'Anatomía elegida', text: 'Tu linaje conserva la cola de sus ancestros dracónicos. Es un rasgo de tu aspecto: no da ataques ni ventajas por sí misma.', available: true });
  }
  return out;
}
