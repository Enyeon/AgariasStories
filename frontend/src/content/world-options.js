// Opciones de los formularios del mundo de la Tienda (comerciantes, regiones,
// facciones, eventos): datos oficiales + Homebrew del paquete que se edita.
// Son funciones: se leen al abrir el editor, así siempre están al día.

import worldData from '../data/shop/world.json';
import factionsData from '../data/shop/factions.json';
import eventsData from '../data/shop/events.json';
import keepersData from '../data/shop/keepers.json';
import shopsData from '../data/shop/shops.json';
import professionsData from '../data/shop/professions.json';
import { CATEGORIES } from '../domain/shop/catalog.js';
import { buildCatalog } from '../domain/shop/catalog.js';
import { catalogSources, worldId, homebrewLocations } from '../domain/shop/sources.js';
import { listEntries } from './registry.js';

let editingPack = null;
/** Paquete que se está editando: sólo se ofrecen sus entidades (y las oficiales). */
export function setWorldEditingPack(packId) {
  editingPack = packId ?? null;
}
const mine = (type) => listEntries(type, { selectable: false }).filter((e) => !editingPack || e.packId === editingPack)
  .filter((e) => e.status !== 'retirado');

export function regionOptions() {
  const out = Object.fromEntries(worldData.regions.map((r) => [r.id, `${r.icon} ${r.name}`]));
  for (const e of mine('region')) out[worldId(e.ref, e.item)] = `${e.item.icon} ${e.item.name}${e.item.base ? ' (modificada)' : ''}`;
  return out;
}

export function locationOptions() {
  const out = {};
  for (const r of worldData.regions) for (const l of r.locations) out[l.id] = `${r.name} · ${l.name}${l.hidden ? ' (oculto)' : ''}`;
  for (const e of mine('region')) {
    for (const l of homebrewLocations(e.ref, e.item)) out[l.id] = `${e.item.name} · ${l.name}${l.hidden ? ' (oculto)' : ''}`;
  }
  return out;
}

export function factionOptions() {
  const out = Object.fromEntries(factionsData.factions.map((f) => [f.id, `${f.icon} ${f.name}`]));
  for (const e of mine('faccion')) out[worldId(e.ref, e.item)] = `${e.item.icon} ${e.item.name}`;
  return out;
}

export function eventOptions() {
  const out = Object.fromEntries(eventsData.events.map((ev) => [ev.id, `${ev.icon} ${ev.name}`]));
  for (const e of mine('evento')) out[worldId(e.ref, e.item)] = `${e.item.icon} ${e.item.name}`;
  return out;
}

export function merchantOptions() {
  const out = Object.fromEntries(keepersData.keepers.map((k) => [k.id, `${k.portrait} ${k.name}`]));
  for (const e of mine('mercader')) if (!e.item.base) out[e.ref] = `${e.item.portrait} ${e.item.name}`;
  return out;
}

export function shopOptions() {
  const out = Object.fromEntries(shopsData.shops.map((s) => [s.id, `${s.icon} ${s.name}`]));
  for (const e of mine('mercader')) if (!e.item.base) out[`${e.ref}/tienda`] = `${e.item.shopIcon} ${e.item.shopName || `Puesto de ${e.item.name}`}`;
  return out;
}

/** Ubicaciones y comerciantes que un secreto puede revelar. */
export function revealOptions() {
  return { '': '— Nada —', ...locationOptions() };
}

export const professionOptions = () => ({ '': '— Sin profesión —', ...Object.fromEntries(professionsData.professions.map((p) => [p.id, `${p.icon} ${p.label}`])) });

let itemCache = null;
/** Objetos del catálogo (Tienda + Taller + objetos Homebrew con precio). */
export function itemOptions() {
  if (!itemCache) {
    const homebrew = listEntries('objeto', { selectable: false });
    const catalog = buildCatalog(catalogSources({ homebrew }));
    itemCache = Object.fromEntries([...catalog.list].sort((a, b) => a.name.localeCompare(b.name, 'es')).map((i) => [i.id, i.name]));
    setTimeout(() => { itemCache = null; }, 5000);
  }
  return itemCache;
}
export const itemOrNone = () => ({ '': '— Ninguno —', ...itemOptions() });

/** Claves de producto: categorías, subcategorías y etiquetas. */
export function productOptions() {
  const out = {};
  for (const c of CATEGORIES) {
    out[c.id] = `${c.icon} ${c.label}`;
    for (const s of c.subs) out[`${c.id}/${s.id}`] = `${c.icon} ${c.label} › ${s.label}`;
  }
  for (const t of ['metal', 'madera', 'animal', 'arcano', 'turbio', 'bebida', 'especia', 'cocina', 'tela', 'joya', 'gema', 'libro', 'ingeniero', 'marino']) out[`#${t}`] = `# ${t}`;
  return out;
}
