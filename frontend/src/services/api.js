// Cliente de la API de personajes compartidos.
// Convierte cualquier fallo (red, timeout, HTTP) en ApiError con un mensaje
// pensado para el usuario; el detalle técnico queda en la consola.

const BASE = (import.meta.env?.VITE_API_BASE_URL ?? '').replace(/\/$/, '');
const TIMEOUT_MS = 15_000;

export class ApiError extends Error {
  constructor(code, userMessage, status = 0, cause) {
    super(`${code}: ${userMessage}`);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.userMessage = userMessage;
    this.cause = cause;
  }
}

const DEFAULT_MESSAGES = {
  network: 'No hay conexión con el servidor. Tus cambios siguen guardados en este dispositivo.',
  timeout: 'El servidor tardó demasiado en responder. Inténtalo de nuevo.',
  not_found: 'No existe ningún personaje con ese enlace (o fue eliminado).',
  forbidden: 'No tienes permiso para modificar este personaje.',
  conflict: 'La copia en línea cambió desde otro dispositivo.',
  payload_too_large: 'El personaje es demasiado grande. Prueba con una imagen más pequeña.',
  rate_limited: 'Demasiadas operaciones seguidas. Espera unos minutos.',
  server_error: 'El servidor tuvo un problema. Inténtalo más tarde.',
};

async function request(method, path, { body, token, fetchImpl = fetch } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetchImpl(`${BASE}${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    console.error(`[api] ${method} ${path}`, err);
    const code = err?.name === 'AbortError' ? 'timeout' : 'network';
    throw new ApiError(code, DEFAULT_MESSAGES[code], 0, err);
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 204) return null;
  let payload = null;
  try { payload = await res.json(); } catch { /* respuesta sin JSON */ }

  if (!res.ok) {
    const code = payload?.error?.code ?? (res.status >= 500 ? 'server_error' : 'http_error');
    const message = payload?.error?.message ?? DEFAULT_MESSAGES[code] ?? 'No se pudo completar la operación.';
    console.warn(`[api] ${method} ${path} → ${res.status}`, payload);
    throw new ApiError(code, message, res.status);
  }
  if (!payload) throw new ApiError('server_error', DEFAULT_MESSAGES.server_error, res.status);
  return payload;
}

export function createApi(fetchImpl) {
  const opts = (o = {}) => (fetchImpl ? { ...o, fetchImpl } : o);
  return {
    createCharacter: (document) => request('POST', '/api/characters', opts({ body: { document } })),
    getCharacter: (id) => request('GET', `/api/characters/${encodeURIComponent(id)}`, opts()),
    updateCharacter: (id, document, { token, revision }) =>
      request('PUT', `/api/characters/${encodeURIComponent(id)}`, opts({ body: { document, revision }, token })),
    deleteCharacter: (id, token) => request('DELETE', `/api/characters/${encodeURIComponent(id)}`, opts({ token })),
  };
}

export const api = createApi();

/** URL pública de un personaje compartido. */
export function shareUrl(cloudId) {
  return `${window.location.origin}/personaje/${encodeURIComponent(cloudId)}`;
}
