// Servicio de la Tienda: une el dominio (domain/shop), los PERSONAJES reales
// (services/characters), el Homebrew/campañas (services/homebrew) y el mercado
// (local o de la campaña en Supabase).
//
// Flujo de una compra:
//   ficha actual (IndexedDB) → precio recalculado → se paga con equipment.coins
//   → el objeto entra en equipment.items / workshop.materials → se guarda el
//   mercado (Supabase en campaña, con revisión) → se guarda la ficha → si la
//   ficha está compartida, se publica la copia en línea (share_update).
//
// Garantías: operaciones en serie; ante «conflict» (otro jugador compró a la
// vez) se recarga el mercado y se repite la operación sobre datos frescos.

import shopsData from '../data/shop/shops.json';
import keepersData from '../data/shop/keepers.json';
import eventsData from '../data/shop/events.json';
import topicsData from '../data/shop/topics.json';
import dialogueData from '../data/shop/dialogue.json';
import { buildCatalog } from '../domain/shop/catalog.js';
import { catalogSources } from '../domain/shop/sources.js';
import { createShopContext } from '../domain/shop/context.js';
import { createWorld, reconcileWorld, advanceDays as simulateDays, shopClosure } from '../domain/shop/simulation.js';
import { quoteBuy, quoteSell } from '../domain/shop/pricing.js';
import { buy as buyTx, sell as sellTx } from '../domain/shop/transactions.js';
import { recognizedItems, unrecognizedItems } from '../domain/shop/inventory.js';
import * as negotiation from '../domain/shop/negotiation.js';
import { getRelation, haggleKey } from '../domain/shop/state.js';
import { createRng } from '../domain/shop/rng.js';
import { computeSheet } from '../domain/rules.js';
import { listEntries, getPack } from '../content/registry.js';
import { createMarketRepository, marketScope, sameScope } from './shop-market.js';
import { ApiError } from './api.js';

const PREFS_KEY = 'agarias-dnd:shop-prefs';
const SKILL_KEYS = { persuasion: 'Persuasión', deception: 'Engaño', intimidation: 'Intimidación', insight: 'Perspicacia', investigation: 'Investigación' };

function readPrefs() {
  try {
    return { rollMode: 'auto', ...(JSON.parse(globalThis.localStorage?.getItem(PREFS_KEY) ?? '{}')) };
  } catch {
    return { rollMode: 'auto' };
  }
}

/** Modificadores de habilidad del personaje (los de la ficha, con competencias y efectos). */
export function negotiationSkills(character) {
  try {
    const skills = computeSheet(character).skills;
    return Object.fromEntries(Object.entries(SKILL_KEYS).map(([k, name]) => [k, skills.find((s) => s.name === name)?.bonus ?? 0]));
  } catch {
    return Object.fromEntries(Object.keys(SKILL_KEYS).map((k) => [k, 0]));
  }
}

/** Contexto del dominio: catálogo (Tienda + Taller + Homebrew visible para el personaje) y datos fijos. */
export function buildShopContext({ campaignId = null } = {}) {
  // Homebrew visible: el local de este dispositivo y el de la campaña del personaje.
  const homebrew = listEntries('objeto').filter((e) => getPack(e.packId)?.kind === 'local' || (campaignId && e.packId === campaignId));
  return createShopContext({
    catalog: buildCatalog(catalogSources({ homebrew })),
    shops: shopsData.shops,
    keepers: keepersData.keepers,
    events: eventsData.events,
    topics: topicsData.topics,
    dialogue: dialogueData,
  });
}

/**
 * @param {{ characters: ReturnType<import('./characters.js').createCharacterService>, homebrew: object, market?: object }} deps
 */
export function createShopService({ characters, homebrew, market = createMarketRepository(), remoteEnabled = undefined }) {
  const listeners = new Set();
  let queue = Promise.resolve();
  const state = {
    ready: false,
    ctx: null,
    world: null,
    revision: 0,
    role: 'dm',
    offline: false,
    scope: { kind: 'local' },
    notice: null,
    records: [],
    characters: [],
    characterId: null,
    record: null,
    character: null,
    prefs: readPrefs(),
  };

  const emit = (change = {}) => { for (const fn of listeners) fn(state, change); };
  const serial = (task) => {
    const run = queue.then(task, task);
    queue = run.catch(() => {});
    return run;
  };
  const shopCharacter = () => (state.character ? { ...state.character, skills: negotiationSkills(state.character) } : null);
  const charName = () => state.character?.identity?.name?.trim() || 'Personaje sin nombre';

  async function loadMarket(scope) {
    const loaded = await market.load(scope);
    // Sin la migración de la Tienda en Supabase, la campaña usa el mercado local.
    state.notice = loaded.fallback === 'server_not_ready' ? `El servidor aún no tiene la Tienda instalada: ${scope.name ?? 'la campaña'} usa el mercado de este dispositivo.` : null;
    if (loaded.fallback) scope = { kind: 'local' };
    state.scope = scope;
    state.role = loaded.role;
    state.offline = Boolean(loaded.offline);
    state.revision = loaded.revision;
    if (loaded.world) {
      state.world = reconcileWorld(loaded.world, state.ctx);
    } else {
      // Primer uso del mercado (en la campaña lo crea quien entre primero).
      state.world = createWorld(state.ctx);
      try {
        state.revision = await market.save(scope, state.world, state.revision);
      } catch (err) {
        // Otro jugador lo creó a la vez: se usa el suyo.
        if (!(err instanceof ApiError && err.code === 'conflict')) throw err;
        return loadMarket(scope);
      }
    }
  }

  async function loadCharacter(id) {
    const opened = id ? await characters.open(id) : null;
    state.record = opened?.record ?? null;
    state.character = opened?.character ?? null;
    state.characterId = state.record?.id ?? null;
  }

  /** Abre personaje + mercado de su ámbito + catálogo visible para él. */
  async function select(id) {
    await loadCharacter(id);
    state.ctx = buildShopContext({ campaignId: state.character?.campaign?.id ?? null });
    const scope = marketScope(state.character, homebrew?.memberships?.() ?? [], remoteEnabled);
    await loadMarket(scope);
    if (id) setPref('characterId', id);
  }

  function setPref(key, value) {
    state.prefs = { ...state.prefs, [key]: value };
    try { globalThis.localStorage?.setItem(PREFS_KEY, JSON.stringify(state.prefs)); } catch { /* no crítico */ }
  }

  /**
   * Aplica `fn(world)` → { world, ...extra } y guarda el mercado. Si otro
   * jugador guardó antes (conflict), recarga y repite una vez.
   */
  async function mutateMarket(fn) {
    if (state.offline) return { error: 'Sin conexión con el mercado de la campaña: puedes mirar, pero no comprar ni vender.' };
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = fn(state.world);
      if (result.error) return result;
      try {
        state.revision = await market.save(state.scope, result.world, state.revision);
        state.world = result.world;
        return result;
      } catch (err) {
        if (err instanceof ApiError && err.code === 'conflict' && attempt === 0) {
          await loadMarket(state.scope);
          continue;
        }
        if (err instanceof ApiError && err.code === 'forbidden') return { error: 'Sólo el DM de la campaña puede hacer eso.' };
        return { error: err?.userMessage ?? 'No se pudo guardar el mercado.' };
      }
    }
    return { error: 'El mercado cambió mientras operabas. Inténtalo de nuevo.' };
  }

  /** Guarda la ficha y, si está compartida, actualiza la copia en línea. */
  async function commitCharacter(nextCharacter) {
    state.record = await characters.save(state.record, nextCharacter);
    state.character = nextCharacter;
    let cloud = 'none';
    if (state.record.cloud) {
      try {
        state.record = await characters.publish(state.record, nextCharacter);
        cloud = 'synced';
      } catch (err) {
        console.warn('[tienda] No se pudo publicar la copia en línea', err);
        cloud = 'pending';
      }
    }
    return cloud;
  }

  async function transact(kind, shopId, itemId, qty) {
    if (!state.record) return { error: 'Elige un personaje.' };
    // Datos frescos de la ficha (pudo cambiar en otra pestaña).
    await loadCharacter(state.record.id);
    const before = state.world;
    const beforeRevision = state.revision;
    const tx = kind === 'buy' ? buyTx : sellTx;
    const result = await mutateMarket((world) => tx(world, state.ctx, { charId: state.characterId, charName: charName(), shopId, itemId, qty, character: shopCharacter() }));
    if (result.error) return result;
    const { skills, ...clean } = result.character;
    try {
      result.cloud = await commitCharacter(clean);
    } catch (err) {
      // La ficha no se pudo guardar: se deshace el cambio del mercado.
      console.error('[tienda] Error al guardar la ficha', err);
      await market.save(state.scope, before, state.revision).then((rev) => { state.world = before; state.revision = rev; }).catch(() => { state.world = before; state.revision = beforeRevision; });
      return { error: err?.userMessage ?? 'No se pudo guardar el personaje. No se cobró nada.' };
    }
    return result;
  }

  const api = {
    state,
    get ctx() { return state.ctx; },
    get market() { return { name: state.scope.kind === 'campaign' ? `Mercado de ${state.scope.name}` : 'Mercado', tagline: state.scope.kind === 'campaign' ? 'Compartido por la campaña' : 'Mercado de este dispositivo' }; },
    canEditCharacter: false,

    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    /** Carga la lista de personajes y abre el indicado (o el último usado). */
    async init(characterId = null) {
      state.records = await characters.list();
      state.characters = state.records.map((r) => ({ id: r.id, name: r.summary?.name || 'Personaje sin nombre', subtitle: r.summary?.classes }));
      const preferred = [characterId, state.prefs.characterId].find((id) => id && state.records.some((r) => r.id === id)) ?? state.records[0]?.id ?? null;
      await select(preferred);
      state.ready = true;
      emit({ type: 'ready' });
      return api;
    },

    setPref(key, value) {
      setPref(key, value);
      emit({ type: 'prefs' });
    },

    selectCharacter(id) {
      return serial(async () => {
        const prevScope = state.scope;
        await select(id);
        emit({ type: sameScope(prevScope, state.scope) ? 'character' : 'market' });
      });
    },

    /** Recarga el mercado (p. ej. para ver lo que compraron otros jugadores). */
    refresh() {
      return serial(async () => {
        await loadCharacter(state.characterId);
        await loadMarket(state.scope);
        emit({ type: 'market' });
      });
    },

    get canControlTime() { return state.role === 'dm' && !state.offline; },

    // ── Consultas ──
    shopStatus(shopId) {
      const closed = shopClosure(state.world, state.ctx, shopId);
      return { closed: Boolean(closed), closedBy: closed };
    },
    quoteBuy: (shopId, itemId) => quoteBuy(state.world, state.ctx, { shopId, itemId, charId: state.characterId }),
    quoteSell: (shopId, itemId) => quoteSell(state.world, state.ctx, { shopId, itemId, charId: state.characterId }),
    relation: (keeperId) => getRelation(state.world, state.characterId, keeperId),
    haggleState: (shopId, itemId, side, qty = 1) => negotiation.canNegotiate(state.world, state.ctx, { charId: state.characterId, shopId, itemId, side, qty }),
    /** Lo que el personaje podría vender aquí: objetos reconocidos + los que la Tienda no conoce. */
    sellableItems(shopId) {
      if (!state.character) return [];
      const known = recognizedItems(state.character, state.ctx.catalog).map(({ item, units }) => ({
        entry: { name: item.name, qty: units },
        item,
        units,
        quote: quoteSell(state.world, state.ctx, { shopId, itemId: item.id, charId: state.characterId }),
      }));
      const unknown = unrecognizedItems(state.character, state.ctx.catalog).map((entry) => ({
        entry: { name: entry.name || 'Objeto sin nombre', qty: entry.quantity }, item: null, units: 0, quote: { unit: null, reason: 'unknown-item' },
      }));
      return [...known, ...unknown];
    },
    welcomeLine(shopId) {
      const keeper = state.ctx.keeperOf(shopId);
      if (!keeper) return '';
      const rep = getRelation(state.world, state.characterId, keeper.id).rep;
      const key = rep >= 30 ? 'welcome_friend' : rep <= -25 ? 'welcome_cold' : 'welcome';
      const voices = state.ctx.dialogue.voices ?? {};
      const options = keeper.lines?.[key] ?? voices[keeper.voice]?.[key] ?? voices.default?.[key] ?? [''];
      return createRng(state.world.seed, 'welcome', shopId, state.world.day).pick(options);
    },
    tactics(sessionId) {
      const session = negotiation.getSession(state.world, sessionId);
      return session ? negotiation.availableTactics(state.world, state.ctx, session, shopCharacter()) : [];
    },
    negotiationStep(sessionId) {
      const session = negotiation.getSession(state.world, sessionId);
      return session ? negotiation.negotiationStep(session) : 1;
    },
    activeSession: (shopId, itemId, side) => negotiation.publicSession(negotiation.getSession(state.world, haggleKey(state.characterId, shopId, itemId, side))),

    // ── Acciones ──
    buy(shopId, itemId, qty) {
      return serial(async () => {
        const res = await transact('buy', shopId, itemId, qty);
        if (!res.error) emit({ type: 'transaction', ledger: res.ledger });
        return res;
      });
    },
    sell(shopId, itemId, qty) {
      return serial(async () => {
        const res = await transact('sell', shopId, itemId, qty);
        if (!res.error) emit({ type: 'transaction', ledger: res.ledger });
        return res;
      });
    },
    startNegotiation(shopId, itemId, side, qty) {
      return serial(async () => {
        if (!state.characterId) return { error: 'Elige un personaje.' };
        const res = await mutateMarket((world) => negotiation.startNegotiation(world, state.ctx, { charId: state.characterId, shopId, itemId, side, qty }));
        if (res.error) return res;
        emit({ type: 'negotiation' });
        return { session: negotiation.publicSession(negotiation.getSession(state.world, res.session.id)) };
      });
    },
    negotiate(sessionId, action) {
      return serial(async () => {
        const roll = state.prefs.rollMode === 'manual' ? action.roll : undefined;
        const res = await mutateMarket((world) => negotiation.act(world, state.ctx, sessionId, { ...action, roll }, shopCharacter()));
        if (res.error) return res;
        emit({ type: 'negotiation' });
        return { session: negotiation.publicSession(res.session) };
      });
    },
    advanceDays(days) {
      return serial(async () => {
        if (!api.canControlTime) return { error: 'Sólo el DM de la campaña puede pasar el tiempo.' };
        let report = [];
        const res = await mutateMarket((world) => {
          const out = simulateDays(world, state.ctx, days);
          report = out.report;
          return out;
        });
        if (res.error) return res;
        emit({ type: 'day', report });
        return { report };
      });
    },
    resetWorld() {
      return serial(async () => {
        if (!api.canControlTime) return { error: 'Sólo el DM de la campaña puede reiniciar el mercado.' };
        const res = await mutateMarket(() => ({ world: createWorld(state.ctx) }));
        if (!res.error) emit({ type: 'reset' });
        return res;
      });
    },
  };
  return api;
}
