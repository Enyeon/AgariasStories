/**
 * Hospedaje: habitaciones por días en tabernas y posadas.
 *
 *   world.lodging[charId] = {
 *     shopId, keeperId, room, label, price (pc/día), start, until (último día pagado),
 *     paid, refund (0 | 0.5 | 1), furniture: [itemId], charName
 *   }
 *
 * Cada posada tiene su categoría (humilde, posada, hotel de lujo), que decide
 * qué habitaciones tiene, el precio y qué devuelve si te vas antes. En Lord 100
 * además pesa el piso: cuanto más alto, más caro (y más lujo disponible).
 *
 * El calendario de la estancia es el del mundo: los días pasan solos para la
 * estancia (no hay que marcar nada cada día). Cuando el DM (o el jugador sin
 * campaña) alquila, puede pasar esos días en el acto. Al terminar el plazo hay
 * que renovar (si alcanza el dinero) o dejar la habitación.
 *
 * Funciones puras: reciben un mundo (y un personaje) y devuelven otros nuevos.
 */

import { cloneWorld } from './state.js';
import { availability } from './presence.js';
import { pay, receiveCoins, coinsInCp, formatCp, niceRound } from '../money.js';
import { grantItem } from './inventory.js';

const hash = (text) => {
    let h = 2166136261;
    for (const ch of String(text)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    return h >>> 0;
};

const data = (ctx) => ctx.lodging ?? null;
const RICH = /puerto|ciudad|mercado|corte|celest|astral|trono|palacio/i;

/** ¿Este comerciante alquila habitaciones? (tabernas y posadas fijas, no los puestos de feria) */
export function hasLodging(ctx, shopId) {
    if (!data(ctx)) return false;
    const keeper = ctx.keeperOf(shopId);
    if (!keeper) return false;
    const prof = ctx.professions?.get(keeper.profession);
    if (!prof?.lodging) return false;
    const kinds = keeper.kinds ?? [];
    return !kinds.includes('evento') && !kinds.includes('errante') && !keeper.presence?.route;
}

/**
 * Categoría y habitaciones (con su precio) de una posada.
 * Lord 100: el piso sube el precio (+1 % por piso) y en los pisos bajos no
 * hay hoteles de lujo; las zonas ricas (puertos, ciudades, cortes) suben un nivel.
 */
export function innOf(world, ctx, shopId) {
    if (!hasLodging(ctx, shopId)) return null;
    const L = data(ctx);
    const keeper = ctx.keeperOf(shopId);
    const shop = ctx.shop(shopId);
    const h = hash(shopId);
    const floor = keeper.floor ?? null;
    const place = ctx.location?.(keeper.presence?.location)?.name ?? shop?.name ?? '';
    let tier = 1 + (h % 3);
    if (floor !== null && floor < 10) tier = Math.min(tier, 2);
    if (RICH.test(place) || RICH.test(shop?.name ?? '')) tier = Math.min(3, tier + 1);
    // Una tienda puede fijar su categoría (shop.lodgingTier = 1, 2 o 3).
    if (Number.isInteger(shop?.lodgingTier)) tier = Math.min(3, Math.max(1, shop.lodgingTier));
    const t = L.tiers.find((x) => x.id === tier) ?? L.tiers[0];
    const floorMult = floor ? 1 + floor / 100 : 1;
    const vary = 0.9 + ((h >> 8) % 26) / 100; // 0,90–1,15: no todas cobran igual
    const rooms = t.rooms.map((id) => L.rooms.find((r) => r.id === id)).filter(Boolean)
        .map((r) => ({ ...r, price: Math.max(r.id === 'basica' ? 10 : 1, niceRound(r.price * t.mult * floorMult * vary)) }));
    return { shopId, tier: t.id, label: t.label, icon: t.icon, refund: t.refund, rule: t.rule, rooms, maxDays: L.maxDays ?? 60, floor };
}

/** Estancia de un personaje, con los días que le quedan. */
export function stayOf(world, charId) {
    const s = world.lodging?.[charId ?? '_'];
    if (!s) return null;
    const left = s.until - world.day + 1;
    return { ...s, daysLeft: Math.max(0, left), expired: left <= 0, furniture: s.furniture ?? [] };
}

/** Todas las estancias (para el DM). */
export function allStays(world) {
    return Object.keys(world.lodging ?? {}).map((charId) => ({ charId, ...stayOf(world, charId) }));
}

function atInn(world, ctx, shopId, here) {
    if (here === undefined) return null;
    const keeper = ctx.keeperOf(shopId);
    const status = availability(world, ctx, keeper);
    if (!status.open) return status.reason ?? 'La posada está cerrada ahora.';
    if (status.location !== here) return 'Tienes que estar en la posada.';
    return null;
}

const shopName = (ctx, shopId) => ctx.shop(shopId)?.name ?? 'la posada';

/** Coste de una reserva (para enseñarlo antes de confirmar). */
export function quoteStay(world, ctx, { shopId, roomId, days }) {
    const inn = innOf(world, ctx, shopId);
    const room = inn?.rooms.find((r) => r.id === roomId);
    if (!room) return null;
    const n = Math.min(inn.maxDays, Math.max(1, Math.trunc(Number(days)) || 1));
    return { room, days: n, perDay: room.price, total: room.price * n, from: world.day, until: world.day + n - 1 };
}

/**
 * Alquilar una habitación. Si ya tienes una vigente en ESTA posada y es la
 * misma, se alarga (renovar); si es otra, hay que dejar la anterior.
 */
export function rentRoom(world, ctx, { shopId, roomId, days, charId, charName, character, here = undefined }) {
    if (!character || !charId) return { error: 'Elige un personaje.' };
    const inn = innOf(world, ctx, shopId);
    if (!inn) return { error: 'Aquí no se alquilan habitaciones.' };
    const closed = atInn(world, ctx, shopId, here);
    if (closed) return { error: closed };
    const q = quoteStay(world, ctx, { shopId, roomId, days });
    if (!q) return { error: 'Esa habitación no está disponible aquí.' };
    const current = stayOf(world, charId);
    const renewing = current && current.shopId === shopId && current.room === roomId;
    if (current && !renewing && !current.expired) return { error: `Ya tienes habitación en ${shopName(ctx, current.shopId)} (${current.daysLeft} día(s) más). Déjala antes de alquilar otra.` };
    if (current && !renewing && current.furniture.length) return { error: `Tienes muebles en tu habitación de ${shopName(ctx, current.shopId)}: recógelos (dejando la habitación) antes de alquilar otra.` };
    const paid = pay(character.equipment.coins, q.total);
    if (!paid.ok) return { error: `No te alcanza: ${q.days} día(s) cuestan ${formatCp(q.total)} y tienes ${formatCp(coinsInCp(character.equipment.coins))}.` };
    const w = cloneWorld(world);
    w.lodging ??= {};
    if (renewing) {
        const s = w.lodging[charId];
        // Si ya había vencido, el nuevo plazo empieza hoy.
        const from = current.expired ? w.day : s.until + 1;
        s.until = from + q.days - 1;
        s.paid += q.total;
        s.price = q.perDay;
    } else {
        w.lodging[charId] = { shopId, keeperId: ctx.keeperOf(shopId)?.id ?? null, room: roomId, label: q.room.label, price: q.perDay, start: w.day, until: q.until, paid: q.total, refund: inn.refund, furniture: [], charName: charName ?? null };
    }
    const next = structuredClone(character);
    next.equipment.coins = paid.coins;
    const until = w.lodging[charId].until;
    return { world: w, character: next, days: q.days, message: `${renewing ? 'Renovaste' : 'Alquilaste'} la habitación ${q.room.label.toLowerCase()} en ${shopName(ctx, shopId)}: ${q.days} día(s) por ${formatCp(q.total)}. Pagada hasta el día ${until}.` };
}

/**
 * Dejar la habitación: devuelve los días completos que no se usaron según la
 * regla de la posada, y los muebles colocados vuelven al inventario.
 */
export function leaveRoom(world, ctx, { charId, character }) {
    const stay = stayOf(world, charId);
    if (!stay) return { error: 'No tienes ninguna habitación alquilada.' };
    if (!character) return { error: 'Elige un personaje.' };
    const unused = Math.max(0, stay.until - world.day); // hoy cuenta como usado
    const refund = Math.floor(unused * stay.price * (stay.refund ?? 0));
    let next = structuredClone(character);
    if (refund) next.equipment.coins = receiveCoins(next.equipment.coins, refund);
    const back = [];
    for (const itemId of stay.furniture) {
        const item = ctx.item(itemId);
        if (!item) continue;
        next = grantItem(next, item, 1);
        back.push(item.name);
    }
    const w = cloneWorld(world);
    delete w.lodging[charId];
    const parts = [`Dejaste la habitación de ${shopName(ctx, stay.shopId)}.`];
    if (unused) parts.push(refund ? `Te devuelven ${formatCp(refund)} por ${unused} día(s) sin usar.` : `Los ${unused} día(s) sin usar no se devuelven (${stay.refund ? 'regla de la casa' : 'posada humilde'}).`);
    if (back.length) parts.push(`Recoges tus muebles: ${back.join(', ')}.`);
    return { world: w, character: next, refund, message: parts.join(' ') };
}
