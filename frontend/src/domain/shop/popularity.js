/**
 * Popularidad: no es un número decorativo, cambia la demanda y el precio.
 *
 * Niveles (todos 0..100):
 *  - producto POR REGIÓN: world.popularity.products[itemId][regionId]
 *  - negocio:             world.estate.properties[plotId].business.popularity
 *  - vendedor:            habilidad del empleado (staff.skill)
 *  - propietario POR REGIÓN (renombre): world.popularity.renown[charId][regionId]
 *
 * Sube al vender y con promoción; baja poco a poco si se descuida (vuelve
 * hacia su base). Un producto puede ser famoso en una región y desconocido en
 * otra.
 */

export const BASELINE = Object.freeze({ product: 10, renown: 0 });
const clamp = (v) => Math.max(0, Math.min(100, v));

function bucket(world) {
    world.popularity ??= { products: {}, renown: {} };
    world.popularity.products ??= {};
    world.popularity.renown ??= {};
    return world.popularity;
}

export function productPopularity(world, itemId, regionId) {
    return world.popularity?.products?.[itemId]?.[regionId ?? '_'] ?? BASELINE.product;
}

export function renown(world, charId, regionId) {
    return world.popularity?.renown?.[charId ?? '_']?.[regionId ?? '_'] ?? BASELINE.renown;
}

/** Sube (o baja) la popularidad de un producto en una región. Muta `world`. */
export function bumpProduct(world, itemId, regionId, amount) {
    const p = bucket(world);
    const byRegion = (p.products[itemId] ??= {});
    const key = regionId ?? '_';
    byRegion[key] = Math.round(clamp((byRegion[key] ?? BASELINE.product) + amount) * 10) / 10;
    return byRegion[key];
}

export function bumpRenown(world, charId, regionId, amount) {
    const p = bucket(world);
    const byRegion = (p.renown[charId ?? '_'] ??= {});
    const key = regionId ?? '_';
    byRegion[key] = Math.round(clamp((byRegion[key] ?? BASELINE.renown) + amount) * 10) / 10;
    return byRegion[key];
}

/** Multiplicador de demanda: 0 → ×0,5 · 10 → ×0,65 · 50 → ×1,25 · 100 → ×2. */
export const demandMult = (pop) => 0.5 + (clamp(pop) / 100) * 1.5;

/** Lo que un comerciante paga de más por un producto conocido (hasta +30 %). */
export const sellBonus = (pop) => Math.max(0, (clamp(pop) - BASELINE.product) / 90) * 0.3;

/** Cada día la fama se desgasta un poco hacia su base. Muta `world`. */
export function decayPopularity(world) {
    const p = world.popularity;
    if (!p) return;
    for (const byRegion of Object.values(p.products ?? {})) {
        for (const [r, v] of Object.entries(byRegion)) {
            byRegion[r] = Math.round((v - (v - BASELINE.product) * 0.02) * 10) / 10;
        }
    }
    for (const byRegion of Object.values(p.renown ?? {})) {
        for (const [r, v] of Object.entries(byRegion)) byRegion[r] = Math.round(v * 0.995 * 10) / 10;
    }
}

/** Etiqueta para la interfaz. */
export function popularityLabel(pop) {
    if (pop >= 80) return '🌟 Famoso';
    if (pop >= 55) return '🔥 Muy conocido';
    if (pop >= 30) return '👍 Conocido';
    if (pop >= 12) return '🙂 Algo conocido';
    return '❔ Desconocido';
}

/** Cuenta inventos vendidos por el personaje (para su progresión). Muta `world`. */
export function countInventionSale(world, charId, amount) {
    world.popularity ??= { products: {}, renown: {} };
    world.popularity.sold ??= {};
    const key = charId ?? '_';
    world.popularity.sold[key] = (world.popularity.sold[key] ?? 0) + amount;
}

/**
 * Progresión del personaje como emprendedor:
 * inventor → vendedor ocasional → comerciante → dueño de negocio → empresario reconocido.
 * Se deduce del mundo (no se guarda), así que nunca se desincroniza.
 */
export const STAGES = Object.freeze([
    { id: 'inventor', label: 'Inventor', icon: '🔧', hint: 'Vende tus inventos en tiendas que compren tecnología.' },
    { id: 'ocasional', label: 'Vendedor ocasional', icon: '🪙', hint: 'Vende 10 inventos o compra un terreno.' },
    { id: 'comerciante', label: 'Comerciante', icon: '⚖️', hint: 'Construye un local y abre tu negocio.' },
    { id: 'dueno', label: 'Dueño de negocio', icon: '🏪', hint: 'Haz famoso tu negocio y tu nombre (50+ de fama en una región).' },
    { id: 'empresario', label: 'Empresario reconocido', icon: '🏆', hint: 'Tu nombre abre puertas.' },
]);

export function entrepreneurStage(world, charId) {
    const key = charId ?? '_';
    const sold = world.popularity?.sold?.[key] ?? 0;
    const props = Object.values(world.estate?.properties ?? {}).filter((p) => p.owner === key);
    const business = props.filter((p) => p.business);
    const fame = Math.max(0, ...Object.values(world.popularity?.renown?.[key] ?? {}));
    const bizFame = Math.max(0, ...business.map((p) => p.business.popularity ?? 0));
    let i = 0;
    if (sold >= 1) i = 1;
    if (sold >= 10 || props.length) i = 2;
    if (business.length) i = 3;
    if (business.length && fame >= 50 && bizFame >= 50) i = 4;
    return { ...STAGES[i], index: i, next: STAGES[i + 1] ?? null, sold, fame };
}
