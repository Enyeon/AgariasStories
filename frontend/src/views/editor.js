// Editor de un personaje local: ficha + guardado automático + exportar/compartir.

import { html, setHtml, raw, debounce, formatDate } from '../ui/dom.js';
import { toast, reportError, openDialog, choiceDialog, confirmDialog, warningsMessage } from '../ui/feedback.js';
import { createSheetView } from './sheet/sheet-view.js';
import { downloadCharacter } from '../services/file-transfer.js';
import { shareUrl, ApiError } from '../services/api.js';
import { findIncompleteFields } from '../domain/validation.js';
import { fingerprint } from '../services/characters.js';
import { mergeCharacters } from '../domain/merge.js';

const AUTOSAVE_MS = 700;

export async function mountEditor(container, { services, navigate }, id) {
  const page = document.createElement('section');
  page.className = 'page page--sheet';
  container.append(page);
  setHtml(page, html`<div class="loading" role="status"><span class="spinner"></span> Cargando personaje…</div>`);

  let opened;
  try {
    // PJ de campaña: primero se trae lo último de la campaña (lo que cambió el DM).
    if (id.startsWith('cp_')) await services.characters.refreshCopy?.(id).catch((err) => console.warn('[editor] Sin conexión con la campaña', err));
    opened = await services.characters.open(id);
  } catch (err) {
    setHtml(page, html`<div class="empty-state"><h1>No se pudo abrir el personaje</h1><p>${err.userMessage ?? 'Los datos guardados están dañados o no son compatibles.'}</p><a class="btn btn--primary" href="/" data-link>Volver a mis personajes</a></div>`);
    console.error(err);
    return null;
  }
  if (!opened) {
    setHtml(page, html`<div class="empty-state"><h1>Personaje no encontrado</h1><p>No existe en este dispositivo. Puede que se haya eliminado o que lo creases en otro navegador.</p><a class="btn btn--primary" href="/" data-link>Volver a mis personajes</a></div>`);
    return null;
  }

  let record = opened.record;
  // Última versión guardada que conoce esta pestaña: base para combinar cambios
  // hechos a la vez en otra (la Tienda cobrando mientras sumas monedas aquí).
  let base = structuredClone(opened.character);
  let status = 'saved';
  let lastError = null;
  let savingPromise = null;

  setHtml(page, html`
    <header class="sheet-header">
      <div class="sheet-header__title">
        <a class="back-link" href="/" data-link aria-label="Volver a mis personajes">←</a>
        <div>
          <h1 class="sheet-header__name">${opened.character.identity.name || 'Personaje sin nombre'}</h1>
          <p class="sheet-header__status" data-save-status aria-live="polite"></p>
        </div>
      </div>
      <div class="sheet-header__actions">
        <button type="button" class="btn btn--ghost" data-editor="save" title="Guardar ahora (Ctrl+S)">💾 Guardar</button>
        <button type="button" class="btn btn--ghost" data-editor="export" title="Descargar como archivo .json">⤓ Exportar</button>
        ${opened.record.pc
          ? html`<a class="btn btn--primary" href="/campanas/${opened.record.pc.campaignId}" data-link title="Esta ficha es la copia del PJ en la campaña">🏰 ${opened.record.pc.campaignName || 'Campaña'}</a>`
          : html`<button type="button" class="btn btn--primary" data-editor="share">🔗 Compartir</button>`}
      </div>
    </header>
    ${opened.record.pc ? html`<p class="callout callout--accent campaign-copy-note">Copia de campaña: lo que cambies aquí lo ve el DM y queda en el registro de la campaña. Tu personaje original no cambia.${opened.record.pc.status === 'pendiente' ? ' (Pendiente de aprobación del DM.)' : ''}${opened.record.pc.state === 'muerto' ? ' 💀 Este PJ está muerto.' : ''}</p>` : ''}
    <div data-sheet></div>`);

  const statusEl = page.querySelector('[data-save-status]');
  const nameEl = page.querySelector('.sheet-header__name');
  const shareBtn = page.querySelector('[data-editor="share"]');

  function cloudState() {
    if (record.pc) return 'campaign';
    if (!record.cloud) return 'none';
    return record.cloud.fingerprint === fingerprint(sheetView.character) ? 'synced' : 'outdated';
  }

  function renderStatus() {
    const text = {
      saved: record.pc
        ? (record.pc.dirty ? `✓ Guardado en este dispositivo · ⏳ pendiente de subir a la campaña` : `✓ Guardado en la campaña · ${formatDate(record.updatedAt)}`)
        : `✓ Guardado en este dispositivo · ${formatDate(record.updatedAt)}`,
      pending: 'Cambios sin guardar…',
      saving: 'Guardando personaje…',
      error: '⚠ No se pudo guardar el personaje.',
    }[status];
    statusEl.className = `sheet-header__status is-${status}`;
    setHtml(statusEl, html`${text}${status === 'error' ? html` <button type="button" class="link-btn" data-editor="save">Reintentar</button>` : ''}`);
    const cs = cloudState();
    if (!shareBtn) return;
    shareBtn.textContent = cs === 'none' ? '🔗 Compartir' : cs === 'outdated' ? '🔗 Publicar cambios' : '🔗 Compartido';
    shareBtn.classList.toggle('btn--gold', cs === 'outdated');
    shareBtn.classList.toggle('btn--primary', cs !== 'outdated');
  }

  /**
   * Si otra pestaña guardó este personaje (compra en la Tienda, monedas, etc.),
   * trae esa versión: tal cual si aquí no hay cambios, o combinada con los de
   * aquí si los hay (sin perder ninguno de los dos). Devuelve true si cambió algo.
   */
  async function pullExternal() {
    const stored = await services.characters.storedUpdatedAt(record.id).catch(() => null);
    if (!stored || stored === record.updatedAt) return false;
    const fresh = await services.characters.open(record.id).catch(() => null);
    if (!fresh) return false;
    const mine = sheetView.character;
    const dirty = status !== 'saved';
    const next = dirty ? mergeCharacters(base, mine, fresh.character) : fresh.character;
    record = fresh.record;
    base = structuredClone(fresh.character);
    sheetView.load(next);
    nameEl.textContent = next.identity.name.trim() || 'Personaje sin nombre';
    toast(dirty ? 'Se combinaron tus cambios con los hechos en otra pestaña (p. ej. la Tienda).' : 'Ficha actualizada con los cambios hechos en otra pestaña (p. ej. la Tienda).', { type: 'info' });
    return true;
  }

  async function save() {
    autosave.cancel();
    if (savingPromise) await savingPromise;
    if (status === 'saved') return true;
    status = 'saving';
    renderStatus();
    savingPromise = (async () => {
      try {
        // Nunca pisar lo que otra pestaña guardó entretanto: primero se combina.
        await pullExternal();
        const saving = structuredClone(sheetView.character);
        try {
          record = await services.characters.save(record, saving);
        } catch (err) {
          // PJ de campaña sin acceso: quedó guardado aquí, pero no en la campaña.
          if (err.record) { record = err.record; base = saving; }
          throw err;
        }
        base = saving;
        if (record.remoteMerged) {
          // El DM cambió la ficha a la vez: se muestra la versión combinada.
          const fresh = await services.characters.open(record.id);
          if (fresh) {
            base = structuredClone(fresh.character);
            sheetView.load(fresh.character);
            toast('Se combinaron tus cambios con los que hizo el DM en la campaña.', { type: 'info' });
          }
        }
        status = 'saved';
        lastError = null;
        return true;
      } catch (err) {
        status = 'error';
        lastError = err;
        console.error('[editor] Error al guardar', err);
        return false;
      } finally {
        savingPromise = null;
        renderStatus();
      }
    })();
    const ok = await savingPromise;
    if (!ok) toast(lastError?.userMessage ?? 'No se pudo guardar el personaje.', { type: 'error' });
    return ok;
  }

  const autosave = debounce(save, AUTOSAVE_MS);

  const sheetView = createSheetView(page.querySelector('[data-sheet]'), {
    character: opened.character,
    /** Trasfondos homebrew de tus otros personajes, para reutilizarlos. */
    async listHomebrewBackgrounds() {
      const records = await services.characters.list().catch(() => []);
      const seen = new Set();
      const out = [];
      for (const r of records) {
        const bg = r.id !== record.id ? r.document?.character?.background : null;
        if (bg?.source !== 'custom' || !bg.custom?.name) continue;
        const fp = JSON.stringify(bg.custom);
        if (!seen.has(fp)) { seen.add(fp); out.push(bg.custom); }
      }
      return out;
    },
    campaigns: () => services.homebrew?.memberships() ?? [],
    recordId: record.id,
    initialTab: opened.character.levels.length === 0 && !opened.character.race.key && opened.character.identity.name ? 'progresion' : 'resumen',
    onChange(character) {
      nameEl.textContent = character.identity.name.trim() || 'Personaje sin nombre';
      status = 'pending';
      renderStatus();
      autosave();
    },
  });

  // Si al abrir se corrigieron datos, se informa y se guarda la versión normalizada.
  if (opened.warnings.length) {
    status = 'pending';
    save();
    openDialog({
      title: 'Se corrigieron algunos datos',
      render(body) {
        setHtml(body, html`<p class="dialog__message">Este personaje tenía datos de una versión anterior o incompletos. Se ajustaron así:</p>
          <div class="callout callout--warning"><p>${raw(warningsMessage(opened.warnings))}</p></div>
          <div class="dialog__actions"><button class="btn btn--primary" data-dialog-close autofocus>Entendido</button></div>`);
      },
    });
  }

  // ── Compartir ──────────────────────────────────────────────────────────
  async function publish({ force = false } = {}) {
    if (savingPromise) await savingPromise;
    await pullExternal();
    const publishing = structuredClone(sheetView.character);
    record = await services.characters.publish(record, publishing, { force });
    base = publishing;
    status = 'saved';
    renderStatus();
  }

  async function publishWithConflictHandling() {
    try {
      await publish();
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.code === 'conflict') {
        const choice = await choiceDialog({
          title: 'La copia en línea cambió',
          message: 'El personaje compartido se actualizó desde otro dispositivo después de tu última publicación.',
          choices: [
            { label: 'Sobrescribir con esta versión', value: 'force', variant: 'btn--danger' },
            { label: 'Cancelar', value: 'cancel' },
          ],
        });
        if (choice === 'force') { await publish({ force: true }); return true; }
        return false;
      }
      throw err;
    }
  }

  function openShareDialog() {
    return openDialog({
      title: 'Compartir personaje',
      render(body) {
        let busy = false;
        function render() {
          const cs = cloudState();
          const issues = findIncompleteFields(sheetView.character);
          const url = record.cloud ? shareUrl(record.cloud.id) : '';
          setHtml(body, html`
            ${cs === 'none' ? html`
              <p class="dialog__message">Se subirá una copia del personaje al servidor y obtendrás un enlace. <strong>Cualquiera con el enlace podrá verlo y guardarse una copia, pero sólo tú (desde este navegador) podrás actualizarlo.</strong></p>
              ${issues.length ? html`<div class="callout callout--warning"><p><strong>Hay datos incompletos o inválidos:</strong><br>${issues.join(' ')}</p></div>` : ''}
              <div class="dialog__actions">
                <button class="btn btn--ghost" data-dialog-close>Cancelar</button>
                <button class="btn btn--primary" data-share="create" ${busy || !sheetView.character.identity.name.trim() ? raw('disabled') : ''}>${busy ? html`<span class="spinner"></span> Creando enlace…` : 'Crear enlace'}</button>
              </div>
              ${!sheetView.character.identity.name.trim() ? html`<p class="field__error">Ponle nombre al personaje antes de compartirlo.</p>` : ''}`
            : html`
              <div class="field">
                <label class="field__label" for="share-url">Enlace para compartir</label>
                <div class="row row--nowrap"><input id="share-url" class="input" type="text" readonly value="${url}">
                <button class="btn btn--primary" data-share="copy">Copiar</button></div>
              </div>
              <p class="${cs === 'synced' ? 'callout callout--success' : 'callout callout--warning'}">${cs === 'synced'
                ? `La copia en línea está al día (publicada ${formatDate(record.cloud.syncedAt)}).`
                : 'Tienes cambios que aún no están en el enlace compartido.'}</p>
              <div class="dialog__actions">
                <button class="btn btn--ghost btn--danger-text" data-share="stop" ${busy ? raw('disabled') : ''}>Dejar de compartir</button>
                <a class="btn btn--ghost" href="${url}" target="_blank" rel="noopener">Abrir enlace ↗</a>
                <button class="btn ${cs === 'outdated' ? 'btn--gold' : 'btn--ghost'}" data-share="update" ${busy ? raw('disabled') : ''}>${busy ? html`<span class="spinner"></span> Publicando…` : 'Publicar cambios'}</button>
              </div>
              <p class="field__hint">El permiso para actualizar el enlace se guarda en este navegador. Si lo borras o cambias de dispositivo, podrás compartir de nuevo con un enlace nuevo.</p>`}`);
        }
        body.addEventListener('click', async (e) => {
          const act = e.target.closest('[data-share]')?.dataset.share;
          if (!act || busy) return;
          try {
            if (act === 'copy') {
              const input = body.querySelector('#share-url');
              try { await navigator.clipboard.writeText(input.value); } catch { input.select(); document.execCommand?.('copy'); }
              toast('Enlace copiado al portapapeles.', { type: 'success' });
              return;
            }
            if (act === 'stop') {
              const ok = await confirmDialog({ title: 'Dejar de compartir', message: 'El enlace dejará de funcionar para todos. El personaje sigue guardado en este dispositivo.', confirmLabel: 'Dejar de compartir', danger: true });
              if (!ok) return;
              busy = true; render();
              record = await services.characters.unpublish(record);
              toast('El enlace ya no está activo.', { type: 'success' });
              busy = false; renderStatus(); render();
              return;
            }
            busy = true; render();
            const done = await publishWithConflictHandling();
            busy = false; render();
            if (done) toast(act === 'create' ? 'Enlace creado. ¡Ya puedes compartirlo!' : 'Copia en línea actualizada.', { type: 'success' });
          } catch (err) {
            busy = false; render();
            reportError(err, 'No se pudo compartir el personaje.');
          }
        });
        render();
      },
    });
  }

  page.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-editor]')?.dataset.editor;
    if (!act) return;
    try {
      if (act === 'save') {
        status = status === 'saved' ? 'pending' : status;
        if (await save()) toast('Personaje guardado correctamente.', { type: 'success' });
      }
      if (act === 'export') {
        downloadCharacter(sheetView.character);
        toast('Archivo exportado. Guárdalo para importarlo cuando quieras.', { type: 'success' });
      }
      if (act === 'share') {
        if (!(await save())) return;
        await openShareDialog();
        renderStatus();
      }
    } catch (err) {
      reportError(err);
    }
  });

  const onKey = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      status = status === 'saved' ? 'pending' : status;
      save().then((ok) => ok && toast('Personaje guardado correctamente.', { type: 'success' }));
    }
  };
  const onBeforeUnload = (e) => {
    if (status !== 'saved') { save(); e.preventDefault(); e.returnValue = ''; }
  };
  const onHide = () => {
    if (document.visibilityState === 'hidden' && status === 'pending') save();
    if (document.visibilityState === 'visible') syncExternal();
  };
  // Otra pestaña guardó este personaje: se trae enseguida (si aquí hay cambios
  // pendientes, se combinan al guardar).
  let syncing = null;
  function syncExternal() {
    if (syncing || savingPromise || status !== 'saved') return syncing;
    const pull = record.pc
      ? services.characters.refreshCopy(record.id).catch(() => null).then(() => pullExternal())
      : pullExternal();
    syncing = pull.catch((err) => console.warn('[editor] No se pudo traer la otra versión', err)).finally(() => { syncing = null; });
    return syncing;
  }
  const offExternal = services.characters.onExternalChange?.((msg) => {
    if (msg.id !== record.id) return;
    if (status === 'saved') syncExternal();
    else autosave(); // al guardar se combina con la otra versión
  }) ?? (() => {});
  window.addEventListener('keydown', onKey);
  window.addEventListener('beforeunload', onBeforeUnload);
  document.addEventListener('visibilitychange', onHide);

  // El registro puede traer la huella de publicación de una sesión anterior.
  renderStatus();

  return {
    async beforeLeave() {
      if (status === 'saved') return true;
      if (await save()) return true;
      return confirmDialog({ title: 'Cambios sin guardar', message: 'No se pudieron guardar los últimos cambios. ¿Salir de todos modos?', confirmLabel: 'Salir sin guardar', danger: true });
    },
    unmount() {
      autosave.cancel();
      offExternal();
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('visibilitychange', onHide);
    },
  };
}
