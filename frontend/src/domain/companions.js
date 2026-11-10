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

/** Opciones de criatura para un personaje: [{ ref, name, group }] */
export function creatureOptions({ blood = false, catalog = [] } = {}) {
  const out = catalog.map((e) => ({ ref: e.ref, name: e.item.name, group: e.packName ?? 'Homebrew' }));
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
