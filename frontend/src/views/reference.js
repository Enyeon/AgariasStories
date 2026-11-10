// Referencia rápida: acciones, condiciones, tipos de daño y estados de Agarias.
// Cada entrada distingue lo oficial de lo propio de la campaña y, cuando aplica,
// muestra qué hace, cómo se aplica y cómo termina. Lo que el DM aún no definió
// se muestra como pendiente en vez de inventarlo.

import { html, setHtml, richText, raw } from '../ui/dom.js';
import { data } from '../data/index.js';

const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const FILTERS = [
  { id: 'todo', label: 'Todo' },
  { id: 'accion', label: 'Acciones' },
  { id: 'condicion', label: 'Condiciones' },
  { id: 'danio', label: 'Tipos de daño' },
  { id: 'estado', label: 'Estados de Agarias' },
];
const ORIGINS = [
  { id: 'todos', label: 'Oficial y Agarias' },
  { id: 'oficial', label: 'Sólo oficial' },
  { id: 'agarias', label: 'Sólo Agarias' },
];

const PENDING = html`<span class="muted">Pendiente de definir por el DM.</span>`;

function searchable(i) {
  return norm([i.name, i.en, i.summary, i.text, i.original, i.flavor, i.note, ...(i.effect ?? []), i.applies, i.ends].join(' '));
}

function entryBody(i) {
  if (i.text) return html`<div class="rich">${richText(i.text)}</div>`;
  const agarias = i.origin === 'agarias';
  const rows = [
    i.effect !== undefined ? ['Efecto', i.effect?.length ? html`<ul class="basics__list">${i.effect.map((e) => html`<li>${e}</li>`)}</ul>` : PENDING] : null,
    i.applies !== undefined && i.kind !== 'danio' ? ['Cómo se aplica', i.applies ?? PENDING] : null,
    i.ends !== undefined && i.kind !== 'danio' ? ['Cómo termina', i.ends ?? PENDING] : null,
    i.related?.length ? ['Relacionadas', i.related.join(', ')] : null,
  ].filter(Boolean);
  return html`
    ${i.summary ? html`<p class="reference-entry__summary">${i.summary}</p>` : ''}
    ${rows.length ? html`<dl class="basics basics--compact">${rows.map(([dt, dd]) => html`<div class="basics__row"><dt>${dt}</dt><dd>${dd}</dd></div>`)}</dl>` : ''}
    ${i.note ? html`<p class="callout ${agarias ? 'callout--warning' : ''}">${i.note}</p>` : ''}
    ${i.flavor ? html`<p class="reference-entry__flavor"><strong>Descripción de Agarias:</strong> ${i.flavor}</p>` : ''}
    ${agarias && i.original && i.original !== i.summary ? html`<p class="reference-entry__flavor"><strong>Texto original:</strong> ${i.original}</p>` : ''}`;
}

export function mountReference(container) {
  const page = document.createElement('section');
  page.className = 'page';
  container.append(page);
  const state = { query: '', kind: 'todo', origin: 'todos' };

  function groups() {
    const q = norm(state.query.trim());
    return data.rulesReference
      .filter((g) => state.kind === 'todo' || g.kind === state.kind)
      .map((g) => ({
        ...g,
        items: g.items.filter((i) => (state.origin === 'todos' || (i.origin ?? 'oficial') === state.origin) && (!q || searchable(i).includes(q))),
      }))
      .filter((g) => g.items.length);
  }

  function renderList() {
    const gs = groups();
    if (!gs.length) return html`<p class="muted">Sin resultados${state.query ? ` para «${state.query}»` : ''}.</p>`;
    return gs.map((g) => html`<section class="reference-group">
      <h2>${g.title}</h2>
      <p class="muted">${g.intro}</p>
      <div class="reference-grid">${g.items.map((i) => html`<details class="disclosure reference-entry" ${state.query ? raw('open') : ''}>
        <summary>
          <span>${i.name}${i.en && !i.name.includes('(') ? html` <small class="muted">${i.en}</small>` : ''}</span>
          ${i.origin === 'agarias' ? html`<span class="badge badge--gold">Agarias</span>` : ''}
          ${i.origin === 'agarias' && (i.applies === null || i.ends === null || i.effect === null) && i.kind !== 'danio' ? html`<span class="badge badge--warning">Pendiente</span>` : ''}
        </summary>
        <div class="disclosure__body">${entryBody(i)}</div>
      </details>`)}</div>
    </section>`);
  }

  setHtml(page, html`
    <header class="page-header">
      <div><h1>Referencia de reglas</h1><p>Acciones de combate, condiciones, tipos de daño y estados de Agarias.</p></div>
      <input class="input reference-search" type="search" placeholder="Buscar (p. ej. «agarrado»)…" aria-label="Buscar en la referencia" data-search>
    </header>
    <div class="reference-filters">
      <div class="chips" role="group" aria-label="Categoría">${FILTERS.map((f) => html`<button type="button" class="chip-toggle ${state.kind === f.id ? 'is-on' : ''}" aria-pressed="${state.kind === f.id}" data-kind="${f.id}">${f.label}</button>`)}</div>
      <div class="chips" role="group" aria-label="Origen">${ORIGINS.map((f) => html`<button type="button" class="chip-toggle ${state.origin === f.id ? 'is-on' : ''}" aria-pressed="${state.origin === f.id}" data-origin="${f.id}">${f.label}</button>`)}</div>
    </div>
    <div data-list>${renderList()}</div>`);

  const refresh = () => setHtml(page.querySelector('[data-list]'), renderList());
  page.querySelector('[data-search]').addEventListener('input', (e) => { state.query = e.target.value; refresh(); });
  page.addEventListener('click', (e) => {
    const k = e.target.closest('[data-kind]');
    const o = e.target.closest('[data-origin]');
    if (!k && !o) return;
    if (k) state.kind = k.dataset.kind;
    if (o) state.origin = o.dataset.origin;
    for (const b of page.querySelectorAll('[data-kind]')) { const on = b.dataset.kind === state.kind; b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', on); }
    for (const b of page.querySelectorAll('[data-origin]')) { const on = b.dataset.origin === state.origin; b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', on); }
    refresh();
  });
  return null;
}
