/**
 * Mundo Homebrew del DM → datos con el MISMO formato que los oficiales.
 *
 * Tipos: «mercader», «region», «faccion», «evento» (content/world-schema.js).
 * Con `base` (id oficial), la entrada SUSTITUYE a la oficial conservando su id:
 * así el DM puede cambiar a Gorvan sin perder la relación ni la memoria que los
 * personajes ya tienen con él. Sin `base`, se añade una entidad nueva.
 *
 * También convierte en el sentido contrario (oficial → formulario) para que el
 * editor se abra con los datos actuales cuando el DM edita algo oficial.
 */

import { productRule } from './compile.js';

const slug = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24);
const cp = (po) => Math.round((Number(po) || 0) * 100);
const po = (c) => Math.round(Number(c) || 0) / 100;
const refId = (ref) => String(ref).split(':').at(-1);

/** Id de una región/facción/evento Homebrew (el oficial si lo sustituye). */
export function worldId(ref, item) {
    return item?.base || `hb-${refId(ref)}`;
}

/** Ubicaciones que define una región Homebrew. */
export function homebrewLocations(ref, item) {
    const rid = worldId(ref, item);
    return (item?.locations ?? []).map((l) => ({ id: `${rid}-${slug(l.name)}`, name: l.name, icon: l.icon || '📍', description: l.description || '', hidden: Boolean(l.hidden) }));
}

const ATT_KEYS = { race: 'race', class: 'class', background: 'background', faction: 'faction', origin: 'origin', alignment: 'alignment' };
const normTarget = (kind, target) => (kind === 'race' ? slug(target) : String(target ?? '').trim());

function attitudeToEngine(a) {
    const effects = {};
    if (a.effect === 'refuse') effects.refuse = true;
    if (a.effect === 'unlock' && a.item) effects.unlock = [a.item];
    if (a.effect === 'share') effects.share = 0.25;
    return {
        when: { [ATT_KEYS[a.kind]]: normTarget(a.kind, a.target) },
        value: a.value,
        label: a.label || (a.value >= 0 ? 'Le caes bien por algo' : 'Algo de ti no le gusta'),
        hidden: Boolean(a.hidden),
        ...(Object.keys(effects).length ? { effects } : {}),
    };
}

function attitudeToEditor(a) {
    const [kind, raw] = Object.entries(a.when ?? {}).find(([k]) => ATT_KEYS[k]) ?? [];
    if (!kind) return null;
    const effect = a.effects?.refuse ? 'refuse' : a.effects?.unlock?.length ? 'unlock' : a.effects?.share ? 'share' : 'none';
    return { kind, target: Array.isArray(raw) ? raw[0] : raw, value: a.value ?? 0, label: a.label ?? '', hidden: Boolean(a.hidden), effect, item: a.effects?.unlock?.[0] ?? '' };
}

const modifierToEngine = (m) => ({ rule: productRule(m.product), pct: (m.pct ?? 0) / 100, label: m.label || '' });
const demandToEngine = (m) => ({ rule: productRule(m.product), mult: 1 + (m.mult ?? 0) / 100 });

/** Regla de catálogo → clave de producto (sólo las sencillas; el resto no se puede editar). */
function ruleToProduct(rule) {
    if (!rule) return null;
    if (rule.tags?.length === 1 && !rule.category) return `#${rule.tags[0]}`;
    if (rule.category && !rule.tags) {
        if (!rule.sub) return rule.category;
        if (typeof rule.sub === 'string') return `${rule.category}/${rule.sub}`;
    }
    return null;
}

function rumorsFrom(prefix, rows, region = null) {
    return (rows ?? []).map((r, i) => ({ id: `${prefix}#r${i + 1}`, topic: r.topic ?? 'personas', truth: r.truth ?? 'cierto', value: r.value ?? 'comun', text: r.text, ...(region ? { region } : {}) }));
}

// ─────────────────────────── comerciantes ───────────────────────────

function merchantFrom(ref, item, { officialKeeper, officialShop, templateShop = null, regionOf }) {
    const id = item.base && officialKeeper ? officialKeeper.id : ref;
    const t = item.traits ?? {};
    const rumors = rumorsFrom(id, item.rumors);
    const location = item.location || null;
    const lines = {};
    for (const d of item.dialogue ?? []) (lines[d.key] ??= []).push(d.text);
    const presence = item.route?.length
        ? { route: item.route.map((r) => ({ location: r.location, stay: [Math.max(1, r.days - 1), r.days + 1] })), gap: [Math.max(0, (item.gap ?? 2) - 1), (item.gap ?? 2) + 1] }
        : location ? { location } : officialKeeper?.presence ?? {};
    const region = regionOf(location ?? item.route?.[0]?.location);
    const keeper = {
        id,
        name: item.name,
        short: item.name.split(/\s+/)[0],
        title: item.title || 'Comerciante',
        portrait: item.portrait || '🧑‍💼',
        accent: officialKeeper?.accent ?? '#c9a227',
        voice: item.voice || 'default',
        bio: item.description || '',
        traits: Object.fromEntries(['greed', 'patience', 'pride', 'warmth', 'shrewdness'].map((k) => [k, (Number(t[k] ?? 5) || 0) / 10])),
        likes: item.likes ?? [],
        dislikes: item.dislikes ?? [],
        race: item.race ?? null,
        faction: item.faction ?? null,
        profession: item.profession ?? null,
        kinds: [...new Set([...(officialKeeper?.kinds ?? []), item.base ? 'modificado' : 'homebrew', ...(item.route?.length ? ['errante'] : []), ...(item.secret ? ['secreto'] : [])])],
        archetypes: item.archetypes ?? [],
        disposition: item.disposition || 0,
        secret: Boolean(item.secret),
        ...(item.floor ? { floor: item.floor } : {}),
        ...(item.requirement ? { requirement: item.requirement } : {}),
        ...(item.special ? { special: true } : {}),
        ...(item.untilFloor ? { untilFloor: item.untilFloor } : {}),
        presence,
        schedule: {
            ...(item.phases?.length ? { phases: item.phases } : {}),
            ...(item.hours ? { hours: item.hours } : {}),
            ...(item.weekdays?.length ? { weekdays: item.weekdays } : {}),
            ...(item.events?.length ? { events: item.events } : {}),
        },
        // Las actitudes que el formulario no sabe representar (por memoria, por evento…) se conservan.
        attitudes: [...(item.attitudes ?? []).map(attitudeToEngine), ...(officialKeeper?.attitudes ?? []).filter((a) => !attitudeToEditor(a))],
        reputation: {
            good: item.reputation?.good ?? 30,
            bad: item.reputation?.bad ?? -20,
            enemy: item.reputation?.enemy ?? -60,
            refuseEnemies: Boolean(item.reputation?.refuseEnemies),
            goodPct: -(item.reputation?.goodPct ?? 8) / 100,
            badPct: (item.reputation?.badPct ?? 10) / 100,
        },
        negotiation: {
            enabled: item.negotiation?.enabled !== false,
            maxDiscount: (item.negotiation?.maxDiscount ?? 30) / 100,
            ...(item.negotiation?.patience ? { patience: item.negotiation.patience } : {}),
            ...(item.negotiation?.reason ? { reason: item.negotiation.reason } : {}),
        },
        hire: { enabled: Boolean(item.hire?.enabled), minTier: item.hire?.minTier ?? 'amistoso', fee: cp(item.hire?.fee ?? 20), wage: cp(item.hire?.wage ?? 0.5), mobile: item.hire?.mobile !== false },
        lines: { ...(officialKeeper?.lines ?? {}), ...lines },
        topicLines: officialKeeper?.topicLines,
        knows: { topics: item.knows ?? [], regions: [...new Set([...(region ? [region] : []), ...(officialKeeper?.knows?.regions ?? [])])], rumors: [...(officialKeeper?.knows?.rumors ?? []).filter((r) => !String(r).includes('#r')), ...rumors.map((r) => r.id)] },
        secrets: (item.secrets ?? []).map((s, i) => ({
            id: `${id}#s${i + 1}`,
            title: s.title,
            text: s.text,
            how: s.how,
            requires: { tier: s.tier, ...(s.how === 'investigate' ? { check: { skill: s.skill, dc: s.dc } } : {}) },
            reward: { ...(s.reveals ? { reveals: s.reveals } : {}), ...(s.unlock ? { unlock: [s.unlock] } : {}) },
        })),
        favors: (item.favors ?? []).map((f, i) => ({
            id: `${id}#f${i + 1}`,
            title: f.title,
            text: f.text,
            kind: f.kind,
            ...(f.kind === 'deliver' ? { item: f.item, qty: f.qty } : {}),
            minTier: f.minTier,
            ...(f.days ? { days: f.days } : {}),
            reward: {
                rep: f.rep,
                ...(f.coins ? { coins: cp(f.coins) } : {}),
                ...(f.discount ? { discount: { pct: f.discount / 100, days: 7 } } : {}),
                ...(f.unlock ? { unlock: [f.unlock] } : {}),
            },
        })),
        gifts: (item.gifts ?? []).map((category) => ({ rule: { category }, mult: 1.5 })),
        homebrew: true,
    };
    if (officialKeeper?.disguise) keeper.disguise = officialKeeper.disguise;

    // Tienda: catálogo según el modo elegido + objetos sueltos + precios propios.
    const mode = item.catalogMode ?? (item.base ? 'original' : 'auto');
    let assortment;
    let buys;
    let rotating;
    // El catálogo «original» es el del comerciante sustituido o, en una copia, el del que se copió.
    const catalogShop = officialShop ?? templateShop;
    if (mode === 'original' && catalogShop) {
        assortment = [...(catalogShop.assortment ?? [])];
        buys = catalogShop.buys;
        rotating = catalogShop.rotating;
    } else {
        assortment = (item.sells ?? []).map((category) => ({ category, maxRarity: item.maxRarity || 'uncommon', target: 2 }));
        buys = (item.buys ?? []).map((category) => ({ category }));
    }
    if (item.homebrewItems) assortment.push({ tags: ['homebrew'], target: 1 });
    for (const a of item.addItems ?? []) assortment.push({ ids: [a.item], target: a.qty ?? 2 });
    // Sin nada en «auto», la profesión decide (compileShop).
    const useProfession = mode === 'auto' && !(item.sells ?? []).length;
    const shop = {
        ...(officialShop ?? {}),
        id: officialShop?.id ?? `${ref}/tienda`,
        name: item.shopName || officialShop?.name || `Puesto de ${item.name}`,
        kind: item.title || officialShop?.kind || 'Comerciante',
        icon: item.shopIcon || officialShop?.icon || '🏪',
        keeperId: id,
        description: officialShop?.description ?? item.description ?? '',
        specialties: mode === 'original' ? catalogShop?.specialties ?? [] : item.sells ?? [],
        cash: cp(item.cash),
        assortment: useProfession ? [] : assortment,
        addItems: useProfession ? (item.addItems ?? []).map((a) => a.item) : undefined,
        buys: buys?.length ? buys : useProfession ? [] : buys ?? [],
        rotating: mode === 'original' ? rotating : undefined,
        removeItems: (item.removeItems ?? []).map((r) => r.item),
        prices: Object.fromEntries((item.prices ?? []).map((p) => [p.item, cp(p.price)])),
        priceMod: (item.priceMod ?? 0) / 100,
        profession: item.profession ?? undefined,
        floorItems: (item.floorItems ?? []).map((r) => ({ ids: [r.item], target: r.qty ?? 2, floor: r.floor })),
        homebrew: true,
    };
    return { keeper, shop, rumors };
}

/** Comerciante oficial (+ su tienda) → datos del formulario «Comerciante». */
export function merchantToEditor(keeper, shop) {
    const t = keeper.baseTraits ?? keeper.traits ?? {};
    const sched = keeper.schedule ?? {};
    const route = keeper.presence?.route ?? [];
    return {
        name: keeper.name,
        description: keeper.bio ?? '',
        source: '',
        base: keeper.id,
        title: keeper.title ?? '',
        portrait: keeper.portrait ?? '',
        race: keeper.race ?? null,
        profession: keeper.profession ?? null,
        location: keeper.presence?.location ?? '',
        route: route.map((r) => ({ location: r.location, days: Math.round(((r.stay?.[0] ?? 2) + (r.stay?.[1] ?? 3)) / 2) })),
        gap: Math.round(((keeper.presence?.gap?.[0] ?? 1) + (keeper.presence?.gap?.[1] ?? 3)) / 2),
        secret: Boolean(keeper.secret),
        floor: keeper.floor ?? null,
        requirement: keeper.requirement ?? '',
        special: Boolean(keeper.special),
        untilFloor: keeper.untilFloor ?? null,
        floorItems: (shop?.floorItems ?? []).map((r) => ({ floor: r.floor, item: r.ids?.[0], qty: r.target ?? 2 })).filter((r) => r.item),
        faction: keeper.faction ?? null,
        archetypes: keeper.archetypes ?? [],
        traits: Object.fromEntries(Object.entries(t).map(([k, v]) => [k, Math.round(v * 10)])),
        disposition: keeper.disposition ?? 0,
        phases: sched.hours ? [] : sched.phases ?? [],
        hours: sched.hours ?? '',
        weekdays: sched.weekdays ?? [],
        events: sched.events ?? [],
        voice: keeper.voice ?? 'default',
        likes: keeper.likes ?? [],
        dislikes: keeper.dislikes ?? [],
        gifts: (keeper.gifts ?? []).map((g) => g.rule?.category).filter(Boolean),
        attitudes: (keeper.attitudes ?? []).map(attitudeToEditor).filter(Boolean),
        reputation: {
            good: keeper.reputation?.good ?? 30,
            bad: keeper.reputation?.bad ?? -20,
            enemy: keeper.reputation?.enemy ?? -60,
            refuseEnemies: Boolean(keeper.reputation?.refuseEnemies),
            goodPct: Math.round(-(keeper.reputation?.goodPct ?? -0.08) * 100),
            badPct: Math.round((keeper.reputation?.badPct ?? 0.1) * 100),
        },
        negotiation: {
            enabled: keeper.negotiation?.enabled !== false,
            maxDiscount: Math.round((keeper.negotiation?.maxDiscount ?? 0.3) * 100),
            patience: keeper.negotiation?.patience ?? 0,
            reason: keeper.negotiation?.reason ?? '',
        },
        hire: { enabled: Boolean(keeper.hire?.enabled), minTier: keeper.hire?.minTier ?? 'amistoso', fee: po(keeper.hire?.fee ?? 2000), wage: po(keeper.hire?.wage ?? 50), mobile: keeper.hire?.mobile !== false },
        shopName: shop?.name ?? '',
        shopIcon: shop?.icon ?? '',
        catalogMode: 'original',
        sells: shop?.specialties ?? [],
        maxRarity: 'uncommon',
        buys: (shop?.buys ?? []).map((b) => (b.category && !b.sub && !b.tags ? b.category : null)).filter(Boolean),
        homebrewItems: false,
        addItems: [],
        removeItems: (shop?.removeItems ?? []).map((item) => ({ item })),
        priceMod: Math.round((shop?.priceMod ?? 0) * 100),
        prices: Object.entries(shop?.prices ?? {}).map(([item, c]) => ({ item, price: po(c) })),
        cash: po(shop?.cash ?? 0),
        dialogue: Object.entries(keeper.lines ?? {}).flatMap(([key, list]) => (Array.isArray(list) ? list : [list]).map((text) => ({ key, text }))),
        knows: keeper.knows?.topics ?? [],
        rumors: [],
        secrets: (keeper.secrets ?? []).map((s) => ({ title: s.title, text: s.text, how: s.how ?? 'trust', tier: s.requires?.tier ?? 'neutral', skill: s.requires?.check?.skill ?? 'investigation', dc: s.requires?.check?.dc ?? 14, reveals: s.reward?.reveals ?? '', unlock: s.reward?.unlock?.[0] ?? '' })),
        favors: (keeper.favors ?? []).map((f) => ({ title: f.title, text: f.text, kind: f.kind ?? 'task', item: f.item ?? '', qty: f.qty ?? 1, minTier: String(f.minTier ?? 'neutral').toLowerCase(), days: f.days ?? 0, rep: f.reward?.rep ?? 10, coins: po(f.reward?.coins ?? 0), discount: Math.round((f.reward?.discount?.pct ?? 0) * 100), unlock: f.reward?.unlock?.[0] ?? '' })),
    };
}

// ─────────────────────────── regiones, facciones, eventos ───────────────────────────

function regionFrom(ref, item, official) {
    const id = worldId(ref, item);
    const locations = [...(official?.locations ?? []), ...homebrewLocations(ref, item)];
    return {
        ...(official ?? {}),
        id,
        name: item.name,
        icon: item.icon,
        description: item.description || official?.description || '',
        type: item.type || official?.type || '',
        danger: item.danger,
        floor: item.floor ?? official?.floor ?? null,
        factions: item.factions,
        races: item.races,
        resources: item.resources,
        common: item.common,
        scarce: item.scarce,
        economy: {
            kind: item.type || official?.economy?.kind || '',
            modifiers: (item.economy ?? []).map(modifierToEngine),
            demand: (item.demand ?? []).map(demandToEngine),
            restock: official?.economy?.restock ?? [],
        },
        locations,
        homebrew: true,
        base: item.base ?? null,
    };
}

export function regionToEditor(region) {
    return {
        name: region.name, description: region.description ?? '', source: '', base: region.id, icon: region.icon ?? '🗺️',
        type: region.type ?? region.economy?.kind ?? '', danger: region.danger ?? 0, floor: region.floor ?? null, factions: region.factions ?? [], races: region.races ?? [],
        resources: region.resources ?? [], common: region.common ?? [], scarce: region.scarce ?? [],
        economy: (region.economy?.modifiers ?? []).map((m) => ({ product: ruleToProduct(m.rule), pct: Math.round(m.pct * 100), label: m.label ?? '' })).filter((m) => m.product),
        demand: (region.economy?.demand ?? []).map((m) => ({ product: ruleToProduct(m.rule), mult: Math.round((m.mult - 1) * 100) })).filter((m) => m.product),
        locations: [], rumors: [],
    };
}

function factionFrom(ref, item) {
    return { id: worldId(ref, item), name: item.name, icon: item.icon, description: item.description ?? '', ideology: item.ideology ?? '', regions: item.regions ?? [], allies: item.allies ?? [], rivals: item.rivals ?? [], goods: item.goods ?? [], events: item.events ?? [], homebrew: true, base: item.base ?? null };
}

export function factionToEditor(f) {
    return { name: f.name, description: f.description ?? '', source: '', base: f.id, icon: f.icon ?? '🏳️', ideology: f.ideology ?? '', regions: f.regions ?? [], allies: f.allies ?? [], rivals: f.rivals ?? [], goods: f.goods ?? [], events: f.events ?? [] };
}

function eventFrom(ref, item, official) {
    return {
        ...(official ?? {}),
        id: worldId(ref, item),
        name: item.name,
        icon: item.icon,
        notice: item.notice || item.description || '',
        duration: [item.durationMin, item.durationMax],
        weight: item.weight,
        cooldown: item.cooldown,
        manual: item.manual,
        regions: item.regions,
        modifiers: (item.modifiers ?? []).map(modifierToEngine),
        demand: (item.demand ?? []).map(demandToEngine),
        attitudes: (item.attitudes ?? []).map(attitudeToEngine).map((a) => ({ ...a, ...(item.regions?.length === 1 ? { keepers: { region: item.regions[0] } } : {}) })),
        closes: item.closes ?? [],
        stock: (item.stock ?? []).length && item.regions?.length ? item.stock.map((s) => ({ regions: item.regions, ids: [s.item], qty: s.qty })) : official?.stock ?? [],
        homebrew: true,
        base: item.base ?? null,
    };
}

export function eventToEditor(ev) {
    return {
        name: ev.name, description: '', source: '', base: ev.id, icon: ev.icon ?? '📰', notice: ev.notice ?? '',
        durationMin: ev.duration?.[0] ?? 3, durationMax: ev.duration?.[1] ?? 6, weight: ev.weight ?? 1, cooldown: ev.cooldown ?? 15, manual: Boolean(ev.manual), regions: ev.regions ?? [],
        modifiers: (ev.modifiers ?? []).map((m) => ({ product: ruleToProduct(m.rule), pct: Math.round(m.pct * 100), label: m.label ?? '' })).filter((m) => m.product),
        demand: (ev.demand ?? []).map((m) => ({ product: ruleToProduct(m.rule), mult: Math.round((m.mult - 1) * 100) })).filter((m) => m.product),
        attitudes: (ev.attitudes ?? []).map(attitudeToEditor).filter(Boolean),
        closes: ev.closes ?? [], stock: [],
    };
}

// ─────────────────────────── ensamblado ───────────────────────────

/**
 * Une los datos oficiales con el Homebrew del ámbito (campaña o local).
 * @param {object} official { world, factions, events, keepers, shops, rumors }
 * @param {{ mercader?, region?, faccion?, evento? }} homebrew listas de { ref, item }
 */
export function assembleWorld(official, homebrew = {}) {
    // Regiones
    const regions = official.world.regions.map((r) => ({ ...r }));
    const rumors = [...official.rumors];
    for (const { ref, item } of homebrew.region ?? []) {
        const idx = item.base ? regions.findIndex((r) => r.id === item.base) : -1;
        const merged = regionFrom(ref, item, idx >= 0 ? regions[idx] : null);
        if (idx >= 0) regions[idx] = merged;
        else regions.push(merged);
        rumors.push(...rumorsFrom(merged.id, item.rumors, merged.id));
    }
    const regionOf = (loc) => regions.find((r) => (r.locations ?? []).some((l) => l.id === loc))?.id ?? null;

    // Facciones
    const factions = official.factions.map((f) => ({ ...f }));
    for (const { ref, item } of homebrew.faccion ?? []) {
        const merged = factionFrom(ref, item);
        const idx = factions.findIndex((f) => f.id === merged.id);
        if (idx >= 0) factions[idx] = { ...factions[idx], ...merged };
        else factions.push(merged);
    }

    // Eventos
    const events = official.events.map((e) => ({ ...e }));
    for (const { ref, item } of homebrew.evento ?? []) {
        const idx = item.base ? events.findIndex((e) => e.id === item.base) : -1;
        const merged = eventFrom(ref, item, idx >= 0 ? events[idx] : null);
        if (idx >= 0) events[idx] = merged;
        else events.push(merged);
    }

    // Comerciantes
    const keepers = [...official.keepers];
    const shops = [...official.shops];
    for (const { ref, item } of homebrew.mercader ?? []) {
        const ki = item.base ? keepers.findIndex((k) => k.id === item.base) : -1;
        const officialKeeper = ki >= 0 ? keepers[ki] : null;
        const si = officialKeeper ? shops.findIndex((s) => s.keeperId === officialKeeper.id) : -1;
        const templateShop = item.copyOf ? official.shops.find((s) => s.keeperId === item.copyOf) ?? null : null;
        const { keeper, shop, rumors: extra } = merchantFrom(ref, item, { officialKeeper, officialShop: si >= 0 ? shops[si] : null, templateShop, regionOf });
        if (ki >= 0) keepers[ki] = keeper;
        else keepers.push(keeper);
        if (si >= 0) shops[si] = shop;
        else shops.push(shop);
        rumors.push(...extra);
    }

    return { world: { ...official.world, regions }, factions, events, keepers, shops, rumors };
}

/** Compatibilidad: sólo comerciantes (lo usaban versiones anteriores y pruebas). */
export function homebrewMerchants(entries, { regionOf = () => null } = {}) {
    const keepers = [];
    const shops = [];
    const rumors = [];
    for (const { ref, item } of entries) {
        if (!item?.location && !item?.route?.length) continue;
        const out = merchantFrom(ref, item, { officialKeeper: null, officialShop: null, regionOf });
        keepers.push(out.keeper);
        shops.push(out.shop);
        rumors.push(...out.rumors);
    }
    return { keepers, shops, rumors };
}
