/**
 * Agrupa los datos estáticos que necesita el dominio (catálogo, tiendas,
 * comerciantes, eventos, diálogos, mapa, facciones, arquetipos, familias de
 * razas y rumores). Es inmutable y se pasa a todas las funciones: el dominio
 * no importa JSON ni toca el DOM.
 *
 * Todo lo nuevo es opcional: sin mapa, los comerciantes están «en la plaza» y
 * siempre presentes (así siguen funcionando los datos y pruebas anteriores).
 */

import { effectiveTraits } from './personality.js';
import { compileKeeper, compileShop, compileRegion, compileFaction } from './compile.js';

const DEFAULT_PHASES = [
    { id: 'manana', label: 'Mañana', icon: '🌅' },
    { id: 'tarde', label: 'Tarde', icon: '☀️' },
    { id: 'anochecer', label: 'Anochecer', icon: '🌇' },
    { id: 'noche', label: 'Noche', icon: '🌙' },
];
const DEFAULT_LOCATION = { id: 'plaza', name: 'Plaza del Mercado', icon: '🏛️', regionId: 'region' };

export function createShopContext({
    catalog,
    shops = [],
    keepers = [],
    events = [],
    dialogue = {},
    topics = [],
    world = null,
    factions = [],
    archetypes = [],
    raceFamilies = [],
    rumors = [],
    professions = [],
    estate = null,
    worldKind = 'agarias',
    /** Gremio de aventureros: { data (guild.json), profile(floor) } o null si el mundo no tiene. */
    guild = null,
    /** Hospedaje (data/shop/lodging.json) o null. */
    lodging = null,
}) {
    const professionMap = new Map(professions.map((p) => [p.id, p]));
    const phasesList = world?.phases?.length ? world.phases : DEFAULT_PHASES;
    factions = factions.map(compileFaction);
    const archetypeMap = new Map(archetypes.map((a) => [a.id, a]));
    // Los rasgos que usa todo el motor ya incluyen los arquetipos (baseTraits guarda los originales).
    keepers = keepers
        .map((k) => compileKeeper(k, { professions: professionMap, phases: phasesList }))
        .map((k) => (k.archetypes?.length ? { ...k, baseTraits: k.traits, traits: effectiveTraits({ archetypes: archetypeMap }, k) } : k));
    const regions = (world?.regions ?? [{ id: 'region', name: 'Región', icon: '🗺️', economy: {}, locations: [DEFAULT_LOCATION] }]).map(compileRegion);
    keepers = placeOnFloors(keepers, regions);
    const regionMap = new Map(regions.map((r) => [r.id, r]));
    const locationMap = new Map();
    for (const region of regions) {
        for (const loc of region.locations ?? []) locationMap.set(loc.id, { ...loc, regionId: region.id });
    }
    const factionMapEarly = new Map(factions.map((f) => [f.id, f]));
    const keeperById = new Map(keepers.map((k) => [k.id, k]));
    shops = shops.map((sh) => compileShop(sh, keeperById.get(sh.keeperId), { professions: professionMap, factions: factionMapEarly }));
    const shopMap = new Map(shops.map((s) => [s.id, s]));
    const keeperMap = new Map(keepers.map((k) => [k.id, k]));
    const eventMap = new Map(events.map((e) => [e.id, e]));
    const topicMap = new Map(topics.map((t) => [t.id, t]));
    const factionMap = new Map(factions.map((f) => [f.id, f]));
    const rumorMap = new Map(rumors.map((r) => [r.id, r]));
    const shopByKeeper = new Map(shops.map((s) => [s.keeperId, s]));

    const phases = phasesList;
    const startLocation = locationMap.has(world?.start) ? world.start : [...locationMap.keys()][0];

    const problems = [];
    for (const shop of shops) {
        if (!keeperMap.has(shop.keeperId)) problems.push(`La tienda «${shop.id}» apunta a un vendedor inexistente («${shop.keeperId}»).`);
    }
    for (const keeper of keepers) {
        const places = keeper.presence?.route?.map((r) => r.location) ?? [keeper.presence?.location].filter(Boolean);
        for (const loc of places) if (world && !locationMap.has(loc)) problems.push(`«${keeper.id}» está en una ubicación inexistente («${loc}»).`);
        if (keeper.faction && factions.length && !factionMap.has(keeper.faction)) problems.push(`«${keeper.id}» pertenece a una facción inexistente («${keeper.faction}»).`);
        for (const a of keeper.archetypes ?? []) if (archetypes.length && !archetypeMap.has(a)) problems.push(`«${keeper.id}» usa un arquetipo inexistente («${a}»).`);
        if (keeper.profession && professions.length && !professionMap.has(keeper.profession)) problems.push(`«${keeper.id}» tiene una profesión inexistente («${keeper.profession}»).`);
    }

    return Object.freeze({
        catalog,
        dialogue,
        shops: shopMap,
        keepers: keeperMap,
        events: eventMap,
        topics: topicMap,
        factions: factionMap,
        archetypes: archetypeMap,
        rumors: rumorMap,
        professions: professionMap,
        worldKind,
        guild: guild ? { data: guild.data, profile: guild.profile } : null,
        lodging,
        estate: estate ? {
            plots: new Map((estate.plots ?? []).map((p) => [p.id, p])),
            buildings: new Map((estate.buildings ?? []).map((b) => [b.id, b])),
            roles: new Map((estate.roles ?? []).map((r) => [r.id, r])),
            names: estate.names ?? [],
            surnames: estate.surnames ?? [],
        } : null,
        raceFamilies,
        regions: regionMap,
        locations: locationMap,
        phases,
        weekdays: world?.weekdays ?? [],
        startLocation,
        hasMap: Boolean(world),
        shopList: shops,
        problems: [...(catalog.errors ?? []), ...problems],
        shop(id) {
            return shopMap.get(id) ?? null;
        },
        keeperOf(shopId) {
            return keeperMap.get(shopMap.get(shopId)?.keeperId) ?? null;
        },
        shopOf(keeperId) {
            return shopByKeeper.get(keeperId) ?? null;
        },
        item(id) {
            return catalog.get(id);
        },
        location(id) {
            return locationMap.get(id) ?? (world ? null : DEFAULT_LOCATION);
        },
    });
}

/**
 * Progresión por pisos: un comerciante con piso propio vive EN ese piso. Si su
 * lugar no es de ese piso, se le lleva al lugar del piso (la primera región con
 * ese `floor`) o, si el DM no creó ninguna, a un lugar «Piso N» automático.
 * Así los jugadores viajan entre pisos como entre regiones. Muta `regions`.
 */
function placeOnFloors(keepers, regions) {
    const floorOfLocation = new Map();
    for (const r of regions) for (const l of r.locations ?? []) floorOfLocation.set(l.id, r.floor ?? null);
    const hubOf = (floor) => {
        let region = regions.find((r) => r.floor === floor && r.locations?.length);
        if (!region) {
            region = compileRegion({
                id: `piso-${floor}`, name: `Piso ${floor}`, icon: '🏰', floor, type: 'Piso',
                description: `Los negocios del piso ${floor}.`, economy: {},
                locations: [{ id: `piso-${floor}`, name: `Piso ${floor}`, icon: '🏰', description: `Mercado del piso ${floor}.` }],
            });
            regions.push(region);
        }
        return region.locations[0].id;
    };
    return keepers.map((k) => {
        if (!k.floor || k.presence?.route?.length) return k;
        if (floorOfLocation.get(k.presence?.location) === k.floor) return k;
        return { ...k, presence: { ...(k.presence ?? {}), location: hubOf(k.floor) } };
    });
}
