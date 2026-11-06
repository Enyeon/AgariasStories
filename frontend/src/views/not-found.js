import { html, setHtml } from '../ui/dom.js';

export function mountNotFound(container) {
  const page = document.createElement('section');
  page.className = 'page';
  container.append(page);
  setHtml(page, html`<div class="empty-state">
    <h1>Página no encontrada</h1>
    <p>La dirección no corresponde a ninguna sección de la aplicación.</p>
    <a class="btn btn--primary" href="/" data-link>Ir a mis personajes</a>
  </div>`);
  return null;
}
