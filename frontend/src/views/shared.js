// Vista de un personaje compartido por enlace (sólo lectura).

import { html, setHtml, formatDate } from '../ui/dom.js';
import { toast, reportError } from '../ui/feedback.js';
import { createSheetView } from './sheet/sheet-view.js';
import { downloadCharacter } from '../services/file-transfer.js';

export async function mountShared(container, { services, navigate }, cloudId) {
  const page = document.createElement('section');
  page.className = 'page page--sheet';
  container.append(page);

  async function load() {
    setHtml(page, html`<div class="loading" role="status"><span class="spinner"></span> Cargando personaje…</div>`);
    let shared;
    let own = null;
    try {
      [shared, own] = await Promise.all([
        services.characters.loadShared(cloudId),
        services.characters.findByCloudId(cloudId).catch(() => null),
      ]);
    } catch (err) {
      const notFound = err.code === 'not_found';
      setHtml(page, html`<div class="empty-state">
        <h1>${notFound ? 'Este enlace no existe' : 'No se pudo cargar el personaje'}</h1>
        <p>${notFound ? 'El personaje se eliminó o el enlace está mal copiado. Pide a quien lo compartió un enlace nuevo.' : (err.userMessage ?? 'Inténtalo de nuevo en unos momentos.')}</p>
        <div class="row">${notFound ? '' : html`<button class="btn btn--primary" data-act="retry">Reintentar</button>`}<a class="btn btn--ghost" href="/" data-link>Ir a mis personajes</a></div>
      </div>`);
      if (!notFound) console.error(err);
      return;
    }

    const c = shared.character;
    setHtml(page, html`
      <header class="sheet-header">
        <div class="sheet-header__title">
          <div>
            <p class="eyebrow">Personaje compartido · sólo lectura</p>
            <h1 class="sheet-header__name">${c.identity.name || 'Personaje sin nombre'}</h1>
            <p class="sheet-header__status">Actualizado ${formatDate(shared.updatedAt)}${c.identity.player ? ` · Jugador/a: ${c.identity.player}` : ''}</p>
          </div>
        </div>
        <div class="sheet-header__actions">
          ${own ? html`<a class="btn btn--gold" href="/editar/${own.id}" data-link>✎ Editar (es tuyo)</a>` : ''}
          <button type="button" class="btn btn--ghost" data-act="export">⤓ Exportar</button>
          <button type="button" class="btn btn--primary" data-act="copy">＋ Guardar una copia</button>
        </div>
      </header>
      ${shared.warnings.length ? html`<div class="callout callout--warning"><p>Algunos datos de este personaje no coinciden con la versión actual de la aplicación y se mostraron corregidos.</p></div>` : ''}
      <div data-sheet></div>`);
    createSheetView(page.querySelector('[data-sheet]'), { character: c, readOnly: true });

    page.onclick = async (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      try {
        if (act === 'export') downloadCharacter(c);
        if (act === 'copy') {
          const record = await services.characters.importCharacter(structuredClone(c));
          toast('Copia guardada en tus personajes. Ya puedes editarla.', { type: 'success' });
          navigate(`/editar/${record.id}`);
        }
      } catch (err) {
        reportError(err);
      }
    };
  }

  page.addEventListener('click', (e) => {
    if (e.target.closest('[data-act="retry"]')) load();
  });
  await load();
  return null;
}

