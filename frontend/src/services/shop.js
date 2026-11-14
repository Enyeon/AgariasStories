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
import worldData from '../data/shop/world.json';
import factionsData from '../data/shop/factions.json';
import personalitiesData from '../data/shop/personalities.json';
import racesData from '../data/shop/races.json';
import rumorsData from '../data/shop/rumors.json';
import professionsData from '../data/shop/professions.json';
import estateData from '../data/shop/estate.json';
import { buildCatalog } from '../domain/shop/catalog.js';
import { catalogSources } from '../domain/shop/sources.js';
import { assembleWorld, merchantToEditor, regionToEditor, factionToEditor, eventToEditor, worldId } from '../domain/shop/homebrew-world.js';
import * as hiring from '../domain/shop/hiring.js';
import * as estate from '../domain/shop/estate.js';
import * as staff from '../domain/shop/staff.js';
import { productPopularity, renown, popularityLabel } from '../domain/shop/popularity.js';
import { createShopContext } from '../domain/shop/context.js';
import { createWorld, reconcileWorld, advanceDays as simulateDays, shopClosure, advancePhase as simulatePhase, triggerEvent, endEvent } from '../domain/shop/simulation.js';
import { quoteBuy, quoteSell } from '../domain/shop/pricing.js';
import { buy as buyTx, sell as sellTx } from '../domain/shop/transactions.js';
import { recognizedItems, unrecognizedItems, withInventionRefs } from '../domain/shop/inventory.js';
import * as negotiation from '../domain/shop/negotiation.js';
import { getRelation, haggleKey } from '../domain/shop/state.js';
import * as talk from '../domain/shop/talk.js';
import { evaluateDisposition, welcomeKey } from '../domain/shop/disposition.js';
import { playerLocation, visibleMap, merchantsAt, travel as travelTo, availability, keeperLocation, phaseOf, weekdayName, discover } from '../domain/shop/presence.js';
import { displayKeeper } from '../domain/shop/personality.js';
import { MEMORY_TYPES, DM_MEMORY_TYPES } from '../domain/shop/memory.js';
import { createRng } from '../domain/shop/rng.js';
import { computeSheet, allFeats } from '../domain/rules.js';
import { raceName, getClass, getOfficialBackground } from '../data/index.js';
import { buildProfile } from '../domain/shop/profile.js';
import { listEntries, getPack } from '../content/registry.js';
import { createMarketRepository, marketScope, sameScope } from './shop-market.js';
import { ApiError, hasSupabase } from './api.js';

const PREFS_KEY = 'agarias-dnd:shop-prefs';
const SKILL_KEYS = { persuasion: 'Persuasión', deception: 'Engaño', intimidation: 'Intimidación', insight: 'Perspicacia', investigation: 'Investigación', performance: 'Interpretación', sleight: 'Juego de Manos' };

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

/** Perfil del personaje para el trato con los comerciantes (raza, clase, trasfondo…). */
export function characterProfile(character) {
  const profile = buildProfile(character, {
    raceName,
    className: (key) => getClass(key)?.nombre ?? key,
    backgroundName: (bg) => (bg?.source === 'custom' ? bg.custom?.name ?? '' : getOfficialBackground(bg?.key)?.name ?? bg?.key ?? ''),
    families: racesData.families,
  });
  // Dotes del personaje (algunas cambian precios, p. ej. Artesano).
  return profile && character ? { ...profile, feats: allFeats(character).map((f) => f.name) } : profile;
}

/**
 * Contexto del dominio: datos oficiales + Homebrew del ÁMBITO del mercado.
 *
 * - Mercado de campaña: sólo el contenido PUBLICADO de esa campaña (lo
 *   controla el DM). El Homebrew local de un jugador no entra: si entrara, se
 *   colaría en el mercado compartido de todos.
 * - Mercado local: el Homebrew local de este dispositivo.
 */
export function buildShopContext({ campaignId = null } = {}) {
  const visible = campaignId ? (e) => e.packId === campaignId : (e) => getPack(e.packId)?.kind === 'local';
  const entries = (type) => listEntries(type).filter(visible);
  const world = assembleWorld(
    { world: worldData, factions: factionsData.factions, events: eventsData.events, keepers: keepersData.keepers, shops: shopsData.shops, rumors: rumorsData.rumors },
    { mercader: entries('mercader'), region: entries('region'), faccion: entries('faccion'), evento: entries('evento') },
  );
  return createShopContext({
    catalog: buildCatalog(catalogSources({ homebrew: entries('objeto') })),
    shops: world.shops,
    keepers: world.keepers,
    events: world.events,
    topics: topicsData.topics,
    dialogue: dialogueData,
    // El DM puede elegir en la ficha de la campaña dónde empiezan los personajes.
    world: { ...world.world, start: (campaignId && getPack(campaignId)?.details?.startLocation) || world.world.start },
    factions: world.factions,
    archetypes: personalitiesData.archetypes,
    raceFamilies: racesData.families,
    rumors: world.rumors,
    professions: professionsData.professions,
    estate: estateData,
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
    // Campaña abierta «como DM» (sin personaje): el DM entra al mercado de su campaña.
    dmCampaign: null,
    record: null,
    character: null,
    profile: null,
    prefs: readPrefs(),
  };

  const emit = (change = {}) => { for (const fn of listeners) fn(state, change); };
  const serial = (task) => {
    const run = queue.then(task, task);
    queue = run.catch(() => {});
    return run;
  };
  // Los inventos fabricados antes de que el Taller guardara su referencia se reconocen por el nombre.
  const shopCharacter = () => (state.character ? { ...withInventionRefs(state.character), skills: negotiationSkills(state.character) } : null);
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
    state.profile = characterProfile(state.character);
  }

  /** Abre personaje + mercado de su ámbito + catálogo visible para él. */
  async function select(id) {
    state.dmCampaign = null;
    await loadCharacter(id);
    const scope = marketScope(state.character, homebrew?.memberships?.() ?? [], remoteEnabled);
    state.ctx = buildShopContext({ campaignId: scope.kind === 'campaign' ? scope.id : null });
    await loadMarket(scope);
    if (id) setPref('characterId', id);
  }

  /** Abre el mercado de una campaña como DM (sin personaje). */
  async function enterAsDm(id) {
    const m = api.dmCampaigns().find((x) => x.id === id);
    if (!m) return select(null);
    await loadCharacter(null);
    const scope = marketScope({ campaign: { id } }, [m], remoteEnabled);
    state.ctx = buildShopContext({ campaignId: scope.kind === 'campaign' ? scope.id : null });
    await loadMarket(scope);
    state.dmCampaign = scope.kind === 'campaign' ? id : null;
    setPref('dmCampaign', state.dmCampaign);
  }

  /** ¿Dónde se guarda y quién puede? Local = este dispositivo; campaña = sólo su DM. */
  function packInfo(packId) {
    const local = homebrew?.localPack?.();
    if (local && packId === local.id) return { id: packId, kind: 'local', canEdit: state.scope.kind === 'local' ? api.canControlTime : true };
    const m = homebrew?.membership?.(packId);
    return m ? { id: packId, kind: 'campaign', canEdit: m.role === 'dm' } : null;
  }

  /** Si lo cambiado es el mundo abierto, se recompila y se recarga el mercado. */
  async function reloadIfCurrent(packId) {
    const current = state.scope.kind === 'campaign' ? state.scope.id : homebrew?.localPack?.()?.id;
    if (packId !== current) return;
    state.ctx = buildShopContext({ campaignId: state.scope.kind === 'campaign' ? state.scope.id : null });
    await loadMarket(state.scope);
    emit({ type: 'market' });
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

  const here = () => (state.world && state.ctx ? playerLocation(state.world, state.ctx, state.characterId) : null);
  const who = () => ({ charId: state.characterId, profile: state.profile });

  /**
   * Operación que cambia el mercado Y la ficha (comprar, vender, regalar,
   * pagar una ronda…). Si la ficha no se puede guardar, se deshace el mercado.
   */
  async function withCharacter(fn) {
    if (!state.record) return { error: 'Elige un personaje.' };
    // Datos frescos de la ficha (pudo cambiar en otra pestaña).
    await loadCharacter(state.record.id);
    const before = state.world;
    const beforeRevision = state.revision;
    const result = await mutateMarket((world) => fn(world, shopCharacter()));
    if (result.error || !result.character) return result;
    const { skills, ...clean } = result.character;
    try {
      result.cloud = await commitCharacter(clean);
    } catch (err) {
      // La ficha no se pudo guardar: se deshace el cambio del mercado.
      console.error('[tienda] Error al guardar la ficha', err);
      await market.save(state.scope, before, state.revision).then((rev) => { state.world = before; state.revision = rev; }).catch(() => { state.world = before; state.revision = beforeRevision; });
      return { error: err?.userMessage ?? 'No se pudo guardar el personaje. No se cobró nada.' };
    }
    state.profile = characterProfile(state.character);
    return result;
  }

  function transact(kind, shopId, itemId, qty) {
    const tx = kind === 'buy' ? buyTx : sellTx;
    return withCharacter((world, character) => tx(world, state.ctx, { charId: state.characterId, charName: charName(), shopId, itemId, qty, character, profile: state.profile, here: here() }));
  }

  const TALK = {
    tell: talk.tell, story: talk.story, lie: talk.lie, read: talk.read, rumor: talk.askRumor, drink: talk.drink, gift: talk.gift,
    claimGift: talk.claimGift, secret: talk.secret, acceptFavor: talk.acceptFavor, deliverFavor: talk.deliverFavor, abandonFavor: talk.abandonFavor, steal: talk.steal,
  };

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
      const dmPref = !characterId && state.prefs.dmCampaign && api.dmCampaigns().some((m) => m.id === state.prefs.dmCampaign) ? state.prefs.dmCampaign : null;
      if (dmPref) await enterAsDm(dmPref);
      else await select(preferred);
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
        setPref('dmCampaign', null);
        await select(id);
        emit({ type: sameScope(prevScope, state.scope) ? 'character' : 'market' });
      });
    },

    // ── Mundo del DM (comerciantes, regiones, facciones, eventos) ──
    /** ¿Puede este usuario configurar el mundo? (DM de la campaña, o mercado local) */
    get canEditWorld() { return api.canControlTime; },
    /** Dónde se guarda lo que edita el DM: el paquete de la campaña o el Homebrew local. */
    worldPackId() {
      return state.scope?.kind === 'campaign' ? state.scope.id : homebrew?.localPack?.()?.id ?? null;
    },
    /** Datos para el editor: la entrada Homebrew que ya lo sustituye, o la conversión de lo oficial. */
    worldEditorData(type, id) {
      const packId = api.worldPackId();
      const mine = listEntries(type, { selectable: false }).filter((e) => e.packId === packId && e.status !== 'retirado');
      const own = mine.find((e) => (type === 'mercader' ? e.ref === id || e.item.base === id : worldId(e.ref, e.item) === id));
      if (own) return { data: own.item, contentId: own.ref.split(':').at(-1), homebrew: !own.item.base };
      const ctx = state.ctx;
      if (type === 'mercader') {
        const keeper = keepersData.keepers.find((k) => k.id === id);
        return keeper ? { data: merchantToEditor(keeper, shopsData.shops.find((sh) => sh.keeperId === id)), contentId: null } : null;
      }
      if (type === 'region') {
        const r = worldData.regions.find((x) => x.id === id);
        return r ? { data: regionToEditor(r), contentId: null } : null;
      }
      if (type === 'faccion') {
        const f = factionsData.factions.find((x) => x.id === id);
        return f ? { data: factionToEditor(f), contentId: null } : null;
      }
      if (type === 'evento') {
        const ev = eventsData.events.find((x) => x.id === id) ?? ctx.events.get(id);
        return ev ? { data: eventToEditor(ev), contentId: null } : null;
      }
      return null;
    },
    /** Guarda (y publica) una pieza del mundo y recarga la Tienda con ella. */
    saveWorld(type, data, contentId = null, packId = api.worldPackId()) {
      return serial(async () => {
        const pack = packInfo(packId);
        if (!pack || !pack.canEdit) return { error: 'Sólo el DM puede configurar el mundo de la Tienda.' };
        let res;
        try {
          res = pack.kind === 'campaign'
            ? await homebrew.saveCampaignItem(pack.id, { type, data, contentId, status: 'publicado' })
            : homebrew.saveLocalItem({ type, data, contentId });
        } catch (err) {
          if (err instanceof ApiError && err.code === 'invalid') return { error: 'El servidor de la campaña aún no admite el mundo configurable: aplica las migraciones 20261113 y 20261114 de Supabase.' };
          return { error: err?.userMessage ?? 'No se pudo guardar.' };
        }
        if (res.errors?.length) return { error: res.errors.join(' ') };
        await reloadIfCurrent(packId);
        return res;
      });
    },

    // ── Carpeta del DM: tiendas propias por campaña ──
    /** Campañas de este dispositivo en las que el usuario es DM. */
    dmCampaigns: () => (remoteEnabled ?? hasSupabase() ? (homebrew?.memberships?.() ?? []).filter((m) => m.role === 'dm') : []),
    /** Abre el mercado de una campaña como DM, sin personaje. */
    enterCampaignAsDm(id) {
      return serial(async () => {
        await enterAsDm(id);
        emit({ type: 'market' });
      });
    },
    /**
     * Carpetas del DM: una por campaña (y una para este dispositivo), con las
     * tiendas propias (nuevas o copias) y los comerciantes oficiales modificados.
     */
    dmFolders() {
      const local = homebrew?.localPack?.();
      const packs = [
        ...api.dmCampaigns().map((m) => ({ id: m.id, name: m.name, kind: 'campaign' })),
        ...(local ? [{ id: local.id, name: 'Este dispositivo (sin campaña)', kind: 'local' }] : []),
      ];
      return packs.map((p) => {
        const current = p.kind === 'campaign' ? state.scope.kind === 'campaign' && state.scope.id === p.id : state.scope.kind === 'local';
        // Para nombrar los lugares (también los Homebrew de esa campaña).
        const ctx = current ? state.ctx : buildShopContext({ campaignId: p.kind === 'campaign' ? p.id : null });
        const info = (e) => ({
          ref: e.ref,
          contentId: e.ref.split(':').at(-1),
          name: e.item.name,
          portrait: e.item.portrait || '🧑‍💼',
          shopName: e.item.shopName || `Puesto de ${e.item.name}`,
          shopIcon: e.item.shopIcon || '🏪',
          location: ctx.location(e.item.location)?.name ?? (e.item.route?.length ? 'Errante' : e.item.location || '—'),
          copyOf: e.item.copyOf ? keepersData.keepers.find((k) => k.id === e.item.copyOf)?.name ?? e.item.copyOf : null,
          base: e.item.base ? keepersData.keepers.find((k) => k.id === e.item.base)?.name ?? e.item.base : null,
          extras: (e.item.addItems ?? []).length,
          prices: (e.item.prices ?? []).length,
          status: e.status,
        });
        const entries = listEntries('mercader', { selectable: false, packId: p.id }).filter((e) => e.status !== 'retirado');
        return { ...p, current, shops: entries.filter((e) => !e.item.base).map(info), modified: entries.filter((e) => e.item.base).map(info) };
      });
    },
    /** Datos de una tienda de la carpeta para el editor. */
    dmShopData(packId, contentId) {
      const e = listEntries('mercader', { selectable: false, packId }).find((x) => x.ref.split(':').at(-1) === contentId);
      return e ? e.item : null;
    },
    /** Formulario de una tienda NUEVA que parte de un comerciante oficial (no lo sustituye). */
    officialCopy(keeperId) {
      const keeper = keepersData.keepers.find((k) => k.id === keeperId);
      if (!keeper) return null;
      const shop = shopsData.shops.find((sh) => sh.keeperId === keeperId);
      const data = merchantToEditor(keeper, shop);
      return { ...data, base: null, copyOf: keeperId, name: `${keeper.name} (copia)`, shopName: shop ? `${shop.name} (copia)` : '', secrets: [], favors: [] };
    },
    officialMerchants: () => keepersData.keepers.map((k) => ({ id: k.id, name: k.name, shop: shopsData.shops.find((s) => s.keeperId === k.id)?.name ?? null })),
    /** Retira una tienda de la carpeta (lo publicado se retira, no se borra). */
    retireDmShop(packId, ref) {
      return serial(async () => {
        const pack = packInfo(packId);
        if (!pack?.canEdit) return { error: 'Sólo el DM puede retirar tiendas.' };
        try {
          if (pack.kind === 'campaign') await homebrew.removeCampaignItem(pack.id, ref);
          else homebrew.removeLocalItem(ref);
        } catch (err) {
          return { error: err?.userMessage ?? 'No se pudo retirar.' };
        }
        await reloadIfCurrent(packId);
        return { ok: true };
      });
    },
    /** Resumen del mundo para el panel del DM. */
    worldOverview() {
      const ctx = state.ctx;
      const world = state.world;
      const active = state.world.events.filter((e) => e.start <= world.day && e.end >= world.day).map((e) => ctx.events.get(e.id)).filter(Boolean);
      const keepers = [...ctx.keepers.values()].map((k) => {
        const loc = keeperLocation(world, ctx, k);
        return { keeper: k, location: ctx.location(loc), regionId: ctx.location(loc)?.regionId ?? null, profession: ctx.professions.get(k.profession) ?? null, contract: hiring.contractOf(world, k.id) };
      });
      return {
        regions: [...ctx.regions.values()].map((r) => ({
          region: r,
          factions: (r.factions ?? []).map((id) => ctx.factions.get(id)).filter(Boolean),
          merchants: keepers.filter((k) => k.regionId === r.id),
          events: active.filter((ev) => !ev.regions?.length || ev.regions.includes(r.id)),
        })),
        factions: [...ctx.factions.values()].map((f) => ({ faction: f, merchants: keepers.filter((k) => k.keeper.faction === f.id), allies: (f.allies ?? []).map((id) => ctx.factions.get(id)?.name ?? id), rivals: (f.rivals ?? []).map((id) => ctx.factions.get(id)?.name ?? id) })),
        merchants: keepers,
        events: [...ctx.events.values()],
        problems: ctx.problems,
      };
    },

    // ── Contratación ──
    contracts: () => hiring.contractsOf(state.world, state.ctx, state.characterId),
    hire(keeperId, location = null) {
      return serial(async () => {
        const res = await withCharacter((world, character) => hiring.hire(world, state.ctx, { keeperId, location, character, ...who(), here: here() }));
        if (!res.error) emit({ type: 'talk', keeperId });
        return res;
      });
    },
    settleContract(keeperId) {
      return serial(async () => {
        const res = await withCharacter((world, character) => hiring.settle(world, state.ctx, { keeperId, character, charId: state.characterId }));
        if (!res.error) emit({ type: 'talk', keeperId });
        return res;
      });
    },
    dismissContract(keeperId) {
      return serial(async () => {
        const res = await mutateMarket((world) => hiring.dismiss(world, state.ctx, { keeperId, charId: state.characterId }));
        if (!res.error) emit({ type: 'talk', keeperId });
        return res;
      });
    },
    setContractProducts(keeperId, products) {
      return serial(async () => {
        const res = await mutateMarket((world) => {
          const out = hiring.setProducts(world, state.ctx, { keeperId, products, charId: state.characterId });
          return out.error ? out : { world: reconcileWorld(out.world, state.ctx) };
        });
        if (!res.error) emit({ type: 'market' });
        return res;
      });
    },

    // ── Propiedades, negocios y empleados ──
    /** Terrenos del lugar donde está el personaje. */
    plotsHere: () => estate.plotsAt(state.world, state.ctx, here(), state.characterId),
    myProperties: () => estate.propertiesOf(state.world, state.ctx, state.characterId).map((p) => ({
      ...p,
      here: p.plot.location === here(),
      location: state.ctx.location(p.plot.location),
      reserved: estate.reservedCash(state.world, p.plot.id),
      staff: staff.staffOf(state.world, state.characterId).filter((s) => s.assignment === p.plot.id),
    })),
    buildings: () => [...(state.ctx.estate?.buildings?.values() ?? [])],
    jobBoard: () => staff.candidatesAt(state.world, state.ctx, here()),
    myStaff: () => staff.staffOf(state.world, state.characterId),
    staffRoles: () => [...(state.ctx.estate?.roles?.values() ?? [])],
    myReports: () => staff.reportsFor(state.world, state.characterId),
    pendingReports: () => (api.canControlTime ? staff.pendingReports(state.world) : []),
    /** Popularidad: de un producto en la región actual y la fama del personaje. */
    popularity(itemId) {
      const region = state.ctx.location(here())?.regionId;
      const value = productPopularity(state.world, itemId, region);
      return { value, label: popularityLabel(value) };
    },
    get renown() {
      const region = state.ctx.location(here())?.regionId;
      const value = renown(state.world, state.characterId, region);
      return { value, label: popularityLabel(value) };
    },
    /** Inventos del personaje que se pueden llevar a su negocio. */
    stockable() {
      if (!state.character) return [];
      return recognizedItems(shopCharacter(), state.ctx.catalog).map(({ item, units }) => ({ item, units }));
    },
    /**
     * Acción sobre propiedades/empleados. Las que mueven dinero u objetos
     * cambian también la ficha; el resto sólo el mercado.
     */
    estate(action, params = {}) {
      const withChar = {
        buy: estate.buyPlot, sell: estate.sellPlot, build: estate.startWorks, deposit: estate.depositStock,
        withdrawStock: estate.withdrawStock, withdrawCash: estate.withdrawCash, promote: estate.promote, payStaff: staff.payStaff,
      };
      const marketOnly = {
        open: estate.openBusiness, price: estate.setStockPrice, hire: staff.hireStaff, assign: staff.assignStaff,
        terms: staff.updateTerms, dismiss: staff.dismissStaff, explore: staff.sendExplorer,
      };
      return serial(async () => {
        if (!state.characterId) return { error: 'Elige un personaje.' };
        const base = { ...params, charId: state.characterId, here: here() };
        let res;
        if (withChar[action]) res = await withCharacter((world, character) => withChar[action](world, state.ctx, { ...base, character }));
        else if (marketOnly[action]) res = await mutateMarket((world) => marketOnly[action](world, state.ctx, base));
        else return { error: 'Acción desconocida.' };
        if (!res.error) emit({ type: 'estate' });
        return res;
      });
    },
    /** El DM confirma (o cambia) el informe de un explorador. */
    resolveReport(reportId, params = {}) {
      return serial(async () => {
        if (!api.canControlTime) return { error: 'Sólo el DM confirma los informes.' };
        const res = await mutateMarket((world) => staff.resolveReport(world, state.ctx, { reportId, ...params }));
        if (!res.error) emit({ type: 'estate' });
        return res;
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
    quoteBuy: (shopId, itemId) => quoteBuy(state.world, state.ctx, { shopId, itemId, ...who() }),
    quoteSell: (shopId, itemId) => quoteSell(state.world, state.ctx, { shopId, itemId, ...who() }),
    relation: (keeperId) => getRelation(state.world, state.characterId, keeperId),
    haggleState: (shopId, itemId, side, qty = 1) => negotiation.canNegotiate(state.world, state.ctx, { shopId, itemId, side, qty, ...who(), here: here() }),

    // ── Mundo vivo ──
    get here() { return here(); },
    get location() { return state.ctx.location(here()); },
    get region() { return state.ctx.regions.get(state.ctx.location(here())?.regionId) ?? null; },
    get clock() {
      const phase = phaseOf(state.world, state.ctx);
      return { day: state.world.day, phase, phaseIndex: state.world.phase ?? 0, weekday: weekdayName(state.world.day, state.ctx), phases: state.ctx.phases };
    },
    get freeTravel() { return state.world.settings?.freeTravel !== false; },
    map: () => visibleMap(state.world, state.ctx, state.characterId),
    /** Comerciantes en tu ubicación (con su trato contigo y si atienden ahora). */
    merchantsHere() {
      return merchantsAt(state.world, state.ctx, here(), state.characterId).map(({ keeper, shop, status }) => {
        const rel = getRelation(state.world, state.characterId, keeper.id);
        const disposition = evaluateDisposition(state.world, state.ctx, { keeper, ...who() });
        return { keeper: displayKeeper(keeper, rel), shop, status, tier: disposition.tier, refuses: disposition.refuses };
      });
    },
    /** Comerciantes que el personaje ya conoce, estén donde estén. */
    knownMerchants() {
      const rels = state.world.relations?.[state.characterId ?? '_'] ?? {};
      return Object.keys(rels).map((id) => state.ctx.keepers.get(id)).filter(Boolean).map((keeper) => {
        const loc = keeperLocation(state.world, state.ctx, keeper);
        const disposition = evaluateDisposition(state.world, state.ctx, { keeper, ...who() });
        return { keeper: displayKeeper(keeper, rels[keeper.id]), location: loc ? state.ctx.location(loc) : null, status: availability(state.world, state.ctx, keeper), tier: disposition.tier };
      });
    },
    merchant: (keeperId) => talk.merchantSummary(state.world, state.ctx, { keeperId, ...who() }),
    journal: () => talk.journalOf(state.world, state.ctx, state.characterId),
    giftable: (keeperId) => talk.giftable(state.ctx, state.ctx.keepers.get(keeperId), state.character),
    memoryTypes: () => DM_MEMORY_TYPES.map((id) => ({ id, ...MEMORY_TYPES[id] })),
    standing: () => state.world.standing?.[state.characterId ?? '_'] ?? {},
    activeEvents: () => state.world.events.filter((e) => e.end >= state.world.day && e.start <= state.world.day).map((e) => ({ ...e, def: state.ctx.events.get(e.id) })).filter((e) => e.def),
    /** Lo que el personaje podría vender aquí: objetos reconocidos + los que la Tienda no conoce. */
    sellableItems(shopId) {
      if (!state.character) return [];
      const known = recognizedItems(shopCharacter(), state.ctx.catalog).map(({ item, units }) => ({
        entry: { name: item.name, qty: units },
        item,
        units,
        quote: quoteSell(state.world, state.ctx, { shopId, itemId: item.id, charId: state.characterId }),
      }));
      const unknown = unrecognizedItems(shopCharacter(), state.ctx.catalog).map((entry) => ({
        entry: { name: entry.name || 'Objeto sin nombre', qty: entry.quantity }, item: null, units: 0, quote: { unit: null, reason: 'unknown-item' },
      }));
      return [...known, ...unknown];
    },
    welcomeLine(shopId) {
      const keeper = state.ctx.keeperOf(shopId);
      if (!keeper) return '';
      const status = availability(state.world, state.ctx, keeper);
      const key = !status.open ? 'closed_now' : welcomeKey(evaluateDisposition(state.world, state.ctx, { keeper, ...who() }));
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
        const res = await mutateMarket((world) => negotiation.startNegotiation(world, state.ctx, { shopId, itemId, side, qty, ...who(), here: here() }));
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
    // ── Conversación ──
    /** Acción de conversación con un comerciante (ver domain/shop/talk.js). */
    talk(action, keeperId, params = {}) {
      return serial(async () => {
        const fn = TALK[action];
        if (!fn) return { error: 'Acción desconocida.' };
        const roll = state.prefs.rollMode === 'manual' ? params.roll : undefined;
        const res = await withCharacter((world, character) => fn(world, state.ctx, { ...params, roll, keeperId, character, ...who(), here: here() }));
        if (!res.error) emit({ type: 'talk', keeperId });
        return res;
      });
    },
    verifyRumor(rumorId, manualRoll) {
      return serial(async () => {
        const roll = state.prefs.rollMode === 'manual' ? manualRoll : undefined;
        const res = await mutateMarket((world) => talk.verifyRumor(world, state.ctx, { charId: state.characterId, rumorId, character: shopCharacter(), roll }));
        if (!res.error) emit({ type: 'talk' });
        return res;
      });
    },
    /** Ir a otra ubicación (dentro de la región siempre; entre regiones según el DM). */
    travel(locationId) {
      return serial(async () => {
        if (!state.characterId) return { error: 'Elige un personaje.' };
        const res = await mutateMarket((world) => travelTo(world, state.ctx, { charId: state.characterId, locationId, isDm: api.canControlTime }));
        if (!res.error) emit({ type: 'travel' });
        return res;
      });
    },

    // ── Herramientas del DM ──
    advancePhase() {
      return serial(async () => {
        if (!api.canControlTime) return { error: 'Sólo el DM de la campaña puede pasar el tiempo.' };
        let report = [];
        let newDay = false;
        const res = await mutateMarket((world) => {
          const out = simulatePhase(world, state.ctx);
          report = out.report;
          newDay = out.newDay;
          return out;
        });
        if (res.error) return res;
        emit({ type: newDay ? 'day' : 'phase', report });
        return { report, newDay };
      });
    },
    dm(action, params = {}) {
      return serial(async () => {
        if (!api.canControlTime) return { error: 'Sólo el DM puede hacer eso.' };
        const ctx = state.ctx;
        const base = { charId: state.characterId, ...params };
        const ops = {
          triggerEvent: (w) => triggerEvent(w, ctx, params.eventId, params.days),
          endEvent: (w) => endEvent(w, ctx, params.eventId),
          remember: (w) => talk.dmRemember(w, ctx, base),
          standing: (w) => talk.setStanding(w, ctx, base),
          freeTravel: (w) => ({ world: { ...structuredClone(w), settings: { ...w.settings, freeTravel: Boolean(params.value) } } }),
          // Revelar a este personaje un comerciante secreto o un lugar oculto.
          reveal: (w) => {
            const next = structuredClone(w);
            discover(next, state.characterId, { keeper: params.keeperId ?? null, location: params.locationId ?? null });
            return { world: next };
          },
        };
        if (action === 'completeFavor') {
          const res = await withCharacter((world, character) => talk.completeFavor(world, ctx, { ...base, character, profile: state.profile }));
          if (!res.error) emit({ type: 'talk' });
          return res;
        }
        const op = ops[action];
        if (!op) return { error: 'Acción desconocida.' };
        const res = await mutateMarket(op);
        if (!res.error) emit({ type: action === 'triggerEvent' || action === 'endEvent' ? 'market' : 'talk', report: res.report });
        return res;
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
