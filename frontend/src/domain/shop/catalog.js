/**
 * Catálogo de objetos de la Tienda.
 *
 * Un único formato canónico para todo lo que se puede comprar o vender, venga
 * de los datos oficiales, del Homebrew (refs `hb:<paquete>:item:<id>`) o de
 * adaptadores de otras fuentes. El resto del sistema solo conoce este formato.
 *
 * ItemDef = {
 *   id, name, category, sub, rarity,
 *   price,            // entero, unidad mínima de la moneda (pc)
 *   weight?,          // libras
 *   desc?, props?,    // props: { 'Daño': '1d8 cortante', ... } solo para mostrar
 *   tags: string[],
 *   stack: boolean,   // se acumula en la ficha (pociones, flechas...)
 *   bundle?: number,  // se vende por lotes (Flechas ×20)
 *   forSale: boolean, // false = existe (se puede vender a una tienda) pero nadie lo ofrece
 *   origin: string
 * }
 */

export const RARITIES = Object.freeze([
    { id: 'common', label: 'Común', color: '#b9b2a3' },
    { id: 'uncommon', label: 'Poco común', color: '#6fbf73' },
    { id: 'rare', label: 'Raro', color: '#5b9bff' },
    { id: 'veryRare', label: 'Muy raro', color: '#b07cff' },
    { id: 'epic', label: 'Épico', color: '#e070ff' },
    { id: 'legendary', label: 'Legendario', color: '#f2c14e' },
    { id: 'unique', label: 'Único', color: '#ff5a4f' },
]);

export const RARITY_INDEX = Object.freeze(Object.fromEntries(RARITIES.map((r, i) => [r.id, i])));

export const CATEGORIES = Object.freeze([
    {
        id: 'armas', label: 'Armas', icon: '⚔️',
        subs: [
            { id: 'sencilla-cc', label: 'Sencillas cuerpo a cuerpo', icon: '🗡️' },
            { id: 'sencilla-dist', label: 'Sencillas a distancia', icon: '🏹' },
            { id: 'marcial-cc', label: 'Marciales cuerpo a cuerpo', icon: '⚔️' },
            { id: 'marcial-dist', label: 'Marciales a distancia', icon: '🎯' },
            { id: 'municion', label: 'Munición', icon: '➶' },
        ],
    },
    {
        id: 'armaduras', label: 'Armaduras', icon: '🛡️',
        subs: [
            { id: 'ligera', label: 'Ligeras', icon: '🧥' },
            { id: 'intermedia', label: 'Intermedias', icon: '🦺' },
            { id: 'pesada', label: 'Pesadas', icon: '🛡️' },
            { id: 'escudo', label: 'Escudos', icon: '🛡️' },
        ],
    },
    {
        id: 'herramientas', label: 'Herramientas', icon: '🔨',
        subs: [
            { id: 'artesano', label: 'De artesano', icon: '🔨' },
            { id: 'kit', label: 'Kits y utensilios', icon: '🧰' },
            { id: 'juego', label: 'Juegos', icon: '🎲' },
            { id: 'instrumento', label: 'Instrumentos', icon: '🎻' },
        ],
    },
    {
        id: 'equipo', label: 'Equipo de aventura', icon: '🎒',
        subs: [
            { id: 'aventura', label: 'Útiles', icon: '🪢' },
            { id: 'contenedor', label: 'Contenedores', icon: '🎒' },
            { id: 'luz', label: 'Luz y fuego', icon: '🕯️' },
            { id: 'canalizador', label: 'Canalizadores', icon: '🔮' },
            { id: 'ropa', label: 'Ropa y telas', icon: '👘' },
            { id: 'valor', label: 'Joyas y objetos de valor', icon: '💍' },
        ],
    },
    {
        id: 'consumibles', label: 'Consumibles', icon: '🧪',
        subs: [
            { id: 'pocion', label: 'Pociones', icon: '🧪' },
            { id: 'alquimia', label: 'Alquimia', icon: '⚗️' },
            { id: 'comida', label: 'Comida y bebida', icon: '🍞' },
            { id: 'ingrediente', label: 'Ingredientes y especias', icon: '🧂' },
        ],
    },
    {
        id: 'magicos', label: 'Objetos mágicos', icon: '✨',
        subs: [
            { id: 'arma', label: 'Armas', icon: '🗡️' },
            { id: 'armadura', label: 'Armaduras', icon: '🛡️' },
            { id: 'anillo', label: 'Anillos', icon: '💍' },
            { id: 'maravilloso', label: 'Maravillosos', icon: '🔮' },
        ],
    },
    {
        id: 'monturas', label: 'Monturas y vehículos', icon: '🐎',
        subs: [
            { id: 'montura', label: 'Monturas', icon: '🐎' },
            { id: 'arreos', label: 'Arreos y alforjas', icon: '🧳' },
            { id: 'vehiculo', label: 'Vehículos', icon: '🛞' },
        ],
    },
    {
        id: 'criaturas', label: 'Crías y criaturas', icon: '🐾',
        subs: [
            { id: 'cria', label: 'Crías', icon: '🐾' },
            { id: 'huevo', label: 'Huevos', icon: '🥚' },
        ],
    },
    {
        id: 'tecnologia', label: 'Tecnología', icon: '⚙️',
        subs: [
            { id: 'material', label: 'Materiales de taller', icon: '🔩' },
            { id: 'invento', label: 'Inventos', icon: '🛠️' },
        ],
    },
    {
        id: 'pistas', label: 'Pistas y secretos', icon: '📜',
        subs: [
            { id: 'pista', label: 'Pistas', icon: '📜' },
            { id: 'coordenadas', label: 'Coordenadas', icon: '🗺️' },
        ],
    },
]);

const CATEGORY_BY_ID = new Map(CATEGORIES.map((c) => [c.id, c]));

/** Alias aceptados al importar (incluye los tipos del prototipo). */
const CATEGORY_ALIASES = {
    arma: 'armas', armas: 'armas', weapon: 'armas',
    armadura: 'armaduras', armaduras: 'armaduras', escudo: 'armaduras', armor: 'armaduras',
    herramienta: 'herramientas', herramientas: 'herramientas', tool: 'herramientas',
    equipo: 'equipo', material: 'equipo', materiales: 'equipo', mochila: 'equipo', gear: 'equipo', otros: 'equipo',
    consumible: 'consumibles', consumibles: 'consumibles', comida: 'consumibles',
    artefacto: 'magicos', artefactos: 'magicos', magico: 'magicos', magicos: 'magicos',
    montura: 'monturas', monturas: 'monturas', vehiculo: 'monturas', 'equipaje-montura': 'monturas',
    mascota: 'criaturas', criaturas: 'criaturas',
    pista: 'pistas', pistas: 'pistas',
    tecnologia: 'tecnologia',
};

export function getCategory(id) {
    return CATEGORY_BY_ID.get(id) ?? null;
}

export function getSub(categoryId, subId) {
    return getCategory(categoryId)?.subs.find((s) => s.id === subId) ?? null;
}

export function getRarity(id) {
    return RARITIES[RARITY_INDEX[id]] ?? RARITIES[0];
}

export function itemIcon(item) {
    return item.icon ?? getSub(item.category, item.sub)?.icon ?? getCategory(item.category)?.icon ?? '📦';
}

/**
 * Valida y normaliza un objeto crudo. Nunca lanza: devuelve errores legibles
 * para que el editor de Homebrew o un importador puedan mostrarlos.
 */
export function normalizeItem(raw, { origin = 'data' } = {}) {
    const errors = [];
    if (!raw || typeof raw !== 'object') return { item: null, errors: ['Entrada vacía o inválida.'] };

    const id = String(raw.id ?? '').trim();
    const name = String(raw.name ?? '').trim();
    if (!id) errors.push('Falta el identificador (id).');
    if (!name) errors.push(`«${id || '?'}»: falta el nombre.`);

    const categoryRaw = String(raw.category ?? raw.type ?? '').trim().toLowerCase();
    const category = CATEGORY_ALIASES[categoryRaw] ?? (CATEGORY_BY_ID.has(categoryRaw) ? categoryRaw : null);
    if (!category) errors.push(`«${id}»: categoría desconocida «${categoryRaw}».`);

    const sub = String(raw.sub ?? '').trim();
    if (category && sub && !getSub(category, sub)) errors.push(`«${id}»: subcategoría «${sub}» no existe en ${category}.`);

    const rarity = RARITY_INDEX[raw.rarity] !== undefined ? raw.rarity : 'common';
    if (raw.rarity && RARITY_INDEX[raw.rarity] === undefined) errors.push(`«${id}»: rareza «${raw.rarity}» desconocida; se usa Común.`);

    const price = Math.trunc(Number(raw.price ?? raw.marketBasePrice ?? raw.basePrice));
    if (!Number.isFinite(price) || price <= 0) errors.push(`«${id}»: el precio debe ser un entero positivo (en pc).`);

    if (errors.some((e) => !e.includes('se usa Común'))) return { item: null, errors };

    const item = {
        id,
        name,
        category,
        sub: sub || getCategory(category).subs[0].id,
        rarity,
        price,
        weight: Number.isFinite(Number(raw.weight)) ? Number(raw.weight) : null,
        desc: String(raw.desc ?? raw.description ?? '').trim(),
        props: raw.props && typeof raw.props === 'object' ? { ...raw.props } : {},
        tags: Array.isArray(raw.tags) ? raw.tags.map(String) : [],
        stack: Boolean(raw.stack ?? raw.stackable ?? false),
        bundle: Number.isInteger(raw.bundle) && raw.bundle > 1 ? raw.bundle : null,
        forSale: raw.forSale !== false,
        origin: raw.origin ?? origin,
        // Dónde acaba en la ficha al comprarlo: inventario (por defecto) o
        // materiales del Taller ({ kind: 'workshop-material', id }).
        grant: raw.grant?.kind === 'workshop-material' && typeof raw.grant.id === 'string' ? { kind: 'workshop-material', id: raw.grant.id } : { kind: 'inventory' },
    };
    if (raw.icon) item.icon = String(raw.icon);
    return { item: Object.freeze(item), errors };
}

/**
 * Construye el catálogo a partir de varias fuentes.
 * sources: [{ origin, items: [...] }]. Las fuentes posteriores pueden
 * sustituir objetos de las anteriores (p. ej. Homebrew que corrige un precio).
 */
export function buildCatalog(sources) {
    const items = new Map();
    const errors = [];
    for (const source of sources) {
        for (const raw of source.items ?? []) {
            const { item, errors: itemErrors } = normalizeItem(raw, { origin: source.origin });
            errors.push(...itemErrors.map((e) => `[${source.origin}] ${e}`));
            if (item) items.set(item.id, item);
        }
    }
    const list = [...items.values()];
    return {
        items,
        list,
        errors,
        get(id) {
            return items.get(id) ?? null;
        },
    };
}

/**
 * ¿Cumple el objeto una regla de surtido?
 * rule = { category?, sub?: string|string[], rarities?: string[], maxRarity?, tags?: string[], ids?: string[], exclude?: string[] }
 */
export function matchesRule(item, rule) {
    if (!item || !rule) return false;
    if (rule.exclude?.includes(item.id)) return false;
    if (rule.ids) return rule.ids.includes(item.id);
    if (rule.category && item.category !== rule.category) return false;
    if (rule.sub) {
        const subs = Array.isArray(rule.sub) ? rule.sub : [rule.sub];
        if (!subs.includes(item.sub)) return false;
    }
    if (rule.rarities && !rule.rarities.includes(item.rarity)) return false;
    if (rule.maxRarity && RARITY_INDEX[item.rarity] > RARITY_INDEX[rule.maxRarity]) return false;
    if (rule.tags && !rule.tags.some((t) => item.tags.includes(t))) return false;
    return true;
}

/** Texto plano para buscar (sin tildes, minúsculas). */
export function searchKey(text) {
    return String(text ?? '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase();
}
