// Progresión por pisos (Lord 100): los negocios se abren al subir de piso.
import { describe, it, expect, afterEach } from 'vitest';
import { buildShopContext } from '../src/services/shop.js';
import { createWorld, reconcileWorld } from '../src/domain/shop/simulation.js';
import { availability, merchantsAt, canTravel, isLocationVisible } from '../src/domain/shop/presence.js';
import * as floors from '../src/domain/shop/floors.js';
import { validateContent } from '../src/content/schema.js';
import { installPack, resetRegistry } from '../src/content/registry.js';

afterEach(() => resetRegistry());

const merchant = (id, data) => ({ ref: `hb:lord:mercader:${id}`, type: 'mercader', version: 1, status: 'publicado', data: validateContent('mercader', { profession: 'general', location: 'plaza-mayor', ...data }).item });
const region = (id, data) => ({ ref: `hb:lord:region:${id}`, type: 'region', version: 1, status: 'publicado', data: validateContent('region', data).item });

/** Lord 100 en miniatura: dos pisos como regiones y negocios con piso, requisito y especial. */
function lord100() {
  installPack({ id: 'lord', name: 'Lord 100', kind: 'campaign', role: 'dm', items: [
    region('p2', { name: 'Piso 2', floor: 2, locations: [{ name: 'Mercado del Piso 2' }] }),
    merchant('herreria', { name: 'Brann', shopName: 'Herrería básica', floor: 1, profession: 'herrero' }),
    merchant('alquimista', { name: 'Mira', shopName: 'Alquimista', location: 'hb-p2-mercado-del-piso-2', profession: 'alquimista' }),
    merchant('forja', { name: 'Ulda', shopName: 'Forja rúnica', floor: 2, requirement: 'Completar la misión «La forja apagada»' }),
    merchant('feria', { name: 'Zaz', shopName: 'Feria de los pisos', floor: 1, special: true, untilFloor: 2 }),
    merchant('novedades', { name: 'Tob', shopName: 'Comerciante general', floor: 1, floorItems: [{ floor: 2, item: 'pocion-curacion-mayor', qty: 3 }] }),
  ] });
  const ctx = buildShopContext({ campaignId: 'lord' });
  const keeper = (name) => [...ctx.keepers.values()].find((k) => k.name === name);
  let world = createWorld(ctx, { seed: 'lord', warmupDays: 0 });
  world = floors.setFloor(world, ctx, 1).world;
  return { ctx, keeper, world: reconcileWorld(world, ctx) };
}

describe('Progresión por pisos', () => {
  it('apagada, todo existe como siempre', () => {
    const { ctx, keeper } = lord100();
    const w = createWorld(ctx, { seed: 'x', warmupDays: 0 });
    expect(floors.businessStatus(w, ctx, keeper('Mira')).state).toBe('abierto');
    expect(floors.currentFloor(w)).toBe(Infinity);
  });

  it('piso 1: abiertos los del piso 1; el piso 2 no existe (ni sus lugares)', () => {
    const { ctx, keeper, world } = lord100();
    expect(floors.businessStatus(world, ctx, keeper('Brann')).state).toBe('abierto');
    expect(floors.businessStatus(world, ctx, keeper('Mira'))).toMatchObject({ state: 'bloqueado', floor: 2 });
    expect(availability(world, ctx, keeper('Mira')).here).toBe(false);
    expect(isLocationVisible(world, ctx, null, 'hb-p2-mercado-del-piso-2')).toBe(false);
    expect(canTravel(world, ctx, null, 'hb-p2-mercado-del-piso-2').message).toMatch(/piso/);
    expect(floors.businessStatus(world, ctx, keeper('Zaz')).state).toBe('especial');
  });

  it('al llegar al piso 2 se abre su contenido, pero el requisito sigue cerrando la forja', () => {
    const { ctx, keeper, world } = lord100();
    const { world: w2, result } = floors.setFloor(world, ctx, 2);
    expect(result.opened.map((k) => k.name)).toEqual(['Mira']);
    expect(result.conditioned.map((k) => k.name)).toEqual(['Ulda']);
    expect(floors.businessStatus(w2, ctx, keeper('Brann')).state).toBe('abierto'); // el piso 1 sigue
    const forja = availability(w2, ctx, keeper('Ulda'));
    expect(forja).toMatchObject({ here: true, open: false });
    expect(forja.reason).toMatch(/La forja apagada/);
    expect(merchantsAt(w2, ctx, 'plaza-mayor', null).some((m) => m.keeper.name === 'Ulda')).toBe(true); // se ve, no atiende
    const done = floors.setRequirementDone(w2, keeper('Ulda').id, true).world;
    expect(floors.businessStatus(done, ctx, keeper('Ulda')).state).toBe('abierto');
  });

  it('negocios temporales cierran al pasar su piso; el DM puede forzar excepciones', () => {
    const { ctx, keeper, world } = lord100();
    const w3 = floors.setFloor(world, ctx, 3).world;
    expect(floors.businessStatus(w3, ctx, keeper('Zaz'))).toMatchObject({ state: 'cerrado' });
    const forced = floors.setOverride(world, keeper('Mira').id, 'open').world;
    expect(floors.businessStatus(forced, ctx, keeper('Mira')).state).toBe('abierto');
    const closed = floors.setOverride(world, keeper('Brann').id, 'closed').world;
    expect(availability(closed, ctx, keeper('Brann')).open).toBe(false);
    expect(floors.businessStatus(floors.setOverride(closed, keeper('Brann').id, null).world, ctx, keeper('Brann')).state).toBe('abierto');
  });

  it('las novedades de un piso aparecen en el surtido al llegar', () => {
    const { ctx, keeper, world } = lord100();
    const shopId = ctx.shopOf(keeper('Tob').id).id;
    expect(world.shops[shopId].stock['pocion-curacion-mayor']).toBeUndefined();
    const w2 = reconcileWorld(floors.setFloor(world, ctx, 2).world, ctx);
    expect(w2.shops[shopId].stock['pocion-curacion-mayor']?.qty).toBe(3);
  });

  it('agrupa por estado, lista los pisos definidos y guarda el historial', () => {
    const { ctx, world } = lord100();
    const g = floors.businessesByState(world, ctx);
    expect(g.bloqueado.map((x) => x.keeper.name).sort()).toEqual(['Mira', 'Ulda']);
    expect(floors.definedFloors(ctx)).toEqual([1, 2]);
    const w = floors.setFloor(floors.setFloor(world, ctx, 2).world, ctx, 4).world;
    expect(floors.progressOf(w).log.slice(0, 2).map((l) => l.to)).toEqual([4, 2]);
  });
});
