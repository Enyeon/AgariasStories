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
import guildData from '../data/shop/guild.json';
import lodgingData from '../data/shop/lodging.json';
import { lord100Content, guildProfile, LORD100 } from '../content/lord100.js';
import { buildCatalog } from '../domain/shop/catalog.js';
import { catalogSources } from '../domain/shop/sources.js';
import { assembleWorld, merchantToEditor, regionToEditor, factionToEditor, eventToEditor, worldId } from '../domain/shop/homebrew-world.js';
import * as hiring from '../domain/shop/hiring.js';
import * as guild from '../domain/shop/guild.js';
import * as lodging from '../domain/shop/lodging.js';
import * as furniture from '../domain/shop/furniture.js';
import * as services from '../domain/shop/services.js';
import * as bank from '../domain/shop/bank.js';
import * as estate from '../domain/shop/estate.js';
import * as floors from '../domain/shop/floors.js';
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
import { playerLocation, visibleMap, merchantsAt, travel as travelTo, availability, keeperLocation, phaseOf, weekdayName, discover, isLocationVisible } from '../domain/shop/presence.js';
import { displayKeeper } from '../domain/shop/personality.js';
import { MEMORY_TYPES, DM_MEMORY_TYPES } from '../domain/shop/memory.js';
import { createRng } from '../domain/shop/rng.js';
import { computeSheet, allFeats } from '../domain/rules.js';
import { raceName, getClass, getOfficialBackground } from '../data/index.js';
import { buildProfile } from '../domain/shop/profile.js';
import { listEntries, getPack } from '../content/registry.js';
import { createMarketRepository, marketScope, sameScope } from './shop-market.js';
import { ApiError, hasSupabase } from './api.js';
import { setDisplayCurrency, currencyOf, convertCoins, formatBag, coinsInCp, formatCp, CURRENCIES } from '../domain/money.js';

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

/** Bonificadores de TODAS las habilidades, por nombre (para los exámenes del Gremio). */
export function guildSkills(character) {
  try {
    return Object.fromEntries(computeSheet(character).skills.map((s) => [s.name, s.bonus]));
  } catch {
    return {};
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
export function buildShopContext({ campaignId = null, world: worldKind = null } = {}) {
  const visible = campaignId ? (e) => e.packId === campaignId : (e) => getPack(e.packId)?.kind === 'local';
  const entries = (type) => listEntries(type).filter(visible);
  const details = campaignId ? getPack(campaignId)?.details ?? {} : {};
  // Mundo de la Tienda: el de la ficha de la campaña (o el elegido en local). Lord 100 se genera
  // con los mismos tipos que el Homebrew del DM, así que su contenido propio se suma encima.
  const kind = worldKind ?? details.world ?? 'agarias';
  const tower = kind === LORD100 ? lord100Content() : null;
  const official = tower
    ? { world: { ...worldData, regions: [], start: tower.start }, factions: [], events: [], keepers: [], shops: [], rumors: [] }
    : { world: worldData, factions: factionsData.factions, events: eventsData.events, keepers: keepersData.keepers, shops: shopsData.shops, rumors: rumorsData.rumors };
  const world = assembleWorld(official, {
    mercader: [...(tower?.mercader ?? []), ...entries('mercader')],
    region: [...(tower?.region ?? []), ...entries('region')],
    faccion: entries('faccion'),
    evento: entries('evento'),
  });
  const exists = (loc) => world.world.regions.some((r) => (r.locations ?? []).some((l) => l.id === loc));
  const start = details.startLocation && exists(details.startLocation) ? details.startLocation : world.world.start;
  const ctx = createShopContext({
    catalog: buildCatalog(catalogSources({ homebrew: entries('objeto') })),
    shops: world.shops,
    keepers: world.keepers,
    events: world.events,
    topics: topicsData.topics,
    dialogue: dialogueData,
    // El DM puede elegir en la ficha de la campaña dónde empiezan los personajes.
    world: { ...world.world, start },
    factions: world.factions,
    archetypes: personalitiesData.archetypes,
    raceFamilies: racesData.families,
    rumors: world.rumors,
    professions: professionsData.professions,
    estate: estateData,
    worldKind: kind,
    guild: tower ? { data: guildData, profile: guildProfile } : null,
    lodging: lodgingData,
  });
  return ctx;
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

  // Los importes se muestran con las monedas del sistema de la campaña.
  const syncCurrency = () => setDisplayCurrency(state.world ? floors.worldCurrency(state.world) : 'dnd');
  const emit = (change = {}) => {
    syncCurrency();
    for (const fn of listeners) fn(state, change);
  };
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

  /**
   * Relee la ficha si cambió fuera de la Tienda (otra pestaña: monedas que regaló
   * el DM, objetos añadidos a mano…). Sólo repinta si de verdad cambió.
   */
  function syncCharacter() {
    return serial(async () => {
      if (!state.characterId) return;
      const before = state.record?.updatedAt ?? null;
      // PJ de campaña: trae lo que cambió el DM (oro, objetos, PG…).
      if (state.record?.pc) await characters.refreshCopy?.(state.characterId).catch(() => null);
      await loadCharacter(state.characterId);
      if ((state.record?.updatedAt ?? null) === before) return;
      if (state.record) {
        const i = state.characters.findIndex((c) => c.id === state.characterId);
        if (i >= 0) state.characters[i] = charOption(state.record);
      }
      const scope = marketScope(state.character, homebrew?.memberships?.() ?? [], remoteEnabled, state.prefs.localWorld);
      if (state.character && !sameScope(scope, state.scope)) {
        state.ctx = contextFor(scope);
        await loadMarket(scope);
        emit({ type: 'market' });
      } else {
        emit({ type: 'character' });
      }
    });
  }

  /** Abre personaje + mercado de su ámbito + catálogo visible para él. */
  async function select(id) {
    state.dmCampaign = null;
    await loadCharacter(id);
    const scope = marketScope(state.character, homebrew?.memberships?.() ?? [], remoteEnabled, state.prefs.localWorld);
    state.ctx = contextFor(scope);
    await loadMarket(scope);
    if (id) setPref('characterId', id);
  }

  /** Cambio del mercado que sólo puede hacer el DM. */
  function dmMarket(fn) {
    return serial(async () => {
      if (!api.canControlTime) return { error: 'Sólo el DM controla la progresión por pisos.' };
      const res = await mutateMarket(fn);
      if (!res.error) emit({ type: 'market' });
      return res;
    });
  }

  const discoveredKeepers = () => state.world?.discovered?.[state.characterId ?? '_']?.keepers ?? [];

  /** Abre el mercado de una campaña como DM (sin personaje). */
  async function enterAsDm(id) {
    const m = api.dmCampaigns().find((x) => x.id === id);
    if (!m) return select(null);
    await loadCharacter(null);
    const scope = marketScope({ campaign: { id } }, [m], remoteEnabled, state.prefs.localWorld);
    state.ctx = contextFor(scope);
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
    state.ctx = contextFor(state.scope);
    await loadMarket(state.scope);
    emit({ type: 'market' });
  }

  /** Contexto del mundo de un ámbito: el de la campaña o el elegido en este dispositivo. */
  const contextFor = (scope) => buildShopContext(scope.kind === 'campaign' ? { campaignId: scope.id } : { world: scope.world ?? 'agarias' });

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

  /**
   * Lo que se anota en el registro de la campaña (sólo PJ de campaña): la
   * operación con el negocio y el importe. El resto (dinero, objetos) se deduce.
   */
  function campaignEvent(result) {
    if (!state.record?.pc) return [];
    const shop = result.ledger?.shopId ?? null;
    const shopName = shop ? (state.ctx?.shops?.get?.(shop)?.name ?? null) : null;
    const where = shopName ? ` en ${shopName}` : '';
    const day = Number.isFinite(state.world?.day) ? state.world.day : null;
    if (result.ledger) {
      const l = result.ledger;
      const what = `${l.qty > 1 ? `${l.qty} × ` : ''}${l.name}`;
      return [{ kind: l.side === 'buy' ? 'compra' : 'venta', text: `${l.side === 'buy' ? 'Compra' : 'Vende'} ${what}${where} por ${formatCp(l.total)}.`, visibility: 'privado', day, data: { item: l.itemId, qty: l.qty, total: l.total, shop } }];
    }
    const text = result.message ?? result.result?.text ?? null;
    return text ? [{ kind: 'tienda', text: String(text).slice(0, 480), visibility: 'privado', day }] : [];
  }

  /** Guarda la ficha y, si está compartida, actualiza la copia en línea. */
  async function commitCharacter(nextCharacter, events = []) {
    state.record = await characters.save(state.record, nextCharacter, { events });
    state.character = nextCharacter;
    // PJ de campaña: si el DM lo cambió a la vez, se guardó la versión combinada.
    if (state.record.remoteMerged) state.character = (await characters.open(state.record.id))?.character ?? nextCharacter;
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

  /** Opción del selector de personaje (las copias de campaña llevan su campaña). */
  const charOption = (r) => ({
    id: r.id,
    name: `${r.summary?.name || 'Personaje sin nombre'}${r.pc ? ` · 🏰 ${r.pc.campaignName || 'Campaña'}` : ''}`,
    subtitle: r.summary?.classes,
  });

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
    syncCurrency();
    const pc = state.record?.pc;
    if (pc) {
      if (state.scope.kind !== 'campaign' || state.scope.id !== pc.campaignId) return { error: 'Este PJ es de una campaña: sólo opera en el mercado de su campaña (cuando el DM apruebe tu entrada).' };
      if (pc.status === 'desvinculado') return { error: 'Este PJ ya no está vinculado a la campaña.' };
      if (pc.state === 'muerto') return { error: 'Este PJ está muerto: no puede comprar ni vender.' };
    }
    // Nunca se cobra con monedas de otro sistema: primero hay que convertirlas
    // (el jugador ve antes cómo quedan sus fondos).
    const need = coinConversion();
    if (need) return { error: `Esta campaña usa ${need.toLabel} y tus monedas están en ${need.fromLabel}. Conviértelas primero (aviso sobre la tienda).`, needsConversion: true };
    const before = state.world;
    const beforeRevision = state.revision;
    const result = await mutateMarket((world) => fn(world, shopCharacter()));
    if (result.error || !result.character) return result;
    const { skills, ...clean } = result.character;
    try {
      result.cloud = await commitCharacter(clean, campaignEvent(result));
    } catch (err) {
      // La ficha no se pudo guardar: se deshace el cambio del mercado.
      console.error('[tienda] Error al guardar la ficha', err);
      await market.save(state.scope, before, state.revision).then((rev) => { state.world = before; state.revision = rev; }).catch(() => { state.world = before; state.revision = beforeRevision; });
      return { error: err?.userMessage ?? 'No se pudo guardar el personaje. No se cobró nada.' };
    }
    state.profile = characterProfile(state.character);
    return result;
  }

  /** Conversión pendiente de la bolsa del personaje al sistema de la campaña (o null). */
  function coinConversion() {
    if (!state.character || !state.world) return null;
    const to = floors.worldCurrency(state.world);
    const bag = state.character.equipment.coins;
    if (currencyOf(bag) === to) return null;
    const res = convertCoins(bag, to);
    return { ...res, from: currencyOf(bag), to, fromLabel: CURRENCIES[currencyOf(bag)].label, toLabel: CURRENCIES[to].label };
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

    /**
     * Mantiene la ficha al día mientras la Tienda está abierta: avisos de otras
     * pestañas y comprobación al volver a esta. Devuelve la función para parar.
     */
    watchCharacter() {
      const offChanges = characters.onExternalChange?.((msg) => { if (msg.id === state.characterId) syncCharacter(); }) ?? (() => {});
      const onVisible = () => { if (document.visibilityState === 'visible') syncCharacter(); };
      document.addEventListener('visibilitychange', onVisible);
      window.addEventListener('focus', onVisible);
      return () => {
        offChanges();
        document.removeEventListener('visibilitychange', onVisible);
        window.removeEventListener('focus', onVisible);
      };
    },

    /** Relee la ficha del personaje elegido (p. ej. tras sumar monedas en otra pestaña). */
    syncCharacter,

    /** Carga la lista de personajes y abre el indicado (o el último usado). */
    async init(characterId = null) {
      state.records = await characters.list();
      state.characters = state.records.map(charOption);
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

    /** Mundo de la Tienda abierto ('agarias' | 'lord100'). */
    get worldKind() {
      return state.ctx?.worldKind ?? 'agarias';
    },
    /** Mundo del mercado de este dispositivo (sin campaña). Cada mundo guarda su propio mercado. */
    setLocalWorld(kind) {
      return serial(async () => {
        setPref('localWorld', kind === 'lord100' ? 'lord100' : 'agarias');
        if (state.scope.kind !== 'local') return { ok: true };
        await select(state.characterId);
        emit({ type: 'market' });
        return { ok: true };
      });
    },

    // ── Progresión por pisos (Lord 100) ──
    get progress() {
      return floors.progressOf(state.world);
    },
    /** Negocios por estado. Los jugadores no ven los de pisos superiores (sólo cuántos hay). */
    businesses() {
      const g = floors.businessesByState(state.world, state.ctx);
      const dm = api.canControlTime;
      const visible = (x) => !x.keeper.secret || dm || discoveredKeepers().includes(x.keeper.id);
      const clean = (list) => list.filter(visible).map((x) => ({ ...x, location: state.ctx.location(x.keeper.presence?.location)?.name ?? (x.keeper.presence?.route ? 'Errante' : '—') }));
      return {
        abierto: clean(g.abierto), especial: clean(g.especial), condicionado: clean(g.condicionado),
        cerrado: dm ? clean(g.cerrado) : [],
        bloqueado: dm ? clean(g.bloqueado) : [],
        hiddenCount: dm ? 0 : g.bloqueado.length,
      };
    },
    definedFloors: () => floors.definedFloors(state.ctx),
    /**
     * Pisos a los que se puede viajar: los alcanzados que tienen un lugar
     * (región con ese piso o el lugar «Piso N» automático de sus comerciantes).
     */
    floorStops() {
      const p = floors.progressOf(state.world);
      if (!p.enabled) return [];
      const hereRegion = state.ctx.location(here())?.regionId;
      const stops = [];
      for (const region of state.ctx.regions.values()) {
        if (!region.floor || region.floor > p.current) continue;
        const loc = (region.locations ?? []).find((l) => isLocationVisible(state.world, state.ctx, state.characterId, l.id));
        if (!loc || stops.some((s) => s.floor === region.floor)) continue;
        stops.push({ floor: region.floor, locationId: loc.id, name: region.name, here: region.id === hereRegion });
      }
      return stops.sort((a, b) => a.floor - b.floor);
    },
    /** DM: «los jugadores llegaron al piso N». Se reponen las novedades del piso. */
    setFloor(floor) {
      return dmMarket((w) => {
        const res = floors.setFloor(w, state.ctx, floor);
        return { world: reconcileWorld(res.world, state.ctx), result: res.result };
      });
    },
    setProgressEnabled(enabled) {
      return dmMarket((w) => ({ world: reconcileWorld(floors.setProgressEnabled(w, enabled).world, state.ctx) }));
    },
    setRequirementDone(keeperId, done) {
      return dmMarket((w) => floors.setRequirementDone(w, keeperId, done));
    },
    setBusinessOverride(keeperId, mode) {
      return dmMarket((w) => floors.setOverride(w, keeperId, mode));
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
        const ctx = current ? state.ctx : buildShopContext(p.kind === 'campaign' ? { campaignId: p.id } : { world: state.prefs.localWorld ?? 'agarias' });
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

    // ── Sistema monetario ──
    /** Sistema activo de la campaña: { id, label, mode ('auto'|'dnd'|'lord100'), values }. */
    get currency() {
      const id = state.world ? floors.worldCurrency(state.world) : 'dnd';
      return { ...CURRENCIES[id], mode: state.world ? floors.currencySetting(state.world) : 'auto' };
    },
    /** Cómo quedarían las monedas del personaje en el sistema de la campaña (o null si ya coinciden). */
    coinConversion,
    /** Vista previa para otro sistema (p. ej. antes de que el DM lo cambie). */
    previewConversion(to) {
      return state.character ? convertCoins(state.character.equipment.coins, to) : null;
    },
    /** El jugador confirma la conversión de SUS monedas (no cambia el valor total). */
    convertCoins() {
      return serial(async () => {
        if (!state.record) return { error: 'Elige un personaje.' };
        await loadCharacter(state.record.id);
        const need = coinConversion();
        if (!need) return { message: 'Tus monedas ya están en el sistema de la campaña.' };
        const next = structuredClone(state.character);
        next.equipment.coins = need.coins;
        try {
          await commitCharacter(next);
        } catch (err) {
          return { error: err?.userMessage ?? 'No se pudo guardar la ficha.' };
        }
        emit({ type: 'character' });
        return { message: `Monedas convertidas a ${need.toLabel}: ${formatBag(need.coins)} (mismo valor).` };
      });
    },
    /** Sólo el DM: sistema monetario de la campaña ('auto', 'dnd' o 'lord100'). */
    setCurrencyMode(mode) {
      return dmMarket((world) => floors.setCurrencyMode(world, mode));
    },

    // ── Hospedaje (tabernas y posadas) ──
    lodging: {
      /** Categoría y habitaciones de una posada (o null si no alquila). */
      inn: (shopId) => (state.ctx ? lodging.innOf(state.world, state.ctx, shopId) : null),
      quote: (shopId, roomId, days) => lodging.quoteStay(state.world, state.ctx, { shopId, roomId, days }),
      /** Estancia del personaje (con los días que le quedan). */
      stay: () => (state.world ? lodging.stayOf(state.world, state.characterId) : null),
      all: () => (api.canControlTime && state.world ? lodging.allStays(state.world) : []),
      /**
       * Alquilar o renovar. Con { advance: true } y si puedes pasar el tiempo
       * (DM o mercado de este dispositivo), los días de la estancia pasan solos.
       */
      async rent(shopId, roomId, days, { advance = false } = {}) {
        const res = await serial(async () => {
          const r = await withCharacter((world, character) => lodging.rentRoom(world, state.ctx, { shopId, roomId, days, character, charId: state.characterId, charName: charName(), here: here() }));
          if (!r.error) emit({ type: 'lodging' });
          return r;
        });
        if (res.error || !advance || !api.canControlTime) return res;
        // Se pasan los días contratados: al amanecer del siguiente, la estancia termina (renovar o irse).
        const passed = await api.advanceDays(Math.max(1, res.days));
        return { ...res, advanced: passed.error ? 0 : res.days, message: passed.error ? res.message : `${res.message} Pasan ${res.days} día(s): es el día ${state.world.day}.` };
      },
      leave() {
        return serial(async () => {
          const r = await withCharacter((world, character) => lodging.leaveRoom(world, state.ctx, { character, charId: state.characterId }));
          if (!r.error) emit({ type: 'lodging' });
          return r;
        });
      },
    },

    // ── Muebles y decoración ──
    furniture: {
      spaces: () => (state.world ? furniture.spacesOf(state.world, state.ctx, state.characterId) : []),
      list: () => (state.world ? furniture.furnitureOf(state.world, state.ctx, state.characterId, state.character) : []),
      place(itemId, spaceId) {
        return serial(async () => {
          const r = await withCharacter((world, character) => furniture.placeFurniture(world, state.ctx, { itemId, spaceId, character, charId: state.characterId }));
          if (!r.error) emit({ type: 'furniture' });
          return r;
        });
      },
      remove(itemId, spaceId) {
        return serial(async () => {
          const r = await withCharacter((world, character) => furniture.removeFurniture(world, state.ctx, { itemId, spaceId, character, charId: state.characterId }));
          if (!r.error) emit({ type: 'furniture' });
          return r;
        });
      },
    },

    // ── Servicios de los comerciantes (templo, escriba, carpintero…) ──
    shopServices: {
      of: (shopId) => (state.ctx ? services.servicesOf(state.ctx, shopId) : []),
      log: () => (state.world ? services.serviceLogOf(state.world, state.characterId) : []),
      hire(shopId, serviceId, units) {
        return serial(async () => {
          const r = await withCharacter((world, character) => services.hireShopService(world, state.ctx, { shopId, serviceId, units, character, charId: state.characterId, charName: charName(), here: here() }));
          if (!r.error) emit({ type: 'services' });
          return r;
        });
      },
    },

    // ── Cambista y banco ──
    bank: {
      isExchange: (shopId) => (state.ctx ? bank.isExchange(state.ctx, shopId) : false),
      balance: () => (state.world ? bank.bankOf(state.world, state.characterId) : { balance: 0, log: [] }),
      quote: (opts) => (state.character ? bank.quoteExchange(state.character.equipment.coins, opts) : { error: 'Elige un personaje.' }),
      exchange(shopId, opts) {
        return serial(async () => {
          const r = await withCharacter((world, character) => bank.exchangeCoins(world, state.ctx, { shopId, ...opts, character, here: here() }));
          if (!r.error) emit({ type: 'bank' });
          return r;
        });
      },
      deposit(shopId, amount) {
        return serial(async () => {
          const r = await withCharacter((world, character) => bank.deposit(world, state.ctx, { shopId, amount, character, charId: state.characterId, charName: charName(), here: here() }));
          if (!r.error) emit({ type: 'bank' });
          return r;
        });
      },
      withdraw(shopId, amount) {
        return serial(async () => {
          const r = await withCharacter((world, character) => bank.withdraw(world, state.ctx, { shopId, amount, character, charId: state.characterId, here: here() }));
          if (!r.error) emit({ type: 'bank' });
          return r;
        });
      },
    },

    // ── Gremio de aventureros (Lord 100) ──
    guild: {
      /** ¿Esta tienda es un Gremio? Devuelve su perfil, o null. */
      of: (shopId) => (state.ctx ? guild.guildOfShop(state.ctx, shopId) : null),
      ranks: () => guild.ranks(state.ctx),
      kinds: () => guild.guildData(state.ctx)?.kinds ?? [],
      minReward: (rankId) => guild.minReward(state.ctx, rankId),
      /** Todo lo que muestra el panel del Gremio para el personaje actual. */
      view(shopId) {
        const g = guild.guildOfShop(state.ctx, shopId);
        if (!g) return null;
        const isDm = api.canControlTime;
        const level = state.character?.levels?.length ?? 0;
        const license = guild.licenseOf(state.world, state.characterId);
        return {
          ...g,
          isDm,
          level,
          hasCharacter: Boolean(state.character),
          funds: state.character ? coinsInCp(state.character.equipment.coins) : 0,
          license,
          board: guild.board(state.world, state.ctx, g, { charId: state.characterId, isDm }),
          offers: guild.serviceOffers(state.world, state.ctx, g),
          hires: state.characterId ? guild.hiresOf(state.world, state.characterId).filter((h) => h.floor === g.floor) : [],
          exams: guild.ranks(state.ctx).map((r) => ({ ...r, ...guild.evaluationEligibility(state.world, state.ctx, { charId: state.characterId, rankId: r.id, level }) })),
          holders: isDm ? guild.licenseHolders(state.world) : [],
        };
      },
      evaluation: (rankId) => guild.evaluationFor(state.world, state.ctx, { charId: state.characterId, rankId }),
      takeEvaluation(shopId, rankId, { answers, approach, rolls }) {
        return serial(async () => {
          const res = await withCharacter((world, character) => guild.takeEvaluation(world, state.ctx, {
            shopId, rankId, answers, approach, rolls, character, charId: state.characterId, charName: charName(),
            skills: guildSkills(state.character), level: state.character?.levels?.length ?? 0, here: here(),
          }));
          if (!res.error) emit({ type: 'guild' });
          return res;
        });
      },
      publish(shopId, form) {
        return serial(async () => {
          const res = await withCharacter((world, character) => guild.publishQuest(world, state.ctx, { shopId, form, character, charId: state.characterId, charName: charName(), here: here() }));
          if (!res.error) emit({ type: 'guild' });
          return res;
        });
      },
      accept(shopId, questId) {
        return serial(async () => {
          if (!state.characterId) return { error: 'Elige un personaje.' };
          const res = await mutateMarket((world) => guild.acceptQuest(world, state.ctx, { shopId, questId, charId: state.characterId, charName: charName(), here: here() }));
          if (!res.error) emit({ type: 'guild' });
          return res;
        });
      },
      abandon(questId) {
        return serial(async () => {
          const res = await mutateMarket((world) => guild.abandonQuest(world, state.ctx, { questId, charId: state.characterId }));
          if (!res.error) emit({ type: 'guild' });
          return res;
        });
      },
      resolve(questId, outcome) {
        return serial(async () => {
          const res = await mutateMarket((world) => guild.resolveQuest(world, state.ctx, { questId, outcome, charId: state.characterId, isDm: api.canControlTime }));
          if (!res.error) emit({ type: 'guild' });
          return res;
        });
      },
      cancel(questId) {
        return serial(async () => {
          // Con personaje, el depósito vuelve a su bolsa en el acto; sin él (el DM), queda para cobrar.
          const res = state.record
            ? await withCharacter((world, character) => guild.cancelQuest(world, state.ctx, { questId, charId: state.characterId, character, isDm: api.canControlTime }))
            : await mutateMarket((world) => guild.cancelQuest(world, state.ctx, { questId, charId: null, isDm: api.canControlTime }));
          if (!res.error) emit({ type: 'guild' });
          return res;
        });
      },
      claim(questId) {
        return serial(async () => {
          const res = await withCharacter((world, character) => guild.claimQuest(world, state.ctx, { questId, character, charId: state.characterId, charName: charName() }));
          if (!res.error) emit({ type: 'guild' });
          return res;
        });
      },
      hire(shopId, offerId, units) {
        return serial(async () => {
          const res = await withCharacter((world, character) => guild.hireService(world, state.ctx, { shopId, offerId, units, character, charId: state.characterId, charName: charName(), here: here() }));
          if (!res.error) emit({ type: 'guild' });
          return res;
        });
      },
      /** Sólo el DM: conceder, cambiar o retirar el rango de un aventurero. */
      setRank(charId, rankId, charName = null, floor = null) {
        return serial(async () => {
          if (!api.canControlTime) return { error: 'Sólo el DM concede o retira licencias.' };
          const res = await mutateMarket((world) => guild.setLicenseRank(world, state.ctx, { charId, rankId, charName, floor }));
          if (!res.error) emit({ type: 'guild' });
          return res;
        });
      },
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
    map: (opts = {}) => visibleMap(state.world, state.ctx, state.characterId, opts),
    /**
     * Viajar por pisos: pisos alcanzados con alguna zona visible, agrupados por
     * gran región, y el piso donde está el personaje. null si no hay pisos.
     */
    mapFloors() {
      const p = floors.progressOf(state.world);
      if (!p.enabled) return null;
      const byFloor = new Map();
      let other = false;
      for (const region of state.ctx.regions.values()) {
        const visible = (region.locations ?? []).some((l) => isLocationVisible(state.world, state.ctx, state.characterId, l.id));
        if (!visible) continue;
        if (!region.floor) { other = true; continue; }
        if (region.floor <= p.current && !byFloor.has(region.floor)) byFloor.set(region.floor, { floor: region.floor, group: region.group || '', name: region.name, type: region.type || '' });
      }
      const hereFloor = state.ctx.regions.get(state.ctx.location(here())?.regionId)?.floor ?? null;
      return { floors: [...byFloor.values()].sort((a, b) => a.floor - b.floor), other, hereFloor, current: p.current };
    },
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
        return { keeper: displayKeeper(keeper, rels[keeper.id]), location: loc ? state.ctx.location(loc) : null, status: availability(state.world, state.ctx, keeper, { charId: state.characterId }), tier: disposition.tier };
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
      const status = availability(state.world, state.ctx, keeper, { charId: state.characterId });
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
