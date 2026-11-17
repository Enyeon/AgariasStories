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
import { linkedData, withoutLink, findLinked, libraryUsage, itemIdOf } from '../content/library.js';
import { normalizeCampaignDetails } from '../domain/campaign.js';
import { campaignApi as defaultApi, hasSupabase } from './api.js';

const LS = 'agarias-dnd:';
const K_LOCAL = `${LS}homebrew:local`;
const K_CAMPAIGNS = `${LS}campaigns`;
const K_CACHE = (id) => `${LS}campaign-cache:${id}`;
const K_CODES = (id) => `${LS}unlock-codes:${id}`;
export const PACK_FORMAT = 'agarias-homebrew-pack';
const ITEM_ID = /^[A-Za-z0-9_-]{4,40}$/;

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

/**
 * Membresía: { id, name, role: 'dm'|'jugador'|'observador', key, joinedAt,
 *   memberId?, status?: 'activo'|'pendiente'|'expulsado', personalKey?, legacy? }
 *
 * `key` es la clave con la que se entra HOY (null mientras el DM no apruebe).
 * `personalKey` es la clave personal mientras la solicitud está pendiente;
 * al aprobarse pasa a `key`. `legacy`: campaña antigua en la que el código de
 * invitación da acceso mientras tanto.
 */
function loadMemberships() {
  const list = read(K_CAMPAIGNS, []);
  return Array.isArray(list) ? list.filter((m) => m?.id && (m?.key || m?.personalKey)) : [];
}

function toPack(remote, membership) {
  return {
    id: remote.id,
    name: remote.name,
    kind: 'campaign',
    campaignId: remote.id,
    role: remote.role ?? membership.role,
    rules: normalizeRules(remote.rules),
    // Ficha de la campaña (sin la migración 20261115 el servidor no la envía: queda vacía).
    details: normalizeCampaignDetails(remote.details),
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
    saveLocalItem({ type, data, contentId, version = null }) {
      // En la biblioteca no hay vínculos: el vínculo lo llevan las copias de campaña.
      const { item, errors } = validateContent(type, withoutLink(data));
      if (!item) return { errors };
      const id = contentId ?? randomId(10);
      const ref = makeRef(local.id, type, id);
      const prev = local.items.find((i) => i.ref === ref);
      // Sin cambios de contenido no sube la versión (no avisa a las campañas por nada).
      if (prev && version == null && JSON.stringify(prev.data) === JSON.stringify(item) && prev.status !== 'retirado') return { errors: [], ref, unchanged: true };
      const entry = { ref, type, version: version ?? (prev?.version ?? 0) + 1, status: 'publicado', data: item };
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
        name,
        exportedAt: new Date().toISOString(),
        // version 2: cada elemento lleva su id y su versión, para que al importar la
        // biblioteca en otro dispositivo se conserven los vínculos con las campañas.
        version: 2,
        items: items.filter((i) => i.status !== 'retirado').map((i) => (isLocal
          ? { id: itemIdOf(i.ref), version: i.version, type: i.type, data: i.data }
          : { type: i.type, data: withoutLink(i.data ?? i.item) })),
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
      let updated = 0;
      let unchanged = 0;
      const rejected = [];
      for (const it of raw.items.slice(0, 500)) {
        if (!CONTENT_TYPE_KEYS.includes(it?.type)) { rejected.push('Tipo desconocido'); continue; }
        // Con id (biblioteca exportada desde la 1.25): el mismo elemento no se duplica;
        // sólo se actualiza si el archivo trae una versión más nueva.
        const id = typeof it.id === 'string' && ITEM_ID.test(it.id) ? it.id : null;
        const prev = id ? local.items.find((x) => x.type === it.type && itemIdOf(x.ref) === id) : null;
        const incoming = Math.max(1, Math.trunc(Number(it.version) || 1));
        if (prev && prev.version >= incoming) { unchanged++; continue; }
        const res = this.saveLocalItem({ type: it.type, data: it.data, contentId: id ?? undefined, version: id ? incoming : undefined });
        if (res.errors.length) rejected.push(`${it.data?.name ?? '?'}: ${res.errors.join(' ')}`);
        else if (prev) updated++;
        else added++;
      }
      return { added, updated, unchanged, rejected };
    },

    // Campañas
    /** Campañas a las que se puede entrar ya (con clave aprobada). */
    memberships: () => memberships.filter((m) => m.key && m.status !== 'expulsado'),
    /** Todas, también las solicitudes pendientes o rechazadas. */
    allMemberships: () => [...memberships],
    membership,
    /** Clave para operar con MIS PJ (la personal, aunque siga pendiente). */
    ownerKey: (id) => { const m = membership(id); return m?.personalKey ?? m?.key ?? null; },

    async create(name) {
      const res = await api.create(name);
      const m = { id: res.id, name: res.name, role: 'dm', key: res.dmKey, inviteCode: res.inviteCode, status: 'activo', joinedAt: new Date().toISOString() };
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

    /**
     * Pide entrar con el código de invitación: el servidor da una clave personal
     * (sólo se guarda en este dispositivo) y el DM aprueba. En campañas antiguas
     * con el código abierto se puede jugar mientras tanto con el código.
     */
    async requestJoin(id, code, name, role = 'jugador') {
      const res = await api.join(id, code, name, role);
      const prev = membership(id);
      const m = {
        id, name: res.name, role: res.role, memberId: res.memberId, status: 'pendiente', personalKey: res.key,
        key: prev?.role === 'dm' ? prev.key : null, joinedAt: new Date().toISOString(), myName: name,
      };
      if (!m.key) {
        try {
          const remote = await api.get(id, code);
          Object.assign(m, { key: code, legacy: true });
          installCampaign(remote, m);
        } catch { /* campaña nueva: hay que esperar al DM */ }
      }
      memberships = [...memberships.filter((x) => x.id !== id), m];
      saveMemberships();
      return m;
    },

    /** ¿Qué es esta clave? (DM, clave personal, o código de invitación). */
    inspectKey: (id, key) => api.me(id, key),

    /** Guarda en este dispositivo una clave personal (p. ej. traída de otro dispositivo). */
    async adoptPersonalKey(id, key, me) {
      const active = me.status === 'activo';
      const m = {
        id, name: me.campaignName ?? id, role: me.role, memberId: me.memberId, status: me.status,
        key: active ? key : null, personalKey: active ? undefined : key, joinedAt: new Date().toISOString(), myName: me.name,
      };
      memberships = [...memberships.filter((x) => x.id !== id), m];
      saveMemberships();
      if (active) await this.refresh(id).catch(() => null);
      return m;
    },

    /** Jugador de una campaña antigua (entró sólo con el código): pide su clave personal. */
    async upgradeLegacy(id, name) {
      const m = membership(id);
      if (!m || m.memberId || m.role === 'dm') return m;
      const res = await api.join(id, m.key, name, 'jugador');
      const next = { ...m, memberId: res.memberId, personalKey: res.key, status: 'pendiente', legacy: true, myName: name };
      memberships = memberships.map((x) => (x.id === id ? next : x));
      saveMemberships();
      return next;
    },

    /** Mira si el DM ya aprobó (o rechazó) la solicitud. Devuelve la membresía actualizada. */
    async checkStatus(id) {
      const m = membership(id);
      if (!m?.personalKey) return m;
      let next;
      try {
        const me = await api.me(id, m.personalKey);
        next = me.status === 'activo'
          ? { ...m, key: m.personalKey, personalKey: undefined, status: 'activo', role: me.role, legacy: false, name: me.campaignName ?? m.name }
          : { ...m, status: me.status, role: me.role };
      } catch (err) {
        if (err?.code !== 'forbidden' && err?.code !== 'not_found') throw err;
        next = { ...m, status: 'expulsado' };
      }
      memberships = memberships.map((x) => (x.id === id ? next : x));
      saveMemberships();
      return next;
    },

    leave(id) {
      memberships = memberships.filter((m) => m.id !== id);
      saveMemberships();
      try { globalThis.localStorage?.removeItem(K_CACHE(id)); } catch { /* nada */ }
      uninstallPack(id);
    },

    async refresh(id) {
      let m = membership(id);
      if (m?.personalKey) m = await this.checkStatus(id);
      if (!m?.key) return null;
      let remote;
      try {
        remote = await api.get(id, m.key);
      } catch (err) {
        // Clave personal revocada (expulsado): se conserva la copia guardada.
        if (err?.code === 'forbidden' && m.memberId && m.role !== 'dm') {
          memberships = memberships.map((x) => (x.id === id ? { ...x, status: 'expulsado' } : x));
          saveMemberships();
          return null;
        }
        throw err;
      }
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

    /** Guarda la ficha de la campaña (sólo el DM). */
    async updateDetails(id, details) {
      const m = membership(id);
      try {
        await api.setDetails(id, m.key, normalizeCampaignDetails(details));
      } catch (err) {
        // Servidor sin la migración: PostgREST no encuentra la función.
        if (err?.code === 'server_not_ready') {
          throw Object.assign(new Error('server_not_ready'), { userMessage: 'El servidor todavía no admite la ficha de la campaña: aplica la migración 20261115000000_campanas.sql en Supabase.' });
        }
        throw err;
      }
      return this.refresh(id);
    },

    async rotateInvite(id) {
      const m = membership(id);
      const res = await api.rotateInvite(id, m.key);
      memberships = memberships.map((x) => (x.id === id ? { ...x, inviteCode: res.inviteCode } : x));
      saveMemberships();
      return res.inviteCode;
    },

    async saveCampaignItem(id, { type, data, contentId = null, status = null }, { refresh = true } = {}) {
      const { item, errors } = validateContent(type, data);
      if (!item) return { errors };
      const m = membership(id);
      const res = await api.upsertContent(id, m.key, { type, data: item, contentId, status });
      if (refresh) await this.refresh(id);
      return { errors: [], ref: makeRef(id, type, res.contentId), status: res.status, version: res.version };
    },

    // ── Biblioteca reutilizable ─────────────────────────────────────────
    // La biblioteca es «Mi Homebrew». Las campañas guardan una copia vinculada
    // (data.linkedFrom) con la versión fijada. Ver content/library.js.

    /** Campañas en las que eres DM, con su contenido (para vincular). */
    dmCampaigns() {
      return memberships.filter((m) => m.role === 'dm' && m.key)
        .map((m) => ({ id: m.id, name: m.name, entries: listEntries(null, { selectable: false, packId: m.id }).filter((e) => e.origin !== 'snapshot') }));
    },

    /** Map<ref de la biblioteca, usos en campañas> (ver libraryUsage). */
    libraryUsage() {
      return libraryUsage(local.items, this.dmCampaigns());
    },

    /**
     * Usa elementos de la biblioteca en una campaña. Si la campaña ya tiene la
     * copia vinculada de un elemento, la actualiza a la última versión (no
     * duplica). Las copias nuevas entran con `status`; las existentes conservan el suyo.
     * Devuelve { created, updated, failed: [{ name, error }] }.
     */
    async useInCampaign(campaignId, libraryRefs, { status = 'publicado' } = {}) {
      const m = membership(campaignId);
      if (m?.role !== 'dm') throw Object.assign(new Error('forbidden'), { code: 'forbidden', userMessage: 'Sólo el DM puede añadir contenido a la campaña.' });
      const out = { created: 0, updated: 0, failed: [] };
      for (const libRef of libraryRefs) {
        const lib = local.items.find((i) => i.ref === libRef);
        if (!lib || lib.status === 'retirado') continue;
        const entries = listEntries(null, { selectable: false, packId: campaignId }).filter((e) => e.origin !== 'snapshot');
        const existing = findLinked(entries, libRef);
        try {
          const res = await this.saveCampaignItem(campaignId, {
            type: lib.type, data: linkedData(lib, local.id), contentId: existing ? itemIdOf(existing.ref) : null, status: existing ? null : status,
          }, { refresh: false });
          if (res.errors?.length) { out.failed.push({ name: lib.data.name, error: res.errors.join(' ') }); continue; }
          // El código de una extensión «con código» lo conoce el DM: se copia a la campaña.
          const code = this.unlockCode(local.id, libRef);
          if (code) this.setUnlockCode(campaignId, res.ref, code);
          if (existing) out.updated++; else out.created++;
        } catch (err) {
          out.failed.push({ name: lib.data.name, error: err?.userMessage ?? err?.message ?? 'Error' });
        }
      }
      await this.refresh(campaignId);
      return out;
    },

    /** Actualiza las copias de un elemento de la biblioteca en todas las campañas que lo usan. */
    async updateEverywhere(libraryRef) {
      const uses = (this.libraryUsage().get(libraryRef) ?? []).filter((u) => u.outdated);
      const results = [];
      for (const u of uses) results.push(await this.useInCampaign(u.campaignId, [libraryRef]).catch((err) => ({ failed: [{ error: err?.userMessage ?? 'Error' }] })));
      return { campaigns: uses.length, failed: results.flatMap((r) => r.failed ?? []) };
    },

    /** Deja la copia de la campaña sin vínculo: ya no recibe avisos de versión nueva. */
    async unlinkCampaignItem(campaignId, ref) {
      const e = listEntries(null, { selectable: false, packId: campaignId }).find((x) => x.ref === ref);
      if (!e?.item.linkedFrom) return null;
      return this.saveCampaignItem(campaignId, { type: e.type, data: withoutLink(e.item), contentId: itemIdOf(ref) });
    },

    /**
     * Guarda en la biblioteca un elemento de una campaña (para reutilizarlo en
     * otras). Si eres el DM, la copia de la campaña queda vinculada a él.
     * Devuelve la referencia en la biblioteca.
     */
    async saveToLibrary(packId, ref) {
      const e = listEntries(null, { selectable: false, packId }).find((x) => x.ref === ref);
      if (!e) return null;
      const known = e.item.linkedFrom && local.items.find((i) => i.type === e.type && itemIdOf(i.ref) === e.item.linkedFrom.id);
      const res = this.saveLocalItem({ type: e.type, data: withoutLink(e.item), contentId: known ? itemIdOf(known.ref) : undefined });
      if (res.errors.length) return { errors: res.errors };
      const code = this.unlockCode(packId, ref);
      if (code) this.setUnlockCode(local.id, res.ref, code);
      if (membership(packId)?.role === 'dm' && !(known && res.unchanged)) {
        const lib = local.items.find((i) => i.ref === res.ref);
        await this.saveCampaignItem(packId, { type: e.type, data: linkedData(lib, local.id), contentId: itemIdOf(ref) });
      }
      return { errors: [], ref: res.ref };
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
