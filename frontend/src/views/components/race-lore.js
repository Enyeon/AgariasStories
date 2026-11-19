// Historia de las razas (lore): bloque para el selector de raza y diálogo de
// lectura para la ficha. Los datos están en data/race-lore.json, uno por linaje
// (todas las variantes comparten la misma historia).

import { html, richText, setHtml } from '../../ui/dom.js';
import { openDialog } from '../../ui/feedback.js';
import { getRaceLore, raceName, raceProfile, data } from '../../data/index.js';

/** Insignias de la ficha breve: tipo, tamaño y origen (sólo lo que declara la raza). */
export function raceProfileBadges(raceKey) {
  const p = raceProfile(raceKey);
  if (!p) return '';
  return html`${p.tipo ? html`<span class="badge">${p.tipo}</span>` : ''}${p.tamano ? html`<span class="badge">${p.tamano}</span>` : ''}${p.origen ? html`<span class="badge badge--accent" title="Origen">🌌 ${p.origen}</span>` : ''}`;
}

/** Secciones de la historia, con su título. */
export function loreSections(lore) {
  return html`${lore.resumen ? html`<p class="race-lore__summary">${lore.resumen}</p>` : ''}
    ${lore.secciones.map((s) => html`<section class="race-lore__section">
      ${s.titulo ? html`<h4 class="race-lore__title">${s.titulo}</h4>` : ''}
      <div class="rich">${richText(s.texto)}</div>
    </section>`)}`;
}

/** Otras razas del mismo linaje (subrazas y variantes). */
export function lineageRaces(raceKey) {
  const id = getRaceLore(raceKey)?.id;
  return id ? Object.keys(data.races).filter((k) => data.races[k].linaje === id) : [];
}

/** Diálogo de lectura (a pantalla completa en móvil). */
export function openRaceLore(raceKey) {
  const lore = getRaceLore(raceKey);
  if (!lore) return Promise.resolve();
  const family = lineageRaces(raceKey);
  return openDialog({
    title: `📜 ${lore.nombre}`,
    size: 'md',
    render(body) {
      setHtml(body, html`<div class="race-lore stack">
        ${family.length > 1 ? html`<p class="muted race-lore__family">Comparten esta historia: ${family.map(raceName).join(' · ')}</p>` : ''}
        ${loreSections(lore)}
        <div class="dialog__footer"><button type="button" class="btn btn--primary" data-dialog-close>Cerrar</button></div>
      </div>`);
    },
  });
}
