// Pestaña «Historia»: aspecto, retrato, idiomas, competencias y trasfondo.

import { html } from '../../ui/dom.js';
import { textField, textArea, sectionCard } from './common.js';

function portraitCard(ctx) {
  const src = ctx.character.identity.portrait;
  return html`<div class="portrait">
    <div class="portrait__frame">${src ? html`<img src="${src}" alt="Retrato de ${ctx.character.identity.name || 'el personaje'}">` : html`<span class="portrait__empty" aria-hidden="true">🜲</span>`}</div>
    ${ctx.readOnly ? '' : html`<div class="row">
      <label class="btn btn--ghost btn--sm">${src ? 'Cambiar imagen' : 'Subir imagen'}<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" class="visually-hidden" data-portrait-input></label>
      ${src ? html`<button type="button" class="btn btn--ghost btn--sm" data-action="remove-portrait">Quitar</button>` : ''}
    </div>
    <p class="field__hint">Se redimensiona a 512 px para que el personaje ocupe poco.</p>`}
  </div>`;
}

export function renderStory(ctx) {
  const lang = ctx.sheet.languages;
  const known = [...lang.fixed, ...lang.chosen];
  return html`<div class="stack">
    ${sectionCard({
      title: 'Identidad',
      body: html`<div class="identity-layout">
        ${portraitCard(ctx)}
        <div class="form-grid">
          ${textField(ctx, { label: 'Nombre del personaje', path: 'identity.name' })}
          ${textField(ctx, { label: 'Jugador/a', path: 'identity.player', placeholder: 'Tu nombre' })}
          ${textField(ctx, { label: 'Edad', path: 'identity.age', placeholder: 'En años' })}
          ${textField(ctx, { label: 'Altura', path: 'identity.height', placeholder: 'cm o pies' })}
          ${textField(ctx, { label: 'Peso', path: 'identity.weight', placeholder: 'kg o lb' })}
          ${textField(ctx, { label: 'Ojos', path: 'identity.eyes', placeholder: 'Ámbar, grises…' })}
          ${textField(ctx, { label: 'Piel', path: 'identity.skin', placeholder: 'Pálida, azulada…' })}
          ${textField(ctx, { label: 'Pelo', path: 'identity.hair', placeholder: 'Negro, blanco…' })}
        </div>
      </div>`,
    })}
    <div class="grid-2">
      ${sectionCard({
        title: 'Idiomas',
        subtitle: known.length ? known.join(', ') : 'Según la raza elegida.',
        body: textArea(ctx, { label: 'Otros idiomas y notas', path: 'notes.languages', rows: 4, placeholder: 'Idiomas aprendidos en campaña…' }),
      })}
      ${sectionCard({
        title: 'Competencias',
        subtitle: ctx.sheet.background?.tools.length ? `Del trasfondo: ${ctx.sheet.background.tools.join(', ')}` : 'Armaduras, armas, herramientas…',
        body: textArea(ctx, { label: 'Competencias', path: 'notes.proficiencies', rows: 4, hideLabel: true, placeholder: 'Armadura ligera, espadas cortas, herramientas de ladrón…' }),
      })}
    </div>
    ${sectionCard({
      title: 'Historia y personalidad',
      body: textArea(ctx, { label: 'Historia', path: 'notes.backstory', rows: 14, tall: true, hideLabel: true, placeholder: 'Escribe aquí la historia, el pasado o la mitología de tu personaje…' }),
    })}
  </div>`;
}

export const storyActions = {
  'remove-portrait': (ed) => ed.update((c) => { c.identity.portrait = null; }, { structural: true }),
};

