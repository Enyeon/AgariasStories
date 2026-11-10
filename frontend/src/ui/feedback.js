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
 * Estado serializado de todos los campos de un contenedor. Sirve para saber si
 * un formulario cambió desde que se abrió (ver `guard` en openDialog).
 */
export function formSnapshot(root) {
  return JSON.stringify([...root.querySelectorAll('input, select, textarea')].map((el) => (
    el.type === 'checkbox' || el.type === 'radio' ? el.checked : el.value)));
}

/**
 * Protección estándar para diálogos con formulario:
 *   const tracker = trackChanges();
 *   openDialog({ guard: tracker.guard, render(body) { …; tracker.watch(form); } })
 * `watch` toma la foto inicial; `onDiscard` es opcional (p. ej. borrar un borrador).
 */
export function trackChanges({ onDiscard } = {}) {
  let root = null;
  let initial = '';
  let forced = false;
  return {
    watch(el) {
      root = el;
      initial = formSnapshot(el);
      forced = false;
    },
    /** Cuenta como «cambios sin guardar» aunque los campos no se hayan tocado (p. ej. un borrador recuperado). */
    markDirty() {
      forced = true;
    },
    /** Tras un cambio de estructura (p. ej. otro modo del formulario) que no cuenta como edición. */
    reset() {
      if (root) initial = formSnapshot(root);
    },
    guard: {
      isDirty: () => forced || Boolean(root && formSnapshot(root) !== initial),
      onDiscard,
    },
  };
}

/** Pregunta antes de descartar cambios. true = salir sin guardar. */
export function confirmDiscard() {
  return choiceDialog({
    title: '¿Deseas salir?',
    message: 'Has realizado cambios que todavía no has guardado.',
    choices: [
      { label: 'Continuar editando', value: false, variant: 'btn--primary' },
      { label: 'Salir sin guardar', value: true, variant: 'btn--ghost btn--danger-text' },
    ],
  }).then((v) => v === true);
}

/**
 * Abre un diálogo modal. `render(body, close, dialog)` rellena el contenido.
 * Devuelve una promesa que se resuelve con el valor pasado a close().
 *
 * Cierre:
 * - Botón × / [data-dialog-close] / tecla Esc: siempre, salvo `dismissable: false`.
 * - Clic fuera: sólo en diálogos pequeños (sm/md) sin `guard`. En los grandes
 *   o con formularios largos un clic accidental fuera no hace nada.
 * - `guard: { isDirty(): boolean, onDiscard?() }`: si hay cambios, cualquier
 *   intento de cerrar sin guardar pide confirmación («Continuar editando» /
 *   «Salir sin guardar»). close(valor) desde el propio formulario no pregunta.
 */
export function openDialog({ title, size = 'md', render, dismissable = true, className = '', guard = null, closeOnBackdrop }) {
  const backdropCloses = closeOnBackdrop ?? (dismissable && !guard && (size === 'sm' || size === 'md'));
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
    let asking = false;
    // Con cambios sin guardar, el navegador también avisa al recargar o cerrar la pestaña.
    const onBeforeUnload = (e) => {
      try { if (guard?.isDirty?.()) e.preventDefault(); } catch { /* nada */ }
    };
    if (guard) window.addEventListener('beforeunload', onBeforeUnload);
    const close = (value) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('beforeunload', onBeforeUnload);
      dialog.close();
      dialog.remove();
      resolve(value);
    };
    /** Intento de cerrar sin guardar: pregunta si hay cambios. */
    const requestDismiss = async () => {
      if (!dismissable || asking || settled) return;
      let dirty = false;
      try { dirty = Boolean(guard?.isDirty?.()); } catch { dirty = true; }
      if (dirty) {
        asking = true;
        const leave = await confirmDiscard();
        asking = false;
        if (!leave) return;
        guard.onDiscard?.();
      }
      close(undefined);
    };
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      requestDismiss();
    });
    dialog.addEventListener('click', (e) => {
      if (e.target.closest('[data-dialog-close]')) requestDismiss();
      else if (e.target === dialog) {
        if (backdropCloses) {
          close(undefined);
        } else {
          // Pequeña señal visual: el clic fuera no cierra este diálogo.
          dialog.classList.add('is-nudged');
          setTimeout(() => dialog.classList.remove('is-nudged'), 300);
        }
      }
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
