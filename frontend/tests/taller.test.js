import { describe, it, expect } from 'vitest';
import { createCharacter, createDocument as toDocument } from '../src/domain/schema.js';
import { parseDocument } from '../src/domain/validation.js';
import { computeSheet } from '../src/domain/rules.js';
import { applyLevelUp, planLevelUp, setRace } from '../src/domain/progression.js';
import {
  slotsFor, slotUsage, setEquipped, energyMax, energyNow, changeEnergy, adjustMaterial,
  scavenge, planBuild, build, dismantle, saveDesign, knownGadgets, hasWorkshop,
} from '../src/domain/workshop.js';
import { payCoins, coinsInCp } from '../src/domain/money.js';
import { autoChoices } from './helpers/auto-choices.js';

const ASI = { type: 'asi', increases: { inteligencia: 2 } };
function ing(n, sub = 'mecha-batalla', esquemas1 = null) {
  let c = setRace(createCharacter(), 'Humano');
  for (let i = 0; i < n; i++) {
    const plan = planLevelUp(c, 'ingeniero', { subclass: sub });
    const subclass = plan.needsSubclass ? sub : null;
    const el = autoChoices(c, 'ingeniero', subclass);
    if (i === 0 && esquemas1) el.esquemas = { add: esquemas1, remove: [] };
    const res = applyLevelUp(c, { classKey: 'ingeniero', hpRoll: 6, subclass, improvement: plan.needsImprovement ? ASI : null, featureChoices: { elecciones: el } });
    if (res.errors.length) throw new Error(res.errors.join(' '));
    c = res.character;
  }
  return c;
}
const info = (c) => {
  const s = computeSheet(c);
  return { toolNames: s.proficiencies.herramientas.map((t) => t.name), weaponNames: s.proficiencies.armas.map((t) => t.name), scores: s.scores, proficiency: s.proficiency };
};
const rich = (c, gp = 1000) => { const x = structuredClone(c); x.equipment.coins.gp = gp; return x; };
const stock = (c, mats) => Object.entries(mats).reduce((acc, [id, q]) => adjustMaterial(acc, id, q), c);

describe('Taller del Ingeniero', () => {
  it('sólo aparece con la clase Ingeniero', () => {
    expect(hasWorkshop(createCharacter())).toBe(false);
    expect(hasWorkshop(ing(1))).toBe(true);
  });

  it('huecos de la tabla y equipar respetando la complejidad (un simple puede ir en un hueco superior)', () => {
    const SIMPLES = ['capa-camaleon', 'desfibrilador', 'rebreather', 'guantes-taser'];
    const c = ing(1, 'mecha-batalla', ['lampara-frontal', 'extintor', 'magitector', ...SIMPLES]);
    expect(slotsFor(c)).toEqual({ Trivial: 4, Simple: 3, Avanzado: 0, Intrincado: 0 });
    expect(knownGadgets(c)).toHaveLength(7);
    let x = c;
    for (const id of SIMPLES.slice(0, 3)) x = setEquipped(x, id, true).character;
    expect(slotUsage(x).used.Simple).toBe(3);
    // El cuarto simple no cabe (los huecos triviales no sirven para un simple).
    expect(setEquipped(x, SIMPLES[3], true).errors).toHaveLength(1);
    for (const id of ['lampara-frontal', 'extintor', 'magitector']) x = setEquipped(x, id, true).character;
    expect(slotUsage(x).ok).toBe(true);
    expect(setEquipped(x, 'no-existe', true).errors).toHaveLength(1);
  });

  it('Energía: 2 × nivel, descansos y Batería de maná del Tecnoteúrgo', () => {
    expect(energyMax(ing(1))).toBe(0);
    const c = ing(4);
    expect(energyMax(c)).toBe(8);
    let x = changeEnergy(c, { delta: 5 });
    expect(energyNow(x)).toBe(3);
    x = changeEnergy(x, { rest: 'corto' });
    expect(energyNow(x)).toBe(7);
    x = changeEnergy(x, { rest: 'largo' });
    expect(x.workshop.energy).toBeNull();
    expect(energyMax(ing(10, 'tecnoteurgo'), 3)).toBe(20 + 6);
  });

  it('pagar con monedas da el cambio y conserva el platino', () => {
    expect(payCoins({ pp: 1, gp: 0, sp: 5, cp: 0 }, 250)).toEqual({ pp: 0, gp: 8, sp: 0, cp: 0 });
    expect(payCoins({ pp: 2, gp: 3, sp: 0, cp: 0 }, 150)).toEqual({ pp: 2, gp: 1, sp: 5, cp: 0 });
    expect(payCoins({ pp: 0, gp: 1, sp: 0, cp: 0 }, 150)).toBeNull();
    expect(coinsInCp({ pp: 1, gp: 2, sp: 3, cp: 4 })).toBe(1234);
    // La compra de materiales se prueba en shop.test.js (se compran en la Tienda).
  });

  it('Héroe del desguace (nivel 9): 1d4 + nivel de chatarra', () => {
    expect(scavenge(ing(8), 3).errors).toHaveLength(1);
    const r = scavenge(ing(9), 3);
    expect(r.found).toBe(12);
    expect(r.character.workshop.materials.chatarra).toBe(12);
  });

  it('construir una pistola con módulos: gasta materiales y oro y la añade al equipo y a los ataques', () => {
    let c = rich(ing(6), 100);
    const mats = { placas: 2, muelles: 1, engranajes: 1, polvora: 1, precision: 1, lentes: 1 };
    const sinMat = planBuild(c, 'pistola', ['canon-estriado'], info(c));
    expect(sinMat.errors.join(' ')).toMatch(/Te faltan materiales/);
    c = stock(c, mats);
    const plan = planBuild(c, 'pistola', ['canon-estriado', 'mira-optica'], { ...info(c), name: 'Silbadora' });
    expect(plan.errors).toEqual([]);
    expect(plan.hours).toBe(12);
    // Valor 40 por pieza; los materiales (24 + 15 + 10 po) cuentan dentro del valor.
    expect(plan.gold).toBe(40 * 3 - (10 + 2 + 2 + 5) - 15 - 10);
    const res = build(c, 'pistola', ['canon-estriado', 'mira-optica'], { ...info(c), name: 'Silbadora' });
    expect(res.errors).toEqual([]);
    const out = res.character;
    expect(out.workshop.materials).toEqual({});
    expect(out.equipment.items.at(-1)).toMatchObject({ name: 'Silbadora' });
    expect(out.equipment.items.at(-1).notes).toMatch(/1d10 perforante · alcance 30\/90/);
    const s = computeSheet(out);
    const w = out.equipment.weapons.find((x) => x.name === 'Silbadora');
    expect(w.attackBonus).toBe(`+${s.scores.destreza.modifier + s.proficiency + 1}`);
    expect(out.workshop.creations).toHaveLength(1);
    // Desmontar devuelve la mitad de los materiales y quita el objeto.
    const back = dismantle(out, out.workshop.creations[0].id).character;
    expect(back.workshop.materials.placas).toBe(1);
    expect(back.equipment.items.some((x) => x.name === 'Silbadora')).toBe(false);
  });

  it('respeta nivel, herramientas, ranuras y el descuento del Artilugio', () => {
    const c = stock(rich(ing(5), 500), { placas: 9, precision: 9, muelles: 9, polvora: 9, engranajes: 9, lentes: 9 });
    expect(planBuild(c, 'revolver', [], info(c)).errors.join(' ')).toMatch(/Ingeniero 6/);
    expect(planBuild(c, 'pistola', ['servos-ligeros'], info(c)).errors.join(' ')).toMatch(/no encaja/);
    const noTools = structuredClone(c);
    expect(planBuild(noTools, 'pistola', [], { ...info(c), toolNames: [] }).errors.join(' ')).toMatch(/Herramientas de armero/);
    const art = stock(rich(ing(5, 'artilugio'), 500), { placas: 9, muelles: 9, polvora: 9, engranajes: 9 });
    const normal = planBuild(c, 'pistola', [], info(c));
    const half = planBuild(art, 'pistola', [], info(art));
    expect(half.hours).toBe(normal.hours / 2);
    expect(half.gold).toBe(Math.ceil(normal.gold / 2));
  });

  it('diseños propios: receta y módulo con coste de su complejidad', () => {
    let c = stock(rich(ing(3), 200), { tela: 5, chatarra: 5, cableado: 2 });
    const r1 = saveDesign(c, { kind: 'receta', nombre: 'Guante gancho', categoria: 'equipo', complejidad: 'Simple', herramienta: 'Herramientas de hojalatero', materiales: { tela: 2, chatarra: 3 }, ranuras: ['sistema'], resultado: { nota: 'Trepa como una araña.' } });
    expect(r1.errors).toEqual([]);
    c = r1.character;
    const r2 = saveDesign(c, { kind: 'modulo', nombre: 'Chispero', tipo: 'sistema', categorias: ['equipo'], complejidad: 'Trivial', materiales: { cableado: 1 }, efecto: 'Da chispas.' });
    c = r2.character;
    expect(saveDesign(c, { kind: 'receta', nombre: 'X', complejidad: 'Simple' }).errors).toHaveLength(1);
    const res = build(c, r1.design.id, [r2.design.id], info(c));
    expect(res.errors).toEqual([]);
    expect(res.plan.hours).toBe(6);
    expect(res.character.equipment.items.at(-1).notes).toMatch(/Chispero: Da chispas/);
  });

  it('el Taller viaja al exportar e importar (y se limpia la basura)', () => {
    let c = stock(ing(2), { placas: 3 });
    c = saveDesign(c, { kind: 'modulo', nombre: 'Mod', tipo: 'sistema', categorias: ['equipo'], complejidad: 'Trivial', materiales: { placas: 1 } }).character;
    const doc = JSON.parse(JSON.stringify(toDocument(c)));
    doc.character.workshop.materials.oro_falso = 99;
    doc.character.workshop.designs.push({ kind: 'malo' });
    const { character } = parseDocument(doc);
    expect(character.workshop.materials).toEqual({ placas: 3 });
    expect(character.workshop.designs).toHaveLength(1);
  });
});
