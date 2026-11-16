/**
 * Servicios de un comerciante: lo que hace POR ti en vez de venderte un objeto
 * (curar en el templo, copiar un conjuro, reparar un carro…). Vienen de su
 * profesión (`professions.json` → services) y se pagan por adelantado; el
 * efecto lo narra el DM. Queda constancia en `world.serviceLog` (podado).
 *
 * En Lord 100 el precio sube con el piso (+1 % por piso), como el hospedaje.
 */

import { cloneWorld } from './state.js';
import { availability } from './presence.js';
import { pay, coinsInCp, formatCp, niceRound } from '../money.js';

export const SERVICE_LOG_LIMIT = 100;

/** Servicios que ofrece una tienda (con el precio del piso). */
export function servicesOf(ctx, shopId) {
    const keeper = ctx.keeperOf(shopId);
    const list = ctx.professions?.get(keeper?.profession)?.services ?? [];
    const mult = keeper?.floor ? 1 + keeper.floor / 100 : 1;
    return list.map((s) => ({ ...s, price: Math.max(1, niceRound(s.price * mult)) }));
}

/** Contratar un servicio (unidades: días, encargos o niveles de conjuro). */
export function hireShopService(world, ctx, { shopId, serviceId, units = 1, charId, charName, character, here = undefined }) {
    if (!character) return { error: 'Elige un personaje.' };
    const svc = servicesOf(ctx, shopId).find((s) => s.id === serviceId);
    if (!svc) return { error: 'Aquí no ofrecen ese servicio.' };
    if (here !== undefined) {
        const status = availability(world, ctx, ctx.keeperOf(shopId));
        if (!status.open) return { error: status.reason ?? 'Está cerrado.' };
        if (status.location !== here) return { error: 'Tienes que estar allí.' };
    }
    const n = Math.min(svc.unit === 'nivel' ? 9 : 30, Math.max(1, Math.trunc(Number(units)) || 1));
    const total = svc.price * n;
    const paid = pay(character.equipment.coins, total);
    if (!paid.ok) return { error: `Cuesta ${formatCp(total)} y tienes ${formatCp(coinsInCp(character.equipment.coins))}.` };
    const w = cloneWorld(world);
    w.serviceLog = [...(w.serviceLog ?? []), { day: w.day, shopId, serviceId, label: svc.label, units: n, unit: svc.unit, total, charId, charName }].slice(-SERVICE_LOG_LIMIT);
    const next = structuredClone(character);
    next.equipment.coins = paid.coins;
    const shop = ctx.shop(shopId)?.name ?? 'el comerciante';
    return { world: w, character: next, message: `${svc.label}: pagaste ${formatCp(total)} en ${shop}. El DM narra el resultado.` };
}

/** Encargos de un personaje (los más recientes primero). */
export function serviceLogOf(world, charId) {
    return (world.serviceLog ?? []).filter((x) => x.charId === charId).reverse();
}
