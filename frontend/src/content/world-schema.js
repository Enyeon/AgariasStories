// Contenido del MUNDO de la Tienda que crea el DM: comerciantes, regiones,
// facciones y eventos. Sólo valida forma y límites: las referencias (a una
// región, facción o ubicación) pueden apuntar a otro Homebrew de la campaña,
// así que no se comprueban aquí; el contexto de la Tienda las verifica y
// avisa en `ctx.problems` si alguna no existe.
//
// Todas las cantidades de dinero se escriben en piezas de oro (po) con
// decimales; los adaptadores (domain/shop/sources.js) las pasan a cobre.

import { CATEGORIES, RARITIES } from '../domain/shop/catalog.js';
import { PHASE_OPTIONS, ARCHETYPE_OPTIONS, RACE_FAMILY_OPTIONS, TOPIC_OPTIONS, VOICES, RUMOR_TOPIC_OPTIONS, ATTITUDE_KINDS } from '../data/shop/options.js';

export const WORLD_TYPES = Object.freeze(['mercader', 'region', 'faccion', 'evento']);

export const TIER_OPTIONS = Object.freeze({ hostil: 'Hostil', desconfiado: 'Desconfiado', neutral: 'Neutral', amistoso: 'Amistoso', favorable: 'Favorable', amigo: 'Amigo' });
export const SECRET_HOW = Object.freeze({ trust: 'Lo cuenta cuando confía', drink: 'Lo cuenta bebiendo', investigate: 'Hay que investigarlo' });
export const CHECK_SKILLS = Object.freeze({ investigation: 'Investigación', insight: 'Perspicacia', persuasion: 'Persuasión', deception: 'Engaño', intimidation: 'Intimidación' });
export const FAVOR_KINDS = Object.freeze({ deliver: 'Traer un objeto', task: 'Una tarea (la confirma el DM)' });
export const RUMOR_TRUTH = Object.freeze({ cierto: 'Cierto', parcial: 'Parcialmente cierto', exagerado: 'Exagerado', falso: 'Falso' });
export const RUMOR_VALUE = Object.freeze({ comun: 'Común', valioso: 'Valioso', secreto: 'Secreto' });
export const ATTITUDE_EFFECTS = Object.freeze({ none: 'Sólo cambia el trato', refuse: 'Se niega a comerciar', unlock: 'Le reserva un objeto', share: 'Le cuenta más cosas' });
export const CATALOG_MODES = Object.freeze({ auto: 'Según su profesión (o lo que elijas abajo)', categorias: 'Sólo las categorías que elijas abajo', original: 'Mantener el catálogo original (comerciante oficial)' });
export const DIALOGUE_KEYS = Object.freeze({
  welcome: 'Saludo', welcome_friend: 'Saludo a un amigo', welcome_cold: 'Saludo frío', welcome_hostile: 'Saludo hostil',
  greet: 'Al empezar a regatear', deal: 'Al cerrar un trato', refuse_trade: 'Al negarse a comerciar',
  rumor_share: 'Antes de contar un rumor', rumor_refuse: 'Al no querer contar nada', drink_accept: 'Al aceptar una ronda',
  gift_love: 'Al recibir un regalo que le encanta', favor_done: 'Al cumplirle un favor', closed_now: 'Cuando está cerrado',
});
export const WEEKDAY_OPTIONS = Object.freeze({ 0: 'Lunardía', 1: 'Ferrodía', 2: 'Aguadía', 3: 'Raízdía', 4: 'Fuegodía', 5: 'Mercadía', 6: 'Descanso' });

const CATEGORY_IDS = CATEGORIES.map((c) => c.id);
const RARITY_IDS = RARITIES.map((r) => r.id);

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
function str(v, max = 120) {
  if (typeof v !== 'string' && typeof v !== 'number') return '';
  // eslint-disable-next-line no-control-regex
  return String(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);
}
function num(v, min, max, fallback) {
  if (v === '' || v === null || v === undefined) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}
const int = (v, min, max, fallback) => {
  const n = num(v, min, max, fallback);
  return n === null ? null : Math.trunc(n);
};
const money = (v, max = 100000) => Math.round(num(v, 0, max, 0) * 100) / 100;
const bool = (v) => v === true || v === 'si' || v === 'true';
/** Identificador de otra entidad del mundo (oficial u Homebrew): sólo se valida la forma. */
const ID = /^[a-z0-9][a-z0-9:_/-]{0,100}$/;
const idRef = (v) => (typeof v === 'string' && ID.test(v) ? v : null);
const ids = (v, max = 30) => [...new Set((Array.isArray(v) ? v : []).map(idRef).filter(Boolean))].slice(0, max);
const pick = (v, allowed) => [...new Set((Array.isArray(v) ? v : []).map(String))].filter((x) => allowed.includes(x));
/** Clave de producto: «armas», «consumibles/comida» o «#metal». */
const PRODUCT = /^(#[a-z0-9-]{1,30}|[a-z]{3,20}(\/[a-z0-9-]{1,30})?)$/;
const products = (v, max = 20) => [...new Set((Array.isArray(v) ? v : []).map(String).filter((k) => PRODUCT.test(k)))].slice(0, max);
function rows(v, max, fn) {
  return (Array.isArray(v) ? v : []).slice(0, max).map((r) => (typeof r === 'string' ? fn({ text: r }) : isObject(r) ? fn(r) : null)).filter(Boolean);
}
const pctField = (v, min, max) => Math.round(num(v, min, max, 0)); // porcentaje entero

function attitudeRows(v) {
  return rows(v, 30, (a) => {
    if (!Object.hasOwn(ATTITUDE_KINDS, a.kind) || !str(a.target, 60)) return null;
    const value = int(a.value, -60, 60, 0);
    const effect = Object.hasOwn(ATTITUDE_EFFECTS, a.effect) ? a.effect : 'none';
    if (!value && effect === 'none') return null;
    return { kind: a.kind, target: str(a.target, 60), value, label: str(a.label, 120), hidden: bool(a.hidden), effect, item: effect === 'unlock' ? idRef(a.item) : null };
  });
}

function rumorRows(v) {
  return rows(v, 20, (r) => {
    const text = str(r.text, 400);
    if (!text) return null;
    return {
      text,
      topic: Object.hasOwn(RUMOR_TOPIC_OPTIONS, r.topic) ? r.topic : 'personas',
      truth: Object.hasOwn(RUMOR_TRUTH, r.truth) ? r.truth : 'cierto',
      value: Object.hasOwn(RUMOR_VALUE, r.value) ? r.value : 'comun',
    };
  });
}

function modifierRows(v, { field = 'pct', min = -80, max = 300 } = {}) {
  return rows(v, 20, (m) => {
    const product = PRODUCT.test(String(m.product ?? '')) ? m.product : null;
    const value = pctField(m[field], min, max);
    return product && value ? { product, [field]: value, label: str(m.label, 120) } : null;
  });
}

// ── Comerciante ──────────────────────────────────────────────────────────

export function normalizeMerchant(src, errors) {
  const route = rows(src.route, 8, (r) => (idRef(r.location) ? { location: r.location, days: int(r.days, 1, 30, 3) } : null));
  const base = idRef(src.base);
  const location = idRef(src.location);
  if (!location && !route.length && !base) errors.push('Elige dónde está el comerciante (o su ruta, si es errante).');
  const trait = (k) => int(src.traits?.[k], 0, 10, 5);
  const catalogMode = Object.hasOwn(CATALOG_MODES, src.catalogMode) ? src.catalogMode : base ? 'original' : 'auto';
  const sells = pick(src.sells, CATEGORY_IDS);
  const profession = idRef(src.profession);
  const addItems = rows(src.addItems, 40, (r) => (idRef(r.item) ? { item: r.item, qty: int(r.qty, 1, 50, 2) } : null));
  if (catalogMode === 'categorias' && !sells.length && !addItems.length && src.homebrewItems !== true) errors.push('Elige al menos una categoría o un objeto que venda.');
  if (catalogMode === 'auto' && !profession && !sells.length && !addItems.length && src.homebrewItems !== true) errors.push('Elige una profesión, categorías u objetos para su tienda.');
  const hours = str(src.hours, 20);
  if (hours && !/^\s*\d{1,2}(:\d{2})?\s*[-–]\s*\d{1,2}(:\d{2})?\s*$/.test(hours)) errors.push('El horario debe tener la forma 08:00-20:00.');
  return {
    base,
    title: str(src.title, 80),
    portrait: str(src.portrait, 8) || '🧑‍💼',
    race: Object.hasOwn(RACE_FAMILY_OPTIONS, src.race) ? src.race : null,
    profession,
    location,
    route,
    gap: int(src.gap, 0, 30, 2),
    secret: bool(src.secret),
    faction: idRef(src.faction),
    archetypes: pick(src.archetypes, Object.keys(ARCHETYPE_OPTIONS)).slice(0, 4),
    traits: { greed: trait('greed'), patience: trait('patience'), pride: trait('pride'), warmth: trait('warmth'), shrewdness: trait('shrewdness') },
    disposition: int(src.disposition, -60, 60, 0),
    phases: pick(src.phases, Object.keys(PHASE_OPTIONS)),
    hours: hours.replace(/\s+/g, ''),
    weekdays: pick((src.weekdays ?? []).map(String), Object.keys(WEEKDAY_OPTIONS)).map(Number),
    events: ids(src.events, 10),
    voice: VOICES.includes(src.voice) ? src.voice : 'default',
    likes: pick(src.likes, Object.keys(TOPIC_OPTIONS)),
    dislikes: pick(src.dislikes, Object.keys(TOPIC_OPTIONS)),
    gifts: pick(src.gifts, CATEGORY_IDS),
    attitudes: attitudeRows(src.attitudes),
    reputation: {
      good: int(src.reputation?.good, -100, 100, 30),
      bad: int(src.reputation?.bad, -100, 100, -20),
      enemy: int(src.reputation?.enemy, -100, 100, -60),
      refuseEnemies: bool(src.reputation?.refuseEnemies),
      goodPct: int(src.reputation?.goodPct, 0, 50, 8),
      badPct: int(src.reputation?.badPct, 0, 100, 10),
    },
    negotiation: {
      enabled: src.negotiation?.enabled === undefined ? true : bool(src.negotiation.enabled),
      maxDiscount: int(src.negotiation?.maxDiscount, 0, 50, 30),
      patience: int(src.negotiation?.patience, 0, 10, 0),
      reason: str(src.negotiation?.reason, 120),
    },
    hire: {
      enabled: bool(src.hire?.enabled),
      minTier: Object.hasOwn(TIER_OPTIONS, src.hire?.minTier) ? src.hire.minTier : 'amistoso',
      fee: money(src.hire?.fee ?? 20),
      wage: money(src.hire?.wage ?? 0.5, 1000),
      mobile: src.hire?.mobile === undefined ? true : bool(src.hire.mobile),
    },
    shopName: str(src.shopName, 80),
    shopIcon: str(src.shopIcon, 8) || '🏪',
    catalogMode,
    sells,
    maxRarity: RARITY_IDS.includes(src.maxRarity) ? src.maxRarity : 'uncommon',
    buys: pick(src.buys, CATEGORY_IDS),
    homebrewItems: bool(src.homebrewItems),
    addItems,
    removeItems: rows(src.removeItems, 60, (r) => (idRef(r.item) ? { item: r.item } : null)),
    priceMod: int(src.priceMod, -50, 100, 0),
    prices: rows(src.prices, 60, (r) => (idRef(r.item) && num(r.price, 0.01, 1e6, null) ? { item: r.item, price: money(r.price, 1e6) } : null)),
    cash: money(src.cash ?? 500),
    dialogue: rows(src.dialogue, 40, (r) => (Object.hasOwn(DIALOGUE_KEYS, r.key) && str(r.text, 300) ? { key: r.key, text: str(r.text, 300) } : null)),
    knows: pick(src.knows, Object.keys(RUMOR_TOPIC_OPTIONS)),
    rumors: rumorRows(src.rumors),
    secrets: rows(src.secrets, 10, (s) => {
      const title = str(s.title, 100);
      const text = str(s.text, 1000);
      if (!title || !text) return null;
      const how = Object.hasOwn(SECRET_HOW, s.how) ? s.how : 'trust';
      return {
        title, text, how,
        tier: Object.hasOwn(TIER_OPTIONS, s.tier) ? s.tier : how === 'investigate' ? 'neutral' : 'amistoso',
        skill: Object.hasOwn(CHECK_SKILLS, s.skill) ? s.skill : 'investigation',
        dc: int(s.dc, 5, 30, 14),
        reveals: idRef(s.reveals),
        unlock: idRef(s.unlock),
      };
    }),
    favors: rows(src.favors, 10, (f) => {
      const title = str(f.title, 100);
      if (!title) return null;
      const kind = Object.hasOwn(FAVOR_KINDS, f.kind) ? f.kind : 'task';
      const item = idRef(f.item);
      if (kind === 'deliver' && !item) return null;
      return {
        title, text: str(f.text, 1000), kind, item, qty: int(f.qty, 1, 50, 1),
        minTier: Object.hasOwn(TIER_OPTIONS, f.minTier) ? f.minTier : 'neutral',
        days: int(f.days, 0, 60, 0), rep: int(f.rep, 0, 50, 10), coins: money(f.coins ?? 0), discount: int(f.discount, 0, 50, 0), unlock: idRef(f.unlock),
      };
    }),
  };
}

// ── Región / territorio ──────────────────────────────────────────────────

export function normalizeRegion(src) {
  return {
    base: idRef(src.base),
    icon: str(src.icon, 8) || '🗺️',
    type: str(src.type, 60),
    danger: int(src.danger, 0, 5, 0),
    factions: ids(src.factions, 20),
    races: pick(src.races, Object.keys(RACE_FAMILY_OPTIONS)),
    resources: products(src.resources),
    common: products(src.common),
    scarce: products(src.scarce),
    economy: modifierRows(src.economy),
    demand: modifierRows(src.demand, { field: 'mult', min: -90, max: 400 }),
    locations: rows(src.locations, 20, (l) => (str(l.name, 80) ? { name: str(l.name, 80), icon: str(l.icon, 8) || '📍', description: str(l.description, 300), hidden: bool(l.hidden) } : null)),
    rumors: rumorRows(src.rumors),
  };
}

// ── Facción ──────────────────────────────────────────────────────────────

export function normalizeFaction(src) {
  return {
    base: idRef(src.base),
    icon: str(src.icon, 8) || '🏳️',
    ideology: str(src.ideology, 400),
    regions: ids(src.regions, 20),
    allies: ids(src.allies, 20),
    rivals: ids(src.rivals, 20),
    goods: products(src.goods),
    events: ids(src.events, 20),
  };
}

// ── Evento del mundo ─────────────────────────────────────────────────────

export function normalizeEvent(src, errors) {
  const min = int(src.durationMin, 1, 60, 3);
  const max = Math.max(min, int(src.durationMax, 1, 60, 6));
  const modifiers = modifierRows(src.modifiers);
  const demand = modifierRows(src.demand, { field: 'mult', min: -90, max: 400 });
  const attitudes = attitudeRows(src.attitudes);
  if (!modifiers.length && !demand.length && !attitudes.length && !(src.closes ?? []).length) errors.push('El evento debería cambiar algo: precios, demanda, actitudes o cierres.');
  return {
    base: idRef(src.base),
    icon: str(src.icon, 8) || '📰',
    notice: str(src.notice, 400),
    durationMin: min,
    durationMax: max,
    weight: int(src.weight, 0, 10, 1),
    cooldown: int(src.cooldown, 0, 120, 15),
    manual: bool(src.manual),
    regions: ids(src.regions, 20),
    modifiers,
    demand,
    attitudes,
    closes: ids(src.closes, 20),
    stock: rows(src.stock, 20, (r) => (idRef(r.item) ? { item: r.item, qty: int(r.qty, 1, 20, 1) } : null)),
  };
}
