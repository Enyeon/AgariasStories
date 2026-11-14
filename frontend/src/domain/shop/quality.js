/**
 * Calidad de fabricación: Tosca, Estándar, Fina, Obra maestra.
 *
 * Es independiente de la RAREZA (Común … Único) y las dos cuentan:
 *   - la rareza dice lo difícil que es encontrar el objeto (y su precio base);
 *   - la calidad, lo bien hecho que está: multiplica ese precio y da un efecto
 *     pequeño y NO mágico (no se acumula con bonos mágicos).
 *
 * Sólo tienen calidad las armas (no la munición), las armaduras y las
 * herramientas/instrumentos. Cada calidad distinta de la estándar es una
 * variante del catálogo con id `<base>~<calidad>`, así el stock, los precios,
 * el inventario y la venta funcionan igual que con cualquier objeto.
 *
 * Una tienda ofrece variantes sólo si su ficha lo dice (`shop.qualities`),
 * con menos unidades cuanto mejor es la calidad y más rara la base.
 */

// Orden de rarezas (copia de catalog.js para no crear una importación circular).
const RARITY_ORDER = ['common', 'uncommon', 'rare', 'veryRare', 'epic', 'legendary', 'unique'];

export const QUALITIES = Object.freeze([
    { id: 'tosca', label: 'Tosca', icon: '🪵', mult: 0.6, rank: 0 },
    { id: 'estandar', label: 'Estándar', icon: '', mult: 1, rank: 1 },
    { id: 'fina', label: 'Fina', icon: '✨', mult: 1.75, rank: 2 },
    { id: 'obra', label: 'Obra maestra', icon: '🏅', mult: 4, rank: 3 },
]);
const BY_ID = new Map(QUALITIES.map((q) => [q.id, q]));
export const getQuality = (id) => BY_ID.get(id ?? 'estandar') ?? BY_ID.get('estandar');

/** Calidades que una tienda puede ofrecer (además de la estándar). */
export const QUALITY_OPTIONS = Object.freeze({ tosca: '🪵 Tosca (barata)', fina: '✨ Fina', obra: '🏅 Obra maestra' });

/** Efecto de juego de cada calidad según el tipo de objeto (texto para la ficha). */
const EFFECTS = {
    armas: {
        tosca: 'Con un 1 natural en el ataque se mella: −1 al daño hasta repararla (1 hora y herramientas de herrero).',
        fina: '+1 al daño (no mágico; no se suma a bonos mágicos).',
        obra: '+1 a las tiradas de ataque y al daño (no mágico; no se suma a bonos mágicos).',
    },
    armaduras: {
        tosca: '−1 a la CA.',
        fina: 'Pesa un 25 % menos y ponérsela o quitársela lleva la mitad de tiempo.',
        obra: '+1 a la CA (no mágico; no se suma a bonos mágicos) y sin desventaja en Sigilo.',
    },
    herramientas: {
        tosca: '−1 a las pruebas con estas herramientas.',
        fina: '+1 a las pruebas con estas herramientas.',
        obra: '+2 a las pruebas con estas herramientas.',
    },
};

/** ¿Puede tener calidad este objeto? */
export function hasQuality(item) {
    return Boolean(item && EFFECTS[item.category] && item.sub !== 'municion' && !item.quality && !item.bundle);
}

export const qualityEffect = (item, q) => EFFECTS[item.category]?.[q] ?? '';

/** Variantes de calidad de un objeto (sin la estándar, que es el objeto base). */
export function qualityVariants(item) {
    if (!hasQuality(item)) return [];
    return QUALITIES.filter((q) => q.id !== 'estandar').map((q) => ({
        ...item,
        id: `${item.id}~${q.id}`,
        name: `${item.name} (${q.label.toLowerCase()})`,
        price: Math.max(1, Math.round(item.price * q.mult)),
        quality: q.id,
        baseId: item.id,
        tags: [...item.tags, `calidad-${q.id}`],
        props: { ...(item.props ?? {}), Calidad: `${q.label}: ${qualityEffect(item, q.id)}` },
    }));
}

/** Añade al catálogo las variantes de calidad. */
export function withQualities(list) {
    return list.flatMap((item) => [item, ...qualityVariants(item)]);
}

/** Parte del surtido que una tienda tiene en cada calidad. */
const SHARE = { tosca: 0.5, fina: 0.35, obra: 0.15 };

/** ¿Tiene esta tienda este objeto en esa calidad? Fijo por tienda y objeto (sin azar entre recargas). */
export function offersQuality(shopId, itemId, quality) {
    let h = 2166136261;
    for (const ch of `${shopId}|${itemId}|${quality}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    return ((h >>> 0) % 1000) / 1000 < (SHARE[quality] ?? 0);
}

/**
 * Cuántas unidades de cada calidad tiene una tienda, a partir de las del
 * objeto estándar: la tosca abunda, la fina escasea, la obra maestra es una
 * pieza suelta (y en objetos muy raros o más, ni eso salvo que se pida).
 */
export function variantTarget(base, quality, target) {
    if (quality === 'tosca') return Math.max(1, target);
    if (quality === 'fina') return Math.max(1, Math.floor(target / 2));
    if (quality === 'obra') return RARITY_ORDER.indexOf(base.rarity) >= RARITY_ORDER.indexOf('veryRare') ? 0 : 1;
    return target;
}
