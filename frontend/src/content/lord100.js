/**
 * Lord 100 — la Torre.
 *
 * Genera, a partir de los datos compactos de `data/shop/lord100.json`, el mundo
 * de la Tienda de la Torre con los MISMOS tipos que usa el DM en Homebrew
 * (regiones y comerciantes), así que el resto del sistema (viajar, pisos,
 * economía, inventarios, campañas) no necesita nada aparte.
 *
 *   Piso N      → región `hb-l100-pN` (floor N, gran región = tramo de 5 pisos)
 *   Zona        → lugar de esa región (un bioma)
 *   Economía    → abundante / normal / escaso = unión de los biomas del piso
 *                 + criaturas del tramo; «estricta»: lo que no produce, no está
 *   Negocios    → por zona, según el bioma (no todos en todos los pisos)
 *   Especiales  → con requisito (misión, jefe…) y materiales exclusivos
 *   Gremio      → uno en cada piso (misiones, licencias y servicios; ver guildProfile)
 *
 * Regla de zonas: en cada tramo, el 1.er piso tiene 1 zona, el 2.º añade la
 * 2.ª… hasta 5. Así cada tramo crece y el siguiente empieza de nuevo.
 *
 * Todo es determinista (mismos datos → mismos ids y nombres), así que el
 * estado guardado del mercado no se rompe al recargar.
 */

import { validateContent } from './schema.js';
import tower from '../data/shop/lord100.json';
import estate from '../data/shop/estate.json';
import professions from '../data/shop/professions.json';

export const LORD100 = 'lord100';
const PACK = 'lord100';
const PROF = new Map(professions.professions.map((p) => [p.id, p]));
const PORTRAITS = ['🧔', '👩', '🧓', '👨‍🦰', '👩‍🦳', '🧑‍🦱', '👱', '🧕', '👨‍🦲', '👵'];

/** Hash pequeño y estable para elegir nombres y rasgos sin azar. */
function hash(text) {
    let h = 2166136261;
    for (const ch of String(text)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    return h >>> 0;
}
const pick = (list, key) => list[hash(key) % list.length];
const slug = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24); // igual que los lugares Homebrew
const uniq = (list) => [...new Set(list)];

/** Tramo (gran región) de un piso. */
export const realmOf = (floor) => tower.realms.find((r) => floor >= r.from && floor <= r.to) ?? null;

/** Zonas de un piso: las primeras k del tramo (k = posición del piso en el tramo). */
export function zonesOf(floor) {
    const realm = realmOf(floor);
    if (!realm) return [];
    return realm.zones.slice(0, floor - realm.from + 1).map((z) => ({ ...z, ...tower.biomes[z.biome], id: slug(z.name) }));
}

/** Economía de un piso: un recurso abundante en alguna zona es abundante en el piso. */
export function floorEconomy(floor) {
    const realm = realmOf(floor);
    const zones = zonesOf(floor);
    const abundant = uniq(zones.flatMap((z) => z.abundant));
    const common = uniq([...zones.flatMap((z) => z.common), ...(realm?.monsters ?? []).map((m) => `#${m}`)]).filter((k) => !abundant.includes(k));
    const scarce = uniq(zones.flatMap((z) => z.scarce)).filter((k) => !abundant.includes(k) && !common.includes(k));
    return { abundant, common, scarce };
}

const regionRef = (floor) => `hb:${PACK}:region:l100-p${floor}`;
export const floorRegionId = (floor) => `hb-l100-p${floor}`;
export const zoneLocationId = (floor, zoneName) => `${floorRegionId(floor)}-${slug(zoneName)}`;

function regionEntry(floor) {
    const realm = realmOf(floor);
    const zones = zonesOf(floor);
    const eco = floorEconomy(floor);
    const { item } = validateContent('region', {
        name: `Piso ${floor}`,
        icon: '🏰',
        description: `${realm.name} · ${zones.map((z) => z.name).join(', ')}.`,
        type: zones.at(-1).name,
        group: `${realm.name} (pisos ${realm.from}–${realm.to})`,
        floor,
        strict: true,
        danger: realm.danger,
        resources: eco.abundant,
        common: eco.common,
        scarce: eco.scarce,
        locations: zones.map((z) => ({ name: z.name, icon: z.icon, description: `${z.description} Criaturas: ${z.creatures.join(', ')}.` })),
    });
    return { ref: regionRef(floor), item };
}

function merchant(floor, zone, profId, n, extra = {}) {
    const prof = PROF.get(profId);
    if (!prof) return null;
    const realm = realmOf(floor);
    const key = `${floor}|${zone.id}|${profId}|${n}`;
    const name = extra.keeper ?? `${pick(estate.names, key)} ${pick(estate.surnames, `${key}|s`)}`;
    const t = (k) => hash(`${key}|${k}`) % 11;
    const shopLabel = extra.shopName ?? `${prof.label} · ${zone.name}`;
    const { item, errors } = validateContent('mercader', {
        name,
        title: extra.title ?? prof.label,
        description: extra.description ?? `${prof.description} Piso ${floor}, ${zone.name}.`,
        portrait: extra.portrait ?? pick(PORTRAITS, key),
        race: extra.race ?? pick(realm.races, `${key}|r`),
        profession: profId,
        location: zoneLocationId(floor, zone.name),
        floor,
        requirement: extra.requirement ?? '',
        special: Boolean(extra.special),
        shopName: shopLabel,
        shopIcon: prof.icon,
        qualities: qualitiesFor(floor, profId),
        traits: { greed: t('g'), patience: t('p'), pride: t('o'), warmth: t('w'), shrewdness: t('s') },
        floorItems: (extra.items ?? []).map((id) => ({ floor, item: id, qty: 1 })),
    });
    if (!item) throw new Error(`Lord 100: comerciante inválido (${key}): ${errors.join(' ')}`);
    return { ref: `hb:${PACK}:mercader:l100-${floor}-${zone.id}-${profId}-${n}`, item };
}

/** Oficios que fabrican: en pisos avanzados ofrecen mejor calidad. */
const CRAFTED = new Set(['herrero', 'armero', 'flechero', 'lutier', 'carpintero', 'sastre', 'curtidor', 'joyero', 'mueblero']);

/**
 * Calidades que ofrece un comerciante según su piso: los pisos más avanzados
 * tienen artesanos mejores (fina desde el 40, obra maestra desde el 75).
 */
function qualitiesFor(floor, profId) {
    const base = PROF.get(profId)?.qualities ?? [];
    if (!CRAFTED.has(profId)) return base;
    const q = new Set(base);
    if (floor >= 40) q.add('fina');
    if (floor >= 75) q.add('obra');
    if (floor >= 40) q.delete('tosca');
    return [...q];
}

/**
 * Negocios de un piso. La zona nueva trae sus dos negocios típicos y uno
 * variable de su tipo (extras); las que ya existían en el tramo tienen uno
 * (rotando, para que cada piso sea distinto). ESENCIALES en todos los pisos:
 * comercio general, posada y Gremio. Cada tramo tiene una tienda de productos
 * regionales. Los especiales del tramo piden un requisito.
 */
function floorMerchants(floor) {
    const realm = realmOf(floor);
    const zones = zonesOf(floor);
    const out = [];
    const used = new Set();
    const add = (zone, profId, extra) => {
        const k = `${zone.id}|${profId}`;
        // Un solo comerciante general por piso; el resto, uno por zona y oficio.
        if (used.has(k) || (profId === 'general' && used.has('general'))) return;
        used.add(k);
        used.add(`prof:${profId}`);
        if (profId === 'general') used.add('general');
        const m = merchant(floor, zone, profId, 0, extra);
        if (m) out.push(m);
    };
    const newest = zones.at(-1);
    for (const p of newest.businesses.slice(0, 2)) add(newest, p);
    zones.slice(0, -1).forEach((z, i) => add(z, z.businesses[(floor + i) % z.businesses.length]));
    // Esenciales en TODOS los pisos: comercio general, posada (y el Gremio, aparte).
    add(zones[0], 'general');
    if (floor === realm.from || floor === realm.to || !used.has('prof:tabernero')) add(zones[0], 'tabernero', { shopName: `Posada · ${zones[0].name}` });
    // Variables: la zona nueva aporta un negocio propio de su tipo (puerto → cambista,
    // capilla → templo…), rotando entre sus opciones. Nunca uno sin sentido para la zona.
    if (newest.extras?.length) add(newest, newest.extras[floor % newest.extras.length]);
    // Productos regionales: uno por tramo, en su segundo piso.
    if (floor === Math.min(realm.to, realm.from + 1)) add(zones[0], 'regional', { shopName: `Productos de ${realm.name}` });
    for (const s of realm.specials ?? []) {
        if (realm.from + s.offset !== floor) continue;
        const zone = zones.at(-1);
        out.push(merchant(floor, zone, s.profession, 1, { shopName: s.name, title: s.name, requirement: s.requirement, special: true, items: s.items, description: `${s.name}: negocio especial del piso ${floor}. ${PROF.get(s.profession)?.description ?? ''}` }));
    }
    out.push(...alienMerchants(floor, zones));
    return out.filter(Boolean);
}

/** Piso a partir del cual aparecen comerciantes aliens (nunca antes). */
export const ALIEN_MIN_FLOOR = tower.aliens?.minFloor ?? 50;

/**
 * Comerciantes aliens (AgSt 1.32): especies recién descubiertas que sólo
 * comercian en los pisos altos de la Torre. Venden su equipo exclusivo
 * (por id) además de lo propio de su oficio.
 */
function alienMerchants(floor, zones) {
    return (tower.aliens?.merchants ?? [])
        .filter((a) => a.floor === floor)
        .map((a) => {
            if (a.floor < ALIEN_MIN_FLOOR) throw new Error(`Lord 100: comerciante alien «${a.name}» por debajo del piso ${ALIEN_MIN_FLOOR}.`);
            return merchant(floor, zones.at(-1), a.profession, 2, {
                keeper: a.keeper, race: a.race, portrait: a.portrait, shopName: a.name, title: a.name, items: a.items,
                description: `${a.description} Piso ${floor}.`,
            });
        });
}

let cache = null;
/** Todo el contenido de la Torre como entradas Homebrew { ref, item }. */
export function lord100Content() {
    if (cache) return cache;
    const region = [];
    const mercader = [];
    for (const realm of tower.realms) {
        for (let f = realm.from; f <= realm.to; f++) {
            region.push(regionEntry(f));
            mercader.push(...floorMerchants(f));
            mercader.push(guildMerchant(f));
        }
    }
    cache = { region, mercader, start: zoneLocationId(1, tower.realms[0].zones[0].name) };
    return cache;
}

export const lord100Realms = () => tower.realms;

// ── Gremio de aventureros ─────────────────────────────────────────────────

/** Pisos con Gran Sede del Gremio (inicio de la Torre y cada decena). */
const GRAND_SEATS = new Set([1, 10, 20, 30, 40, 50, 60, 70, 80, 90, 99]);
const materialLabel = (key) => (key.startsWith('#') ? key.slice(1).replace(/-/g, ' ') : null);

/**
 * Perfil del Gremio de un piso: todos los pisos tienen uno, pero su tamaño,
 * rangos habituales, criaturas, materiales y normas dependen del piso.
 *   prestigio 3 (Gran Sede): piso 1 y cada decena · 2 (Sede): inicio y fin de
 *   cada tramo · 1 (Puesto): el resto.
 *   rango habitual: sube un escalón cada 11 pisos (F en 1–11 … SSS en 89–99).
 */
export function guildProfile(floor) {
    const realm = realmOf(floor);
    if (!realm) return null;
    const zones = zonesOf(floor);
    const prestige = GRAND_SEATS.has(floor) ? 3 : floor === realm.from || floor === realm.to ? 2 : 1;
    const base = Math.min(8, Math.floor((floor - 1) / 11));
    const reach = prestige > 1 ? 1 : 0; // las sedes reciben encargos un escalón más difíciles
    return {
        floor,
        realm: realm.name,
        danger: realm.danger,
        prestige,
        rankMin: Math.max(0, base - 1),
        rankMax: Math.min(8, base + 1 + reach),
        zones: zones.map((z) => z.name),
        creatures: uniq([...zones.flatMap((z) => z.creatures)]),
        materials: uniq(zones.flatMap((z) => [...z.abundant, ...z.common]).map(materialLabel).filter(Boolean)),
        races: realm.races,
        location: zoneLocationId(floor, zones[0].name),
    };
}

/** Comerciante «Gremio» del piso: el establecimiento oficial (está en la primera zona). */
function guildMerchant(floor) {
    const p = guildProfile(floor);
    const zone = zonesOf(floor)[0];
    const label = ['Puesto del Gremio', 'Sede del Gremio', 'Gran Sede del Gremio'][p.prestige - 1];
    return merchant(floor, zone, 'gremio', 0, {
        shopName: `${label} · Piso ${floor}`,
        title: 'Encargado del Gremio',
        description: `${label} de ${p.realm}: tablón de misiones, licencias de aventurero y contratación de servicios en el piso ${floor}.`,
    });
}
