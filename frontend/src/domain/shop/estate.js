/**
 * Terrenos, mejoras y negocios propios.
 *
 *   world.estate.properties[plotId] = {
 *     owner, boughtDay, paid,
 *     buildings: [buildingId],                       mejoras terminadas
 *     works: { buildingId, start, ends } | null,      obra en curso
 *     business: { name, popularity, cash, stock: { itemId: { qty, price } }, log } | null
 *   }
 *
 * La CAJA del negocio es el centro económico: ahí entran las ventas y de ahí
 * salen salarios y mantenimiento. El dueño retira lo que sobra cuando quiere,
 * en persona; nada llega solo a su bolsa (las fichas viven en su dispositivo).
 *
 * Preparado para crecer: más tipos de mejora o de negocio son datos
 * (data/shop/estate.json); los empleados se asignan a una propiedad.
 */

import { cloneWorld } from './state.js';
import { regionOfLocation } from './presence.js';
import { productPopularity, bumpProduct, bumpRenown, renown, demandMult } from './popularity.js';
import { createRng } from './rng.js';
import { pay, receiveCoins, coinsInCp, formatCp } from '../money.js';
import { takeItem, grantItem, ownedUnits } from './inventory.js';

const LOG_LIMIT = 20;
const SELL_BACK = 0.8; // al vender un terreno se recupera el 80 % de su valor

export const estateOf = (world) => world.estate?.properties ?? {};
export const propertyOf = (world, plotId) => world.estate?.properties?.[plotId] ?? null;
const plotDef = (ctx, plotId) => ctx.estate?.plots?.get(plotId) ?? null;
const building = (ctx, id) => ctx.estate?.buildings?.get(id) ?? null;

function ensureEstate(world) {
    world.estate ??= { properties: {} };
    world.estate.properties ??= {};
    return world.estate.properties;
}

function payFrom(character, amount) {
    if (!character) return { error: 'Elige un personaje.' };
    const res = pay(character.equipment.coins, amount);
    if (!res.ok) return { error: `No te alcanza: necesitas ${formatCp(amount)} (tienes ${formatCp(coinsInCp(character.equipment.coins))}).` };
    const next = structuredClone(character);
    next.equipment.coins = res.coins;
    return { character: next };
}

/** Efectos sumados de las mejoras terminadas. */
export function effectsOf(ctx, prop) {
    const out = { business: false, workshop: false, slots: 0, popularity: 0, upkeep: 0 };
    for (const id of prop?.buildings ?? []) {
        const e = building(ctx, id)?.effects ?? {};
        out.business ||= Boolean(e.business);
        out.workshop ||= Boolean(e.workshop);
        out.slots += e.slots ?? 0;
        out.popularity += e.popularity ?? 0;
        out.upkeep += e.upkeep ?? 0;
    }
    return out;
}

/** Valor de mercado: terreno + mejoras + fama del negocio. */
export function propertyValue(ctx, plotId, prop) {
    const plot = plotDef(ctx, plotId);
    if (!plot) return 0;
    let value = plot.price;
    for (const id of prop?.buildings ?? []) {
        const b = building(ctx, id);
        if (b) value += b.cost * (b.effects?.valueMult ?? 0.8);
    }
    if (prop?.business) value += Math.min(50000, (prop.business.popularity ?? 0) * 400);
    return Math.round(value);
}

/** Terrenos de un lugar con su estado (libre, tuyo, de otro). */
export function plotsAt(world, ctx, locationId, charId) {
    return [...(ctx.estate?.plots?.values() ?? [])]
        .filter((p) => p.location === locationId)
        .map((plot) => {
            const prop = propertyOf(world, plot.id);
            return { plot, prop, mine: prop?.owner === (charId ?? '_'), free: !prop?.owner, value: propertyValue(ctx, plot.id, prop) };
        });
}

/** Propiedades del personaje (en cualquier lugar). */
export function propertiesOf(world, ctx, charId) {
    return Object.entries(estateOf(world))
        .filter(([, p]) => p.owner === (charId ?? '_'))
        .map(([plotId, prop]) => ({ plot: plotDef(ctx, plotId), prop, value: propertyValue(ctx, plotId, prop), effects: effectsOf(ctx, prop) }))
        .filter((x) => x.plot);
}

function mustOwnHere(world, ctx, { charId, plotId, here, requireHere = true }) {
    const plot = plotDef(ctx, plotId);
    if (!plot) return { error: 'Ese terreno no existe.' };
    const prop = propertyOf(world, plotId);
    if (prop?.owner !== (charId ?? '_')) return { error: 'Esa propiedad no es tuya.' };
    if (requireHere && here !== undefined && here !== null && here !== plot.location) return { error: `Tienes que estar en ${ctx.location(plot.location)?.name ?? 'el lugar'} para hacer eso.` };
    return { plot, prop };
}

// ─────────────────────────── comprar y vender ───────────────────────────

export function buyPlot(world, ctx, { charId, plotId, character, here }) {
    const plot = plotDef(ctx, plotId);
    if (!plot) return { error: 'Ese terreno no existe.' };
    if (here !== undefined && here !== null && here !== plot.location) return { error: 'Para comprar un terreno hay que verlo en persona.' };
    if (propertyOf(world, plotId)?.owner) return { error: 'Ese terreno ya tiene dueño.' };
    const price = propertyValue(ctx, plotId, propertyOf(world, plotId));
    const paid = payFrom(character, price);
    if (paid.error) return paid;
    const w = cloneWorld(world);
    const props = ensureEstate(w);
    props[plotId] = { ...(props[plotId] ?? {}), owner: charId ?? '_', boughtDay: w.day, paid: price, buildings: props[plotId]?.buildings ?? [], works: null, business: props[plotId]?.business ?? null };
    bumpRenown(w, charId, regionOfLocation(ctx, plot.location), 3);
    return { world: w, character: paid.character, result: { text: `Ahora eres dueño de «${plot.name}» (${formatCp(price)}).` } };
}

/** Vender: recuperas el 80 % del valor. Antes hay que vaciar la caja y despedir a quien trabaje ahí. */
export function sellPlot(world, ctx, { charId, plotId, character, here }) {
    const own = mustOwnHere(world, ctx, { charId, plotId, here });
    if (own.error) return own;
    if ((own.prop.business?.cash ?? 0) > 0) return { error: 'Primero retira el dinero de la caja del negocio.' };
    if (Object.values(world.staff ?? {}).some((s) => s.status === 'active' && s.assignment === plotId)) return { error: 'Primero reasigna o despide a los empleados que trabajan aquí.' };
    const amount = Math.round(propertyValue(ctx, plotId, own.prop) * SELL_BACK);
    let next = structuredClone(character);
    next.equipment.coins = receiveCoins(next.equipment.coins, amount);
    // La mercancía que quedaba en el negocio vuelve a tu inventario.
    for (const [itemId, s] of Object.entries(own.prop.business?.stock ?? {})) {
        const item = ctx.item(itemId);
        if (item && s.qty > 0) next = grantItem(next, item, s.qty);
    }
    const w = cloneWorld(world);
    const props = ensureEstate(w);
    // Lo construido se queda en el terreno (el próximo comprador lo paga en el precio).
    props[plotId] = { owner: null, buildings: own.prop.buildings, works: null, business: null };
    return { world: w, character: next, result: { text: `Vendes «${own.plot.name}» por ${formatCp(amount)}.` } };
}

// ─────────────────────────── obras y mejoras ───────────────────────────

export function startWorks(world, ctx, { charId, plotId, buildingId, character, here }) {
    const own = mustOwnHere(world, ctx, { charId, plotId, here });
    if (own.error) return own;
    const b = building(ctx, buildingId);
    if (!b) return { error: 'Esa mejora no existe.' };
    if (own.prop.buildings.includes(buildingId)) return { error: 'Ya está construido.' };
    if (own.prop.works) return { error: 'Ya hay una obra en marcha.' };
    const missing = (b.requires ?? []).filter((r) => !own.prop.buildings.includes(r));
    if (missing.length) return { error: `Antes necesitas: ${missing.map((r) => building(ctx, r)?.label ?? r).join(', ')}.` };
    const paid = payFrom(character, b.cost);
    if (paid.error) return paid;
    const w = cloneWorld(world);
    const builders = Object.values(w.staff ?? {}).filter((s) => s.status === 'active' && s.role === 'constructor' && s.assignment === plotId);
    // Un constructor hábil puede reducir la obra hasta a la mitad.
    const speed = builders.reduce((acc, s) => Math.max(acc, 0.3 + s.skill * 0.2), 0);
    const days = Math.max(1, Math.round(b.days * (1 - speed)));
    w.estate.properties[plotId].works = { buildingId, start: w.day, ends: w.day + days };
    return { world: w, character: paid.character, result: { text: `Empieza la obra: ${b.label}. Terminará en ${days} día${days === 1 ? '' : 's'}${builders.length ? ' (gracias a tu constructor)' : ''}.` } };
}

// ─────────────────────────── negocio ───────────────────────────

export function openBusiness(world, ctx, { charId, plotId, name, here }) {
    const own = mustOwnHere(world, ctx, { charId, plotId, here });
    if (own.error) return own;
    if (!effectsOf(ctx, own.prop).business) return { error: 'Necesitas construir un local comercial.' };
    if (own.prop.business) return { error: 'Ya tienes un negocio aquí.' };
    const clean = String(name ?? '').trim().slice(0, 60) || `Negocio de ${own.plot.name}`;
    const w = cloneWorld(world);
    w.estate.properties[plotId].business = { name: clean, popularity: 5, cash: 0, stock: {}, log: [] };
    return { world: w, result: { text: `Abre sus puertas «${clean}».` } };
}

/** Precio de referencia de un producto en la región (base del catálogo + su fama). */
export function referencePrice(world, ctx, itemId, regionId) {
    const item = ctx.item(itemId);
    if (!item) return 0;
    const pop = productPopularity(world, itemId, regionId);
    return Math.round(item.price * (1 + Math.max(0, pop - 10) / 300));
}

/** Llevar productos del inventario al negocio. */
export function depositStock(world, ctx, { charId, plotId, itemId, qty = 1, price = null, character, here }) {
    const own = mustOwnHere(world, ctx, { charId, plotId, here });
    if (own.error) return own;
    if (!own.prop.business) return { error: 'Primero abre el negocio.' };
    const item = ctx.item(itemId);
    const n = Math.max(1, Math.trunc(Number(qty) || 1));
    if (!item || ownedUnits(character, item) < n) return { error: 'No tienes eso en el inventario.' };
    const slots = effectsOf(ctx, own.prop).slots;
    const stock = own.prop.business.stock;
    if (!stock[itemId] && Object.keys(stock).length >= slots) return { error: `No caben más productos distintos (${slots}). Construye un almacén.` };
    const taken = takeItem(character, item, n);
    if (taken.error) return taken;
    const w = cloneWorld(world);
    const s = (w.estate.properties[plotId].business.stock[itemId] ??= { qty: 0, price: null });
    s.qty += n;
    if (price !== null && price !== undefined && price !== '') s.price = Math.max(1, Math.round(Number(price)));
    s.price ??= referencePrice(world, ctx, itemId, regionOfLocation(ctx, own.plot.location));
    return { world: w, character: taken.character, result: { text: `Dejas ${n} × ${item.name} a la venta.` } };
}

export function setStockPrice(world, ctx, { charId, plotId, itemId, price }) {
    const own = mustOwnHere(world, ctx, { charId, plotId, requireHere: false });
    if (own.error) return own;
    if (!own.prop.business?.stock?.[itemId]) return { error: 'Ese producto no está a la venta.' };
    const w = cloneWorld(world);
    w.estate.properties[plotId].business.stock[itemId].price = Math.max(1, Math.round(Number(price) || 1));
    return { world: w };
}

export function withdrawStock(world, ctx, { charId, plotId, itemId, qty = null, character, here }) {
    const own = mustOwnHere(world, ctx, { charId, plotId, here });
    if (own.error) return own;
    const s = own.prop.business?.stock?.[itemId];
    const item = ctx.item(itemId);
    if (!s || !item) return { error: 'Ese producto no está a la venta.' };
    const n = Math.min(s.qty, Math.max(1, Math.trunc(Number(qty ?? s.qty))));
    const w = cloneWorld(world);
    const st = w.estate.properties[plotId].business.stock;
    st[itemId].qty -= n;
    if (st[itemId].qty <= 0) delete st[itemId];
    return { world: w, character: grantItem(character, item, n), result: { text: `Recoges ${n} × ${item.name}.` } };
}

/** Lo que la caja debe antes de que el dueño pueda retirar (salarios pendientes de su gente). */
export function reservedCash(world, plotId) {
    return Object.values(world.staff ?? {}).filter((s) => s.status === 'active' && s.assignment === plotId).reduce((acc, s) => acc + (s.owed ?? 0), 0);
}

/** Retirar ganancias de la caja (en persona). */
export function withdrawCash(world, ctx, { charId, plotId, amount = null, character, here }) {
    const own = mustOwnHere(world, ctx, { charId, plotId, here });
    if (own.error) return own;
    const cash = own.prop.business?.cash ?? 0;
    const available = Math.max(0, cash - reservedCash(world, plotId));
    const want = amount === null || amount === undefined || amount === '' ? available : Math.round(Number(amount));
    if (!(want > 0)) return { error: available ? 'Indica una cantidad.' : 'No hay ganancias disponibles para retirar.' };
    if (want > available) return { error: `Sólo puedes retirar ${formatCp(available)}: el resto cubre salarios pendientes.` };
    const next = structuredClone(character);
    next.equipment.coins = receiveCoins(next.equipment.coins, want);
    const w = cloneWorld(world);
    w.estate.properties[plotId].business.cash -= want;
    return { world: w, character: next, result: { text: `Retiras ${formatCp(want)} de la caja.` } };
}

/** Promoción pagada: sube la fama del negocio y de lo que vende en la región. */
export function promote(world, ctx, { charId, plotId, amount, character, here }) {
    const own = mustOwnHere(world, ctx, { charId, plotId, here });
    if (own.error) return own;
    if (!own.prop.business) return { error: 'Primero abre el negocio.' };
    const cost = Math.max(100, Math.round(Number(amount) || 0));
    const paid = payFrom(character, cost);
    if (paid.error) return paid;
    const w = cloneWorld(world);
    const biz = w.estate.properties[plotId].business;
    const region = regionOfLocation(ctx, own.plot.location);
    const gain = Math.min(15, Math.sqrt(cost / 100) * 2);
    biz.popularity = Math.min(100, (biz.popularity ?? 0) + gain);
    for (const itemId of Object.keys(biz.stock)) bumpProduct(w, itemId, region, gain / 2);
    biz.log = [{ day: w.day, text: `Promoción (${formatCp(cost)}): +${gain.toFixed(1)} de popularidad` }, ...(biz.log ?? [])].slice(0, LOG_LIMIT);
    return { world: w, character: paid.character, result: { text: `Pregoneros, carteles y muestras gratis: el negocio gana ${gain.toFixed(1)} de popularidad.` } };
}

// ─────────────────────────── el día a día ───────────────────────────

/**
 * Simulación diaria de las propiedades (la llama advanceDays):
 * terminan obras, se venden productos (si hay vendedor), se paga el
 * mantenimiento y crecen o se desgastan las famas.
 */
export function simulateEstate(world, ctx, report) {
    for (const [plotId, prop] of Object.entries(world.estate?.properties ?? {})) {
        if (!prop.owner) continue;
        const plot = plotDef(ctx, plotId);
        if (!plot) continue;
        const region = regionOfLocation(ctx, plot.location);
        // Obras
        if (prop.works && prop.works.ends <= world.day) {
            prop.buildings = [...new Set([...(prop.buildings ?? []), prop.works.buildingId])];
            report.push({ type: 'works-done', charId: prop.owner, plotId, buildingId: prop.works.buildingId });
            prop.works = null;
        }
        const biz = prop.business;
        if (!biz) continue;
        const fx = effectsOf(ctx, prop);
        biz.popularity = Math.max(0, Math.min(100, (biz.popularity ?? 0) * 0.995 + fx.popularity));
        // Ventas: sólo con un vendedor trabajando hoy.
        const sellers = Object.values(world.staff ?? {}).filter((s) => s.status === 'active' && s.role === 'vendedor' && s.assignment === plotId && !(s.sickUntil >= world.day));
        let revenue = 0;
        if (sellers.length) {
            const skill = Math.max(...sellers.map((s) => s.skill));
            const rng = createRng(world.seed, 'estate', plotId, world.day);
            const owner = renown(world, prop.owner, region);
            for (const [itemId, s] of Object.entries(biz.stock)) {
                const item = ctx.item(itemId);
                if (!item || s.qty <= 0) continue;
                const ref = Math.max(1, referencePrice(world, ctx, itemId, region));
                const elasticity = Math.pow(ref / Math.max(1, s.price), 1.8); // caro → se vende menos
                const expected = 0.35 * demandMult(productPopularity(world, itemId, region)) * demandMult(biz.popularity) * (0.6 + skill * 0.8) * (1 + owner / 200) * elasticity * Math.min(3, Math.sqrt(s.qty));
                const sold = Math.min(s.qty, rng.poisson(expected));
                if (sold > 0) {
                    s.qty -= sold;
                    revenue += sold * s.price;
                    bumpProduct(world, itemId, region, sold * 0.8);
                    if (s.qty <= 0) delete biz.stock[itemId];
                }
            }
            if (revenue > 0) {
                biz.popularity = Math.min(100, biz.popularity + Math.min(2, revenue / 5000));
                bumpRenown(world, prop.owner, region, Math.min(1, revenue / 10000));
                biz.log = [{ day: world.day, text: `Ventas: ${formatCp(revenue)}` }, ...(biz.log ?? [])].slice(0, LOG_LIMIT);
            }
        }
        biz.cash = Math.max(0, (biz.cash ?? 0) + revenue - fx.upkeep);
        biz.lastRevenue = revenue;
    }
}

/** ¿Está el dueño en el lugar de la propiedad? (para la interfaz) */
export function isAt(ctx, plotId, here) {
    return plotDef(ctx, plotId)?.location === here;
}
