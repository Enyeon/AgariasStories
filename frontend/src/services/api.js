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
  invalid: 'Los datos enviados no son válidos.',
  unauthorized_content: 'Este personaje usa contenido Homebrew que el DM no ha publicado en la campaña.',
  server_not_ready: 'El servidor en línea no está preparado (faltan sus funciones de base de datos). Avisa a quien administra la app.',
  campaigns_unavailable: 'Las campañas necesitan el servidor en línea (Supabase), que no está configurado en esta instalación.',
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

// ── Supabase (funciones RPC de supabase/migrations) ─────────────────────────

const SUPABASE_URL = (import.meta.env?.VITE_SUPABASE_URL ?? '').replace(/\/$/, '');
const SUPABASE_KEY = import.meta.env?.VITE_SUPABASE_ANON_KEY ?? '';

/** ¿Hay un servidor Supabase configurado? (necesario para las campañas) */
export const hasSupabase = () => Boolean(SUPABASE_URL && SUPABASE_KEY);

/**
 * Cliente de las funciones RPC. Las excepciones de PostgreSQL llegan como
 * { code: 'P0001', message: '<código>' }: el mensaje ES el código estable.
 */
export function createRpc({ url = SUPABASE_URL, key = SUPABASE_KEY, fetchImpl = (...a) => fetch(...a) } = {}) {
  return async function rpc(fn, params) {
    if (!url || !key) throw new ApiError('campaigns_unavailable', DEFAULT_MESSAGES.campaigns_unavailable);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let res;
    try {
      res = await fetchImpl(`${url}/rest/v1/rpc/${fn}`, {
        method: 'POST',
        // Las claves «publishable» (sb_publishable_…) van sólo en `apikey`; las
        // «anon» antiguas (JWT) también como Authorization.
        headers: { apikey: key, ...(key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}), 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(params ?? {}),
        signal: controller.signal,
      });
    } catch (err) {
      console.error(`[rpc] ${fn}`, err);
      const code = err?.name === 'AbortError' ? 'timeout' : 'network';
      throw new ApiError(code, DEFAULT_MESSAGES[code], 0, err);
    } finally {
      clearTimeout(timer);
    }
    let payload = null;
    try { payload = await res.json(); } catch { /* sin cuerpo */ }
    if (!res.ok) {
      const raw = String(payload?.message ?? '');
      // PGRST202: la función RPC no existe (migración sin aplicar en Supabase).
      const code = Object.hasOwn(DEFAULT_MESSAGES, raw) ? raw
        : payload?.code === 'PGRST202' || (res.status === 404 && /function/i.test(raw)) ? 'server_not_ready'
        : res.status === 413 ? 'payload_too_large'
          : res.status === 429 ? 'rate_limited'
            : res.status >= 500 ? 'server_error' : 'http_error';
      console.warn(`[rpc] ${fn} → ${res.status}`, payload);
      throw new ApiError(code, DEFAULT_MESSAGES[code] ?? 'No se pudo completar la operación.', res.status);
    }
    return payload;
  };
}

/** Misma interfaz que createApi, pero sobre Supabase. */
export function createSupabaseApi(rpc = createRpc()) {
  return {
    createCharacter: (document) => rpc('share_create', { document }),
    getCharacter: (id) => rpc('share_get', { share_id: id }),
    updateCharacter: (id, document, { token, revision }) => rpc('share_update', { share_id: id, token, document, expected_revision: revision ?? null }),
    deleteCharacter: (id, token) => rpc('share_delete', { share_id: id, token }),
  };
}

/** API de campañas (sólo con Supabase). */
export function createCampaignApi(rpc = createRpc()) {
  return {
    create: (name) => rpc('campaign_create', { name }),
    get: (id, key) => rpc('campaign_get', { campaign_id: id, key }),
    update: (id, dmKey, { name = null, rules = null } = {}) => rpc('campaign_update', { campaign_id: id, dm_key: dmKey, name, rules }),
    rotateInvite: (id, dmKey) => rpc('campaign_rotate_invite', { campaign_id: id, dm_key: dmKey }),
    setDetails: (id, dmKey, details) => rpc('campaign_set_details', { campaign_id: id, dm_key: dmKey, details }),
    upsertContent: (id, key, { type, data, contentId = null, status = null }) => rpc('content_upsert', { campaign_id: id, key, type, data, content_id: contentId, status }),
    setStatus: (id, dmKey, contentId, status) => rpc('content_set_status', { campaign_id: id, dm_key: dmKey, content_id: contentId, status }),
    remove: (id, dmKey, contentId) => rpc('content_delete', { campaign_id: id, dm_key: dmKey, content_id: contentId }),
    // Jugadores, PJ y registro (supabase/migrations/20261118000000_campanas_jugadores.sql).
    join: (id, code, name, role = 'jugador') => rpc('campaign_join', { campaign_id: id, invite_code: code, name, role }),
    me: (id, key) => rpc('campaign_me', { campaign_id: id, key }),
    roster: (id, key) => rpc('campaign_roster', { campaign_id: id, key }),
    memberUpdate: (id, dmKey, memberId, { status = null, role = null } = {}) => rpc('member_update', { campaign_id: id, dm_key: dmKey, member_id: memberId, status, role }),
    setAccess: (id, dmKey, openInvite) => rpc('campaign_set_access', { campaign_id: id, dm_key: dmKey, open_invite: openInvite }),
    pcLink: (id, key, document, summary) => rpc('pc_link', { campaign_id: id, key, document, summary }),
    pcReview: (id, dmKey, pcId, status) => rpc('pc_review', { campaign_id: id, dm_key: dmKey, pc_id: pcId, status }),
    pcGet: (id, key, pcId) => rpc('pc_get', { campaign_id: id, key, pc_id: pcId }),
    pcSave: (id, key, pcId, { document = null, summary = null, revision, events = [], state = null, privacy = null }) =>
      rpc('pc_save', { campaign_id: id, key, pc_id: pcId, document, summary, expected_revision: revision, events, state, privacy }),
    eventAdd: (id, key, { kind, text, data = null, pcId = null, visibility = 'publico', day = null }) =>
      rpc('event_add', { campaign_id: id, key, kind, message: text, data, pc_id: pcId, visibility, day }),
    events: (id, key, { before = null, pcId = null, limit = 50, session = null } = {}) => rpc('events_list', {
      campaign_id: id, key, before_id: before, pc_id: pcId, lim: limit, ...(session != null ? { session } : {}),
    }),
    sessionStart: (id, dmKey, title = '', chapterId = null) => rpc('session_start', { campaign_id: id, dm_key: dmKey, title, ...(chapterId != null ? { chapter_id: chapterId } : {}) }),
    // Mundo, capítulos e intercambio (20261119000000_mundo_sesiones.sql).
    worldList: (id, key) => rpc('world_list', { campaign_id: id, key }),
    worldUpsert: (id, key, { entryId = null, kind, title, data = {}, secret = {}, reveal = null, revealedTo = null }) =>
      rpc('world_upsert', { campaign_id: id, key, entry_id: entryId, kind, title, data, secret, reveal, revealed_to: revealedTo }),
    worldDelete: (id, key, entryId) => rpc('world_delete', { campaign_id: id, key, entry_id: entryId }),
    sessionsList: (id, key) => rpc('sessions_list', { campaign_id: id, key }),
    chapterUpsert: (id, dmKey, { chapterId = null, title, summary = '' }) => rpc('chapter_upsert', { campaign_id: id, dm_key: dmKey, chapter_id: chapterId, title, summary }),
    sessionUpdate: (id, dmKey, sessionId, { title = '', summary = '', dmNotes = '', chapterId = null }) =>
      rpc('session_update', { campaign_id: id, dm_key: dmKey, session_id: sessionId, title, summary, dm_notes: dmNotes, chapter_id: chapterId }),
    pcTransfer: (id, key, { fromPc, toPc, revision, itemIndex = null, itemName = null, qty = 1, coins = null }) =>
      rpc('pc_transfer', { campaign_id: id, key, from_pc: fromPc, to_pc: toPc, expected_revision: revision, item_index: itemIndex, item_name: itemName, qty, coins }),
    sessionEnd: (id, dmKey) => rpc('session_end', { campaign_id: id, dm_key: dmKey }),
  };
}

/** Mercado de la Tienda por campaña (sólo con Supabase). Ver supabase/migrations/20261112000000_tienda.sql. */
export function createShopMarketApi(rpc = createRpc()) {
  return {
    get: (campaignId, key) => rpc('shop_market_get', { campaign_id: campaignId, key }),
    save: (campaignId, key, world, expectedRevision) => rpc('shop_market_save', { campaign_id: campaignId, key, world, expected_revision: expectedRevision }),
  };
}

/** Con Supabase configurado se usa para compartir; si no, el backend propio (/api). */
export const api = hasSupabase() ? createSupabaseApi() : createApi();
export const campaignApi = createCampaignApi();
export const shopMarketApi = createShopMarketApi();

/** URL pública de un personaje compartido. */
export function shareUrl(cloudId) {
  return `${window.location.origin}/personaje/${encodeURIComponent(cloudId)}`;
}
