// Casos de uso de personajes: une almacenamiento local, servidor y formato.
// La UI sólo habla con este módulo; no conoce IndexedDB ni la API.

import { createCharacter, createDocument as createBareDocument } from '../domain/schema.js';
import { syncSnapshots } from '../content/snapshots.js';
import { raceName, getClass } from '../data/index.js';

/** Documento listo para guardar/exportar/compartir: con instantáneas de Homebrew. */
export const createDocument = (character) => createBareDocument(syncSnapshots(character));
import { parseDocument } from '../domain/validation.js';
import { classLevels } from '../domain/rules.js';

import { createLocalStore, newId } from './local-store.js';
import { api as defaultApi, ApiError } from './api.js';
import { mergeCharacters } from '../domain/merge.js';
import { diffEvents, pcSummary } from '../domain/campaign-play.js';

/** Id local de la copia de un PJ en una campaña (también es su ruta /editar/<id>). */
export const campaignCopyId = (campaignId, pcId) => `cp_${campaignId}_${pcId}`;
export const isCampaignCopy = (record) => Boolean(record?.pc?.pcId);

// Errores de red: la copia queda guardada aquí y se sube en el próximo guardado.
const TRANSIENT = new Set(['network', 'timeout', 'server_error', 'rate_limited']);

/** Huella del documento para saber si la copia en línea está al día. */
export function fingerprint(character) {
  const s = JSON.stringify(createDocument(character));
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16);
}

export function summarize(character) {
  const levels = classLevels(character);
  return {
    name: character.identity.name.trim(),
    race: raceName(character.race.key),
    level: character.levels.length,
    classes: Object.entries(levels).map(([k, n]) => `${getClass(k)?.nombre ?? k} ${n}`).join(' / '),
    portrait: character.identity.portrait,
  };
}

/**
 * Aviso entre pestañas: cuando una pestaña guarda un personaje (p. ej. la Tienda
 * cobra una compra, o la ficha suma monedas que regaló el DM), las demás pestañas
 * abiertas con ese personaje lo recargan. Sin BroadcastChannel no hace nada: la
 * Tienda y la ficha también comprueban al volver a la pestaña.
 */
export function createChangeChannel(name = 'agarias:characters') {
  const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel(name) : null;
  const listeners = new Set();
  channel?.addEventListener('message', (e) => {
    const msg = e.data;
    if (msg && typeof msg.id === 'string') for (const fn of listeners) fn(msg);
  });
  return {
    notify(record, kind = 'saved') {
      try { channel?.postMessage({ id: record.id, updatedAt: record.updatedAt ?? null, kind }); } catch { /* pestaña cerrándose */ }
    },
    /** fn({ id, updatedAt, kind }) para cambios hechos en OTRAS pestañas. */
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

/**
 * @param pcRemote  Acceso a las copias de los PJ en las campañas (ver
 *   services/campaign-play.js): { get(campaignId, pcId), save(campaignId, pcId, { document, summary, revision, events }) }.
 */
export function createCharacterService({ store = createLocalStore(), api = defaultApi, changes = createChangeChannel(), pcRemote = null } = {}) {
  const now = () => new Date().toISOString();

  function buildRecord(character, base = {}) {
    const timestamp = now();
    return {
      id: base.id ?? newId(),
      createdAt: base.createdAt ?? timestamp,
      updatedAt: timestamp,
      cloud: base.cloud ?? null,
      document: createDocument(character),
      summary: summarize(character),
      ...(base.pc ? { pc: base.pc } : {}),
    };
  }

  /** Abre un registro local, migrando/normalizando su documento. */
  async function open(id) {
    const record = await store.get(id);
    if (!record) return null;
    const { character, warnings } = parseDocument(record.document);
    return { record, character, warnings };
  }

  /**
   * Sube la copia de campaña. Si el DM (u otro dispositivo) la cambió entretanto,
   * combina ambas versiones (como entre pestañas) y vuelve a intentarlo.
   * Devuelve { pc, character, merged, fatal }.
   */
  async function pushCopy(pc, character, explicit = []) {
    const skip = explicit.length ? ['dinero', 'objeto'] : [];
    let base = pc.base;
    let revision = pc.revision;
    let current = character;
    let merged = false;
    const pending = [...(pc.pendingEvents ?? []), ...explicit];
    for (let attempt = 0; attempt < 3; attempt++) {
      const events = [...pending, ...diffEvents(base, current, { skip })].slice(0, 25);
      try {
        const res = await pcRemote.save(pc.campaignId, pc.pcId, {
          document: createDocument(current), summary: pcSummary(current), revision, events,
        });
        return { pc: { ...pc, revision: res.revision, base: structuredClone(current), dirty: false, pendingEvents: [], error: null, syncedAt: res.updatedAt ?? new Date().toISOString() }, character: current, merged };
      } catch (err) {
        const code = err instanceof ApiError ? err.code : 'network';
        if (code === 'conflict' && attempt < 2) {
          const remote = await pcRemote.get(pc.campaignId, pc.pcId);
          const theirs = parseDocument(remote.document).character;
          current = mergeCharacters(base ?? theirs, current, theirs);
          base = theirs;
          revision = remote.revision;
          merged = true;
          continue;
        }
        const keep = { ...pc, base, revision, dirty: true, pendingEvents: pending.slice(-25) };
        if (TRANSIENT.has(code)) return { pc: { ...keep, error: null }, character: current, merged };
        return { pc: { ...keep, error: code }, character: current, merged, fatal: err };
      }
    }
    return { pc: { ...pc, dirty: true }, character: current, merged };
  }

  /**
   * Guarda en este dispositivo. Si es la copia de un PJ de campaña, también la
   * sube a la campaña con los acontecimientos del registro (`events`: los que
   * anota quien hizo el cambio, p. ej. la Tienda; el resto se deduce solo).
   * Si hubo que combinar con cambios del DM, el registro devuelto lleva
   * `remoteMerged: true` y su documento es el combinado.
   */
  async function save(record, character, { events = [] } = {}) {
    if (!isCampaignCopy(record) || !pcRemote) {
      const next = buildRecord(character, record);
      await store.put(next);
      changes.notify(next);
      return next;
    }
    const pushed = await pushCopy(record.pc, character, events);
    const next = { ...buildRecord(pushed.character, record), pc: pushed.pc };
    await store.put(next);
    changes.notify(next);
    if (pushed.fatal) {
      const msg = pushed.pc.error === 'forbidden'
        ? 'Este PJ ya no está vinculado a la campaña (o el DM te retiró el acceso). Los cambios quedan sólo en este dispositivo.'
        : pushed.pc.error === 'not_found' ? 'Este PJ ya no existe en la campaña. Los cambios quedan sólo en este dispositivo.'
          : (pushed.fatal.userMessage ?? 'No se pudo guardar el PJ en la campaña.');
      throw Object.assign(new Error(msg), { userMessage: msg, code: pushed.pc.error, record: next });
    }
    return pushed.merged ? Object.assign(next, { remoteMerged: true }) : next;
  }

  /**
   * Trae la última versión de la campaña (p. ej. el DM le dio oro). Si aquí hay
   * cambios sin subir, se combinan y se suben. Devuelve el registro (o null si
   * no es una copia de campaña) con `changed` = true si cambió algo.
   */
  async function refreshCopy(id) {
    const record = await store.get(id);
    if (!isCampaignCopy(record) || !pcRemote) return null;
    if (record.pc.dirty) {
      const { character } = parseDocument(record.document);
      const next = await save(record, character).catch((err) => err.record ?? record);
      return Object.assign(next, { changed: next.updatedAt !== record.updatedAt });
    }
    const remote = await pcRemote.get(record.pc.campaignId, record.pc.pcId);
    const meta = { status: remote.status, state: remote.state, privacy: remote.privacy };
    if (remote.revision === record.pc.revision || !remote.document) {
      const same = Object.entries(meta).every(([k, v]) => record.pc[k] === v);
      if (same) return Object.assign(record, { changed: false });
      const next = { ...record, pc: { ...record.pc, ...meta } };
      await store.put(next);
      return Object.assign(next, { changed: false });
    }
    const { character } = parseDocument(remote.document);
    const next = { ...buildRecord(character, record), pc: { ...record.pc, ...meta, revision: remote.revision, base: structuredClone(character), syncedAt: remote.updatedAt } };
    await store.put(next);
    changes.notify(next);
    return Object.assign(next, { changed: true });
  }

  /** Guarda en este dispositivo la copia de un PJ de campaña (al vincularlo o al abrirlo en otro dispositivo). */
  async function adoptCampaignCopy({ campaignId, campaignName, pcId, revision, status = 'pendiente', state = 'vivo', privacy = 'resumen', updatedAt = null }, character) {
    const id = campaignCopyId(campaignId, pcId);
    const prev = await store.get(id);
    const next = {
      ...buildRecord(character, prev ?? { id }),
      pc: { campaignId, campaignName, pcId, revision, status, state, privacy, base: structuredClone(character), dirty: false, pendingEvents: [], error: null, syncedAt: updatedAt },
    };
    await store.put(next);
    changes.notify(next);
    return next;
  }

  return {
    list: () => store.list(),
    open,
    save,
    refreshCopy,
    adoptCampaignCopy,
    /** Suscripción a cambios de personajes hechos en otras pestañas. */
    onExternalChange: (fn) => changes.subscribe(fn),
    /** Fecha del último guardado en este dispositivo (null si ya no existe). */
    async storedUpdatedAt(id) {
      return (await store.get(id))?.updatedAt ?? null;
    },

    async create(character = createCharacter()) {
      const record = buildRecord(character);
      await store.put(record);
      return record;
    },

    async duplicate(id) {
      const opened = await open(id);
      if (!opened) return null;
      const copy = structuredClone(opened.character);
      copy.identity.name = copy.identity.name ? `${copy.identity.name} (copia)` : '';
      const record = buildRecord(copy);
      await store.put(record);
      return record;
    },

    async importCharacter(character) {
      const record = buildRecord(character);
      await store.put(record);
      return record;
    },

    async remove(id, { alsoCloud = false } = {}) {
      const record = await store.get(id);
      if (alsoCloud && record?.cloud) {
        try {
          await api.deleteCharacter(record.cloud.id, record.cloud.editToken);
        } catch (err) {
          if (!(err instanceof ApiError && err.code === 'not_found')) throw err;
        }
      }
      await store.delete(id);
      changes.notify({ id, updatedAt: null }, 'removed');
    },

    /**
     * Publica o actualiza la copia en línea. Devuelve el registro actualizado.
     * Con `force` se sobrescribe aunque otro dispositivo haya guardado antes.
     */
    async publish(record, character, { force = false } = {}) {
      const document = createDocument(character);
      const fp = fingerprint(character);
      let cloud;
      if (!record.cloud) {
        const res = await api.createCharacter(document);
        cloud = { id: res.id, editToken: res.editToken, revision: res.revision, syncedAt: res.updatedAt };
      } else {
        try {
          const res = await api.updateCharacter(record.cloud.id, document, {
            token: record.cloud.editToken,
            revision: force ? undefined : record.cloud.revision,
          });
          cloud = { ...record.cloud, revision: res.revision, syncedAt: res.updatedAt };
        } catch (err) {
          // La copia en línea se eliminó: se publica una nueva (con otro enlace).
          if (err instanceof ApiError && err.code === 'not_found') {
            const res = await api.createCharacter(document);
            cloud = { id: res.id, editToken: res.editToken, revision: res.revision, syncedAt: res.updatedAt };
          } else {
            throw err;
          }
        }
      }
      const next = { ...buildRecord(character, record), cloud: { ...cloud, fingerprint: fp } };
      await store.put(next);
      changes.notify(next);
      return next;
    },

    /** Deja de compartir: borra la copia del servidor (el enlace deja de funcionar). */
    async unpublish(record) {
      if (!record.cloud) return record;
      try {
        await api.deleteCharacter(record.cloud.id, record.cloud.editToken);
      } catch (err) {
        if (!(err instanceof ApiError && err.code === 'not_found')) throw err;
      }
      const next = { ...record, cloud: null };
      await store.put(next);
      return next;
    },

    /** Descarga un personaje compartido (sólo lectura). */
    async loadShared(cloudId) {
      const res = await api.getCharacter(cloudId);
      const { character, warnings } = parseDocument(res.document);
      return { character, warnings, updatedAt: res.updatedAt, revision: res.revision };
    },

    /** Si este dispositivo es el autor del personaje compartido, devuelve su registro local. */
    async findByCloudId(cloudId) {
      const all = await store.list();
      return all.find((r) => r.cloud?.id === cloudId) ?? null;
    },
  };
}
