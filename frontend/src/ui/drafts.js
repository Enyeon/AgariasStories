// Borradores de formularios largos (crear clase, raza, hechizo…).
//
// Se guardan en localStorage mientras se edita. Si el diálogo se cierra por
// accidente (recarga, cierre de pestaña, fallo), al volver a abrir el mismo
// formulario se ofrece recuperarlo. Se borran al guardar o al descartar a
// propósito. Caducan a los 14 días.

const PREFIX = 'agarias-dnd:draft:';
const MAX_AGE_MS = 14 * 24 * 3600 * 1000;

export function saveDraft(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify({ savedAt: Date.now(), value }));
  } catch {
    // Sin espacio o sin localStorage: el borrador es una ayuda, no algo crítico.
  }
}

export function loadDraft(key) {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFIX + key) ?? 'null');
    if (!raw || typeof raw.savedAt !== 'number' || Date.now() - raw.savedAt > MAX_AGE_MS) {
      clearDraft(key);
      return null;
    }
    return raw;
  } catch {
    return null;
  }
}

export function clearDraft(key) {
  try { localStorage.removeItem(PREFIX + key); } catch { /* nada */ }
}

/** Devuelve una función que guarda como mucho una vez cada `ms`. */
export function debounced(fn, ms = 600) {
  let t = null;
  const run = (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
  run.flush = (...args) => { clearTimeout(t); fn(...args); };
  run.cancel = () => clearTimeout(t);
  return run;
}
