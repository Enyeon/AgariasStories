// Referencia rápida de acciones, condiciones y estados (contenido del original).

import { html, setHtml, richText } from '../ui/dom.js';
import { data } from '../data/index.js';

const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function mountReference(container) {
  const page = document.createElement('section');
  page.className = 'page';
  container.append(page);
  let query = '';

  function groups() {
    const q = norm(query.trim());
    return data.rulesReference
      .map((g) => ({ ...g, items: g.items.filter((i) => !q || norm(`${i.name} ${i.text}`).includes(q)) }))
      .filter((g) => g.items.length);
  }

  function renderList() {
    const gs = groups();
    if (!gs.length) return html`<p class="muted">Sin resultados para «${query}».</p>`;
    return gs.map((g) => html`<section class="reference-group">
      <h2>${g.title}</h2>
      <p class="muted">${g.intro}</p>
      <div class="reference-grid">${g.items.map((i) => html`<details class="disclosure" ${query ? 'open' : ''}>
        <summary>${i.name}</summary>
        <div class="disclosure__body rich">${richText(i.text)}</div>
      </details>`)}</div>
    </section>`);
  }

  setHtml(page, html`
    <header class="page-header">
      <div><h1>Referencia de reglas</h1><p>Acciones de combate, condiciones y estados de Agarias.</p></div>
      <input class="input reference-search" type="search" placeholder="Buscar (p. ej. «agarrado»)…" aria-label="Buscar en la referencia" data-search>
    </header>
    <div data-list>${renderList()}</div>`);

  page.querySelector('[data-search]').addEventListener('input', (e) => {
    query = e.target.value;
    setHtml(page.querySelector('[data-list]'), renderList());
  });
  return null;
}
