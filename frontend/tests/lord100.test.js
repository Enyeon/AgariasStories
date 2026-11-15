// Lord 100: Torre por pisos, zonas, economía local, negocios y campañas.
import { describe, it, expect, afterEach } from 'vitest';
import { buildShopContext } from '../src/services/shop.js';
import { createWorld, reconcileWorld, computeAssortment } from '../src/domain/shop/simulation.js';
import { merchantsAt, visibleMap, canTravel, availability } from '../src/domain/shop/presence.js';
import { quoteBuy, quoteSell } from '../src/domain/shop/pricing.js';
import * as floors from '../src/domain/shop/floors.js';
import { lord100Content, zonesOf, floorEconomy, realmOf, floorRegionId, zoneLocationId } from '../src/content/lord100.js';
import { installPack, resetRegistry } from '../src/content/registry.js';
import { validateContent } from '../src/content/schema.js';
import tower from '../src/data/shop/lord100.json';

afterEach(() => resetRegistry());

const ctx = buildShopContext({ world: 'lord100' });
function at(floor) {
  let w = createWorld(ctx, { seed: 'torre', warmupDays: 0 });
  return reconcileWorld(floors.setFloor(w, ctx, floor).world, ctx);
}
const shopsOn = (w, floor) => ctx.regions.get(floorRegionId(floor)).locations.flatMap((l) => merchantsAt(w, ctx, l.id, null));

describe('Estructura de la Torre', () => {
  it('respeta los 20 tramos y los pisos 1–99', () => {
    expect(tower.realms.map((r) => [r.name, r.from, r.to])).toEqual([
      ['Tierra Salvaje', 1, 5], ['Tierra de Monstruos', 6, 10], ['Las Criptas Silenciosas', 11, 15], ['El Sustrato', 16, 20],
      ['El Foso Profano', 21, 25], ['Las Fraguas Elementales', 26, 30], ['Los Peldaños de los Gigantes', 31, 35], ['El Velo Feérico', 36, 40],
      ['La Cripta de los Reyes', 41, 45], ['El Abismo Devorador', 46, 50], ['Las Cámaras Aberrantes', 51, 55], ['El Nido de Dragones', 56, 60],
      ['La Ciudadela de Hierro', 61, 65], ['El Salón de las Tormentas', 66, 70], ['El Trono Infernal', 71, 75], ['El Corazón del Abismo', 76, 80],
      ['El Firmamento Astral', 81, 85], ['El Reino de los Dragones Ancestrales', 86, 90], ['El Vacío Primigenio', 91, 95], ['El Trono del Olvido', 96, 99],
    ]);
    expect(ctx.regions.size).toBe(99);
  });

  it('cada tramo empieza con 1 zona y añade una por piso', () => {
    expect(zonesOf(1).map((z) => z.name)).toEqual(['Pradera']);
    expect(zonesOf(5)).toHaveLength(5);
    expect(zonesOf(6).map((z) => z.name)).toEqual(['Bosque Oscuro']);
    expect(zonesOf(12).map((z) => z.name)).toEqual(['Catacumbas', 'Cementerio']);
    expect(zonesOf(99)).toHaveLength(4);
    for (let f = 1; f <= 99; f++) expect(ctx.regions.get(floorRegionId(f)).locations).toHaveLength(f - realmOf(f).from + 1);
    // Nombres cortos y claros.
    for (const r of tower.realms) for (const z of r.zones) expect(z.name.length).toBeLessThanOrEqual(22);
  });

  it('es determinista: mismos ids siempre', () => {
    const a = lord100Content();
    expect(a.mercader.length).toBeGreaterThan(400);
    expect(new Set(a.mercader.map((m) => m.ref)).size).toBe(a.mercader.length);
    expect(ctx.startLocation).toBe(zoneLocationId(1, 'Pradera'));
  });
});

describe('Progresión y viaje', () => {
  it('en la Torre los pisos están activos desde el principio y los superiores no existen', () => {
    const w = createWorld(ctx, { seed: 't', warmupDays: 0 });
    expect(floors.currentFloor(w)).toBe(1);
    expect(canTravel(w, ctx, null, zoneLocationId(2, 'Bosque')).ok).toBe(false);
    // El mercado sólo crea los negocios de los pisos alcanzados.
    expect(Object.keys(w.shops).length).toBeLessThan(6);
    const w4 = at(4);
    expect(canTravel(w4, ctx, null, zoneLocationId(4, 'Colinas')).ok).toBe(true);
    expect(visibleMap(w4, ctx, null, { floor: 4 }).flatMap((r) => r.locations.map((l) => l.name))).toEqual(['Pradera', 'Bosque', 'Río', 'Colinas']);
    expect(visibleMap(w4, ctx, null, { floor: 5 })).toEqual([]);
  });

  it('cada zona lista sus negocios; no todos los pisos tienen todos', () => {
    const w = at(5);
    const names = (f) => shopsOn(w, f).map((m) => m.keeper.profession);
    expect(names(1)).toContain('general');
    expect(names(4)).toContain('minerales');
    expect(names(1)).not.toContain('minerales');
    const zone = visibleMap(w, ctx, null, { floor: 4 })[0].locations.find((l) => l.name === 'Colinas');
    expect(zone.shops.map((s) => s.name)).toEqual(expect.arrayContaining(['Tienda de minerales · Colinas']));
  });

  it('los especiales piden su requisito y guardan lo exclusivo', () => {
    const w = at(90);
    const special = shopsOn(w, 90).find((m) => m.keeper.special);
    expect(special.status.open).toBe(false);
    expect(special.status.reason).toMatch(/dragón ancestral/);
    const done = reconcileWorld(floors.setRequirementDone(w, special.keeper.id, true).world, ctx);
    expect(Object.keys(done.shops[special.shop.id].stock)).toContain('escama-dragon-ancestral');
    // Lo legendario no aparece en ninguna tienda normal.
    for (const s of ctx.shopList) {
      if (ctx.keepers.get(s.keeperId)?.special) continue;
      expect(Object.keys(computeAssortment(s, ctx, { region: ctx.regions.get(ctx.location(ctx.keepers.get(s.keeperId).presence.location).regionId) }))).not.toContain('escama-dragon-ancestral');
    }
  });
});

describe('Economía local', () => {
  it('la materia prima sólo está donde el piso la produce o le llega', () => {
    const w = at(30);
    const stockOf = (f, prof) => Object.keys(w.shops[shopsOn(w, f).find((m) => m.keeper.profession === prof)?.shop.id]?.stock ?? {});
    expect(stockOf(4, 'minerales')).not.toContain('obsidiana');
    expect(stockOf(27, 'minerales')).toContain('obsidiana');
    expect(stockOf(27, 'minerales')).not.toContain('perla');
  });

  it('el hierro es barato donde abunda (Fraguas) y caro donde escasea; se puede comerciar entre pisos con margen limitado', () => {
    expect(floorEconomy(26).abundant).toContain('#hierro');
    expect(floorEconomy(3).scarce).toContain('#hierro');
    const w = at(30);
    // Mismo oficio (herrero) en las Fraguas (hierro abundante) y en las Colinas del piso 4 (hierro normal).
    const forge = shopsOn(w, 26).find((m) => m.keeper.profession === 'herrero');
    const cheap = quoteBuy(w, ctx, { shopId: forge.shop.id, itemId: 'lingote-hierro' }).unit;
    const elsewhere = shopsOn(w, 4).find((m) => m.keeper.profession === 'herrero');
    const normal = quoteBuy(w, ctx, { shopId: elsewhere.shop.id, itemId: 'lingote-hierro' }).unit;
    expect(cheap).toBeLessThan(normal);
    const resale = quoteSell(w, ctx, { shopId: elsewhere.shop.id, itemId: 'lingote-hierro' }).unit;
    expect(resale).toBeGreaterThan(0);
    expect(resale).toBeLessThan(normal); // el comerciante siempre se queda margen
  });

  it('el mercado de la Torre entera cabe en el servidor', () => {
    const w = at(99);
    expect(JSON.stringify(w).length).toBeLessThan(1_200_000);
  });
});

describe('Campañas y condiciones', () => {
  it('una campaña elige su mundo y suma sus tiendas propias (sólo para ella)', () => {
    const shop = validateContent('mercader', { name: 'Ilse', shopName: 'Herrería de Valoria', location: zoneLocationId(1, 'Pradera'), profession: 'herrero', floor: 1 }).item;
    installPack({ id: 'valoria', name: 'Valoria', kind: 'campaign', role: 'dm', details: { world: 'lord100' }, items: [{ ref: 'hb:valoria:mercader:herreria', type: 'mercader', version: 1, status: 'publicado', data: shop }] });
    installPack({ id: 'otra', name: 'Otra', kind: 'campaign', role: 'dm', details: { world: 'lord100' }, items: [] });
    const mine = buildShopContext({ campaignId: 'valoria' });
    expect(mine.worldKind).toBe('lord100');
    expect([...mine.shops.values()].some((s) => s.name === 'Herrería de Valoria')).toBe(true);
    expect([...buildShopContext({ campaignId: 'otra' }).shops.values()].some((s) => s.name === 'Herrería de Valoria')).toBe(false);
    expect(buildShopContext({ campaignId: 'nada' }).worldKind).toBe('agarias');
  });

  it('la reputación mínima se suma al resto de condiciones', () => {
    const item = validateContent('mercader', { name: 'Vel', shopName: 'Joyas finas', location: zoneLocationId(1, 'Pradera'), profession: 'joyero', floor: 1, minReputation: 30 }).item;
    installPack({ id: 'rep', name: 'Rep', kind: 'campaign', role: 'dm', details: { world: 'lord100' }, items: [{ ref: 'hb:rep:mercader:vel', type: 'mercader', version: 1, status: 'publicado', data: item }] });
    const c = buildShopContext({ campaignId: 'rep' });
    const keeper = [...c.keepers.values()].find((k) => k.name === 'Vel');
    const w = createWorld(c, { seed: 'r', warmupDays: 0 });
    expect(availability(w, c, keeper, { charId: 'pj' })).toMatchObject({ open: false });
    expect(availability(w, c, keeper, { charId: 'pj' }).reason).toMatch(/reputación 30/);
    w.popularity.renown = { pj: { [floorRegionId(1)]: 40 } };
    expect(availability(w, c, keeper, { charId: 'pj' }).open).toBe(true);
  });
});
