// Calidad (Tosca, Estándar, Fina, Obra maestra) junto a la rareza.
import { describe, it, expect } from 'vitest';
import { buildShopContext } from '../src/services/shop.js';
import { createWorld } from '../src/domain/shop/simulation.js';
import { computeAssortment } from '../src/domain/shop/simulation.js';
import { quoteSell } from '../src/domain/shop/pricing.js';
import { hasQuality, qualityVariants, getQuality } from '../src/domain/shop/quality.js';
import { grantItem, recognizedItems } from '../src/domain/shop/inventory.js';
import { createCharacter } from '../src/domain/schema.js';

const ctx = buildShopContext();
const sword = ctx.catalog.list.find((i) => i.category === 'armas' && i.sub === 'marcial-cc' && !i.quality);

describe('Calidad de los objetos', () => {
  it('armas, armaduras y herramientas tienen variantes; la munición, consumibles y mágicos no', () => {
    expect(hasQuality(sword)).toBe(true);
    for (const q of ['tosca', 'fina', 'obra']) expect(ctx.item(`${sword.id}~${q}`)).toMatchObject({ quality: q, baseId: sword.id, rarity: sword.rarity });
    const ammo = ctx.catalog.list.find((i) => i.sub === 'municion' && !i.quality);
    const potion = ctx.catalog.list.find((i) => i.category === 'consumibles');
    const magic = ctx.catalog.list.find((i) => i.category === 'magicos');
    for (const x of [ammo, potion, magic]) expect(qualityVariants(x)).toEqual([]);
  });

  it('la rareza y la calidad cuentan las dos en el precio', () => {
    const fine = ctx.item(`${sword.id}~fina`);
    expect(fine.price).toBe(Math.round(sword.price * getQuality('fina').mult));
    expect(ctx.item(`${sword.id}~tosca`).price).toBeLessThan(sword.price);
    expect(ctx.item(`${sword.id}~obra`).price).toBeGreaterThan(fine.price);
    expect(fine.props.Calidad).toMatch(/\+1 al daño/);
  });

  it('una tienda sólo ofrece las calidades de su ficha, con menos unidades cuanto mejores', () => {
    const yunque = ctx.shop('yunque');
    const a = computeAssortment(yunque, ctx);
    const base = Object.keys(a).find((id) => ctx.item(id)?.category === 'armas' && !ctx.item(id).quality && a[`${id}~fina`]);
    expect(base).toBeTruthy();
    expect(a[`${base}~tosca`].target).toBeGreaterThanOrEqual(a[`${base}~fina`].target);
    expect(a[`${base}~obra`]?.target ?? 1).toBe(1);
    const plain = computeAssortment(ctx.shop('gabinete'), ctx);
    expect(Object.keys(plain).some((id) => ctx.item(id)?.quality)).toBe(false);
  });

  it('se reconoce en la ficha por referencia y se vende como lo que es', () => {
    const fine = ctx.item(`${sword.id}~fina`);
    const c = grantItem(createCharacter(), fine, 1);
    expect(c.equipment.items[0]).toMatchObject({ name: fine.name, ref: fine.id });
    expect(c.equipment.items[0].notes).toMatch(/Calidad: Fina/);
    expect(recognizedItems(c, ctx.catalog).map((r) => r.item.id)).toEqual([fine.id]);
    const world = createWorld(ctx, { seed: 'q', warmupDays: 0 });
    const q1 = quoteSell(world, ctx, { shopId: 'yunque', itemId: fine.id, charId: 'x' });
    const q0 = quoteSell(world, ctx, { shopId: 'yunque', itemId: sword.id, charId: 'x' });
    expect(q1.unit).toBeGreaterThan(q0.unit);
  });
});
