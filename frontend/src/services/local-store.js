// Almacenamiento local de personajes (funciona sin conexión).
//
// Se usa IndexedDB porque, a diferencia de localStorage, admite varios MB por
// personaje (retratos) y no bloquea la interfaz. Si IndexedDB no está disponible
// (algunos modos privados), se recurre a localStorage con la misma interfaz.
//
// Registro guardado:
// {
//   id,                  // UUID local
//   document,            // { format, schemaVersion, character }
//   summary,             // { name, race, classes, level } para listar sin calcular
//   createdAt, updatedAt,
//   cloud: null | { id, editToken, revision, syncedAt }  // copia compartida en el servidor
// }

const DB_NAME = 'agarias-dnd';
const DB_VERSION = 1;
const STORE = 'characters';
const LS_PREFIX = 'agarias-dnd:character:';

export class StorageError extends Error {
  constructor(userMessage, cause) {
    super(cause?.message ?? userMessage);
    this.name = 'StorageError';
    this.userMessage = userMessage;
    this.cause = cause;
  }
}

function promisify(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('updatedAt', 'updatedAt');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('IndexedDB bloqueada por otra pestaña.'));
  });
}

class IndexedDbBackend {
  constructor() {
    this.dbPromise = openDatabase();
  }

  async tx(mode, fn) {
    const db = await this.dbPromise;
    const tx = db.transaction(STORE, mode);
    const result = await fn(tx.objectStore(STORE));
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error('Transacción abortada'));
    });
    return result;
  }

  list() { return this.tx('readonly', (s) => promisify(s.getAll())); }
  get(id) { return this.tx('readonly', (s) => promisify(s.get(id))); }
  put(record) { return this.tx('readwrite', (s) => promisify(s.put(record))); }
  delete(id) { return this.tx('readwrite', (s) => promisify(s.delete(id))); }
}

class LocalStorageBackend {
  async list() {
    const out = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(LS_PREFIX)) {
        try { out.push(JSON.parse(localStorage.getItem(key))); } catch { /* registro corrupto: se ignora */ }
      }
    }
    return out;
  }
  async get(id) {
    const raw = localStorage.getItem(LS_PREFIX + id);
    return raw ? JSON.parse(raw) : undefined;
  }
  async put(record) { localStorage.setItem(LS_PREFIX + record.id, JSON.stringify(record)); }
  async delete(id) { localStorage.removeItem(LS_PREFIX + id); }
}

function createBackend() {
  try {
    if (typeof indexedDB !== 'undefined' && indexedDB) return new IndexedDbBackend();
  } catch { /* se usa el respaldo */ }
  return new LocalStorageBackend();
}

function isQuotaError(err) {
  return err?.name === 'QuotaExceededError' || /quota/i.test(err?.message ?? '');
}

export function newId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Repositorio de personajes locales. */
export function createLocalStore(backend = createBackend()) {
  const wrap = async (action, fn) => {
    try {
      return await fn();
    } catch (err) {
      console.error(`[local-store] ${action}`, err);
      if (isQuotaError(err)) {
        throw new StorageError('No queda espacio en el navegador. Elimina personajes o reduce la imagen.', err);
      }
      throw new StorageError('No se pudo acceder al almacenamiento del navegador.', err);
    }
  };

  return {
    list: () => wrap('list', async () => {
      const records = await backend.list();
      return records
        .filter((r) => r && typeof r.id === 'string' && r.document)
        .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    }),
    get: (id) => wrap('get', async () => (await backend.get(id)) ?? null),
    put: (record) => wrap('put', () => backend.put(record)),
    delete: (id) => wrap('delete', () => backend.delete(id)),
  };
}

/** Pide al navegador que no borre los datos ante falta de espacio (best effort). */
export async function requestPersistentStorage() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
      await navigator.storage.persist();
    }
  } catch { /* no soportado: no es crítico */ }
}
