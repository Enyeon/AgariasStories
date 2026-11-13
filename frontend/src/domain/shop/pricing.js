/**
 * Modelo de precios.
 *
 * Un precio = precio de referencia × Π (1 + factor). Cada factor tiene nombre,
 * está acotado y varía de forma suave, para que el jugador pueda entender
 * POR QUÉ algo cuesta lo que cuesta ("quedan pocas unidades", "rumores de
 * guerra"...). No hay saltos aleatorios: el ruido solo existe como tendencia
 * lenta de varios días, y todo depende del día de juego, no del reloj real.
 *
 * Es la ÚNICA fuente de precios: la interfaz, las transacciones y la
 * negociación llaman a estas funciones (en el prototipo había tres fórmulas).
 */

import { smoothNoise } from './rng.js';
import { niceRound } from '../money.js';
import { getCategory, matchesRule } from './catalog.js';
import { getStockEntry, getRelation, getActiveDeal } from './state.js';
import { activeEvents, eventReaches } from './world-events.js';
import { shopRegion } from './presence.js';
import { evaluateDisposition, tierAtLeast, meetsAny } from './disposition.js';
import { createRng } from './rng.js';
import { productPopularity, sellBonus, popularityLabel } from './popularity.js';

export const LIMITS = Object.freeze({
    scarcity: 0.25, // ±25 % como máximo por escasez/exceso
    trend: 0.06, // deriva lenta del mercado
    eventTotal: 0.35, // suma de eventos acotada
    minFactor: 0.6, // nunca por debajo del 60 % del precio de referencia
    maxFactor: 1.9, // ni por encima del 190 %
    dailyMove: 0.08, // inercia: el precio de mercado se mueve como mucho un 8 % por día
});

const BASE_SELL_RATE = 0.5; // D&D: los comerciantes pagan la mitad
const OFF_SPECIALTY_SELL_RATE = 0.35;

function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
}

export { eventIntensity, activeEvents } from './world-events.js';

/** ¿Afecta esta entrada de evento a esta tienda? */
function appliesToShop(entry, shopId) {
    return !entry.shops || entry.shops.includes(shopId);
}

/** Tendencia lenta por categoría y subcategoría (±6 %), igual para todas las tiendas. */
export function marketTrend(world, item, day = world.day) {
    const slow = smoothNoise(`${world.seed}|trend|${item.category}`, day / 6) * 0.045;
    const fast = smoothNoise(`${world.seed}|trend|${item.category}|${item.sub}`, day / 3) * 0.015;
    return clamp(slow + fast, -LIMITS.trend, LIMITS.trend);
}

/**
 * Escasez: curva suave y acotada según stock/objetivo.
 *   0 → +25 %, la mitad → +8 %, objetivo → 0, el doble → −8 %.
 * Solo para objetos con existencias "normales" (no únicos ni ilimitados).
 */
export function scarcityFactor(entry) {
    if (!entry || entry.unlimited || entry.target < 2) return 0;
    const r = entry.qty / entry.target;
    return clamp((LIMITS.scarcity * (1 - r)) / (1 + r), -LIMITS.scarcity, LIMITS.scarcity);
}

function eventFactors(world, ctx, item, shopId, day) {
    const factors = [];
    const region = shopRegion(world, ctx, shopId, day);
    for (const { def, intensity } of activeEvents(world, ctx, day)) {
        if (!eventReaches(def, region)) continue;
        for (const mod of def.modifiers ?? []) {
            if (!appliesToShop(mod, shopId) || !matchesRule(item, mod.rule)) continue;
            factors.push({ key: `evento:${def.id}`, label: def.name, detail: mod.label ?? def.notice, pct: mod.pct * intensity, icon: def.icon });
        }
    }
    const total = factors.reduce((s, f) => s + f.pct, 0);
    if (Math.abs(total) > LIMITS.eventTotal) {
        const scale = LIMITS.eventTotal / Math.abs(total);
        factors.forEach((f) => { f.pct *= scale; });
    }
    return factors;
}

/** Economía de la región donde está hoy la tienda (minera, agrícola, en guerra…). */
export function regionFactors(world, ctx, item, shopId, day = world.day) {
    const regionId = shopRegion(world, ctx, shopId, day);
    const region = regionId ? ctx.regions.get(regionId) : null;
    if (!region?.economy) return [];
    const factors = [];
    for (const mod of region.economy.modifiers ?? []) {
        if (!matchesRule(item, mod.rule)) continue;
        factors.push({ key: `region:${region.id}`, label: mod.label ?? region.name, detail: region.economy.kind, pct: mod.pct, icon: region.icon ?? '🗺️' });
    }
    return factors;
}

function isSpecialty(shop, item) {
    return (shop.specialties ?? []).includes(item.category) || (shop.specialtyRules ?? []).some((rule) => matchesRule(item, rule));
}

/** Precio base del objeto en esta tienda (el DM puede fijar precios propios). */
export function basePrice(shop, item) {
    const own = Number(shop?.prices?.[item.id]);
    return Number.isFinite(own) && own > 0 ? own : item.price;
}

function trendLabel(item, pct) {
    const cat = (getCategory(item.category)?.label ?? 'estos objetos').toLowerCase();
    return pct > 0 ? `Se están pagando bien las ${cat} estos días` : `Hay poca demanda de ${cat} estos días`;
}

function scarcityLabel(entry, pct) {
    if (pct <= 0) return 'Tiene de sobra y quiere darle salida';
    if (entry.qty === 0) return 'Agotado: el próximo lote saldrá más caro';
    return entry.qty / entry.target < 0.5 ? 'Quedan muy pocas unidades' : 'Le quedan pocas existencias';
}

/**
 * Precio de mercado de una tienda (sin factores personales). Es lo que se
 * registra en el historial y lo que ve cualquiera que pregunte.
 */
function marketFactors(world, ctx, shop, item, day) {
    const keeper = ctx.keepers.get(shop.keeperId);
    const entry = getStockEntry(world, shop.id, item.id);
    const factors = [];

    const scarcity = scarcityFactor(entry);
    if (scarcity) factors.push({ key: 'escasez', label: scarcityLabel(entry, scarcity), pct: scarcity, icon: '📦' });

    const trend = marketTrend(world, item, day);
    factors.push({ key: 'tendencia', label: trendLabel(item, trend), pct: trend, icon: trend > 0 ? '📈' : '📉' });

    factors.push(...eventFactors(world, ctx, item, shop.id, day));
    factors.push(...regionFactors(world, ctx, item, shop.id, day));

    if (isSpecialty(shop, item)) {
        factors.push({ key: 'especialidad', label: 'Especialidad de la casa: lo consigue a buen precio', pct: -0.05, icon: '🏷️' });
    } else {
        factors.push({ key: 'especialidad', label: 'No es su especialidad: lo compra para revender', pct: 0.1, icon: '🏷️' });
    }

    if (shop.priceMod) factors.push({ key: 'casa', label: shop.priceMod > 0 ? 'Precios de la casa: más caros de lo normal' : 'Precios de la casa: más baratos de lo normal', pct: shop.priceMod, icon: '🏠' });

    if (keeper) {
        const margin = (keeper.traits.greed - 0.5) * 0.2;
        const label = margin > 0.02 ? `${keeper.short ?? keeper.name} no regala nada` : margin < -0.02 ? `${keeper.short ?? keeper.name} trabaja con poco margen` : `Margen habitual de ${keeper.short ?? keeper.name}`;
        factors.push({ key: 'margen', label, pct: margin, icon: '⚖️' });
    }
    return factors;
}

function combine(base, factors) {
    const product = factors.reduce((acc, f) => acc * (1 + f.pct), 1);
    return clamp(product, LIMITS.minFactor, LIMITS.maxFactor);
}

function visible(factors) {
    return factors.filter((f) => Math.abs(f.pct) >= 0.005).sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
}

/** Último precio registrado ANTES de `day` (para la inercia y la tendencia). */
function previousRecorded(world, shopId, itemId, day) {
    const history = world.shops?.[shopId]?.history?.[itemId] ?? [];
    for (let i = history.length - 1; i >= 0; i -= 1) if (history[i][0] < day) return history[i][1];
    return null;
}

/**
 * Precio de mercado con inercia: aunque los factores cambien de golpe (se
 * agotó el stock, empezó un evento), el precio se mueve como mucho un 8 % por
 * día. Así las subidas y bajadas se perciben como tendencias, no como saltos.
 * Devuelve { value, raw, factors } (value sin redondear).
 */
function marketValue(world, ctx, shop, item, day) {
    const factors = marketFactors(world, ctx, shop, item, day);
    const base = basePrice(shop, item);
    const raw = base * combine(base, factors);
    const prev = previousRecorded(world, shop.id, item.id, day);
    let value = raw;
    if (prev) value = clamp(raw, prev * (1 - LIMITS.dailyMove), prev * (1 + LIMITS.dailyMove));
    if (Math.abs(value - raw) / raw >= 0.005) {
        factors.push({
            key: 'inercia',
            label: value < raw ? 'Sigue subiendo poco a poco: mañana podría costar más' : 'Va bajando poco a poco: mañana podría costar menos',
            pct: value / raw - 1,
            icon: '⏳',
        });
    }
    return { value, raw, factors };
}

/** Precio de mercado (sin trato personal): lo que se registra en el historial. */
export function marketPrice(world, ctx, shopId, itemId, day = world.day) {
    const shop = ctx.shop(shopId);
    const item = ctx.item(itemId);
    if (!shop || !item || !getStockEntry(world, shopId, itemId)) return null;
    return niceRound(marketValue(world, ctx, shop, item, day).value);
}

const GUARANTEE_THRESHOLD = 5000; // 50 po: a partir de ahí el desconfiado pide fianza

/** ¿Parece desesperado el jugador? (último ejemplar, ya insistió hoy, o hay demanda por un evento) */
function looksDesperate(world, ctx, shopId, item, entry, charId) {
    if (entry && !entry.unlimited && entry.qty <= 1) return true;
    if (world.haggles?.[`${charId ?? '_'}|${shopId}|${item.id}|buy`]?.day === world.day) return true;
    const region = shopRegion(world, ctx, shopId);
    return activeEvents(world, ctx).some(({ def }) => eventReaches(def, region) && (def.demand ?? []).some((d) => d.mult > 1.3 && matchesRule(item, d.rule)));
}

/**
 * Factores PERSONALES (del trato con este personaje): salen de la disposición
 * y de las banderas de personalidad. Devuelve { factors, disposition, locked, refused }.
 */
export function personalFactors(world, ctx, { shop, item, entry, charId, profile, side, marketUnit = item.price }) {
    const keeper = ctx.keepers.get(shop.keeperId);
    if (!keeper) return { factors: [], disposition: null, locked: null, refused: null };
    const disposition = evaluateDisposition(world, ctx, { keeper, charId, profile });
    const rel = getRelation(world, charId, keeper.id);
    const who = keeper.short ?? keeper.name;
    const factors = [];
    const { tier } = disposition;
    const pct = side === 'buy' ? disposition.price.buyPct : disposition.price.sellPct;
    if (Math.abs(pct) >= 0.005) {
        const good = side === 'buy' ? pct < 0 : pct > 0;
        factors.push({ key: 'relacion', label: good ? `${who} te trata como ${tier.label.toLowerCase()}` : `${who} se muestra ${tier.label.toLowerCase()} contigo`, pct, icon: tier.icon });
    }
    // Reputación con la facción del comerciante (cómo le afecta lo decide cada comerciante).
    const rep = disposition.reputation;
    if (rep?.pct) factors.push({ key: 'faccion', label: rep.label, pct: side === 'buy' ? rep.pct : -rep.pct / 2, icon: rep.icon });
    if (side === 'buy' && rep?.ally && keeper.faction) {
        const goods = ctx.factions.get(keeper.faction)?.goodRules ?? [];
        if (goods.some((rule) => matchesRule(item, rule))) factors.push({ key: 'bienes-faccion', label: `Mercancía de ${ctx.factions.get(keeper.faction).name}: precio de aliado`, pct: -0.05, icon: '🤝' });
    }
    if (side === 'buy') {
        const flags = disposition.flags;
        if (flags.has('spontaneousDiscount') && tierAtLeast(tier, 'neutral') && createRng(world.seed, 'gesto', keeper.id, charId ?? '_', world.day).chance(0.3)) {
            factors.push({ key: 'gesto', label: `Hoy ${who} está de buen humor contigo`, pct: -0.05, icon: '😊' });
        }
        // Dote Artesano (reglas 2024): 20 % menos en objetos no mágicos.
        if (profile?.feats?.includes('Artesano') && item.category !== 'magicos') factors.push({ key: 'dote-artesano', label: 'Dote Artesano: sabes lo que vale', pct: -0.2, icon: '🛠️' });
        if (flags.has('loyaltyDiscount') && (rel.memory?.bought?.n ?? 0) >= 5) factors.push({ key: 'fidelidad', label: 'Descuento de cliente fiel', pct: -0.04, icon: '🎖️' });
        if (rel.discount && rel.discount.until >= world.day) factors.push({ key: 'favor', label: 'Te lo debe por el favor que le hiciste', pct: -Math.abs(rel.discount.pct), icon: '🤝' });
        if (flags.has('demandsGuarantee') && !tierAtLeast(tier, 'amistoso') && marketUnit >= GUARANTEE_THRESHOLD) {
            factors.push({ key: 'garantia', label: 'Exige una fianza: aún no se fía de ti', pct: 0.1, icon: '🧾' });
        }
        if (flags.has('exploitDesperation') && looksDesperate(world, ctx, shop.id, item, entry, charId)) {
            factors.push({ key: 'desesperacion', label: `${who} nota que lo necesitas y sube el precio`, pct: 0.12, icon: '🦊' });
        }
    } else if (rel.discount && rel.discount.until >= world.day) {
        factors.push({ key: 'favor', label: 'Te paga mejor por el favor que le hiciste', pct: Math.abs(rel.discount.pct) / 2, icon: '🤝' });
    }
    const locked = entry?.requires && !meetsAny(entry.requires, { disposition, itemId: item.id, rel }) ? (entry.lockLabel ?? 'Reservado para gente de confianza') : null;
    return { factors, disposition, locked, refused: disposition.refuses };
}

/**
 * Cotización de compra (el jugador compra a la tienda).
 * Devuelve { unit, listUnit, base, factors, entry, available, deal, trend } o null si no se vende aquí.
 */
export function quoteBuy(world, ctx, { shopId, itemId, charId = null, profile = null }) {
    const shop = ctx.shop(shopId);
    const item = ctx.item(itemId);
    const entry = getStockEntry(world, shopId, itemId);
    if (!shop || !item || !entry) return null;

    const keeper = ctx.keepers.get(shop.keeperId);
    const market = marketValue(world, ctx, shop, item, world.day);
    const factors = market.factors;
    let value = market.value;
    const personal = personalFactors(world, ctx, { shop, item, entry, charId, profile, side: 'buy', marketUnit: market.value });
    for (const f of personal.factors) {
        factors.push(f);
        value *= 1 + f.pct;
    }
    const listUnit = niceRound(value);
    const deal = getActiveDeal(world, charId, shopId, itemId, 'buy');
    const current = niceRound(market.value);
    const prev = previousRecorded(world, shopId, itemId, world.day) ?? current;

    return {
        side: 'buy',
        unit: deal ? deal.unit : listUnit,
        listUnit,
        marketUnit: current,
        base: basePrice(shop, item),
        factors: visible(factors),
        entry,
        available: entry.unlimited ? Infinity : entry.qty,
        deal,
        trend: { prev, current, dir: current > prev ? 1 : current < prev ? -1 : 0 },
        locked: personal.locked,
        refused: personal.refused,
        tier: personal.disposition?.tier ?? null,
    };
}

/** Valor de referencia de un objeto en una tienda que no lo tiene en el estante. */
function referenceValue(world, ctx, shop, item) {
    const factors = [];
    const trend = marketTrend(world, item);
    factors.push({ key: 'tendencia', label: trendLabel(item, trend), pct: trend, icon: trend > 0 ? '📈' : '📉' });
    factors.push(...eventFactors(world, ctx, item, shop.id, world.day));
    factors.push(...regionFactors(world, ctx, item, shop.id, world.day));
    const base = basePrice(shop, item);
    return { value: base * combine(base, factors), factors };
}

/**
 * Cotización de venta (el jugador vende a la tienda).
 * El vendedor paga una fracción de lo que él mismo pediría (precio de
 * referencia), así que tendencias y eventos se reflejan también al vender.
 * Devuelve { unit, ... } o { unit: null, reason } si no le interesa.
 */
export function quoteSell(world, ctx, { shopId, itemId, charId = null, profile = null }) {
    const shop = ctx.shop(shopId);
    const item = ctx.item(itemId);
    if (!shop || !item) return { unit: null, reason: 'unknown-item' };
    const accepts = (shop.buys ?? []).some((rule) => matchesRule(item, rule));
    if (!accepts) return { unit: null, reason: 'not-interested' };

    const keeper = ctx.keepers.get(shop.keeperId);
    const who = keeper?.short ?? keeper?.name ?? 'El vendedor';
    const entry = getStockEntry(world, shopId, itemId);
    const reference = entry && !entry.consigned ? { value: marketValue(world, ctx, shop, item, world.day).value } : referenceValue(world, ctx, shop, item);
    const specialty = isSpecialty(shop, item);
    const factors = [
        {
            key: 'tasa',
            label: specialty ? 'Paga la mitad de lo que él cobraría, como cualquier comerciante' : 'No es lo suyo: paga poco porque tendrá que revenderlo',
            pct: (specialty ? BASE_SELL_RATE : OFF_SPECIALTY_SELL_RATE) - 1,
            icon: '⚖️',
        },
    ];
    if (entry && !entry.unlimited && entry.target >= 2) {
        const need = scarcityFactor(entry) * 0.6;
        if (Math.abs(need) >= 0.005) factors.push({ key: 'necesidad', label: need > 0 ? 'Le hacen falta: tiene pocas en el estante' : 'Ya tiene muchas en el estante', pct: need, icon: '📦' });
    }
    if (keeper) {
        const greed = (0.5 - keeper.traits.greed) * 0.2;
        if (Math.abs(greed) >= 0.02) factors.push({ key: 'margen', label: greed < 0 ? `${who} aprieta al comprar` : `${who} paga con justicia`, pct: greed, icon: '🪙' });
    }
    // Un producto conocido en la región se paga mejor.
    const pop = productPopularity(world, item.id, shopRegion(world, ctx, shopId));
    const bonus = sellBonus(pop);
    if (bonus >= 0.01) factors.push({ key: 'popularidad', label: `${popularityLabel(pop)} en la región: lo pagan mejor`, pct: bonus, icon: '🌟' });
    const personal = personalFactors(world, ctx, { shop, item, entry, charId, profile, side: 'sell' });
    factors.push(...personal.factors);

    const product = factors.reduce((acc, f) => acc * (1 + f.pct), 1);
    const listUnit = Math.max(1, niceRound(reference.value * clamp(product, 0.1, 0.8), 'down'));
    const deal = getActiveDeal(world, charId, shopId, itemId, 'sell');
    return {
        side: 'sell',
        unit: deal ? deal.unit : listUnit,
        listUnit,
        reference: niceRound(reference.value),
        base: basePrice(shop, item),
        factors: visible(factors),
        context: visible(reference.factors ?? []),
        entry,
        deal,
        cash: world.shops[shopId]?.cash ?? 0,
        refused: personal.refused,
        tier: personal.disposition?.tier ?? null,
    };
}

/** Resumen corto y natural de los dos factores más importantes. */
export function explainBriefly(quote) {
    const top = quote.factors.filter((f) => f.key !== 'tasa').slice(0, 2);
    if (!top.length) return 'Precio habitual';
    return top.map((f) => f.label).join(' · ');
}
