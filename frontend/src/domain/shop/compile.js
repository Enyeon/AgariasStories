/**
 * «Compilación» de los datos del mundo: convierte la configuración de alto nivel
 * (profesiones, horarios por hora, atributos de región, mercancías de facción)
 * en el formato que ya usan precios, simulación y presencia. Así el DM configura
 * en lenguaje de juego y el motor no necesita casos especiales.
 */

import { getCategory, getSub } from './catalog.js';

/** Clave de producto → regla del catálogo: «armas», «consumibles/comida» o «#metal». */
export function productRule(key) {
    const k = String(key ?? '').trim();
    if (!k) return null;
    if (k.startsWith('#')) return { tags: [k.slice(1)] };
    const [category, sub] = k.split('/');
    return sub ? { category, sub } : { category };
}

export function productLabel(key) {
    const k = String(key ?? '');
    if (k.startsWith('#')) return k.slice(1);
    const [category, sub] = k.split('/');
    return (sub ? getSub(category, sub)?.label : getCategory(category)?.label)?.toLowerCase() ?? k;
}

const rules = (keys) => (keys ?? []).map((key) => ({ key, rule: productRule(key) })).filter((x) => x.rule);

/** Región: recursos, productos comunes/escasos y peligro → modificadores de economía. */
export function compileRegion(region) {
    const eco = region.economy ?? {};
    const modifiers = [...(eco.modifiers ?? [])];
    const restock = [...(eco.restock ?? [])];
    const demand = [...(eco.demand ?? [])];
    for (const { key, rule } of rules(region.resources)) {
        modifiers.push({ rule, pct: -0.1, label: `Recurso de la región: ${productLabel(key)}` });
        restock.push({ rule, leadMult: 0.7 });
    }
    for (const { key, rule } of rules(region.common)) {
        modifiers.push({ rule, pct: -0.05, label: `Abunda en la región: ${productLabel(key)}` });
        restock.push({ rule, qtyMult: 1.3 });
    }
    for (const { key, rule } of rules(region.scarce)) {
        modifiers.push({ rule, pct: 0.2, label: `Escasea en la región: ${productLabel(key)}` });
        restock.push({ rule, leadMult: 1.6, qtyMult: 0.5 });
        demand.push({ rule, mult: 1.3 });
    }
    const danger = Math.max(0, Math.min(5, Number(region.danger) || 0));
    if (danger >= 3) {
        const pct = 0.03 * danger;
        for (const rule of [{ category: 'armas' }, { category: 'armaduras' }, { category: 'consumibles', sub: 'pocion' }]) {
            modifiers.push({ rule, pct, label: `Región peligrosa (${danger}/5): lo que protege vale más` });
        }
    }
    return { ...region, danger, economy: { ...eco, kind: eco.kind ?? region.type ?? '', modifiers, restock, demand } };
}

/** «08:00-20:00» → franjas que se solapan con ese horario. */
export function hoursToPhases(hours, phases) {
    const m = /^\s*(\d{1,2})(?::(\d{2}))?\s*[-–a]\s*(\d{1,2})(?::(\d{2}))?\s*$/.exec(String(hours ?? ''));
    if (!m) return null;
    const from = Number(m[1]) + Number(m[2] ?? 0) / 60;
    let to = Number(m[3]) + Number(m[4] ?? 0) / 60;
    if (to <= from) to += 24;
    const out = [];
    for (const p of phases) {
        if (p.from === undefined) continue;
        const overlaps = [-24, 0, 24].some((shift) => Math.max(from, p.from + shift) < Math.min(to, p.to + shift));
        if (overlaps) out.push(p.id);
    }
    return out;
}

const pad = (n) => String(n).padStart(2, '0');
export function hoursLabel(hours) {
    const m = /^\s*(\d{1,2})(?::(\d{2}))?\s*[-–a]\s*(\d{1,2})(?::(\d{2}))?\s*$/.exec(String(hours ?? ''));
    return m ? `${pad(m[1])}:${m[2] ?? '00'} a ${pad(m[3])}:${m[4] ?? '00'}` : '';
}

/** Comerciante: comportamientos y temas de su profesión; horario por horas → franjas. */
export function compileKeeper(keeper, { professions, phases }) {
    const prof = professions.get(keeper.profession);
    let out = keeper;
    if (prof) {
        out = {
            ...out,
            flags: [...new Set([...(keeper.flags ?? []), ...(prof.flags ?? [])])],
            knows: { ...(keeper.knows ?? {}), topics: [...new Set([...(keeper.knows?.topics ?? []), ...(prof.knows ?? [])])], regions: keeper.knows?.regions ?? [] },
        };
    }
    if (keeper.schedule?.hours) {
        const ph = hoursToPhases(keeper.schedule.hours, phases);
        if (ph?.length) out = { ...out, schedule: { ...keeper.schedule, phases: ph, hoursLabel: hoursLabel(keeper.schedule.hours) } };
    }
    return out;
}

/**
 * Tienda: si no tiene catálogo propio usa el de la profesión; añade/quita
 * objetos concretos (`addItems`, `removeItems`); la facción aporta especialidad
 * y lo que compra.
 */
export function compileShop(shop, keeper, { professions, factions }) {
    const prof = professions.get(shop.profession ?? keeper?.profession);
    let out = { ...shop };
    if (prof && !shop.assortment?.length) {
        out.assortment = prof.assortment ?? [];
        out.rotating ??= prof.rotating;
        out.buys = shop.buys?.length ? shop.buys : prof.buys ?? [];
        out.specialties = shop.specialties?.length ? shop.specialties : prof.specialties ?? [];
    }
    out.assortment = [...(out.assortment ?? [])];
    if (shop.addItems?.length) out.assortment.push({ ids: shop.addItems, target: shop.addTarget ?? 2 });
    // Novedades por piso: reglas con `floor` (sólo cuentan al llegar a ese piso).
    if (shop.floorItems?.length) out.assortment.push(...shop.floorItems);
    if (shop.removeItems?.length) out.exclude = [...new Set([...(shop.exclude ?? []), ...shop.removeItems])];
    const faction = keeper?.faction ? factions.get(keeper.faction) : null;
    if (faction?.goodRules?.length) {
        out.specialtyRules = [...(shop.specialtyRules ?? []), ...faction.goodRules];
        out.buys = [...(out.buys ?? []), ...faction.goodRules];
    }
    out.buys ??= [];
    return out;
}

export function compileFaction(faction) {
    return { ...faction, goodRules: rules(faction.goods).map((x) => x.rule) };
}
