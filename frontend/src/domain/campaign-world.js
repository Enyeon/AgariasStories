// Mundo narrativo de la campaña: lugares, PNJ, facciones, misiones, pistas y
// notas, con lo que cada jugador ha descubierto (ver
// supabase/migrations/20261119000000_mundo_sesiones.sql).
//
// Distinto del «Mundo de la Tienda» (regiones/facciones económicas del
// Homebrew): esto es lo que el DM cuenta y los jugadores van descubriendo.

export const WORLD_KINDS = Object.freeze({
  mision: { label: 'Misión', plural: 'Misiones', icon: '📜' },
  lugar: { label: 'Lugar', plural: 'Lugares', icon: '🗺️' },
  pnj: { label: 'PNJ', plural: 'PNJ', icon: '🧑' },
  faccion: { label: 'Facción', plural: 'Facciones', icon: '🏳️' },
  pista: { label: 'Pista', plural: 'Pistas', icon: '🔎' },
  nota: { label: 'Nota', plural: 'Notas', icon: '📝' },
});

export const QUEST_STATUS = Object.freeze({
  activa: { label: 'Activa', badge: 'badge--accent' },
  'en-pausa': { label: 'En pausa', badge: '' },
  completada: { label: 'Completada', badge: 'badge--success' },
  fallida: { label: 'Fallida', badge: 'badge--danger' },
});

export const ATTITUDES = Object.freeze({
  desconocido: { label: 'Actitud desconocida', icon: '❔' },
  amistoso: { label: 'Amistoso', icon: '🙂' },
  neutral: { label: 'Neutral', icon: '😐' },
  hostil: { label: 'Hostil', icon: '😠' },
});

export const REVEAL = Object.freeze({
  oculto: { label: 'Oculto: sólo el DM', short: 'Oculto', icon: '🙈' },
  todos: { label: 'Descubierto por toda la campaña', short: 'Descubierto', icon: '👁' },
  algunos: { label: 'Descubierto por algunos', short: 'Algunos', icon: '👤' },
  autor: { label: 'Privada: sólo tú (ni el DM)', short: 'Privada', icon: '🔒' },
});

const str = (v, max) => (typeof v === 'string' ? v.replace(/\r\n/g, '\n').trim().slice(0, max) : '');
const ID = /^[a-z0-9]{6,24}$/;

/** Datos públicos de una entrada, según su tipo. */
export function normalizeWorldData(kind, raw = {}) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const out = { summary: str(r.summary, 600), details: str(r.details, 8000) };
  const tags = Array.isArray(r.tags) ? [...new Set(r.tags.map((t) => str(t, 30)).filter(Boolean))].slice(0, 10) : [];
  if (tags.length) out.tags = tags;
  if (ID.test(r.placeId ?? '')) out.placeId = r.placeId;
  if (kind === 'pnj') {
    out.role = str(r.role, 80);
    out.attitude = ATTITUDES[r.attitude] ? r.attitude : 'desconocido';
    if (ID.test(r.factionId ?? '')) out.factionId = r.factionId;
  }
  if (kind === 'mision') {
    const q = r.quest && typeof r.quest === 'object' ? r.quest : {};
    out.quest = {
      status: QUEST_STATUS[q.status] ? q.status : 'activa',
      objectives: (Array.isArray(q.objectives) ? q.objectives : [])
        .map((o) => ({ text: str(o?.text, 200), done: o?.done === true })).filter((o) => o.text).slice(0, 30),
      reward: str(q.reward, 300),
    };
    if (ID.test(r.giverId ?? '')) out.giverId = r.giverId;
  }
  return out;
}

/** Notas secretas del DM. */
export function normalizeSecret(raw = {}) {
  return { text: str(raw?.text, 8000) };
}

/** Objetivos cumplidos / total de una misión. */
export function questProgress(entry) {
  const list = entry?.data?.quest?.objectives ?? [];
  return { done: list.filter((o) => o.done).length, total: list.length };
}

/** Orden de lectura: misiones activas primero, luego por tipo y nombre. */
export function sortWorld(entries) {
  const kindOrder = Object.keys(WORLD_KINDS);
  const questRank = (e) => (e.kind !== 'mision' ? 0 : ({ activa: 0, 'en-pausa': 1, completada: 2, fallida: 3 })[e.data?.quest?.status] ?? 0);
  return [...entries].sort((a, b) => kindOrder.indexOf(a.kind) - kindOrder.indexOf(b.kind)
    || questRank(a) - questRank(b) || a.title.localeCompare(b.title, 'es'));
}

/** Busca por título, resumen, detalles y etiquetas (sin acentos). */
export function matchesQuery(entry, query) {
  const fold = (s) => String(s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  const q = fold(query).trim();
  if (!q) return true;
  const hay = fold([entry.title, entry.data?.summary, entry.data?.details, ...(entry.data?.tags ?? []), entry.data?.role].join(' '));
  return q.split(/\s+/).every((w) => hay.includes(w));
}

/** Entradas relacionadas: lo que está en un lugar, miembros de una facción, misiones de un PNJ. */
export function relatedTo(entry, entries) {
  return entries.filter((e) => e.entryId !== entry.entryId && (
    e.data?.placeId === entry.entryId || e.data?.factionId === entry.entryId || e.data?.giverId === entry.entryId
    || entry.data?.placeId === e.entryId || entry.data?.factionId === e.entryId || entry.data?.giverId === e.entryId));
}
