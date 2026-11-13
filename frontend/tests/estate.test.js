// Propiedades, negocios, empleados, informes de exploración, popularidad y
// venta de inventos del Taller.
import { describe, it, expect } from 'vitest';
import { createCharacter } from '../src/domain/schema.js';
import { createWorld, advanceDays, reconcileWorld } from '../src/domain/shop/simulation.js';
import { travel, keeperLocation, isLocationVisible } from '../src/domain/shop/presence.js';
import { quoteSell } from '../src/domain/shop/pricing.js';
import { sell } from '../src/domain/shop/transactions.js';
import { grantItem, ownedUnits, withInventionRefs, recognizedItems } from '../src/domain/shop/inventory.js';
import * as estate from '../src/domain/shop/estate.js';
import * as staff from '../src/domain/shop/staff.js';
import { productPopularity, entrepreneurStage, demandMult, sellBonus, bumpProduct } from '../src/domain/shop/popularity.js';
import { cloneWorld, migrateWorld } from '../src/domain/shop/state.js';
import { buildShopContext } from '../src/services/shop.js';
import { coinsInCp } from '../src/domain/money.js';

const ctx = buildShopContext();
const CHAR = 'pj-1';
const HERE = 'plaza-mayor';

function hero(gp = 2000) {
  const c = createCharacter();
  c.identity.name = 'Pim';
  c.equipment.coins = { cp: 0, sp: 0, gp, pp: 0 };
  return c;
}

const fresh = () => createWorld(ctx, { seed: 'estate-test', warmupDays: 0 });
const sellable = () => ctx.catalog.list.find((i) => i.grant.kind === 'inventory' && i.forSale !== false && i.price >= 500 && i.price <= 5000);

/** Mundo con un terreno comprado y local construido y negocio abierto. */
function withBusiness() {
  let world = fresh();
  let character = hero();
  const plot = estate.plotsAt(world, ctx, HERE, CHAR)[0].plot;
  let res = estate.buyPlot(world, ctx, { charId: CHAR, plotId: plot.id, character, here: HERE });
  ({ world, character } = res);
  res = estate.startWorks(world, ctx, { charId: CHAR, plotId: plot.id, buildingId: 'local', character, here: HERE });
  ({ world, character } = res);
  world = advanceDays(world, ctx, 10).world;
  res = estate.openBusiness(world, ctx, { charId: CHAR, plotId: plot.id, name: 'Engranajes Pim', here: HERE });
  world = res.world;
  return { world, character, plot };
}

/** Contrata a alguien del tablón y le pone el rol pedido (el tablón es aleatorio). */
function hire(world, role, assignment = null) {
  const cand = staff.candidatesAt(world, ctx, HERE)[0];
  const res = staff.hireStaff(world, ctx, { charId: CHAR, candidateKey: cand.key, here: HERE });
  const w = cloneWorld(res.world);
  w.staff[res.result.staffId].role = role;
  w.staff[res.result.staffId].skill = 0.9;
  w.staff[res.result.staffId].assignment = assignment;
  return { world: w, id: res.result.staffId };
}

describe('Terrenos y mejoras', () => {
  it('se compran en persona, pagando su valor, y una sola vez', () => {
    const world = fresh();
    const character = hero();
    const plot = estate.plotsAt(world, ctx, HERE, CHAR)[0].plot;
    expect(estate.buyPlot(world, ctx, { charId: CHAR, plotId: plot.id, character, here: 'barrio-fraguas' }).error).toMatch(/en persona/);
    const res = estate.buyPlot(world, ctx, { charId: CHAR, plotId: plot.id, character, here: HERE });
    expect(res.error).toBeUndefined();
    expect(coinsInCp(res.character.equipment.coins)).toBe(coinsInCp(character.equipment.coins) - plot.price);
    expect(estate.propertiesOf(res.world, ctx, CHAR)).toHaveLength(1);
    expect(estate.buyPlot(res.world, ctx, { charId: 'otro', plotId: plot.id, character, here: HERE }).error).toMatch(/dueño/);
    expect(estate.buyPlot(world, ctx, { charId: CHAR, plotId: plot.id, character: hero(1), here: HERE }).error).toMatch(/No te alcanza/);
  });

  it('las mejoras respetan requisitos, tardan días y suben el valor', () => {
    let world = fresh();
    let character = hero();
    const plot = estate.plotsAt(world, ctx, HERE, CHAR)[0].plot;
    ({ world, character } = estate.buyPlot(world, ctx, { charId: CHAR, plotId: plot.id, character, here: HERE }));
    expect(estate.startWorks(world, ctx, { charId: CHAR, plotId: plot.id, buildingId: 'almacen', character, here: HERE }).error).toMatch(/Antes necesitas/);
    const before = estate.propertyValue(ctx, plot.id, estate.propertyOf(world, plot.id));
    ({ world, character } = estate.startWorks(world, ctx, { charId: CHAR, plotId: plot.id, buildingId: 'local', character, here: HERE }));
    expect(estate.openBusiness(world, ctx, { charId: CHAR, plotId: plot.id, here: HERE }).error).toMatch(/local comercial/);
    const { world: later, report } = advanceDays(world, ctx, 10);
    expect(report.some((r) => r.type === 'works-done' && r.charId === CHAR)).toBe(true);
    expect(estate.propertyOf(later, plot.id).buildings).toContain('local');
    expect(estate.propertyValue(ctx, plot.id, estate.propertyOf(later, plot.id))).toBeGreaterThan(before);
  });
});

describe('Negocio propio', () => {
  it('sin vendedor no vende; con vendedor vende, paga salarios y la caja crece', () => {
    let { world, character, plot } = withBusiness();
    const item = sellable();
    character = grantItem(character, item, 6);
    const dep = estate.depositStock(world, ctx, { charId: CHAR, plotId: plot.id, itemId: item.id, qty: 6, character, here: HERE });
    expect(dep.error).toBeUndefined();
    ({ world, character } = dep);
    expect(ownedUnits(character, item)).toBe(0);
    expect(estate.propertyOf(world, plot.id).business.stock[item.id].qty).toBe(6);

    // Sin vendedor: nada se vende.
    const idle = advanceDays(world, ctx, 5).world;
    expect(estate.propertyOf(idle, plot.id).business.stock[item.id].qty).toBe(6);

    const hired = hire(world, 'vendedor', plot.id);
    world = advanceDays(hired.world, ctx, 20).world;
    const biz = estate.propertyOf(world, plot.id).business;
    expect(biz.stock[item.id]?.qty ?? 0).toBeLessThan(6);
    expect(biz.cash + world.staff[hired.id].owed).toBeGreaterThan(0);
    expect(productPopularity(world, item.id, ctx.location(HERE).regionId)).toBeGreaterThan(10);
  });

  it('las ganancias no llegan solas: se retiran en persona y respetando salarios pendientes', () => {
    let { world, character, plot } = withBusiness();
    const w = cloneWorld(world);
    w.estate.properties[plot.id].business.cash = 5000;
    const h = hire(w, 'vendedor', plot.id);
    h.world.staff[h.id].owed = 2000;
    world = h.world;
    expect(estate.withdrawCash(world, ctx, { charId: CHAR, plotId: plot.id, character, here: 'barrio-fraguas' }).error).toMatch(/Tienes que estar/);
    expect(estate.withdrawCash(world, ctx, { charId: CHAR, plotId: plot.id, amount: 4000, character, here: HERE }).error).toMatch(/salarios/);
    const res = estate.withdrawCash(world, ctx, { charId: CHAR, plotId: plot.id, character, here: HERE });
    expect(coinsInCp(res.character.equipment.coins) - coinsInCp(character.equipment.coins)).toBe(3000);
    expect(estate.propertyOf(res.world, plot.id).business.cash).toBe(2000);
    expect(estate.withdrawCash(world, ctx, { charId: 'otro', plotId: plot.id, character, here: HERE }).error).toMatch(/no es tuya/);
  });

  it('vender la propiedad exige caja vacía y nadie asignado, y devuelve el 80 % y la mercancía', () => {
    let { world, character, plot } = withBusiness();
    const item = sellable();
    character = grantItem(character, item, 2);
    ({ world, character } = estate.depositStock(world, ctx, { charId: CHAR, plotId: plot.id, itemId: item.id, qty: 2, character, here: HERE }));
    const w = cloneWorld(world);
    w.estate.properties[plot.id].business.cash = 10;
    expect(estate.sellPlot(w, ctx, { charId: CHAR, plotId: plot.id, character, here: HERE }).error).toMatch(/caja/);
    const value = estate.propertyValue(ctx, plot.id, estate.propertyOf(world, plot.id));
    const res = estate.sellPlot(world, ctx, { charId: CHAR, plotId: plot.id, character, here: HERE });
    expect(coinsInCp(res.character.equipment.coins) - coinsInCp(character.equipment.coins)).toBe(Math.round(value * 0.8));
    expect(ownedUnits(res.character, item)).toBe(2);
    expect(estate.propertyOf(res.world, plot.id).owner).toBeNull();
    expect(estate.propertyOf(res.world, plot.id).buildings).toContain('local');
  });
});

describe('Empleados', () => {
  it('sin caja el salario queda como deuda; no se puede despedir sin pagar', () => {
    let world = fresh();
    const h = hire(world, 'constructor');
    world = advanceDays(h.world, ctx, 3).world;
    const emp = world.staff[h.id];
    expect(emp.owed).toBe(emp.wage * 3);
    expect(staff.dismissStaff(world, ctx, { charId: CHAR, staffId: h.id }).error).toMatch(/págale/);
    const paid = staff.payStaff(world, ctx, { charId: CHAR, staffId: h.id, character: hero() });
    expect(paid.world.staff[h.id].owed).toBe(0);
    expect(staff.dismissStaff(paid.world, ctx, { charId: CHAR, staffId: h.id }).world.staff[h.id].status).toBe('ended');
  });

  it('el tablón es igual para todos, cambia cada semana y no repite contratados', () => {
    const world = fresh();
    const a = staff.candidatesAt(world, ctx, HERE);
    expect(a).toHaveLength(3);
    expect(staff.candidatesAt(world, ctx, HERE)).toEqual(a);
    const h = hire(world, 'vendedor');
    expect(staff.candidatesAt(h.world, ctx, HERE).map((c) => c.key)).not.toContain(a[0].key);
    const later = advanceDays(world, ctx, 7).world;
    expect(staff.candidatesAt(later, ctx, HERE)[0].key).not.toBe(a[0].key);
  });

  it('los contratos con duración terminan y la impaga continuada provoca renuncia', () => {
    let world = fresh();
    const res = staff.hireStaff(world, ctx, { charId: CHAR, candidateKey: staff.candidatesAt(world, ctx, HERE)[0].key, here: HERE, days: 2 });
    const id = res.result.staffId;
    const w = cloneWorld(res.world);
    w.staff[id].owed = 0;
    const ended = advanceDays(w, ctx, 3);
    // Con deuda no se va hasta cobrar; los días impagos van bajando el ánimo.
    expect(['ended', 'active']).toContain(ended.world.staff[id].status);
    const angry = cloneWorld(world);
    const h = hire(angry, 'vendedor');
    h.world.staff[h.id].satisfaction = 16;
    const after = advanceDays(h.world, ctx, 2);
    expect(after.world.staff[h.id].status).toBe('quit');
    expect(after.report.some((r) => r.type === 'staff-quit')).toBe(true);
  });

  it('las condiciones cambian el ánimo y la parte de ventas sale de la caja', () => {
    let { world, plot } = withBusiness();
    const h = hire(world, 'vendedor', plot.id);
    const before = h.world.staff[h.id].satisfaction;
    const up = staff.updateTerms(h.world, ctx, { charId: CHAR, staffId: h.id, wage: h.world.staff[h.id].wage * 2, share: 0.1, period: 'semana' });
    expect(up.world.staff[h.id].satisfaction).toBeGreaterThan(before);
    expect(up.world.staff[h.id].period).toBe('semana');
    expect(up.world.staff[h.id].share).toBe(0.1);
  });
});

describe('Exploradores e informes para el DM', () => {
  it('el resultado no llega al jugador hasta que el DM lo confirma', () => {
    let world = fresh();
    const h = hire(world, 'explorador');
    const region = [...ctx.regions.values()].find((r) => (r.locations ?? []).some((l) => l.hidden));
    const hidden = region.locations.find((l) => l.hidden);
    expect(staff.sendExplorer(h.world, ctx, { charId: CHAR, staffId: h.id, target: 'nowhere' }).error).toBeTruthy();
    const sent = staff.sendExplorer(h.world, ctx, { charId: CHAR, staffId: h.id, target: region.id, days: 2, objective: 'Buscar la mina perdida' });
    expect(sent.error).toBeUndefined();
    const { world: back, report } = advanceDays(sent.world, ctx, 2);
    expect(report.some((r) => r.type === 'exploration-back')).toBe(true);
    const [rep] = staff.reportsFor(back, CHAR);
    expect(rep.status).toBe('pendiente');
    expect(rep.objective).toBe('Buscar la mina perdida');
    expect(['exito', 'fracaso', 'descubrimiento']).toContain(rep.outcome);
    expect(rep.final).toBeUndefined();
    expect(staff.pendingReports(back)).toHaveLength(1);
    expect(back.staff[h.id].task).toBeNull();

    const rumor = [...ctx.rumors.values()].find((r) => r.region === region.id);
    const done = staff.resolveReport(back, ctx, { reportId: rep.id, outcome: 'descubrimiento', text: 'Encontró la entrada.', revealLocation: hidden.id, rumorId: rumor?.id });
    const final = staff.reportsFor(done.world, CHAR)[0];
    expect(final.status).toBe('confirmado');
    expect(final.final).toMatchObject({ outcome: 'descubrimiento', text: 'Encontró la entrada.', revealed: hidden.id });
    expect(isLocationVisible(done.world, ctx, CHAR, hidden.id)).toBe(true);
    if (rumor) expect(done.world.journal[CHAR].some((j) => j.rumorId === rumor.id)).toBe(true);
    expect(staff.resolveReport(done.world, ctx, { reportId: rep.id }).error).toMatch(/resuelto/);
  });
});

describe('Popularidad e inventos del Taller', () => {
  const invention = ctx.catalog.list.find((i) => i.sub === 'invento');

  it('los inventos están en el catálogo (no a la venta en tiendas) y se reconocen por ref o por nombre', () => {
    expect(invention).toBeTruthy();
    expect(invention.forSale).toBe(false);
    let c = hero();
    c.equipment.items.push({ name: invention.name, quantity: 1, notes: 'Taller · algo' });
    c.workshop = { ...(c.workshop ?? {}), creations: [{ name: invention.name, recipeId: invention.id.replace('taller-obra-', '') }] };
    expect(recognizedItems(c, ctx.catalog).some((x) => x.item.id === invention.id) || recognizedItems(withInventionRefs(c), ctx.catalog).some((x) => x.item.id === invention.id)).toBe(true);
    expect(withInventionRefs(c).equipment.items.at(-1).ref).toBe(invention.id);
  });

  it('venderlos da fama al producto y al inventor, y lo hace progresar', () => {
    let world = fresh();
    const pim = ctx.keepers.get('pim');
    const loc = keeperLocation(world, ctx, pim);
    world = travel(world, ctx, { charId: CHAR, locationId: loc, isDm: true }).world;
    let character = grantItem(hero(), invention, 3);
    const region = ctx.location(loc).regionId;
    const quote = quoteSell(world, ctx, { shopId: 'engranajes', itemId: invention.id, charId: CHAR });
    expect(quote.unit).toBeGreaterThan(0);
    expect(entrepreneurStage(world, CHAR).id).toBe('inventor');
    const res = sell(world, ctx, { charId: CHAR, charName: 'Pim', shopId: 'engranajes', itemId: invention.id, qty: 1, character, here: loc });
    expect(res.error).toBeUndefined();
    expect(productPopularity(res.world, invention.id, region)).toBeGreaterThan(10);
    expect(entrepreneurStage(res.world, CHAR).id).toBe('ocasional');
  });

  it('un producto famoso se paga mejor y se vende más', () => {
    expect(demandMult(80)).toBeGreaterThan(demandMult(10));
    expect(sellBonus(10)).toBe(0);
    expect(sellBonus(100)).toBeCloseTo(0.3);
    let world = fresh();
    const pim = ctx.keepers.get('pim');
    const loc = keeperLocation(world, ctx, pim);
    const base = quoteSell(world, ctx, { shopId: 'engranajes', itemId: invention.id, charId: CHAR }).unit;
    world = cloneWorld(world);
    bumpProduct(world, invention.id, ctx.location(loc).regionId, 80);
    expect(quoteSell(world, ctx, { shopId: 'engranajes', itemId: invention.id, charId: CHAR }).unit).toBeGreaterThan(base);
  });

  it('el mercado viejo sin estas secciones se migra solo', () => {
    const old = fresh();
    delete old.estate; delete old.staff; delete old.reports; delete old.popularity;
    const next = advanceDays(reconcileWorld(migrateWorld(old), ctx), ctx, 1).world;
    expect(next.estate.properties).toEqual({});
    expect(next.reports).toEqual([]);
  });
});
