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

export function createCharacterService({ store = createLocalStore(), api = defaultApi } = {}) {
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
    };
  }

  /** Abre un registro local, migrando/normalizando su documento. */
  async function open(id) {
    const record = await store.get(id);
    if (!record) return null;
    const { character, warnings } = parseDocument(record.document);
    return { record, character, warnings };
  }

  async function save(record, character) {
    const next = buildRecord(character, record);
    await store.put(next);
    return next;
  }

  return {
    list: () => store.list(),
    open,
    save,

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
