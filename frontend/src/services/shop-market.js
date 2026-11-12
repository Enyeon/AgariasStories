// Persistencia del MERCADO de la Tienda (existencias, eventos, día de juego,
// relaciones con vendedores y registro de compras). No guarda monedas ni
// inventarios: esos viven en la ficha de cada personaje.
//
//   - Personaje de una campaña de la que este dispositivo es miembro → el
//     mercado es el de la campaña, en Supabase (shop_market_get/save), con
//     revisión para que dos jugadores no se pisen. Se guarda una copia local
//     para poder mirarlo sin conexión (sólo lectura).
//   - Personaje sin campaña → mercado local de este dispositivo.

import { migrateWorld } from '../domain/shop/state.js';
import { shopMarketApi, hasSupabase } from './api.js';

const LS = 'agarias-dnd:';
const K_LOCAL = `${LS}shop-market:local`;
const K_CACHE = (id) => `${LS}shop-market-cache:${id}`;

function read(key) {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function write(key, value) {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/**
 * Ámbito del mercado de un personaje.
 * @returns {{ kind: 'local' } | { kind: 'campaign', id: string, name: string, key: string }}
 */
export function marketScope(character, memberships = [], enabled = hasSupabase()) {
  const id = character?.campaign?.id;
  const m = id ? memberships.find((x) => x.id === id) : null;
  if (m && enabled) return { kind: 'campaign', id: m.id, name: m.name, key: m.key };
  return { kind: 'local' };
}

export const sameScope = (a, b) => a?.kind === b?.kind && (a.kind === 'local' || a.id === b.id);

export function createMarketRepository({ api = shopMarketApi } = {}) {
  return {
    /** → { world|null, revision, role: 'dm'|'jugador', offline? } */
    async load(scope) {
      if (scope.kind === 'local') {
        const saved = read(K_LOCAL);
        return { world: saved ? migrateWorld(saved) : null, revision: 0, role: 'dm' };
      }
      try {
        const res = await api.get(scope.id, scope.key);
        const world = res.world ? migrateWorld(res.world) : null;
        if (world) write(K_CACHE(scope.id), { world, revision: res.revision, role: res.role });
        return { world, revision: res.revision ?? 0, role: res.role ?? 'jugador' };
      } catch (err) {
        // Supabase sin la migración de la Tienda: se usa el mercado local y se avisa.
        if (err?.code === 'server_not_ready') return { ...(await this.load({ kind: 'local' })), fallback: 'server_not_ready' };
        if (err?.code !== 'network' && err?.code !== 'timeout') throw err;
        const cached = read(K_CACHE(scope.id));
        if (!cached?.world) throw err;
        return { world: migrateWorld(cached.world), revision: cached.revision, role: cached.role ?? 'jugador', offline: true };
      }
    },

    /** Guarda y devuelve la nueva revisión. En campaña puede lanzar ApiError('conflict'). */
    async save(scope, world, revision) {
      if (scope.kind === 'local') {
        if (!write(K_LOCAL, world)) {
          const e = new Error('No queda espacio en el navegador para guardar el mercado.');
          e.userMessage = e.message;
          throw e;
        }
        return revision + 1;
      }
      const res = await api.save(scope.id, scope.key, world, revision);
      write(K_CACHE(scope.id), { world, revision: res.revision });
      return res.revision;
    },
  };
}
