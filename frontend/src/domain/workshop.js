// Taller del Ingeniero: artefactos equipados por hueco de complejidad, reserva
// de Energía, inventario de materiales y construcción de objetos (catálogo +
// diseños propios) con módulos. Funciones puras: reciben un personaje y
// devuelven uno NUEVO (o errores), como el resto del dominio.
//
// Reglas (las de la clase): cada receta o módulo tiene una complejidad que fija
// su valor total, su tiempo y el nivel de Ingeniero necesario. Los materiales
// forman parte de ese valor; el resto se paga en oro. El Discípulo del
// Artilugio paga la mitad de oro y tiempo; los Guantes maestros de hojalatero
// equipados reducen el tiempo a la mitad.

import catalog from '../data/taller.json';
import { getClass } from '../data/index.js';
import { knownChoices, choiceListDef } from './class-choices.js';

export const TIERS = Object.freeze(['Trivial', 'Simple', 'Avanzado', 'Intrincado']);
export const TIER_ENERGY = Object.freeze({ Trivial: 1, Simple: 2, Avanzado: 4, Intrincado: 6 });
export const COMPLEXITY = catalog.complejidades;
export const MATERIALS = catalog.materiales;
export const CATEGORIES = catalog.categorias;
export const MODULE_TYPES = catalog.tiposModulo;
const MATERIAL_IDS = new Set(MATERIALS.map((m) => m.id));
const CATEGORY_IDS = new Set(CATEGORIES.map((x) => x.id));
const TYPE_IDS = new Set(MODULE_TYPES.map((x) => x.id));
export const materialName = (id) => MATERIALS.find((m) => m.id === id)?.nombre ?? id;
export const categoryName = (id) => CATEGORIES.find((x) => x.id === id)?.nombre ?? id;
export const moduleTypeName = (id) => MODULE_TYPES.find((x) => x.id === id)?.nombre ?? id;
const materialPrice = (id) => MATERIALS.find((m) => m.id === id)?.precio ?? 0;

const MAX_STOCK = 9999;
const MAX_DESIGNS = 60;
const MAX_CREATIONS = 200;
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const text = (v, max = 120) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const clampInt = (v, min, max) => Math.min(max, Math.max(min, Math.trunc(Number(v)) || 0));

export function createWorkshop() {
  return { energy: null, equipped: [], materials: {}, creations: [], designs: [] };
}

// ── Nivel, Energía y huecos ──────────────────────────────────────────────

/** Clase con Taller del personaje (la primera que declara `taller: true`) y su nivel. */
export function workshopClass(c) {
  const key = [...new Set((c.levels ?? []).map((l) => l.classKey))].find((k) => getClass(k)?.taller);
  if (!key) return null;
  return { classKey: key, level: c.levels.filter((l) => l.classKey === key).length, subclass: c.subclasses?.[key] ?? null };
}
export const hasWorkshop = (c) => workshopClass(c) !== null || (c.workshop?.creations?.length ?? 0) > 0;

/** Energía máxima: 2 × nivel (desde el 2) + Batería de maná del Tecnoteúrgo (Int × 1/2/3 a los niveles 5/10/15). */
export function energyMax(c, intMod = 0) {
  const w = workshopClass(c);
  if (!w || w.level < 2) return 0;
  let max = 2 * w.level;
  if (w.subclass === 'tecnoteurgo') {
    const tiers = w.level >= 15 ? 3 : w.level >= 10 ? 2 : w.level >= 5 ? 1 : 0;
    max += tiers * Math.max(0, intMod);
  }
  return max;
}
export function energyNow(c, intMod = 0) {
  const max = energyMax(c, intMod);
  const v = c.workshop?.energy;
  return v === null || v === undefined ? max : Math.min(max, Math.max(0, v));
}

/** Huecos por complejidad, leídos de la tabla de la clase («Artefactos equipados (T · S · A · I)»). */
export function slotsFor(c) {
  const w = workshopClass(c);
  if (!w) return Object.fromEntries(TIERS.map((t) => [t, 0]));
  const cubo = getClass(w.classKey)?.niveles?.[String(w.level)]?.infoCubo;
  const col = cubo?.columnas?.findIndex((x) => /artefactos equipados/i.test(x)) ?? -1;
  const cells = col >= 0 ? String(cubo.filas?.[0]?.[col] ?? '').split('·') : [];
  return Object.fromEntries(TIERS.map((t, i) => [t, Number.parseInt(cells[i], 10) || 0]));
}

/** Artefactos (esquemas) conocidos, con su complejidad y descripción. */
export function knownGadgets(c) {
  const w = workshopClass(c);
  if (!w) return [];
  const def = choiceListDef(w.classKey, w.subclass, 'esquemas');
  const ids = knownChoices(c, w.classKey).esquemas ?? [];
  return ids.map((id) => {
    const o = def?.opciones?.find((x) => x.id === id);
    return { id, nombre: o?.nombre ?? id, complejidad: TIERS.includes(o?.complejidad) ? o.complejidad : 'Trivial', descripcion: o?.descripcion ?? '', activacion: o?.activacion ?? '' };
  });
}

/** Complejidad que la Mente brillante (Artilugio 20) deja siempre equipada. */
function alwaysEquippedTier(c) {
  const w = workshopClass(c);
  const v = w ? knownChoices(c, w.classKey)['complejidad-maestra']?.[0] : null;
  return TIERS.find((t) => t.toLowerCase() === v) ?? null;
}

/**
 * ¿Caben estos artefactos en los huecos? Un artefacto ocupa un hueco de su
 * complejidad o superior: para cada complejidad, los equipados de esa o más
 * no pueden superar los huecos de esa o más.
 */
export function slotUsage(c, equipped = c.workshop?.equipped ?? []) {
  const slots = slotsFor(c);
  const always = alwaysEquippedTier(c);
  const gadgets = knownGadgets(c);
  const byId = new Map(gadgets.map((g) => [g.id, g]));
  const used = Object.fromEntries(TIERS.map((t) => [t, 0]));
  for (const id of equipped) {
    const g = byId.get(id);
    if (g && g.complejidad !== always) used[g.complejidad] += 1;
  }
  let ok = true;
  for (let i = TIERS.length - 1; i >= 0; i--) {
    const need = TIERS.slice(i).reduce((s, t) => s + used[t], 0);
    const have = TIERS.slice(i).reduce((s, t) => s + slots[t], 0);
    if (need > have) ok = false;
  }
  return { slots, used, ok, always };
}

export function setEquipped(c, id, on) {
  const known = knownGadgets(c).map((g) => g.id);
  if (!known.includes(id)) return { character: c, errors: ['No conoces ese esquema.'] };
  const current = (c.workshop?.equipped ?? []).filter((x) => known.includes(x));
  const next = on ? [...new Set([...current, id])] : current.filter((x) => x !== id);
  if (on && !slotUsage(c, next).ok) return { character: c, errors: ['No te quedan huecos de esa complejidad (ni de una superior).'] };
  const out = structuredClone(c);
  out.workshop = { ...createWorkshop(), ...out.workshop, equipped: next };
  return { character: out, errors: [] };
}

/** Gasta (negativo recupera) Energía. `rest`: 'corto' recupera tu nivel; 'largo', todo. */
export function changeEnergy(c, { delta = 0, rest = null, intMod = 0 } = {}) {
  const max = energyMax(c, intMod);
  let now = energyNow(c, intMod);
  if (rest === 'largo') now = max;
  else if (rest === 'corto') now = Math.min(max, now + (workshopClass(c)?.level ?? 0));
  else now = Math.min(max, Math.max(0, now - delta));
  const out = structuredClone(c);
  out.workshop = { ...createWorkshop(), ...out.workshop, energy: now >= max ? null : now };
  return out;
}

// ── Monedas y materiales ─────────────────────────────────────────────────

const COIN_CP = { pp: 1000, gp: 100, sp: 10, cp: 1 };
export const coinsInCp = (coins) => Object.entries(COIN_CP).reduce((t, [k, v]) => t + (Number(coins?.[k]) || 0) * v, 0);

/**
 * Paga `costCp` y devuelve las monedas resultantes (o null si no alcanza).
 * Conserva el platino que se pueda y da el cambio en oro, plata y cobre.
 */
export function payCoins(coins, costCp) {
  const total = coinsInCp(coins);
  if (costCp > total) return null;
  let rest = total - costCp;
  const pp = Math.min(Number(coins.pp) || 0, Math.floor(rest / 1000));
  rest -= pp * 1000;
  const gp = Math.floor(rest / 100); rest -= gp * 100;
  const sp = Math.floor(rest / 10); rest -= sp * 10;
  return { ...coins, pp, gp, sp, cp: rest };
}

export function adjustMaterial(c, id, delta) {
  if (!MATERIAL_IDS.has(id)) return c;
  const out = structuredClone(c);
  out.workshop = { ...createWorkshop(), ...out.workshop };
  const qty = clampInt((out.workshop.materials[id] ?? 0) + delta, 0, MAX_STOCK);
  out.workshop.materials = { ...out.workshop.materials, [id]: qty };
  if (!qty) delete out.workshop.materials[id];
  return out;
}

export function buyMaterial(c, id, qty = 1) {
  if (!MATERIAL_IDS.has(id) || qty < 1) return { character: c, errors: ['Material desconocido.'] };
  const coins = payCoins(c.equipment.coins, materialPrice(id) * qty * 100);
  if (!coins) return { character: c, errors: [`No tienes suficiente oro (${materialPrice(id) * qty} po).`] };
  const out = adjustMaterial(c, id, qty);
  out.equipment.coins = coins;
  return { character: out, errors: [] };
}

/** Héroe del desguace (nivel 9): `roll` = 1d4; añade 1d4 + nivel de Chatarra (1 po cada una). */
export function scavenge(c, roll) {
  const w = workshopClass(c);
  if (!w || w.level < 9) return { character: c, errors: ['Necesitas el rasgo Héroe del desguace (Ingeniero 9).'], found: 0 };
  const found = clampInt(roll, 1, 4) + w.level;
  return { character: adjustMaterial(c, 'chatarra', found), errors: [], found };
}

// ── Recetas, módulos y diseños ───────────────────────────────────────────

export function allRecipes(c) {
  return [...catalog.recetas.map((r) => ({ ...r, origen: 'catalogo' })),
    ...(c.workshop?.designs ?? []).filter((d) => d.kind === 'receta').map((d) => ({ ...d, origen: 'diseno' }))];
}
export function allModules(c) {
  return [...catalog.modulos.map((m) => ({ ...m, origen: 'catalogo' })),
    ...(c.workshop?.designs ?? []).filter((d) => d.kind === 'modulo').map((d) => ({ ...d, origen: 'diseno' }))];
}
/** Módulos que encajan en una ranura de una receta. */
export const modulesFor = (c, recipe, slotType) => allModules(c).filter((m) => m.tipo === slotType && m.categorias.includes(recipe.categoria));

const materialsValue = (mat) => Object.entries(mat ?? {}).reduce((t, [id, q]) => t + materialPrice(id) * q, 0);

/**
 * Plan de construcción: materiales (tienes / necesitas), oro, tiempo,
 * herramientas, nivel y el objeto resultante. No modifica nada.
 * @param {{ toolNames?: string[], weaponNames?: string[], scores?: object, proficiency?: number }} sheetInfo
 */
export function planBuild(c, recipeId, moduleIds = [], { name = '', toolNames = [], weaponNames = [], scores = null, proficiency = 2 } = {}) {
  const errors = [];
  const recipe = allRecipes(c).find((r) => r.id === recipeId);
  if (!recipe) return { errors: ['Receta desconocida.'] };
  const w = workshopClass(c);
  const level = w?.level ?? 0;
  const modules = moduleIds.filter(Boolean).map((id) => allModules(c).find((m) => m.id === id)).filter(Boolean);
  // Ranuras: cada módulo ocupa una ranura de su tipo, sin repetir módulo.
  const free = [...(recipe.ranuras ?? [])];
  for (const m of modules) {
    const i = free.indexOf(m.tipo);
    if (i < 0 || !m.categorias.includes(recipe.categoria)) errors.push(`«${m.nombre}» no encaja en ${recipe.nombre}.`);
    else free.splice(i, 1);
  }
  if (new Set(modules.map((m) => m.id)).size !== modules.length) errors.push('No puedes repetir un módulo.');
  for (const part of [recipe, ...modules]) {
    const need = COMPLEXITY[part.complejidad]?.nivel ?? 99;
    if (level < need) errors.push(`«${part.nombre}» es ${part.complejidad.toLowerCase()}: necesitas Ingeniero ${need}.`);
  }
  const tools = recipe.herramientas ?? [];
  const toolsOk = !tools.length || tools.some((t) => toolNames.includes(t));
  if (!toolsOk) errors.push(`Necesitas competencia con ${tools.join(' o ')}.`);

  const materials = {};
  for (const part of [recipe, ...modules]) {
    for (const [id, q] of Object.entries(part.materiales ?? {})) materials[id] = (materials[id] ?? 0) + q;
  }
  const stock = c.workshop?.materials ?? {};
  const missing = Object.entries(materials).filter(([id, q]) => (stock[id] ?? 0) < q).map(([id, q]) => ({ id, need: q, have: stock[id] ?? 0 }));
  if (missing.length) errors.push(`Te faltan materiales: ${missing.map((m) => `${materialName(m.id)} (${m.have}/${m.need})`).join(', ')}.`);

  const gadgeteer = w?.subclass === 'artilugio';
  const gloves = (c.workshop?.equipped ?? []).includes('guantes-maestros-hojalatero');
  let value = 0;
  let matValue = 0;
  let hours = 0;
  for (const part of [recipe, ...modules]) {
    const cx = COMPLEXITY[part.complejidad] ?? COMPLEXITY.Trivial;
    const mv = materialsValue(part.materiales);
    matValue += mv;
    value += Math.max(cx.valor, mv);
    hours += cx.horas;
  }
  let gold = value - matValue;
  if (gadgeteer) { gold /= 2; hours /= 2; }
  if (gloves) hours /= 2;
  gold = Math.ceil(gold);
  if (coinsInCp(c.equipment?.coins) < gold * 100) errors.push(`Te falta oro: cuesta ${gold} po además de los materiales.`);

  const item = describeResult(recipe, modules, { name, weaponNames, scores, proficiency });
  return {
    recipe, modules, freeSlots: free, materials, missing, gold, hours, value, toolsOk, tools, item,
    discounts: [gadgeteer && 'Discípulo del Artilugio: mitad de oro y tiempo', gloves && 'Guantes maestros de hojalatero: mitad de tiempo'].filter(Boolean),
    errors,
  };
}

/** Texto y estadísticas del objeto que sale del Taller. */
function describeResult(recipe, modules, { name, weaponNames, scores, proficiency }) {
  const res = recipe.resultado ?? { tipo: 'objeto' };
  const label = text(name) || recipe.nombre;
  const extras = modules.map((m) => `${m.nombre}: ${m.efecto}`);
  const atk = modules.reduce((t, m) => t + (Number(m.ataque) || 0), 0);
  const caBonus = modules.reduce((t, m) => t + (Number(m.ca) || 0), 0);
  const dmgExtra = modules.map((m) => m.dano).filter(Boolean);
  const lines = [`Taller · ${recipe.nombre} (${recipe.complejidad})`];
  let weapon = null;
  if (res.tipo === 'arma') {
    const ability = res.atributo === 'fuerza' && /sutil/i.test(res.propiedades ?? '') && scores
      ? (scores.destreza.modifier > scores.fuerza.modifier ? 'destreza' : 'fuerza') : (res.atributo ?? 'destreza');
    const mod = scores?.[ability]?.modifier ?? 0;
    const proficient = !res.competencia || weaponNames.includes(res.competencia);
    const bonus = mod + (proficient ? proficiency : 0) + atk;
    const damage = `${res.dado}${mod ? ` ${mod > 0 ? '+' : '−'} ${Math.abs(mod)}` : ''} ${res.tipoDano}${dmgExtra.length ? ` ${dmgExtra.join(' ')}` : ''}`;
    weapon = { name: label, attackBonus: `${bonus >= 0 ? '+' : ''}${bonus}`, damage };
    lines.push(`${res.dado} ${res.tipoDano}${res.alcance ? ` · alcance ${res.alcance}` : ''}${res.propiedades ? ` · ${res.propiedades}` : ''}${atk ? ` · +${atk} al ataque` : ''}${res.peso ? ` · ${res.peso}` : ''}`);
  } else if (res.tipo === 'armadura') {
    lines.push(`${res.tipoArmadura} · CA ${res.ca}${caBonus ? ` (+${caBonus} por módulos)` : ''}${res.nota ? ` · ${res.nota}` : ''}`);
  } else if (res.nota) {
    lines.push(res.nota);
  }
  if (extras.length) lines.push(`Módulos: ${extras.join(' · ')}`);
  return { name: label, quantity: recipe.cantidad ?? 1, notes: lines.join('\n'), weapon };
}

/** Construye: gasta materiales y oro, añade el objeto al equipo (y el arma a los ataques). */
export function build(c, recipeId, moduleIds, opts = {}) {
  const plan = planBuild(c, recipeId, moduleIds, opts);
  if (plan.errors.length) return { character: c, errors: plan.errors, plan };
  const out = structuredClone(c);
  out.workshop = { ...createWorkshop(), ...out.workshop };
  const stock = { ...out.workshop.materials };
  for (const [id, q] of Object.entries(plan.materials)) {
    stock[id] = (stock[id] ?? 0) - q;
    if (stock[id] <= 0) delete stock[id];
  }
  out.workshop.materials = stock;
  out.equipment.coins = payCoins(out.equipment.coins, plan.gold * 100);
  out.equipment.items = [...out.equipment.items, { name: plan.item.name, quantity: plan.item.quantity, notes: plan.item.notes }];
  if (plan.item.weapon) {
    const i = out.equipment.weapons.findIndex((x) => !x.name && !x.damage && !x.attackBonus);
    if (i >= 0) out.equipment.weapons[i] = plan.item.weapon;
    else out.equipment.weapons.push(plan.item.weapon);
  }
  out.workshop.creations = [...out.workshop.creations, {
    id: newId('cr'), recipeId, name: plan.item.name, modules: plan.modules.map((m) => m.id), materials: plan.materials, at: new Date().toISOString().slice(0, 10),
  }].slice(-MAX_CREATIONS);
  return { character: out, errors: [], plan };
}

/** Desmonta una creación: recuperas la mitad de los materiales (redondeando abajo). */
export function dismantle(c, creationId) {
  const cr = c.workshop?.creations?.find((x) => x.id === creationId);
  if (!cr) return { character: c, errors: ['Esa creación ya no existe.'] };
  let out = structuredClone(c);
  for (const [id, q] of Object.entries(cr.materials ?? {})) out = adjustMaterial(out, id, Math.floor(q / 2));
  out.workshop.creations = out.workshop.creations.filter((x) => x.id !== creationId);
  const idx = out.equipment.items.findIndex((it) => it.name === cr.name && it.notes.startsWith('Taller · '));
  if (idx >= 0) out.equipment.items.splice(idx, 1);
  return { character: out, errors: [] };
}

function newId(prefix) {
  const r = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return `${prefix}-${r.replace(/-/g, '').slice(0, 10)}`;
}

/**
 * Normaliza un diseño propio (receta o módulo). El coste y el tiempo no se
 * guardan: salen de la complejidad, como dice la clase.
 */
export function normalizeDesign(raw) {
  if (!isObject(raw) || !['receta', 'modulo'].includes(raw.kind)) return null;
  const nombre = text(raw.nombre, 80);
  const complejidad = TIERS.includes(raw.complejidad) ? raw.complejidad : null;
  if (!nombre || !complejidad) return null;
  const materiales = {};
  if (isObject(raw.materiales)) {
    for (const [id, q] of Object.entries(raw.materiales).slice(0, 8)) {
      const n = clampInt(q, 0, 50);
      if (MATERIAL_IDS.has(id) && n > 0) materiales[id] = n;
    }
  }
  const base = { id: /^d-[a-z0-9]{4,12}$/.test(raw.id) ? raw.id : newId('d'), kind: raw.kind, nombre, complejidad, materiales, descripcion: text(raw.descripcion, 600) };
  if (raw.kind === 'receta') {
    const categoria = CATEGORY_IDS.has(raw.categoria) ? raw.categoria : 'equipo';
    const tool = ['Herramientas de armero', 'Herramientas de herrero', 'Herramientas de hojalatero'].includes(raw.herramienta) ? raw.herramienta : 'Herramientas de hojalatero';
    const ranuras = (Array.isArray(raw.ranuras) ? raw.ranuras : []).filter((t) => TYPE_IDS.has(t)).slice(0, 6);
    const r = isObject(raw.resultado) ? raw.resultado : {};
    let resultado;
    if (categoria === 'arma-fuego' || categoria === 'arma-mecanica') {
      resultado = {
        tipo: 'arma', dado: /^\d{1,2}d\d{1,2}$/.test(text(r.dado, 8)) ? text(r.dado, 8) : '1d6', tipoDano: text(r.tipoDano, 30) || 'contundente',
        propiedades: text(r.propiedades, 160), alcance: text(r.alcance, 20) || undefined,
        competencia: categoria === 'arma-fuego' ? 'Armas de fuego' : (r.competencia === 'Armas marciales' ? 'Armas marciales' : 'Armas simples'),
        atributo: categoria === 'arma-fuego' ? 'destreza' : 'fuerza',
      };
      if (!resultado.alcance) delete resultado.alcance;
    } else if (categoria === 'armadura') {
      resultado = { tipo: 'armadura', ca: text(r.ca, 40) || '10', tipoArmadura: ['Ligera', 'Media', 'Pesada', 'Escudo'].includes(r.tipoArmadura) ? r.tipoArmadura : 'Ligera', nota: text(r.nota, 160) || undefined };
      if (!resultado.nota) delete resultado.nota;
    } else {
      resultado = { tipo: 'objeto', nota: text(r.nota, 300) || base.descripcion };
    }
    return { ...base, categoria, herramientas: [tool], ranuras, resultado };
  }
  const tipo = TYPE_IDS.has(raw.tipo) ? raw.tipo : 'sistema';
  const categorias = (Array.isArray(raw.categorias) ? raw.categorias : []).filter((x) => CATEGORY_IDS.has(x));
  const mod = { ...base, tipo, categorias: categorias.length ? [...new Set(categorias)] : ['equipo'], efecto: text(raw.efecto, 300) || base.descripcion || 'Sin efecto descrito.' };
  const ataque = clampInt(raw.ataque, 0, 3);
  const ca = clampInt(raw.ca, 0, 3);
  const dano = text(raw.dano, 30);
  if (ataque) mod.ataque = ataque;
  if (ca) mod.ca = ca;
  if (/^\+\d{1,2}d\d{1,2}( [a-záéíóú]+)?$/i.test(dano)) mod.dano = dano;
  return mod;
}

export function saveDesign(c, raw) {
  const d = normalizeDesign(raw);
  if (!d) return { character: c, errors: ['Ponle nombre y complejidad al diseño.'] };
  if (!Object.keys(d.materiales).length) return { character: c, errors: ['Indica al menos un material.'] };
  const out = structuredClone(c);
  out.workshop = { ...createWorkshop(), ...out.workshop };
  const list = out.workshop.designs.filter((x) => x.id !== d.id);
  if (list.length >= MAX_DESIGNS) return { character: c, errors: [`Máximo ${MAX_DESIGNS} diseños.`] };
  out.workshop.designs = [...list, d];
  return { character: out, errors: [], design: d };
}

export function removeDesign(c, id) {
  const out = structuredClone(c);
  out.workshop = { ...createWorkshop(), ...out.workshop, designs: (out.workshop?.designs ?? []).filter((x) => x.id !== id) };
  return out;
}

/** Normaliza el estado del Taller de un personaje importado o compartido. */
export function normalizeWorkshop(raw) {
  const w = createWorkshop();
  if (!isObject(raw)) return w;
  w.energy = raw.energy === null || raw.energy === undefined ? null : clampInt(raw.energy, 0, 999);
  w.equipped = [...new Set((Array.isArray(raw.equipped) ? raw.equipped : []).map((x) => text(x, 60)).filter((x) => /^[a-z0-9-]+$/.test(x)))].slice(0, 60);
  if (isObject(raw.materials)) {
    for (const [id, q] of Object.entries(raw.materials)) {
      const n = clampInt(q, 0, MAX_STOCK);
      if (MATERIAL_IDS.has(id) && n > 0) w.materials[id] = n;
    }
  }
  w.designs = (Array.isArray(raw.designs) ? raw.designs : []).slice(0, MAX_DESIGNS).map(normalizeDesign).filter(Boolean);
  w.creations = (Array.isArray(raw.creations) ? raw.creations : []).slice(-MAX_CREATIONS).map((x) => {
    if (!isObject(x)) return null;
    const materials = {};
    if (isObject(x.materials)) for (const [id, q] of Object.entries(x.materials)) if (MATERIAL_IDS.has(id)) materials[id] = clampInt(q, 0, MAX_STOCK);
    return {
      id: /^cr-[a-z0-9]{4,12}$/.test(x.id) ? x.id : newId('cr'), recipeId: text(x.recipeId, 60), name: text(x.name, 120) || 'Creación',
      modules: (Array.isArray(x.modules) ? x.modules : []).map((m) => text(m, 60)).filter(Boolean).slice(0, 8), materials, at: text(x.at, 20),
    };
  }).filter(Boolean);
  return w;
}
