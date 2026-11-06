// Notificaciones (toasts) y diálogos accesibles basados en <dialog>.
// Ningún mensaje técnico llega al usuario: userMessageFor() traduce errores.

import { html, setHtml, escapeHtml } from './dom.js';

let region;

function ensureRegion() {
  if (region) return region;
  region = document.createElement('div');
  region.className = 'toast-region';
  region.setAttribute('role', 'status');
  region.setAttribute('aria-live', 'polite');
  document.body.append(region);
  return region;
}

/**
 * @param {string} message
 * @param {{ type?: 'info'|'success'|'error'|'warning', duration?: number }} [opts]
 */
export function toast(message, { type = 'info', duration } = {}) {
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  if (type === 'error') el.setAttribute('role', 'alert');
  setHtml(el, html`<span class="toast__text">${message}</span><button type="button" class="toast__close" aria-label="Cerrar aviso">×</button>`);
  const remove = () => {
    el.classList.add('is-leaving');
    setTimeout(() => el.remove(), 200);
  };
  el.querySelector('.toast__close').addEventListener('click', remove);
  ensureRegion().append(el);
  setTimeout(remove, duration ?? (type === 'error' ? 8000 : 4000));
}

/** Mensaje apto para el usuario a partir de cualquier error. */
export function userMessageFor(err, fallback = 'Ocurrió un error inesperado.') {
  if (err?.userMessage) return err.userMessage;
  console.error(err);
  return fallback;
}

export function reportError(err, fallback) {
  toast(userMessageFor(err, fallback), { type: 'error' });
}

// ── Diálogos ─────────────────────────────────────────────────────────────

/**
 * Abre un diálogo modal. `render(body, close)` rellena el contenido.
 * Devuelve una promesa que se resuelve con el valor pasado a close().
 */
export function openDialog({ title, size = 'md', render, dismissable = true, className = '' }) {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = `dialog dialog--${size} ${className}`;
    const titleId = `dlg-title-${Math.random().toString(36).slice(2, 8)}`;
    dialog.setAttribute('aria-labelledby', titleId);
    setHtml(dialog, html`
      <div class="dialog__frame">
        <header class="dialog__header">
          <h2 class="dialog__title" id="${titleId}">${title}</h2>
          ${dismissable ? html`<button type="button" class="icon-btn dialog__close" data-dialog-close aria-label="Cerrar">×</button>` : ''}
        </header>
        <div class="dialog__body"></div>
      </div>`);
    document.body.append(dialog);
    let settled = false;
    const close = (value) => {
      if (settled) return;
      settled = true;
      dialog.close();
      dialog.remove();
      resolve(value);
    };
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      if (dismissable) close(undefined);
    });
    dialog.addEventListener('click', (e) => {
      if (e.target.closest('[data-dialog-close]')) close(undefined);
      else if (dismissable && e.target === dialog) close(undefined);
    });
    render(dialog.querySelector('.dialog__body'), close, dialog);
    dialog.showModal();
    const autofocus = dialog.querySelector('[autofocus]') ?? dialog.querySelector('.dialog__body button, .dialog__body input, .dialog__body select');
    autofocus?.focus();
  });
}

export function confirmDialog({ title, message, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', danger = false }) {
  return openDialog({
    title,
    size: 'sm',
    render(body, close) {
      setHtml(body, html`
        <p class="dialog__message">${message}</p>
        <div class="dialog__actions">
          <button type="button" class="btn btn--ghost" data-act="cancel">${cancelLabel}</button>
          <button type="button" class="btn ${danger ? 'btn--danger' : 'btn--primary'}" data-act="ok" autofocus>${confirmLabel}</button>
        </div>`);
      body.addEventListener('click', (e) => {
        const act = e.target.closest('[data-act]')?.dataset.act;
        if (act) close(act === 'ok');
      });
    },
  }).then((v) => v === true);
}

/** Diálogo con varias opciones; devuelve el `value` elegido o undefined. */
export function choiceDialog({ title, message, choices }) {
  return openDialog({
    title,
    size: 'sm',
    render(body, close) {
      setHtml(body, html`
        <p class="dialog__message">${message}</p>
        <div class="dialog__actions dialog__actions--stack">
          ${choices.map((c, i) => html`<button type="button" class="btn ${c.variant ?? 'btn--ghost'}" data-i="${i}">${c.label}</button>`)}
        </div>`);
      body.addEventListener('click', (e) => {
        const i = e.target.closest('[data-i]')?.dataset.i;
        if (i !== undefined) close(choices[Number(i)].value);
      });
    },
  });
}

export function warningsMessage(warnings) {
  return warnings.slice(0, 6).map((w) => `• ${escapeHtml(w)}`).join('<br>') + (warnings.length > 6 ? `<br>… y ${warnings.length - 6} más.` : '');
}
