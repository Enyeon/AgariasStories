// Tarjeta «Recursos» (AgSt 1.34): usos con recarga y botones de descanso.
// Los recursos de los datos se calculan solos; el jugador puede añadir
// contadores propios para lo que los datos todavía no declaran.

import { html, raw, setHtml } from '../../ui/dom.js';
import { openDialog, toast, confirmDialog } from '../../ui/feedback.js';
import { sectionCard } from './common.js';
import {
  spendResource, shortRest, longRest, addCustomResource, removeCustomResource,
} from '../../domain/resources.js';

function pips(r) {
  // Hasta 12 usos se dibujan como casillas; más, como número.
  if (r.max > 12) return html`<span class="res-count"><strong>${r.left}</strong> / ${r.max}</span>`;
  return html`<span class="res-pips" aria-hidden="true">${Array.from({ length: r.max }, (_, i) => html`<span class="res-pip ${i < r.left ? 'is-on' : ''}"></span>`)}</span>`;
}

function resourceRow(ctx, r) {
  const ro = ctx.readOnly;
  return html`<li class="res-item" data-resource="${r.id}">
    <div class="res-item__head">
      <span class="res-item__name">${r.nombre}</span>
      <span class="res-item__meta">${r.source}${r.shortLabel ? ` · recupera ${r.shortLabel}` : ''}</span>
    </div>
    <div class="res-item__controls">
      ${pips(r)}
      <span class="visually-hidden">${r.left} de ${r.max} usos</span>
      ${ro ? '' : html`
        <button type="button" class="icon-btn" data-action="res-spend" data-id="${r.id}" ${r.left ? '' : raw('disabled')} aria-label="Gastar un uso de ${r.nombre}">−</button>
        <button type="button" class="icon-btn" data-action="res-regain" data-id="${r.id}" ${r.used ? '' : raw('disabled')} aria-label="Recuperar un uso de ${r.nombre}">+</button>
        ${r.custom ? html`<button type="button" class="icon-btn" data-action="res-remove" data-id="${r.id}" aria-label="Quitar el contador ${r.nombre}">×</button>` : ''}`}
    </div>
  </li>`;
}

/** Tarjeta de recursos. No se muestra en modo lectura si no hay ninguno. */
export function resourcesCard(ctx) {
  const list = ctx.sheet.resources ?? [];
  if (!list.length && ctx.readOnly) return '';
  const actions = ctx.readOnly ? '' : html`
    <button type="button" class="btn btn--ghost btn--sm" data-action="res-short" ${list.some((r) => r.used && r.shortRegain) ? '' : raw('disabled')}>Descanso corto</button>
    <button type="button" class="btn btn--ghost btn--sm" data-action="res-long" ${list.some((r) => r.used) ? '' : raw('disabled')}>Descanso largo</button>`;
  return sectionCard({
    title: 'Recursos',
    subtitle: list.length ? 'Usos que se gastan y vuelven al descansar. Los descansos sólo recuperan los recursos (los PG, a mano).' : 'Aquí aparecen los usos de tus rasgos (Esencia, Furia, Ki…). Si tu clase aún no los declara, añade un contador propio.',
    actions,
    className: 'resources-card',
    body: html`
      ${list.length ? html`<ul class="res-list" role="list">${list.map((r) => resourceRow(ctx, r))}</ul>` : ''}
      ${ctx.readOnly ? '' : html`<button type="button" class="link-btn" data-action="res-add">+ Contador propio</button>`}`,
  });
}

function customDialog() {
  return openDialog({
    title: 'Contador propio',
    size: 'sm',
    render(body, close) {
      setHtml(body, html`<form class="stack" data-form>
        <div class="field"><label class="field__label" for="res-name">Nombre</label>
          <input id="res-name" class="input" name="nombre" maxlength="60" required placeholder="Ej.: Furia" autofocus></div>
        <div class="field"><label class="field__label" for="res-max">Usos máximos</label>
          <input id="res-max" class="input input--num" name="max" type="number" min="1" max="99" value="3" required></div>
        <div class="field"><label class="field__label" for="res-short">Descanso corto</label>
          <select id="res-short" class="select" name="corto">
            <option value="nada">No recupera</option>
            <option value="uno">Recupera 1 uso</option>
            <option value="todo">Recupera todo</option>
          </select>
          <p class="field__hint">Con un descanso largo siempre se recupera todo.</p></div>
        <p class="field__error" data-error role="alert"></p>
        <div class="dialog__actions">
          <button type="button" class="btn btn--ghost" data-dialog-close>Cancelar</button>
          <button type="submit" class="btn btn--primary">Añadir</button>
        </div>
      </form>`);
      body.querySelector('form').addEventListener('submit', (ev) => {
        ev.preventDefault();
        const f = new FormData(ev.target);
        const corto = f.get('corto') === 'uno' ? { valor: 1 } : f.get('corto');
        close({ nombre: String(f.get('nombre') ?? ''), max: Number(f.get('max')), corto });
      });
    },
  });
}

export const resourceActions = {
  'res-spend': (ed, el) => ed.update((c) => { spendResource(c, ed.sheet.resources, el.dataset.id, 1); }),
  'res-regain': (ed, el) => ed.update((c) => { spendResource(c, ed.sheet.resources, el.dataset.id, -1); }),
  'res-short': (ed) => {
    ed.update((c) => { shortRest(c, ed.sheet.resources); });
    toast('Descanso corto: recursos recuperados.', { type: 'success' });
  },
  'res-long': (ed) => {
    ed.update((c) => { longRest(c, ed.sheet.resources); });
    toast('Descanso largo: recursos al máximo.', { type: 'success' });
  },
  'res-add': async (ed) => {
    const raw = await customDialog();
    if (!raw) return;
    let added = null;
    ed.update((c) => { added = addCustomResource(c, raw); });
    if (!added) toast('Ese contador ya existe o no es válido.', { type: 'warning' });
  },
  'res-remove': async (ed, el) => {
    const r = ed.sheet.resources.find((x) => x.id === el.dataset.id);
    if (!r) return;
    const ok = await confirmDialog({ title: `Quitar «${r.nombre}»`, message: 'Se quitará el contador y los usos gastados.', confirmLabel: 'Quitar', danger: true });
    if (ok) ed.update((c) => { removeCustomResource(c, r.id); });
  },
};
