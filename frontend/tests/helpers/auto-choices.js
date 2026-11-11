// Pruebas que suben de nivel clases con elecciones (Guerrero: estilo de combate,
// maestría en armas…) sin que la elección sea lo que se prueba: si no se indican,
// se eligen automáticamente las primeras opciones válidas.
import fs from 'node:fs';
import path from 'node:path';
import * as real from '../../src/domain/progression.js';
import { knownChoices, choiceOptions, expandGrants } from '../../src/domain/class-choices.js';

const SPELLS = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../src/data/spells.json'), 'utf8'));

export function autoChoices(c, classKey, subclass) {
  const plan = real.planLevelUp(c, classKey, { subclass });
  const subKey = c.subclasses?.[classKey] ?? (plan.needsSubclass ? subclass : null);
  const known = knownChoices(c, classKey);
  const out = {};
  // Repite mientras una opción elegida abra elecciones nuevas (opciones[].elegir).
  for (let pass = 0; pass < 4; pass++) {
    let added = false;
    for (const g of expandGrants(classKey, subKey, plan.choices, out)) {
      if (!g.cantidad || out[g.lista]?.add.length >= g.cantidad) continue;
      const have = [...(known[g.lista] ?? []), ...(out[g.lista]?.add ?? [])];
      const opts = choiceOptions(g.def, { nivelMax: g.nivelMax, spells: SPELLS, known: known[g.lista] ?? [], pool: have, nivel: g.level ?? null });
      const pool = opts
        ? opts.filter((o) => !o.blocked).map((o) => o.value).filter((v) => !have.includes(v))
        : Array.from({ length: g.cantidad + 2 }, (_, i) => `${g.def.titulo} ${have.length + i + 1}`).filter((v) => !have.includes(v));
      const prev = out[g.lista]?.add ?? [];
      out[g.lista] = { add: [...prev, ...pool.slice(0, g.cantidad - prev.length)], remove: [] };
      added = true;
    }
    if (!added) break;
  }
  return out;
}

export function withChoices(c, ch) {
  if (!ch?.classKey || ch.featureChoices?.elecciones || !safePlan(c, ch.classKey) || !c.race?.key) return ch;
  return { ...ch, featureChoices: { ...(ch.featureChoices ?? {}), elecciones: autoChoices(c, ch.classKey, ch.subclass) } };
}

function safePlan(c, classKey) {
  try { return real.planLevelUp(c, classKey); } catch { return null; }
}

export const applyLevelUp = (c, ch) => real.applyLevelUp(c, withChoices(c, ch));

export function applyLevelUps(c, list) {
  const filled = [];
  let cur = c;
  for (const ch of list) {
    const f = withChoices(cur, ch);
    filled.push(f);
    const res = real.applyLevelUp(cur, f);
    if (res.errors.length) { filled.push(...list.slice(filled.length)); break; }
    cur = res.character;
  }
  return real.applyLevelUps(c, filled);
}
