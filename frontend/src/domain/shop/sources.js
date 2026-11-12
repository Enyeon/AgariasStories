// Fuentes del catálogo de la Tienda. Ninguna copia datos que ya existen:
//   - data/shop/items.json: equipo, armas, objetos mágicos… (datos propios de la Tienda);
//   - data/taller.json: los materiales del Taller del Ingeniero, tal cual (precio en po);
//   - Homebrew: objetos («objeto») publicados con un coste, leídos del registro.

import baseItems from '../../data/shop/items.json';
import taller from '../../data/taller.json';
import { COIN_VALUE } from '../money.js';

/** Materiales del Taller como artículos de la Tienda (se entregan en `workshop.materials`). */
export function tallerItems(catalog = taller) {
  return catalog.materiales.map((m) => ({
    id: `taller-${m.id}`,
    name: m.nombre,
    category: 'tecnologia',
    sub: 'material',
    rarity: m.precio >= 50 ? 'uncommon' : 'common',
    price: Math.round(m.precio * 100),
    desc: m.descripcion,
    props: { Uso: 'Material del Taller del Ingeniero' },
    tags: ['ingeniero', 'taller'],
    stack: true,
    origin: 'taller',
    grant: { kind: 'workshop-material', id: m.id },
  }));
}

const RARITY = { común: 'common', comun: 'common', 'poco común': 'uncommon', 'poco comun': 'uncommon', raro: 'rare', 'muy raro': 'veryRare', legendario: 'legendary', artefacto: 'unique' };
const UNIT = { pc: 'cp', pp: 'sp', po: 'gp', ppt: 'pp', cp: 'cp', sp: 'sp', gp: 'gp' };

/** «1.500 po», «5 pp», «2 ppt» → pc. null si no se entiende. */
export function parseCost(text) {
  const m = /^\s*([\d.,]+)\s*(ppt|po|pp|pc|gp|sp|cp)\b/i.exec(String(text ?? ''));
  if (!m) return null;
  const n = Number(m[1].replace(/\./g, '').replace(',', '.'));
  const coin = UNIT[m[2].toLowerCase()];
  return Number.isFinite(n) && n > 0 && coin ? Math.round(n * COIN_VALUE[coin]) : null;
}

/** Objetos Homebrew con coste → artículos (categoría Objetos mágicos, etiqueta «homebrew»). */
export function homebrewItems(entries) {
  return entries.map((e) => {
    const price = parseCost(e.item?.cost);
    if (!price) return null;
    return {
      id: e.ref,
      name: e.item.name,
      category: 'magicos',
      sub: 'maravilloso',
      rarity: RARITY[String(e.item.rarity ?? '').toLowerCase()] ?? 'uncommon',
      price,
      desc: e.item.description ?? '',
      props: { ...(e.item.kind ? { Tipo: e.item.kind } : {}), ...(e.item.attunement ? { Sintonización: 'Requiere' } : {}), ...(e.item.weight ? { Peso: e.item.weight } : {}) },
      tags: ['homebrew', 'arcano'],
      origin: 'homebrew',
    };
  }).filter(Boolean);
}

/** Todas las fuentes, en orden (las posteriores pueden sustituir a las anteriores). */
export function catalogSources({ homebrew = [] } = {}) {
  return [
    { origin: 'data', items: baseItems.items },
    { origin: 'taller', items: tallerItems() },
    { origin: 'homebrew', items: homebrewItems(homebrew) },
  ];
}
