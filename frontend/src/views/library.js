// Biblioteca: lista de personajes guardados en este dispositivo.

import { html, setHtml, formatDate } from '../ui/dom.js';
import { toast, reportError, confirmDialog, openDialog, warningsMessage } from '../ui/feedback.js';
import { readCharacterFile, downloadCharacter } from '../services/file-transfer.js';
import { raw } from '../ui/dom.js';

export async function mountLibrary(container, { services, navigate }) {
  const page = document.createElement('section');
  page.className = 'page';
  container.append(page);

  let records = [];

  async function load() {
    setHtml(page, html`<div class="loading" role="status"><span class="spinner"></span> Cargando personajes…</div>`);
    try {
      records = await services.characters.list();
      render();
    } catch (err) {
      setHtml(page, html`<div class="empty-state"><h1>No se pudieron cargar tus personajes</h1>
        <p>${err.userMessage ?? 'El almacenamiento del navegador no está disponible.'}</p>
        <button class="btn btn--primary" data-act="retry">Reintentar</button></div>`);
    }
  }

  function card(r) {
    const s = r.summary ?? {};
    const initials = (s.name || '?').trim().slice(0, 1).toUpperCase();
    return html`
      <li class="char-card">
        <a class="char-card__main" href="/editar/${r.id}" data-link>
          ${s.portrait
            ? html`<img class="char-card__portrait" src="${s.portrait}" alt="" loading="lazy">`
            : html`<span class="char-card__portrait char-card__portrait--empty" aria-hidden="true">${initials}</span>`}
          <span class="char-card__info">
            <span class="char-card__name">${s.name || 'Personaje sin nombre'}</span>
            <span class="char-card__meta">${[s.race || 'Sin raza', s.classes || 'Sin clase'].join(' · ')}</span>
            <span class="char-card__date">Modificado ${formatDate(r.updatedAt)}</span>
          </span>
          <span class="char-card__level" title="Nivel">${s.level ? html`<small>Nv</small>${s.level}` : '—'}</span>
        </a>
        <div class="char-card__footer">
          ${r.cloud ? html`<span class="badge badge--accent" title="Tiene un enlace para compartir">🔗 Compartido</span>` : html`<span class="badge">Sólo en este dispositivo</span>`}
          <div class="row">
            <button class="icon-btn" data-act="duplicate" data-id="${r.id}" aria-label="Duplicar ${s.name || 'personaje'}" title="Duplicar">⧉</button>
            <button class="icon-btn" data-act="export" data-id="${r.id}" aria-label="Exportar ${s.name || 'personaje'}" title="Exportar .json">⤓</button>
            <button class="icon-btn icon-btn--danger" data-act="delete" data-id="${r.id}" aria-label="Eliminar ${s.name || 'personaje'}" title="Eliminar">🗑</button>
          </div>
        </div>
      </li>`;
  }

  function render() {
    setHtml(page, html`
      <header class="page-header">
        <div>
          <h1>Tus personajes</h1>
          <p>Se guardan automáticamente en este navegador. Exporta o comparte para usarlos en otros dispositivos.</p>
        </div>
        <div class="page-header__actions">
          <button class="btn btn--ghost" data-act="import">⤒ Importar .json</button>
          <button class="btn btn--primary" data-act="new">＋ Nuevo personaje</button>
        </div>
      </header>
      ${records.length === 0
        ? html`<div class="empty-state">
            <h2>Aún no tienes personajes</h2>
            <p>Crea tu primer héroe de Agarias: elige raza, clase y reparte sus atributos. Todo se guarda solo, incluso sin conexión.</p>
            <div class="row"><button class="btn btn--primary btn--lg" data-act="new">Crear personaje</button>
            <button class="btn btn--ghost btn--lg" data-act="import">Importar archivo</button></div>
          </div>`
        : html`<ul class="char-grid" role="list">${records.map(card)}</ul>`}
      <input type="file" accept=".json,application/json" class="visually-hidden" data-import-input tabindex="-1" aria-hidden="true">
      <p class="drop-hint faint">Consejo: también puedes arrastrar un archivo .json a esta página para importarlo.</p>`);
  }

  async function importFile(file) {
    try {
      const { character, warnings } = await readCharacterFile(file);
      const record = await services.characters.importCharacter(character);
      toast(`«${character.identity.name || 'Personaje'}» importado correctamente.`, { type: 'success' });
      if (warnings.length) {
        await openDialog({
          title: 'Importado con avisos',
          render(body, close) {
            setHtml(body, html`<p class="dialog__message">El personaje se importó, pero hubo datos que se corrigieron:</p>
              <div class="callout callout--warning"><p>${raw(warningsMessage(warnings))}</p></div>
              <div class="dialog__actions"><button class="btn btn--primary" data-dialog-close autofocus>Entendido</button></div>`);
          },
        });
      }
      navigate(`/editar/${record.id}`);
    } catch (err) {
      reportError(err, 'No se pudo importar el archivo.');
    }
  }

  async function onClick(e) {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const { act, id } = btn.dataset;
    try {
      if (act === 'retry') return load();
      if (act === 'new') {
        const record = await services.characters.create();
        return navigate(`/editar/${record.id}`);
      }
      if (act === 'import') return page.querySelector('[data-import-input]').click();
      if (act === 'duplicate') {
        await services.characters.duplicate(id);
        toast('Personaje duplicado.', { type: 'success' });
        return load();
      }
      if (act === 'export') {
        const opened = await services.characters.open(id);
        if (opened) downloadCharacter(opened.character);
        return;
      }
      if (act === 'delete') {
        const r = records.find((x) => x.id === id);
        const name = r?.summary?.name || 'este personaje';
        const ok = await confirmDialog({
          title: 'Eliminar personaje',
          message: r?.cloud
            ? `Se eliminará «${name}» de este dispositivo y su enlace compartido dejará de funcionar. Esta acción no se puede deshacer.`
            : `Se eliminará «${name}» de este dispositivo. Esta acción no se puede deshacer. Si quieres conservarlo, expórtalo antes.`,
          confirmLabel: 'Eliminar',
          danger: true,
        });
        if (!ok) return;
        try {
          await services.characters.remove(id, { alsoCloud: Boolean(r?.cloud) });
        } catch (err) {
          // Si el servidor no responde, se elimina localmente igualmente tras confirmar.
          const force = await confirmDialog({
            title: 'No se pudo eliminar el enlace',
            message: `${err.userMessage ?? 'El servidor no respondió.'} ¿Eliminarlo sólo de este dispositivo? El enlace compartido seguiría funcionando.`,
            confirmLabel: 'Eliminar localmente', danger: true,
          });
          if (!force) return;
          await services.characters.remove(id);
        }
        toast('Personaje eliminado.', { type: 'success' });
        return load();
      }
    } catch (err) {
      reportError(err);
    }
  }

  const onChange = (e) => {
    if (e.target.matches('[data-import-input]')) {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (file) importFile(file);
    }
  };
  const onDragOver = (e) => { if (e.dataTransfer?.types?.includes('Files')) { e.preventDefault(); page.classList.add('is-dragging'); } };
  const onDragLeave = () => page.classList.remove('is-dragging');
  const onDrop = (e) => {
    page.classList.remove('is-dragging');
    const file = e.dataTransfer?.files?.[0];
    if (file) { e.preventDefault(); importFile(file); }
  };

  page.addEventListener('click', onClick);
  page.addEventListener('change', onChange);
  window.addEventListener('dragover', onDragOver);
  window.addEventListener('dragleave', onDragLeave);
  window.addEventListener('drop', onDrop);
  await load();

  return {
    unmount() {
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
    },
  };
}
