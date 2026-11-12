/**
 * Contratación de comerciantes (primera versión, preparada para crecer).
 *
 * Por qué funciona así:
 *  - Las fichas viven en el dispositivo de cada jugador; el mercado (compartido)
 *    no puede tocar una bolsa mientras su dueño no está. Por eso el contrato
 *    lleva un SALDO: cada día suma beneficios y resta salario y gastos, y el
 *    jugador lo liquida cuando visita a su empleado (cobra o paga).
 *  - El contrato vive en `world.contracts[keeperId]` (un comerciante trabaja
 *    para un solo patrón). Nada se duplica: tienda, inventario y precios siguen
 *    siendo los del comerciante; el contrato sólo añade dónde trabaja, qué
 *    productos extra vende y las cuentas.
 *
 * Puntos de extensión: `employer.type` (hoy 'character'; mañana 'faction' u
 * organización), `location` (hoy cualquier lugar conocido; mañana una propiedad
 * del jugador), `products` (catálogo extra), `upkeep` (gastos del local).
 */

import { cloneWorld, ensureRelation } from './state.js';
import { evaluateDisposition, tierAtLeast } from './disposition.js';
import { availability, keeperLocation, isLocationVisible } from './presence.js';
import { remember } from './memory.js';
import { productRule, productLabel } from './compile.js';
import { pay, receiveCoins, coinsInCp, formatCp } from '../money.js';

export const HIRE_DEFAULTS = Object.freeze({ enabled: false, minTier: 'amistoso', fee: 2000, wage: 50, mobile: true, share: 0.5, margin: 0.25, upkeep: 10 });
const LOG_DAYS = 14;
const MAX_DEBT_DAYS = 14;

const who = (k) => k.short ?? k.name;
const cfgOf = (keeper) => ({ ...HIRE_DEFAULTS, ...(keeper?.hire ?? {}) });

export function contractOf(world, keeperId) {
    const c = world.contracts?.[keeperId];
    return c?.status === 'active' ? c : null;
}

/** Condiciones para contratar a este comerciante (y por qué no, si no se puede). */
export function hireTerms(world, ctx, { keeper, charId, profile }) {
    const cfg = cfgOf(keeper);
    const base = { fee: cfg.fee, wage: cfg.wage, share: cfg.share, mobile: cfg.mobile, minTier: cfg.minTier, upkeep: cfg.upkeep };
    if (!cfg.enabled) return { ...base, available: false, reason: `${who(keeper)} no trabaja para nadie más que para sí mismo.` };
    const current = contractOf(world, keeper.id);
    if (current && current.charId !== (charId ?? '_')) return { ...base, available: false, reason: 'Ya trabaja para otra persona.' };
    if (current) return { ...base, available: false, hired: true, reason: 'Ya trabaja para ti.' };
    const disposition = evaluateDisposition(world, ctx, { keeper, charId, profile });
    if (disposition.refuses) return { ...base, available: false, reason: disposition.refuses };
    if (!tierAtLeast(disposition.tier, cfg.minTier)) return { ...base, available: false, reason: `Sólo trabajaría para alguien de su confianza (necesita una relación ${cfg.minTier}).` };
    return { ...base, available: true };
}

/** Contratar: paga la prima, fija el lugar de trabajo y abre las cuentas. */
export function hire(world, ctx, { charId, keeperId, profile, character, location = null, here = undefined }) {
    const keeper = ctx.keepers.get(keeperId);
    if (!keeper) return { error: 'Ese comerciante no existe.' };
    if (!character) return { error: 'Elige un personaje.' };
    if (here !== undefined && here !== null) {
        const status = availability(world, ctx, keeper);
        if (status.location !== here || !status.open) return { error: `Tienes que hablar con ${who(keeper)} en persona.` };
    }
    const terms = hireTerms(world, ctx, { keeper, charId, profile });
    if (!terms.available) return { error: terms.reason };
    if (location && !terms.mobile) return { error: `${who(keeper)} no quiere mudarse.` };
    if (location && !isLocationVisible(world, ctx, charId, location)) return { error: 'No conoces ese lugar.' };
    const paid = pay(character.equipment.coins, terms.fee);
    if (!paid.ok) return { error: `La prima de contratación es ${formatCp(terms.fee)} y no te alcanza (tienes ${formatCp(coinsInCp(character.equipment.coins))}).` };
    const next = structuredClone(character);
    next.equipment.coins = paid.coins;
    const w = cloneWorld(world);
    w.contracts ??= {};
    const home = keeperLocation(world, ctx, keeper);
    w.contracts[keeper.id] = {
        status: 'active',
        charId: charId ?? '_',
        employer: { type: 'character', id: charId ?? '_' },
        since: w.day,
        home,
        location: location && location !== home ? location : null,
        wage: terms.wage,
        share: terms.share,
        margin: cfgOf(keeper).margin,
        upkeep: location && location !== home ? terms.upkeep : 0,
        products: [],
        balance: 0,
        log: [],
        lastSettled: w.day,
    };
    ensureRelation(w, charId, keeper.id);
    remember(w, ctx, charId, keeper, 'hired');
    return { world: w, character: next, result: { lines: [{ who: 'keeper', text: `Trato hecho. Desde hoy trabajo para ti${location && location !== home ? ` en ${ctx.location(location)?.name}` : ''}.`, tone: 'good' }] } };
}

/** Catálogo extra que el patrón pide vender (claves de producto). */
export function setProducts(world, ctx, { charId, keeperId, products = [] }) {
    const c = contractOf(world, keeperId);
    if (!c || c.charId !== (charId ?? '_')) return { error: 'No trabaja para ti.' };
    const w = cloneWorld(world);
    w.contracts[keeperId].products = [...new Set(products.filter((k) => productRule(k)))].slice(0, 8);
    return { world: w };
}

/** Reglas de catálogo que añade el contrato a la tienda (las usa reconcileWorld). */
export function contractAssortment(world, keeperId) {
    const c = contractOf(world, keeperId);
    return (c?.products ?? []).map((key) => ({ ...productRule(key), maxRarity: 'uncommon', target: 2 }));
}

/**
 * Cuentas del día (lo llama la simulación diaria): beneficio = ventas × margen
 * × parte del patrón; gastos = salario + local. Si la deuda se acumula, renuncia.
 */
export function accrueContracts(world, ctx, report) {
    for (const [keeperId, c] of Object.entries(world.contracts ?? {})) {
        if (c.status !== 'active') continue;
        const keeper = ctx.keepers.get(keeperId);
        const shop = ctx.shopOf(keeperId);
        const revenue = world.shops?.[shop?.id]?.revenue ?? 0;
        const profit = Math.round(revenue * (c.margin ?? 0.25) * (c.share ?? 0.5));
        const costs = (c.wage ?? 0) + (c.upkeep ?? 0);
        c.balance += profit - costs;
        c.log = [{ day: world.day, profit, costs }, ...(c.log ?? [])].slice(0, LOG_DAYS);
        if (c.balance < -(c.wage ?? 0) * MAX_DEBT_DAYS) {
            c.status = 'quit';
            c.endedDay = world.day;
            remember(world, ctx, c.charId === '_' ? null : c.charId, keeper, 'promise-broken', { note: 'No le pagaste el salario' });
            report.push({ type: 'contract-quit', keeperId, charId: c.charId });
        }
    }
}

/** Liquidar: cobras los beneficios o pagas lo que debes. */
export function settle(world, ctx, { charId, keeperId, character }) {
    const c = contractOf(world, keeperId);
    if (!c || c.charId !== (charId ?? '_')) return { error: 'No trabaja para ti.' };
    if (!character) return { error: 'Elige un personaje.' };
    if (!c.balance) return { error: 'Las cuentas ya están al día.' };
    const next = structuredClone(character);
    if (c.balance > 0) next.equipment.coins = receiveCoins(next.equipment.coins, c.balance);
    else {
        const paid = pay(next.equipment.coins, -c.balance);
        if (!paid.ok) return { error: `Le debes ${formatCp(-c.balance)} y no te alcanza.` };
        next.equipment.coins = paid.coins;
    }
    const w = cloneWorld(world);
    const amount = c.balance;
    w.contracts[keeperId].balance = 0;
    w.contracts[keeperId].lastSettled = w.day;
    return { world: w, character: next, result: { amount, text: amount > 0 ? `Cobras ${formatCp(amount)} de beneficios.` : `Pagas ${formatCp(-amount)} de salarios y gastos.` } };
}

/** Despedir (antes hay que saldar la deuda, si la hay). Vuelve a su sitio. */
export function dismiss(world, ctx, { charId, keeperId }) {
    const c = contractOf(world, keeperId);
    if (!c || c.charId !== (charId ?? '_')) return { error: 'No trabaja para ti.' };
    if (c.balance < 0) return { error: `Antes de despedirle, págale lo que le debes (${formatCp(-c.balance)}).` };
    if (c.balance > 0) return { error: 'Primero cobra los beneficios pendientes.' };
    const w = cloneWorld(world);
    w.contracts[keeperId] = { ...c, status: 'ended', endedDay: w.day };
    return { world: w };
}

/** Contratos del personaje (para la vista). */
export function contractsOf(world, ctx, charId) {
    return Object.entries(world.contracts ?? {})
        .filter(([, c]) => c.charId === (charId ?? '_') && c.status === 'active')
        .map(([keeperId, c]) => {
            const keeper = ctx.keepers.get(keeperId);
            const loc = keeperLocation(world, ctx, keeper);
            return { keeperId, keeper, contract: c, location: ctx.location(loc), products: (c.products ?? []).map((k) => ({ key: k, label: productLabel(k) })) };
        })
        .filter((x) => x.keeper);
}
