// Homebrew local y campañas: persistencia en el dispositivo + sincronización.
//
// - Homebrew local: un paquete propio de este dispositivo (sin servidor). Se
//   puede exportar como archivo y otro usuario lo importa. Sin servidor no hay
//   permisos reales: cualquiera puede editar su copia.
// - Campañas: la fuente de la verdad está en Supabase. Aquí se guardan las
//   membresías (id, rol y clave) y una copia de la última versión descargada
//   para poder abrir las fichas sin conexión.

import { installPack, uninstallPack, listEntries } from '../content/registry.js';
import { makeRef, parseRef, randomId, validateContent, CONTENT_TYPE_KEYS } from '../content/schema.js';
import { normalizeRules } from '../content/rules.js';
import { campaignApi as defaultApi, hasSupabase } from './api.js';

const LS = 'agarias-dnd:';
const K_LOCAL = `${LS}homebrew:local`;
const K_CAMPAIGNS = `${LS}campaigns`;
const K_CACHE = (id) => `${LS}campaign-cache:${id}`;
const K_CODES = (id) => `${LS}unlock-codes:${id}`;
export const PACK_FORMAT = 'agarias-homebrew-pack';

function read(key, fallback) {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(value));
  } catch (err) {
    const e = new Error('No queda espacio en este dispositivo para guardar el Homebrew.');
    e.userMessage = e.message;
    e.cause = err;
    throw e;
  }
}

// ── Homebrew local ──────────────────────────────────────────────────────

function loadLocal() {
  const pack = read(K_LOCAL, null);
  if (pack?.id && Array.isArray(pack.items)) return pack;
  // El id se guarda ya: los enlaces (/homebrew/<id>) y los borradores dependen de él.
  const fresh = { id: `local-${randomId(8)}`, name: 'Mi Homebrew', items: [] };
  try { write(K_LOCAL, fresh); } catch { /* sin almacenamiento: id de esta sesión */ }
  return fresh;
}

function installLocal(pack) {
  installPack({ id: pack.id, name: pack.name, kind: 'local', items: pack.items });
}

// ── Campañas ────────────────────────────────────────────────────────────

/** Membresía: { id, name, role: 'dm'|'jugador', key, joinedAt } */
function loadMemberships() {
  const list = read(K_CAMPAIGNS, []);
  return Array.isArray(list) ? list.filter((m) => m?.id && m?.key) : [];
}

function toPack(remote, membership) {
  return {
    id: remote.id,
    name: remote.name,
    kind: 'campaign',
    campaignId: remote.id,
    role: remote.role ?? membership.role,
    rules: normalizeRules(remote.rules),
    items: (remote.items ?? []).map((i) => ({
      ref: makeRef(remote.id, i.type, i.contentId),
      type: i.type, version: i.version, status: i.status, data: i.data, author: i.author,
    })),
  };
}

export function createHomebrewService({ api = defaultApi } = {}) {
  let local = loadLocal();
  let memberships = loadMemberships();

  const saveMemberships = () => write(K_CAMPAIGNS, memberships);
  const membership = (id) => memberships.find((m) => m.id === id) ?? null;

  function installCampaign(remote, m) {
    const pack = toPack(remote, m);
    write(K_CACHE(remote.id), { ...remote, fetchedAt: new Date().toISOString() });
    installPack(pack);
    return pack;
  }

  return {
    available: hasSupabase,

    /** Instala lo guardado en el dispositivo (sin red). */
    init() {
      installLocal(local);
      for (const m of memberships) {
        const cached = read(K_CACHE(m.id), null);
        if (cached) installPack(toPack(cached, m));
      }
    },

    /** Descarga la última versión de todas las campañas (en segundo plano). */
    async refreshAll() {
      const results = await Promise.allSettled(memberships.map((m) => this.refresh(m.id)));
      return results.filter((r) => r.status === 'rejected').map((r) => r.reason);
    },

    // Códigos de desbloqueo de extensiones: sólo los conoce quien los generó
    // (el DM o el dueño del Homebrew local). El servidor guarda únicamente su hash.
    unlockCode: (packId, ref) => read(K_CODES(packId), {})[ref] ?? null,
    setUnlockCode(packId, ref, code) {
      const all = read(K_CODES(packId), {});
      all[ref] = code;
      write(K_CODES(packId), all);
    },

    // Local
    localPack: () => local,
    saveLocalItem({ type, data, contentId }) {
      const { item, errors } = validateContent(type, data);
      if (!item) return { errors };
      const id = contentId ?? randomId(10);
      const ref = makeRef(local.id, type, id);
      const prev = local.items.find((i) => i.ref === ref);
      const entry = { ref, type, version: (prev?.version ?? 0) + 1, status: 'publicado', data: item };
      local = { ...local, items: [...local.items.filter((i) => i.ref !== ref), entry] };
      write(K_LOCAL, local);
      installLocal(local);
      return { errors: [], ref };
    },
    /** En local no hay personajes de otros que proteger, pero se retira igual. */
    removeLocalItem(ref) {
      local = { ...local, items: local.items.map((i) => (i.ref === ref ? { ...i, status: 'retirado' } : i)) };
      write(K_LOCAL, local);
      installLocal(local);
    },
    restoreLocalItem(ref) {
      local = { ...local, items: local.items.map((i) => (i.ref === ref ? { ...i, status: 'publicado' } : i)) };
      write(K_LOCAL, local);
      installLocal(local);
    },

    /** Paquete exportable (archivo .json) con el Homebrew local o de una campaña. */
    exportPack(packId) {
      const isLocal = packId === local.id;
      const items = isLocal ? local.items : listEntries(null, { selectable: false, packId });
      const name = isLocal ? local.name : membership(packId)?.name ?? 'Campaña';
      return {
        format: PACK_FORMAT,
        version: 1,
        name,
        exportedAt: new Date().toISOString(),
        items: items.filter((i) => i.status !== 'retirado').map((i) => ({ type: i.type, data: i.data ?? i.item })),
      };
    },

    /** Importa un archivo de paquete al Homebrew local. Devuelve { added, rejected }. */
    importPack(raw) {
      if (raw?.format !== PACK_FORMAT || !Array.isArray(raw.items)) {
        const e = new Error('El archivo no es un paquete de Homebrew de Agarias.');
        e.userMessage = e.message;
        throw e;
      }
      let added = 0;
      const rejected = [];
      for (const it of raw.items.slice(0, 500)) {
        if (!CONTENT_TYPE_KEYS.includes(it?.type)) { rejected.push('Tipo desconocido'); continue; }
        const res = this.saveLocalItem({ type: it.type, data: it.data });
        if (res.errors.length) rejected.push(`${it.data?.name ?? '?'}: ${res.errors.join(' ')}`);
        else added++;
      }
      return { added, rejected };
    },

    // Campañas
    memberships: () => [...memberships],
    membership,

    async create(name) {
      const res = await api.create(name);
      const m = { id: res.id, name: res.name, role: 'dm', key: res.dmKey, inviteCode: res.inviteCode, joinedAt: new Date().toISOString() };
      memberships = [...memberships.filter((x) => x.id !== m.id), m];
      saveMemberships();
      await this.refresh(m.id);
      return m;
    },

    /** Unirse con un código: { id, code }. El rol lo decide el servidor. */
    async join(id, code) {
      const remote = await api.get(id, code);
      const m = { id, name: remote.name, role: remote.role, key: code, joinedAt: new Date().toISOString() };
      memberships = [...memberships.filter((x) => x.id !== id), m];
      saveMemberships();
      installCampaign(remote, m);
      return m;
    },

    leave(id) {
      memberships = memberships.filter((m) => m.id !== id);
      saveMemberships();
      try { globalThis.localStorage?.removeItem(K_CACHE(id)); } catch { /* nada */ }
      uninstallPack(id);
    },

    async refresh(id) {
      const m = membership(id);
      if (!m) return null;
      const remote = await api.get(id, m.key);
      if (remote.name !== m.name || remote.role !== m.role) {
        memberships = memberships.map((x) => (x.id === id ? { ...x, name: remote.name, role: remote.role } : x));
        saveMemberships();
      }
      return installCampaign(remote, m);
    },

    async updateCampaign(id, { name, rules }) {
      const m = membership(id);
      await api.update(id, m.key, { name, rules });
      return this.refresh(id);
    },

    async rotateInvite(id) {
      const m = membership(id);
      const res = await api.rotateInvite(id, m.key);
      memberships = memberships.map((x) => (x.id === id ? { ...x, inviteCode: res.inviteCode } : x));
      saveMemberships();
      return res.inviteCode;
    },

    async saveCampaignItem(id, { type, data, contentId = null, status = null }) {
      const { item, errors } = validateContent(type, data);
      if (!item) return { errors };
      const m = membership(id);
      const res = await api.upsertContent(id, m.key, { type, data: item, contentId, status });
      await this.refresh(id);
      return { errors: [], ref: makeRef(id, type, res.contentId), status: res.status };
    },

    async setCampaignStatus(id, ref, status) {
      const m = membership(id);
      await api.setStatus(id, m.key, parseRef(ref).id, status);
      return this.refresh(id);
    },

    async removeCampaignItem(id, ref) {
      const m = membership(id);
      const res = await api.remove(id, m.key, parseRef(ref).id);
      await this.refresh(id);
      return res;
    },
  };
}

/** Enlace de invitación. El código va en el fragmento (#): no llega a ningún servidor. */
export function inviteUrl(id, code) {
  return `${window.location.origin}/unirse#${encodeURIComponent(id)}.${encodeURIComponent(code)}`;
}

export function parseInvite(hash) {
  const raw = String(hash ?? '').replace(/^#/, '');
  const dot = raw.indexOf('.');
  if (dot <= 0) return null;
  const id = decodeURIComponent(raw.slice(0, dot));
  const code = decodeURIComponent(raw.slice(dot + 1));
  return /^[a-z0-9]{4,40}$/.test(id) && /^[A-Za-z0-9_-]{16,80}$/.test(code) ? { id, code } : null;
}

export const homebrew = createHomebrewService();
