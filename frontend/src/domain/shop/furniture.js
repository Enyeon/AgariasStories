/**
 * Muebles y decoración: se compran como cualquier objeto (van al inventario de
 * la ficha) y se COLOCAN en un espacio compatible:
 *
 *   - la habitación alquilada (huecos según la habitación: domain/shop/lodging.js);
 *   - una propiedad con la mejora «Vivienda» (huecos según el tamaño del terreno).
 *
 * Colocar un mueble lo saca del inventario; recogerlo lo devuelve. Al dejar la
 * habitación, sus muebles vuelven solos. Un mueble FUNCIONAL tiene un uso (una
 * cama permite descansar, un escritorio estudiar…); uno DECORATIVO sólo adorna,
 * salvo que su descripción diga otra cosa.
 *
 *   world.lodging[charId].furniture       = [itemId]
 *   world.estate.properties[plotId].furniture = [itemId]
 */

import { cloneWorld } from './state.js';
import { grantItem, takeItem, ownedUnits } from './inventory.js';
import { stayOf } from './lodging.js';

export const HOME_SLOTS = Object.freeze({ pequeño: 6, mediano: 10, grande: 16 });

export const isFurniture = (item) => Boolean(item?.category === 'hogar' && item.furniture);
const sizeOf = (ctx, id) => ctx.item(id)?.furniture?.size ?? 1;
const used = (ctx, list) => (list ?? []).reduce((n, id) => n + sizeOf(ctx, id), 0);

/** Espacios donde este personaje puede colocar muebles. */
export function spacesOf(world, ctx, charId) {
    const out = [];
    const stay = stayOf(world, charId);
    if (stay) {
        const room = ctx.lodging?.rooms?.find((r) => r.id === stay.room);
        out.push({
            id: 'lodging', kind: 'lodging', icon: room?.icon ?? '🛏️',
            label: `Habitación ${stay.label.toLowerCase()} · ${ctx.shop(stay.shopId)?.name ?? 'posada'}`,
            capacity: room?.slots ?? 0, used: used(ctx, stay.furniture), items: stay.furniture,
            note: room?.slots ? 'Al dejar la habitación, tus muebles vuelven al inventario.' : 'Esta habitación no tiene sitio para muebles propios.',
        });
    }
    for (const [plotId, prop] of Object.entries(world.estate?.properties ?? {})) {
        if (prop.owner !== charId || !(prop.buildings ?? []).includes('vivienda')) continue;
        const plot = ctx.estate?.plots?.get(plotId);
        out.push({
            id: `prop:${plotId}`, kind: 'property', plotId, icon: '🏠',
            label: plot?.name ?? 'Tu vivienda', capacity: HOME_SLOTS[plot?.size] ?? 8,
            used: used(ctx, prop.furniture), items: prop.furniture ?? [], note: 'Tu casa: los muebles se quedan aunque te vayas de viaje.',
        });
    }
    return out;
}

/** Muebles del inventario, con cuántos hay y dónde están colocados los demás. */
export function furnitureOf(world, ctx, charId, character) {
    const placed = new Map();
    for (const sp of spacesOf(world, ctx, charId)) for (const id of sp.items) {
        const list = placed.get(id) ?? [];
        list.push(sp.label);
        placed.set(id, list);
    }
    const stored = (ctx.catalog?.list ?? []).filter(isFurniture).map((item) => ({ item, stored: character ? ownedUnits(character, item) : 0, placedIn: placed.get(item.id) ?? [] }));
    return stored.filter((x) => x.stored > 0 || x.placedIn.length);
}

function editSpace(world, ctx, charId, spaceId, fn) {
    const w = cloneWorld(world);
    if (spaceId === 'lodging') {
        const s = w.lodging?.[charId];
        if (!s) return { error: 'No tienes habitación alquilada.' };
        s.furniture = fn(s.furniture ?? []);
        return { world: w };
    }
    const plotId = String(spaceId).replace(/^prop:/, '');
    const prop = w.estate?.properties?.[plotId];
    if (!prop || prop.owner !== charId) return { error: 'Esa propiedad no es tuya.' };
    prop.furniture = fn(prop.furniture ?? []);
    return { world: w };
}

/** Colocar un mueble del inventario en un espacio (si cabe). */
export function placeFurniture(world, ctx, { charId, character, itemId, spaceId }) {
    const item = ctx.item(itemId);
    if (!isFurniture(item)) return { error: 'Eso no es un mueble.' };
    if (!character) return { error: 'Elige un personaje.' };
    const space = spacesOf(world, ctx, charId).find((s) => s.id === spaceId);
    if (!space) return { error: 'Ese espacio no está disponible.' };
    if (space.used + item.furniture.size > space.capacity) return { error: `No cabe: ${space.label} tiene ${space.capacity} hueco(s) y ya usas ${space.used} (este mueble ocupa ${item.furniture.size}).` };
    const taken = takeItem(character, item, 1);
    if (taken.error) return { error: 'No tienes ese mueble en el inventario.' };
    const res = editSpace(world, ctx, charId, spaceId, (list) => [...list, itemId]);
    if (res.error) return res;
    return { world: res.world, character: taken.character, message: `${item.name} colocado en ${space.label}.` };
}

/** Recoger un mueble colocado: vuelve al inventario. */
export function removeFurniture(world, ctx, { charId, character, itemId, spaceId }) {
    const item = ctx.item(itemId);
    if (!item) return { error: 'Mueble desconocido.' };
    if (!character) return { error: 'Elige un personaje.' };
    let found = false;
    const res = editSpace(world, ctx, charId, spaceId, (list) => {
        const i = list.indexOf(itemId);
        if (i < 0) return list;
        found = true;
        return [...list.slice(0, i), ...list.slice(i + 1)];
    });
    if (res.error) return res;
    if (!found) return { error: 'Ese mueble no está ahí.' };
    return { world: res.world, character: grantItem(character, item, 1), message: `${item.name} vuelve a tu inventario.` };
}
