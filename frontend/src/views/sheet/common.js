// Piezas de formulario reutilizables por las pestañas de la ficha.
// Los campos llevan data-bind="ruta.del.personaje" y data-type; el editor
// escucha los eventos y actualiza el personaje (ver views/editor.js).

import { html, raw, getPath } from '../../ui/dom.js';
import { formatModifier } from '../../domain/rules.js';

let seq = 0;
const nextId = () => `f${++seq}`;

export function bindAttrs(path, type = 'text', readOnly = false) {
  return raw(`data-bind="${path}" data-type="${type}"${readOnly ? ' disabled' : ''}`);
}

export function textField(ctx, { label, path, placeholder = '', hint = '', maxlength = 120, list = '' }) {
  const id = nextId();
  return html`<div class="field">
    <label class="field__label" for="${id}">${label}</label>
    <input class="input" id="${id}" type="text" value="${getPath(ctx.character, path) ?? ''}" placeholder="${placeholder}" maxlength="${maxlength}" ${list ? raw(`list="${list}"`) : ''} ${bindAttrs(path, 'text', ctx.readOnly)}>
    ${hint ? html`<span class="field__hint">${hint}</span>` : ''}
  </div>`;
}

export function numberField(ctx, { label, path, min = 0, max = 9999, placeholder = '', hint = '', optional = false, value }) {
  const id = nextId();
  const v = value !== undefined ? value : getPath(ctx.character, path);
  return html`<div class="field">
    <label class="field__label" for="${id}">${label}</label>
    <input class="input input--num" id="${id}" type="number" inputmode="numeric" min="${min}" max="${max}" value="${v ?? ''}" placeholder="${placeholder}" ${bindAttrs(path, optional ? 'optint' : 'int', ctx.readOnly)} data-min="${min}" data-max="${max}">
    ${hint ? html`<span class="field__hint">${hint}</span>` : ''}
  </div>`;
}

export function textArea(ctx, { label, path, placeholder = '', rows = 6, tall = false, maxlength = 20000, hideLabel = false }) {
  const id = nextId();
  return html`<div class="field">
    <label class="field__label ${hideLabel ? 'visually-hidden' : ''}" for="${id}">${label}</label>
    <textarea class="textarea ${tall ? 'textarea--tall' : ''}" id="${id}" rows="${rows}" placeholder="${placeholder}" maxlength="${maxlength}" ${bindAttrs(path, 'text', ctx.readOnly)}>${getPath(ctx.character, path) ?? ''}</textarea>
  </div>`;
}

export function selectField(ctx, { label, path, options, placeholder = '— Elegir —' }) {
  const id = nextId();
  const current = getPath(ctx.character, path) ?? '';
  return html`<div class="field">
    <label class="field__label" for="${id}">${label}</label>
    <select class="select" id="${id}" ${bindAttrs(path, 'text', ctx.readOnly)}>
      <option value="">${placeholder}</option>
      ${options.map((o) => {
        const value = typeof o === 'string' ? o : o.value;
        const text = typeof o === 'string' ? o : o.label;
        return html`<option value="${value}" ${value === current ? raw('selected') : ''}>${text}</option>`;
      })}
    </select>
  </div>`;
}

export const mod = (n) => formatModifier(n);

/** Valor calculado que el editor refresca sin re-renderizar (data-out). */
export function out(key, value) {
  return html`<span data-out="${key}">${value}</span>`;
}

export function actionButton(ctx, { action, label, variant = 'btn--ghost', attrs = '', title = '', disabled = false }) {
  if (ctx.readOnly) return '';
  return html`<button type="button" class="btn ${variant}" data-action="${action}" ${raw(attrs)} ${title ? raw(`title="${title.replace(/"/g, '&quot;')}"`) : ''} ${disabled ? raw('disabled') : ''}>${label}</button>`;
}

export function sectionCard({ title, subtitle = '', actions = '', body, className = '' }) {
  return html`<section class="card ${className}">
    <header class="card__header">
      <div><h3 class="card__title">${title}</h3>${subtitle ? html`<p class="card__subtitle">${subtitle}</p>` : ''}</div>
      ${actions ? html`<div class="row">${actions}</div>` : ''}
    </header>
    ${body}
  </section>`;
}
