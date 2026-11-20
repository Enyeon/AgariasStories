// Criaturas vinculadas: la criatura (estadísticas) y el vínculo (relación).
//
// - La CRIATURA vive en el registro: Homebrew del DM («hb:…:criatura:…»), las
//   criaturas de sangre de Agarias («sangre:<id>») o un bloque propio guardado
//   en el propio vínculo (`custom`) cuando no está en ningún catálogo.
// - El VÍNCULO vive en el personaje: tipo (mascota, familiar…), nombre propio,
//   PG actuales, condiciones, si está presente, origen y notas.
// El tipo de vínculo es una etiqueta: las reglas concretas (un familiar no
// ataca, una invocación desaparece…) las da el rasgo o conjuro que la origina.

import { data } from '../data/index.js';
import { engineOf, getEntry } from '../content/registry.js';
import { createCompanion } from './schema.js';
import { normalizeCompanion } from './validation.js';
import { hitPoints, abilityScores } from './rules.js';

const BLOOD_PREFIX = 'sangre:';
const CLASS_PREFIX = 'clase:';

/** Grupos de invocaciones de clase o raza habilitados (efecto `habilita: invocaciones_<grupo>`). */
export function enabledCreatureGroups(enabled) {
  return Object.keys(data.classCreatures).filter((g) => enabled?.has?.(`invocaciones_${g}`));
}

const evalAc = (ac, prof) => (typeof ac === 'number' ? ac : ac && typeof ac === 'object' ? (ac.base ?? 10) + (ac.bc ? prof : 0) : null);

function evalHp(hp, owner) {
  if (typeof hp === 'number') return hp;
  if (!hp || typeof hp !== 'object' || !owner) return null;
  const level = Math.max(1, owner.levels?.length ?? 0);
  const scores = abilityScores(owner);
  const mod = hp.atributo ? scores[hp.atributo]?.modifier ?? 0 : 0;
  return Math.max(1, (hp.base ?? 0) + (hp.porNivel ?? 0) * level + mod);
}

/** Opciones de criatura para un personaje: [{ ref, name, group }] */
export function creatureOptions({ blood = false, catalog = [], groups = [] } = {}) {
  const out = catalog.map((e) => ({ ref: e.ref, name: e.item.name, group: e.packName ?? 'Homebrew' }));
  for (const g of groups) {
    const grp = data.classCreatures[g];
    for (const [id, cr] of Object.entries(grp?.criaturas ?? {})) out.push({ ref: `${CLASS_PREFIX}${g}:${id}`, name: cr.name, group: grp.nombre ?? g });
  }
  if (blood) {
    for (const [id, c] of Object.entries(data.bloodCreatures)) out.push({ ref: `${BLOOD_PREFIX}${id}`, name: c.name, group: 'Criaturas de sangre' });
  }
  return out;
}

/**
 * Bloque de estadísticas de un vínculo, venga de donde venga.
 * @returns {{ name, source, size?, creatureType?, ac?, hpMax?, speed?, abilities?, lines: Array<{label,text}>, traits, actions, reactions, resistances, immunities, vulnerabilities, conditionImmunities, missing? }}
 */
export function creatureBlock(companion, owner) {
  const ref = companion.creatureRef;
  if (ref?.startsWith(BLOOD_PREFIX)) {
    const b = data.bloodCreatures[ref.slice(BLOOD_PREFIX.length)];
    if (!b) return { name: companion.name, source: 'Criatura de sangre', missing: true, lines: [], traits: [], actions: [], reactions: [] };
    const ownerHp = owner ? hitPoints(owner, abilityScores(owner)).max : 0;
    return {
      name: b.name,
      source: 'Criatura de sangre (Cazador · Orden del Invocador)',
      hpMax: Math.max(1, Math.floor((ownerHp * b.hpPercent) / 100)),
      hpNote: `${b.hpPercent}% de los PG máximos del invocador`,
      lines: [
        { label: 'Daño', text: b.damage },
        { label: `Ataque${b.attackName ? `: ${b.attackName}` : ''}`, text: b.attack },
        { label: 'Amplificación', text: b.amplification },
        ...(b.quirk && b.quirk !== '——' ? [{ label: 'Peculiaridad', text: b.quirk }] : []),
        ...(b.requirement && b.requirement !== '——' ? [{ label: 'Requisito', text: b.requirement }] : []),
      ],
      traits: [], actions: [], reactions: [],
    };
  }
  if (ref?.startsWith(CLASS_PREFIX)) {
    const [g, id] = ref.slice(CLASS_PREFIX.length).split(':');
    const grp = data.classCreatures[g];
    const b = grp?.criaturas?.[id];
    if (!b) return { name: companion.name, source: grp?.nombre ?? 'Invocación', missing: true, lines: [], traits: [], actions: [], reactions: [] };
    const level = Math.max(1, owner?.levels?.length ?? 0);
    const prof = 2 + Math.floor((level - 1) / 4);
    const mejoras = (b.mejoras ?? []).filter((m) => level >= m.nivel);
    return {
      name: b.name,
      source: grp.fuente ?? grp.nombre,
      size: b.size, creatureType: b.creatureType,
      ac: evalAc(b.ac, prof), hpMax: evalHp(b.hp, owner),
      hpNote: b.hp && typeof b.hp === 'object' ? b.hpTexto : undefined,
      speed: b.speed, abilities: b.abilities,
      capacity: b.capacidad !== false,
      lines: [
        ...(b.senses ? [{ label: 'Sentidos', text: b.senses }] : []),
        ...(b.languages ? [{ label: 'Idiomas', text: b.languages }] : []),
        ...(b.capacidad === false ? [{ label: 'Capacidad', text: 'No ocupa la Capacidad de Manifestación' }] : []),
      ],
      description: b.description,
      traits: [...(b.traits ?? []), ...mejoras.map((m) => ({ name: `Mejora (nivel ${m.nivel})`, text: m.texto }))],
      actions: b.actions ?? [], reactions: b.reactions ?? [],
    };
  }
  if (ref) {
    const item = engineOf('criatura', ref);
    const entry = getEntry(ref);
    if (!item) return { name: companion.name, source: 'Criatura no disponible', missing: true, lines: [], traits: [], actions: [], reactions: [] };
    return {
      name: item.name,
      source: entry?.origin === 'snapshot' ? 'Copia guardada en la ficha' : `Homebrew · ${entry?.packName ?? ''}`,
      size: item.size, creatureType: item.creatureType, alignment: item.alignment,
      ac: item.ac, hpMax: item.hp, hitDice: item.hitDice, speed: item.speed, abilities: item.abilities, challenge: item.challenge,
      lines: [
        ...(item.saves ? [{ label: 'Salvaciones', text: item.saves }] : []),
        ...(item.skills ? [{ label: 'Habilidades', text: item.skills }] : []),
        ...(item.senses ? [{ label: 'Sentidos', text: item.senses }] : []),
        ...(item.languages ? [{ label: 'Idiomas', text: item.languages }] : []),
      ],
      description: item.description,
      traits: item.traits, actions: item.actions, reactions: item.reactions,
      resistances: item.resistances, immunities: item.immunities, vulnerabilities: item.vulnerabilities, conditionImmunities: item.conditionImmunities,
    };
  }
  const x = companion.custom ?? {};
  return {
    name: companion.name,
    source: 'Bloque propio',
    size: x.size, creatureType: x.type, ac: x.ac ?? null, hpMax: x.hpMax ?? null, speed: x.speed,
    description: x.text, lines: [], traits: [], actions: [], reactions: [],
  };
}

/** PG actuales (si no se han tocado, los máximos). */
/**
 * Capacidad de Manifestación: cuántas invocaciones están fuera y cuántas se
 * permiten (bono `invocaciones`). Sólo cuentan los vínculos de tipo
 * «invocación» presentes cuya criatura ocupa capacidad.
 */
export function summonUsage(c, capacity) {
  const out = (c.companions ?? []).filter((x) => x.bond === 'invocacion' && x.present && creatureBlock(x, c).capacity !== false);
  return { used: out.length, capacity, over: capacity > 0 && out.length > capacity };
}

/** ¿Se puede manifestar (marcar presente) esta criatura sin pasar la capacidad? */
export function canManifest(c, id, capacity) {
  const comp = (c.companions ?? []).find((x) => x.id === id);
  if (!comp || comp.present || comp.bond !== 'invocacion' || !(capacity > 0)) return true;
  if (creatureBlock(comp, c).capacity === false) return true;
  return summonUsage(c, capacity).used < capacity;
}

export function companionHp(companion, block) {
  return companion.currentHp ?? block.hpMax ?? null;
}

// ── Cambios (devuelven un personaje NUEVO) ───────────────────────────────

export function addCompanion(c, raw) {
  const comp = normalizeCompanion({ ...createCompanion(), ...raw });
  if (!comp) return { character: c, errors: ['Indica al menos un nombre o elige una criatura.'] };
  if ((c.companions ?? []).length >= 30) return { character: c, errors: ['Máximo 30 criaturas por personaje.'] };
  const next = structuredClone(c);
  next.companions = [...(next.companions ?? []), comp];
  return { character: next, errors: [] };
}

export function updateCompanion(c, id, patch) {
  const i = (c.companions ?? []).findIndex((x) => x.id === id);
  if (i < 0) return { character: c, errors: ['La criatura ya no existe.'] };
  const comp = normalizeCompanion({ ...c.companions[i], ...patch, id });
  if (!comp) return { character: c, errors: ['Datos no válidos.'] };
  const next = structuredClone(c);
  next.companions[i] = comp;
  return { character: next, errors: [] };
}

export function removeCompanion(c, id) {
  const next = structuredClone(c);
  next.companions = (next.companions ?? []).filter((x) => x.id !== id);
  return next;
}

/** Aplica daño (positivo) o curación (negativo) respetando 0 y el máximo. */
export function damageCompanion(c, id, amount, block) {
  const comp = (c.companions ?? []).find((x) => x.id === id);
  if (!comp) return c;
  const max = block?.hpMax ?? null;
  let hp = companionHp(comp, block ?? {}) ?? 0;
  let temp = comp.tempHp;
  if (amount > 0) {
    const absorbed = Math.min(temp, amount);
    temp -= absorbed;
    hp -= amount - absorbed;
  } else {
    hp -= amount;
  }
  hp = Math.max(0, max ? Math.min(max, hp) : hp);
  return updateCompanion(c, id, { currentHp: hp, tempHp: temp }).character;
}
